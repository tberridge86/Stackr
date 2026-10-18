import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';

const sql = readFileSync(resolve(process.cwd(), 'docs/sql/asset-manifest-card-image-equivalence-fixture.sql'), 'utf8');
const rpc = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906062838_expose_bounded_card_image_identity_read.sql'), 'utf8');
const indexes = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260906062835_index_asset_printing_identity.sql'), 'utf8');

// Retain the original September 6 proposal's historical branch fixture. It does
// not exercise the later RPC definitions; the in-memory rehearsal below does.
assert.match(rpc, /returns setof api\.asset_manifest/i);
assert.match(rpc, /security invoker\s+set search_path = ''/i);
assert.doesNotMatch(rpc, /security definer|\b(insert into|update|delete from|truncate|drop)\b/i);
assert.match(rpc, /cardinality\(p_variant_ids\) > 100/);
assert.match(rpc, /cardinality\(p_printing_ids\) > 100/);
assert.match(rpc, /p_limit < 1 or p_limit > 1000/);
assert.match(rpc, /array_ndims\(p_variant_ids\)/);
assert.match(rpc, /array_position\(p_printing_ids, null\)/);
assert.match(rpc, /\(p_after_version_id is null\) <> \(p_after_asset_id is null\)/);
assert.match(rpc, /SELECT id FROM catalog\.card_variants\s+WHERE printing_id = ANY\(p_printing_ids\)/i);
assert.equal((rpc.match(/FROM catalog\.catalogue_version_assets cva/gi) ?? []).length, 2);
assert.equal((rpc.match(/FROM catalog\.assets a/gi) ?? []).length, 2);
assert.match(rpc, /SELECT m\.\* FROM api\.asset_manifest m/i);
assert.match(rpc, /m\.variant_id = ANY\(p_variant_ids\) OR m\.printing_id = ANY\(p_printing_ids\)/i);
assert.match(rpc, /\(m\.catalogue_version_id, m\.asset_row_id\) > \(p_after_version_id, p_after_asset_id\)/);
assert.match(rpc, /ORDER BY m\.catalogue_version_id, m\.asset_row_id\s+LIMIT p_limit/i);
assert.match(rpc, /revoke all[\s\S]*from public, anon, authenticated;/i);
assert.match(rpc, /grant execute[\s\S]*to service_role;/i);
assert.doesNotMatch(rpc, /grant execute[\s\S]*to (public|anon|authenticated)\b/i);
assert.match(indexes, /set lock_timeout = '1s'/);
assert.equal((indexes.match(/create index if not exists/gi) ?? []).length, 3);
assert.match(indexes, /on catalog\.assets \(printing_id\) include \(id\)/);
assert.match(indexes, /on catalog\.catalogue_version_assets \(variant_id\)/);
assert.match(indexes, /on catalog\.catalogue_version_assets \(printing_id\)/);
assert.doesNotMatch(indexes, /\b(insert into|update|delete from|truncate|drop)\b/i);
const requestedVariants = new Set(['variant-cva']);
const requestedPrintings = new Set(['printing-cva', 'printing-derived-cva', 'printing-derived-asset', 'printing-asset']);
const variants = new Map([['variant-cva', 'printing-other'], ['variant-derived-cva', 'printing-derived-cva'], ['variant-derived-asset', 'printing-derived-asset'], ['variant-unrequested', 'printing-other']]);
const versions = new Map([['ja-v1', [true, false]], ['zh-tw-v2', [true, false]], ['draft-v', [false, false]], ['old-v', [true, true]]]);
const assets = new Map([
  ['a-cva-variant', asset('variant-unrequested')], ['a-cva-printing', asset(null, 'printing-other')], ['a-derived-cva', asset('variant-unrequested')], ['a-derived-asset', asset('variant-derived-asset')], ['a-dedupe', asset('variant-derived-asset')], ['a-asset-printing', asset(null, 'printing-asset')], ['a-cross', asset('variant-derived-asset')], ['a-coalesce-extra', asset('variant-derived-asset')],
  ['a-visibility', asset('variant-derived-asset', null, { visibility: 'private' })], ['a-public', asset('variant-derived-asset', null, { publiclyServable: false })], ['a-permission', asset('variant-derived-asset', null, { permission: 'review' })], ['a-rights', asset('variant-derived-asset', null, { rights: 'review' })], ['a-retention', asset('variant-derived-asset', null, { retention: 'expired' })], ['a-deleted', asset('variant-derived-asset', null, { deleted: true })], ['a-unavailable', asset('variant-derived-asset', null, { storageProvider: 'unavailable' })], ['a-logo', asset('variant-derived-asset', null, { type: 'set_logo' })],
]);
const cvas = [
  cva('ja-v1', 'a-cva-variant', 'variant-cva'), cva('ja-v1', 'a-cva-printing', null, 'printing-cva'), cva('ja-v1', 'a-derived-cva', 'variant-derived-cva'), cva('ja-v1', 'a-derived-asset'), cva('ja-v1', 'a-dedupe', 'variant-derived-cva'), cva('ja-v1', 'a-asset-printing'), cva('ja-v1', 'a-cross'), cva('zh-tw-v2', 'a-cross'), cva('ja-v1', 'a-coalesce-extra', 'variant-unrequested'),
  ...['a-visibility', 'a-public', 'a-permission', 'a-rights', 'a-retention', 'a-deleted', 'a-unavailable', 'a-logo'].map((assetId) => cva('ja-v1', assetId)), cva('draft-v', 'a-cross'), cva('old-v', 'a-cross'),
];
function asset(variantId, printingId = null, overrides = {}) { return { type: 'card_image', variantId, printingId, visibility: 'public_catalogue', publiclyServable: true, permission: 'approved', rights: 'approved', retention: 'active', deleted: false, storageProvider: 'provider', ...overrides }; }
function cva(versionId, assetId, variantId = null, printingId = null) { return { versionId, assetId, variantId, printingId }; }
function key(row) { return `${row.versionId}/${row.assetId}`; }
function targetVariants(includeInherited = true) {
  const inherited = includeInherited
    ? [...variants].filter(([, printingId]) => requestedPrintings.has(printingId)).map(([variantId]) => variantId)
    : [];
  return new Set([...requestedVariants, ...inherited]);
}
function manifestRows() { return cvas.flatMap((c) => { const [published, deprecated] = versions.get(c.versionId) ?? []; const a = assets.get(c.assetId); if (!published || deprecated || !a || a.type !== 'card_image' || a.visibility !== 'public_catalogue' || !a.publiclyServable || a.permission !== 'approved' || a.rights !== 'approved' || a.retention !== 'active' || a.deleted || a.storageProvider === 'unavailable') return []; const variantId = c.variantId ?? a.variantId; return [{ ...c, variantId, printingId: c.printingId ?? a.printingId ?? variants.get(variantId) ?? null }]; }); }
function currentMembers() { return manifestRows().filter((row) => requestedVariants.has(row.variantId) || requestedPrintings.has(row.printingId)); }
function candidateHitKeys(
  enabled = { cvaVariant: true, cvaPrinting: true, assetVariant: true, assetPrinting: true },
  includeInherited = true,
) {
  const targets = targetVariants(includeInherited);
  const hits = [];
  for (const c of cvas) {
    const a = assets.get(c.assetId);
    if (!a) continue;
    if (enabled.cvaVariant && targets.has(c.variantId)) hits.push(key(c));
    if (enabled.cvaPrinting && requestedPrintings.has(c.printingId)) hits.push(key(c));
    if (enabled.assetVariant && targets.has(a.variantId)) hits.push(key(c));
    if (enabled.assetPrinting && requestedPrintings.has(a.printingId)) hits.push(key(c));
  }
  return hits;
}
function candidateKeys(enabled, includeInherited) {
  return new Set(candidateHitKeys(enabled, includeInherited));
}
function candidateMembers(enabled, includeInherited) {
  const candidates = candidateKeys(enabled, includeInherited);
  return currentMembers().filter((row) => candidates.has(key(row)));
}
function keys(rows) { return rows.map(key).sort(); }

assert.doesNotMatch(sql, /\b(from|join)\s+(catalog|api)\./i, 'fixture must not query real schemas');
assert.match(sql, /versions\(version_id, published, deprecated\) as \(\s*values/i); assert.match(sql, /assets\(asset_id, asset_type/i); assert.match(sql, /cva\(catalogue_version_id, asset_id/i); assert.match(sql, /variants\(variant_id, printing_id\)/i);
assert.match(sql, /target_variants as materialized/); assert.match(sql, /candidate_rows as materialized/); assert.match(sql, /select unnest\(p\.p_variant_ids\)/); assert.match(sql, /av\.printing_id = any\(p\.p_printing_ids\)/); assert.match(sql, /c\.variant_id/); assert.match(sql, /c\.printing_id/); assert.match(sql, /a\.variant_id/); assert.match(sql, /a\.printing_id/); assert.match(sql, /cross join lateral/); assert.match(sql, /offset 0/); assert.match(sql, /not exists\(select 1 from differences\) as passed/); assert.match(sql, /external_url.*attribution.*mime_type/s);
const expected = ['ja-v1/a-asset-printing', 'ja-v1/a-cross', 'ja-v1/a-cva-printing', 'ja-v1/a-cva-variant', 'ja-v1/a-dedupe', 'ja-v1/a-derived-asset', 'ja-v1/a-derived-cva', 'zh-tw-v2/a-cross'];
assert.deepEqual(keys(currentMembers()), expected); assert.deepEqual(keys(candidateMembers()), expected);
assert.ok(!keys(currentMembers()).includes('ja-v1/a-coalesce-extra'), 'CVA identity overrides a matching asset identity');
for (const [branch, lost] of Object.entries({ cvaVariant: 'ja-v1/a-derived-cva', cvaPrinting: 'ja-v1/a-cva-printing', assetVariant: 'ja-v1/a-derived-asset', assetPrinting: 'ja-v1/a-asset-printing' })) { const enabled = { cvaVariant: true, cvaPrinting: true, assetVariant: true, assetPrinting: true, [branch]: false }; assert.ok(!keys(candidateMembers(enabled)).includes(lost), `removing ${branch} must lose its protected member`); }
assert.ok(candidateHitKeys().length > candidateKeys().size, 'multiple branch hits are deduplicated by UNION semantics');
for (const inheritedOnly of ['ja-v1/a-derived-cva', 'ja-v1/a-derived-asset']) {
  assert.ok(!keys(candidateMembers(undefined, false)).includes(inheritedOnly),
    'omitting printing-to-variant expansion must lose the inherited-only member');
}
assert.ok(candidateKeys().has('ja-v1/a-logo'),
  'candidate preselection must leave non-card filtering to the final manifest read');

async function rehearseCurrentIdentityRpc() {
  // Load definitions in migration order so the test cannot silently keep testing
  // a superseded function when a later CREATE OR REPLACE migration is added.
  const migrationDir = resolve(process.cwd(), 'supabase/migrations');
  const migrations = readdirSync(migrationDir).filter((name) => /^\d{14}_.+\.sql$/.test(name)).sort()
    .map((name) => ({ name, source: readFileSync(resolve(migrationDir, name), 'utf8') }));
  const identityMigrations = migrations.filter(({ source }) => /create\s+or\s+replace\s+function\s+api\.card_image_manifest_for_identities\s*\(/i.test(source));
  const manifestMigration = migrations.findLast(({ source }) => /create\s+or\s+replace\s+view\s+api\.asset_manifest\b/i.test(source));
  assert.ok(identityMigrations.length >= 3 && manifestMigration, 'Current identity RPC and manifest definitions must exist');
  const latest = identityMigrations.at(-1);
  const db = new PGlite();
  const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const version = id(1), secondVersion = id(2), draft = id(3), deprecated = id(4);
  const set = id(100), otherSet = id(101), printing = id(200), otherPrinting = id(201);
  const variant = id(300), siblingVariant = id(301), otherVariant = id(302);
  const rowKey = (row) => `${row.catalogue_version_id}/${row.asset_row_id}`;
  const expectedKey = (n, publication = version) => `${publication}/${id(n)}`;
  const read = async (variantIds, printingIds, after = null, limit = 1000) => (await db.query(
    'select * from api.card_image_manifest_for_identities($1::uuid[], $2::uuid[], $3::uuid, $4::uuid, $5::integer)',
    [variantIds, printingIds, after?.catalogue_version_id ?? null, after?.asset_row_id ?? null, limit],
  )).rows;

  async function addAsset(n, { assetOverrides = {}, memberVariant = variant, memberPrinting = printing,
    publications = [version] } = {}) {
    const asset = {
      id: id(n), asset_id: `fixture-${n}`, asset_type: 'card_image', game_code: 'pokemon',
      set_id: set, printing_id: printing, variant_id: memberVariant,
      storage_provider: 'external_reference', storage_bucket: null, storage_key: null,
      url: `https://fixture.invalid/${n}.webp`, original_source_url: `https://fixture.invalid/source/${n}`,
      source_attribution: 'Verified fixture source', attribution_text: 'Older fixture attribution',
      permission_status: 'approved', rights_status: 'approved', asset_visibility: 'public_catalogue',
      publicly_servable: true, retention_status: 'active', deleted_at: null,
      content_sha256: 'a'.repeat(64), perceptual_hash: 'fixture-hash', mime_type: 'image/webp',
      width: 600, height: 825, byte_size: 1234, derivative_list: [{ name: 'thumbnail', width: 120 }],
      cache_control: 'public, max-age=300', externally_referenced: true, unavailable_reason: null,
      last_verified_at: '2026-10-18T00:00:00Z', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-18T00:00:00Z',
      ...assetOverrides,
    };
    await db.query('insert into catalog.assets select * from jsonb_populate_record(null::catalog.assets, $1::jsonb)', [JSON.stringify(asset)]);
    for (const publication of publications) await db.query(
      'insert into catalog.catalogue_version_assets values ($1, $2, $3, $4, $5)',
      [publication, id(n), set, memberPrinting, memberVariant],
    );
  }

  async function assertEquivalent(variantIds, printingIds, expectedKeys, after = null, limit = 1000) {
    // This cohort has explicit, normalized CVA identities. Compare full payloads
    // against the actual manifest view, including delivery metadata. For mixed
    // selectors the current RPC intentionally adds printing-scoped fronts only;
    // it must not substitute a sibling variant's image for the selected finish.
    const expected = (await db.query(`select * from api.asset_manifest
      where asset_type = 'card_image'
        and (variant_id = any($1::uuid[])
          or (printing_id = any($2::uuid[]) and (cardinality($1::uuid[]) = 0 or variant_id is null)))
        and ($3::uuid is null or (catalogue_version_id, asset_row_id) > ($3::uuid, $4::uuid))
      order by catalogue_version_id, asset_row_id limit $5`,
    [variantIds, printingIds, after?.catalogue_version_id ?? null, after?.asset_row_id ?? null, limit])).rows;
    assert.deepEqual(expected.map(rowKey), expectedKeys, 'The independently selected manifest cohort must match the declared identities');
    const actual = await read(variantIds, printingIds, after, limit);
    assert.deepEqual(actual, expected, 'Current RPC must preserve exact eligible manifest rows, payloads and keyset order');
    return actual;
  }

  try {
    // No connection string or persistent directory: these schemas and writes
    // exist only inside this disposable in-memory PostgreSQL instance.
    await db.exec(`set statement_timeout = '5s';
      create role anon; create role authenticated; create role service_role;
      create schema api; create schema catalog;
      create table catalog.catalogue_versions(id uuid primary key, status text, deprecated_at timestamptz);
      create table catalog.card_variants(id uuid primary key, printing_id uuid, set_id uuid, deprecated_at timestamptz);
      create table catalog.card_printings(id uuid primary key, set_id uuid);
      create table catalog.assets(
        id uuid primary key, asset_id text, asset_type text, game_code text, set_id uuid, printing_id uuid, variant_id uuid,
        storage_provider text, storage_bucket text, storage_key text, url text, original_source_url text,
        source_attribution text, attribution_text text, permission_status text, rights_status text,
        asset_visibility text, publicly_servable boolean, retention_status text, deleted_at timestamptz,
        content_sha256 text, perceptual_hash text, mime_type text, width integer, height integer, byte_size bigint,
        derivative_list jsonb, cache_control text, externally_referenced boolean, unavailable_reason text,
        last_verified_at timestamptz, created_at timestamptz, updated_at timestamptz);
      create table catalog.catalogue_version_assets(
        catalogue_version_id uuid, asset_id uuid, set_id uuid, printing_id uuid, variant_id uuid,
        primary key(catalogue_version_id, asset_id));
      grant usage on schema api, catalog to service_role;
      grant select on all tables in schema catalog to service_role;`);
    await db.exec(manifestMigration.source);
    for (const migration of identityMigrations) await db.exec(migration.source);
    await db.exec('grant select on api.asset_manifest to service_role');
    for (const [publication, status, deprecatedAt] of [
      [version, 'published', null], [secondVersion, 'published', null],
      [draft, 'draft', null], [deprecated, 'published', '2026-10-18T00:00:00Z'],
    ]) await db.query('insert into catalog.catalogue_versions values ($1, $2, $3)', [publication, status, deprecatedAt]);
    for (const [variantId, printingId, setId] of [
      [variant, printing, set], [siblingVariant, printing, set], [otherVariant, otherPrinting, otherSet],
    ]) await db.query('insert into catalog.card_variants values ($1, $2, $3, null)', [variantId, printingId, setId]);
    await db.query('insert into catalog.card_printings values ($1, $2), ($3, $4)', [printing, set, otherPrinting, otherSet]);

    await addAsset(1000, { publications: [version, secondVersion, draft, deprecated] });
    await addAsset(1001, { memberVariant: null }); // A printing-scoped front, not a sibling finish.
    await addAsset(1002, { memberVariant: siblingVariant });
    await addAsset(1003, { memberVariant: otherVariant, memberPrinting: otherPrinting,
      assetOverrides: { set_id: otherSet, printing_id: otherPrinting } });
    await addAsset(1004, { assetOverrides: { set_id: otherSet, printing_id: otherPrinting,
      variant_id: otherVariant, asset_id: null, source_attribution: null } }); // Explicit CVA identity wins.
    for (const [index, assetOverrides] of [
      { asset_type: 'set_logo' }, { asset_visibility: 'private' }, { publicly_servable: false },
      { permission_status: 'review' }, { rights_status: 'review' }, { retention_status: 'expired' },
      { deleted_at: '2026-10-18T00:00:00Z' }, { storage_provider: 'unavailable' },
    ].entries()) await addAsset(1100 + index, { assetOverrides });

    const printingKeys = [expectedKey(1000), expectedKey(1001), expectedKey(1002), expectedKey(1004), expectedKey(1000, secondVersion)];
    await assertEquivalent([], [printing], printingKeys);
    await assertEquivalent([variant], [], [expectedKey(1000), expectedKey(1004), expectedKey(1000, secondVersion)]);
    const mixedKeys = [expectedKey(1000), expectedKey(1001), expectedKey(1004), expectedKey(1000, secondVersion)];
    await assertEquivalent([variant], [printing], mixedKeys);
    await assertEquivalent([], [printing, printing], printingKeys);
    await assertEquivalent([], [], []);
    await assertEquivalent([], [id(999)], []);

    // Equal asset IDs in two versions catch cursors that compare only asset_id.
    const first = await assertEquivalent([], [printing], printingKeys.slice(0, 2), null, 2);
    const second = await assertEquivalent([], [printing], printingKeys.slice(2, 4), first.at(-1), 2);
    const third = await assertEquivalent([], [printing], printingKeys.slice(4), second.at(-1), 2);
    await assertEquivalent([], [printing], [], third.at(-1), 2);

    // Validate PostgreSQL execution/bounds and retained service-only grants,
    // rather than relying exclusively on regex checks of the old migration.
    await assert.rejects(read(null, []), /Image identity arrays/);
    await assert.rejects(read([], [null]), /Image identity arrays/);
    await assert.rejects(read([], Array(101).fill(printing)), /Image identity arrays/);
    await assert.rejects(read([], [printing], null, 0), /Image page limit/);
    await assert.rejects(read([], [printing], null, 1001), /Image page limit/);
    await assert.rejects(read([], [printing], { catalogue_version_id: version }), /Both image cursor UUIDs/);
    const privileges = (await db.query(`select
      has_function_privilege('anon', 'api.card_image_manifest_for_identities(uuid[],uuid[],uuid,uuid,integer)', 'EXECUTE') as anon,
      has_function_privilege('authenticated', 'api.card_image_manifest_for_identities(uuid[],uuid[],uuid,uuid,integer)', 'EXECUTE') as authenticated,
      has_function_privilege('service_role', 'api.card_image_manifest_for_identities(uuid[],uuid[],uuid,uuid,integer)', 'EXECUTE') as service,
      p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'api' and p.proname = 'card_image_manifest_for_identities'`)).rows[0];
    assert.deepEqual(privileges, { anon: false, authenticated: false, service: true, prosecdef: false });
    await db.exec('set role service_role');
    await assertEquivalent([variant], [printing], mixedKeys);
    await db.exec('reset role');

    // Negative controls prove this test executes the latest SQL: the predecessor
    // omits mixed-selector printing fronts, while eligibility/cursor mutations
    // must be caught by the same independent view/pagination assertions.
    for (const [label, alteredSource, check] of [
      ['predecessor printing-front gap', identityMigrations.at(-2).source,
        () => assertEquivalent([variant], [printing], mixedKeys)],
      ['missing rights filter', latest.source.replace("AND a.rights_status = 'approved'", ''),
        () => assertEquivalent([], [printing], printingKeys)],
      ['missing cursor filter', latest.source.replace(/p_after_version_id IS NULL\s+OR/i, 'TRUE OR'),
        () => assertEquivalent([], [printing], printingKeys.slice(2), first.at(-1))],
    ]) {
      assert.notEqual(alteredSource, latest.source, `Negative control must alter ${label}`);
      await db.exec('begin');
      try {
        await db.exec(alteredSource);
        await assert.rejects(check(), { code: 'ERR_ASSERTION' }, `Must reject ${label}`);
      } finally {
        await db.exec('rollback');
      }
    }
    await assertEquivalent([variant], [printing], mixedKeys);
    return latest.name;
  } finally {
    await db.close();
  }
}

if (process.argv.includes('--sql')) process.stdout.write(sql);
else {
  const migration = await rehearseCurrentIdentityRpc();
  console.log(`Historical VALUES fixture and current ${migration} passed in isolated in-memory PostgreSQL: explicit printing/variant memberships, full delivery payloads, eligibility, keyset pages and negative controls. No production query or latency measurement ran.`);
}
