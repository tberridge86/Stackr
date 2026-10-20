import assert from 'node:assert/strict';
import {
  buildRawRetentionInput,
  currentVersion,
  listPublishedTcgdexIdentities,
  retainCardmarketTcgdexProvenance,
  tcgdexCardIdFromExternalId,
  validatePhysicalIdentityRows,
  validateTcgdexPricePayload,
} from './retain-cardmarket-tcgdex-provenance.mjs';

const ids = {
  version: '00000000-0000-4000-8000-000000000001', source: '00000000-0000-4000-8000-000000000002',
  variant1: '00000000-0000-4000-8000-000000000003', variant2: '00000000-0000-4000-8000-000000000004',
  printing1: '00000000-0000-4000-8000-000000000005', printing2: '00000000-0000-4000-8000-000000000006',
  set: '00000000-0000-4000-8000-000000000007', run: '00000000-0000-4000-8000-000000000008',
};
const identity = {
  catalogue_version_id: ids.version, source_id: ids.source, source_entity_type: 'card', language_code: 'zh-cn',
  external_id: 'SV9a-039:normal', set_id: null, printing_id: null, variant_id: ids.variant1,
  physical: { providerSetCode: 'SV9a', collectorNumber: '039' },
};
const payload = { id: 'SV9a-039', localId: '039', set: { id: 'SV9a' }, updated: '2026-10-04T00:00:00.000Z', pricing: { cardmarket: { idProduct: 699710 } } };
assert.equal(tcgdexCardIdFromExternalId('SV9a-039:normal:image'), 'SV9a-039');
assert.equal(validateTcgdexPricePayload(payload, 'SV9a-039', identity.physical), 699710);
const input = buildRawRetentionInput(identity, payload, { retrievedAt: '2026-10-04T12:00:00.000Z', sourceUrl: 'https://api.tcgdex.net/v2/zh-cn/cards/SV9a-039' });
assert.equal(input.recordType, 'variant');
assert.equal(input.externalId, identity.external_id, 'raw retention preserves the canonical external key rather than collapsing variants');
assert.match(input.payloadHash, /^[a-f0-9]{64}$/);
assert.throws(() => buildRawRetentionInput(identity, payload, { sourceUrl: 'https://api.tcgdex.net/v2/zh-cn/cards/SV9a-039/other' }), /Invalid TCGdex source URL/);
assert.throws(() => validateTcgdexPricePayload({ ...payload, localId: '040' }, 'SV9a-039', identity.physical), /set or collector number mismatch/);

function physicalRows(identities) {
  const variants = identities.map((row, index) => ({ id: row.variant_id, printing_id: index ? ids.printing2 : ids.printing1, language_code: 'zh-cn', deprecated_at: null }));
  return {
    memberships: identities.map((row, index) => ({ catalogue_version_id: ids.version, language_code: 'zh-cn', set_id: ids.set, printing_id: index ? ids.printing2 : ids.printing1, variant_id: row.variant_id })),
    variants,
    printings: [{ id: ids.printing1, set_id: ids.set, language_code: 'zh-cn', collector_number: '039', deprecated_at: null }, { id: ids.printing2, set_id: ids.set, language_code: 'zh-cn', collector_number: '040', deprecated_at: null }],
    sets: [{ id: ids.set, language_code: 'zh-cn', set_code: 'SV9a', provider_set_code: 'SV9a', deprecated_at: null }],
    languageRow: { code: 'zh-cn', active: true, deprecated_at: null },
  };
}
assert.equal(validatePhysicalIdentityRows({ language: 'zh-cn', version: { id: ids.version }, identities: [identity], ...physicalRows([identity]) })[0].physical.collectorNumber, '039');
assert.throws(() => validatePhysicalIdentityRows({ language: 'zh-cn', version: { id: ids.version }, identities: [{ ...identity, source_entity_type: 'set', variant_id: ids.variant1 }], ...physicalRows([identity]) }), /card-to-variant/);

class Query {
  constructor(db, schema, table) { this.db = db; this.schemaName = schema; this.table = table; this.filters = []; this.mode = 'select'; this.body = null; }
  select() { return this; } eq(key, value) { this.filters.push(['eq', key, value]); return this; } is(key, value) { this.filters.push(['is', key, value]); return this; }
  in(key, value) { this.filters.push(['in', key, value]); return this; } gt(key, value) { this.filters.push(['gt', key, value]); return this; }
  order() { return this; } limit(value) { this.limitValue = value; return this; } update(body) { this.mode = 'update'; this.body = body; return this; } insert(body) { this.mode = 'insert'; this.body = body; return this; }
  then(resolve, reject) { return Promise.resolve().then(() => this.db.resolve(this)).then(resolve, reject); }
}
function mockDb({ preexistingRun = null, rpcChanges = ['inserted'] } = {}) {
  const identities = [
    { ...identity, external_id: 'SV9a-039', variant_id: ids.variant1 },
    { ...identity, external_id: 'SV9a-040:normal', variant_id: ids.variant2 },
  ];
  const db = {
    updates: [], retained: [], fetches: [], run: preexistingRun, rpcChanges: [...rpcChanges],
    schema(schemaName) { return { from: table => new Query(this, schemaName, table), rpc: (name, args) => Promise.resolve(this.rpc(name, args)) }; },
    rpc(name, args) { assert.equal(name, 'retain_raw_source_record'); this.retained.push(args); return { data: { id: ids.run, changed: this.rpcChanges.shift() ?? 'inserted' }, error: null }; },
    resolve(query) {
      const filter = (key) => query.filters.find(([,, value], index) => query.filters[index][1] === key)?.[2];
      const all = (key) => query.filters.find(entry => entry[1] === key)?.[2];
      if (query.mode === 'update') { this.updates.push({ table: query.table, body: query.body }); if (query.table === 'import_runs' && this.run) this.run = { ...this.run, ...query.body }; return { data: null, error: null }; }
      if (query.mode === 'insert') { this.run = { id: ids.run, status: 'running', metadata: query.body.metadata }; return { data: [this.run], error: null }; }
      if (query.schemaName === 'catalog' && query.table === 'catalogue_versions') return { data: [{ id: ids.version, language_code: 'zh-cn', published_at: '2026-10-04T01:00:00Z', created_at: '2026-10-04T00:00:00Z' }], error: null };
      if (query.schemaName === 'ingest' && query.table === 'sources') return { data: [{ id: ids.source, code: 'tcgdex', display_name: 'TCGdex', base_url: 'https://api.tcgdex.net/v2', terms_url: 'https://tcgdex.dev', licence_status: 'reviewed-existing-status', attribution_required: true, active: true, deprecated_at: null }], error: null };
      if (query.schemaName === 'ingest' && query.table === 'import_runs') return { data: this.run ? [this.run] : [], error: null };
      if (query.schemaName === 'catalog' && query.table === 'catalogue_version_external_identifiers') {
        const after = all('external_id'); const page = after ? identities.filter(row => row.external_id > after) : identities;
        return { data: page.slice(0, query.limitValue), error: null };
      }
      if (query.schemaName === 'catalog' && query.table === 'catalogue_version_variants') return { data: physicalRows(identities).memberships, error: null };
      if (query.schemaName === 'catalog' && query.table === 'card_variants') return { data: physicalRows(identities).variants, error: null };
      if (query.schemaName === 'catalog' && query.table === 'card_printings') return { data: physicalRows(identities).printings, error: null };
      if (query.schemaName === 'catalog' && query.table === 'sets') return { data: physicalRows(identities).sets, error: null };
      if (query.schemaName === 'catalog' && query.table === 'languages') return { data: [physicalRows(identities).languageRow], error: null };
      throw Error(`Unexpected mocked table ${query.schemaName}.${query.table}`);
    },
  };
  return db;
}

const listedDb = mockDb();
const listed = await listPublishedTcgdexIdentities(listedDb, { language: 'zh-cn', limit: 2 });
assert.equal(listed.version.id, ids.version, 'the newest ordered published version is selected even if historical versions exist');
assert.deepEqual(listed.identities.map(row => row.external_id), ['SV9a-039', 'SV9a-040:normal'], 'card source entities retain canonical :normal variant keys');

const db = mockDb();
const fetchImpl = async url => ({ status: url.endsWith('SV9a-039') ? 200 : 404, ok: url.endsWith('SV9a-039'), json: async () => url.endsWith('SV9a-039') ? { ...payload, id: 'SV9a-039', localId: '039' } : null });
const summary = await retainCardmarketTcgdexProvenance({ db, language: 'zh-cn', limit: 3, apply: true, runKey: 'raw-retention-test-20261004', fetchImpl });
assert.equal(summary.inserted, 1); assert.equal(summary.skipped, 1, '404 is recorded as a skip and does not abort the page');
assert.equal(db.retained[0].p_licence_status, 'reviewed-existing-status', 'retention passes the recorded source licence status verbatim');
assert.equal(db.retained[0].p_http_metadata.sourceTermsUrl, 'https://tcgdex.dev');
assert.equal(db.updates.at(-1).body.status, 'completed');
assert.equal(db.updates.at(-1).body.records_skipped, 1);
assert.equal(db.updates.at(-1).body.metadata.checkpoint.externalId, 'SV9a-040:normal');
const noProduct = mockDb();
const noProductSummary = await retainCardmarketTcgdexProvenance({ db: noProduct, language: 'zh-cn', limit: 3, apply: true, runKey: 'raw-retention-no-product-20261004', fetchImpl: async url => ({ status: 200, ok: true, json: async () => ({ id: url.endsWith('SV9a-039') ? 'SV9a-039' : 'SV9a-040', localId: url.endsWith('SV9a-039') ? '039' : '040', set: { id: 'SV9a' }, pricing: { cardmarket: {} } }) }) });
assert.equal(noProductSummary.skipped, 2, 'a response without a Cardmarket product id is a durable skip rather than a page failure');
assert.equal(noProduct.updates.at(-1).body.status, 'completed');
const resume = mockDb({ preexistingRun: { id: ids.run, status: 'running', metadata: { purpose: 'cardmarket_tcgdex_provenance_only', canonicalWrites: false, catalogueVersionId: ids.version, language: 'zh-cn', intendedCohort: { sourceCode: 'tcgdex', sourceEntityType: 'card', recordScope: 'variant_identifiers', cursorPolicy: 'durable_checkpoint_only' }, checkpoint: { catalogueVersionId: ids.version, sourceEntityType: 'card', externalId: 'SV9a-039', languageCode: 'zh-cn' } }, records_requested: 8, records_retrieved: 7, records_inserted: 6, records_updated: 1, records_skipped: 1 } });
await retainCardmarketTcgdexProvenance({ resume, db: resume, language: 'zh-cn', limit: 3, apply: true, runKey: 'raw-retention-test-20261004', fetchImpl: async url => ({ status: 404, ok: false, json: async () => null }) });
assert.equal(resume.updates.at(-1).body.metadata.checkpoint.externalId, 'SV9a-040:normal', 'resume advances from its stored exact canonical key');
assert.equal(resume.updates.at(-1).body.records_requested, 9, 'resume preserves accumulated import-run counters before advancing');
const reused = mockDb({ rpcChanges: ['reused', 'reused'] });
const reusedSummary = await retainCardmarketTcgdexProvenance({ db: reused, language: 'zh-cn', limit: 3, apply: true, runKey: 'raw-retention-reused-20261004', fetchImpl: async url => ({ status: 200, ok: true, json: async () => ({ ...payload, id: url.endsWith('SV9a-039') ? 'SV9a-039' : 'SV9a-040', localId: url.endsWith('SV9a-039') ? '039' : '040' }) }) });
assert.equal(reusedSummary.retained, 2, 'a reused immutable raw revision still records its import-run observation');
assert.equal(reusedSummary.reused, 2);
assert.equal(reused.updates.at(-1).body.records_retrieved, 2);
assert.equal(reused.updates.at(-1).body.records_inserted, 0);
assert.equal(reused.updates.at(-1).body.records_updated, 0);
assert.equal(reused.updates.at(-1).body.records_skipped, 2, 'ingestion convention records reused revisions as skipped writes');
assert.deepEqual(reused.updates.at(-1).body.metadata.retentionAccounting, { reused: 2, providerSkipped: 0, identitySkipped: 0 });
const retry = mockDb({ preexistingRun: { id: ids.run, status: 'failed', metadata: { purpose: 'cardmarket_tcgdex_provenance_only', canonicalWrites: false, catalogueVersionId: ids.version, language: 'zh-cn', intendedCohort: { sourceCode: 'tcgdex', sourceEntityType: 'card', recordScope: 'variant_identifiers', cursorPolicy: 'durable_checkpoint_only' }, checkpoint: null, retentionAccounting: { reused: 1, providerSkipped: 0 } }, records_requested: 1, records_retrieved: 1, records_inserted: 0, records_updated: 0, records_skipped: 1 }, rpcChanges: ['reused', 'reused'] });
await retainCardmarketTcgdexProvenance({ db: retry, language: 'zh-cn', limit: 3, apply: true, runKey: 'raw-retention-retry-20261004', fetchImpl: async url => ({ status: 200, ok: true, json: async () => ({ ...payload, id: url.endsWith('SV9a-039') ? 'SV9a-039' : 'SV9a-040', localId: url.endsWith('SV9a-039') ? '039' : '040' }) }) });
assert.equal(retry.updates.at(-1).body.records_requested, 3, 'retry preserves durable prior request count');
assert.equal(retry.updates.at(-1).body.records_retrieved, 3);
assert.equal(retry.updates.at(-1).body.records_skipped, 3);
assert.deepEqual(retry.updates.at(-1).body.metadata.retentionAccounting, { reused: 3, providerSkipped: 0, identitySkipped: 0 }, 'retry persists aggregate reuse accounting without NaN');

for (const retiredTable of ['card_variants', 'card_printings', 'sets']) {
  const retired = mockDb();
  const originalResolve = retired.resolve.bind(retired);
  retired.resolve = query => {
    const result = originalResolve(query);
    if (query.schemaName === 'catalog' && query.table === retiredTable) result.data = result.data.map((row, index) => index === 0 ? { ...row, deprecated_at: '2026-08-20T00:00:00Z' } : row);
    return result;
  };
  let fetched = 0;
  const first = await retainCardmarketTcgdexProvenance({ db: retired, language: 'zh-cn', limit: 1, apply: true, runKey: `raw-retention-retired-${retiredTable}`, fetchImpl: async () => { fetched += 1; throw Error('Retired identity must not fetch provider data.'); } });
  assert.equal(first.scanned, 1);
  assert.equal(first.identitySkipped, 1);
  assert.equal(first.nextAfterExternalId, 'SV9a-039', 'an entirely retired full page must still advance its raw identity cursor');
  assert.equal(fetched, 0);
  assert.equal(retired.updates.at(-1).body.status, 'running', 'retired-only pages do not falsely complete the cohort');
  assert.equal(retired.updates.at(-1).body.metadata.checkpoint.externalId, 'SV9a-039');
  if (retiredTable !== 'sets') {
    const second = await retainCardmarketTcgdexProvenance({ db: retired, language: 'zh-cn', limit: 3, apply: true, runKey: `raw-retention-retired-${retiredTable}`, fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ ...payload, id: 'SV9a-040', localId: '040' }) }) });
    assert.equal(second.retained, 1, 'resume reaches and retains a live identity after the retired page');
    assert.equal(retired.updates.at(-1).body.records_requested, 2);
    assert.deepEqual(retired.updates.at(-1).body.metadata.retentionAccounting, { reused: 0, providerSkipped: 0, identitySkipped: 1 });
    assert.equal(retired.updates.at(-1).body.status, 'completed');
  }
}
const missingPhysical = mockDb();
const beforeMissingPhysical = missingPhysical.resolve.bind(missingPhysical);
missingPhysical.resolve = query => query.table === 'card_variants' ? { data: [], error: null } : beforeMissingPhysical(query);
const missingPage = await listPublishedTcgdexIdentities(missingPhysical, { language: 'zh-cn', limit: 1 });
assert.equal(missingPage.identities.length, 0, 'missing physical rows never become retention candidates');
assert.equal(missingPage.entries[0].skipped, 'invalid_physical_identity');
assert.equal(missingPage.nextAfterExternalId, 'SV9a-039');
const conflictingPhysical = mockDb();
const beforeConflictingPhysical = conflictingPhysical.resolve.bind(conflictingPhysical);
conflictingPhysical.resolve = query => {
  const result = beforeConflictingPhysical(query);
  if (query.table === 'card_variants') result.data = result.data.map(row => ({ ...row, language_code: 'zh-tw' }));
  return result;
};
const conflictingPage = await listPublishedTcgdexIdentities(conflictingPhysical, { language: 'zh-cn', limit: 1 });
assert.equal(conflictingPage.identities.length, 0, 'conflicting live languages remain quarantined');
assert.equal(conflictingPage.entries[0].skipped, 'invalid_physical_identity');
assert.match(conflictingPage.entries[0].validationError, /variant membership failed/);
const conflictSummary = await retainCardmarketTcgdexProvenance({ db: conflictingPhysical, language: 'zh-cn', limit: 1, apply: true, runKey: 'raw-retention-conflicting-20261005', fetchImpl: async () => { throw Error('Conflicting physical identities must never fetch provider data.'); } });
assert.deepEqual(conflictSummary.identitySkipReasons, { deprecated_identity: 0, invalid_physical_identity: 1 });
assert.equal(conflictingPhysical.updates.at(-1).body.status, 'running');
assert.deepEqual(conflictingPhysical.updates.at(-1).body.metadata.identitySkipReasons, { deprecated_identity: 0, invalid_physical_identity: 1 });
const malformedCheckpoint = mockDb({ preexistingRun: { id: ids.run, status: 'running', metadata: { purpose: 'cardmarket_tcgdex_provenance_only', canonicalWrites: false, catalogueVersionId: ids.version, language: 'zh-cn', intendedCohort: { sourceCode: 'tcgdex', sourceEntityType: 'card', recordScope: 'variant_identifiers', cursorPolicy: 'durable_checkpoint_only' }, checkpoint: { catalogueVersionId: ids.version, sourceEntityType: 'card', externalId: 'SV9a-039', languageCode: 'ja' } } } });
await assert.rejects(() => retainCardmarketTcgdexProvenance({ db: malformedCheckpoint, language: 'zh-cn', apply: true, runKey: 'raw-retention-checkpoint-20261004', fetchImpl }), /checkpoint is not bound/);
await assert.rejects(() => retainCardmarketTcgdexProvenance({ db: mockDb(), language: 'zh-cn', afterExternalId: 'SV9a-039', apply: true, runKey: 'raw-retention-jump-20261004', fetchImpl }), /durable import-run checkpoint/);
const invalidPage = mockDb();
const resolveBeforeInvalidPage = invalidPage.resolve.bind(invalidPage);
invalidPage.resolve = query => {
  if (query.schemaName === 'catalog' && query.table === 'catalogue_version_external_identifiers') return { data: [{ ...identity, external_id: 'SV9a-039', source_entity_type: 'set', variant_id: ids.variant1 }], error: null };
  return resolveBeforeInvalidPage(query);
};
await assert.rejects(() => retainCardmarketTcgdexProvenance({ db: invalidPage, language: 'zh-cn', apply: true, runKey: 'raw-retention-invalid-page-20261004', fetchImpl }), /card-to-variant/);
assert.equal(invalidPage.updates.at(-1).body.status, 'failed', 'validation failure after run creation marks the durable import run failed');
assert.equal(invalidPage.updates.at(-1).body.finished_at !== null, true);
const stale = mockDb({ preexistingRun: { id: ids.run, status: 'running', metadata: { purpose: 'cardmarket_tcgdex_provenance_only', catalogueVersionId: '00000000-0000-4000-8000-000000000099', language: 'zh-cn' } } });
await assert.rejects(() => retainCardmarketTcgdexProvenance({ db: stale, language: 'zh-cn', apply: true, runKey: 'raw-retention-test-20261004', fetchImpl }), /different current catalogue revision/);
console.log('Cardmarket TCGdex raw-retention runner verifies physical published membership, preserves stored source rights, and resumes safely.');
