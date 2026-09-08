import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { URL, fileURLToPath } from 'node:url';
import ts from 'typescript';
import { getEnglishSetReferenceAliases, matchesEnglishSetReference } from '../lib/englishSetIdentity';
import { resolveBinderSetIdentity } from '../lib/binderSetIdentity';
import * as pokemonSetIdentity from '../lib/pokemonSetIdentity';
import * as pokemonSetSeries from '../lib/pokemonSetSeries';

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
    './pokemonDisplayNames': { getEnglishSetDisplayName: ({ englishDisplayName }: any) => englishDisplayName, getLocalSetName: ({ localName, fallbackName }: any) => localName ?? fallbackName },
    './foreignCardPresentation': { buildForeignCardPresentation: () => ({ name: 'Card', setName: 'Prismatic Evolutions', englishDisplayName: 'Card', englishSetDisplayName: 'Prismatic Evolutions', translationStatus: 'not_required', isForeign: false, withheldNativeDetails: false, details: {} }) },
    './supabase': { supabase: {} },
    './tcgdexControlledCardReference': { enforceTcgdexRuntimeImagePolicy: (value: unknown) => value },
    './resilientCatalogueRead': { firstNonEmptyCatalogueRows: async () => [], preferNonEmptyCatalogueRows: async () => [] },
    './optionalCatalogueEnrichment': { readOptionalCatalogueEnrichment: async (read: any) => read(undefined), throwIfOptionalCatalogueReadAborted: () => {} },
  };
  const exports: any = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => dependencies[name] ?? {}, console, AbortController, setTimeout, clearTimeout });

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

  console.log('English set identity checks passed: verified aliases, language isolation, unique canonical resolution, binder recovery, duplicate finish normalization, and Prismatic 180-card lookup.');
}

void main();
