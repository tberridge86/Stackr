import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { check } from '../queue1-publish-20260927/publish.mjs';
import { canonicalHash } from './source-proof.mjs';
import { assetId } from '../artwork3303-publish-20260928/publish.mjs';
import { BINDING_FIELDS, selectFields, SOURCE_CODES, SOURCE_FIELDS, validateSourcePlan, EXISTING_SOURCE_ROW_HASHES } from './frozen.mjs';
import { assertBindings, snapshotHash } from '../artwork-next-push-20261013/metadata-guard.mjs';
export { assertBindings, snapshotHash };

const rowKey = row => `${row.scope}:${row.identity}`;
const ordered = rows => [...rows].sort((a, b) => rowKey(a).localeCompare(rowKey(b)));
const counts = rows => Object.fromEntries(['printings', 'variants', 'names', 'sets', 'assets', 'links', 'sources'].map(scope => [scope, rows.filter(r => r.scope === scope).length]));

const sourceFields = ['id', 'code', 'active', 'base_url', 'terms_url', 'created_at', 'updated_at', 'source_type', 'display_name', 'deprecated_at', 'robots_policy', 'internal_notes', 'licence_status', 'deprecated_reason', 'rate_limit_config', 'source_updated_at', 'attribution_required'].sort();
const creationsByClient = new WeakMap();

function assertNewSourceDefaults(source) {
  check(isDeepStrictEqual(Object.keys(source).sort(), sourceFields), 'New source must contain exactly the full17 JSON fields');
  check(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(source.id), 'New provenance UUID required');
  check(['created_at', 'updated_at'].every(field => typeof source[field] === 'string' && Number.isFinite(Date.parse(source[field]))) && source.created_at === source.updated_at, 'Generated source timestamps changed');
  check(isDeepStrictEqual(selectFields(source, ['terms_url', 'robots_policy', 'rate_limit_config', 'source_updated_at', 'deprecated_reason']), { terms_url: null, robots_policy: null, rate_limit_config: {}, source_updated_at: null, deprecated_reason: null }), 'Unexpected new provenance defaults');
}

export function assertSourcePolicies(plan, sources, environment, complete = false) {
  validateSourcePlan(plan);
  if (environment === 'production') for (const [code, sha256] of Object.entries(EXISTING_SOURCE_ROW_HASHES)) {
    const old = sources.find(source => source.code === code);
    check(old && canonicalHash(old) === sha256, `Full17-field existing provenance changed: ${code}`);
  }
  const existing = plan.source_policies[environment];
  const policies = complete ? [...existing, ...plan.new_sources[environment]] : existing;
  check(new Set(sources.map(source => source.code)).size === sources.length && sources.length === policies.length, 'Unexpected provenance source count or frozen source absence changed');
  for (const source of sources) {
    const expected = policies.find(policy => policy.code === source.code);
    check(expected && isDeepStrictEqual(selectFields(source, SOURCE_FIELDS), expected), 'Existing or planned source policy changed');
    if (source.code === 'tcgcollector') assertNewSourceDefaults(source);
  }
  for (const policy of policies) check(sources.some(source => source.code === policy.code), 'Required provenance source missing');
}

export async function readSourceRows(db) {
  // The same PostgreSQL JSON reader serves snapshots and resolver, preserving
  // all17 fields and timestamp microseconds. Domain aliases are sentinel rows.
  const result = await db.query('select to_jsonb(source) as payload from ingest.sources source where code=any($1::text[]) or base_url ilike any($2::text[]) order by code limit 4 for share', [SOURCE_CODES, ['%scrydex.com%', '%pokellector.com%', '%tcgcollector.com%']]);
  return result.rows.map(({ payload }) => payload);
}

export function recordSourceCreations(db, created, sources) {
  check(created.length === 1 && created[0].code === 'tcgcollector', 'Exactly one source creation receipt required');
  const observed = sources.find(source => source.code === 'tcgcollector');
  check(observed && isDeepStrictEqual(observed, created[0]), 'Full17 newly inserted source changed before resolver completion');
  creationsByClient.set(db, created.map(source => ({ code: source.code, id: source.id, full_row_sha256: canonicalHash(source) })));
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
  // PostgreSQL JSON retains all17 fields and timestamp microseconds. Reading
  // columns directly lets pg turn timestamps into millisecond Date objects,
  // which cannot equal the immutable full-row JSON baseline.
  const sources = (await readSourceRows(db)).map(payload => ({ scope: 'sources', identity: String(payload.id), payload }));
  check(printings.length === expected.printings && variants.length === expected.variants && names.length === expected.names && sets.length === expected.sets && assets.length <= 200 && links.length <= 200, 'Scoped snapshot counts changed');
  return ordered([...printings, ...variants, ...names, ...sets, ...assets, ...links, ...sources]);
}

export function compareSnapshots(before, after, journal, plan, environment, creationReceipt = []) {
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
  check(sourceRows.length === 1 && creationReceipt.length === 1, 'Exactly one journalled inactive provenance insertion required');
  for (const row of sourceRows) check(creationReceipt.some(created => created.code === row.payload.code && created.id === row.payload.id && created.full_row_sha256 === canonicalHash(row.payload)), 'Full17 created source changed after insertion');
  check(added.length === assetRows.length + linkRows.length + sourceRows.length, 'Unexpected catalogue metadata insertion');
  assertSourcePolicies(plan, after.filter(r => r.scope === 'sources').map(r => r.payload), environment, true);
  check(journal.metadata_changes === 0 && !journal.catalogue_corrections?.length && !journal.native_name_corrections?.length, 'Unapproved metadata change');
  return { status: 'all_existing_scoped_rows_preserved', before_sha256: snapshotHash(before), after_sha256: snapshotHash(after), before_counts: counts(before), after_counts: counts(after), created_assets: assetRows.length, created_links: linkRows.length, new_inactive_provenance_sources: sourceRows.length, created_provenance_sources: creationReceipt, staging_fixture_sources: environment === 'staging' ? sourceRows.length : 0, metadata_changes: 0, variant_changes: 0, existing_source_policy_changes: 0 };
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
      const result = compareSnapshots(before.snapshot, snapshot, journal, plan, environment, creationsByClient.get(db) ?? []);
      await save(environment, before.sequence, 'after', snapshot);
      return result;
    },
  };
}
