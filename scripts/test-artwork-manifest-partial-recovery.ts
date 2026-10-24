import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { resolveCardArtwork } from '../lib/cardArtworkPresentation';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';
import { copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments } from '../lib/stackrPreferredSetArtwork';

// Exercise the actual adapter and artwork mapper. Only the optional timer is
// shortened; canonical identity and approved-asset selection remain real.
const source = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
const tree = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
const names = ['clean', 'toLegacyLanguage', 'embeddedCardImageAssets', 'primaryCardImageAsset',
  'stackrCardToLegacyCard', 'allPages', 'readOptionalAssetPages', 'fetchStackrAssetsForPrinting', 'enrichCanonicalSetCards'];
const nodes = tree.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
assert.equal(nodes.length, names.length);
const compiled = ts.transpileModule(`${nodes.map(node => node.getText(tree)).join('\n')}
export { allPages, fetchStackrAssetsForPrinting, enrichCanonicalSetCards };`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const setId = uuid(1000);
const cards = [1, 2, 3].map((n): any => ({
  cardId: uuid(n), catalogueVersionId: uuid(1001), game: 'pokemon', languageCode: 'ja',
  set: { setId, setCode: 'fixture', nativeName: 'Fixture', englishDisplayName: 'Fixture' },
  collectorNumber: { value: String(n) }, names: { native: `Card ${n}`, englishDisplay: `Card ${n}` },
  defaultVariantId: uuid(2000 + n), rarity: {}, details: {},
  variants: [{ variantId: uuid(2000 + n), canonicalId: `pokemon:ja:${n}:normal`, variantCode: 'normal',
    finishCode: 'normal', artworkKey: null, imageVariantId: uuid(2000 + n), image: null }],
}));
const image = (card: any, overrides: any = {}): any => ({
  assetId: uuid(4000 + Number(card.collectorNumber.value)), assetType: 'card_image', game: 'pokemon',
  setId, cardId: card.cardId, variantId: card.defaultVariantId,
  deliveryUrl: `https://approved.invalid/${card.cardId}.webp`, permissionStatus: 'approved',
  unavailableReason: null, width: 1000, height: 1400, derivatives: [], ...overrides,
});
const page = (assets: any[], nextCursor: string | null = null) => ({ data: { assets }, meta: { pagination: { nextCursor } } });
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function harness(read: (query: any, signal?: AbortSignal) => Promise<any>) {
  const exports: any = {}, calls: { query: any; signal?: AbortSignal }[] = [];
  const client = {
    assetManifest: async (query: any, options: { signal?: AbortSignal } = {}) => {
      calls.push({ query, signal: options.signal }); return read(query, options.signal);
    },
    set: async () => ({ data: { set: { printedTotal: 3, total: 3, releaseDate: '2026-01-01' } } }),
  };
  runInNewContext(compiled, {
    exports, Map, Set, WeakMap, JSON, String, Number, Array, Error,
    canonicalArtworkFacts: new WeakMap(), resolveCardArtwork,
    readOptionalCatalogueEnrichment: <T>(work: (signal?: AbortSignal) => Promise<T>, signal?: AbortSignal) =>
      readOptionalCatalogueEnrichment(work, signal, 40),
    throwIfOptionalCatalogueReadAborted, copyPreferredSetArtworkReassignments, getPreferredSetArtworkReassignments,
    buildForeignCardPresentation: (input: any) => ({ name: input.name, setName: input.set.name,
      languageLabel: input.language, isForeign: true, details: { supertype: null, subtypes: [] } }),
  });
  return { calls, client,
    set: (signal?: AbortSignal) => exports.enrichCanonicalSetCards({ setId, cards }, client, signal) as Promise<any[]>,
    printing: (signal?: AbortSignal) => exports.fetchStackrAssetsForPrinting(client, cards[0].cardId, signal) as Promise<any[]>,
    allPages: exports.allPages as (load: (cursor: string | null, signal?: AbortSignal) => Promise<any>, signal?: AbortSignal) => Promise<any[]>,
  };
}

async function main() {
  const failedPage = harness(async query => {
    if (query.cursor) throw new Error('Second asset page unavailable');
    return page([image(cards[0]), image(cards[1], { cardId: uuid(9000) })], 'next');
  });
  const recovered = await failedPage.set();
  assert.equal(recovered.length, cards.length, 'asset failure never removes canonical card facts');
  assert.equal(recovered[0].images.small, image(cards[0]).deliveryUrl);
  assert.ok(recovered.slice(1).every(card => !card.images.small), 'retained pages still reject mismatched printing identities');
  assert.equal(failedPage.calls.length, 2);
  assert.equal(recovered[0].raw_data.set.total, 3, 'independent successful set metadata survives');
  const detail = await failedPage.printing();
  assert.equal(detail[0].deliveryUrl, image(cards[0]).deliveryUrl, 'single-printing recovery also keeps completed pages');
  assert.equal(failedPage.calls[2].query.printingId, cards[0].cardId);
  assert.equal(failedPage.calls[2].query.assetType, 'card_image');

  const pending = deferred<any>();
  const timed = harness(async query => query.cursor ? pending.promise : page([image(cards[0])], 'slow'));
  const timedRows = await timed.set();
  assert.equal(timedRows[0].images.small, image(cards[0]).deliveryUrl);
  assert.equal(timed.calls.length, 2); assert.equal(timed.calls[1].signal?.aborted, true);
  const saved = JSON.stringify(timedRows);
  pending.resolve(page([image(cards[1])], 'must-not-follow')); await tick();
  assert.equal(JSON.stringify(timedRows), saved, 'late transport success cannot mutate already-returned artwork');
  assert.equal(timed.calls.length, 2, 'late transport success cannot dispatch another page');

  const cycling = harness(async query => page([image(query.cursor ? cards[1] : cards[0])], 'repeated'));
  const cycled = await cycling.set();
  assert.equal(cycling.calls.length, 2); assert.ok(cycled[0].images.small);
  assert.equal(cycled[1].images.small, undefined, 'a repeated-cursor page is discarded before publication');

  const controller = new AbortController(), late = deferred<any>();
  const cancelled = harness(async query => query.cursor ? late.promise : page([image(cards[0])], 'next'));
  const abortedRead = cancelled.set(controller.signal); await tick();
  controller.abort(new Error('Owner left set'));
  await assert.rejects(abortedRead, /Owner left set/, 'parent cancellation never becomes partial success');
  late.resolve(page([image(cards[1])], 'more')); await tick();
  assert.equal(cancelled.calls.length, 2); assert.equal(cancelled.calls[1].signal?.aborted, true);
  await assert.rejects(cancelled.printing(controller.signal), /Owner left set/);
  assert.equal(cancelled.calls.length, 2, 'already-cancelled parents dispatch no manifest');

  const afterLoad = new AbortController();
  const ignored = harness(async () => { afterLoad.abort(new Error('Cancelled while awaiting page')); return page([image(cards[0])]); });
  await assert.rejects(ignored.set(afterLoad.signal), /Cancelled while awaiting page/);

  let requests = 0;
  await assert.rejects(failedPage.allPages(async () => ({ rows: [], nextCursor: `page-${++requests}` })), /page budget/);
  assert.equal(requests, 640, 'continuously advancing empty cursors remain bounded after adopting 50-row requests');
  requests = 0;
  await assert.rejects(failedPage.allPages(async () => ({ rows: new Array(++requests === 1 ? 32_000 : 1).fill(null), nextCursor: `next-${requests}` })), /row budget/);
  assert.equal(requests, 2, 'required page reads fail closed rather than returning truncated facts');

  const unavailable = harness(async () => { throw new Error('Manifest offline'); });
  assert.ok((await unavailable.set()).every(card => !card.images.small));
  console.log('Actual set/detail artwork retains completed manifest pages, rejects stale/foreign assets, bounds pagination and keeps parent cancellation terminal.');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
