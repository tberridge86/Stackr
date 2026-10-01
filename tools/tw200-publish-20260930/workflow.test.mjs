import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import YAML from 'yaml';

const workflow = YAML.parse(readFileSync(new URL('../../.github/workflows/deploy-production.yml', import.meta.url), 'utf8'));
const jobs = workflow.jobs;
const scopes = ['tw200', 'english45', 'sh33', 'residual146', 'native96', 'korean232', 'native65'];

const matchingJobs = (scope) => Object.entries(jobs)
  .filter(([, job]) => String(job.if ?? '').includes(`inputs.release_scope == '${scope}'`))
  .map(([name]) => name);

test('each bounded artwork scope can start exactly its matching release lane', () => {
  for (const scope of scopes) {
    assert.deepEqual(matchingJobs(scope), [scope]);
    const lane = jobs[scope];
    assert.match(lane.if, new RegExp(`inputs\\.release_scope == '${scope}'`));
    for (const other of scopes.filter((candidate) => candidate !== scope)) {
      assert.doesNotMatch(lane.if, new RegExp(`inputs\\.release_scope == '${other}'`));
    }
  }
});

test('the broad deploy lane excludes every bounded recovery scope', () => {
  const broad = jobs.deploy;
  for (const scope of scopes) {
    assert.match(broad.if, new RegExp(`inputs\\.release_scope != '${scope}'`));
    assert.doesNotMatch(broad.if, new RegExp(`inputs\\.release_scope == '${scope}'`));
  }
});

test('all bounded lanes retain the production and no-side-effect guards', () => {
  for (const scope of scopes) {
    const lane = jobs[scope];
    assert.equal(lane.environment, 'production');
    assert.deepEqual(lane.permissions, { contents: 'read', actions: 'read' });
    const guard = lane.steps.find((step) => step.name === 'Validate exact bounded release');
    assert.ok(guard, `${scope} missing bounded-release guard`);
    assert.equal(guard.env.EXPECTED_SHA, '${{ inputs.expected_main_sha }}');
    assert.equal(guard.env.FORBIDDEN_FLAGS, '${{ inputs.gateway_bootstrap }} ${{ inputs.apply_migrations }} ${{ inputs.publish_mobile_update }} ${{ inputs.promote_gateway }}');
    for (const text of [
      'test "$EXPECTED_SHA" = "$GITHUB_SHA"',
      'test "$(git rev-parse HEAD)" = "$GITHUB_SHA"',
      "test \"$FORBIDDEN_FLAGS\" = 'false false false false'",
      'test -z "$OTHER_IDENTIFIERS"',
      'git diff --exit-code',
    ]) assert.ok(guard.run.includes(text), `${scope} guard lost: ${text}`);
    assert.ok(lane.steps.some((step) => String(step.run ?? '').includes(`tools/${scope}-publish-${scope === 'native65' ? '20261001' : '20260930'}/publish.mjs --execute`)));
  }
});
