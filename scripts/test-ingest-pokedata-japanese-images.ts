import assert from 'node:assert/strict';
import {
  PokeDataJapaneseImageSourceAdapter,
} from './catalogue-ingestion/pokedataJapaneseImageAdapter';
import type { ProviderRecord, SourceAdapter } from './catalogue-ingestion/sourceAdapter';
import {
  POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT,
  assertPokeDataStagingTarget,
  buildExactPokeDataSetCrosswalk,
  canonicalSetImportRunKey,
  completedRunMatches,
  exactCrosswalkDigest,
  fetchActiveJapaneseCatalogueSets,
  ingestPokeDataJapaneseImages,
  parsePokeDataJapaneseImageIngestionOptions,
  setRunKey,
  type ActiveJapaneseCatalogueSet,
  type PokeDataJapaneseImageIngestionOptions,
} from './ingest-pokedata-japanese-images';

function catalogueSet(
  id: string,
  setCode: string | null,
  nativeName = id,
): ActiveJapaneseCatalogueSet {
  return { id, setCode, nativeName, englishDisplayName: null };
}

const catalogueSets = [
  catalogueSet('catalogue-violet', 'SV1V', 'Violet ex'),
  catalogueSet('catalogue-alpha', 'alpha', 'Alpha'),
  catalogueSet('catalogue-l2-a', 'L2', 'L2 A'),
  catalogueSet('catalogue-l2-b', 'l2', 'L2 B'),
  catalogueSet('catalogue-no-code', null, 'No code'),
  catalogueSet('catalogue-only', 'ONLYCAT', 'Catalogue only'),
];

const providerSets = [
  { providerSetId: '20', setCode: 'sv1v', setName: 'Violet ex Japanese' },
  { providerSetId: '10', setCode: 'ALPHA', setName: 'Alpha Japanese' },
  { providerSetId: '261', setCode: 'L2', setName: 'L2 A Japanese' },
  { providerSetId: '262', setCode: 'l2', setName: 'L2 B Japanese' },
  { providerSetId: '99', setCode: null, setName: 'Provider no code' },
  { providerSetId: '30', setCode: 'ONLYPD', setName: 'Provider only' },
];

const crosswalk = buildExactPokeDataSetCrosswalk(catalogueSets, providerSets);
assert.deepEqual(crosswalk.matched.map((match) => ({
  catalogueSetId: match.catalogueSetId,
  catalogueSetCode: match.catalogueSetCode,
  providerSetId: match.providerSetId,
  providerSetCode: match.providerSetCode,
})), [
  {
    catalogueSetId: 'catalogue-alpha',
    catalogueSetCode: 'alpha',
    providerSetId: '10',
    providerSetCode: 'ALPHA',
  },
  {
    catalogueSetId: 'catalogue-violet',
    catalogueSetCode: 'SV1V',
    providerSetId: '20',
    providerSetCode: 'sv1v',
  },
]);
assert.deepEqual(crosswalk.unmatched.catalogue.map((set) => [set.id, set.reason]), [
  ['catalogue-no-code', 'code_missing'],
  ['catalogue-only', 'no_exact_pokedata_code_match'],
]);
assert.deepEqual(crosswalk.unmatched.pokedata.map((set) => [set.providerSetId, set.reason]), [
  ['99', 'code_missing'],
  ['30', 'no_exact_catalogue_code_match'],
]);
assert.equal(crosswalk.ambiguous.length, 1);
assert.equal(crosswalk.ambiguous[0].caseInsensitiveSetCode, 'l2');
assert.deepEqual(crosswalk.ambiguous[0].catalogue.map((set) => set.id), [
  'catalogue-l2-a',
  'catalogue-l2-b',
]);
assert.deepEqual(crosswalk.ambiguous[0].pokedata.map((set) => set.providerSetId), ['261', '262']);
assert.throws(
  () => buildExactPokeDataSetCrosswalk(catalogueSets, [
    { providerSetId: 'not-numeric', setCode: 'SV1V', setName: 'Invalid' },
  ]),
  /invalid immutable set descriptor/,
);

const digest = exactCrosswalkDigest(crosswalk.matched);
assert.match(digest, /^[0-9a-f]{64}$/u);
assert.equal(
  exactCrosswalkDigest([...crosswalk.matched].reverse()),
  digest,
  'the frozen identity digest must not depend on provider response ordering',
);
const resumableMatch = crosswalk.matched[0];
const resumableMetadata = {
  contract: POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT,
  crosswalkDigest: digest,
  catalogueSetId: resumableMatch.catalogueSetId,
  catalogueSetCode: resumableMatch.catalogueSetCode,
  catalogueSetName: resumableMatch.catalogueSetName,
  providerSetId: resumableMatch.providerSetId,
  providerSetCode: resumableMatch.providerSetCode,
  providerSetName: resumableMatch.providerSetName,
  identityPolicy: 'unique_exact_case_insensitive_set_code',
  metadataCreated: false,
  productionModified: false,
};
const completedFixture = {
  run_key: 'fixture',
  records_conflicted: 0,
  metadata: { workstream: resumableMetadata },
};
assert.equal(completedRunMatches(completedFixture, resumableMetadata), true);
assert.equal(
  completedRunMatches({ ...completedFixture, records_conflicted: 1 }, resumableMetadata),
  false,
  'completed runs with quarantined records must be retried after identities are repaired',
);
assert.equal(setRunKey('fixture-run', '20'), 'fixture-run:set-20');
assert.equal(
  canonicalSetImportRunKey('fixture-run', '20'),
  'pokedata_japanese:run_set:ja:20:all:assets-only:fixture-run:set-20',
);

async function testActiveCatalogueQuery() {
  const calls: Array<[string, ...unknown[]]> = [];
  const query = {
    select(columns: string) {
      calls.push(['select', columns]);
      return this;
    },
    eq(column: string, value: unknown) {
      calls.push(['eq', column, value]);
      return this;
    },
    is(column: string, value: unknown) {
      calls.push(['is', column, value]);
      return this;
    },
    order(column: string, options: unknown) {
      calls.push(['order', column, options]);
      return this;
    },
    async range(from: number, to: number) {
      calls.push(['range', from, to]);
      return {
        data: [{
          id: 'catalogue-one',
          set_code: ' SV1V ',
          native_name: ' Violet ex ',
          english_display_name: null,
        }],
        error: null,
      };
    },
  };
  const db = {
    schema(schema: string) {
      calls.push(['schema', schema]);
      return {
        from(table: string) {
          calls.push(['from', table]);
          return query;
        },
      };
    },
  };
  const rows = await fetchActiveJapaneseCatalogueSets(db);
  assert.deepEqual(rows, [{
    id: 'catalogue-one',
    setCode: 'SV1V',
    nativeName: 'Violet ex',
    englishDisplayName: null,
  }]);
  assert.deepEqual(calls.slice(0, 7), [
    ['schema', 'catalog'],
    ['from', 'sets'],
    ['select', 'id,set_code,native_name,english_display_name'],
    ['eq', 'game_code', 'pokemon'],
    ['eq', 'language_code', 'ja'],
    ['is', 'deprecated_at', null],
    ['order', 'id', { ascending: true }],
  ]);
}

function jsonResponse(value: unknown) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function providerRecord(providerSetId: string, providerSetCode: string): ProviderRecord {
  return {
    provider: 'pokedata_japanese',
    providerRecordId: `card:${providerSetId}001:normal:image`,
    recordType: 'asset',
    languageCode: 'ja',
    sourceUrl: 'https://fixture.pokedata.test/api/cards',
    licenceStatus: 'approved',
    payload: {
      id: `${providerSetId}001`,
      pokedata_card_id: `${providerSetId}001`,
      set_id: providerSetId,
      set_code: providerSetCode,
      num: '001',
      image_url: `https://pokemoncardimages.pokedata.io/images/${providerSetId}001.webp`,
      variant: 'normal',
      finish: 'normal',
    },
  };
}

async function testDriver() {
  let setIndexRequests = 0;
  const adapter = new PokeDataJapaneseImageSourceAdapter({
    baseUrl: 'https://fixture.pokedata.test',
    requestDelayMs: 0,
    sleepImpl: async () => undefined,
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.pathname !== '/api/sets') throw new Error(`Unexpected request ${url.href}`);
      setIndexRequests += 1;
      return jsonResponse([
        { id: 20, code: 'sv1v', name: 'Violet ex Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
        { id: 10, code: 'ALPHA', name: 'Alpha Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
        { id: 261, code: 'L2', name: 'L2 A Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
        { id: 262, code: 'l2', name: 'L2 B Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
        { id: 30, code: 'ONLYPD', name: 'Provider only', language: 'JAPANESE', tcg: 'Pokemon' },
        { id: 500, code: 'EN', name: 'English', language: 'ENGLISH', tcg: 'Pokemon' },
      ]);
    },
  });

  const calls: Record<string, unknown>[] = [];
  const sleeps: number[] = [];
  let runnerCreations = 0;
  const boundAdapters: SourceAdapter[] = [];
  let provider20Attempts = 0;
  const options: PokeDataJapaneseImageIngestionOptions = {
    offset: 0,
    limit: 50,
    writeConcurrency: 4,
    maxAttempts: 2,
    requestTimeoutMs: 30_000,
    setPauseMs: 25,
    retryBaseMs: 10,
    runKeyPrefix: 'fixture-run',
    requestIdPrefix: 'fixture-request',
  };
  const selectedCrosswalk = buildExactPokeDataSetCrosswalk(
    catalogueSets,
    providerSets.filter((set) => set.setCode !== null),
  );
  const selectedDigest = exactCrosswalkDigest(selectedCrosswalk.matched);
  const alphaMatch = selectedCrosswalk.matched.find((match) => match.providerSetId === '10')!;
  const alphaCanonicalKey = canonicalSetImportRunKey('fixture-run', '10');
  const report = await ingestPokeDataJapaneseImages(
    {} as never,
    adapter,
    options,
    {
      fetchCatalogueSets: async () => catalogueSets,
      readCompletedRuns: async (_db, keys) => {
        assert.equal(keys.includes(alphaCanonicalKey), true);
        return new Map([[
          alphaCanonicalKey,
          {
            run_key: alphaCanonicalKey,
            records_requested: 2,
            records_retrieved: 2,
            records_inserted: 1,
            records_updated: 0,
            records_skipped: 1,
            records_conflicted: 0,
            metadata: {
              workstream: {
                contract: POKEDATA_JAPANESE_IMAGE_INGESTION_CONTRACT,
                crosswalkDigest: selectedDigest,
                catalogueSetId: alphaMatch.catalogueSetId,
                catalogueSetCode: alphaMatch.catalogueSetCode,
                catalogueSetName: alphaMatch.catalogueSetName,
                providerSetId: alphaMatch.providerSetId,
                providerSetCode: alphaMatch.providerSetCode,
                providerSetName: alphaMatch.providerSetName,
                identityPolicy: 'unique_exact_case_insensitive_set_code',
                metadataCreated: false,
                productionModified: false,
              },
            },
          },
        ]]);
      },
      createRunner: (_db, sourceAdapter) => {
        runnerCreations += 1;
        boundAdapters.push(sourceAdapter);
        return {
          async run(runOptions) {
            calls.push(runOptions);
            assert.equal(runOptions.setId, '20', 'only the non-resumed unique exact set may run');
            provider20Attempts += 1;
            if (provider20Attempts === 1) throw new Error('transient fixture failure');
            return {
              ok: true,
              importRunId: 'run-violet',
              stats: {
                recordsRequested: 3,
                recordsRetrieved: 3,
                recordsInserted: 0,
                recordsUpdated: 2,
                recordsSkipped: 0,
                recordsConflicted: 1,
                decisions: 7,
              },
            };
          },
        };
      },
      sleep: async (milliseconds) => { sleeps.push(milliseconds); },
    },
  );

  assert.equal(setIndexRequests, 1, 'one adapter must reuse one cached set-index request');
  assert.equal(runnerCreations, 1, 'all exact provider sets must reuse one runner');
  assert.equal(calls.length, 2, 'a transient set failure must use the bounded retry count');
  assert.deepEqual(sleeps, [10], 'only the bounded exponential retry should sleep in this fixture');
  assert.equal(calls[0].runKey, calls[1].runKey, 'set retries must reuse the resumable run key');
  for (const call of calls) {
    assert.equal(call.command, 'run_set');
    assert.equal(call.importType, 'repair');
    assert.equal(call.language, 'ja');
    assert.deepEqual(call.cursor, { offset: 0 });
    assert.equal(call.limit, 1);
    assert.equal(call.assetsOnly, true);
    assert.equal(call.allowImageAssets, true);
    assert.equal(call.approvedOnlyAssets, true);
    assert.equal(call.writeConcurrency, 4);
    assert.equal((call.runMetadata as Record<string, unknown>).metadataCreated, false);
    assert.equal((call.runMetadata as Record<string, unknown>).productionModified, false);
  }

  assert.equal(boundAdapters.length, 1);
  const boundAdapter = boundAdapters[0];
  const canonicalised = boundAdapter.normaliseRecord(providerRecord('20', 'sv1v'));
  assert.equal(canonicalised instanceof Promise, false);
  assert.equal((canonicalised as { setCode?: string | null }).setCode, 'SV1V');
  assert.throws(
    () => boundAdapter.fetchAssets({ language: 'ja', setId: '30', limit: 1 }),
    /outside the frozen exact set crosswalk/,
    'unmapped provider sets must never reach /api/cards',
  );

  assert.equal(report.ok, true);
  assert.equal(report.productionModified, false);
  assert.equal(report.metadataCreated, false);
  assert.deepEqual(report.batch, {
    offset: 0,
    limit: 50,
    runKeyPrefix: 'fixture-run',
    selectedSets: 2,
    resumedSets: 1,
    attemptedSets: 1,
    failedSets: 0,
  });
  assert.deepEqual(report.setTotals, {
    activeCatalogueSets: 6,
    pokedataJapanesePokemonSets: 5,
    matched: 2,
    unmatched: 3,
    ambiguous: 4,
  });
  assert.deepEqual(report.totals, {
    requested: 5,
    retrieved: 5,
    inserted: 1,
    updated: 2,
    skipped: 1,
    conflicted: 1,
    decisions: 7,
  });
  assert.deepEqual(report.runs.map((run) => run.status), ['already_completed', 'completed']);
}

async function main() {
  await testActiveCatalogueQuery();
  await testDriver();

  const parsed = parsePokeDataJapaneseImageIngestionOptions([
    '--offset=5',
    '--limit=10',
    '--writeConcurrency=16',
    '--maxAttempts=6',
    '--requestTimeoutMs=120000',
    '--setPauseMs=0',
    '--retryBaseMs=0',
    '--runKey=stable-key',
  ]);
  assert.deepEqual(parsed, {
    offset: 5,
    limit: 10,
    writeConcurrency: 16,
    maxAttempts: 6,
    requestTimeoutMs: 120_000,
    setPauseMs: 0,
    retryBaseMs: 0,
    runKeyPrefix: 'stable-key',
    requestIdPrefix: null,
  });
  assert.throws(
    () => parsePokeDataJapaneseImageIngestionOptions(['--limit=51']),
    /--limit must be an integer from 1 to 50/,
  );
  assert.throws(
    () => parsePokeDataJapaneseImageIngestionOptions(['--writeConcurrency=17']),
    /--writeConcurrency must be an integer from 1 to 16/,
  );
  assert.throws(
    () => parsePokeDataJapaneseImageIngestionOptions(['--maxAttempts=7']),
    /--maxAttempts must be an integer from 1 to 6/,
  );

  const fixtureBackendKey = ['fixture', 'secret'].join('-');
  assert.deepEqual(assertPokeDataStagingTarget(['--target=staging'], {
    SUPABASE_URL: 'https://lmwfhvexfcoyeuoyrlco.supabase.co',
    SUPABASE_SECRET_KEY: fixtureBackendKey,
  }), {
    supabaseUrl: 'https://lmwfhvexfcoyeuoyrlco.supabase.co',
    key: fixtureBackendKey,
  });
  assert.throws(
    () => assertPokeDataStagingTarget(['--target=production'], {
      SUPABASE_URL: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
      SUPABASE_SECRET_KEY: fixtureBackendKey,
    }),
    /requires --target=staging/,
  );
  assert.throws(
    () => assertPokeDataStagingTarget(['--target=staging'], {
      SUPABASE_URL: 'https://oakdbbzdqwurpjnoqhmu.supabase.co',
      SUPABASE_SECRET_KEY: fixtureBackendKey,
    }),
    /Refusing PokeData ingestion against production/,
  );
  for (const nonCanonicalUrl of [
    'http://lmwfhvexfcoyeuoyrlco.supabase.co',
    'https://lmwfhvexfcoyeuoyrlco.supabase.co:444/',
    'https://lmwfhvexfcoyeuoyrlco.supabase.co/rest/v1',
    'https://lmwfhvexfcoyeuoyrlco.supabase.co/?unsafe=1',
  ]) {
    assert.throws(
      () => assertPokeDataStagingTarget(['--target=staging'], {
        SUPABASE_URL: nonCanonicalUrl,
        SUPABASE_SECRET_KEY: fixtureBackendKey,
      }),
      /requires canonical staging Supabase/,
    );
  }

  console.log('PokeData Japanese exact-crosswalk image ingestion driver tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
