import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import YAML from 'yaml';

const workflow = YAML.parse(readFileSync('.github/workflows/deploy-staging.yml', 'utf8'));
const scope = 'pricing_identity_guard_rehearsal';
const pricing = workflow.jobs['pricing-identity-guard-rehearsal'];
assert.equal(workflow.permissions.contents, 'read');
assert.deepEqual(workflow.concurrency, { group: 'stackr-staging-deployment', 'cancel-in-progress': false });
assert.equal(pricing.environment, 'staging');
assert.equal(pricing.env.STACKR_DEPLOYMENT_ENVIRONMENT, 'staging');
const selected = (job, releaseScope, ref = 'refs/heads/main', confirmation = 'DEPLOY STAGING') =>
  runInNewContext(job.if, { inputs: { release_scope: releaseScope, confirmation }, github: { ref } },
    { timeout: 100, contextCodeGeneration: { strings: false, wasm: false } });
for (const prior of ['gate0_hardening', 'catalogue_api', 'full_platform']) {
  assert.equal(selected(workflow.jobs.deploy, prior), true, 'prior scope must keep its original deployment job');
  assert.equal(selected(pricing, prior), false, 'pricing job must not run for prior scopes');
}
assert.equal(selected(pricing, scope), true);
assert.equal(selected(workflow.jobs.deploy, scope), false, 'rehearsal cannot also deploy the platform');
assert.equal(selected(pricing, 'cardmarket_ledger_rehearsal'), true);
assert.equal(selected(workflow.jobs.deploy, 'cardmarket_ledger_rehearsal'), false);
assert.equal(selected(pricing, 'cardmarket_ledger_rehearsal', 'refs/heads/codex/candidate'), false);
for (const job of [pricing, workflow.jobs.deploy]) {
  assert.equal(selected(job, scope, 'refs/heads/codex/candidate'), false, 'candidate branch cannot run protected rehearsal');
  assert.equal(selected(job, scope, 'refs/heads/main', ''), false, 'missing dispatch confirmation must not run');
}
const validation = pricing.steps[0].run;
for (const [key, expected] of [['APPLY_MIGRATIONS', 'false'], ['RELEASE_CANDIDATE', 'true'], ['PUBLISH_MOBILE_UPDATE', 'false']]) {
  assert(validation.includes('test "$' + key + '" = "' + expected + '"'), 'rollback-only release flags must fail closed');
}
assert(validation.includes('test "$STACKR_MIGRATION_BASELINE_APPROVED" = "true"'));
assert(validation.includes('lmwfhvexfcoyeuoyrlco'));
const commands = pricing.steps.map(step => step.run ?? '').join('\n');
assert(commands.includes('cardmarket_ledger_rehearsal) SCRIPT=scripts/deploy/rehearse-cardmarket-ledger.mjs'));
assert(commands.includes('pricing_identity_guard_rehearsal) SCRIPT=scripts/deploy/rehearse-price-identity-guard.mjs'));
assert(commands.includes('*) exit 1'), 'unreviewed rehearsal scope must fail closed');
assert(!/db push|railway.* up |wrangler|eas-cli|update:rollback|rehearse-gate0/.test(commands), 'pricing rehearsal cannot publish or run unrelated migrations');
assert(commands.includes('verify-backup.mjs') && commands.includes('--require-physical'));
assert(commands.includes('schema.stderr') && commands.includes('data.stderr') && commands.includes('physical.stderr'), 'backup diagnostics stay ephemeral');
const uploads = pricing.steps.filter(step => step.uses?.startsWith('actions/upload-artifact@'));
assert.equal(uploads.length, 1);
assert.equal(uploads[0].with.path, '${{ runner.temp }}/stackr-price-guard-rehearsal.json', 'only non-secret attestation can be uploaded');
assert.equal(pricing.steps.at(-1).if, 'always()');
console.log(JSON.stringify({ priorScopesPreserved: true, mainAndProtectedStaging: true,
  sharedConcurrency: true, rollbackOnlyFlags: true, platformExcluded: true,
  backupRequired: true, secretBackupArtifactsExcluded: true }));
