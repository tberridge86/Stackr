import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const baselinePath = path.join(repositoryRoot, 'deploy/approved-environment-baseline.json');
const releaseManifestPath = path.join(repositoryRoot, 'deploy/release-manifest.json');
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
const releaseManifest = JSON.parse(readFileSync(releaseManifestPath, 'utf8'));

const EXPECTED = Object.freeze({
  schemaVersion: 'stackr-approved-environment-baseline-v1.0.0',
  repository: 'tberridge86/Stackr',
  productionRef: 'oakdbbzdqwurpjnoqhmu',
  stagingRef: 'lmwfhvexfcoyeuoyrlco',
  prompt2Commit: 'a869e3a2c0d467b3510ffbc1367544e728dbe0be',
  tag: 'stackr-approved-baseline-2026-08-28',
  productionLedgerMd5: 'b6d0f54ac2523c186e30c08ab0a54d95',
  stagingLedgerMd5: 'b8db5188625d780930a68b4365840fca',
  publishedVersionsMd5: '052ed819af954407ec3700d3a0ea392e',
});

assert.equal(baseline.schemaVersion, EXPECTED.schemaVersion, 'baseline_schema_version_drift');
assert.equal(baseline.status, 'approved', 'baseline_not_approved');
assert.equal(baseline.completionPercent, 100, 'baseline_not_complete');
assert.equal(baseline.approvalBasis, 'owner-requested-production-staging-github-baseline');

assert.equal(baseline.authority.releaseEnvironment, 'production');
assert.equal(baseline.authority.stagingRole, 'quarantined-test-superset');
assert.equal(baseline.authority.versionedRecord, 'github');
assert.equal(baseline.authority.differenceRule, 'every-difference-must-be-explicit');

for (const [rule, value] of Object.entries(baseline.scopeRules)) {
  assert.equal(value, false, `baseline_scope_rule_failed:${rule}`);
}

assert.equal(
  baseline.fingerprintAlgorithms.migrationLedger,
  "md5(string_agg(version || '|' || name, chr(10) order by version, name))",
);
assert.equal(
  baseline.fingerprintAlgorithms.catalogueTable,
  "md5(string_agg(md5(to_jsonb(row)::text), '' order by id::text))",
);
assert.equal(
  baseline.fingerprintAlgorithms.publishedVersions,
  "md5(string_agg(language_code || '|' || id || '|' || version_key, chr(10) order by language_code))",
);

assert.equal(baseline.github.repository, EXPECTED.repository);
assert.equal(baseline.github.defaultBranch, 'main');
assert.equal(baseline.github.requiredPrompt2AncestorCommit, EXPECTED.prompt2Commit);
assert.equal(baseline.github.approvedTag, EXPECTED.tag);

assert.equal(baseline.production.completionPercent, 100);
assert.equal(baseline.staging.completionPercent, 100);
assert.equal(baseline.production.projectRef, EXPECTED.productionRef);
assert.equal(baseline.staging.projectRef, EXPECTED.stagingRef);
assert.equal(baseline.production.role, 'release-authority');
assert.equal(baseline.staging.role, 'quarantined-test-superset');

assert.equal(releaseManifest.environmentBaseline.path, 'deploy/approved-environment-baseline.json');
assert.equal(releaseManifest.environmentBaseline.approvedTag, EXPECTED.tag);
assert.equal(releaseManifest.components.database.projectRef, EXPECTED.productionRef);
assert.equal(releaseManifest.components.database.stagingProjectRef, EXPECTED.stagingRef);

const productionLedger = baseline.production.migrationLedger;
const stagingLedger = baseline.staging.migrationLedger;
const comparison = baseline.migrationComparison;
const stagingOnly = Object.values(comparison.stagingOnlyQuarantined).flat();

assert.equal(productionLedger.rowCount, 110);
assert.equal(productionLedger.uniqueNameCount, 110);
assert.equal(productionLedger.duplicateRowCount, 0);
assert.equal(productionLedger.orderedVersionNameMd5, EXPECTED.productionLedgerMd5);
assert.equal(productionLedger.latestName, 'prompt2_trade_notification_write_containment');
assert.equal(stagingLedger.rowCount, 147);
assert.equal(stagingLedger.uniqueNameCount, 143);
assert.equal(stagingLedger.duplicateRowCount, 4);
assert.equal(stagingLedger.orderedVersionNameMd5, EXPECTED.stagingLedgerMd5);
assert.equal(stagingLedger.latestName, 'prompt2_trade_notification_write_containment');
assert.equal(stagingLedger.duplicateNames.length, stagingLedger.duplicateRowCount);

assert.equal(comparison.sharedUniqueNames + comparison.productionOnly.length,
  productionLedger.uniqueNameCount);
assert.equal(comparison.sharedUniqueNames + stagingOnly.length,
  stagingLedger.uniqueNameCount);
assert.equal(stagingLedger.uniqueNameCount + stagingLedger.duplicateRowCount,
  stagingLedger.rowCount);
assert.equal(new Set(comparison.productionOnly).size, comparison.productionOnly.length);
assert.equal(new Set(stagingOnly).size, stagingOnly.length);
assert.equal(comparison.stagingOnlyPromotionApproved, false);
assert.equal(comparison.unexplainedDifferenceCount, 0);

assert.equal(baseline.cataloguePublication.productionAndStagingMatch, true);
assert.equal(baseline.cataloguePublication.orderedPublishedVersionsMd5,
  EXPECTED.publishedVersionsMd5);
assert.equal(baseline.cataloguePublication.versions.length, 5);
assert.deepEqual(
  baseline.cataloguePublication.versions.map((entry) => entry.languageCode),
  ['en', 'ja', 'ko', 'zh-cn', 'zh-tw'],
);

for (const environment of ['production', 'staging']) {
  const controls = baseline[environment].prompt2Controls;
  assert.equal(controls.profileAuthorityGuard, true, `${environment}_profile_authority_guard_missing`);
  assert.equal(controls.tradeRowGuardCount, 8, `${environment}_trade_row_guard_count_drift`);
  assert.equal(controls.tradeTruncateGuardCount, 8, `${environment}_truncate_guard_count_drift`);
  assert.equal(controls.tradeListingWriteGuard, true, `${environment}_listing_guard_missing`);
  assert.equal(controls.notificationWriteGuard, true, `${environment}_notification_guard_missing`);

  for (const table of ['sets', 'printings', 'variants', 'assets']) {
    const fingerprint = baseline[environment].catalogue[table];
    assert.ok(Number.isInteger(fingerprint.rowCount) && fingerprint.rowCount > 0,
      `${environment}_${table}_row_count_missing`);
    assert.match(fingerprint.rowMd5, /^[0-9a-f]{32}$/,
      `${environment}_${table}_fingerprint_missing`);
  }
}

for (const [relativePath, expectedSha256] of Object.entries(baseline.github.sourceSha256)) {
  const absolutePath = path.resolve(repositoryRoot, relativePath);
  const relative = path.relative(repositoryRoot, absolutePath);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative),
    `baseline_source_outside_repository:${relativePath}`);
  const actualSha256 = createHash('sha256').update(readFileSync(absolutePath)).digest('hex');
  assert.equal(actualSha256, expectedSha256, `baseline_source_drift:${relativePath}`);
}

console.log('Approved environment baseline verified: 100%');
