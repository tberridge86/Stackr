import { writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const outputArgument = process.argv.find((argument) => argument.startsWith('--output='));
const outputPath = outputArgument ? resolve(outputArgument.slice('--output='.length)) : null;
const requiredSecretNames = [
  'BACKEND_ORIGIN_KEY',
  'BACKEND_ADMIN_KEY',
  'RECOGNITION_SERVICE_SECRET',
];

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: message }));
  process.exit(1);
}

if (!outputPath) fail('missing_output_path');

const relativeToRepository = relative(process.cwd(), outputPath);
if (!relativeToRepository.startsWith('..') && !isAbsolute(relativeToRepository)) {
  fail('output_path_must_be_outside_repository');
}

const secrets = {};
for (const name of requiredSecretNames) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) fail(`missing_worker_secret:${name}`);
  secrets[name] = value;
}

writeFileSync(outputPath, `${JSON.stringify(secrets)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
  mode: 0o600,
});

console.log(JSON.stringify({
  ok: true,
  outputPath,
  secretNames: requiredSecretNames,
}));
