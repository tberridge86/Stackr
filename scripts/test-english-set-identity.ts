import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import { getEnglishSetReferenceAliases, matchesEnglishSetReference } from '../lib/englishSetIdentity';
import { resolveBinderSetIdentity } from '../lib/binderSetIdentity';
import * as pokemonSetIdentity from '../lib/pokemonSetIdentity';
import * as pokemonSetSeries from '../lib/pokemonSetSeries';
import * as pokemonDisplayNames from '../lib/pokemonDisplayNames';
import * as resilientCatalogueRead from '../lib/resilientCatalogueRead';
import * as optionalCatalogueEnrichment from '../lib/optionalCatalogueEnrichment';

const PRISMATIC_ID = 'fb3cd93c-9006-42f5-b026-96a9fedcf269';
const prismatic = {
  setId: PRISMATIC_ID,
  game: 'pokemon',
  languageCode: 'en',
  setCode: 'sv08.5',
  nativeName: 'Prismatic Evolutions',
  englishDisplayName: 'Prismatic Evolutions',
  seriesId: null,
  seriesNativeName: null,
  seriesEnglishDisplayName: null,
  releaseDate: '2025-01-17',
  printedTotal: 131,
  total: 180,
  regionCode: 'US',
};

async function main() {
  assert.deepEqual(getEnglishSetReferenceAliases('sv8pt5', 'en').sort(), ['sv08.5', 'sv8pt5'].sort());
  assert.ok(getEnglishSetReferenceAliases('me2pt5', 'en').includes('me02.5'));
  assert.ok(getEnglishSetReferenceAliases('swsh45sv', 'en').includes('swsh4.5sv'));
  assert.deepEqual(getEnglishSetReferenceAliases(PRISMATIC_ID, 'en'), [PRISMATIC_ID]);
  assert.deepEqual(getEnglishSetReferenceAliases(`en:${PRISMATIC_ID.toUpperCase()}`, 'en').sort(), [`en:${PRISMATIC_ID}`, PRISMATIC_ID].sort());
  assert.deepEqual(getEnglishSetReferenceAliases('ja:sv8pt5', 'en'), ['ja:sv8pt5']);
  assert.equal(matchesEnglishSetReference({ id: PRISMATIC_ID, language: 'en', setCode: 'sv08.5' }, 'sv8pt5'), true);
  assert.equal(matchesEnglishSetReference({ id: 'ja-prismatic', language: 'ja', setCode: 'sv08.5' }, 'sv8pt5'), false);
  assert.equal(matchesEnglishSetReference({ id: 'en:sv8pt5', language: 'en' }, 'ja:sv8pt5'), false, 'a contradictory reference prefix must not cross into English aliases');
  assert.equal(matchesEnglishSetReference({ id: PRISMATIC_ID, language: 'en' }, `en:${PRISMATIC_ID.toUpperCase()}`), true, 'an English-prefixed UUID remains an exact canonical identity');

  const binderResolution = resolveBinderSetIdentity({
    language: 'en', sourceSetId: 'sv8pt5', candidates: [{ id: PRISMATIC_ID, language: 'en', setCode: 'sv08.5' }],
  });
  assert.equal(binderResolution.status, 'resolved');
  assert.equal(binderResolution.setId, PRISMATIC_ID);
  const japaneseBinder = resolveBinderSetIdentity({
    language: 'ja', sourceSetId: 'sv8pt5', candidates: [{ id: 'ja-set', language: 'ja', setCode: 'sv08.5' }],
  });
  assert.equal(japaneseBinder.setId, 'sv8pt5', 'English aliases must not rewrite a Japanese candidate');
  assert.deepEqual(japaneseBinder.candidateSetIds, []);

  const source = fs.readFileSync(fileURLToPath(new URL('../lib/stackrDomainAdapter.ts', import.meta.url)), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const defaultClient = {};
  const dependencies: Record<string, unknown> = {
    './stackrApiV1': { stackrApiClient: defaultClient },
    './englishSetIdentity': { getEnglishSetReferenceAliases, matchesEnglishSetReference },
    './pokemonSetSeries': pokemonSetSeries,
    './pokemonSetIdentity': pokemonSetIdentity,
    './pokemonDisplayNames': pokemonDisplayNames,
    './foreignCardPresentation': { buildForeignCardPresentation: () => ({ name: 'Card', setName: 'Prismatic Evolutions', englishDisplayName: 'Card', englishSetDisplayName: 'Prismatic Evolutions', translationStatus: 'not_required', isForeign: false, withheldNativeDetails: false, details: {} }) },
    './supabase': { supabase: {} },
    './tcgdexControlledCardReference': { enforceTcgdexRuntimeImagePolicy: (value: unknown) => value },
    './resilientCatalogueRead': { firstNonEmptyCatalogueRows: async () => [], preferNonEmptyCatalogueRows: async () => [] },
    './optionalCatalogueEnrichment': { readOptionalCatalogueEnrichment: async (read: any) => read(undefined), throwIfOptionalCatalogueReadAborted: () => {} },
  };
  const exports: any = {};
  let clock = 1_000_000;
  const TestDate = class extends Date { static now() { return clock; } };
  vm.runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, console, AbortController, setTimeout, clearTimeout, Date: TestDate });

  // Exercise the real preferred-read and enrichment deadlines at a shorter
  // test scale. A slow optional set response used to cancel successful card
  // facts and discard their already-delivered Japanese images.
  let legacyReads = 0;
  const imageReadDependencies = {
    ...dependencies,
    './supabase': { supabase: { from() { legacyReads += 1; throw new Error('Unexpected legacy read'); } } },
    './resilientCatalogueRead': {
      ...resilientCatalogueRead,
      preferNonEmptyCatalogueRows: (read: any, fallback: any) => resilientCatalogueRead.preferNonEmptyCatalogueRows(read, fallback, { preferredTimeoutMs: 20 }),
    },
    './optionalCatalogueEnrichment': {
      ...optionalCatalogueEnrichment,
      readOptionalCatalogueEnrichment: (read: any, signal: AbortSignal) => optionalCatalogueEnrichment.readOptionalCatalogueEnrichment(read, signal, 50),
    },
  };
  const imageReads: any = {};
  vm.runInNewContext(compiled, { exports: imageReads, require: (name: string) => imageReadDependencies[name as keyof typeof imageReadDependencies] ?? {}, console, AbortController, setTimeout, clearTimeout });
  const sourceUris = [
    'https://catalogue.stackr.test/stored-japanese-card.webp',
    'https://www.pokemon-card.com/assets/images/card_images/large/SM8a/035449_T_KUCHINASHI.jpg',
    'https://pokemoncardimages.pokedata.io/images/Nihil+Zero/022.webp',
  ];
  const sourceCards = sourceUris.map((uri, index) => ({
    cardId: `ja-printing-${index}`, catalogueVersionId: null, languageCode: 'ja',
    defaultVariantId: `ja-variant-${index}`, set: { ...prismatic, languageCode: 'ja', setCode: 'S12a' },
    collectorNumber: { value: String(index + 1) }, names: { native: '日本語カード', englishDisplay: null },
    rarity: {}, variants: [{ variantId: `ja-variant-${index}`, variantCode: 'normal', image: {
      assetId: `approved-image-${index}`, assetType: 'card_image', cardId: `ja-printing-${index}`,
      variantId: `ja-variant-${index}`, deliveryUrl: uri, derivatives: [], permissionStatus: 'approved',
    } }],
  }));
  let factsSignal: AbortSignal | undefined;
  const slowMetadataClient = {
    setCards: async (_id: string, query: any, init: { signal: AbortSignal }) => {
      assert.equal(query.language, 'ja');
      factsSignal = init.signal;
      return { data: { cards: sourceCards }, meta: {} };
    },
    set: async () => new Promise(() => undefined),
    assetManifest: async () => { throw new Error('Embedded images do not need manifest enrichment'); },
  };
  const recoveredImages = await imageReads.fetchPreferredStackrCardsForReferences([PRISMATIC_ID], 'ja', slowMetadataClient);
  assert.deepEqual(Array.from(recoveredImages, (card: any) => card.images.small), sourceUris,
    'stored, official Japanese and PokeData images survive a stalled optional set read');
  assert.equal(legacyReads, 0, 'optional metadata must not switch a successful canonical card read to legacy');
  assert.equal(factsSignal?.aborted, false, 'the preferred deadline ends once the card facts have arrived');
  assert.ok(recoveredImages.every((card: any) => card.language === 'ja'));

  const withGap = sourceCards.map((card, index) => index === 2
    ? { ...card, variants: [{ ...card.variants[0], image: null }] }
    : card);
  const enrichedImages = await imageReads.fetchPreferredStackrCardsForReferences([PRISMATIC_ID], 'ja', {
    ...slowMetadataClient,
    setCards: async () => ({ data: { cards: withGap }, meta: {} }),
    assetManifest: async (query: { setId: string }, init: { signal: AbortSignal }) => {
      assert.equal(query.setId, PRISMATIC_ID);
      await new Promise((resolve) => setTimeout(resolve, 30));
      assert.equal(init.signal.aborted, false);
      return { data: { assets: [sourceCards[2].variants[0].image] }, meta: {} };
    },
  });
  assert.deepEqual(Array.from(enrichedImages, (card: any) => card.images.small), sourceUris,
    'optional artwork may finish after the preferred facts deadline without losing the selected cards');
  assert.equal(legacyReads, 0);

  const setCalls: string[] = [];
  const cardRows = Array.from({ length: 180 }, (_, index) => ({
    cardId: `prismatic-${index + 1}`,
    defaultVariantId: `variant-${index + 1}`,
    variants: [{ variantId: `variant-${index + 1}`, canonicalId: `canonical-${index + 1}`, variantCode: 'normal', variantLabel: null, finishCode: 'normal', finishLabel: null, artworkKey: null, imageVariantId: null, image: null }],
    names: { native: `Card ${index + 1}`, englishDisplay: `Card ${index + 1}`, englishDisplaySource: null },
    collectorNumber: { value: String(index + 1) }, languageCode: 'en', set: prismatic, rarity: { label: null, code: null }, details: {},
  }));
  const client: any = {
    sets: async ({ setCode, language }: any) => {
      setCalls.push(setCode);
      const sets = language === 'ja'
        ? [{ ...prismatic, setCode: 'sv8pt5' }]
        : setCode === 'sv08.5' ? [prismatic] : [{ ...prismatic, languageCode: 'ja', setId: 'wrong-language', setCode: 'sv8pt5' }];
      return { data: { sets }, meta: { pagination: { nextCursor: null } } };
    },
    setCards: async (setId: string) => {
      assert.equal(setId, PRISMATIC_ID);
      return { data: { cards: cardRows }, meta: { pagination: { nextCursor: null } } };
    },
    assetManifest: async () => ({ data: { assets: [] }, meta: { pagination: { nextCursor: null } } }),
    set: async () => ({ data: { set: prismatic } }),
  };

  assert.equal(await exports.resolveStackrSetId('sv8pt5', 'en', client), PRISMATIC_ID);
  assert.deepEqual(setCalls, ['sv8pt5', 'sv08.5'], 'resolver tries verified aliases and ignores a wrong-language first response');
  assert.equal(await exports.resolveStackrSetId('ja:sv8pt5', 'en', client), null, 'a contradictory language prefix must not be stripped into an English alias');
  assert.equal(await exports.resolveStackrSetId('sv8pt5', 'ja', client), null, 'non-English resolution must not guess the English canonical set');
  const ambiguousClient: any = {
    sets: async () => ({ data: { sets: [prismatic, { ...prismatic, setId: 'f6476bc0-9006-42f5-b026-96a9fedcf269' }] }, meta: { pagination: { nextCursor: null } } }),
  };
  assert.equal(await exports.resolveStackrSetId('sv8pt5', 'en', ambiguousClient), null, 'two exact canonical matches must remain unresolved rather than selecting the first row');
  const cards = await exports.fetchStackrCardsForSet('sv8pt5', 'en', client);
  assert.equal(cards.length, 180, 'the legacy Prismatic reference resolves through the canonical 180-card set path');

  let resolutionSearches = 0;
  const resolutionClient: any = {
    search: async ({ q, language, setId }: any) => {
      resolutionSearches += 1;
      assert.ok(q === 'Provider:Exact' || q === 'provider:exact');
      assert.ok(language === 'en' || language === 'ja');
      assert.ok(setId === PRISMATIC_ID || setId === undefined);
      return { data: { results: [{ type: 'card', reason: 'exact_name', card: cardRows[0], cardId: cardRows[0].cardId, variantId: cardRows[0].defaultVariantId }] } };
    },
    assetManifest: async () => ({ data: { assets: [] }, meta: { pagination: { nextCursor: null } } }),
  };
  const [firstResolved, secondResolved] = await Promise.all([
    exports.fetchStackrCard('Provider:Exact', { language: 'en', setId: PRISMATIC_ID }, resolutionClient),
    exports.fetchStackrCard('Provider:Exact', { language: 'en', setId: PRISMATIC_ID }, resolutionClient),
  ]);
  assert.ok(firstResolved && secondResolved);
  assert.equal(resolutionSearches, 1, 'same client/reference/language/set context shares one in-flight resolution');
  await exports.fetchStackrCard('Provider:Exact', { language: 'ja', setId: PRISMATIC_ID }, resolutionClient);
  assert.equal(resolutionSearches, 2, 'language remains part of the cache identity');
  exports.clearStackrCatalogueCaches(resolutionClient);
  await exports.fetchStackrCard('Provider:Exact', { language: 'en', setId: PRISMATIC_ID }, resolutionClient);
  assert.equal(resolutionSearches, 3, 'explicit catalogue refresh clears a client-scoped resolution');
  clock += 45_001;
  await exports.fetchStackrCard('Provider:Exact', { language: 'en', setId: PRISMATIC_ID }, resolutionClient);
  assert.equal(resolutionSearches, 4, 'expired successes resolve again');
  const secondClient: any = { ...resolutionClient };
  await exports.fetchStackrCard('Provider:Exact', { language: 'en', setId: PRISMATIC_ID }, secondClient);
  assert.equal(resolutionSearches, 5, 'client instances never share card-resolution entries');
  await exports.fetchStackrCard('provider:exact', { language: 'en', setId: PRISMATIC_ID }, resolutionClient);
  assert.equal(resolutionSearches, 6, 'provider IDs retain resolver case semantics');
  await exports.fetchStackrCard('Provider:Exact', { language: 'en', setId: 'other-set' }, resolutionClient);
  assert.equal(resolutionSearches, 7, 'set context remains part of the cache identity');

  let retryCalls = 0;
  const retryClient: any = {
    search: async () => {
      retryCalls += 1;
      if (retryCalls === 1) throw new Error('temporary');
      if (retryCalls === 2) return { data: { results: [] } };
      return { data: { results: [{ type: 'card', reason: 'exact_name', card: cardRows[0], cardId: cardRows[0].cardId, variantId: cardRows[0].defaultVariantId }] } };
    },
    assetManifest: async () => ({ data: { assets: [] }, meta: { pagination: { nextCursor: null } } }),
  };
  await assert.rejects(exports.fetchStackrCard('Retry', { language: 'en' }, retryClient));
  assert.equal(await exports.fetchStackrCard('Retry', { language: 'en' }, retryClient), null, 'empty resolution remains uncached');
  assert.ok(await exports.fetchStackrCard('Retry', { language: 'en' }, retryClient));
  assert.equal(retryCalls, 3, 'failures and empty responses retry');

  const slowGate: { release: (() => void) | null } = { release: null };
  const slowClient: any = {
    search: () => new Promise((resolve) => { slowGate.release = () => resolve({ data: { results: [{ type: 'card', reason: 'exact_name', card: cardRows[0], cardId: cardRows[0].cardId, variantId: cardRows[0].defaultVariantId }] } }); }),
    assetManifest: async () => ({ data: { assets: [] }, meta: { pagination: { nextCursor: null } } }),
  };
  const slow = exports.fetchStackrCard('Slow', { language: 'en' }, slowClient);
  exports.clearStackrCatalogueCaches(slowClient);
  assert.ok(slowGate.release);
  slowGate.release();
  await slow;
  let postClearSearches = 0;
  slowClient.search = async () => { postClearSearches += 1; return { data: { results: [{ type: 'card', reason: 'exact_name', card: cardRows[0], cardId: cardRows[0].cardId, variantId: cardRows[0].defaultVariantId }] } }; };
  await exports.fetchStackrCard('Slow', { language: 'en' }, slowClient);
  assert.equal(postClearSearches, 1, 'clearing while in flight prevents late success caching');

  let boundedSearches = 0;
  const boundedClient: any = {
    search: async ({ q }: any) => {
      boundedSearches += 1;
      return { data: { results: [{ type: 'card', reason: 'exact_name', card: { ...cardRows[0], cardId: `bounded-${q}` }, cardId: `bounded-${q}`, variantId: cardRows[0].defaultVariantId }] } };
    },
    assetManifest: async () => ({ data: { assets: [] }, meta: { pagination: { nextCursor: null } } }),
  };
  for (let index = 0; index <= 256; index += 1) await exports.fetchStackrCard(`Bound${index}`, { language: 'en' }, boundedClient);
  await exports.fetchStackrCard('Bound0', { language: 'en' }, boundedClient);
  assert.equal(boundedSearches, 258, 'the 256-entry bound evicts the oldest success without network fan-out');

  for (const languageCode of ['en', 'ja', 'zh-cn', 'zh-tw', 'ko']) {
    let manifestReads = 0;
    const exactSetClient = {
      set: async (id: string) => {
        assert.equal(id, PRISMATIC_ID);
        return { data: { set: { ...prismatic, languageCode } } };
      },
      assetManifest: async (query: any) => {
        manifestReads += 1;
        assert.equal(query.setId, PRISMATIC_ID, 'enrichment must never read the global asset library');
        assert.ok(['set_logo', 'set_symbol', 'set_cover', 'set_artwork'].includes(query.assetType));
        return { data: { assets: [] }, meta: {} };
      },
    };
    assert.equal((await exports.fetchStackrSet(PRISMATIC_ID, null, {}, exactSetClient)).language, languageCode,
      'an unprefixed UUID must use its actual catalogue language');
    assert.equal(manifestReads, 0, 'facts must resolve without optional artwork');
    await exports.fetchStackrSet(PRISMATIC_ID, languageCode, { includeAssets: true }, exactSetClient);
    assert.equal(manifestReads, 4);
    if (languageCode !== 'en') assert.equal(await exports.fetchStackrSet(PRISMATIC_ID, 'en', {}, exactSetClient), null,
      'explicit language disagreement must not silently switch printings');
  }
  assert.equal(pokemonSetIdentity.getPokemonSetLanguageFromPrefixedId('zh-cn:CSV1C'), 'zh-cn');
  assert.equal(pokemonSetIdentity.getPokemonSetLanguageFromPrefixedId('zh-tw:SV2a'), 'zh-tw');
  assert.equal(pokemonSetIdentity.getPokemonSetLanguageFromPrefixedId('ko:SV2a'), 'ko');

  const imageAsset = {
    assetId: 'reverse-art', assetType: 'card_image', game: 'pokemon', setId: PRISMATIC_ID, cardId: 'duplicate-card', variantId: 'reverse',
    deliveryPath: null, deliveryUrl: 'https://images.example/reverse.png', sourceAttribution: null, permissionStatus: 'approved', contentSha256: null,
    perceptualHash: null, mimeType: 'image/png', width: 300, height: 420, byteSize: 1, derivatives: [], cacheControl: null,
    externallyReferenced: false, unavailableReason: null, lastVerifiedAt: null, updatedAt: null,
  };
  const duplicateRow = (defaultVariantId: string, variants: any[], overrides: Record<string, unknown> = {}) => ({
    cardId: 'duplicate-card', catalogueVersionId: null, game: 'pokemon', languageCode: 'en',
    set: prismatic, collectorNumber: { value: '42', prefix: null, sort: 42, suffix: null, sortKey: '42' },
    names: { native: 'Duplicate', englishDisplay: 'Duplicate', englishDisplaySource: 'printing' }, details: {}, rarity: { label: null, code: null },
    defaultVariantId, variants, updatedAt: null, ...overrides,
  });
  const normal = { variantId: 'normal', canonicalId: 'canonical-normal', variantCode: 'normal', variantLabel: 'Normal', finishCode: 'normal', finishLabel: 'Normal', artworkKey: null, imageVariantId: null, image: null, updatedAt: null };
  const reverse = { variantId: 'reverse', canonicalId: 'canonical-reverse', variantCode: 'reverse', variantLabel: 'Reverse', finishCode: 'reverse_holo', finishLabel: 'Reverse Holo', artworkKey: null, imageVariantId: null, image: imageAsset, updatedAt: null };
  const holo = { variantId: 'holo', canonicalId: 'canonical-holo', variantCode: 'holo', variantLabel: 'Holo', finishCode: 'holo', finishLabel: 'Holo', artworkKey: null, imageVariantId: null, image: null, updatedAt: null };
  const duplicateRows = [
    duplicateRow('normal', [normal]),
    duplicateRow('reverse', [reverse]),
    duplicateRow('holo', [holo]),
    duplicateRow('normal', [normal], { set: { ...prismatic, setId: 'other-set' } }),
    duplicateRow('normal', [normal], { languageCode: 'ja' }),
  ];
  const duplicateClient = (rows: any[]): any => ({
    sets: async () => ({ data: { sets: [prismatic] }, meta: { pagination: { nextCursor: null } } }),
    setCards: async () => ({ data: { cards: rows }, meta: { pagination: { nextCursor: null } } }),
    assetManifest: async () => ({ data: { assets: [] }, meta: { pagination: { nextCursor: null } } }),
    set: async () => ({ data: { set: prismatic } }),
  });
  const normalizedDuplicates = await exports.fetchStackrCardsForSet('sv08.5', 'en', duplicateClient(duplicateRows));
  assert.equal(normalizedDuplicates.length, 3, 'only rows with the exact card, set, language, and collector identity merge');
  const merged = normalizedDuplicates.find((card: any) => card.id === 'duplicate-card' && card.language === 'en' && card.set.id === PRISMATIC_ID);
  assert.equal(merged.externalIds.stackrVariant, 'reverse', 'an image-bearing duplicate becomes the representative default');
  assert.equal(merged.images.large, 'https://images.example/reverse.png');
  assert.deepEqual([...merged.raw_data.stackr.variants.map((variant: any) => variant.variantId)].sort(), ['holo', 'normal', 'reverse']);
  assert.deepEqual(
    [...(await exports.fetchStackrCardsForSet('sv08.5', 'en', duplicateClient([duplicateRows[1], duplicateRows[0], duplicateRows[2], duplicateRows[3], duplicateRows[4]])))
      .find((card: any) => card.id === 'duplicate-card' && card.language === 'en' && card.set.id === PRISMATIC_ID).raw_data.stackr.variants.map((variant: any) => variant.variantId)].sort(),
    ['holo', 'normal', 'reverse'],
    'duplicate order does not lose finishes or the first valid image-bearing default',
  );
  const singleRowWrongDefault = duplicateRow('normal', [normal, reverse]);
  const singleRowMapped = await exports.fetchStackrCardsForSet('sv08.5', 'en', duplicateClient([singleRowWrongDefault]));
  assert.equal(singleRowMapped.length, 1);
  assert.equal(singleRowMapped[0].externalIds.stackrVariant, 'reverse', 'a single row may select its existing illustrated finish when its default has no asset');
  assert.equal(singleRowMapped[0].raw_data.presentation.selected_image_variant_id, 'reverse', 'selected-image attribution stays with the real illustrated variant');
  assert.deepEqual([...singleRowMapped[0].raw_data.stackr.variants.map((variant: any) => variant.variantId)].sort(), ['normal', 'reverse']);
  const singleRowWithoutArt = await exports.fetchStackrCardsForSet('sv08.5', 'en', duplicateClient([duplicateRow('normal', [normal]) ]));
  assert.equal(singleRowWithoutArt[0].externalIds.stackrVariant, 'normal', 'no-art rows retain their source default instead of inventing an illustrated finish');
  assert.equal(singleRowWithoutArt[0].raw_data.presentation.selected_image_variant_id, null);

  console.log('English set identity checks passed: verified aliases, language isolation, unique canonical resolution, binder recovery, duplicate finish normalization, and Prismatic 180-card lookup.');
}

void main();
