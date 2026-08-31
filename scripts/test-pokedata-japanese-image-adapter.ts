import assert from 'node:assert/strict';
import { createSourceAdapter } from './catalogue-ingestion/adapters';
import {
  PokeDataJapaneseImageSourceAdapter,
  pokedataJapaneseImageAdapterInternals,
} from './catalogue-ingestion/pokedataJapaneseImageAdapter';
import { CatalogueIngestionRunner } from './catalogue-ingestion/pipeline';
import { validateProviderSourceUrl } from './mirror-approved-catalogue-assets.mjs';

function jsonResponse(value: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const sets = [
  { id: 99, code: 'EN1', name: 'English Set', language: 'ENGLISH', tcg: 'Pokemon' },
  { id: 20, code: 'SV1V', name: 'Violet ex Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
  { id: 10, code: 'SV1S', name: 'Scarlet ex Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
  { id: 261, code: 'L2', name: 'L2 A Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
  { id: 262, code: 'L2', name: 'L2 B Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
  { id: 263, code: 'L2', name: 'L2 C Japanese', language: 'JAPANESE', tcg: 'Pokemon' },
  { id: 30, code: 'JPX', name: 'Other Game Japanese', language: 'JAPANESE', tcg: 'Other' },
];

const violetCards = [
  {
    id: 2001,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Miraidon ex',
    num: '037',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2001.webp',
  },
  {
    id: 2002,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Klefki Holofoil',
    num: '045',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2002.jpg',
  },
  {
    id: 2003,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Duplicate One',
    num: '050',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2003.webp',
  },
  {
    id: 2004,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Duplicate Two',
    num: '050',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2004.webp',
  },
  {
    id: 2005,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Basic Lightning Energy Poké Ball Pattern Holofoil',
    num: '108',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2005.png',
  },
  {
    id: 2006,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Placeholder',
    num: '051',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/placeholder.webp',
  },
  {
    id: 2007,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Blank Collector',
    num: '  ',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2007.webp',
  },
  {
    id: 2008,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Wrong Language',
    num: '052',
    language: 'ENGLISH',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2008.webp',
  },
  {
    id: 2009,
    set_id: 10,
    set_name: 'Violet ex Japanese',
    name: 'Wrong Set ID',
    num: '053',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2009.webp',
  },
  {
    id: 2010,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Wrong Image Host',
    num: '054',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://www.pokedata.io/images/2010.webp',
  },
  {
    id: 2011,
    set_id: 20,
    set_name: 'Violet ex Japanese',
    name: 'Unknown Rainbow Pattern Holofoil',
    num: '055',
    language: 'JAPANESE',
    tcg: 'Pokemon',
    img_url: 'https://pokemoncardimages.pokedata.io/images/2011.webp',
  },
];

const ambiguousL2Card = {
  id: 261001,
  set_id: 261,
  set_name: 'L2 A Japanese',
  name: 'Ambiguous L2 Card',
  num: '001',
  language: 'JAPANESE',
  tcg: 'Pokemon',
  img_url: 'https://pokemoncardimages.pokedata.io/images/261001.webp',
};

async function main() {
  const requests: string[] = [];
  const sleeps: number[] = [];
  const adapter = new PokeDataJapaneseImageSourceAdapter({
    baseUrl: 'https://fixture.pokedata.test',
    requestDelayMs: 25,
    sleepImpl: async (milliseconds) => { sleeps.push(milliseconds); },
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      requests.push(url.href);
      if (url.pathname === '/api/sets') return jsonResponse(sets);
      if (url.pathname === '/api/cards' && url.searchParams.get('set_name') === 'Violet ex Japanese') {
        return jsonResponse(violetCards);
      }
      if (url.pathname === '/api/cards' && url.searchParams.get('set_name') === 'L2 A Japanese') {
        return jsonResponse([ambiguousL2Card]);
      }
      throw new Error(`Unexpected PokeData fixture request: ${url.href}`);
    },
  });

  assert.equal(adapter.identifySource().code, 'pokedata_japanese');
  assert.equal(adapter.identifySource().sourceType, 'image');
  assert.equal(adapter.identifySource().automatedRefreshAllowed, true);
  assert.deepEqual(adapter.identifySource().capabilities, ['assets', 'conditional_requests']);
  assert.throws(
    () => new PokeDataJapaneseImageSourceAdapter({ language: 'en' }),
    /only supports ja/,
  );

  const health = await adapter.healthCheck();
  assert.equal(health.status, 'ok');
  assert.equal(health.httpMetadata?.japaneseSetCount, 5);

  const exactSetIndex = await adapter.fetchExactSetIndex();
  assert.deepEqual(exactSetIndex, [
    { providerSetId: '10', setCode: 'SV1S', setName: 'Scarlet ex Japanese' },
    { providerSetId: '20', setCode: 'SV1V', setName: 'Violet ex Japanese' },
    { providerSetId: '261', setCode: 'L2', setName: 'L2 A Japanese' },
    { providerSetId: '262', setCode: 'L2', setName: 'L2 B Japanese' },
    { providerSetId: '263', setCode: 'L2', setName: 'L2 C Japanese' },
  ]);
  assert.equal(Object.isFrozen(exactSetIndex), true);
  assert.equal(exactSetIndex.every((set) => Object.isFrozen(set)), true);
  assert.deepEqual(Object.keys(exactSetIndex[0]).sort(), ['providerSetId', 'setCode', 'setName']);
  assert.equal(
    requests.filter((request) => new URL(request).pathname === '/api/sets').length,
    1,
    'the public sanitized index must reuse the adapter instance set cache',
  );

  const assets = await adapter.fetchAssets({ language: 'ja', cursor: { offset: 1 }, limit: 1 });
  const validAssets = assets.filter((asset) => adapter.validateRecord(asset).ok);
  const quarantinedAssets = assets.filter((asset) => !adapter.validateRecord(asset).ok);
  assert.equal(validAssets.length, 3, 'valid unique normal, holo, and Poké Ball variants should remain');
  assert.equal(quarantinedAssets.length, 2, 'every candidate in an ambiguous identity group must be quarantined');
  assert.equal(
    quarantinedAssets.every((asset) => adapter.validateRecord(asset).issues.some((issue) => issue.code === 'ambiguous_duplicate_group')),
    true,
  );
  assert.deepEqual(validAssets.map((asset) => asset.providerRecordId), [
    'card:2001:normal:image',
    'card:2002:holo:image',
    'card:2005:poke_ball:image',
  ]);
  assert.equal(
    requests.filter((request) => new URL(request).pathname === '/api/sets').length,
    1,
    'health and fetch must reuse the bounded set index',
  );
  const cardRequests = requests.filter((request) => new URL(request).pathname === '/api/cards');
  assert.equal(cardRequests.length, 1);
  assert.equal(new URL(cardRequests[0]).searchParams.get('set_name'), 'Violet ex Japanese');
  assert.equal(new URL(cardRequests[0]).searchParams.get('set_id'), '20');
  assert.equal(new URL(cardRequests[0]).searchParams.get('tcg'), 'Pokemon');
  assert.equal(new URL(cardRequests[0]).searchParams.get('stats'), 'kwan');
  assert.equal(sleeps.length, 0, 'one selected set needs no inter-set delay');

  const normalised = adapter.normaliseRecord(validAssets[1]);
  assert.equal(normalised.languageCode, 'ja');
  assert.equal(normalised.setCode, 'SV1V');
  assert.equal(normalised.providerSetId, '20');
  assert.equal(normalised.collectorNumber, '045');
  assert.equal(normalised.variantCode, 'holo');
  assert.equal(normalised.finishCode, 'holo');
  assert.equal(normalised.artworkKey, 'pokedata_japanese:2002');
  assert.equal(normalised.nativeName, null, 'image-only ingestion must not modify Japanese card names');
  assert.equal(adapter.validateRecord(validAssets[1]).ok, true);

  const ambiguousSetAssets = await adapter.fetchAssets({ language: 'ja', setId: '261', limit: 1 });
  assert.equal(ambiguousSetAssets.length, 1);
  assert.equal(adapter.validateRecord(ambiguousSetAssets[0]).ok, false);
  assert.equal(
    adapter.validateRecord(ambiguousSetAssets[0]).issues.some((issue) => issue.code === 'ambiguous_set_code'),
    true,
    'duplicate Japanese PokeData set codes must be quarantined rather than attached',
  );
  assert.deepEqual(ambiguousSetAssets[0].payload.ambiguous_set_code_provider_ids, ['261', '262', '263']);

  const noWriteDb = {
    schema(schema: string) {
      throw new Error(`PokeData assets-only dry run unexpectedly accessed ${schema}.`);
    },
  };
  const dryRun = await new CatalogueIngestionRunner(noWriteDb, adapter).run({
    command: 'run_language',
    language: 'ja',
    setId: '20',
    limit: 1,
    dryRun: true,
    assetsOnly: true,
    allowImageAssets: true,
    approvedOnlyAssets: true,
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.stats?.recordsSkipped, 3);
  assert.equal(dryRun.stats?.recordsConflicted, 2);
  await assert.rejects(
    new CatalogueIngestionRunner(noWriteDb, adapter).run({
      command: 'run_language',
      language: 'ja',
      limit: 1,
      dryRun: true,
      allowImageAssets: true,
    }),
    /image-only source/,
    'the adapter must refuse any metadata-capable runner mode',
  );

  await assert.rejects(adapter.fetchSets(), /image-only source/);
  await assert.rejects(adapter.fetchCards(), /image-only source/);
  await assert.rejects(adapter.fetchVariants(), /image-only source/);
  assert.throws(
    () => pokedataJapaneseImageAdapterInternals.scopeWindow({ limit: 51 }),
    /set limit must be an integer from 1 to 50/,
  );
  assert.equal(
    pokedataJapaneseImageAdapterInternals.validatedPokeDataImageUrl(
      'https://pokemoncardimages.pokedata.io/images/valid.webp',
    ),
    'https://pokemoncardimages.pokedata.io/images/valid.webp',
  );
  assert.equal(
    pokedataJapaneseImageAdapterInternals.validatedPokeDataImageUrl(
      'https://pokemoncardimages.pokedata.io/images/placeholder.webp',
    ),
    null,
  );
  assert.equal(
    pokedataJapaneseImageAdapterInternals.parsePokeDataFinish('Unknown Rainbow Pattern Holofoil'),
    null,
  );
  assert.deepEqual(
    pokedataJapaneseImageAdapterInternals.parsePokeDataFinish('Pikachu Master Ball Holo'),
    {
      variantCode: 'master_ball',
      finishCode: 'master_ball',
      baseName: 'Pikachu',
      evidence: 'master_ball_holo_suffix',
    },
  );
  assert.deepEqual(
    pokedataJapaneseImageAdapterInternals.parsePokeDataFinish('Pikachu Reverse Holo'),
    {
      variantCode: 'reverse_holo',
      finishCode: 'reverse_holo',
      baseName: 'Pikachu',
      evidence: 'reverse_holofoil_suffix',
    },
  );

  const registryAdapter = createSourceAdapter({ source: 'pokedata-japanese', language: 'ja' });
  assert.equal(registryAdapter.identifySource().code, 'pokedata_japanese');
  assert.equal(registryAdapter.identifySource().licenceStatus, 'approved');

  const retrySleeps: number[] = [];
  let cardAttempts = 0;
  const retryAdapter = new PokeDataJapaneseImageSourceAdapter({
    baseUrl: 'https://fixture.pokedata.test',
    requestDelayMs: 0,
    sleepImpl: async (milliseconds) => { retrySleeps.push(milliseconds); },
    fetchImpl: async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/api/sets') return jsonResponse([sets[1]]);
      cardAttempts += 1;
      if (cardAttempts === 1) return jsonResponse({ error: 'slow down' }, 429, { 'retry-after': '1' });
      return jsonResponse([violetCards[0]]);
    },
  });
  const retriedAssets = await retryAdapter.fetchAssets({ language: 'ja', limit: 1 });
  assert.equal(retriedAssets.length, 1);
  assert.equal(cardAttempts, 2);
  assert.deepEqual(retrySleeps, [1000]);

  assert.equal(
    validateProviderSourceUrl(
      'pokedata_japanese',
      'https://pokemoncardimages.pokedata.io/images/2001.webp',
    ).hostname,
    'pokemoncardimages.pokedata.io',
  );
  assert.throws(
    () => validateProviderSourceUrl(
      'pokedata_japanese',
      'https://cdn.pokemoncardimages.pokedata.io/images/2001.webp',
    ),
    /reviewed card-image host/,
  );
  assert.throws(
    () => validateProviderSourceUrl(
      'pokedata_japanese',
      'https://pokemoncardimages.pokedata.io/images/placeholder.webp',
    ),
    /cannot use the placeholder/,
  );

  console.log('PokeData Japanese image-only adapter tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
