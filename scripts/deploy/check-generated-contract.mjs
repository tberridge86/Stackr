import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = process.cwd();
const committedPath = path.join(root, 'lib', 'generated', 'stackr-api-v1.d.ts');
const tempDirectory = mkdtempSync(path.join(tmpdir(), 'stackr-openapi-'));
const generatedPath = path.join(tempDirectory, 'stackr-api-v1.d.ts');
const executable = process.execPath;
const cliPath = path.join(root, 'node_modules', 'openapi-typescript', 'bin', 'cli.js');

try {
  const result = spawnSync(executable, [
    cliPath,
    'docs/stackr-api/openapi.v1.yaml',
    '-o',
    generatedPath,
  ], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout || result.error?.message || 'OpenAPI generation failed.\n');
    process.exit(1);
  }

  const normalise = (value) => value.replace(/\r\n/g, '\n').trimEnd();
  const expected = normalise(readFileSync(committedPath, 'utf8'));
  const actual = normalise(readFileSync(generatedPath, 'utf8'));
  if (actual !== expected) {
    console.error('Generated Stackr API contract is stale. Run npm run generate:api-contract.');
    process.exit(1);
  }

  console.log('Generated Stackr API contract matches the OpenAPI source.');
} finally {
  rmSync(tempDirectory, { recursive: true, force: true });
}
