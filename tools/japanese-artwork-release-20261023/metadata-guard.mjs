import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { check, digest } from '../queue1-publish-20260927/publish.mjs';
import { assetId } from '../artwork3303-publish-20260928/publish.mjs';

export const BINDING_FIELDS = ['game_code', 'language_code', 'set_id', 'set_code', 'printing_id', 'collector_number', 'card_native_name', 'variant_id', 'variant_code', 'finish_code', 'is_default', 'same_artwork_as_variant_id', 'catalogue_version_id'];
export const SOURCE_FIELDS = ['id', 'code', 'active', 'base_url', 'terms_url', 'created_at', 'updated_at', 'source_type', 'display_name', 'deprecated_at', 'robots_policy', 'internal_notes', 'licence_status', 'deprecated_reason', 'rate_limit_config', 'source_updated_at', 'attribution_required'];
const INSERT_SOURCE_FIELDS = ['code', 'display_name', 'source_type', 'base_url', 'licence_status', 'attribution_required', 'active', 'internal_notes'];
const SCOPES = ['printings', 'variants', 'names', 'sets', 'assets', 'links', 'sources'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const creationsByClient = new WeakMap();
const selectFields = (row, fields) => Object.fromEntries(fields.map(key => [key, row[key]]));
const rowKey = row => `${row.scope}:${row.identity}`;
export const orderedSnapshot = rows => [...rows].sort((a, b) => rowKey(a).localeCompare(rowKey(b)));
export const snapshotCounts = rows => Object.fromEntries(SCOPES.map(scope => [scope, rows.filter(row => row.scope === scope).length]));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    check(!(value instanceof Date), 'PostgreSQL JSON timestamps must remain exact strings');
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}
export const snapshotHash = value => digest(Buffer.from(JSON.stringify(canonical(value))));

function environmentIsKnown(environment) {
  check(environment === 'production' || environment === 'staging', 'Known artwork environment required');
}

function inactiveSource(source) {
  check(source.code === 'tcgcollector' && source.active === false && source.licence_status === 'under_review' && source.attribution_required === true && source.source_type === 'image' && source.base_url === 'https://www.tcgcollector.com', 'Only inactive TCGCollector provenance is in scope');
  check(typeof source.display_name === 'string' && source.display_name.length > 0 && typeof source.internal_notes === 'string' && source.internal_notes.length > 0, 'Explicit provenance description required');
}

export function validateSourcePlan(plan) {
  for (const environment of ['production', 'staging']) {
    const existing = plan.sourcePolicies?.[environment], added = plan.newSources?.[environment];
    check(Array.isArray(existing) && Array.isArray(added), 'Frozen existing and new source policies required');
    check(existing.length <= 1 && added.length <= 1 && existing.length + added.length === 1, 'Exactly one TCGCollector provenance binding required');
    for (const source of existing) {
      check(isDeepStrictEqual(Object.keys(source).sort(), [...SOURCE_FIELDS].sort()), 'Existing source must freeze all17 JSON fields');
      inactiveSource(source);
      check(UUID.test(source.id) && source.deprecated_at === null, 'Existing provenance must be available');
      snapshotHash(source);
    }
    for (const source of added) {
      check(environment === 'staging' && isDeepStrictEqual(Object.keys(source).sort(), [...INSERT_SOURCE_FIELDS].sort()), 'Only an explicit temporary staging provenance fixture is allowed');
      inactiveSource(source);
    }
  }
  check(plan.sourcePolicies.production.length === 1 && plan.newSources.production.length === 0, 'Production source creation is prohibited');
}

function assertFixtureDefaults(source) {
  check(isDeepStrictEqual(Object.keys(source).sort(), [...SOURCE_FIELDS].sort()) && UUID.test(source.id), 'New source must retain exactly all17 JSON fields');
  check(['created_at', 'updated_at'].every(field => typeof source[field] === 'string' && Number.isFinite(Date.parse(source[field]))) && source.created_at === source.updated_at, 'Generated provenance timestamps changed');
  check(isDeepStrictEqual(selectFields(source, ['terms_url', 'robots_policy', 'rate_limit_config', 'source_updated_at', 'deprecated_at', 'deprecated_reason']), { terms_url: null, robots_policy: null, rate_limit_config: {}, source_updated_at: null, deprecated_at: null, deprecated_reason: null }), 'Unexpected temporary provenance defaults');
}

export function assertSourcePolicies(plan, sources, environment, complete = false) {
  environmentIsKnown(environment);
  validateSourcePlan(plan);
  const existing = plan.sourcePolicies[environment], fixtures = complete ? plan.newSources[environment] : [];
  check(sources.length === existing.length + fixtures.length && new Set(sources.map(source => source.code)).size === sources.length, 'Unexpected provenance count or source alias');
  for (const expected of existing) check(sources.some(source => isDeepStrictEqual(source, expected)), 'Full17-field existing provenance changed');
  for (const expected of fixtures) {
    const source = sources.find(row => row.code === expected.code);
    check(source && isDeepStrictEqual(selectFields(source, INSERT_SOURCE_FIELDS), expected), 'Temporary provenance policy changed');
    assertFixtureDefaults(source);
  }
}

export async function readSourceRows(db) {
  // JSON preserves PostgreSQL timestamp microseconds; aliases are sentinels,
  // never an invitation to adopt another source or change its policy.
  const result = await db.query('select to_jsonb(source) as payload from ingest.sources source where lower(code)=any($1::text[]) or base_url ilike any($2::text[]) order by code limit 3 for share', [['tcgcollector'], ['%tcgcollector.com%']]);
  return result.rows.map(({ payload }) => payload);
}

export function createSourceResolver(plan) {
  validateSourcePlan(plan);
  return async (db, _receipt, environment) => {
    environmentIsKnown(environment);
    // Clear an earlier rolled-back rehearsal receipt on the same client.
    creationsByClient.delete(db);
    const existing = await readSourceRows(db);
    assertSourcePolicies(plan, existing, environment);
    const created = [];
    for (const source of plan.newSources[environment]) {
      const result = await db.query('insert into ingest.sources as source(code,display_name,source_type,base_url,licence_status,attribution_required,active,internal_notes) values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(code) do nothing returning to_jsonb(source) as payload', INSERT_SOURCE_FIELDS.map(field => source[field]));
      check(result.rows.length === 1 && result.rows[0].payload?.code === source.code, 'Concurrent provenance creation; no existing source adoption');
      created.push(result.rows[0].payload);
    }
    const sources = await readSourceRows(db);
    assertSourcePolicies(plan, sources, environment, true);
    check(created.length === plan.newSources[environment].length && created.every(source => sources.some(observed => isDeepStrictEqual(source, observed))), 'Full17 created provenance changed before resolver completion');
    creationsByClient.set(db, created.map(source => ({ id: source.id, code: source.code, full_row_sha256: snapshotHash(source) })));
    return new Map(sources.map(source => [source.code, source.id]));
  };
}

function expectedCounts(plan, environment) {
  check(plan.scopeCounts?.[environment]?.sources === undefined || plan.scopeCounts[environment].sources === plan.sourcePolicies[environment].length, 'Frozen source count differs from source policies');
  const counts = { ...plan.scopeCounts?.[environment], sources: plan.sourcePolicies[environment].length };
  for (const scope of SCOPES) check(Number.isSafeInteger(counts[scope]) && counts[scope] >= 0 && counts[scope] < 100_000, `Frozen bounded ${scope} count required`);
  return counts;
}

export function assertBindings(plan, cards, environment) {
  environmentIsKnown(environment);
  const sort = rows => rows.map(row => selectFields(row, BINDING_FIELDS)).sort((a, b) => a.variant_id.localeCompare(b.variant_id));
  const expected = plan.bindingExpectations?.[environment];
  check(Array.isArray(expected) && expected.length > 0 && expected.every(card => BINDING_FIELDS.every(field => Object.hasOwn(card, field))) && new Set(expected.map(card => card.variant_id)).size === expected.length, 'Complete unique frozen variant bindings required');
  check(cards.every(card => UUID.test(card.variant_id ?? '')) && isDeepStrictEqual(sort(cards), sort(expected)), 'Current identity, native name, edition, finish or default changed');
}

export async function readSnapshot(db, rows, expected) {
  for (const scope of SCOPES) check(Number.isSafeInteger(expected[scope]) && expected[scope] >= 0 && expected[scope] < 100_000, `Bounded snapshot ${scope} count required`);
  const ids = rows.map(row => row.printing_id), setIds = [...new Set(rows.map(row => row.set_id))];
  const read = async (scope, sql, parameters, identity = row => row.id) => (await db.query(sql, parameters)).rows.map(({ payload }) => ({ scope, identity: String(identity(payload)), payload }));
  const printings = await read('printings', 'select to_jsonb(scoped) as payload from catalog.card_printings scoped where id=any($1::uuid[]) for share', [ids]);
  const variants = await read('variants', `select to_jsonb(scoped) as payload from catalog.card_variants scoped where printing_id=any($1::uuid[]) limit ${expected.variants + 1} for share`, [ids]);
  const variantIds = variants.map(row => row.payload.id);
  const names = await read('names', `select to_jsonb(scoped) as payload from catalog.card_names scoped where printing_id=any($1::uuid[]) limit ${expected.names + 1} for share`, [ids]);
  const sets = await read('sets', 'select to_jsonb(scoped) as payload from catalog.sets scoped where id=any($1::uuid[]) for share', [setIds]);
  const assetLimit = expected.assets + rows.length, linkLimit = expected.links + rows.length;
  const assets = await read('assets', `select to_jsonb(scoped) as payload from catalog.assets scoped where printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]) or (printing_id is null and variant_id is null and set_id=any($3::uuid[])) limit ${assetLimit + 1} for share`, [ids, variantIds, setIds]);
  const links = await read('links', `select to_jsonb(scoped) as payload from catalog.catalogue_version_assets scoped where printing_id=any($1::uuid[]) or variant_id=any($2::uuid[]) or asset_id=any($3::uuid[]) or (printing_id is null and variant_id is null and set_id=any($4::uuid[])) limit ${linkLimit + 1} for share`, [ids, variantIds, assets.map(row => row.payload.id), setIds], row => `${row.catalogue_version_id}:${row.asset_id}`);
  const sources = (await readSourceRows(db)).map(payload => ({ scope: 'sources', identity: String(payload.id), payload }));
  check(printings.length === expected.printings && variants.length === expected.variants && names.length === expected.names && sets.length === expected.sets && assets.length <= assetLimit && links.length <= linkLimit, 'Scoped snapshot counts changed or sentinel overflow');
  return orderedSnapshot([...printings, ...variants, ...names, ...sets, ...assets, ...links, ...sources]);
}

export function compareSnapshots(before, after, journal, plan, environment, creationReceipt = []) {
  environmentIsKnown(environment);
  const old = new Map(before.map(row => [rowKey(row), row])), next = new Map(after.map(row => [rowKey(row), row]));
  check(old.size === before.length && next.size === after.length, 'Duplicate snapshot identity');
  for (const [key, row] of old) check(isDeepStrictEqual(next.get(key), row), `Existing scoped row changed: ${row.scope}`);
  const added = after.filter(row => !old.has(rowKey(row)));
  const createdAssets = journal.assets.filter(asset => asset.created), createdLinks = journal.links.filter(link => link.created);
  check(new Set(createdAssets.map(asset => asset.id)).size === createdAssets.length && new Set(createdLinks.map(link => `${link.catalogue_version_id}:${link.asset_id}`)).size === createdLinks.length, 'Duplicate artwork journal identity');
  const assetRows = added.filter(row => row.scope === 'assets'), linkRows = added.filter(row => row.scope === 'links'), sourceRows = added.filter(row => row.scope === 'sources');
  check(assetRows.length === createdAssets.length && linkRows.length === createdLinks.length, 'Artwork journal and new rows differ');
  for (const row of assetRows) {
    const printing = plan.rows.find(item => item.printing_id === row.payload.printing_id);
    check(printing && createdAssets.some(asset => asset.id === row.identity && asset.printing_id === printing.printing_id) && row.payload.asset_id === assetId(printing) && row.payload.variant_id === null && row.payload.asset_type === 'card_image' && row.payload.set_id === printing.set_id, 'Unexpected new printing-front asset');
  }
  const linkFields = ['catalogue_version_id', 'language_code', 'set_id', 'printing_id', 'variant_id', 'asset_id', 'asset_type'];
  for (const row of linkRows) {
    const link = createdLinks.find(item => `${item.catalogue_version_id}:${item.asset_id}` === row.identity);
    const printing = plan.rows.find(item => item.printing_id === row.payload.printing_id);
    const binding = plan.bindingExpectations[environment].find(item => item.printing_id === row.payload.printing_id);
    const asset = after.find(item => item.scope === 'assets' && item.identity === row.payload.asset_id)?.payload;
    check(link && printing && binding && asset && isDeepStrictEqual(selectFields(row.payload, linkFields), selectFields(link, linkFields)) && row.payload.variant_id === null && row.payload.set_id === printing.set_id && row.payload.language_code === printing.language_code && row.payload.catalogue_version_id === binding.catalogue_version_id && asset.asset_id === assetId(printing) && asset.printing_id === printing.printing_id, 'Unexpected new printing-front link');
  }
  check(sourceRows.length === plan.newSources[environment].length && creationReceipt.length === sourceRows.length, 'Only the planned temporary staging source may be inserted');
  for (const row of sourceRows) check(creationReceipt.some(created => created.id === row.payload.id && created.code === row.payload.code && created.full_row_sha256 === snapshotHash(row.payload)), 'Full17 created provenance changed after insertion');
  check(added.length === assetRows.length + linkRows.length + sourceRows.length, 'Unexpected catalogue metadata insertion');
  assertSourcePolicies(plan, after.filter(row => row.scope === 'sources').map(row => row.payload), environment, true);
  check(journal.metadata_changes === 0 && !journal.catalogue_corrections?.length && !journal.native_name_corrections?.length, 'Unapproved catalogue metadata change');
  return { status: 'all_existing_scoped_rows_preserved', before_sha256: snapshotHash(before), after_sha256: snapshotHash(after), before_counts: snapshotCounts(before), after_counts: snapshotCounts(after), created_assets: assetRows.length, created_links: linkRows.length, created_provenance_sources: creationReceipt, new_inactive_provenance_sources: sourceRows.length, staging_fixture_sources: environment === 'staging' ? sourceRows.length : 0, metadata_changes: 0, variant_changes: 0, existing_source_policy_changes: 0, source_policy_changes: 0 };
}

export function createMetadataGuard(plan, { privateOutput = null } = {}) {
  validateSourcePlan(plan);
  check(Array.isArray(plan.rows) && plan.rows.length > 0 && plan.rows.length < 1000 && new Set(plan.rows.map(row => row.printing_id)).size === plan.rows.length, 'Unique finite printing-front scope required');
  check(plan.rows.every(row => UUID.test(row.printing_id ?? '') && UUID.test(row.set_id ?? '') && row.language_code === 'ja' && row.source_code === 'tcgcollector' && row.variant_id == null && row.objects?.[0]?.role === 'original'), 'Only frozen Japanese TCGCollector printing fronts are in scope');
  for (const environment of ['production', 'staging']) {
    const counts = expectedCounts(plan, environment);
    const bindings = plan.bindingExpectations?.[environment];
    check(Array.isArray(bindings) && bindings.length >= plan.rows.length && bindings.length <= counts.variants && counts.printings === plan.rows.length && counts.sets === new Set(plan.rows.map(row => row.set_id)).size && /^[a-f0-9]{64}$/u.test(plan.beforeSnapshotHashes?.[environment] ?? ''), 'Frozen scope, visible bindings and full before snapshot required');
    // Preserve deprecated variant rows in the full table snapshot even when the
    // published API correctly excludes them. Every publication printing still
    // needs at least one exact, frozen visible variant binding.
    const printingIds = new Set(plan.rows.map(row => row.printing_id));
    check(bindings.every(binding => printingIds.has(binding.printing_id)) && new Set(bindings.map(binding => binding.printing_id)).size === printingIds.size, 'Frozen visible bindings must cover exactly every publication printing');
    assertBindings(plan, plan.bindingExpectations[environment], environment);
  }
  const sequences = new Map();
  const save = async (environment, sequence, phase, snapshot) => {
    if (!privateOutput) return;
    await mkdir(privateOutput, { recursive: true });
    await writeFile(path.join(privateOutput, `${environment}-${sequence}-${phase}.json`), JSON.stringify(snapshot, null, 2));
  };
  const readBindings = async (db, rows, environment) => {
    // api.catalogue_cards does not expose is_default. Read the three physical
    // variant fields from their canonical row rather than inventing a view field.
    const variantFields = new Set(['variant_code', 'finish_code', 'is_default']);
    const fields = BINDING_FIELDS.map(field => `${variantFields.has(field) ? 'v' : 'c'}.${field}`);
    const result = await db.query(`select ${fields.join(',')} from api.catalogue_cards c join catalog.card_variants v on v.id=c.variant_id where c.printing_id=any($1::uuid[]) limit ${plan.bindingExpectations[environment].length + 1}`, [rows.map(row => row.printing_id)]);
    assertBindings(plan, result.rows, environment);
  };
  return {
    async before(db, rows, environment) {
      environmentIsKnown(environment);
      check(isDeepStrictEqual(rows, plan.rows), 'Frozen publication row scope changed');
      const sequence = (sequences.get(environment) ?? 0) + 1;
      sequences.set(environment, sequence);
      const snapshot = await readSnapshot(db, rows, expectedCounts(plan, environment));
      check(isDeepStrictEqual(snapshotCounts(snapshot), expectedCounts(plan, environment)) && snapshotHash(snapshot) === plan.beforeSnapshotHashes[environment], 'Frozen full before snapshot changed');
      await readBindings(db, rows, environment);
      assertSourcePolicies(plan, snapshot.filter(row => row.scope === 'sources').map(row => row.payload), environment);
      await save(environment, sequence, 'before', snapshot);
      return { snapshot, sequence };
    },
    async after(db, rows, environment, before, journal) {
      const snapshot = await readSnapshot(db, rows, expectedCounts(plan, environment));
      const result = compareSnapshots(before.snapshot, snapshot, journal, plan, environment, creationsByClient.get(db) ?? []);
      await readBindings(db, rows, environment);
      await save(environment, before.sequence, 'after', snapshot);
      return result;
    },
  };
}
