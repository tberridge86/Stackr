import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('yaml');
const normalize = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const bindings = {
  STACKR_CATALOGUE_STORAGE_PROVIDER: 'r2',
  STACKR_R2_ENDPOINT: '${{ vars.STACKR_R2_ENDPOINT }}',
  STACKR_R2_BUCKET: '${{ vars.STACKR_R2_BUCKET }}',
  STACKR_R2_PUBLIC_BASE_URL: '${{ vars.STACKR_R2_PUBLIC_BASE_URL }}',
  STACKR_R2_ACCESS_KEY_ID: '${{ secrets.STACKR_R2_ACCESS_KEY_ID }}',
  STACKR_R2_SECRET_ACCESS_KEY: '${{ secrets.STACKR_R2_SECRET_ACCESS_KEY }}',
};
const registry = [
  ['catalogue-ingestion-ci.yml', 'ingest-staging', 'staging', 'Mirror approved provider images into Stackr storage', "inputs.operation == 'mirror'"],
  ['catalogue-stored-asset-repair.yml', 'repair', 'staging', 'Execute bounded staging repair', "env.MODE == 'execute'"],
  ['complete-japanese-catalogue-images.yml', 'mirror', 'staging', 'Drain bounded resumable Japanese mirror ranges'],
  ['complete-japanese-catalogue-images.yml', 'complete-and-publish', 'staging', 'Complete explicit Japanese image aliases and missing derivatives'],
  ['four-language-catalogue-images.yml', 'mirror', 'staging', 'Drain bounded approved ${{ matrix.provider }} ${{ matrix.language }} image batches'],
  ['materialize-pokedata-gap-art-20260910.yml', 'materialize', 'production', 'Run frozen materialization dry-run or apply'],
  ['recover-tcgdex-zh-cn-images.yml', 'recover', 'staging', 'Mirror every queued TCGdex Chinese image'],
  ['repair-approved-alpha-set-logos.yml', 'repair', 'production', 'Repair only alpha-bearing approved English logo sources'],
];
const eventTypes = {
  'catalogue-ingestion-ci.yml': ['workflow_dispatch'],
  'catalogue-stored-asset-repair.yml': ['issue_comment', 'workflow_dispatch'],
  'complete-japanese-catalogue-images.yml': ['issue_comment', 'push', 'workflow_dispatch'],
  'four-language-catalogue-images.yml': ['issue_comment', 'workflow_dispatch'],
  'materialize-pokedata-gap-art-20260910.yml': ['workflow_dispatch'],
  'recover-tcgdex-zh-cn-images.yml': ['issue_comment'],
  'repair-approved-alpha-set-logos.yml': ['workflow_dispatch'],
};
const jobGuards = [
  ['catalogue-stored-asset-repair.yml', 'repair', "github.event_name == 'workflow_dispatch' || (github.event_name == 'issue_comment' && github.event.issue.number == 74 && github.event.issue.pull_request == null && github.actor == 'tberridge86' && (github.event.comment.body == '/inspect-stackr-stored-catalogue-assets' || github.event.comment.body == '/repair-stackr-stored-catalogue-assets'))"],
  ['complete-japanese-catalogue-images.yml', 'prepare', "(github.event_name == 'workflow_dispatch' && github.actor_id == github.repository_owner_id) || (github.event_name == 'push' && github.actor_id == github.repository_owner_id) || (github.event.issue.number == 74 && github.event.issue.pull_request == null && github.actor_id == github.repository_owner_id && github.actor == 'tberridge86' && github.event.comment.body == '/run-japanese-catalogue-images')"],
  ['complete-japanese-catalogue-images.yml', 'complete-and-publish', "always() && needs.prepare.result == 'success' && needs.official-ingest.result == 'success' && needs.pokedata-ingest.result == 'success' && needs.mirror.result == 'success'"],
  ['four-language-catalogue-images.yml', 'validate', "github.event_name == 'workflow_dispatch' || (github.event_name == 'issue_comment' && github.event.issue.number == 74 && github.event.issue.pull_request == null && github.actor == 'tberridge86' && github.event.comment.body == '/run-four-language-catalogue-images')"],
  ['four-language-catalogue-images.yml', 'mirror', "${{ always() && (needs.ingest.result == 'success' || needs.ingest.result == 'failure') }}"],
  ['materialize-pokedata-gap-art-20260910.yml', 'materialize', "github.ref == 'refs/heads/main'"],
  ['recover-tcgdex-zh-cn-images.yml', 'recover', "github.event.issue.number == 74 && github.event.issue.pull_request == null && github.actor == 'tberridge86' && github.event.comment.body == '/run-tcgdex-zh-cn-images'"],
  ['repair-approved-alpha-set-logos.yml', 'repair', "github.ref == 'refs/heads/main' && inputs.confirmation == 'REPAIR APPROVED ALPHA SET LOGOS'"],
];
const dependencies = [
  ['complete-japanese-catalogue-images.yml', 'official-ingest', 'prepare'],
  ['complete-japanese-catalogue-images.yml', 'pokedata-ingest', ['prepare', 'official-ingest']],
  ['complete-japanese-catalogue-images.yml', 'mirror', ['official-ingest', 'pokedata-ingest']],
  ['complete-japanese-catalogue-images.yml', 'complete-and-publish', ['prepare', 'official-ingest', 'pokedata-ingest', 'mirror']],
  ['four-language-catalogue-images.yml', 'ingest', 'validate'],
  ['four-language-catalogue-images.yml', 'mirror', 'ingest'],
];
// Workflow maintenance must not start ingestion or cancel an active staging writer.
// Preserve the existing explicit code-change recovery triggers without self-triggers.
const japanesePushPaths = [
  'scripts/catalogue-ingest.ts',
  'scripts/catalogue-ingestion/pokemonCardJpAdapter.ts',
  'scripts/catalogue-ingestion/pokedataJapaneseImageAdapter.ts',
  'scripts/ingest-pokedata-japanese-images.ts',
  'scripts/catalogue-ingestion/adapters.ts',
  'scripts/catalogue-ingestion/pipeline.ts',
  'scripts/complete-japanese-catalogue-images.mjs',
  'scripts/mirror-approved-catalogue-assets.mjs',
  'scripts/verify-japanese-catalogue-api-storage.mjs',
  'scripts/verify-japanese-staging-gateway.mjs',
];
const japaneseConcurrencyGroup =
  "${{ (github.event_name == 'workflow_dispatch' || github.event_name == 'push' || " +
  "(github.event.issue.number == 74 && github.event.issue.pull_request == null && " +
  "github.actor_id == github.repository_owner_id && github.actor == 'tberridge86' && " +
  "github.event.comment.body == '/run-japanese-catalogue-images')) && " +
  "'stackr-staging-database-maintenance' || " +
  "format('stackr-japanese-catalogue-images-noop-{0}', github.run_id) }}";
const r2Name = (name) => name === 'STACKR_CATALOGUE_STORAGE_PROVIDER' || name.startsWith('STACKR_R2_');

function assertWriterWorkflow(file, workflow) {
  assert.deepEqual(Object.keys(workflow.on).sort(), eventTypes[file], file + ': writer trigger changed');
  assert.ok(!Object.keys(workflow.env ?? {}).some(r2Name), file + ': workflow-wide R2 credential exposure');
  for (const [registeredFile, jobName, environment, stepName, stepIf] of registry) {
    if (registeredFile !== file) continue;
    const job = workflow.jobs[jobName];
    assert.equal(job?.environment, environment, file + ': writer environment changed');
    assert.ok(!Object.keys(job.env ?? {}).some(r2Name), file + ': job-wide R2 credential exposure');
    const matches = job.steps.filter((step) => step.name === stepName);
    assert.equal(matches.length, 1, file + ': writer step missing or duplicated');
    assert.equal(matches[0].if, stepIf, file + ': writer step gate changed');
    for (const [key, expected] of Object.entries(bindings)) {
      assert.equal(matches[0].env?.[key], expected, file + ': missing or unsafe ' + key);
    }
  }
  for (const [registeredFile, jobName, expected] of jobGuards) {
    if (registeredFile === file) assert.equal(normalize(workflow.jobs[jobName]?.if), expected, file + ': writer job gate changed');
  }
  for (const [registeredFile, jobName, expected] of dependencies) {
    if (registeredFile === file) assert.deepEqual(workflow.jobs[jobName]?.needs, expected, file + ': writer dependency gate changed');
  }
  if (file === 'complete-japanese-catalogue-images.yml') {
    assert.deepEqual(workflow.on.push.branches, ['main'], 'Japanese push branch widened');
    assert.ok(Array.isArray(workflow.on.push.paths) && workflow.on.push.paths.length > 0, 'Japanese push path filter missing');
    assert.deepEqual(workflow.on.push.paths, japanesePushPaths,
      'Japanese push paths must target explicit ingestion/recovery code only');
    assert.equal(normalize(workflow.concurrency.group), japaneseConcurrencyGroup, 'Japanese concurrency group changed');
    assert.equal(workflow.concurrency['cancel-in-progress'], "${{ github.event_name == 'push' }}",
      'Japanese cancellation gate changed');
  }
  if (file === 'materialize-pokedata-gap-art-20260910.yml') {
    assert.equal(workflow.on.workflow_dispatch.inputs.apply.default, false, 'Materialization no longer defaults to dry run');
    assert.equal(workflow.jobs.materialize.env.STACKR_POKEDATA_GAP_APPLY, '${{ inputs.apply }}');
    assert.equal(workflow.jobs.materialize.env.STACKR_POKEDATA_GAP_CONFIRMATION, '${{ inputs.confirmation }}');
    assert.equal(workflow.jobs.materialize.env.STACKR_EXPECTED_MAIN_SHA, '${{ inputs.expected_main_sha }}');
  }
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    for (const step of job.steps ?? []) {
      if (!Object.keys(step.env ?? {}).some(r2Name)) continue;
      // Main also validates isolated staging credentials before any ingestion starts.
      const stagingPreflight = file === 'complete-japanese-catalogue-images.yml'
        && jobName === 'prepare'
        && step.name === 'Require isolated staging R2 configuration before ingestion';
      if (stagingPreflight) {
        assert.equal(job.environment, 'staging', 'R2 preflight environment changed');
        const expected = Object.fromEntries(Object.entries(bindings).filter(([key]) => key !== 'STACKR_CATALOGUE_STORAGE_PROVIDER'));
        assert.deepEqual(step.env, expected, 'R2 preflight credential scope changed');
      } else {
        assert.ok(registry.some(([f, j, , s]) => f === file && j === jobName && s === step.name), file + ': R2 credentials reached a non-writer step');
      }
    }
  }
}

const workflows = new Map();
for (const file of Object.keys(eventTypes)) {
  const workflow = yaml.parse(readFileSync('.github/workflows/' + file, 'utf8'));
  workflows.set(file, workflow);
  assertWriterWorkflow(file, workflow);
}
// Detect new direct callers so a newly added workflow cannot silently omit the bindings.
const publicScript = /scripts\/(?:mirror-approved-catalogue-assets|complete-japanese-catalogue-images|materialize-pokedata-gap-art-20260910|import-approved-capture-catalogue-assets|deploy\/repair-approved-alpha-set-logos)\.mjs/;
for (const file of readdirSync('.github/workflows').filter((name) => /\.ya?ml$/.test(name))) {
  const workflow = workflows.get(file) ?? yaml.parse(readFileSync('.github/workflows/' + file, 'utf8'));
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    for (const step of job.steps ?? []) {
      const run = String(step.run ?? '');
      const writer = publicScript.test(run) || (/scripts\/repair-stored-catalogue-assets\.mjs/.test(run) && /--execute/.test(run));
      if (writer) assert.ok(registry.some(([f, j, , s]) => f === file && j === jobName && s === step.name), file + ': unregistered public writer');
    }
  }
}
function rejectsMutation(file, mutate, pattern) {
  const changed = structuredClone(workflows.get(file));
  mutate(changed);
  assert.throws(() => assertWriterWorkflow(file, changed), pattern);
}
const simple = 'catalogue-ingestion-ci.yml';
const writerStep = (workflow) => workflow.jobs['ingest-staging'].steps.find((step) => step.name === registry[0][3]);
rejectsMutation(simple, (w) => { delete writerStep(w).env.STACKR_R2_BUCKET; }, /missing or unsafe STACKR_R2_BUCKET/);
rejectsMutation(simple, (w) => { writerStep(w).env.STACKR_R2_SECRET_ACCESS_KEY = '${{ vars.STACKR_R2_SECRET_ACCESS_KEY }}'; }, /missing or unsafe STACKR_R2_SECRET_ACCESS_KEY/);
rejectsMutation(simple, (w) => { writerStep(w).env.STACKR_CATALOGUE_STORAGE_PROVIDER = 'local_dev'; }, /missing or unsafe STACKR_CATALOGUE_STORAGE_PROVIDER/);
rejectsMutation(simple, (w) => { w.jobs['ingest-staging'].environment = 'production'; }, /writer environment changed/);
rejectsMutation(simple, (w) => { delete writerStep(w).if; }, /writer step gate changed/);
rejectsMutation(simple, (w) => { w.on.pull_request = {}; }, /writer trigger changed/);
rejectsMutation(simple, (w) => { w.env = { STACKR_R2_SECRET_ACCESS_KEY: bindings.STACKR_R2_SECRET_ACCESS_KEY }; }, /workflow-wide R2 credential exposure/);
rejectsMutation(simple, (w) => { w.jobs['ingest-staging'].env.STACKR_R2_SECRET_ACCESS_KEY = bindings.STACKR_R2_SECRET_ACCESS_KEY; }, /job-wide R2 credential exposure/);
rejectsMutation('complete-japanese-catalogue-images.yml', (w) => { w.jobs.prepare.if = 'true'; }, /writer job gate changed/);
rejectsMutation('complete-japanese-catalogue-images.yml', (w) => { w.jobs.mirror.needs = []; }, /writer dependency gate changed/);
rejectsMutation('complete-japanese-catalogue-images.yml', (w) => { w.on.push.branches = ['**']; }, /Japanese push branch widened/);
const japanese = 'complete-japanese-catalogue-images.yml';
rejectsMutation(japanese, (w) => { w.on.push.paths.push('.github/workflows/' + japanese); }, /push paths must target/);
rejectsMutation(japanese, (w) => { w.on.push.paths.push('**'); }, /push paths must target/);
rejectsMutation(japanese, (w) => { w.on.push.paths = []; }, /push path filter missing/);
rejectsMutation(japanese, (w) => { w.concurrency['cancel-in-progress'] = true; }, /cancellation gate changed/);
rejectsMutation(japanese, (w) => { w.concurrency.group = 'different-writer'; }, /concurrency group changed/);
rejectsMutation('materialize-pokedata-gap-art-20260910.yml', (w) => { w.on.workflow_dispatch.inputs.apply.default = true; }, /defaults to dry run/);
console.log('R2 writer workflow guards passed: eight scoped writer steps, separated environments and unchanged execution gates. No live requests.');

