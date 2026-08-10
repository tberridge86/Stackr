import { appendFileSync, readFileSync } from 'node:fs';

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function collectGroupIds(value, output = new Set()) {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (/group/i.test(key) && typeof child === 'string' && /^[0-9a-f-]{36}$/i.test(child)) output.add(child);
    collectGroupIds(child, output);
  }
  return output;
}

const filePath = argument('file');
const githubEnvironmentPath = argument('github-env');
if (!filePath) throw new Error('Missing --file=<eas-update-json>.');
if (!githubEnvironmentPath) throw new Error('Missing --github-env=<path>.');

const payload = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
const groupIds = [...collectGroupIds(payload)];
if (groupIds.length !== 1) {
  throw new Error(`Expected one EAS update group ID, found ${groupIds.length}.`);
}

appendFileSync(githubEnvironmentPath, `STACKR_EAS_UPDATE_GROUP_ID=${groupIds[0]}\n`, 'utf8');
console.log(JSON.stringify({ ok: true, updateGroupId: groupIds[0] }));
