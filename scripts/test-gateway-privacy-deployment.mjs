import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parse } = require('yaml');

const workflow = readFileSync('.github/workflows/deploy-gateway-privacy.yml', 'utf8');
const runbook = readFileSync('deploy/production-runbook.md', 'utf8');

assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
assert.match(workflow, /group: stackr-production-deployment/);
assert.match(workflow, /environment: production/);
assert.match(workflow, /CLOUDFLARE_ACCOUNT_ID: b4c23b0834cc5a113aa4a98fd904b281/);
assert.match(workflow, /STACKR_BACKEND_URL: https:\/\/pocketvault-production\.up\.railway\.app/);
assert.match(workflow, /STACKR_SUPABASE_URL: https:\/\/oakdbbzdqwurpjnoqhmu\.supabase\.co/);
assert.match(workflow, /test "\$EXPECTED_MAIN_SHA" = "\$GITHUB_SHA"/);
assert.doesNotMatch(workflow, /test "\$EXPECTED_MAIN_SHA" = '[0-9a-f]{40}'/);
assert.doesNotMatch(workflow, /test "\$PREVIOUS_GATEWAY_(?:VERSION_ID|DEPLOYMENT_ID|TAG)" = '/);
const releaseInputs = parse(workflow).on.workflow_dispatch.inputs;
for (const name of ['previous_gateway_version_id', 'previous_gateway_deployment_id']) {
  assert.equal(releaseInputs[name].required, true);
  assert.equal(releaseInputs[name].default, undefined, 'Every release must supply its reviewed current rollback target.');
}
assert.equal(releaseInputs.previous_gateway_tag.required, false);
assert.equal(releaseInputs.previous_gateway_tag.default, undefined, 'An untagged current Worker must be explicitly represented by an empty tag.');
assert.match(workflow, /--keep-vars/);
assert.match(workflow, /write-gateway-release-config\.mjs --output="\$release_config"/);
assert.match(workflow, /node gateway\/node_modules\/wrangler\/bin\/wrangler\.js versions upload[^\n]+--config "\$release_config"[^\n]+--strict --keep-vars/);
assert.doesNotMatch(workflow, /versions upload[\s\S]*?--var /);
assert.match(workflow, /--name stackr-api-gateway/);
assert.match(workflow, /secret list[^\n]+--format json/);
assert.doesNotMatch(workflow, /secret list[^\n]+--json/);
assert.doesNotMatch(workflow, /secret list[^\n]+--name/, 'secret list appends the environment to an explicit name; use the validated environment config');
assert.match(workflow, /production_worker_name_mismatch/);
assert.match(workflow, /BACKEND_ORIGIN_KEY', 'BACKEND_ADMIN_KEY/);
assert.match(workflow, /STACKR_PRICING_ACCESS_MODE=personal/);
assert.match(workflow, /versions deploy[\s\S]*"\$release_tag@100"/);
assert.match(workflow, /versions upload[^\n]+--strict --keep-vars/);
assert.match(workflow, /versions deploy[^\n]+--version-tag "\$release_tag@100"/);
assert.doesNotMatch(workflow, /(?:npx|wrangler@4\.114\.0) .*versions (?:upload|deploy)/);
assert.match(workflow, /patch-wrangler-do-optional-binding\.mjs/);
assert.match(workflow, /test-wrangler-do-optional-binding-compat\.mjs/);
assert.match(workflow, /test-attest-gateway-do-identity\.mjs/);
assert.match(workflow, /steps.scan_gateway_evidence.outcome == 'success'/);
assert.match(workflow, /Restore exact previous gateway version after a failed privacy release[\s\S]*"\$PREVIOUS_GATEWAY_VERSION_ID@100"/);
assert.match(workflow, /gateway-privacy-smoke\.mjs/);
assert.match(workflow, /test-gateway-privacy-deployment\.mjs/);
assert.doesNotMatch(workflow, /(?:npx|npm).*?(?:railway|supabase@|eas-cli|price-refresh)/i);
assert.doesNotMatch(workflow, /catalogue.*promot|recognition-service/i);
assert.match(runbook, /Gateway-only personal-pricing privacy release/);
assert.match(runbook, /does not create a Worker, namespace, backend service, or staging deployment/);

// Execute the workflow's actual rollback-target attestation against realistic
// deployment histories: merely finding an old deployment is insufficient.
const steps = parse(workflow).jobs.gateway_privacy.steps;
const attestation = steps.find((step) => step.name === 'Attest existing production Worker, route, and rollback target');
const code = attestation.run.split("node <<'NODE'\n")[1].split('\nNODE')[0];
const versionId = 'ab809fc2-d0da-484f-a5b7-908f76013c1d';
const deploymentId = '5105e13b-2b9c-4e3f-a2e0-392c2694cb37';
const tag = 'production-9113bfffc0ae4f0ce841645040a1959d77c0861c';
const previous = {id:deploymentId,created_on:'2026-08-13T09:06:34Z',versions:[{version_id:versionId,percentage:100}]};
function attest(deployments, {requestedVersionId = versionId, requestedTag = tag, versionTag = tag, secretNames = ['BACKEND_ORIGIN_KEY','BACKEND_ADMIN_KEY']} = {}) {
  const files = {
    'versions-before.json': [{id:versionId,annotations:versionTag ? {'workers/tag':versionTag} : {}}],
    'deployments-before.json': deployments,
    'secrets-before.json': secretNames.map((name)=>({name})),
  };
  runInNewContext(code, {
    require:()=>({readFileSync:(path)=>JSON.stringify(files[path.split('/').at(-1)])}),
    process:{env:{RUNNER_TEMP:'/tmp',PREVIOUS_GATEWAY_VERSION_ID:requestedVersionId,PREVIOUS_GATEWAY_DEPLOYMENT_ID:deploymentId,PREVIOUS_GATEWAY_TAG:requestedTag}},
  });
}
attest([previous]);
attest([previous], {requestedTag:'', versionTag:''});
assert.throws(()=>attest([previous], {requestedTag:'', versionTag:tag}),/previous_gateway_version_or_tag_not_attested/);
assert.throws(()=>attest([previous], {requestedTag:tag, versionTag:''}),/previous_gateway_version_or_tag_not_attested/);
assert.throws(()=>attest([previous], {requestedTag:tag, versionTag:'gateway-privacy-c35667bfcd54bf8b497a01973643618584a799e1'}),/previous_gateway_version_or_tag_not_attested/);
assert.throws(()=>attest([previous], {requestedVersionId:'c35667bf-cd54-4b8b-8971-3643618584a7'}),/previous_gateway_version_or_tag_not_attested/);
assert.throws(()=>attest([previous,{...previous,id:'newer-deployment',created_on:'2026-09-07T18:00:00Z'}]),/current_gateway_deployment_not_exactly/);
assert.throws(()=>attest([{...previous,versions:[{version_id:versionId,percentage:50}]}]),/current_gateway_deployment_not_exactly/);
assert.throws(()=>attest([previous],{secretNames:['BACKEND_ADMIN_KEY']}),/required_preserved_gateway_secret_missing/);
for (const step of steps.filter((step)=>step.run?.includes('| tee'))) {
  assert.match(step.run,/set -euo pipefail/,`${step.name} must propagate failed probes`);
}

console.log('Gateway-only privacy deployment guards passed.');
