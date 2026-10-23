import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import type { StackrCard, StackrCatalogueAsset } from '../lib/stackrApiV1';
import { copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments,
  mergePreferredSetArtwork as currentMergePreferredSetArtwork, readPreferredSetArtwork, rememberPreferredSetArtworkObservation } from '../lib/stackrPreferredSetArtwork';
import { resolveCardArtwork } from '../lib/cardArtworkPresentation';
import { buildForeignCardPresentation } from '../lib/foreignCardPresentation';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';
import { createSetFactsReader, loadCompleteSetPages, mergeBinderArtwork, publicSetCardFacts } from '../lib/stackrSetRetrieval';
import { getBinderCardImageUri, getBinderCatalogueInspectionImages } from '../lib/binderCataloguePresentation';
import { snapshotBinderView } from '../lib/binderReopenSnapshot';

// The optional directory replays the preserved public full-card/manifest DTOs.
// The default synthetic cohort has the same two-variant/default-normal shape.
const fixtureDirectory = process.argv[2];
const baselineRevision = process.env.SET_ARTWORK_REASSIGNMENT_BASELINE;
const sourceAtRevision = (file: string) => baselineRevision
  ? execFileSync('git', ['show', `${baselineRevision}:${file}`], { encoding: 'utf8' }) : readFileSync(file, 'utf8');
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const syntheticAsset = {
  assetId: 'immutable-asset', assetType: 'card_image', game: 'pokemon', cardId: uuid(1), setId: uuid(2),
  variantId: uuid(4), permissionStatus: 'approved', unavailableReason: null,
  deliveryUrl: 'https://approved.invalid/immutable-asset.jpg', contentSha256: 'immutable-content',
  derivatives: [{ role: 'card-grid', deliveryUrl: 'https://approved.invalid/immutable-asset-grid.webp' }],
} as StackrCatalogueAsset;
const syntheticCard = {
  cardId: uuid(1), catalogueVersionId: uuid(5), game: 'pokemon', languageCode: 'en',
  set: { setId: uuid(2), setCode: 'fixture', nativeName: 'Fixture', englishDisplayName: null },
  collectorNumber: { value: '60' }, names: { native: 'Fixture card', englishDisplay: null }, details: {},
  rarity: { code: null, label: null }, defaultVariantId: uuid(4), variants: [
    { variantId: uuid(3), canonicalId: 'fixture:first_edition', variantCode: 'first_edition', finishCode: 'first_edition',
      imageVariantId: uuid(4), sameArtworkAsVariantId: uuid(4), nativeImageStatus: 'same_artwork_reference', image: syntheticAsset },
    { variantId: uuid(4), canonicalId: 'fixture:normal', variantCode: 'normal', finishCode: 'normal',
      imageVariantId: uuid(4), sameArtworkAsVariantId: null, nativeImageStatus: 'available', image: syntheticAsset },
  ],
} as StackrCard;
const before: StackrCard = fixtureDirectory
  ? JSON.parse(readFileSync(join(fixtureDirectory, 'current-api/card.json'), 'utf8')).data.card : syntheticCard;
const originalAsset: StackrCatalogueAsset = fixtureDirectory
  ? JSON.parse(readFileSync(join(fixtureDirectory, 'current-api/manifest.json'), 'utf8')).data.assets[0] : syntheticAsset;
const firstId = before.variants.find(variant => variant.variantCode === 'first_edition')!.variantId;
const normalId = before.variants.find(variant => variant.variantCode === 'normal')!.variantId;
assert.equal(before.variants.length, 2);
assert.equal(before.defaultVariantId, normalId);
const after = structuredClone(before);
for (const variant of after.variants) variant.image = variant.variantId === firstId
  ? { ...originalAsset, cardId: before.cardId, variantId: firstId } : null;
const partial = { ...after, defaultVariantId: firstId, variants: after.variants.filter(variant => variant.variantId === firstId) };
const original = JSON.stringify({ before, after, partial });

function loadAdapter(preferred: StackrCard = after, failArtwork = false) {
  const source = sourceAtRevision('lib/stackrDomainAdapter.ts');
  const tree = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
  const names = new Set(['clean', 'toLegacyLanguage', 'embeddedCardImageAssets', 'primaryCardImageAsset',
    'stackrCardToLegacyCard', 'fetchStackrCard', 'fetchStackrAssetsForPrinting', 'allPages', 'readOptionalAssetPages',
    'fetchCanonicalSetCardFacts', 'enrichCanonicalSetCards', 'enrichStackrCardArtworkFromFacts']);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.has(node.name?.text ?? ''));
  assert.equal(functions.length, names.size);
  let selected = before;
  let assets: StackrCatalogueAsset[] = [];
  const reader = createSetFactsReader({ store: async () => null });
  const client = { catalogueCacheNamespace: 'warm-reassignment-fixture',
    assetManifest: async () => ({ data: { assets }, meta: { pagination: { nextCursor: null } } }),
    set: async () => ({ data: { set: { setId: before.set.setId, languageCode: before.languageCode, total: 1 } } }),
    setCards: async (_set: string, query: any) => {
      if (query.includeAssets && failArtwork) throw new Error('Synthetic preferred read unavailable');
      return { data: { cards: [query.includeAssets ? preferred : publicSetCardFacts(before)] }, meta: { pagination: { nextCursor: null } } };
    },
  };
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(ts.transpileModule(functions.map(node => node.getText(tree)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, Map, Set, WeakMap, Promise, Error, JSON,
    canonicalArtworkFacts: new WeakMap(), resolveCardArtwork, buildForeignCardPresentation,
    copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments, rememberPreferredSetArtworkObservation,
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    correctedChineseSetContext: (reference: string, language: string) => ({ reference, language }),
    resolveCanonicalStackrSetId: async (reference: string) => reference,
    toStackrApiLanguage: (language: string) => language, getPokemonSetLanguageFromPrefixedId: () => null,
    rememberedSet: () => null, rememberSet: () => {}, setFactsReader: () => reader,
    loadCompleteSetPages, normalizeCanonicalSetCards: (cards: StackrCard[]) => cards, readPreferredSetArtwork,
    readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted, stackrApiClient: client,
    shouldUseStackrApi: () => true, resolveCachedStackrCard: async (reference: string) => ({ card: selected, variantId: reference }),
  });
  return { map: module.exports.stackrCardToLegacyCard, enrich: module.exports.enrichStackrCardArtworkFromFacts,
    async fetch(card: StackrCard, variantId: string, manifest: StackrCatalogueAsset[] = []) {
      selected = card; assets = manifest; return module.exports.fetchStackrCard(variantId, {}, client);
    } };
}

function loadAttacher(display: any, enrich?: any) {
  const tree = ts.createSourceFile('binders.ts', readFileSync('lib/binders.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'attachBinderCatalogueArtwork');
  assert.ok(declaration);
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, mergeBinderArtwork, getPreferredSetArtworkReassignments,
    readOptionalCatalogueEnrichment, attachLiveTcgdexCardReferences: async (cards: any[]) => cards,
    enrichStackrCardArtworkFromFacts: enrich ?? (async (_cards: any[], _signal: any, _client: any, progress: any) => {
      progress?.([display]); return [display];
    }),
  });
  return module.exports.attachBinderCatalogueArtwork;
}

function loadScreenMerge() {
  const tree = ts.createSourceFile('pokemonTcg.ts', readFileSync('lib/pokemonTcg.ts', 'utf8'), ts.ScriptTarget.Latest, true);
  const functions = tree.statements.filter(node => ts.isFunctionDeclaration(node)
    && ['setCardArtworkIdentity', 'mergeSetCardArtwork'].includes(node.name?.text ?? ''));
  assert.equal(functions.length, 2);
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(ts.transpileModule(functions.map(node => node.getText(tree)).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports, getPreferredSetArtworkReassignments, copyPreferredSetArtworkReassignments });
  return module.exports.mergeSetCardArtwork;
}

function persistRows(rows: any[], source: 'json' | 'snapshot') {
  const binder = { id: uuid(30), user_id: uuid(31), name: 'Synthetic saved binder', type: 'official',
    source_set_id: before.set.setId, catalogue_set_id: before.set.setId, language: before.languageCode, is_public: false };
  return JSON.parse(JSON.stringify(source === 'json' ? rows : snapshotBinderView(
    { namespace: 'https://fixture.invalid', accountId: binder.user_id }, binder as any, rows, 1000,
  ).cards));
}

const mergePreferredSetArtwork = baselineRevision ? (() => {
  const tree = ts.createSourceFile('preferred.ts', sourceAtRevision('lib/stackrPreferredSetArtwork.ts'), ts.ScriptTarget.Latest, true);
  const declaration = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'mergePreferredSetArtwork');
  assert.ok(declaration);
  const module = { exports: {} as Record<string, any> };
  vm.runInNewContext(ts.transpileModule(declaration.getText(tree), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module, exports: module.exports });
  return module.exports.mergePreferredSetArtwork as typeof currentMergePreferredSetArtwork;
})() : currentMergePreferredSetArtwork;

async function main() {
  const adapter = loadAdapter();
  for (const incoming of [after, partial]) {
    const warm = mergePreferredSetArtwork([before], [incoming])[0];
    assert.equal(warm.defaultVariantId, normalId, 'fresh pagination selection cannot change the cached default finish');
    assert.equal(resolveCardArtwork(warm, [], normalId).kind, 'missing',
      'a fresh approved reassignment must remove the stale cached normal association');
    assert.equal(resolveCardArtwork(warm, [], normalId).candidates.length, 0);
    assert.equal(resolveCardArtwork(warm, [], firstId).kind, 'exact');
    const mapped = adapter.map(warm);
    assert.equal(mapped.images.small, undefined);
    assert.equal(mapped.images.large, undefined);
    assert.equal(mapped.raw_data.images.large, undefined, 'inspection cannot retain the previous normal image');
    assert.equal(mapped.raw_data.presentation.artwork.kind, 'missing');
    assert.equal(adapter.map(warm, [originalAsset]).raw_data.presentation.artwork.kind, 'missing',
      'an older optional manifest cannot restore the positively contradicted asset association');
    assert.equal((await adapter.fetch(warm, normalId, [originalAsset])).raw_data.presentation.artwork.kind, 'missing');
    const savedCard = adapter.map(before);
    const screen = loadScreenMerge()([savedCard], [mapped])[0];
    assert.ok(!screen.images.small && !screen.images.large, 'Set/Card Detail cannot retain the reassigned normal image');
    assert.ok(!screen.raw_data.images.small && !screen.raw_data.images.large, 'Set/Card inspection cannot retain the old image');
    assert.equal(screen.raw_data.presentation.artwork.kind, 'missing');
    const row = { id: uuid(20), card_id: before.cardId, set_id: before.set.setId, language: before.languageCode,
      catalogue_match_status: 'catalogue', card: savedCard, image_url: savedCard.images.small,
      owned_quantity: 3, tcg_price: 42, notes: 'Synthetic private quantity and price sentinels' };
    const recovered = (await loadAttacher(mapped)([row]))[0];
    assert.equal(getBinderCardImageUri(recovered), null, 'a saved warm tile cannot retain the reassigned catalogue face');
    assert.equal(getBinderCatalogueInspectionImages(recovered), null, 'saved inspection cannot retain the reassigned face');
    assert.equal(recovered.card.raw_data.presentation.artwork.kind, 'missing');
    assert.equal(recovered.owned_quantity, 3); assert.equal(recovered.tcg_price, 42); assert.equal(recovered.notes, row.notes);
    for (const source of ['json', 'snapshot'] as const) {
      const live = loadAdapter(incoming);
      const saved = persistRows([{ ...row, card: live.map(before) }], source);
      const output = await loadAttacher(null, live.enrich)(saved);
      assert.equal(getBinderCardImageUri(output[0]), null, `${source} saved rows must recover facts and clear only the proved stale binding`);
      assert.equal(getBinderCatalogueInspectionImages(output[0]), null);
      assert.equal(output[0].owned_quantity, saved[0].owned_quantity);
      assert.equal(output[0].tcg_price, saved[0].tcg_price);
      assert.equal(output[0].notes, saved[0].notes);
    }
    const exactFirst = await adapter.fetch(warm, firstId);
    assert.equal(exactFirst.raw_data.presentation.artwork.kind, 'exact');
    assert.equal(exactFirst.raw_data.presentation.selected_image_variant_id, firstId);
    assert.ok(exactFirst.images.small);
    assert.equal(warm.variants.find(v => v.variantId === normalId)!.nativeImageStatus,
      before.variants.find(v => v.variantId === normalId)!.nativeImageStatus, 'source availability metadata stays unchanged');
    for (let index = 0; index < warm.variants.length; index++) {
      const { image: _oldImage, ...oldFacts } = before.variants[index];
      const { image: _newImage, ...newFacts } = warm.variants[index];
      assert.deepEqual(newFacts, oldFacts, 'a read-time association correction changes no canonical variant facts');
    }
  }
  for (const invalidate of [
    (card: StackrCard) => { card.languageCode = 'ja'; },
    (card: StackrCard) => { card.catalogueVersionId = 'other-version'; },
    (card: StackrCard) => { card.set.setId = 'other-set'; },
    (card: StackrCard) => { card.game = 'other-game'; },
    (card: StackrCard) => { card.collectorNumber.value = '999'; },
    (card: StackrCard) => { card.variants[0].canonicalId = 'other-canonical-identity'; },
    (card: StackrCard) => { card.variants[0].image!.permissionStatus = 'denied'; },
    (card: StackrCard) => { card.variants[0].image!.unavailableReason = 'not-approved'; },
    (card: StackrCard) => { card.variants[0].image!.cardId = 'wrong-printing'; },
    (card: StackrCard) => { card.variants[0].image!.setId = 'wrong-set'; },
    (card: StackrCard) => { card.variants[0].image!.game = 'wrong-game'; },
    (card: StackrCard) => { card.variants[0].image!.variantId = 'wrong-variant'; },
    (card: StackrCard) => { card.variants[0].image!.contentSha256 = 'different-content'; },
  ]) {
    const invalid = structuredClone(after); invalidate(invalid);
    const warm = mergePreferredSetArtwork([before], [invalid])[0];
    assert.equal(resolveCardArtwork(warm, [], normalId).kind, 'exact', 'an unverified contradiction cannot erase existing valid artwork');
  }
  const noImages = structuredClone(after); for (const variant of noImages.variants) variant.image = null;
  assert.equal(resolveCardArtwork(mergePreferredSetArtwork([before], [noImages])[0], [], normalId).kind, 'exact');
  const savedCard = adapter.map(before);
  const emptyDisplay = adapter.map(noImages);
  const retainedScreen = loadScreenMerge()([savedCard], [emptyDisplay])[0];
  assert.equal(retainedScreen.images.small, savedCard.images.small, 'an empty optional screen result cannot clear valid artwork');
  const savedRow = { id: uuid(20), card_id: before.cardId, set_id: before.set.setId, language: before.languageCode,
    catalogue_match_status: 'catalogue', card: savedCard, image_url: savedCard.images.small, owned_quantity: 3 };
  assert.equal(getBinderCardImageUri((await loadAttacher(emptyDisplay)([savedRow]))[0]), savedCard.images.small,
    'an empty optional binder result cannot clear valid artwork');
  const warm = mergePreferredSetArtwork([before], [after])[0];
  const correctedDisplay = adapter.map(warm);
  const capture = { ...savedRow, image_url: 'https://private.invalid/synthetic-capture.jpg' };
  const captured = (await loadAttacher(correctedDisplay)([capture]))[0];
  assert.equal(captured.image_url, capture.image_url, 'a distinct private captured photo is never erased by a catalogue correction');
  assert.equal(getBinderCatalogueInspectionImages(captured), null, 'a capture cannot become catalogue inspection art');
  const serializedMissing = JSON.parse(JSON.stringify(correctedDisplay));
  assert.equal(getPreferredSetArtworkReassignments(serializedMissing.raw_data).length, 0,
    'serialized data cannot manufacture authority to erase a warm image');
  const denied = structuredClone(after); denied.variants[0].image!.permissionStatus = 'denied';
  const wrongVersion = { ...after, catalogueVersionId: 'other-version' };
  for (const scenario of [
    { name: 'failure', preferred: after, failure: true },
    { name: 'denied', preferred: denied, failure: false },
    { name: 'unrelated', preferred: { ...after, cardId: 'other-printing' }, failure: false },
    { name: 'empty', preferred: noImages, failure: false },
    { name: 'version', preferred: wrongVersion, failure: false },
  ]) {
    for (const source of ['json', 'snapshot'] as const) {
      const live = loadAdapter(scenario.preferred, scenario.failure);
      const saved = persistRows([{ ...savedRow, card: live.map(before), tcg_price: 42, notes: 'Keep private saved fields' }], source);
      const output = (await loadAttacher(null, live.enrich)(saved))[0];
      assert.equal(getBinderCardImageUri(output), saved[0].card.images.small, `${source} ${scenario.name} fresh read cannot grant saved history clearing authority`);
      assert.equal(output.tcg_price, saved[0].tcg_price); assert.equal(output.owned_quantity, 3); assert.equal(output.notes, saved[0].notes);
    }
  }
  const liveCapture = loadAdapter(after);
  const savedCapture = JSON.parse(JSON.stringify({ ...savedRow, card: liveCapture.map(before), image_url: capture.image_url, tcg_price: 42 }));
  const correctedCapture = (await loadAttacher(null, liveCapture.enrich)([savedCapture]))[0];
  assert.equal(correctedCapture.image_url, capture.image_url, 'actual serialized enrichment preserves a distinct private photo');
  assert.equal(getBinderCatalogueInspectionImages(correctedCapture), null);
  assert.equal(correctedCapture.tcg_price, 42); assert.equal(correctedCapture.owned_quantity, 3);
  const observed = { ...before };
  rememberPreferredSetArtworkObservation(observed, resolveCardArtwork(before));
  const differentFront = structuredClone(before);
  differentFront.variants.find(variant => variant.variantId === normalId)!.image = {
    ...originalAsset, assetId: 'fixture-unrelated-new-front', cardId: before.cardId, variantId: normalId,
    deliveryUrl: 'https://approved.invalid/unrelated-new-front.jpg',
  };
  const newFront = mergePreferredSetArtwork([observed], [differentFront]);
  const laterCorrection = mergePreferredSetArtwork(newFront, [partial]);
  assert.equal(resolveCardArtwork(laterCorrection[0], [], normalId).assetId, 'fixture-unrelated-new-front',
    'reassigning an older saved observation cannot erase a different valid front received on an earlier page');
  assert.deepEqual(await readPreferredSetArtwork([before], { setCards: async () => { throw new Error('optional provider unavailable'); } }), [before]);
  const unrelated = { ...after, cardId: 'unrelated-printing', variants: [] };
  assert.deepEqual(mergePreferredSetArtwork([before], [unrelated]), [before]);
  // Duplicate immutable IDs must not hide the selected association's provenance.
  const conflicting = { ...before, defaultVariantId: firstId,
    variants: before.variants.map(variant => variant.variantId === firstId ? after.variants[0] : variant) };
  assert.equal(adapter.map(conflicting).raw_data.presentation.selected_image_variant_id, firstId);
  assert.equal(JSON.stringify({ before, after, partial }), original, 'neither the cached facts nor received DTOs can be mutated');
  console.log(`Set artwork reassignment: full/partial warm merge and actual adapter pass (${fixtureDirectory ? 'preserved public DTOs' : 'synthetic cohort'}); protected invalid/failure scopes retain artwork.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
