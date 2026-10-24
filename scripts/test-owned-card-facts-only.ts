import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted } from '../lib/optionalCatalogueEnrichment';

// Exercise the production routing functions without importing native UI modules
// or making network requests. The catalogue transport/projection are fixtures.
const source = readFileSync('lib/stackrDomainAdapter.ts', 'utf8');
const tree = ts.createSourceFile('adapter.ts', source, ts.ScriptTarget.Latest, true);
const names = ['fetchStackrCard', 'fetchStackrCardRows', 'stackrLegacyCardToRow',
  'allPages', 'readOptionalAssetPages', 'fetchStackrAssetsForPrinting'];
const functions = tree.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text ?? ''));
assert.equal(functions.length, names.length);
const compiled = ts.transpileModule(functions.map((node) => node.getText(tree)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

type Asset = { deliveryUrl: string };
type Fact = { cardId: string; defaultVariantId: string; name: string; variants: { variantId: string }[]; embedded: Asset[] };
type Resolution = { card: Fact; variantId: string } | null;
type Controls = { includeAssets?: boolean; requireComplete?: boolean; signal?: AbortSignal; language?: string; onCanonicalRows?: (rows: Map<string, any>) => void };
function fact(reference: string): Fact {
  return { cardId: reference, defaultVariantId: `${reference}:normal`, name: `Name ${reference}`,
    variants: [{ variantId: `${reference}:normal` }, { variantId: `${reference}:reverse` }], embedded: [] };
}
function project(card: Fact, assets: Asset[]) {
  return { id: card.cardId, name: card.name, language: 'ja', number: '1', region: 'JP', externalIds: {},
    set: { id: 'fixture-set', name: 'Fixture Set' }, images: { small: assets[0]?.deliveryUrl ?? null, large: assets[0]?.deliveryUrl ?? null },
    raw_data: { selectedVariantId: card.defaultVariantId } };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function harness(options: {
  legacy?: boolean;
  resolve?: (reference: string) => Promise<Resolution>;
  assets?: () => Promise<Asset[]>;
  legacyCards?: Map<string, ReturnType<typeof project>>;
} = {}) {
  const reads: string[] = []; let assetReads = 0; let active = 0; let maxActive = 0;
  const observedSignals: (AbortSignal | undefined)[] = [];
  const exports: any = {};
  const client = { assetManifest: async (query: { limit: number; assetType: string }, init: { signal?: AbortSignal }) => {
    assert.equal(query.limit, 50, 'Display enrichment retains bounded requests.');
    assert.equal(query.assetType, 'card_image');
    assert.ok(init.signal && !init.signal.aborted);
    assetReads++;
    const assets = await (options.assets?.() ?? Promise.resolve([{ deliveryUrl: 'https://fixture.invalid/art.webp' }]));
    return { data: { assets }, meta: { pagination: { nextCursor: null } } };
  } };
  runInNewContext(compiled, { exports, Map, Set, Error,
    stackrApiClient: client, shouldUseStackrApi: () => !options.legacy,
    resolveCachedStackrCard: async (reference: string, controls: Controls) => {
      reads.push(reference); observedSignals.push(controls.signal); active++; maxActive = Math.max(maxActive, active);
      try {
        const card = fact(reference);
        return await (options.resolve?.(reference) ?? Promise.resolve({ card, variantId: card.defaultVariantId }));
      } finally { active--; }
    },
    copyPreferredSetArtworkReassignments: () => undefined,
    embeddedCardImageAssets: (card: Fact) => card.embedded,
    primaryCardImageAsset: (_card: Fact, assets: Asset[]) => assets[0] ?? null,
    stackrCardToLegacyCard: project,
    readOptionalCatalogueEnrichment, throwIfOptionalCatalogueReadAborted,
    legacyCardMap: async () => options.legacyCards ?? new Map(), legacySearchCards: async () => [],
  });
  return {
    rows: (ids: string[], controls: Controls = {}) => exports.fetchStackrCardRows(ids, controls) as Promise<Map<string, ReturnType<typeof exports.stackrLegacyCardToRow>>>,
    card: (id: string, controls: Controls = {}) => exports.fetchStackrCard(id, controls) as Promise<ReturnType<typeof project> | null>,
    reads, observedSignals, assetReads: () => assetReads, maxActive: () => maxActive,
  };
}
const groups: string[] = [];
async function test(name: string, check: () => Promise<void>) { await check(); groups.push(name); }
async function run() {
  await test('facts-only resolves every owned name with six concurrent facts and zero manifest requests', async () => {
    const f = harness(); const controller = new AbortController();
    const ids = Array.from({ length: 13 }, (_, index) => `card-${index}`);
    const rows = await f.rows(ids, { includeAssets: false, requireComplete: true, signal: controller.signal });
    assert.equal(rows.size, ids.length); assert.equal(f.reads.length, ids.length);
    assert.equal(f.maxActive(), 6); assert.equal(f.assetReads(), 0);
    assert.ok(f.observedSignals.every((signal) => signal === controller.signal));
    for (const id of ids) { assert.equal(rows.get(id)?.name, `Name ${id}`); assert.equal(rows.get(id)?.image_small, null); }
  });

  await test('facts-only preserves exact variant, translated name and embedded images without mutating cached facts', async () => {
    const cached = fact('printing'); cached.name = 'ピカチュウ'; cached.embedded = [{ deliveryUrl: 'https://fixture.invalid/embedded.avif' }];
    const f = harness({ resolve: async () => ({ card: cached, variantId: 'printing:reverse' }) });
    const rows = await f.rows(['printing:reverse'], { includeAssets: false, requireComplete: true });
    assert.equal(rows.get('printing:reverse')?.id, 'printing');
    assert.equal(rows.get('printing')?.raw_data.selectedVariantId, 'printing:reverse');
    assert.equal(rows.get('printing')?.name, 'ピカチュウ');
    assert.equal(rows.get('printing')?.image_small, cached.embedded[0].deliveryUrl);
    assert.equal(cached.defaultVariantId, 'printing:normal'); assert.equal(f.assetReads(), 0);
  });

  await test('display callers retain default artwork enrichment and embedded-art short circuit', async () => {
    const held = deferred<Asset[]>(); const f = harness({ assets: () => held.promise }); let settled = false;
    const pending = f.card('display').then((card) => { settled = true; return card; }); await tick();
    assert.equal(f.assetReads(), 1); assert.equal(settled, false);
    held.resolve([{ deliveryUrl: 'https://fixture.invalid/display.webp' }]);
    assert.equal((await pending)?.images.large, 'https://fixture.invalid/display.webp');
    const cached = fact('embedded'); cached.embedded = [{ deliveryUrl: 'https://fixture.invalid/embedded.webp' }];
    const embedded = harness({ resolve: async () => ({ card: cached, variantId: cached.defaultVariantId }) });
    assert.equal((await embedded.card('embedded'))?.images.small, cached.embedded[0].deliveryUrl);
    assert.equal(embedded.assetReads(), 0);
  });

  await test('required facts reject missing identity, invalid variant and original transport failure before later batches', async () => {
    const failure = new Error('required card facts failed');
    const missing: (() => Promise<Resolution>)[] = [async () => null,
      async () => ({ card: fact('missing'), variantId: 'unknown-variant' }), async () => { throw failure; }];
    for (const resolve of missing) {
      const f = harness({ resolve });
      await assert.rejects(f.rows(Array.from({ length: 13 }, (_, index) => `card-${index}`), {
        includeAssets: false, requireComplete: true,
      }), /completely resolved|required card facts failed/);
      assert.equal(f.reads.length, 6); assert.equal(f.assetReads(), 0);
    }
    const original = harness({ resolve: async () => { throw failure; } });
    await assert.rejects(original.rows(['one'], { includeAssets: false, requireComplete: true }), (error) => error === failure);
    const partial = harness({ resolve: async (id) => id === 'missing' ? null : { card: fact(id), variantId: `${id}:normal` } });
    assert.deepEqual([...(await partial.rows(['missing', 'present'], { includeAssets: false })).keys()], ['present']);
  });

  await test('cancelled cached facts never start later batches, manifests or stale callbacks', async () => {
    const request = new AbortController(); const held = deferred<void>(); let callbacks = 0;
    const f = harness({ resolve: async (id) => { await held.promise; return { card: fact(id), variantId: `${id}:normal` }; } });
    const pending = f.rows(Array.from({ length: 13 }, (_, index) => `card-${index}`), {
      includeAssets: false, requireComplete: true, signal: request.signal, onCanonicalRows: () => { callbacks++; },
    }); await tick(); assert.equal(f.reads.length, 6);
    const cancelled = new Error('ownership refresh cancelled');
    request.abort(cancelled); held.resolve(); await assert.rejects(pending, (error) => error === cancelled); await tick();
    assert.equal(f.reads.length, 6); assert.equal(f.assetReads(), 0); assert.equal(callbacks, 0);
    const early = harness(); await assert.rejects(early.rows(['one'], { signal: request.signal }), (error) => error === cancelled);
    assert.equal(early.reads.length, 0);
  });

  await test('display cancellation propagates through optional artwork instead of successful empty art', async () => {
    const request = new AbortController(); const held = deferred<Asset[]>(); const f = harness({ assets: () => held.promise });
    const pending = f.card('display', { signal: request.signal }); await tick();
    const cancelled = new Error('display request cancelled'); request.abort(cancelled);
    await assert.rejects(pending, (error) => error === cancelled); held.resolve([]); await tick();
    assert.equal(f.assetReads(), 1);
  });

  await test('legacy required projections reject incomplete maps while default partial callers remain compatible', async () => {
    const present = project(fact('present'), []);
    const f = harness({ legacy: true, legacyCards: new Map([['present', present]]) });
    await assert.rejects(f.rows(['missing', 'present'], { includeAssets: false, requireComplete: true }), /completely resolved/);
    assert.deepEqual([...(await f.rows(['missing', 'present'])).keys()], ['present']);
    assert.equal(f.assetReads(), 0);
  });

  console.log(JSON.stringify({ fixtureDataOnly: true, productionAdapterRouting: true, passedGroups: groups.length, groups,
    verified: { ownershipManifestRequests: 0, concurrentFacts: 6, completeOwnershipRequired: true, sharedCancellation: true } }, null, 2));
}
run().catch((error) => { console.error(error); process.exitCode = 1; });
