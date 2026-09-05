import { readFileSync } from 'node:fs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requireArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}=<value>.`);
  return value;
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`eas_update_insights_invalid:${field}`);
  }
  return value;
}

function requirePercentage(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new Error(`eas_update_insights_invalid:${field}`);
  }
  return value;
}

function parseThreshold(value, field) {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value ?? ''))) {
    throw new Error(`eas_update_insights_invalid:${field}`);
  }
  return requireNonNegativeInteger(Number(value), field);
}

function parsePercentageThreshold(value, field) {
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(String(value ?? ''))) {
    throw new Error(`eas_update_insights_invalid:${field}`);
  }
  return requirePercentage(Number(value), field);
}

function normalizePlatforms(value) {
  const platforms = String(value ?? '')
    .split(',')
    .map((platform) => platform.trim().toLowerCase())
    .filter(Boolean);
  if (platforms.length === 0 || new Set(platforms).size !== platforms.length) {
    throw new Error('eas_update_insights_invalid:requiredPlatforms');
  }
  return new Set(platforms);
}

export function verifyEasUpdateInsights(payload, expected) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('eas_update_insights_invalid:payload');
  }
  if (!UUID_PATTERN.test(String(payload.groupId ?? '')) || payload.groupId !== expected.groupId) {
    throw new Error('eas_update_insights_invalid:groupId');
  }
  if (!Array.isArray(payload.platforms)) {
    throw new Error('eas_update_insights_invalid:platforms');
  }

  const requiredPlatforms = normalizePlatforms(expected.platforms);
  const actualPlatforms = new Set();
  let launches = 0;
  let failedLaunches = 0;
  let uniqueUsers = 0;

  for (const entry of payload.platforms) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new Error('eas_update_insights_invalid:platformEntry');
    }
    const platform = String(entry.platform ?? '').trim().toLowerCase();
    if (!requiredPlatforms.has(platform) || actualPlatforms.has(platform)) {
      throw new Error('eas_update_insights_invalid:platforms');
    }
    actualPlatforms.add(platform);
    if (!UUID_PATTERN.test(String(entry.updateId ?? ''))) {
      throw new Error(`eas_update_insights_invalid:${platform}:updateId`);
    }
    const totals = entry.totals;
    if (!totals || typeof totals !== 'object' || Array.isArray(totals)) {
      throw new Error(`eas_update_insights_invalid:${platform}:totals`);
    }
    launches += requireNonNegativeInteger(totals.installs, `${platform}:launches`);
    failedLaunches += requireNonNegativeInteger(totals.failedInstalls, `${platform}:failedLaunches`);
    uniqueUsers += requireNonNegativeInteger(totals.uniqueUsers, `${platform}:uniqueUsers`);
    const crashRatePercent = requirePercentage(totals.crashRatePercent, `${platform}:crashRatePercent`);
    if (crashRatePercent > expected.maxCrashRatePercent) {
      throw new Error(`eas_update_insights_unhealthy:${platform}:crashRatePercent`);
    }
  }

  if (actualPlatforms.size !== requiredPlatforms.size) {
    throw new Error('eas_update_insights_invalid:platforms');
  }
  if (failedLaunches > expected.maxFailedLaunches) {
    throw new Error('eas_update_insights_unhealthy:failedLaunches');
  }

  const healthy = launches >= expected.minLaunches && uniqueUsers >= expected.minUniqueUsers;
  if (!healthy && !expected.allowPendingAdoption) {
    throw new Error('eas_update_insights_adoption_insufficient');
  }
  return Object.freeze({
    ok: healthy,
    healthy,
    pendingAdoption: !healthy,
    groupId: payload.groupId,
    platforms: [...actualPlatforms].sort(),
    totals: Object.freeze({ launches, failedLaunches, uniqueUsers }),
    thresholds: Object.freeze({
      minLaunches: expected.minLaunches,
      minUniqueUsers: expected.minUniqueUsers,
      maxFailedLaunches: expected.maxFailedLaunches,
      maxCrashRatePercent: expected.maxCrashRatePercent,
    }),
  });
}

function runCli() {
  const filePath = requireArgument('file');
  const payload = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  const result = verifyEasUpdateInsights(payload, {
    groupId: requireArgument('expected-group'),
    platforms: requireArgument('required-platforms'),
    minLaunches: parseThreshold(requireArgument('min-launches'), 'minLaunches'),
    minUniqueUsers: parseThreshold(requireArgument('min-unique-users'), 'minUniqueUsers'),
    maxFailedLaunches: parseThreshold(requireArgument('max-failed-launches'), 'maxFailedLaunches'),
    maxCrashRatePercent: parsePercentageThreshold(
      requireArgument('max-crash-rate-percent'),
      'maxCrashRatePercent',
    ),
    allowPendingAdoption: process.argv.includes('--allow-pending-adoption'),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1]?.endsWith('verify-eas-update-insights.mjs')) runCli();
