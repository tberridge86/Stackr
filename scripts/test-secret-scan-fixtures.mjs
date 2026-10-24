import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scanner = fileURLToPath(new URL('./deploy/secret-scan.mjs', import.meta.url));
const tempParent = realpathSync(process.env.STACKR_TEST_TEMP_ROOT || tmpdir());
const root = mkdtempSync(path.join(tempParent, 'stackr-secret-scan-fixtures-'));
const fixtures = path.join(root, 'fixtures');
const repository = path.join(root, 'history');
const hooks = path.join(root, 'empty-hooks');
for (const directory of [fixtures, repository, hooks]) mkdirSync(directory);

// Values below are synthesized for detection tests and are never credentials.
// Construct recognizable markers at runtime so the test source is scan-clean.
const assignedName = ['SUPABASE', 'SECRET', 'KEY'].join('_');
const fixture = 'fixture-service-key';
const syntheticValue = ['synthetic', 'noncredential', '0123456789'].join('-');
const assignment = (value, quote = "'") => `${assignedName}: ${quote}${value}${quote}\n`;

function scan(args, cwd = root) {
  const result = spawnSync(process.execPath, [scanner, ...args], { cwd, encoding: 'utf8' });
  assert.equal(result.error, undefined, 'scanner process must launch');
  assert.ok([0, 1].includes(result.status), 'scanner must return a defined outcome');
  const report = JSON.parse(result.status === 0 ? result.stdout : result.stderr);
  return { status: result.status, report };
}

function scanFixture(source) {
  writeFileSync(path.join(fixtures, 'sample.txt'), source);
  return scan([`--directory=${fixtures}`]);
}

function assertDetected(result, expectedRule, label) {
  assert.equal(result.status, 1, `${label} must fail scanning`);
  assert.equal(result.report.ok, false);
  assert.ok(result.report.findings.some((finding) => finding.rule === expectedRule), `${label} must retain its detection rule`);
}

function git(args) {
  const result = spawnSync('git', [
    '-c', 'user.name=Stackr Fixture', '-c', 'user.email=fixture@example.invalid',
    '-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${hooks}`, ...args,
  ], { cwd: repository, encoding: 'utf8' });
  assert.equal(result.error, undefined, 'isolated Git process must launch');
  assert.equal(result.status, 0, `isolated fixture Git ${args[0]} must succeed: ${result.stderr.trim()}`);
  return result.stdout.trim();
}

function commit(source, message) {
  writeFileSync(path.join(repository, 'sample.txt'), source);
  git(['add', 'sample.txt']);
  git(['commit', '--quiet', '-m', message]);
  return git(['rev-parse', 'HEAD']);
}

try {
  for (const quote of ["'", '"']) {
    assert.equal(scanFixture(assignment(fixture, quote)).status, 0, 'the exact audited fixture is permitted');
  }
  for (const value of [
    syntheticValue, `${fixture}-production`, `production-${fixture}`,
    fixture.toUpperCase(), `${fixture} `,
  ]) {
    assertDetected(scanFixture(assignment(value)), 'assigned_server_secret', 'a non-exact assigned value');
  }
  assertDetected(scanFixture(assignment(fixture) + assignment(syntheticValue)), 'assigned_server_secret', 'a neighboring assignment after the fixture');
  assertDetected(scanFixture(assignment(syntheticValue) + assignment(fixture)), 'assigned_server_secret', 'a neighboring assignment before the fixture');
  assertDetected(scanFixture(`${assignedName}:\n  '${syntheticValue}'\n`), 'assigned_server_secret', 'a multiline assignment');

  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const markers = [
    ['supabase_secret_key', ['sb', 'secret', 'A'.repeat(24)].join('_')],
    ['supabase_access_token', ['sbp', 'A'.repeat(24)].join('_')],
    ['private_key', ['-----BEGIN ', 'PRIVATE KEY-----'].join('')],
    ['github_token', ['ghp', 'A'.repeat(36)].join('_')],
    ['aws_access_key', ['AK', 'IA', 'A'.repeat(16)].join('')],
    ['stripe_live_secret', ['sk', 'live', 'A'.repeat(24)].join('_')],
    ['shippo_api_token', ['shippo', 'test', 'A'.repeat(24)].join('_')],
    ['supabase_service_role_jwt', [encoded({ alg: 'HS256' }), encoded({ role: 'service_role' }), 'synthetic'].join('.')],
  ];
  for (const [rule, marker] of markers) {
    assertDetected(scanFixture(`${assignment(fixture)}${marker}\n`), rule, 'an independent marker beside the fixture');
  }

  git(['init', '--quiet']);
  const baseline = commit('No assigned value.\n', 'Initial fixture');
  commit(`Mock configuration:\n${assignment(fixture)}End fixture.\n`, 'Add audited fixture');
  const fixtureRemoved = commit('No assigned value.\n', 'Remove audited fixture');
  assert.equal(scan([], repository).status, 0, 'current tree without secrets passes');
  assert.equal(scan([`--history-range=${baseline}..${fixtureRemoved}`], repository).status, 0, 'introduced and removed exact fixture does not block history');

  commit(`Mock configuration:\n${assignment(syntheticValue)}End fixture.\n`, 'Add detection fixture');
  const valueRemoved = commit('No assigned value.\n', 'Remove detection fixture');
  assert.equal(scan([], repository).status, 0, 'removal makes the current tree clean');
  const historical = scan([`--history-range=${baseline}..${valueRemoved}`], repository);
  assertDetected(historical, 'assigned_server_secret', 'an introduced then removed assigned value');
  assert.ok(historical.report.findings.some((finding) => finding.path.startsWith('git-history:')), 'history must remain scanned');

  commit(`${assignment(fixture)}${assignedName}:\n  '${syntheticValue}'\n`, 'Add multiline detection fixture');
  const multilineRemoved = commit('No assigned value.\n', 'Remove multiline detection fixture');
  assert.equal(scan([], repository).status, 0);
  assertDetected(scan([`--history-range=${valueRemoved}..${multilineRemoved}`], repository), 'assigned_server_secret', 'a removed multiline assignment beside the exact fixture');

  writeFileSync(path.join(repository, 'separate-name.txt'), `${assignedName}:\n`);
  writeFileSync(path.join(repository, 'separate-value.txt'), `'${syntheticValue}'\n`);
  git(['add', 'separate-name.txt', 'separate-value.txt']);
  git(['commit', '--quiet', '-m', 'Add separate file fragments']);
  const separateFiles = git(['rev-parse', 'HEAD']);
  assert.equal(scan([`--history-range=${multilineRemoved}..${separateFiles}`], repository).status, 0, 'patch fragments from different files must not be joined');

  const oppositeSideBase = commit(`${assignedName}:\n`, 'Add name-only fragment');
  const oppositeSideEnd = commit(`'${syntheticValue}'\n`, 'Replace with value-only fragment');
  assert.equal(scan([`--history-range=${oppositeSideBase}..${oppositeSideEnd}`], repository).status, 0, 'removed and added patch sides must not be joined');

  const filler = Array.from({ length: 12 }, (_, index) => `unchanged ${index}\n`).join('');
  const hunkBase = commit(`top\n${filler}bottom\n`, 'Add hunk boundary fixture');
  const hunkEnd = commit(`${assignedName}:\n${filler}'${syntheticValue}'\n`, 'Change separate hunks');
  assert.equal(scan([`--history-range=${hunkBase}..${hunkEnd}`], repository).status, 0, 'patch fragments from separate hunks must not be joined');
  console.log('Secret scanner fixtures pass: only the exact historical mock is exempt; variants, neighboring markers and removed historical assignments remain detected.');
} finally {
  // Delete only this test's verified temporary directory, never a computed repo root.
  const resolved = realpathSync(root);
  assert.equal(path.dirname(resolved), tempParent);
  assert.ok(path.basename(resolved).startsWith('stackr-secret-scan-fixtures-'));
  rmSync(resolved, { recursive: true, force: true });
}
