import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildCatalogueLogoTransactions, changedCanonicalAssets, preservedOriginalLogoEligibilitySql, PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL, PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL, CANONICAL_LOGO_IDENTITY_MATCH_SQL } from './prepare-reviewed-set-logo-catalogue-publication.mjs';
import { reviewedLogoEligibilityFixtureSql, reviewedLogoMembershipFixtureSql, reviewedLogoIdentityFixtureSql, reviewedLogoPlPgSqlScopeFixtureSql } from './fixtures/reviewed-set-logo-eligibility.mjs';

const fixture = () => ({
  plan: { canonicalAssets: [{ setId: 'set-one', logoId: 'logo-one', language: 'ja', versions: ['version-one'], assetId: 'new-asset', sha256: 'new-hash' }] },
  before: { links: [{ setId: 'set-one', versionId: 'version-one', assetIdentifier: 'old-asset', contentSha256: 'old-hash', rightsStatus: 'approved', permissionStatus: 'approved' }] },
  baseline: { logos: [{ canonicalSetId: 'set-one', logoId: 'logo-one', language: 'ja' }] },
});

test('only changed approved canonical deliveries enter a replacement transaction', () => {
  const f = fixture();
  assert.deepEqual(changedCanonicalAssets(f.plan, f.before, f.baseline), f.plan.canonicalAssets);
  f.before.links[0].assetIdentifier = 'new-asset';
  f.before.links[0].contentSha256 = 'new-hash';
  assert.deepEqual(changedCanonicalAssets(f.plan, f.before, f.baseline), []);
});

test('canonical identity, language, prior permission and version changes fail closed', () => {
  for (const change of [
    f => { f.baseline.logos[0].language = 'zh-cn'; },
    f => { f.baseline.logos[0].logoId = 'other-logo'; },
    f => { f.before.links = []; },
    f => { f.before.links[0].rightsStatus = 'under_review'; },
    f => { f.before.links[0].permissionStatus = 'denied'; },
    f => { f.before.links[0].versionId = 'other-version'; },
    f => { f.before.links.push({ ...f.before.links[0] }); },
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() => changedCanonicalAssets(f.plan, f.before, f.baseline));
  }
});

test('publication and rollback acquire write-conflicting asset locks before eligibility or membership changes', () => {
  const f = fixture();
  f.plan.projectRef = 'fixture';
  f.plan.bucket = 'stackr-catalogue-public';
  const sql = buildCatalogueLogoTransactions({ plan: f.plan, changed: f.plan.canonicalAssets, original: f.before.links, sourceId: 'source-fixture' });
  for (const query of Object.values(sql)) {
    const assetLock = query.indexOf('lock table catalog.assets in share row exclusive mode;');
    const membershipLock = query.indexOf('lock table catalog.catalogue_version_assets in share row exclusive mode;');
    const eligibility = query.indexOf(PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL);
    const deletion = query.indexOf('delete from catalog.catalogue_version_assets');
    assert.ok(assetLock > query.indexOf('begin;') && assetLock < membershipLock);
    assert.ok(membershipLock < eligibility && eligibility < deletion);
  }
});

test('a canonical transaction refuses two set-specific rows sharing the legacy unique storage identity', () => {
  const f = fixture();
  f.plan.canonicalAssets[0].storageKey = 'shared-framed-object';
  f.plan.canonicalAssets.push({ ...f.plan.canonicalAssets[0], setId: 'set-two', assetId: 'other-asset' });
  assert.throws(() => buildCatalogueLogoTransactions({ plan: f.plan, changed: f.plan.canonicalAssets, original: f.before.links,
    sourceId: 'source-fixture' }), /cannot share an immutable storage object/);
});

test('explicit legacy null identifiers preserve exact identity without accepting absent evidence', () => {
  assert.equal(preservedOriginalLogoEligibilitySql([{assetIdentifier:'approved'}]), PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL);
  assert.throws(() => preservedOriginalLogoEligibilitySql([{}]), /explicitly present/);
  assert.throws(() => preservedOriginalLogoEligibilitySql([{assetIdentifier:undefined}]), /explicitly present/);
  const f=fixture();
  const unlinked={...f.before.links[0],assetId:'legacy-unlinked',assetIdentifier:null};
  const sql=buildCatalogueLogoTransactions({plan:f.plan,changed:f.plan.canonicalAssets,original:f.before.links,
    localApprovalSources:[...f.before.links,unlinked],sourceId:'source'});
  assert.ok(sql.publication.includes("original_row.item ? 'assetIdentifier' and a.asset_id is not distinct from original_row.item->>'assetIdentifier'"));
  assert.ok(sql.rollback.includes(PRESERVED_ORIGINAL_LOGO_ELIGIBILITY_SQL));
  assert.ok(!sql.rollback.includes('is not distinct from'));
});

test('complete published membership is checked under locks before any asset or membership mutation', () => {
  const f = fixture();
  const sql = buildCatalogueLogoTransactions({ plan: f.plan, changed: f.plan.canonicalAssets, original: f.before.links, sourceId: 'source-fixture' });
  for (const query of Object.values(sql)) {
    const guard = query.indexOf(PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL);
    assert.ok(guard > query.indexOf('lock table catalog.sets, catalog.catalogue_versions, catalog.catalogue_version_sets in share mode;'));
    assert.ok(guard < query.indexOf('delete from catalog.catalogue_version_assets'));
  }
  assert.ok(sql.publication.indexOf(PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL) < sql.publication.indexOf('insert into catalog.assets'));
  assert.ok(reviewedLogoMembershipFixtureSql().includes('extra_published_version_without_logo'));
});

test('rollback and publication protect current canonical language, game and nondeprecated identity', () => {
  const f = fixture();
  const sql = buildCatalogueLogoTransactions({ plan: f.plan, changed: f.plan.canonicalAssets, original: f.before.links, sourceId: 'source-fixture' });
  for (const query of Object.values(sql)) {
    const identity = query.indexOf(CANONICAL_LOGO_IDENTITY_MATCH_SQL);
    assert.ok(identity > query.indexOf('lock table catalog.sets, catalog.catalogue_versions, catalog.catalogue_version_sets in share mode;'));
    assert.ok(identity < query.indexOf(PUBLISHED_LOGO_MEMBERSHIPS_MATCH_SQL));
    assert.ok(identity < query.indexOf('delete from catalog.catalogue_version_assets'));
  }
  assert.ok(reviewedLogoIdentityFixtureSql().includes('language_changed'));
});

test('PostgreSQL rollback fixtures reject withdrawn permissions, changed immutable bytes and inactive originals', { skip: !process.env.STACKR_LOGO_TEST_DATABASE_URL }, async () => {
  const { Client } = await import('pg');
  const client = new Client({ connectionString: process.env.STACKR_LOGO_TEST_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query(reviewedLogoEligibilityFixtureSql());
    assert.equal(rows[0].result.total, 17);
    assert.equal(rows[0].result.passed, 17);
    assert.deepEqual(rows[0].result.failures, []);
    const memberships = await client.query(reviewedLogoMembershipFixtureSql());
    assert.deepEqual(memberships.rows[0].result, { total: 5, passed: 5, failures: [] });
    const identities = await client.query(reviewedLogoIdentityFixtureSql());
    assert.deepEqual(identities.rows[0].result, { total: 5, passed: 5, failures: [] });
    const scope = await client.query(reviewedLogoPlPgSqlScopeFixtureSql());
    assert.equal(scope.rows[0].result.passed, true);
  } finally { await client.end(); }
});
