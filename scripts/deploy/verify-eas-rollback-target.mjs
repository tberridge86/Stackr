import { readFileSync } from 'node:fs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;
const ALLOWED_ENVIRONMENTS = new Set(['staging', 'production']);
const ALLOWED_OPERATIONS = new Set(['mobile-rollout', 'mobile-update']);

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function requireArgument(name) {
  const value = argument(name);
  if (!value) throw new Error(`Missing --${name}=<value>.`);
  return value;
}

function fail(reason) {
  throw new Error(`eas_rollback_target_invalid:${reason}`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireUuid(value, field) {
  if (!UUID_PATTERN.test(String(value ?? ''))) fail(field);
  return String(value);
}

function requireHttps(value, field) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new Error();
  } catch {
    fail(field);
  }
}

function normalizePlatforms(value) {
  const platforms = String(value ?? '')
    .split(',')
    .map((platform) => platform.trim().toLowerCase())
    .filter(Boolean);
  if (platforms.length === 0 || new Set(platforms).size !== platforms.length) {
    fail('expectedPlatforms');
  }
  if (platforms.some((platform) => platform !== 'android' && platform !== 'ios')) {
    fail('expectedPlatforms');
  }
  return new Set(platforms);
}

function requireExactPlatforms(actual, expected, field) {
  if (actual.size !== expected.size || [...expected].some((platform) => !actual.has(platform))) {
    fail(field);
  }
}

function normalizeUpdateView(payload) {
  if (Array.isArray(payload)) return payload;
  if (isRecord(payload) && Array.isArray(payload.updates)) return payload.updates;
  fail('updateViewPayload');
}

function normalizeChannelView(payload) {
  if (!isRecord(payload) || !isRecord(payload.currentPage)) fail('channelViewPayload');
  return payload.currentPage;
}

function normalizeProjectBranchView(payload) {
  if (!isRecord(payload) || !Array.isArray(payload.currentPage)) fail('projectBranchViewPayload');
  return payload;
}

function parseBranchMapping(value) {
  try {
    const mapping = typeof value === 'string' ? JSON.parse(value) : value;
    if (!isRecord(mapping) || !Array.isArray(mapping.data) || mapping.data.length === 0) throw new Error();
    return mapping;
  } catch {
    fail('channelBranchMapping');
  }
}

export function verifyEasRollbackTarget(updatePayload, channelPayload, projectBranchPayload, expected) {
  const expectedEnvironment = String(expected.environment ?? '').trim();
  const expectedChannel = String(expected.channel ?? '').trim();
  const expectedRuntime = String(expected.runtimeVersion ?? '').trim();
  const expectedOperation = String(expected.operation ?? '').trim();
  const expectedGroup = requireUuid(expected.groupId, 'expectedGroup');
  const expectedPlatforms = normalizePlatforms(expected.platforms);

  if (!ALLOWED_ENVIRONMENTS.has(expectedEnvironment)) fail('environment');
  if (!ALLOWED_OPERATIONS.has(expectedOperation)) fail('operation');
  if (expectedChannel !== expectedEnvironment) fail('environmentChannelBinding');
  if (!expectedRuntime) fail('expectedRuntime');

  const updates = normalizeUpdateView(updatePayload);
  if (updates.length === 0) fail('updatesMissing');
  const actualPlatforms = new Set();
  const manifestPermalinks = new Set();
  let branchName = null;
  let gitCommitHash = null;

  for (const update of updates) {
    if (!isRecord(update)) fail('updateEntry');
    requireUuid(update.id, 'updateId');
    if (requireUuid(update.group, 'updateGroup') !== expectedGroup) fail('groupMismatch');
    if (update.runtimeVersion !== expectedRuntime) fail('runtimeMismatch');
    if (update.branch !== expectedEnvironment || update.branch !== expectedChannel) fail('branchMismatch');
    if (branchName !== null && branchName !== update.branch) fail('mixedBranches');
    branchName = update.branch;

    const platform = String(update.platform ?? '').trim().toLowerCase();
    if (!expectedPlatforms.has(platform) || actualPlatforms.has(platform)) fail('platforms');
    actualPlatforms.add(platform);
    if (update.isRollBackToEmbedded !== false) fail('rollbackToEmbedded');
    const updateGitCommitHash = String(update.gitCommitHash ?? '').toLowerCase();
    if (!GIT_SHA_PATTERN.test(updateGitCommitHash)) fail('gitCommitHash');
    if (gitCommitHash !== null && gitCommitHash !== updateGitCommitHash) fail('mixedGitCommitHash');
    gitCommitHash = updateGitCommitHash;
    requireHttps(update.manifestPermalink, `manifestPermalink:${platform}`);
    if (manifestPermalinks.has(update.manifestPermalink)) fail('manifestPermalinkDuplicate');
    manifestPermalinks.add(update.manifestPermalink);
  }
  requireExactPlatforms(actualPlatforms, expectedPlatforms, 'platforms');

  const channel = normalizeChannelView(channelPayload);
  requireUuid(channel.id, 'channelId');
  if (channel.name !== expectedChannel) fail('channelName');
  if (channel.isPaused !== false) fail('channelPaused');
  if (!Array.isArray(channel.updateBranches)) fail('channelBranches');
  const matchingBranches = channel.updateBranches.filter((branch) => isRecord(branch) && branch.name === branchName);
  if (matchingBranches.length !== 1) fail('channelBranchMembership');
  const channelBranchId = requireUuid(matchingBranches[0].id, 'channelBranchId');
  const branchMapping = parseBranchMapping(channel.branchMapping);
  if (branchMapping.version !== 0
    || branchMapping.data.length !== 1
    || !isRecord(branchMapping.data[0])
    || branchMapping.data[0].branchId !== channelBranchId
    || branchMapping.data[0].branchMappingLogic !== 'true') {
    fail('channelBranchMapping');
  }

  const projectBranch = normalizeProjectBranchView(projectBranchPayload);
  if (projectBranch.name !== branchName) fail('projectBranchName');
  if (requireUuid(projectBranch.id, 'projectBranchId') !== channelBranchId) fail('projectBranchIdMismatch');
  const projectGroups = projectBranch.currentPage.filter((group) => isRecord(group) && group.group === expectedGroup);
  if (projectGroups.length !== 1) fail('projectGroupMembership');
  const projectGroup = projectGroups[0];
  if (projectGroup.branch !== branchName) fail('projectGroupBranch');
  if (projectGroup.runtimeVersion !== expectedRuntime) fail('projectGroupRuntime');
  requireExactPlatforms(normalizePlatforms(projectGroup.platforms), expectedPlatforms, 'projectGroupPlatforms');
  const rolloutPercentage = projectGroup.rolloutPercentage;
  if (expectedOperation === 'mobile-update'
    && rolloutPercentage !== undefined
    && rolloutPercentage !== null
    && rolloutPercentage !== 100) {
    fail('activePartialRollout');
  }
  if (expectedOperation === 'mobile-rollout'
    && (typeof rolloutPercentage !== 'number'
      || !Number.isFinite(rolloutPercentage)
      || rolloutPercentage <= 0
      || rolloutPercentage >= 100)) {
    fail('activePartialRolloutRequired');
  }

  return Object.freeze({
    operation: expectedOperation,
    environment: expectedEnvironment,
    channel: expectedChannel,
    branch: branchName,
    branchId: channelBranchId,
    runtimeVersion: expectedRuntime,
    updateGroupId: expectedGroup,
    platforms: [...actualPlatforms].sort(),
    updates: updates.map((update) => Object.freeze({
      id: update.id,
      platform: String(update.platform).toLowerCase(),
      gitCommitHash,
    })),
  });
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
}

function runCli() {
  const attestation = verifyEasRollbackTarget(
    readJson(requireArgument('update-file')),
    readJson(requireArgument('channel-file')),
    readJson(requireArgument('project-branch-file')),
    {
      groupId: requireArgument('expected-group'),
      environment: requireArgument('expected-environment'),
      channel: requireArgument('expected-channel'),
      runtimeVersion: requireArgument('expected-runtime'),
      platforms: requireArgument('expected-platforms'),
      operation: requireArgument('expected-operation'),
    },
  );
  console.log(JSON.stringify({ ok: true, ...attestation }, null, 2));
}

if (process.argv[1]?.endsWith('verify-eas-rollback-target.mjs')) runCli();
