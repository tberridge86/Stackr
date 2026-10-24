import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PAGES_TARGET, assertDeployment, assertProject, assertReleaseSource, assertStaticConfiguration, inventoryExport, productionBuildEnvironment, verifyPublicFiles } from './deploy/pages-release.mjs';

const sha = 'a'.repeat(40);
const source = { GITHUB_REPOSITORY: 'tberridge86/Stackr', GITHUB_REF: 'refs/heads/main', EXPECTED_MAIN_SHA: sha, GITHUB_SHA: sha };
assert.equal(assertReleaseSource(source), sha);
for (const wrong of [{ GITHUB_REPOSITORY: 'someone/Stackr' }, { GITHUB_REF: 'refs/heads/test' }, { EXPECTED_MAIN_SHA: 'main' }, { GITHUB_SHA: 'b'.repeat(40) }]) {
  assert.throws(() => assertReleaseSource({ ...source, ...wrong }), /pages_source_/);
}
assertStaticConfiguration(readFileSync('deploy/pages/wrangler.toml', 'utf8'));
assert.throws(() => assertStaticConfiguration(readFileSync('deploy/pages/wrangler.toml', 'utf8') + '\n[vars]\nUNEXPECTED=1'), /pages_static_config_mismatch/);
assert.throws(() => assertStaticConfiguration(readFileSync('deploy/pages/wrangler.toml', 'utf8').replace('../../dist', '../ ../dist')), /pages_static_config_mismatch/);
const build = productionBuildEnvironment({ STACKR_MOBILE_APP_VARIANT: 'staging', EXPO_PUBLIC_STACKR_API_ENABLED: 'false' });
assert.equal(build.STACKR_MOBILE_ENVIRONMENT, 'production');
assert.equal(build.STACKR_MOBILE_API_URL, 'https://api.stackrtcg.com');
assert.equal(build.EXPO_PUBLIC_STACKR_API_ENABLED, 'true');
assert.equal(build.EXPO_NO_DOTENV, '1');
assert.throws(() => productionBuildEnvironment({ CLOUDFLARE_API_TOKEN: 'present' }), /pages_build_contains_server_secret/);
assert.throws(() => productionBuildEnvironment({ SUPABASE_SERVICE_ROLE_KEY: 'present' }), /pages_build_contains_server_secret/);

const project = { id: 'project-1234', name: PAGES_TARGET.project, subdomain: PAGES_TARGET.hostname, production_branch: 'main', domains: [], uses_functions: false, source: null, canonical_deployment: null };
assert.equal(assertProject(project, project.id, 'NONE').previousDeploymentId, 'NONE');
for (const changed of [{ id: 'other-project' }, { name: 'other' }, { subdomain: 'other.pages.dev' }, { production_branch: 'staging' }, { domains: ['stackrtcg.com'] }, { uses_functions: true }, { source: { config: { production_deployments_enabled: true } } }]) {
  assert.throws(() => assertProject({ ...project, ...changed }, project.id, 'NONE'), /pages_/);
}
assert.throws(() => assertProject(project, project.id, 'old-deploy'), /pages_previous_deployment_mismatch/);
const deployment = { id: 'deployment-new', project_id: project.id, project_name: project.name, environment: 'production', deployment_trigger: { metadata: { commit_hash: sha, branch: 'main', commit_dirty: false } }, is_skipped: false, latest_stage: { name: 'deploy', status: 'success' }, url: 'https://abc123.stackr-web.pages.dev' };
assert.equal(assertDeployment({ ...project, canonical_deployment: deployment }, project.id, sha, 'NONE').status, 'success');
for (const changed of [{ environment: 'preview' }, { latest_stage: { name: 'build', status: 'success' } }, { latest_stage: { name: 'deploy', status: 'failure' } }, { is_skipped: true }, { url: 'https://evil.example' }, { project_id: 'wrong' }, { deployment_trigger: { metadata: { commit_hash: 'b'.repeat(40), branch: 'main', commit_dirty: false } } }]) {
  assert.throws(() => assertDeployment({ ...project, canonical_deployment: { ...deployment, ...changed } }, project.id, sha, 'NONE'), /pages_/);
}
assert.throws(() => assertDeployment({ ...project, canonical_deployment: deployment }, project.id, sha, deployment.id), /pages_deployment_not_verified/);

const temporary = mkdtempSync(path.join(os.tmpdir(), 'stackr-pages-test-'));
try {
  mkdirSync(path.join(temporary, '_expo/static/js/web'), { recursive: true });
  writeFileSync(path.join(temporary, 'index.html'), '<!doctype html><script src="/_expo/static/js/web/app.js"></script>');
  writeFileSync(path.join(temporary, '_expo/static/js/web/app.js'), 'console.log("fixture");');
  const inventory = inventoryExport(temporary);
  assert.equal(inventory.files.length, 2);
  assert.equal(inventoryExport(temporary).manifestSha256, inventory.manifestSha256);
  const requests = [];
  const fetchMock = async (url, options) => {
    requests.push({ url: String(url), options });
    const relative = new URL(url).pathname === '/' ? 'index.html' : new URL(url).pathname.slice(1);
    return new Response(readFileSync(path.join(temporary, relative)), { headers: { 'content-type': relative.endsWith('.html') ? 'text/html' : 'application/javascript' } });
  };
  assert.equal((await verifyPublicFiles('https://abc123.stackr-web.pages.dev', inventory, fetchMock)).length, 2);
  assert.ok(requests.every(({ options }) => options.redirect === 'error' && !options.headers.Authorization));
  await assert.rejects(verifyPublicFiles('https://stackr-web.pages.dev', inventory, async () => new Response('wrong', { headers: { 'content-type': 'text/html' } })), /pages_public_probe_hash_mismatch/);
  await assert.rejects(verifyPublicFiles('https://stackr-web.pages.dev', inventory, async () => new Response('x'.repeat(1000), { headers: { 'content-type': 'text/html' } })), /pages_public_probe_size_mismatch/);
  await assert.rejects(verifyPublicFiles('https://stackr-web.pages.dev', inventory, async () => new Response('wrong', { headers: { 'content-type': 'application/json' } })), /pages_public_probe_mime_mismatch/);
  writeFileSync(path.join(temporary, '.env.local'), 'private');
  assert.throws(() => inventoryExport(temporary), /pages_export_not_static/);
  rmSync(path.join(temporary, '.env.local'));
  writeFileSync(path.join(temporary, '_worker.js'), 'worker');
  assert.throws(() => inventoryExport(temporary), /pages_export_not_static/);
} finally { rmSync(temporary, { recursive: true, force: true }); }

const require = createRequire(import.meta.url);
const yaml = require('yaml');
const workflow = yaml.parse(readFileSync('.github/workflows/deploy-pages.yml', 'utf8'));
assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
assert.equal(workflow.jobs.publish.needs, 'build');
assert.equal(workflow.jobs.publish.environment, 'production');
assert.equal(workflow.concurrency['cancel-in-progress'], false);
assert.ok(!JSON.stringify(workflow.jobs.build).includes('secrets.'));
assert.ok(workflow.jobs.build.if.includes("github.ref == 'refs/heads/main'"));
assert.ok(workflow.jobs.build.if.includes('DEPLOY STACKR PAGES'));
for (const job of Object.values(workflow.jobs)) {
  for (const step of job.steps) if (step.uses) assert.match(step.uses, /@[a-f0-9]{40}$/);
}
console.log('Pages release guards, static export checks and public byte verification passed.');
