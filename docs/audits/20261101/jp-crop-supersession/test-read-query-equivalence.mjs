import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const { PGlite } = createRequire('D:/Stackr/package.json')('@electric-sql/pglite');
const read = name => fs.readFileSync(new URL(name, import.meta.url), 'utf8');
const original = read('./complete-effective-links.sql');
const optimized = read('./read-query-optimized.sql');
const query = source => source.slice(source.indexOf('with active_versions'), source.lastIndexOf('rollback;')).trim();
const a = 'e8e16a23-fc7a-4ec8-abfe-b74448fa5f27';
const b = '7dbeff79-cfb7-4ac8-8a4f-d7c73a523349';
const unrelated = '00000000-0000-4000-8000-000000000099';
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const db = new PGlite();
const expected = [];
let serial = 100;
async function insert(table, value) {
  await db.query(`insert into catalog.${table} (${Object.keys(value).join(',')}) values (${Object.keys(value).map((_, i) => '$' + (i + 1)).join(',')})`, Object.values(value));
}
async function fixture({ cvaType = 'set_logo', assetType = 'set_logo', cvaSet = null, assetSet = null,
  cvaVariant = null, assetVariant = null, cvaPrinting = null, assetPrinting = null,
  version = uuid(1), orphan = false, included = true, deleted = false, label }) {
  const id = uuid(serial++);
  if (!orphan) await insert('assets', { id, asset_type: assetType, set_id: assetSet, variant_id: assetVariant,
    printing_id: assetPrinting, deleted_at: deleted ? '2026-01-01Z' : null, permission_status: 'denied' });
  await insert('catalogue_version_assets', { catalogue_version_id: version, asset_id: id,
    asset_type: cvaType, set_id: cvaSet, variant_id: cvaVariant, printing_id: cvaPrinting, language_code: 'ja', note: label });
  if (included) expected.push(id);
}
async function result(sql) {
  const value = (await db.query(query(sql))).rows[0].snapshot_part;
  delete value.capturedAt;
  return value;
}
try {
  await db.exec(`create schema catalog;
    create table catalog.catalogue_versions(id uuid primary key,status text,deprecated_at timestamptz);
    create table catalog.assets(id uuid primary key,asset_type text,set_id uuid,variant_id uuid,printing_id uuid,deleted_at timestamptz,permission_status text);
    create table catalog.card_variants(id uuid primary key,set_id uuid,printing_id uuid);
    create table catalog.card_printings(id uuid primary key,set_id uuid);
    create table catalog.catalogue_version_assets(catalogue_version_id uuid,asset_id uuid,asset_type text,set_id uuid,variant_id uuid,printing_id uuid,language_code text,note text,primary key(catalogue_version_id,asset_id));
    create index catalogue_version_assets_asset_lookup_idx on catalog.catalogue_version_assets(asset_id,catalogue_version_id) include(language_code,set_id,printing_id,variant_id,asset_type);
    create index catalogue_version_assets_lookup_idx on catalog.catalogue_version_assets(language_code,asset_type,set_id,printing_id,variant_id);
    create index assets_variant_public_idx on catalog.assets(variant_id,asset_type);
  `);
  for (const [n, status, deprecated] of [[1, 'published', null], [2, 'published', null], [3, 'draft', null], [4, 'published', '2026-01-01Z']]) {
    await insert('catalogue_versions', { id: uuid(n), status, deprecated_at: deprecated });
  }
  await insert('card_printings', { id: uuid(10), set_id: a });
  await insert('card_printings', { id: uuid(11), set_id: b });
  await insert('card_variants', { id: uuid(20), set_id: a, printing_id: uuid(11) });
  await insert('card_variants', { id: uuid(21), set_id: null, printing_id: uuid(11) });
  await insert('card_variants', { id: uuid(22), set_id: unrelated, printing_id: uuid(10) });
  await fixture({ cvaSet: a, assetType: 'card_image', label: 'explicit logo wins mistyped asset' });
  await fixture({ cvaSet: b, orphan: true, label: 'explicit orphan still visible' });
  await fixture({ cvaType: null, assetSet: a, label: 'null link type inherits logo type' });
  await fixture({ cvaType: 'card_image', assetSet: b, label: 'asset type wins mistyped link' });
  await fixture({ assetSet: a, deleted: true, label: 'deleted/denied remains in guard scope' });
  await fixture({ cvaVariant: uuid(20), label: 'link variant set inheritance' });
  await fixture({ assetVariant: uuid(20), label: 'asset variant set inheritance' });
  await fixture({ cvaPrinting: uuid(11), label: 'link printing inheritance' });
  await fixture({ assetPrinting: uuid(10), label: 'asset printing inheritance' });
  await fixture({ cvaVariant: uuid(21), label: 'variant printing inheritance' });
  await fixture({ cvaSet: a, assetSet: unrelated, label: 'link set has priority' });
  await fixture({ cvaSet: unrelated, assetSet: a, included: false, label: 'link set excludes inherited target' });
  await fixture({ assetSet: unrelated, cvaVariant: uuid(20), included: false, label: 'asset set excludes variant target' });
  await fixture({ cvaVariant: uuid(22), cvaPrinting: uuid(10), included: false, label: 'variant set precedes printing set' });
  await fixture({ cvaSet: a, cvaType: null, assetType: null, included: false, label: 'no logo type is not a logo' });
  await fixture({ cvaSet: a, cvaType: 'card_image', assetType: 'card_image', included: false, label: 'card type excluded' });
  await fixture({ cvaSet: a, version: uuid(3), included: false, label: 'draft version excluded' });
  await fixture({ cvaSet: a, version: uuid(4), included: false, label: 'deprecated published version excluded' });
  await fixture({ cvaSet: b, version: uuid(2), label: 'second active version included' });
  // Small synthetic non-logo population makes the read plan inspectable without live data.
  await db.exec(`insert into catalog.assets(id,asset_type,set_id)
    select ('00000000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,'card_image','${unrelated}' from generate_series(1,4000) n;
    insert into catalog.catalogue_version_assets(catalogue_version_id,asset_id,asset_type,language_code)
    select case when n%2=0 then '${uuid(1)}' else '${uuid(2)}' end::uuid,
      ('00000000-0000-4000-8000-'||lpad((10000+n)::text,12,'0'))::uuid,'card_image','ja' from generate_series(1,4000) n;
    analyze catalog.catalogue_version_assets; analyze catalog.assets; analyze catalog.catalogue_versions;`);
  const before = await result(original);
  const after = await result(optimized);
  assert.deepEqual(after, before, 'materialization must preserve complete returned links and assets');
  assert.deepEqual(after.publishedLinks.map(row => row.asset_id).sort(), expected.sort());
  assert.ok(after.publishedLinks.some(row => row.note === 'explicit orphan still visible'));
  assert.ok(after.linkedAssets.some(row => row.deleted_at && row.permission_status === 'denied'));
  for (const [name, sql] of [['original', original], ['optimized', optimized]]) {
    const plan = (await db.query('explain (format json) ' + query(sql))).rows[0]['QUERY PLAN'][0].Plan;
    const materialized = [];
    function visit(node) { if (node['Subplan Name']) materialized.push(node['Subplan Name']); for (const child of node.Plans ?? []) visit(child); }
    visit(plan);
    if (name === 'optimized') assert.ok(materialized.includes('CTE explicit_logo_pairs'));
    console.log(JSON.stringify({ name, syntheticPlannerCost: plan['Total Cost'], materialized }));
  }
  // Preserve the existing overflow sentinel; no false completeness at the cap.
  await db.exec(`insert into catalog.catalogue_version_assets(catalogue_version_id,asset_id,asset_type,set_id)
    select '${uuid(1)}',('00000000-0000-4000-8000-'||lpad((20000+n)::text,12,'0'))::uuid,'set_logo','${a}' from generate_series(1,1005) n;`);
  const cappedBefore = await result(original);
  const cappedAfter = await result(optimized);
  assert.deepEqual(cappedAfter, cappedBefore);
  assert.equal(cappedAfter.publishedLinks.length, 1001);
  console.log(`PASS: ${serial - 100} identity/type/version cases, exact inherited/deleted/orphan scope, two active versions, and unchanged1001 overflow cap. No live query or phone timing.`);
} finally { await db.close(); }
