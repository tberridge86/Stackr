import assert from 'node:assert/strict';
import { ARCHITECTURE_CHECKS, architectureValidationReport } from './architecture-validation-report.mjs';

const sourceSha = 'a'.repeat(40);
const steps = Object.fromEntries(ARCHITECTURE_CHECKS.map(([id]) => [id, { outcome: 'success' }]));
const passed = architectureValidationReport({ sourceSha, steps });
assert.equal(passed.status, 'passed');
assert.equal(passed.scope, 'offline_architecture_regressions');
assert.equal(passed.deploymentApproved, false);
assert.equal(passed.liveValidation.retrievalLatency, 'not_measured');
assert.ok(Object.values(passed.liveValidation).every((value) => value !== 'passed'));

for (const outcome of ['failure', 'cancelled', 'skipped', 'neutral']) {
  const report = architectureValidationReport({ sourceSha, steps: { ...steps, r2_storage: { outcome } } });
  assert.equal(report.status, 'blocked', `${outcome} must never count as a pass`);
  assert.equal(report.checks.find((check) => check.id === 'api_delivery').passed, true);
  assert.equal(report.checks.find((check) => check.id === 'r2_storage').outcome, outcome);
}
const missing = { ...steps };
delete missing.pagination;
assert.equal(architectureValidationReport({ sourceSha, steps: missing }).status, 'blocked');
assert.equal(architectureValidationReport({ sourceSha }).status, 'blocked');
// A continue-on-error conclusion cannot hide the actual failed outcome.
assert.equal(architectureValidationReport({
  sourceSha, steps: { ...steps, r2_storage: { outcome: 'failure', conclusion: 'success' } },
}).status, 'blocked');
assert.throws(() => architectureValidationReport({ sourceSha: 'main', steps }), /full tested source commit/);
console.log('Architecture reports retain every outcome, reject missing checks and keep live validation explicitly unverified.');
