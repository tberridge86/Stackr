import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const yaml = require('yaml');
const directory = '.github/workflows';
const productionGroup = 'stackr-production-deployment';
const discovered = [];

// Inspect actual upload steps, rather than assuming that only workflows named
// "deploy-production" can replace the same production API. Staging uses the
// same service variable name but intentionally has a separate release lock.
for (const file of readdirSync(directory).filter(name => /\.ya?ml$/.test(name))) {
  const workflow = yaml.parse(readFileSync(`${directory}/${file}`, 'utf8'));
  for (const [jobName, job] of Object.entries(workflow.jobs ?? {})) {
    const environment = typeof job.environment === 'object'
      ? job.environment.name : job.environment;
    if (environment !== 'production') continue;
    const env = { ...workflow.env, ...job.env };
    const uploadsBackend = (job.steps ?? []).some(step => {
      const command = String(step.run ?? '').replace(/\\\r?\n/g, ' ');
      return /(?:@railway\/cli@\S+|\brailway)\s+up\b/.test(command)
        && /RAILWAY_BACKEND_SERVICE_ID|299d7ad4-5ed8-4301-b609-ef99274078d0/.test(command);
    });
    if (!uploadsBackend) continue;
    discovered.push(`${file}:${jobName}`);
    assert.ok(env.RAILWAY_BACKEND_SERVICE_ID || JSON.stringify(job).includes('299d7ad4-5ed8-4301-b609-ef99274078d0'),
      `${file}:${jobName}: production backend target is not explicit`);
    assert.equal(workflow.concurrency?.group, productionGroup,
      `${file}:${jobName}: production backend releases can overlap`);
    assert.equal(workflow.concurrency?.['cancel-in-progress'], false,
      `${file}:${jobName}: a later release must not cancel an active deployment`);
    assert.equal(job.concurrency, undefined,
      `${file}:${jobName}: use the workflow release lock, not a nested lock`);
  }
}

for (const file of ['deploy-production.yml', 'deploy-owner-testflight-backend.yml', 'deploy-production-backend-hardening.yml']) {
  assert.ok(discovered.some(job => job.startsWith(`${file}:`)), `${file}: backend upload was not inspected`);
}
assert.ok(!discovered.some(job => job.startsWith('deploy-staging.yml:')),
  'staging releases must remain independent of production');

// The migration provisioning lane already shares this lock. Checking its
// contract here prevents a release change from accidentally cancelling it.
const migration = yaml.parse(readFileSync(`${directory}/deploy-r2-migration.yml`, 'utf8'));
assert.equal(migration.concurrency?.group, productionGroup);
assert.equal(migration.concurrency?.['cancel-in-progress'], false);

console.log(`Production release concurrency: ${discovered.length} backend jobs share a non-cancelling release group.`);
