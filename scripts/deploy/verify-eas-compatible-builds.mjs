import { appendFileSync, readFileSync } from 'node:fs';

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requireArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}=<value>.`);
  return value;
}

function normalizePlatform(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function requireHttps(value, field) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
  } catch {
    throw new Error(`eas_compatible_build_invalid:${field}`);
  }
}

export function verifyCompatibleBuilds(builds, expected) {
  if (!Array.isArray(builds)) throw new Error('eas_compatible_builds_payload_invalid');
  const nowMs = expected.nowMs ?? Date.now();
  if (!Number.isFinite(nowMs)) throw new Error('eas_compatible_builds_now_invalid');
  const requiredPlatforms = new Set(expected.requiredPlatforms);
  if (requiredPlatforms.size === 0) throw new Error('eas_compatible_builds_platforms_missing');
  const selected = new Map();

  for (const build of builds) {
    if (!build || typeof build !== 'object') continue;
    const platform = normalizePlatform(build.platform);
    if (!requiredPlatforms.has(platform)) continue;
    if (!/^[0-9a-f-]{36}$/i.test(String(build.id ?? ''))) {
      throw new Error(`eas_compatible_build_invalid:${platform}:id`);
    }
    if (String(build.status ?? '').toUpperCase() !== 'FINISHED') {
      throw new Error(`eas_compatible_build_invalid:${platform}:status`);
    }
    if (build.channel !== expected.channel) {
      throw new Error(`eas_compatible_build_invalid:${platform}:channel`);
    }
    if (build.runtimeVersion !== expected.runtimeVersion) {
      throw new Error(`eas_compatible_build_invalid:${platform}:runtimeVersion`);
    }
    if (build.buildProfile !== expected.buildProfile) {
      throw new Error(`eas_compatible_build_invalid:${platform}:buildProfile`);
    }
    if (String(build.gitCommitHash ?? '').toLowerCase() !== expected.gitCommitHash.toLowerCase()) {
      throw new Error(`eas_compatible_build_invalid:${platform}:gitCommitHash`);
    }
    requireHttps(build.artifacts?.buildUrl, `${platform}:buildUrl`);
    const completedAt = Date.parse(build.completedAt);
    if (!Number.isFinite(completedAt)) {
      throw new Error(`eas_compatible_build_invalid:${platform}:completedAt`);
    }
    const expirationDate = Date.parse(build.expirationDate);
    if (!Number.isFinite(expirationDate) || expirationDate <= nowMs) {
      throw new Error(`eas_compatible_build_invalid:${platform}:expirationDate`);
    }
    const current = selected.get(platform);
    if (!current || completedAt > Date.parse(current.completedAt)) selected.set(platform, build);
  }

  for (const platform of requiredPlatforms) {
    if (!selected.has(platform)) throw new Error(`eas_compatible_build_missing:${platform}`);
  }

  return Object.freeze(Object.fromEntries(
    [...selected.entries()].map(([platform, build]) => [platform, Object.freeze({
      id: build.id,
      platform,
      runtimeVersion: build.runtimeVersion,
      channel: build.channel,
      gitCommitHash: build.gitCommitHash,
      completedAt: build.completedAt,
      expirationDate: build.expirationDate,
    })]),
  ));
}

function runCli() {
  const filePath = requireArgument('file');
  const expected = {
    runtimeVersion: requireArgument('expected-runtime'),
    channel: requireArgument('expected-channel'),
    buildProfile: requireArgument('expected-profile'),
    gitCommitHash: requireArgument('expected-git-sha'),
    requiredPlatforms: requireArgument('required-platforms')
      .split(',')
      .map((platform) => normalizePlatform(platform))
      .filter(Boolean),
  };
  if (!/^[0-9a-f]{40}$/i.test(expected.gitCommitHash)) {
    throw new Error('eas_compatible_build_git_sha_invalid');
  }
  const payload = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
  const selected = verifyCompatibleBuilds(payload, expected);
  const githubEnvironmentPath = argument('github-env');
  if (githubEnvironmentPath) {
    for (const [platform, build] of Object.entries(selected)) {
      appendFileSync(
        githubEnvironmentPath,
        `STACKR_STAGING_${platform.toUpperCase()}_BUILD_ID=${build.id}\n`,
        'utf8',
      );
    }
  }
  console.log(JSON.stringify({ ok: true, runtimeVersion: expected.runtimeVersion, builds: selected }, null, 2));
}

if (process.argv[1]?.endsWith('verify-eas-compatible-builds.mjs')) runCli();
