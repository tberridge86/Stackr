import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const verifier = 'scripts/deploy/verify-wp32-release-candidate.mjs';

function run(args = []) {
  return spawnSync(process.execPath, [verifier, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
}

function output(result) {
  return `${result.stdout}\n${result.stderr}`;
}

const honestNoGo = run();
assert.equal(honestNoGo.status, 0, output(honestNoGo));
const honestResult = JSON.parse(honestNoGo.stdout);
assert.equal(honestResult.ok, true);
assert.equal(honestResult.completionPercent, 25);
assert.deepEqual(honestResult.interactions, { '096': 75, '097': 0, '098': 0 });
assert.equal(honestResult.decision, 'NO_GO');
assert.equal(honestResult.releaseGatesPassed, 6);
assert.equal(honestResult.releaseGatesTotal, 10);
assert.equal(honestResult.blockers.length, 4);

const requireGo = run(['--require-go']);
assert.notEqual(requireGo.status, 0, 'require-go must fail while the candidate is NO-GO');
assert.match(output(requireGo), /wp32_release_candidate_not_go/u);

const sourceManifest = JSON.parse(readFileSync('deploy/wp32-release-candidate.json', 'utf8'));
const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'stackr-wp32-release-candidate-'));
try {
  const falseGoPath = path.join(temporaryDirectory, 'false-go.json');
  const falseGo = structuredClone(sourceManifest);
  falseGo.workPackage.decision = 'GO';
  falseGo.decision.status = 'GO';
  writeFileSync(falseGoPath, JSON.stringify(falseGo));
  const falseGoResult = run([`--manifest=${falseGoPath}`]);
  assert.notEqual(falseGoResult.status, 0, 'GO must fail while critical blockers remain');
  assert.match(output(falseGoResult), /go_with_open_blockers/u);
  assert.match(output(falseGoResult), /go_without_mobile_binary/u);
  assert.match(output(falseGoResult), /go_without_integrated_pilot/u);

  const missingEvidencePath = path.join(temporaryDirectory, 'missing-evidence.json');
  const missingEvidence = structuredClone(sourceManifest);
  missingEvidence.acceptanceCriteria[0].evidencePaths = [];
  writeFileSync(missingEvidencePath, JSON.stringify(missingEvidence));
  const missingEvidenceResult = run([`--manifest=${missingEvidencePath}`]);
  assert.notEqual(missingEvidenceResult.status, 0, 'critical criteria must retain evidence');
  assert.match(output(missingEvidenceResult), /critical_criterion_missing_evidence:096-1/u);

  const falseModelPath = path.join(temporaryDirectory, 'false-model.json');
  const falseModel = structuredClone(sourceManifest);
  falseModel.releaseGates.find((gate) => gate.id === 'active_model_selected').status = 'pass';
  writeFileSync(falseModelPath, JSON.stringify(falseModel));
  const falseModelResult = run([`--manifest=${falseModelPath}`]);
  assert.notEqual(falseModelResult.status, 0, 'manifest cannot claim a model that release evidence rejects');
  assert.match(output(falseModelResult), /release_gate_status_mismatch:active_model_selected/u);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}

console.log('WP32 release candidate guard tests passed.');
