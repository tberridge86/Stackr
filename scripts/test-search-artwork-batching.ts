import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { resolveCardArtwork } from '../lib/cardArtworkPresentation';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';

const source = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
const tree = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
const names = ['clean', 'toLegacyLanguage', 'embeddedCardImageAssets', 'primaryCardImageAsset',
  'stackrCardToLegacyCard', 'allPages', 'fetchStackrAssetsForPrinting', 'searchStackrCards'];
const nodes = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
assert.equal(nodes.length, names.length, 'Exercise the actual adapter functions, including its artwork mapper');
const compiled = ts.transpileModule(nodes.map((node) => node.getText(tree)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setId = uuid(1000);
const fixture = (n: number, language = 'ja'): any => ({
  cardId: uuid(n), catalogueVersionId: uuid(1001), game: 'pokemon', languageCode: language,
  set: { setId, setCode: 'fixture', nativeName: 'Fixture set', englishDisplayName: 'Fixture set' },
  collectorNumber: { value: String(n) }, names: { native: `カード${n}`, englishDisplay: `Card ${n}` },
  defaultVariantId: uuid(2000 + n), variants: [{ variantId: uuid(2000 + n), canonicalId: `pokemon:${language}:${n}:normal`,
    variantCode: 'normal', finishCode: 'normal', artworkKey: null, imageVariantId: uuid(2000 + n), image: null }],
  rarity: { code: null, label: null }, details: {},
});
const image = (card: any, overrides: any = {}): any => ({
  assetId: uuid(4000 + Number(card.collectorNumber.value)), assetType: 'card_image', game: 'pokemon',
  setId: card.set.setId, cardId: card.cardId, variantId: card.defaultVariantId,
  deliveryUrl: `https://approved.invalid/${card.cardId}.webp`, permissionStatus: 'approved', unavailableReason: null,
  width: 600, height: 825, derivatives: [], ...overrides,
});
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; }); return { promise, resolve, reject }; }

function harness(cards: any[], read: (query: any, signal?: AbortSignal) => Promise<any>) {
  const exports: any = {}, calls: { query: any; signal?: AbortSignal }[] = [], events: string[] = [];
  let searchError: Error | null = null;
  const client = { search: async () => { if (searchError) throw searchError; events.push('facts'); return { data: { results: cards.map((card) => ({ type: 'card', card })) } }; },
    assetManifest: async (query: any, options: { signal?: AbortSignal } = {}) => { events.push('manifest'); calls.push({ query, signal: options.signal }); return read(query, options.signal); } };
  runInNewContext(compiled, { exports, console, Map, Set, WeakMap, JSON, String, Number, Array, Error,
    canonicalArtworkFacts: new WeakMap(), stackrApiClient: {}, shouldUseStackrApi: () => true,
    UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    toStackrApiLanguage: (language: string) => language ?? null, resolveCardArtwork,
    readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted,
    buildForeignCardPresentation: (input: any) => ({ name: input.name, setName: input.set.name,
      languageLabel: input.language, isForeign: input.language !== 'en', details: { supertype: null, subtypes: [] } }),
  });
  return { calls, events, client, failSearch: (error: Error) => { searchError = error; },
    search: (options: any = {}) => exports.searchStackrCards('Pikachu', options, client) as Promise<any[]> };
}
const page = (assets: any[], nextCursor: string | null = null) => ({ data: { assets }, meta: { pagination: { nextCursor } } });

async function main() {
  const hundred = Array.from({ length: 100 }, (_, index) => fixture(index + 1));
  const byId = new Map(hundred.map((card) => [card.cardId, card]));
  const full = harness(hundred, async (query) => page((query.printingIds ?? [query.printingId]).map((id: string) => image(byId.get(id)))));
  let early: any[] = [];
  const hydrated = await full.search({ limit: 100, onCanonicalResults: (rows: any[]) => { full.events.push('callback'); early = rows; } });
  assert.equal(full.calls.length, 1, `100 factual cards must use one identity-batch manifest, observed ${full.calls.length} calls`);
  assert.equal(full.calls[0].query.printingIds.length, 100); assert.equal(full.calls[0].query.printingId, undefined);
  assert.equal(full.calls[0].query.assetType, 'card_image'); assert.ok(full.calls[0].query.limit <= 250);
  assert.equal(early.length, 100); assert.equal(hydrated.length, 100); assert.ok(early.every((row) => !row.images.small));
  assert.ok(hydrated.every((row) => row.images.small)); assert.equal(full.events.indexOf('callback') < full.events.indexOf('manifest'), true);
  assert.deepEqual(hydrated.map((row) => row.id), early.map((row) => row.id));

  const four = hundred.slice(0, 4), pagination = harness(four, async (query) => query.cursor
    ? page(four.slice(2).map((card) => image(card))) : page(four.slice(0, 2).map((card) => image(card)), 'next-assets'));
  const paginated = await pagination.search(); assert.equal(pagination.calls.length, 2);
  assert.equal(pagination.calls[1].query.cursor, 'next-assets'); assert.ok(paginated.every((row) => row.images.small));
  assert.deepEqual(pagination.calls[0].query.printingIds, pagination.calls[1].query.printingIds);
  assert.equal(pagination.calls[0].signal, pagination.calls[1].signal);

  // A defensive over-limit server response must still respect the manifest's
  // 100-identity input contract and retain a completed batch if the next fails.
  const oversized = [...hundred, fixture(101)], separate = harness(oversized, async (query) => {
    assert.ok(query.printingIds.length <= 100);
    if (query.printingIds.includes(uuid(101))) throw new Error('Second batch unavailable');
    return page(query.printingIds.map((id: string) => image(byId.get(id))));
  });
  const separateRows = await separate.search({ limit: 100 }); assert.equal(separate.calls.length, 2);
  assert.equal(separateRows.length, 101); assert.equal(separateRows.filter((row) => row.images.small).length, 100);
  assert.equal(separate.calls[1].query.printingIds.length, 1);

  const partial = harness(four, async (query) => { if (query.cursor) throw new Error('Later image page unavailable');
    return page([image(four[0])], 'failed-later-page'); });
  const partialRows = await partial.search(); assert.equal(partialRows.length, 4);
  assert.ok(partialRows[0].images.small); assert.ok(partialRows.slice(1).every((row) => !row.images.small));
  assert.equal(partial.calls.length, 2, 'Failure never falls back to per-printing requests');
  const failed = harness(four, async () => { throw new Error('Optional image service offline'); });
  assert.equal((await failed.search()).length, 4); assert.equal(failed.calls.length, 1);
  failed.failSearch(new Error('Canonical search unavailable')); await assert.rejects(failed.search(), /Canonical search unavailable/);
  assert.equal(failed.calls.length, 1, 'Required search failure cannot become image-backed success');

  const late = deferred<any>(), timed = harness(four, async (query) => query.cursor ? late.promise : page([image(four[0])], 'slow-later-page'));
  const started = Date.now(), timedRows = await timed.search();
  assert.ok(Date.now() - started < 3000); assert.equal(timedRows.length, 4); assert.ok(timedRows[0].images.small);
  assert.ok(timedRows.slice(1).every((row) => !row.images.small)); assert.equal(timed.calls.length, 2);
  assert.equal(timed.calls[1].signal?.aborted, true, 'The existing optional deadline cancels image transport');
  const beforeLate = JSON.stringify(timedRows); late.resolve(page(four.slice(1).map((card) => image(card)))); await tick();
  assert.equal(JSON.stringify(timedRows), beforeLate, 'A transport ignoring cancellation cannot change returned results');
  assert.equal(timed.calls.length, 2);

  const cycling = harness(four, async () => page([image(four[0])], 'same-cursor'));
  assert.equal((await cycling.search()).length, 4); assert.equal(cycling.calls.length, 2, 'A repeated cursor stops optional work without retrying');

  const concurrentA = deferred<any>(), concurrentB = deferred<any>();
  const isolatedA = harness([four[0]], async () => concurrentA.promise), isolatedB = harness([four[1]], async () => concurrentB.promise);
  const resultA = isolatedA.search(), resultB = isolatedB.search(); await tick();
  concurrentB.resolve(page([image(four[1])])); concurrentA.resolve(page([image(four[0])]));
  assert.equal((await resultA)[0].images.small, image(four[0]).deliveryUrl);
  assert.equal((await resultB)[0].images.small, image(four[1]).deliveryUrl);

  const exact = fixture(201), wrongPrinting = fixture(202, 'en'), special = fixture(203);
  special.variants.push({ ...special.variants[0], variantId: uuid(9991), variantCode: 'first_edition', finishCode: 'first_edition' });
  special.variants[0].sameArtworkAsVariantId = uuid(9991); special.variants[0].imageVariantId = uuid(9991); special.variants[0].nativeImageStatus = 'same_artwork_reference';
  const mixed = harness([exact, special], async () => page([image(wrongPrinting), image(exact, { setId: uuid(9992) }),
    image(special, { variantId: uuid(9991) })]));
  const refused = await mixed.search(); assert.ok(refused.every((row) => !row.images.small));
  assert.ok(refused.every((row) => row.raw_data.presentation.artwork.kind === 'missing'));

  const embedded = fixture(301); embedded.variants[0].image = image(embedded);
  const already = harness([embedded], async () => assert.fail('Usable embedded artwork needs no manifest'));
  assert.ok((await already.search())[0].images.small); assert.equal(already.calls.length, 0);
  console.log('Search artwork batches100 identities, preserves facts and partial pages, bounds late work, and retains exact printing/edition rejection.');
}
void main().catch((error) => { console.error(error); process.exitCode = 1; });
