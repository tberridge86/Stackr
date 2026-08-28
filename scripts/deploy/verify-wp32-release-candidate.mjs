import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_MANIFEST = path.join(repositoryRoot, 'deploy/wp32-release-candidate.json');
const EXPECTED_SOURCE_COMMIT = 'd80b0f82843710c7eb942f1e97533ea0af77447c';
const EXPECTED_SOURCE_TREE = '2591147dd7b1fe90bd635ebdc4784bf614e168f4';
const EXPECTED_CONTROL_PATHS = Object.freeze([
  '.github/workflows/build-staging-apk.yml',
  '.github/workflows/platform-ci.yml',
  'deploy/evidence/wp32-source-build-2026-08-28.json',
  'deploy/production-runbook.md',
  'deploy/staging-runbook.md',
  'deploy/wp32-release-candidate.json',
  'docs/world-class/READINESS_DASHBOARD.md',
  'docs/world-class/RELEASE_SCOPE.md',
  'docs/world-class/TRACEABILITY_MATRIX.md',
  'docs/product-readiness/GATE_0_EVIDENCE_2026-08-27.md',
  'docs/product-readiness/LAUNCH_SURFACE_REGISTER.md',
  'package.json',
  'scripts/deploy/verify-wp32-release-candidate.mjs',
  'scripts/test-wp32-release-candidate.mjs',
]);
const EXPECTED_PACKAGE_SCRIPTS = Object.freeze({
  'deploy:verify-release-candidate': 'node scripts/deploy/verify-wp32-release-candidate.mjs',
  'test:wp32-release-candidate': 'node scripts/test-wp32-release-candidate.mjs',
});
const STAGING_APK_WORKFLOW_PATH = '.github/workflows/build-staging-apk.yml';
const EXPECTED_STAGING_APK_BUILD_COMMAND =
  'CI=1 npx expo prebuild --platform android --no-install && ' +
  '(cd android && ./gradlew --no-daemon ' +
  '-Dorg.gradle.jvmargs="-Xmx3072m -XX:MaxMetaspaceSize=1536m -Dfile.encoding=UTF-8" ' +
  ':app:assembleRelease)';

const manifestArgument = process.argv.find((argument) => argument.startsWith('--manifest='));
const manifestPath = manifestArgument
  ? path.resolve(process.cwd(), manifestArgument.slice('--manifest='.length))
  : DEFAULT_MANIFEST;
const requireGo = process.argv.includes('--require-go');
const errors = [];

function check(condition, code) {
  if (!condition) errors.push(code);
}

function readJson(filePath, code) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    errors.push(code);
    return {};
  }
}

function git(args) {
  return spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
  });
}

function gitLines(args, code) {
  const result = git(args);
  if (result.status !== 0) {
    errors.push(code);
    return [];
  }
  return result.stdout.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function evidenceExists(relativePath, code) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    errors.push(code);
    return;
  }
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, absolutePath);
  check(relative.length > 0 && !relative.startsWith('..') && !path.isAbsolute(relative),
    `${code}:outside_repository`);
  check(existsSync(absolutePath) && statSync(absolutePath).isFile(), `${code}:${relativePath}`);
}

const manifest = readJson(manifestPath, 'candidate_manifest_invalid');
const releaseManifest = readJson(
  path.join(repositoryRoot, 'deploy/release-manifest.json'),
  'release_manifest_invalid',
);
const baseline = readJson(
  path.join(repositoryRoot, 'deploy/approved-environment-baseline.json'),
  'approved_baseline_invalid',
);
const packageConfig = readJson(path.join(repositoryRoot, 'package.json'), 'package_json_invalid');
const appConfig = readJson(path.join(repositoryRoot, 'app.json'), 'app_json_invalid');
const easConfig = readJson(path.join(repositoryRoot, 'eas.json'), 'eas_json_invalid');
const buildEvidence = readJson(
  path.join(repositoryRoot, 'deploy/evidence/wp32-source-build-2026-08-28.json'),
  'source_build_evidence_invalid',
);
const stagingApkWorkflow = existsSync(path.join(repositoryRoot, STAGING_APK_WORKFLOW_PATH))
  ? readFileSync(path.join(repositoryRoot, STAGING_APK_WORKFLOW_PATH), 'utf8')
  : '';

check(manifest.schemaVersion === 'stackr-wp32-release-candidate-v1.0.0',
  'candidate_schema_version_drift');
check(manifest.workPackage?.id === 'WP32', 'work_package_id_drift');
check(manifest.workPackage?.decision === manifest.decision?.status, 'decision_status_mismatch');

const interactions = manifest.workPackage?.interactions ?? {};
check(interactions['096']?.completionPercent === 75, 'interaction_096_completion_drift');
check(interactions['097']?.completionPercent === 0, 'interaction_097_completion_drift');
check(interactions['098']?.completionPercent === 0, 'interaction_098_completion_drift');
const weightedCompletion = Object.values(interactions).reduce((total, interaction) => (
  total + (interaction.completionPercent * interaction.weightNumerator / interaction.weightDenominator)
), 0);
check(Number.isFinite(weightedCompletion) && Math.abs(weightedCompletion - 25) < 0.000001,
  'wp32_weighted_completion_drift');
check(manifest.workPackage?.completionPercent === weightedCompletion, 'wp32_completion_mismatch');

const candidate = manifest.candidate ?? {};
check(candidate.id === 'stackr-1.0.3-rc.0', 'candidate_id_drift');
check(candidate.source?.repository === 'tberridge86/Stackr', 'candidate_repository_drift');
check(candidate.source?.branch === 'main', 'candidate_branch_drift');
check(candidate.source?.commit === EXPECTED_SOURCE_COMMIT, 'candidate_commit_drift');
check(candidate.source?.tree === EXPECTED_SOURCE_TREE, 'candidate_tree_drift');
check(candidate.source?.mainCi?.status === 'pass', 'candidate_main_ci_not_passed');
check(candidate.source?.mainCi?.jobsPassed === 7 && candidate.source?.mainCi?.jobsTotal === 7,
  'candidate_main_ci_job_count_drift');
check(candidate.source?.mainCi?.url ===
  `https://github.com/tberridge86/Stackr/commit/${EXPECTED_SOURCE_COMMIT}/checks`,
  'candidate_main_ci_url_drift');

const commitCheck = git(['cat-file', '-e', `${EXPECTED_SOURCE_COMMIT}^{commit}`]);
check(commitCheck.status === 0, 'candidate_commit_missing');
const treeCheck = git(['rev-parse', `${EXPECTED_SOURCE_COMMIT}^{tree}`]);
check(treeCheck.status === 0 && treeCheck.stdout.trim() === EXPECTED_SOURCE_TREE,
  'candidate_git_tree_mismatch');
const ancestorCheck = git(['merge-base', '--is-ancestor', EXPECTED_SOURCE_COMMIT, 'HEAD']);
check(ancestorCheck.status === 0, 'candidate_commit_not_ancestor');

check(candidate.version?.package === packageConfig.version, 'candidate_package_version_mismatch');
check(candidate.version?.expo === appConfig.expo?.version, 'candidate_expo_version_mismatch');
check(candidate.version?.androidVersionCode === appConfig.expo?.android?.versionCode,
  'candidate_android_version_code_mismatch');
check(candidate.version?.runtimePolicy === appConfig.expo?.runtimeVersion?.policy,
  'candidate_runtime_policy_mismatch');
check(candidate.target?.environment === 'staging', 'candidate_target_environment_drift');
check(candidate.target?.easProfile === 'staging', 'candidate_eas_profile_drift');
check(candidate.target?.channel === easConfig.build?.staging?.channel,
  'candidate_staging_channel_mismatch');
check(candidate.target?.distribution === easConfig.build?.staging?.distribution,
  'candidate_distribution_mismatch');
check(easConfig.build?.staging?.android?.buildType === 'apk', 'candidate_staging_apk_config_missing');

check(candidate.sourceBuild?.status === 'pass', 'candidate_source_build_not_passed');
check(candidate.sourceBuild?.evidencePath === 'deploy/evidence/wp32-source-build-2026-08-28.json',
  'candidate_source_build_evidence_drift');
check(buildEvidence.schemaVersion === 'stackr-wp32-source-build-evidence-v1.0.0',
  'source_build_schema_drift');
check(buildEvidence.candidateId === candidate.id, 'source_build_candidate_mismatch');
check(buildEvidence.sourceCommit === EXPECTED_SOURCE_COMMIT, 'source_build_commit_mismatch');
check(buildEvidence.sourceTree === EXPECTED_SOURCE_TREE, 'source_build_tree_mismatch');
check(buildEvidence.command === 'npm run build:web' && buildEvidence.exitCode === 0,
  'source_build_command_failed');
check(buildEvidence.classification === 'web_export_smoke_only', 'source_build_classification_drift');
check(Number.isInteger(buildEvidence.fileCount) && buildEvidence.fileCount > 0,
  'source_build_file_count_missing');
check(Number.isInteger(buildEvidence.totalBytes) && buildEvidence.totalBytes > 0,
  'source_build_byte_count_missing');
check(/^[0-9a-f]{64}$/u.test(buildEvidence.contentManifestSha256 ?? ''),
  'source_build_digest_missing');
check(buildEvidence.secretScan?.passed === true, 'source_build_secret_scan_not_passed');
check(candidate.mobileBinary?.workflowPath === STAGING_APK_WORKFLOW_PATH,
  'mobile_binary_workflow_path_drift');
check(candidate.mobileBinary?.buildProvider === 'github_actions_local_android',
  'mobile_binary_build_provider_drift');
check(candidate.mobileBinary?.signing === 'expo_generated_debug_keystore_internal_staging_only',
  'mobile_binary_signing_classification_drift');
check(candidate.mobileBinary?.buildCommand === EXPECTED_STAGING_APK_BUILD_COMMAND,
  'mobile_binary_build_command_drift');
check(candidate.mobileBinary?.status === 'not_built', 'mobile_binary_status_must_remain_blocked');
check(candidate.mobileBinary?.buildId === null, 'mobile_binary_build_id_must_be_null');
check(candidate.mobileBinary?.artifactUrl === null, 'mobile_binary_url_must_be_null');
check(candidate.mobileBinary?.sha256 === null, 'mobile_binary_sha_must_be_null');

check(stagingApkWorkflow.length > 0, 'staging_apk_workflow_missing');
check(/name:\s*Build Stackr Staging APK/u.test(stagingApkWorkflow),
  'staging_apk_workflow_name_drift');
check(/workflow_dispatch:\s*\n/u.test(stagingApkWorkflow),
  'staging_apk_manual_trigger_missing');
check(/push:\s*\n\s+branches:\s*\[main\]\s*\n\s+paths:\s*\n\s+- \.github\/workflows\/build-staging-apk\.yml/u
  .test(stagingApkWorkflow), 'staging_apk_bootstrap_trigger_drift');
check(!/pull_request:/u.test(stagingApkWorkflow), 'staging_apk_pull_request_trigger_forbidden');
check(/permissions:\s*\n\s+contents:\s*read/u.test(stagingApkWorkflow),
  'staging_apk_permissions_drift');
check(/if:\s*github\.ref == 'refs\/heads\/main'/u.test(stagingApkWorkflow),
  'staging_apk_main_ref_guard_missing');
check(/environment:\s*staging/u.test(stagingApkWorkflow),
  'staging_apk_environment_guard_missing');
const stagingApkSecretReferences = sorted([
  ...stagingApkWorkflow.matchAll(/secrets\.([A-Z0-9_]+)/gu),
].map((match) => match[1]));
check(stagingApkSecretReferences.length === 0, 'staging_apk_secret_reference_forbidden');
check(/CI=1 npx expo prebuild --platform android --no-install/u.test(stagingApkWorkflow),
  'staging_apk_prebuild_command_missing');
check(/\.\/gradlew --no-daemon[\s\S]*-Xmx3072m[\s\S]*-XX:MaxMetaspaceSize=1536m[\s\S]*:app:assembleRelease/u
  .test(stagingApkWorkflow),
  'staging_apk_gradle_command_missing');
check(/'expo-channel-name': 'staging'/u.test(stagingApkWorkflow),
  'staging_apk_update_channel_isolation_missing');
check(/aapt" dump badging/u.test(stagingApkWorkflow),
  'staging_apk_package_attestation_missing');
check(/apksigner" verify --verbose --print-certs/u.test(stagingApkWorkflow),
  'staging_apk_signature_attestation_missing');
check(/zipalign" -c -P 16 4/u.test(stagingApkWorkflow),
  'staging_apk_alignment_attestation_missing');
check(/unzip -tq/u.test(stagingApkWorkflow), 'staging_apk_archive_validation_missing');
check(/sha256sum/u.test(stagingApkWorkflow), 'staging_apk_checksum_missing');
check(/actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/u
  .test(stagingApkWorkflow), 'staging_apk_artifact_upload_drift');
for (const [name, pattern] of [
  ['catalogue', /\bcatalogue\b/iu],
  ['database_push', /\bdb\s+push\b/iu],
  ['eas_service', /eas-cli@|EXPO_TOKEN|build:view|verify-eas-compatible-builds/iu],
  ['migration', /\bmigrations?\b/iu],
  ['railway', /\brailway\b/iu],
  ['supabase', /\bsupabase\b/iu],
  ['wrangler', /\bwrangler\b/iu],
  ['other_platform', /--platform\s+(?:all|ios)\b/iu],
]) check(!pattern.test(stagingApkWorkflow), `staging_apk_forbidden_operation:${name}`);

const scopeFreeze = manifest.scopeFreeze ?? {};
check(scopeFreeze.status === 'active', 'scope_freeze_not_active');
for (const field of [
  'catalogueChangesAllowed',
  'newFeaturesAllowed',
  'catalogueChangesMade',
  'newFeaturesAdded',
]) check(scopeFreeze[field] === false, `scope_freeze_rule_failed:${field}`);
check(Array.isArray(scopeFreeze.productDeltaFiles) && scopeFreeze.productDeltaFiles.length === 0,
  'candidate_product_delta_not_empty');
check(isDeepStrictEqual(sorted(scopeFreeze.controlOnlyPaths ?? []), sorted(EXPECTED_CONTROL_PATHS)),
  'control_path_allowlist_drift');
check(scopeFreeze.ownerApproval?.commitAllowed === scopeFreeze.ownerApproval?.ownerApproved,
  'owner_approval_commit_rule_mismatch');
if (scopeFreeze.ownerApproval?.ownerApproved === false) {
  check(scopeFreeze.ownerApproval?.approvalRecordedAt === null, 'unapproved_packet_has_approval_date');
} else if (scopeFreeze.ownerApproval?.ownerApproved === true) {
  check(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(
    scopeFreeze.ownerApproval?.approvalRecordedAt ?? '',
  ), 'approved_packet_missing_approval_date');
}

const changedPaths = new Set([
  ...gitLines(['diff', '--name-only', `${EXPECTED_SOURCE_COMMIT}...HEAD`], 'candidate_committed_diff_unreadable'),
  ...gitLines(['diff', '--name-only'], 'candidate_worktree_diff_unreadable'),
  ...gitLines(['diff', '--name-only', '--cached'], 'candidate_index_diff_unreadable'),
  ...gitLines(['ls-files', '--others', '--exclude-standard'], 'candidate_untracked_files_unreadable'),
]);
for (const changedPath of changedPaths) {
  check(EXPECTED_CONTROL_PATHS.includes(changedPath), `scope_freeze_unapproved_path:${changedPath}`);
}

const basePackageResult = git(['show', `${EXPECTED_SOURCE_COMMIT}:package.json`]);
if (basePackageResult.status !== 0) {
  errors.push('candidate_base_package_unreadable');
} else {
  const basePackage = JSON.parse(basePackageResult.stdout);
  for (const [name, command] of Object.entries(EXPECTED_PACKAGE_SCRIPTS)) {
    check(packageConfig.scripts?.[name] === command, `wp32_package_script_drift:${name}`);
  }
  const packageWithoutWp32Scripts = structuredClone(packageConfig);
  for (const name of Object.keys(EXPECTED_PACKAGE_SCRIPTS)) delete packageWithoutWp32Scripts.scripts[name];
  check(isDeepStrictEqual(packageWithoutWp32Scripts, basePackage), 'package_product_delta_detected');
}

check(baseline.status === 'approved' && baseline.completionPercent === 100,
  'approved_baseline_not_complete');
check(baseline.scopeRules?.catalogueChangesMade === false, 'baseline_catalogue_change_detected');
check(baseline.scopeRules?.newFeaturesAdded === false, 'baseline_feature_change_detected');
check(baseline.migrationComparison?.unexplainedDifferenceCount === 0,
  'baseline_unexplained_environment_difference');
check(manifest.metrics?.unexplainedEnvironmentDifferenceCount ===
  baseline.migrationComparison?.unexplainedDifferenceCount,
  'candidate_environment_difference_metric_drift');

const baselineVerifier = spawnSync(
  process.execPath,
  ['scripts/deploy/verify-approved-environment-baseline.mjs'],
  { cwd: repositoryRoot, encoding: 'utf8' },
);
check(baselineVerifier.status === 0, 'approved_environment_baseline_verifier_failed');

check(easConfig.build?.staging?.env?.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED === 'false',
  'staging_commerce_release_lock_open');
check(easConfig.build?.production?.env?.EXPO_PUBLIC_PREMIUM_SELLER_MODE_ENABLED === 'false',
  'production_commerce_release_lock_open');

const expectedGateStatuses = new Map([
  ['approved_environment_baseline', 'pass'],
  ['source_scope_freeze', 'pass'],
  ['candidate_main_ci', 'pass'],
  ['migration_history_aligned', releaseManifest.releaseGates?.migrationHistoryAligned ? 'pass' : 'blocked'],
  ['storage_backup_verified', releaseManifest.releaseGates?.storageBackupVerified ? 'pass' : 'blocked'],
  ['commerce_release_lock', 'pass'],
  ['active_model_selected', releaseManifest.releaseGates?.activeModelSelected ? 'pass' : 'blocked'],
  ['active_index_validated', releaseManifest.releaseGates?.activeIndexValidated ? 'pass' : 'blocked'],
  ['mobile_candidate_binary', candidate.mobileBinary?.status === 'built' ? 'pass' : 'blocked'],
  ['integrated_real_user_pilot', interactions['097']?.completionPercent === 100 ? 'pass' : 'blocked'],
]);
const releaseGates = manifest.releaseGates ?? [];
check(isDeepStrictEqual(sorted(releaseGates.map((gate) => gate.id)), sorted(expectedGateStatuses.keys())),
  'release_gate_set_drift');
for (const gate of releaseGates) {
  check(gate.critical === true, `release_gate_not_critical:${gate.id}`);
  check(gate.status === expectedGateStatuses.get(gate.id), `release_gate_status_mismatch:${gate.id}`);
  check(typeof gate.ownerRole === 'string' && gate.ownerRole.length > 0,
    `release_gate_owner_missing:${gate.id}`);
  check(Array.isArray(gate.evidencePaths) && gate.evidencePaths.length > 0,
    `release_gate_evidence_missing:${gate.id}`);
  for (const evidencePath of gate.evidencePaths ?? []) {
    evidenceExists(evidencePath, `release_gate_evidence_invalid:${gate.id}`);
  }
}

const criteria = manifest.acceptanceCriteria ?? [];
check(criteria.length === 12, 'critical_criterion_count_drift');
check(new Set(criteria.map((criterion) => criterion.id)).size === criteria.length,
  'duplicate_critical_criterion');
for (const criterion of criteria) {
  check(['pass', 'blocked', 'not_applicable'].includes(criterion.status),
    `critical_criterion_status_invalid:${criterion.id}`);
  check(Array.isArray(criterion.evidencePaths) && criterion.evidencePaths.length > 0,
    `critical_criterion_missing_evidence:${criterion.id}`);
  for (const evidencePath of criterion.evidencePaths ?? []) {
    evidenceExists(evidencePath, `critical_criterion_evidence_invalid:${criterion.id}`);
  }
}

const blockerIds = sorted((manifest.decision?.blockers ?? []).map((blocker) => blocker.id));
const blockedCriticalGateIds = sorted(releaseGates
  .filter((gate) => gate.critical && gate.status === 'blocked')
  .map((gate) => gate.id));
check(isDeepStrictEqual(blockerIds, blockedCriticalGateIds), 'release_blocker_gate_mismatch');
for (const blocker of manifest.decision?.blockers ?? []) {
  check(blocker.severity === 'release_blocking', `blocker_severity_drift:${blocker.id}`);
  check(typeof blocker.ownerRole === 'string' && blocker.ownerRole.length > 0,
    `blocker_owner_missing:${blocker.id}`);
  check(typeof blocker.dueGate === 'string' && blocker.dueGate.length > 0,
    `blocker_due_gate_missing:${blocker.id}`);
  check(typeof blocker.exitCriteria === 'string' && blocker.exitCriteria.length > 0,
    `blocker_exit_criteria_missing:${blocker.id}`);
}
check(Array.isArray(manifest.decision?.silentWaivers) && manifest.decision.silentWaivers.length === 0,
  'silent_release_waiver_detected');
check(Array.isArray(manifest.decision?.conditionalGoItems), 'conditional_go_items_invalid');

const statusCounts = criteria.reduce((counts, criterion) => {
  counts[criterion.status] = (counts[criterion.status] ?? 0) + 1;
  return counts;
}, {});
check(manifest.metrics?.criticalCriterionCount === criteria.length, 'critical_criterion_metric_drift');
check(manifest.metrics?.criticalCriteriaWithEvidenceCount ===
  criteria.filter((criterion) => criterion.evidencePaths?.length > 0).length,
  'critical_evidence_metric_drift');
check(manifest.metrics?.criticalCriteriaPassCount === (statusCounts.pass ?? 0),
  'critical_pass_metric_drift');
check(manifest.metrics?.criticalCriteriaBlockedCount === (statusCounts.blocked ?? 0),
  'critical_blocked_metric_drift');
check(manifest.metrics?.criticalCriteriaNotApplicableCount === (statusCounts.not_applicable ?? 0),
  'critical_not_applicable_metric_drift');
check(manifest.metrics?.releaseGateCount === releaseGates.length, 'release_gate_metric_drift');
check(manifest.metrics?.releaseGatePassCount === releaseGates.filter((gate) => gate.status === 'pass').length,
  'release_gate_pass_metric_drift');
check(manifest.metrics?.releaseGateBlockedCount === blockedCriticalGateIds.length,
  'release_gate_blocked_metric_drift');
check(manifest.metrics?.releaseBlockingIssueCount === blockerIds.length,
  'release_blocker_metric_drift');
check(manifest.metrics?.silentWaiverCount === manifest.decision?.silentWaivers?.length,
  'silent_waiver_metric_drift');

if (manifest.decision?.status === 'GO') {
  check(blockerIds.length === 0, 'go_with_open_blockers');
  check(blockedCriticalGateIds.length === 0, 'go_with_blocked_critical_gate');
  check(candidate.mobileBinary?.status === 'built', 'go_without_mobile_binary');
  check(interactions['097']?.completionPercent === 100, 'go_without_integrated_pilot');
  check(interactions['098']?.completionPercent === 100, 'go_without_final_triage');
  check(manifest.decision?.finalApproval !== null, 'go_without_final_approval');
} else {
  check(manifest.decision?.status === 'NO_GO', 'release_decision_invalid');
  check(blockerIds.length > 0, 'no_go_without_recorded_blocker');
  check(manifest.decision?.finalApproval === null, 'no_go_with_final_approval');
}
if (requireGo) check(manifest.decision?.status === 'GO', 'wp32_release_candidate_not_go');

const result = {
  ok: errors.length === 0,
  workPackage: 'WP32',
  completionPercent: manifest.workPackage?.completionPercent ?? null,
  interactions: Object.fromEntries(Object.entries(interactions).map(([id, value]) => [
    id,
    value.completionPercent,
  ])),
  decision: manifest.decision?.status ?? null,
  releaseGatesPassed: releaseGates.filter((gate) => gate.status === 'pass').length,
  releaseGatesTotal: releaseGates.length,
  blockers: blockerIds,
  errors: [...new Set(errors)],
};

console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
