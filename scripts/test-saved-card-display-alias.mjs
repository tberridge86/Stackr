import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual display modules and adapter functions with bounded public
// API captures. Only the network boundary is replaced; no catalogue is mutated.
const root = process.cwd();
const cache = new Map();
function loadModule(file) {
  const absolute = path.resolve(root, file);
  if (cache.has(absolute)) return cache.get(absolute);
  const module = { exports: {} };
  cache.set(absolute, module.exports);
  const source = fs.readFileSync(absolute, 'utf8');
  const requireModule = (id) => {
    assert.ok(id.startsWith('.'), `Unexpected runtime dependency ${id}`);
    const base = path.resolve(path.dirname(absolute), id);
    const target = [base + '.ts', base + '.tsx', base + '.js'].find(fs.existsSync);
    assert.ok(target, `Missing dependency ${id}`);
    return loadModule(target);
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { module, exports: module.exports, require: requireModule,
    process: { env: {} }, URL, setTimeout, clearTimeout, AbortController }, { filename: absolute });
  return module.exports;
}
const artwork = loadModule('lib/cardArtworkPresentation.ts');
const presentation = loadModule('lib/foreignCardPresentation.ts');
const preferred = loadModule('lib/stackrPreferredSetArtwork.ts');
const retrieval = loadModule('lib/stackrSetRetrieval.ts');
const optional = loadModule('lib/optionalCatalogueEnrichment.ts');
const source = fs.readFileSync(path.join(root, 'lib/stackrDomainAdapter.ts'), 'utf8');
const tree = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
const functions = ['clean', 'toLegacyLanguage', 'toStackrApiLanguage', 'embeddedCardImageAssets',
  'primaryCardImageAsset', 'stackrCardToLegacyCard', 'allPages', 'enrichSavedStackrCardArtwork'];
const nodes = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && functions.includes(node.name?.text));
assert.equal(nodes.length, functions.length);
const adapterModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(nodes.map((node) => node.getText(tree)).join('\n'), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { module: adapterModule, exports: adapterModule.exports,
  ...artwork, ...presentation, ...preferred, ...retrieval, ...optional,
  canonicalArtworkFacts: new WeakMap(),
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i });
const adapter = adapterModule.exports;
const capture = JSON.parse(fs.readFileSync(path.join(root, 'docs/audits/20261102/public-search-varoom-ja.json'), 'utf8'));
assert.equal(capture.response.meta.requestId, '8c382780-e250-4d4e-a78b-ce9b1145605c');
const liveCards = capture.response.data.results.map((result) => result.card);
const fresh = liveCards.map((card) => adapter.stackrCardToLegacyCard(card));
for (const card of fresh) {
  assert.equal(card.name, 'Varoom');
  assert.equal(card.localName, 'ブロロン');
  assert.ok(card.images.small);
}
for (let index = 0; index < 2; index++) {
  assert.equal(fresh[index].images.small, liveCards[index].variants[0].image.derivatives.find((item) => item.role === 'card-grid').deliveryUrl);
}
assert.equal(fresh[2].images.small, liveCards[2].variants[0].image.deliveryUrl);
const savedCard = () => {
  const card = structuredClone(fresh[0]);
  card.name = `Japanese card · ${card.number} (translation pending)`;
  card.englishDisplayName = null;
  card.translationStatus = 'pending';
  card.raw_data.name = card.name;
  card.raw_data.english_display_name = null;
  card.raw_data.english_display_supplement = null;
  card.raw_data.translation_status = 'pending';
  card.images = {};
  card.raw_data.images = {};
  return card;
};
const row = (card) => ({ id: 'saved-owner-row', card_id: card.id, set_id: card.set.id, language: 'ja',
  owned_quantity: 4, condition: 'Near Mint', notes: 'Private note', slot_order: 7, card });
const before = row(savedCard());
const beforeJson = JSON.stringify(before);
const merged = retrieval.mergeBinderArtwork([before], [{ ...row(fresh[0]), owned_quantity: 1, notes: '' }])[0];
assert.equal(merged.card.name, 'Varoom');
assert.equal(merged.card.raw_data.english_display_name, 'Varoom');
assert.deepEqual(merged.card.raw_data.english_display_supplement, fresh[0].raw_data.english_display_supplement);
assert.equal(merged.card.raw_data.local_name, 'ブロロン');
assert.deepEqual(merged.card.raw_data.stackr, before.card.raw_data.stackr);
for (const field of ['owned_quantity', 'condition', 'notes', 'slot_order']) assert.equal(merged[field], before[field]);
assert.equal(JSON.stringify(before), beforeJson, 'Saved input remains unchanged');
const snapshots = loadModule('lib/binderReopenSnapshot.ts');
const scope = { namespace: 'https://fixture.invalid', accountId: '00000000-0000-4000-8000-000000000010' };
const binder = { id: '00000000-0000-4000-8000-000000000011', user_id: scope.accountId,
  name: 'Saved fixture', type: 'official', language: 'ja', catalogue_set_id: before.set_id };
const serialized = snapshots.snapshotBinderView(scope, binder, [before], Date.now()).cards[0];
assert.equal(serialized.card.localName, undefined, 'Exercise the actual snapshot whitelist');
assert.equal(retrieval.mergeBinderArtwork([serialized], [{ ...serialized, card: fresh[0] }])[0].card.name, 'Varoom');
const reopened = snapshots.snapshotBinderView(scope, binder, [merged], Date.now()).cards[0];
assert.equal(reopened.card.raw_data.english_display_name, 'Varoom', 'Recovered alias survives offline reopen');

let reads = 0;
const client = { setCards: async (setId, query) => {
  reads++;
  assert.equal(setId, liveCards[0].set.setId);
  assert.equal(query.language, 'ja');
  assert.equal(query.includeAssets, true);
  return { data: { cards: [structuredClone(liveCards[0])] }, meta: { pagination: { nextCursor: null } } };
} };
const direct = await adapter.enrichSavedStackrCardArtwork([savedCard()], undefined, client);
assert.equal(reads, 1, 'Existing set read supplies both image and name');
assert.equal(direct.length, 1);
assert.equal(direct[0].name, 'Varoom');
assert.equal(direct[0].images.small, fresh[0].images.small);

const withoutArt = structuredClone(liveCards[0]);
withoutArt.variants.forEach((variant) => { variant.image = null; });
const nameOnly = await adapter.enrichSavedStackrCardArtwork([savedCard()], undefined, {
  setCards: async () => ({ data: { cards: [withoutArt] }, meta: { pagination: { nextCursor: null } } }),
});
assert.equal(nameOnly.length, 1, 'Missing artwork does not suppress an approved name');
assert.deepEqual(nameOnly[0].raw_data.presentation.artwork, before.card.raw_data.presentation.artwork,
  'A name-only update retains existing approved fallback candidates');
const nameOnlyRow = retrieval.mergeBinderArtwork([before], [row(nameOnly[0])])[0];
assert.equal(nameOnlyRow.card.name, 'Varoom');
assert.ok(!nameOnlyRow.card.images.small && !nameOnlyRow.card.images.large);
const referenceUri = 'https://assets.tcgdex.net/ja/reference.webp';
const referenceCard = savedCard();
Object.defineProperty(referenceCard, 'images', { value: { small: referenceUri }, enumerable: false });
const aliasWithReference = retrieval.mergeCanonicalCardDisplayName(referenceCard, fresh[0]);
assert.equal(aliasWithReference.name, 'Varoom');
assert.equal(aliasWithReference.images.small, referenceUri);
assert.equal(Object.getOwnPropertyDescriptor(aliasWithReference, 'images').enumerable, false);
assert.ok(!JSON.stringify(aliasWithReference).includes(referenceUri), 'Alias helper keeps provider overlay transient');
const referenceMerged = retrieval.mergeBinderArtwork([row(referenceCard)], [row(nameOnly[0])])[0];
assert.equal(referenceMerged.card.name, 'Varoom');
assert.equal(referenceMerged.card.images.small, referenceUri);
assert.equal(Object.getOwnPropertyDescriptor(referenceMerged.card, 'images').enumerable, false);
assert.ok(!JSON.stringify(referenceMerged).includes(referenceUri), 'Name-only merge cannot persist a provider overlay');
assert.deepEqual(referenceMerged.card.raw_data.images, referenceCard.raw_data.images);
const binderSource = fs.readFileSync(path.join(root, 'lib/binders.ts'), 'utf8');
const binderTree = ts.createSourceFile('binders.ts', binderSource, ts.ScriptTarget.Latest, true);
const attacher = binderTree.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'attachBinderCatalogueArtwork');
assert.ok(attacher);
const binderModule = { exports: {} };
vm.runInNewContext(ts.transpileModule(attacher.getText(binderTree), { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText, { module: binderModule, exports: binderModule.exports, ...retrieval, ...optional,
  enrichSavedStackrCardArtwork: async () => nameOnly,
  enrichStackrCardArtworkFromFacts: async (remaining) => { assert.equal(remaining.length, 0); return []; },
  attachLiveTcgdexCardReferences: async (cards) => cards,
});
const throughBinder = await binderModule.exports.attachBinderCatalogueArtwork([{ ...before, catalogue_match_status: 'catalogue' }]);
assert.equal(throughBinder[0].card.name, 'Varoom', 'Binder orchestration retains name-only enrichment');
assert.equal(throughBinder[0].owned_quantity, 4);

const otherId = '00000000-0000-4000-8000-000000000001';
const mismatches = [
  (card) => { card.id = otherId; card.raw_data.stackr.cardId = otherId; },
  (card) => { card.raw_data.stackr.defaultVariantId = otherId; },
  (card) => { card.set.id = otherId; },
  (card) => { card.language = 'zh-tw'; },
  (card) => { card.raw_data.language = 'zh-tw'; },
  (card) => { card.localName = '別のカード'; card.raw_data.local_name = card.localName; },
  (card) => { card.raw_data.stackr.variants[0].canonicalId = 'different-printing'; },
  (card) => { card.raw_data.stackr.variants[0].finishCode = 'first_edition'; },
  (card) => { card.raw_data.stackr.variants[0].variantCode = 'first_edition'; },
  (card) => { card.raw_data.stackr.canonical = false; },
  (card) => { card.raw_data.stackr.variants = null; },
  (card) => { card.englishDisplayName = 'ブロロン'; card.raw_data.english_display_name = 'ブロロン'; },
  (card) => { card.englishDisplayName = 'Translation pending'; card.raw_data.english_display_name = 'Translation pending'; },
];
for (const mutate of mismatches) {
  const incoming = structuredClone(fresh[0]); mutate(incoming);
  const saved = savedCard();
  assert.equal(retrieval.mergeCanonicalCardDisplayName(saved, incoming), saved, 'Mismatched or unresolved alias stays unchanged');
}
for (const rawTitle of [true, false]) {
  const reviewed = savedCard();
  reviewed.englishDisplayName = 'Reviewed existing title';
  if (rawTitle) reviewed.raw_data.english_display_name = reviewed.englishDisplayName;
  assert.equal(retrieval.mergeCanonicalCardDisplayName(reviewed, fresh[0]), reviewed, 'Existing reviewed title is not overwritten');
}
const nonCanonical = savedCard(); nonCanonical.raw_data.stackr.canonical = false;
assert.equal(retrieval.mergeCanonicalCardDisplayName(nonCanonical, fresh[0]), nonCanonical);
const controller = new AbortController(); controller.abort();
await assert.rejects(adapter.enrichSavedStackrCardArtwork([savedCard()], controller.signal, client));
console.log('PASS actual public Varoom mapping, saved/name-only alias recovery, exact identity guards and private-field preservation');
