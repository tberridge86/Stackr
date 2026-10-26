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
async function jitSettings() {
  return (await db.query("select current_setting('jit') jit, current_setting('jit_above_cost') jit_above_cost, current_setting('jit_inline_above_cost') jit_inline_above_cost, current_setting('jit_optimize_above_cost') jit_optimize_above_cost")).rows[0];
}
async function setJit(value) {
  assert.ok(['on', 'off'].includes(value));
  await db.exec("set jit='" + value + "'");
}
async function withSessionJit(value, read) {
  const before = await jitSettings();
  await setJit(value);
  try { return await read(); }
  finally {
    await setJit(before.jit);
    assert.deepEqual(await jitSettings(), before, 'temporary EXPLAIN setting must restore its caller');
  }
}
const jitOnProposal = proposal.replace('\nset jit = off', '');
assert.notEqual(jitOnProposal, proposal, 'candidate must have a function-local JIT override');
const originalJit = await jitSettings();
async function installJitVariant(label) {
  await db.exec('reset role; ' + (label === 'jitOff' ? proposal : jitOnProposal) + '; set role service_role;');
  await setJit('on');
  const contract = (await db.query("select provolatile,prosecdef,proconfig,prosrc,proacl::text from pg_proc where oid='api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)'::regprocedure")).rows[0];
  assert.equal(contract.provolatile, 's');
  assert.equal(contract.prosecdef, false);
  assert.deepEqual(contract.proconfig, label === 'jitOff' ? ['search_path=""', 'jit=off'] : ['search_path=""']);
  const privileges = (await db.query("select has_function_privilege('anon','api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)','EXECUTE') anon, has_function_privilege('authenticated','api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)','EXECUTE') authenticated, has_function_privilege('service_role','api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb)','EXECUTE') service")).rows[0];
  assert.deepEqual(privileges, { anon: false, authenticated: false, service: true });
  return { ...contract, privileges };
}
async function compareJit(selector, reference) {
  const comparison = {
    condition: 'Same function body and caller jit=on; only function-local override differs',
    nativeJitTiming: nativeFixtureEnabled(), callerSettings: await jitSettings(),
    alternatingOrder: [['jitOn', 'jitOff'], ['jitOff', 'jitOn'], ['jitOn', 'jitOff'], ['jitOff', 'jitOn']],
    variants: {}, exactEntriesAndHasMoreEqual: true, revisionStablePerVariant: true,
    definitionSwitchInvalidatesOldRevision: true, outerSettingsRestored: true,
  };
  const after = reference.hasMore ? {
    entityType: reference.entries.at(-1).entityType, entityId: reference.entries.at(-1).entityId,
  } : null;
  let expectedContinuation;
  let previousRevision;
  let functionBody;
  let functionAcl;
  for (const order of comparison.alternatingOrder) {
    for (const label of order) {
      const contract = await installJitVariant(label);
      if (functionBody === undefined) { functionBody = contract.prosrc; functionAcl = contract.proacl; }
      assert.equal(contract.prosrc, functionBody, 'A/B must execute identical SQL bodies');
      assert.equal(contract.proacl, functionAcl, 'A/B must preserve function ACLs');
      const variant = comparison.variants[label] ??= {
        firstMs: [], continuationMs: [], proconfig: contract.proconfig,
        bodySha256: hash(contract.prosrc), privileges: contract.privileges,
      };
      const before = await jitSettings();
      const started = performance.now();
      const first = await fixture.page(selector);
      variant.firstMs.push(performance.now() - started);
      assert.deepEqual(await jitSettings(), before, 'function-local setting must restore caller jit');
      assert.deepEqual(first.entries, reference.entries);
      assert.equal(first.hasMore, reference.hasMore);
      if (variant.revision) assert.equal(first.revision, variant.revision);
      variant.revision = first.revision;
      if (previousRevision && previousRevision !== first.revision) {
        const obsolete = await fixture.page(selector, null, 50, previousRevision);
        assert.equal(obsolete.revision, first.revision);
        assert.deepEqual(obsolete.entries, []);
      }
      previousRevision = first.revision;
      if (after) {
        const continuationStarted = performance.now();
        const continuation = await fixture.page(selector, after, 50, first.revision);
        variant.continuationMs.push(performance.now() - continuationStarted);
        const payload = { entries: continuation.entries, hasMore: continuation.hasMore };
        expectedContinuation ??= payload;
        assert.deepEqual(payload, expectedContinuation);
        assert.equal(continuation.revision, first.revision);
        assert.deepEqual(await jitSettings(), before);
      }
    }
  }
  for (const label of ['jitOn', 'jitOff']) {
    const contract = await installJitVariant(label);
    const variant = comparison.variants[label];
    variant.firstMedianMs = median(variant.firstMs);
    variant.continuationMedianMs = variant.continuationMs.length ? median(variant.continuationMs) : null;
    const explain = async (parameters) => withSessionJit(label === 'jitOff' ? 'off' : 'on', async () =>
      (await db.query('explain (analyze,buffers,format json) ' + parameterized, parameters)).rows[0]['QUERY PLAN'][0]);
    variant.firstPlan = await explain([JSON.stringify(selector), null, 50, null, null]);
    if (after) variant.continuationPlan = await explain([JSON.stringify(selector), JSON.stringify(after), 50, variant.revision, null]);
    variant.jitFirstTotalMs = variant.firstPlan.JIT?.Timing?.Total ?? 0;
    variant.jitContinuationTotalMs = variant.continuationPlan?.JIT?.Timing?.Total ?? 0;
    if (label === 'jitOff') {
      assert.equal(variant.jitFirstTotalMs, 0);
      assert.equal(variant.jitContinuationTotalMs, 0);
    } else if (nativeFixtureEnabled()) {
      assert.ok(variant.jitFirstTotalMs > 0, 'native baseline must actually exercise JIT');
    }
    assert.equal(contract.prosrc, functionBody);
  }
  assert.notEqual(comparison.variants.jitOn.revision, comparison.variants.jitOff.revision,
    'function definition is deliberately part of the revision');
  await installJitVariant('jitOff');
  comparison.finalCallerSettings = await jitSettings();
  assert.equal(comparison.finalCallerSettings.jit, 'on');
  return comparison;
}

const output = {
  environment: nativeFixtureEnabled() ? 'isolated CI PostgreSQL17 synthetic fixture' : 'local in-memory PGlite synthetic fixture',
  hostedExecution: false, sourceSchemaObservedAt: schema.observedAt,
  jitSettingsAtEntry: originalJit, proposalWithoutJitOverrideSha256: hash(jitOnProposal),
  proposalSha256: hash(proposal), schemaSha256: hash(JSON.stringify(schema)), samplesPerVariant: 4,
  newIndexes: [], cohorts: [],
  limitations: ['No installed-device, HTTP, edge-cache or hosted latency measurement.',
    'Existing columns, views and indexes are copied; the fixture omits foreign-key/check/default contracts.',
    'Five thousand unrelated synthetic printings stress name selectivity; this is not production cardinality.',
    'Legacy search is deliberately bounded and incomplete; its latency is not an equivalent complete-search latency.',
    'Result JSON bytes are internal SQL responses, not mobile API payload sizes.',
    'PGlite validates GUC/identity parity only; JIT latency conclusions require the isolated PostgreSQL17 job.',
    'candidateBody wall timings include scoped setting setup/restoration; plan Execution Time excludes that wrapper.'],
};
try {
  output.postgres = (await db.query('select version() version')).rows[0].version;
  await db.exec("set work_mem='2184kB'");
  await setJit('on');
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
    async function candidate() { return withSessionJit('off', async () => (await db.query(parameterized, values)).rows[0].jsonb_build_object); }
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
    const plans = { legacyNames: await explain(namesQuery), legacyHydration: await explain(hydrationQuery, [printings]), candidateFirst: await withSessionJit('off', () => explain(parameterized, values)) };
    if (initial.hasMore) {
      const after = { entityType: initial.entries.at(-1).entityType, entityId: initial.entries.at(-1).entityId };
      const continuation = await fixture.page(selector, after, 50, initial.revision);
      assert.ok(continuation.entries.every(e => !initial.entries.some(first => first.entityId === e.entityId)));
      plans.candidateContinuation = await withSessionJit('off', () => explain(parameterized, [values[0], JSON.stringify(after), 50, initial.revision, null]));
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
    const jitComparison = await compareJit(selector, initial);
    output.cohorts.push({ jitComparison, name, matchingPrintings: count, matchingVariants: count * 2, unrelatedPrintings: 5000,
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
} finally {
  await setJit(originalJit.jit);
  assert.deepEqual(await jitSettings(), originalJit, 'plan harness must restore its entry JIT settings');
  await db.close();
}
