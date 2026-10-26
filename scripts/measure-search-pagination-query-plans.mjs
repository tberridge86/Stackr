import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { createNativePostgresFixture, nativeFixtureEnabled } from './test-fixtures/native-postgres-fixture.mjs';
import { createSearchDatabase, identityQuery, proposal, schema } from './test-fixtures/search-pagination-db.mjs';

const native = await createNativePostgresFixture();
let fixture;
try { fixture = await createSearchDatabase(native); }
catch (error) { await native?.close(); throw error; }
const { db } = fixture;
const parameterized = identityQuery.replace(/\bp_selector\b/g, '($1::jsonb)')
  .replace(/\bp_after\b/g, '($2::jsonb)').replace(/\bp_limit\b/g, '($3::integer)')
  .replace(/\bp_expected_revision\b/g, '($4::text)').replace(/\bp_exclude_selector\b/g, '($5::jsonb)');
const hash = text => createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex');
const median = values => {
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const output = {
  environment: nativeFixtureEnabled() ? 'isolated CI PostgreSQL17 synthetic fixture' : 'local in-memory PGlite synthetic fixture',
  hostedExecution: false, sourceSchemaObservedAt: schema.observedAt,
  proposalSha256: hash(proposal), schemaSha256: hash(JSON.stringify(schema)), samplesPerVariant: 4,
  newIndexes: [], cohorts: [],
  limitations: ['No installed-device, HTTP, edge-cache or hosted latency measurement.',
    'Existing columns, views and indexes are copied; the fixture omits foreign-key/check/default contracts.',
    'Five thousand unrelated synthetic printings stress name selectivity; this is not production cardinality.',
    'Legacy search is deliberately bounded and incomplete; its latency is not an equivalent complete-search latency.',
    'Result JSON bytes are internal SQL responses, not mobile API payload sizes.'],
};
try {
  output.postgres = (await db.query('select version() version')).rows[0].version;
  await db.exec("set work_mem='2184kB'");
  for (const [name, count, multilingual] of [['empty', 0, false], ['small', 24, false], ['large', 601, false], ['multilingual', 250, true]]) {
    const population = await fixture.seed({ count, multilingual, finishes: 2, unrelatedCount: 5000 });
    const selector = { kind: 'name', normalized: 'fixturemon', nameTypes: ['native', 'english_display'], setIds: [] };
    const values = [JSON.stringify(selector), null, 50, null, null];
    const namesQuery = "select name_type,name,normalized_name,printing_id,variant_id from api.catalogue_card_names where normalized_name='fixturemon' and name_type in ('native','english_display') limit 200";
    const names = (await db.query(namesQuery)).rows;
    const printings = [...new Set(names.filter(n => !n.variant_id).map(n => n.printing_id))];
    const hydrationQuery = 'select * from api.catalogue_cards where printing_id=any($1::uuid[]) limit ' + Math.max(1, printings.length * 8);
    async function legacy() {
      await db.query(namesQuery);
      return (await db.query(hydrationQuery, [printings])).rows;
    }
    async function candidate() { return (await db.query(parameterized, values)).rows[0].jsonb_build_object; }
    const initial = await candidate();
    assert.equal(initial.entries.length, Math.min(50, count * 2));
    assert.equal(initial.hasMore, count * 2 > 50);
    assert.equal(new Set(initial.entries.map(e => e.entityId)).size, initial.entries.length);
    assert.ok(initial.entries.every(e => e.cardRow.card_native_name === 'Fixturemon'));
    const timing = { legacyBounded: [], candidateBody: [], candidateFunction: [] };
    const execute = { legacyBounded: legacy, candidateBody: candidate, candidateFunction: () => fixture.page(selector) };
    assert.deepEqual(await execute.candidateFunction(), initial);
    for (const round of [0, 1, 2, 3]) {
      for (const label of round % 2 ? ['candidateFunction', 'candidateBody', 'legacyBounded'] : ['legacyBounded', 'candidateBody', 'candidateFunction']) {
        const start = performance.now(); await execute[label](); timing[label].push(performance.now() - start);
      }
    }
    const legacyRows = await legacy();
    const explain = async (query, args = []) => (await db.query('explain (analyze,buffers,format json) ' + query, args)).rows[0]['QUERY PLAN'][0];
    const plans = { legacyNames: await explain(namesQuery), legacyHydration: await explain(hydrationQuery, [printings]), candidateFirst: await explain(parameterized, values) };
    if (initial.hasMore) {
      const after = { entityType: initial.entries.at(-1).entityType, entityId: initial.entries.at(-1).entityId };
      const continuation = await fixture.page(selector, after, 50, initial.revision);
      assert.ok(continuation.entries.every(e => !initial.entries.some(first => first.entityId === e.entityId)));
      plans.candidateContinuation = await explain(parameterized, [values[0], JSON.stringify(after), 50, initial.revision, null]);
    }
    const nameScans = [];
    function inspect(node) {
      if (node['Relation Name'] === 'card_names' && node['Actual Loops'] > 0) nameScans.push(node);
      for (const child of node.Plans ?? []) inspect(child);
    }
    inspect(plans.candidateFirst.Plan);
    assert.ok(nameScans.every(node => node['Node Type'] !== 'Seq Scan'), 'an exact-name page cannot scan the unrelated name population');
    assert.ok(nameScans.reduce((sum, node) => sum + node['Actual Rows'] * node['Actual Loops'], 0) <= count,
      'only the matching stored native names should pass indexed selection');
    const membershipScans = [];
    function inspectMembership(node) {
      if (node['Relation Name'] === 'catalogue_version_printings' && node['Actual Loops'] > 0) membershipScans.push(node);
      for (const child of node.Plans ?? []) inspectMembership(child);
    }
    inspectMembership(plans.candidateFirst.Plan);
    assert.ok(membershipScans.every(node => node['Node Type'] !== 'Seq Scan'),
      'published-printing membership checks must not scan the unrelated population');
    assert.ok(membershipScans.reduce((sum, node) => sum + node['Actual Rows'] * node['Actual Loops'], 0) <= count,
      'membership probes must follow only matching printing-scoped names');
    output.cohorts.push({ name, matchingPrintings: count, matchingVariants: count * 2, unrelatedPrintings: 5000,
      totalVariants: population.variants.length, legacyMatchedNames: names.length, legacyHydratedVariants: legacyRows.length,
      candidateHydratedVariants: initial.entries.length, candidateHasMore: initial.hasMore,
      indexedExactNameSelection: true,
      candidateInternalJsonBytes: Buffer.byteLength(JSON.stringify(initial)),
      timing: Object.fromEntries(Object.entries(timing).map(([label, samples]) => [label, { medianMs: median(samples), samplesMs: samples }])), plans });
  }
  const rollback = readFileSync(new URL('../docs/releases/evidence/search-pagination-20261026/search-identity-page-rollback.sql', import.meta.url), 'utf8');
  assert.ok(!/cascade/i.test(rollback));
  await db.exec('reset role; ' + rollback);
  assert.equal((await db.query("select to_regprocedure('api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)') object")).rows[0].object, null);
  output.localRollbackVerified = true;
  console.log(JSON.stringify(output, null, 2));
} finally { await db.close(); }
