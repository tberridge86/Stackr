import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { snapshotBinderView, isCompleteBinderSnapshot } from '../lib/binderReopenSnapshot';
import { createSetFactsReader, loadCompleteSetPages } from '../lib/stackrSetRetrieval';
import { readPreferredSetArtwork } from '../lib/stackrPreferredSetArtwork';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setId = uuid(10); const version = uuid(11);
const source = process.env.SAVED_ARTWORK_BASELINE === '1'
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
const adapter = functions(source, ['fetchCanonicalSetCardFacts', 'enrichStackrCardArtworkFromFacts']);
const attacher = functions(readFileSync('lib/binders.ts', 'utf8'), ['attachBinderCatalogueArtwork']);
const facts = [1, 2].map((n) => ({ cardId: uuid(n), catalogueVersionId: version, game: 'pokemon', languageCode: 'ja',
  set: { setId, setCode: 'M6', nativeName: 'Fixture', englishDisplayName: null }, collectorNumber: { value: String(n) },
  names: { native: `カード${n}`, englishDisplay: null }, rarity: { code: null, label: null }, details: {},
  defaultVariantId: uuid(20 + n), variants: [{ variantId: uuid(20 + n), canonicalId: `ja:fixture:${n}:normal`,
    variantCode: 'normal', finishCode: 'normal', imageVariantId: uuid(20 + n), image: null }],
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

function harness(population = facts) {
  let factReads = 0; let imageReads = 0;
  const exports: any = {};
  const reader = createSetFactsReader({ store: async () => null });
  const client = { catalogueCacheNamespace: 'saved-art-fixture',
    set: async () => ({ data: { set: { setId, languageCode: 'ja', total: population.length } } }),
    setCards: async (_set: string, query: any) => {
      assert.equal(_set, setId); assert.equal(query.language, 'ja');
      if (query.includeAssets) imageReads++; else factReads++;
      const offset = Number(query.cursor ?? 0);
      const page = population.slice(offset, offset + query.limit);
      return { data: { cards: query.includeAssets ? page.map((fact) => ({ ...fact, variants: fact.variants.map((variant) => ({ ...variant,
        image: { assetType: 'card_image', assetId: uuid(300), deliveryUrl: `https://approved.invalid/${fact.cardId}.webp` } })) })) : page },
      meta: { pagination: { nextCursor: offset + page.length < population.length ? String(offset + page.length) : null } } };
    } };
  const mapCard = (fact: any) => ({ id: fact.cardId, language: 'ja',
    images: { small: fact.variants[0].image?.deliveryUrl ?? null, large: fact.variants[0].image?.deliveryUrl ?? null },
    raw_data: { stackr: { cardId: fact.cardId, defaultVariantId: fact.defaultVariantId } } });
  const context: any = { exports, Map, Set, WeakMap, JSON, Error, String, Number, Array,
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    canonicalArtworkFacts: new WeakMap(), stackrApiClient: client,
    toStackrApiLanguage: (language: string) => ['ja', 'en', 'zh-Hans', 'zh-Hant', 'ko'].includes(language) ? language : null,
    getPokemonSetLanguageFromPrefixedId: () => null,
    correctedChineseSetContext: (reference: string, language: string) => ({ reference, language }),
    resolveCanonicalStackrSetId: async (reference: string) => reference,
    setFactsReader: () => reader, loadCompleteSetPages, normalizeCanonicalSetCards: (cards: any) => cards,
    readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted, readPreferredSetArtwork,
    stackrCardToLegacyCard: mapCard,
    enrichCanonicalSetCards: async ({ cards }: any) => cards.map(mapCard),
    hasTcgdexRuntimeImageOverlay: () => false, attachLiveTcgdexCardReferences: async (cards: any) => cards,
  };
  runInNewContext(adapter, context);
  context.enrichStackrCardArtworkFromFacts = exports.enrichStackrCardArtworkFromFacts;
  runInNewContext(attacher, context);
  return { attach: exports.attachBinderCatalogueArtwork, factReads: () => factReads, imageReads: () => imageReads };
}

async function main() {
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
  assert.equal(late.imageReads(), 3); assert.equal(lateResult.length, 1, 'Only identity-matched saved rows are returned.');
  console.log('Serialized saved binder artwork recovers through actual facts/enrichment/attacher; exact identity, quantities, private fields and cancellation preserved.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
