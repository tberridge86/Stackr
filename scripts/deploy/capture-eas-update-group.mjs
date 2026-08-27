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

export function extractEasUpdateGroupId(payload) {
  if (!Array.isArray(payload) || payload.length === 0) {
    throw new Error('EAS update evidence must be a non-empty array.');
  }
  const groupIds = [...collectGroupIds(payload)];
  if (groupIds.length !== 1) {
    throw new Error(`Expected one EAS update group ID, found ${groupIds.length}.`);
  }
  return groupIds[0];
}

function normalizePlatforms(value) {
  return new Set(String(value ?? '')
    .split(',')
    .map((platform) => platform.trim().toLowerCase())
    .filter(Boolean));
}

export function attestEasUpdate(payload, expected = {}) {
  const updateGroupId = extractEasUpdateGroupId(payload);

  const expectedPlatforms = normalizePlatforms(expected.platforms);
  const actualPlatforms = new Set();
  for (const update of payload) {
    if (!update || typeof update !== 'object') throw new Error('EAS update evidence entry is invalid.');
    if (!/^[0-9a-f-]{36}$/i.test(String(update.id ?? ''))) {
      throw new Error('EAS update evidence contains an invalid update ID.');
    }
    const platform = String(update.platform ?? '').toLowerCase();
    if (!platform) throw new Error('EAS update evidence is missing a platform.');
    if (actualPlatforms.has(platform)) throw new Error(`EAS update evidence repeats platform ${platform}.`);
    actualPlatforms.add(platform);
    if (expected.runtimeVersion && update.runtimeVersion !== expected.runtimeVersion) {
      throw new Error(`EAS update runtime mismatch for ${platform}.`);
    }
    if (expected.gitCommitHash
      && String(update.gitCommitHash ?? '').toLowerCase() !== expected.gitCommitHash.toLowerCase()) {
      throw new Error(`EAS update Git SHA mismatch for ${platform}.`);
    }
    if (expected.message && update.message !== expected.message) {
      throw new Error(`EAS update message mismatch for ${platform}.`);
    }
    if (update.isRollBackToEmbedded !== false) {
      throw new Error(`EAS update rollback marker is invalid for ${platform}.`);
    }
    try {
      const permalink = new URL(update.manifestPermalink);
      if (permalink.protocol !== 'https:' || permalink.username || permalink.password) throw new Error();
    } catch {
      throw new Error(`EAS update manifest permalink is invalid for ${platform}.`);
    }
  }
  if (expectedPlatforms.size > 0) {
    if (actualPlatforms.size !== expectedPlatforms.size
      || [...expectedPlatforms].some((platform) => !actualPlatforms.has(platform))) {
      throw new Error('EAS update platform set does not match the required platforms.');
    }
  }

  return Object.freeze({
    updateGroupId,
    runtimeVersion: expected.runtimeVersion ?? payload[0].runtimeVersion,
    gitCommitHash: expected.gitCommitHash ?? payload[0].gitCommitHash,
    message: expected.message ?? payload[0].message,
    platforms: [...actualPlatforms].sort(),
    updates: payload.map((update) => Object.freeze({
      id: update.id,
      platform: String(update.platform).toLowerCase(),
      branch: update.branch,
      manifestPermalink: update.manifestPermalink,
    })),
  });
}

const filePath = argument('file');
const githubEnvironmentPath = argument('github-env');
if (!filePath) throw new Error('Missing --file=<eas-update-json>.');
if (!githubEnvironmentPath) throw new Error('Missing --github-env=<path>.');

const payload = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
if (argument('mode') === 'publish-evidence') {
  const updateGroupId = extractEasUpdateGroupId(payload);
  appendFileSync(
    githubEnvironmentPath,
    `STACKR_MOBILE_UPDATE_PUBLISHED=true\nSTACKR_EAS_UPDATE_GROUP_ID=${updateGroupId}\n`,
    'utf8',
  );
  console.log(JSON.stringify({ ok: true, updatePublished: true, updateGroupId }, null, 2));
} else {
  const attestation = attestEasUpdate(payload, {
    runtimeVersion: argument('expected-runtime'),
    gitCommitHash: argument('expected-git-sha'),
    message: argument('expected-message'),
    platforms: argument('expected-platforms'),
  });

  appendFileSync(githubEnvironmentPath, `STACKR_EAS_UPDATE_GROUP_ID=${attestation.updateGroupId}\n`, 'utf8');
  console.log(JSON.stringify({ ok: true, ...attestation }, null, 2));
}
