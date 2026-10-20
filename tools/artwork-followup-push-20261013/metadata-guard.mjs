import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { check } from '../queue1-publish-20260927/publish.mjs';
import { assetId } from '../artwork3303-publish-20260928/publish.mjs';
import { BINDING_FIELDS, selectFields, SOURCE_CODES, SOURCE_FIELDS } from './frozen.mjs';
import { assertBindings, snapshotHash } from '../artwork-next-push-20261013/metadata-guard.mjs';
export { assertBindings, snapshotHash };

const rowKey = row => `${row.scope}:${row.identity}`;
const ordered = rows => [...rows].sort((a, b) => rowKey(a).localeCompare(rowKey(b)));
const counts = rows => Object.fromEntries(['printings', 'variants', 'names', 'sets', 'assets', 'links', 'sources'].map(scope => [scope, rows.filter(r => r.scope === scope).length]));

export function assertSourcePolicies(plan, sources, environment, complete = false) {
  const existing = plan.source_policies[environment];
  const additions = plan.new_sources[environment];
  const policies = [...existing, ...additions];
  check(new Set(sources.map(s => s.code)).size === sources.length && sources.length >= existing.length && sources.length <= policies.length, 'Unexpected provenance source count');
  for (const source of sources) {
    const expected = policies.find(s => s.code === source.code);
    check(expected && isDeepStrictEqual(selectFields(source, SOURCE_FIELDS), expected), 'Existing or planned source policy changed');
  }
  for (const source of complete ? policies : existing) check(sources.some(s => s.code === source.code), 'Required provenance source missing');
}

export async function readSnapshot(db, rows, expected) {
  const ids = rows.map(r => r.printing_id);
  const setIds = [...new Set(rows.map(r => r.set_id))];
  const read = async (scope, sql, parameters, identity = row => row.id) => (await db.query(sql, parameters)).rows.map(payload => ({ scope, identity: String(identity(payload)), payload }));
  const printings = await read('printings', 'select * from catalog.card_printings where id=any($1::uuid[]) for share', [ids]);
  const variants = await read('variants', `select * from catalog.card_variants where printing_id=any($1::uuid[]) limit ${expected.variants + 1} for share`, [ids]);
  const variantIds = variants.map(r => r.payload.id);
  const names = await read('names', `select * from catalog.card_names where printing_id=any($1::uuid[]) limit ${expected.names + 1} for share`, [ids]);
  const sets = await read('sets', 'select * from catalog.sets where id=any($1::uuid[]) for share', [setIds]);
  // Sentinel rows reject growth beyond this small cohort, rather than silently
  // omitting metadata or allowing an unbounded catalogue response.
  const assets = await read('assets', 'select * from catalog.assets where printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]) or (printing_id is null and variant_id is null and set_id=any($3::uuid[])) limit 201 for share', [ids, variantIds, setIds]);
  const links = await read('links', 'select * from catalog.catalogue_version_assets where printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]) or asset_id=any($3::uuid[]) or (printing_id is null and variant_id is null and set_id=any($4::uuid[])) limit 201 for share', [ids, variantIds, assets.map(r => r.payload.id), setIds], row => `${row.catalogue_version_id}:${row.asset_id}`);
  const sources = await read('sources', 'select * from ingest.sources where code=any($1::text[]) for share', [SOURCE_CODES]);
  check(printings.length === expected.printings && variants.length === expected.variants && names.length === expected.names && sets.length === expected.sets && assets.length <= 200 && links.length <= 200, 'Scoped snapshot counts changed');
  return ordered([...printings, ...variants, ...names, ...sets, ...assets, ...links, ...sources]);
}

export function compareSnapshots(before, after, journal, plan, environment) {
  const old = new Map(before.map(row => [rowKey(row), row]));
  const next = new Map(after.map(row => [rowKey(row), row]));
  check(old.size === before.length && next.size === after.length, 'Duplicate snapshot identity');
  for (const [key, row] of old) check(isDeepStrictEqual(next.get(key), row), `Existing scoped row changed: ${row.scope}`);
  const added = after.filter(row => !old.has(rowKey(row)));
  const createdAssets = journal.assets.filter(a => a.created);
  const createdLinks = journal.links.filter(l => l.created);
  const assetRows = added.filter(r => r.scope === 'assets');
  const linkRows = added.filter(r => r.scope === 'links');
  const sourceRows = added.filter(r => r.scope === 'sources');
  check(assetRows.length === createdAssets.length && linkRows.length === createdLinks.length, 'Artwork journal and new rows differ');
  for (const row of assetRows) {
    const printing = plan.rows.find(r => r.printing_id === row.payload.printing_id);
    check(printing && createdAssets.some(a => a.id === row.identity && a.printing_id === printing.printing_id) && row.payload.asset_id === assetId(printing) && row.payload.variant_id === null && row.payload.asset_type === 'card_image', 'Unexpected new asset');
  }
  for (const row of linkRows) {
    const link = createdLinks.find(l => `${l.catalogue_version_id}:${l.asset_id}` === row.identity);
    check(link && isDeepStrictEqual(selectFields(row.payload, ['catalogue_version_id', 'language_code', 'set_id', 'printing_id', 'variant_id', 'asset_id', 'asset_type']), selectFields(link, ['catalogue_version_id', 'language_code', 'set_id', 'printing_id', 'variant_id', 'asset_id', 'asset_type'])), 'Unexpected new asset link');
  }
  for (const row of sourceRows) {
    const expected = plan.new_sources[environment].find(s => s.code === row.payload.code);
    check(expected && isDeepStrictEqual(selectFields(row.payload, SOURCE_FIELDS), expected), 'Unexpected source insertion');
  }
  check(added.length === assetRows.length + linkRows.length + sourceRows.length, 'Unexpected catalogue metadata insertion');
  assertSourcePolicies(plan, after.filter(r => r.scope === 'sources').map(r => r.payload), environment, true);
  check(journal.metadata_changes === 0 && !journal.catalogue_corrections?.length && !journal.native_name_corrections?.length, 'Unapproved metadata change');
  return { status: 'all_existing_scoped_rows_preserved', before_sha256: snapshotHash(before), after_sha256: snapshotHash(after), before_counts: counts(before), after_counts: counts(after), created_assets: assetRows.length, created_links: linkRows.length, new_inactive_provenance_sources: sourceRows.length, staging_fixture_sources: environment === 'staging' ? sourceRows.length : 0, metadata_changes: 0, variant_changes: 0, existing_source_policy_changes: 0 };
}

export function createMetadataGuard(plan, { privateOutput = null } = {}) {
  const sequences = new Map();
  const save = async (environment, sequence, phase, snapshot) => {
    if (!privateOutput) return;
    await mkdir(privateOutput, { recursive: true });
    await writeFile(path.join(privateOutput, `${environment}-${sequence}-${phase}.json`), JSON.stringify(snapshot, null, 2));
  };
  return {
    async before(db, rows, environment) {
      const sequence = (sequences.get(environment) ?? 0) + 1;
      sequences.set(environment, sequence);
      const snapshot = await readSnapshot(db, rows, plan.scope_counts[environment]);
      const cards = (await db.query(`select ${BINDING_FIELDS.join(',')} from api.catalogue_cards where printing_id=any($1::uuid[]) limit ${plan.scope_counts[environment].variants + 1}`, [rows.map(r => r.printing_id)])).rows;
      assertBindings(plan, cards, environment);
      assertSourcePolicies(plan, snapshot.filter(r => r.scope === 'sources').map(r => r.payload), environment);
      await save(environment, sequence, 'before', snapshot);
      return { snapshot, sequence };
    },
    async after(db, rows, environment, before, journal) {
      const snapshot = await readSnapshot(db, rows, plan.scope_counts[environment]);
      const result = compareSnapshots(before.snapshot, snapshot, journal, plan, environment);
      await save(environment, before.sequence, 'after', snapshot);
      return result;
    },
  };
}
