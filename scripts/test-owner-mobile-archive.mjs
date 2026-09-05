import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ignore = require('ignore');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rules = ignore().add(readFileSync(path.join(root, '.easignore'), 'utf8'));
const relative = (filename) => path.relative(root, filename).split(path.sep).join('/');
const checked = new Set();

function checkModule(filename) {
  const name = relative(filename);
  if (checked.has(name)) return;
  assert(!name.startsWith('../'), `Metro dependency escapes archive: ${name}`);
  assert(existsSync(filename), `Metro dependency missing: ${name}`);
  assert(!rules.ignores(name), `Metro dependency excluded from EAS archive: ${name}`);
  checked.add(name);
  const source = readFileSync(filename, 'utf8');
  for (const match of source.matchAll(/require\(['"](\.[^'"]+)['"]\)/g)) {
    checkModule(require.resolve(path.resolve(path.dirname(filename), match[1])));
  }
  // Worker paths are runtime dependencies, although not imported with require().
  for (const match of source.matchAll(/path\.resolve\(__dirname,\s*['"]([^'"]+\.c?js)['"]\)/g)) {
    checkModule(path.resolve(path.dirname(filename), match[1]));
  }
}

checkModule(path.join(root, 'metro.config.js'));
const expectedHelpers = ['scripts/stackr-preview-proxy-policy.cjs', 'scripts/stackr-preview-proxy-worker.cjs'];
for (const helper of expectedHelpers) assert(checked.has(helper), `Missing Metro helper check: ${helper}`);
const trackedScripts = execFileSync('git', ['ls-files', '-z', '--', 'scripts'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);
assert.deepEqual(trackedScripts.filter((name) => !rules.ignores(name)).sort(), expectedHelpers.sort(),
  'Only the two Metro helpers may ship from scripts/');
for (const blocked of ['scripts/deploy/future-job.mjs', 'scripts/future-secret-helper.mjs', 'backend/server.js', '.env']) {
  assert(rules.ignores(blocked), `Sensitive/tooling archive exclusion regressed: ${blocked}`);
}
console.log(`EAS archive Metro dependency closure passed (${checked.size} modules); only two script helpers included.`);
