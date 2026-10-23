import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { snapshotBinderView, isCompleteBinderSnapshot } from '../lib/binderReopenSnapshot';
import { createSetFactsReader, loadCompleteSetPages, mergeBinderArtwork } from '../lib/stackrSetRetrieval';
import { copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments, readPreferredSetArtwork, rememberPreferredSetArtworkObservation } from '../lib/stackrPreferredSetArtwork';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';
import { getBinderCatalogueInspectionImages } from '../lib/binderCataloguePresentation';
import { getCardArtworkPresentation, resolveCardArtwork } from '../lib/cardArtworkPresentation';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setId = uuid(10); const version = uuid(11);
const source = ['1', 'adapter'].includes(process.env.SAVED_ARTWORK_BASELINE ?? '')
  ? execFileSync('git', ['show', 'HEAD:lib/stackrDomainAdapter.ts'], { encoding: 'utf8' })
  : readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
function functions(text: string, names: string[]) {
  const tree = ts.createSourceFile('fixture.ts', text, ts.ScriptTarget.Latest, true);
  const nodes = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
  assert.equal(nodes.length, names.length);
  return ts.transpileModule(nodes.map((node) => node.getText(tree)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
}
const adapter = functions(source, ['embeddedCardImageAssets', 'primaryCardImageAsset', 'fetchCanonicalSetCardFacts', 'enrichStackrCardArtworkFromFacts']);
const binderSource = process.env.SAVED_ARTWORK_BASELINE === '1'
  ? execFileSync('git', ['show', 'HEAD:lib/binders.ts'], { encoding: 'utf8' })
  : readFileSync('lib/binders.ts', 'utf8');
const attacher = functions(binderSource, ['attachBinderCatalogueArtwork']);
const facts = [1, 2].map((n) => ({ cardId: uuid(n), catalogueVersionId: version, game: 'pokemon', languageCode: 'ja',
  set: { setId, setCode: 'M6', nativeName: 'Fixture', englishDisplayName: null }, collectorNumber: { value: String(n) },
  names: { native: `カード${n}`, englishDisplay: null }, rarity: { code: null, label: null }, details: {},
  defaultVariantId: uuid(20 + n), variants: [{ variantId: uuid(20 + n), canonicalId: `ja:fixture:${n}:normal`,
    variantCode: 'normal', finishCode: 'normal', imageVariantId: uuid(20 + n), image: null as ReturnType<typeof imageFor> | null }],
}));
const rowsFor = (population: typeof facts) => population.map((fact, index) => ({ id: `saved-${index}`, binder_id: uuid(100), card_id: fact.cardId,
  set_id: setId, language: 'ja', catalogue_match_status: 'catalogue', owned: true, owned_quantity: 3, notes: 'Owner note',
  card: { id: fact.cardId, number: fact.collectorNumber.value, name: fact.names.native, language: 'ja',
    set: { id: setId, name: 'Fixture' }, images: { small: null, large: null },
    raw_data: { stackr: { canonical: true, cardId: fact.cardId, catalogueVersionId: version,
      defaultVariantId: fact.defaultVariantId, variants: fact.variants }, language: 'ja' } },
}));
const rows = rowsFor(facts);
const scope = { namespace: 'https://fixture.invalid', accountId: uuid(200) };
const binder = { id: uuid(100), user_id: scope.accountId, name: 'Saved fixture', color: 'purple', type: 'official',
  source_set_id: setId, catalogue_set_id: setId, catalogue_identity_status: 'resolved', catalogue_set_total: 2,
  language: 'ja', created_at: '2026-01-01', is_public: false } as any;
function savedRows() { return snapshotBinderView(scope, binder, rows as any, 1000).cards; }
const assetIdFor = (fact: any) => fact.cardId.replace('00000000-', '00000001-');
const imageFor = (fact: any) => ({ assetType: 'card_image', assetId: assetIdFor(fact), cardId: fact.cardId,
  setId: fact.set.setId, variantId: fact.defaultVariantId, permissionStatus: 'approved',
  deliveryUrl: `https://approved.invalid/${fact.cardId}.webp` });

function harness(population = facts) {
  let factReads = 0; let imageReads = 0;
  const pages: { includeAssets: boolean; cursor: string | null; limit: number; cardIds: string[] }[] = [];
  const exports: any = {};
  const reader = createSetFactsReader({ store: async () => null });
  let rememberedMetadata: any = null;
  const client = { catalogueCacheNamespace: 'saved-art-fixture',
    set: async () => ({ data: { set: { setId, languageCode: 'ja', total: population.length } } }),
    setCards: async (_set: string, query: any) => {
      assert.equal(_set, setId); assert.equal(query.language, 'ja');
      assert.ok(Number.isSafeInteger(query.limit) && query.limit > 0 && query.limit <= 50,
        'Facts and artwork must each use bounded network pages.');
      if (query.includeAssets) imageReads++; else factReads++;
      const offset = Number(query.cursor ?? 0);
      const page = population.slice(offset, offset + query.limit);
      pages.push({ includeAssets: query.includeAssets === true, cursor: query.cursor ?? null,
        limit: query.limit, cardIds: page.map((fact) => fact.cardId) });
      return { data: { cards: query.includeAssets ? page.map((fact) => ({ ...fact, variants: fact.variants.map((variant) => ({ ...variant,
        image: imageFor(fact) })) })) : page },
      meta: { pagination: { nextCursor: offset + page.length < population.length ? String(offset + page.length) : null } } };
    } };
  const mapCard = (fact: any) => {
    const images = { small: fact.variants[0].image?.deliveryUrl ?? null, large: fact.variants[0].image?.deliveryUrl ?? null };
    return { id: fact.cardId, number: fact.collectorNumber.value, language: 'ja', set: { id: fact.set.setId }, images,
      raw_data: { images, stackr: { canonical: true, cardId: fact.cardId, catalogueVersionId: fact.catalogueVersionId,
        defaultVariantId: fact.defaultVariantId, variants: fact.variants },
      presentation: { artwork: { kind: 'shared', selectedVariantId: fact.defaultVariantId, sourceVariantId: null,
        assetId: assetIdFor(fact), small: images.small, large: images.large,
        candidates: images.small ? [{ uri: images.small, kind: 'shared', assetId: assetIdFor(fact), sourceVariantId: null }] : [] } } } };
  };
  const context: any = { exports, Map, Set, WeakMap, JSON, Error, String, Number, Array,
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    canonicalArtworkFacts: new WeakMap(), stackrApiClient: client, resolveCardArtwork,
    copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments, rememberPreferredSetArtworkObservation,
    toStackrApiLanguage: (language: string) => ['ja', 'en', 'zh-Hans', 'zh-Hant', 'ko'].includes(language) ? language : null,
    getPokemonSetLanguageFromPrefixedId: () => null,
    correctedChineseSetContext: (reference: string, language: string) => ({ reference, language }),
    resolveCanonicalStackrSetId: async (reference: string) => reference,
    rememberedSet: () => rememberedMetadata, rememberSet: (_client: any, set: any) => { rememberedMetadata = set; },
    setFactsReader: () => reader, loadCompleteSetPages, normalizeCanonicalSetCards: (cards: any) => cards,
    readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted, readPreferredSetArtwork, mergeBinderArtwork,
    stackrCardToLegacyCard: mapCard,
    enrichCanonicalSetCards: async ({ cards }: any) => cards.map(mapCard),
    hasTcgdexRuntimeImageOverlay: () => false, attachLiveTcgdexCardReferences: async (cards: any) => cards,
  };
  runInNewContext(adapter, context);
  context.enrichStackrCardArtworkFromFacts = exports.enrichStackrCardArtworkFromFacts;
  runInNewContext(attacher, context);
  return { attach: exports.attachBinderCatalogueArtwork, factReads: () => factReads, imageReads: () => imageReads,
    pages: () => pages,
    remember: (raw: object, fact: any) => context.canonicalArtworkFacts.set(raw, fact),
    rememberSet: () => { rememberedMetadata = { setId, languageCode: 'ja', total: population.length }; } };
}

function assertPageCoverage(reader: ReturnType<typeof harness>, includeAssets: boolean, population: typeof facts) {
  const pages = reader.pages().filter((page) => page.includeAssets === includeAssets);
  const expectedIds = population.map((fact) => fact.cardId);
  assert.deepEqual(pages.flatMap((page) => page.cardIds), expectedIds,
    'Bounded pagination must cover every expected identity exactly once and in order.');
  let offset = 0;
  for (const page of pages) {
    assert.equal(page.cursor, offset === 0 ? null : String(offset), 'Each page must resume after the prior page.');
    assert.ok(page.cardIds.length <= page.limit && page.limit <= 50);
    offset += page.cardIds.length;
  }
  assert.equal(pages.length, Math.ceil(population.length / 50), 'The complete set must not trigger extra empty reads.');
}

async function assertMetadataCacheExpires() {
  let clock = 0;
  let metadataReads = 0;
  const expectedCounts: number[] = [];
  const client = {
    catalogueCacheNamespace: 'metadata-expiry-fixture',
    set: async () => ({ data: { set: { setId, languageCode: 'ja', total: ++metadataReads === 1 ? 2 : 3 } } }),
  };
  const context: any = {
    exports: {}, Map, WeakMap, Date: { now: () => clock },
    resolvedSetMetadata: new WeakMap(), stackrApiClient: client,
    correctedChineseSetContext: (reference: string, language: string) => ({ reference, language }),
    resolveCanonicalStackrSetId: async (reference: string) => reference,
    getPokemonSetLanguageFromPrefixedId: () => null,
    toStackrApiLanguage: (language: string) => language === 'ja' ? language : null,
    setFactsReader: () => ({ read: async (key: { expectedCount: number }) => {
      expectedCounts.push(key.expectedCount);
      return { setId, cards: [] };
    } }),
  };
  runInNewContext(functions(source, ['rememberedSet', 'rememberSet', 'fetchCanonicalSetCardFacts']), context);
  for (const at of [0, 30_000, 65_000]) {
    clock = at;
    await context.fetchCanonicalSetCardFacts(setId, 'ja', client, undefined, { includeAssets: false });
  }
  assert.equal(metadataReads, 2, 'A cache hit cannot renew metadata without a network read.');
  assert.deepEqual(expectedCounts, [2, 2, 3], 'Expired metadata must refresh the exact population used for complete facts.');
}

async function main() {
  if (!process.env.SAVED_ARTWORK_BASELINE) await assertMetadataCacheExpires();
  const snapshot = snapshotBinderView(scope, binder, rows as any, 1000);
  assert(isCompleteBinderSnapshot(snapshot, scope, binder.id, 1000));
  const saved = JSON.parse(JSON.stringify(snapshot.cards));
  const before = JSON.stringify(saved);
  const live = harness();
  const result = await live.attach(saved);
  assert.equal(result[0].card.images.small, `https://approved.invalid/${facts[0].cardId}.webp`,
    'A real serialized saved preview must recover artwork without an in-memory WeakMap handle.');
  assert.equal(live.factReads(), 1, 'Saved cards in the same set share one complete public facts read.');
  assert.equal(live.imageReads(), 1);
  assert.equal(JSON.stringify(saved), before, 'Artwork enrichment must not mutate the saved source.');
  const stale = savedRows();
  stale[0].card.raw_data.images = { small: 'https://approved.invalid/old-small.webp', large: 'https://approved.invalid/old-large.webp' };
  const refreshed = await harness().attach(stale);
  assert.equal(getBinderCatalogueInspectionImages(refreshed[0])?.fullImageUri, refreshed[0].card.images.large,
    'Inspection must open the same recovered full-resolution catalogue artwork displayed by the binder, not stale raw images.');
  assert.equal(getCardArtworkPresentation(refreshed[0].card)?.candidates[0].kind, 'shared',
    'Recovered printing-face artwork retains its shared-reference provenance for the actual image surface.');
  assert.equal(stale[0].card.raw_data.images.large, 'https://approved.invalid/old-large.webp', 'Recovery cannot mutate the previous saved image.');
  for (let i = 0; i < result.length; i++) {
    assert.equal(result[i].owned_quantity, saved[i].owned_quantity); assert.equal(result[i].notes, saved[i].notes);
    assert.equal(result[i].tcg_price, null); assert.equal(result[i].card.name, saved[i].card.name);
    assert.deepEqual(result[i].card.raw_data.stackr, saved[i].card.raw_data.stackr);
  }
  for (const change of [
    (card: any) => { card.raw_data.stackr.catalogueVersionId = uuid(999); },
    (card: any) => { card.language = 'en'; },
    (card: any) => { card.number = '999'; },
    (card: any) => { card.raw_data.stackr.variants[0].canonicalId = 'other-printing'; },
    (card: any) => { card.raw_data.stackr.variants[0].imageVariantId = uuid(999); },
    (card: any) => { card.raw_data.stackr.variants[0].finishCode = 'reverse'; },
  ]) {
    const mismatched = savedRows(); mismatched.forEach((row: any) => change(row.card));
    const check = harness(); const output = await check.attach(mismatched);
    assert.equal(output[0].card.images.small, null); assert.equal(check.imageReads(), 0, 'Mismatched saved identities cannot acquire another printing image.');
  }
  const aborted = new AbortController(); aborted.abort(new Error('left saved binder'));
  const stopped = harness(); await assert.rejects(stopped.attach(savedRows(), aborted.signal), /left saved binder/);
  assert.equal(stopped.factReads(), 0); assert.equal(stopped.imageReads(), 0);
  const fullSet = Array.from({ length: 200 }, (_, index) => ({ ...facts[0], cardId: uuid(1000 + index),
    collectorNumber: { value: String(index + 1) }, defaultVariantId: uuid(2000 + index),
    variants: [{ ...facts[0].variants[0], variantId: uuid(2000 + index), imageVariantId: uuid(2000 + index), canonicalId: `ja:late:${index}:normal` }] }));
  const subset = snapshotBinderView(scope, { ...binder, type: 'custom', source_set_id: null,
    catalogue_set_id: null, catalogue_set_total: null }, rowsFor([fullSet[199]]) as any, 1000,
  { customSource: { kind: 'binder-saved-cards-v1', cardCount: 1 } });
  assert(isCompleteBinderSnapshot(subset, scope, binder.id, 1000));
  const late = harness(fullSet); const lateResult = await late.attach(subset.cards);
  assert.equal(lateResult[0].card.images.small, `https://approved.invalid/${fullSet[199].cardId}.webp`,
    'Saved custom subsets must reach images on later whole-set pages.');
  assertPageCoverage(late, false, fullSet);
  assertPageCoverage(late, true, fullSet);
  assert.equal(lateResult.length, 1, 'Only identity-matched saved rows are returned.');
  const liveSubset = rowsFor([fullSet[199]]);
  const liveLate = harness(fullSet);
  liveLate.remember(liveSubset[0].card.raw_data, fullSet[199]);
  const liveLateResult = await liveLate.attach(liveSubset);
  assert.equal(liveLateResult[0].card.images.small, `https://approved.invalid/${fullSet[199].cardId}.webp`,
    'A live custom subset must reach the same later set page as its serialized saved view.');
  assertPageCoverage(liveLate, false, fullSet);
  assertPageCoverage(liveLate, true, fullSet);
  const completeLive = harness(fullSet); completeLive.rememberSet();
  const completeLiveRows = rowsFor(fullSet);
  completeLiveRows.forEach((row, index) => completeLive.remember(row.card.raw_data, fullSet[index]));
  const completeLiveResult = await completeLive.attach(completeLiveRows);
  assert.equal(completeLive.factReads(), 0, 'An already known complete live set must not repeat its facts retrieval.');
  assertPageCoverage(completeLive, true, fullSet);
  assert.deepEqual(completeLiveResult.map((row: any) => row.card.images.small), fullSet.map((fact) => imageFor(fact).deliveryUrl),
    'Every saved row, including rows across page boundaries, receives its own approved artwork.');
  const alreadyImagedFact = { ...fullSet[0], variants: fullSet[0].variants.map(variant => ({ ...variant,
    image: { ...imageFor(fullSet[0]), deliveryUrl: 'https://approved.invalid/old-approved.webp' } })) };
  const alreadyImaged = harness(fullSet); const imagedRow = rowsFor([alreadyImagedFact]);
  alreadyImaged.remember(imagedRow[0].card.raw_data, alreadyImagedFact);
  const imagedResult = await alreadyImaged.attach(imagedRow);
  assert.equal(imagedResult[0].card.images.small, imageFor(alreadyImagedFact).deliveryUrl,
    'A newer approved preferred replacement must still supersede an older embedded front.');
  assert.equal(alreadyImaged.factReads(), 0, 'A single-card detail with approved artwork must not retrieve whole-set facts.');
  assert.equal(alreadyImaged.imageReads(), 2, 'Usable current artwork keeps its existing bounded preferred enrichment without new facts retrieval.');
  assertPageCoverage(alreadyImaged, true, fullSet.slice(0, 100));
  const replacedPopulation = fullSet.map((fact) => ({ ...fact, catalogueVersionId: uuid(999) }));
  const changedVersion = harness(replacedPopulation);
  changedVersion.remember(liveSubset[0].card.raw_data, fullSet[199]);
  const unchanged = await changedVersion.attach(liveSubset);
  assert.equal(unchanged[0].card.images.small, null, 'A newer catalogue version cannot silently hydrate an older live view.');
  console.log('Serialized saved binder artwork recovers through actual facts/enrichment/attacher; exact identity, quantities, private fields and cancellation preserved.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
