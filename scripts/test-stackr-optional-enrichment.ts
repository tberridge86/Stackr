import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { readOptionalCatalogueEnrichment } from '../lib/optionalCatalogueEnrichment';

const adapterSource = readFileSync(resolve(process.cwd(), 'lib/stackrDomainAdapter.ts'), 'utf8');
assert.match(adapterSource, /readOptionalCatalogueEnrichment\(\(enrichmentSignal\) => allPages<StackrCatalogueAsset>/);
assert.match(adapterSource, /client\.set\(setId, \{ signal: enrichmentSignal \}\)/);
assert.match(adapterSource, /fetchCanonicalStackrSets\(language, client, false, signal\)/);
assert.match(adapterSource, /const assets = await fetchCanonicalSetAssetRows\(client\)/);

async function main() {
  const fetchedCards = [{ cardId: 'ja-printing-001', nativeName: 'カイリュー', embeddedAssets: ['native-low.webp'] }];
  const [manifest, setMetadata] = await Promise.all([
    readOptionalCatalogueEnrichment(() => Promise.reject(new Error('manifest unavailable'))),
    readOptionalCatalogueEnrichment(() => Promise.reject(new Error('set unavailable'))),
  ]);
  assert.equal(manifest, null);
  assert.equal(setMetadata, null);
  assert.deepEqual(fetchedCards, [{ cardId: 'ja-printing-001', nativeName: 'カイリュー', embeddedAssets: ['native-low.webp'] }], 'fetched cards and embedded assets survive optional enrichment rejection');

  const [logo, symbol] = await Promise.all([
    readOptionalCatalogueEnrichment(() => Promise.resolve([{ assetType: 'set_logo', setId: 'ja-set' }])),
    readOptionalCatalogueEnrichment(() => Promise.reject(new Error('symbol shard unavailable'))),
  ]);
  assert.deepEqual(logo, [{ assetType: 'set_logo', setId: 'ja-set' }]);
  assert.equal(symbol, null, 'one failed asset shard does not discard a successful logo shard');

  let timedOutChild: AbortSignal | undefined;
  const timedOut = await readOptionalCatalogueEnrichment((signal) => {
    timedOutChild = signal;
    return new Promise<never>(() => undefined);
  }, undefined, 10);
  assert.equal(timedOut, null, 'a non-cooperative optional transport cannot block the caller');
  assert.equal(timedOutChild?.aborted, true, 'the local timeout cancels its child request');

  const success = await readOptionalCatalogueEnrichment(
    () => Promise.resolve([{ assetType: 'set_logo', setId: 'zh-tw-set' }]),
    undefined,
    10,
  );
  assert.deepEqual(success, [{ assetType: 'set_logo', setId: 'zh-tw-set' }]);

  const controller = new AbortController();
  const cancelled = new Error('parent cancelled catalogue read');
  const pending = readOptionalCatalogueEnrichment(
    () => new Promise<never>(() => undefined),
    controller.signal,
    100,
  );
  controller.abort(cancelled);
  await assert.rejects(
    pending,
    cancelled,
    'parent cancellation must remain terminal',
  );
  controller.abort(cancelled);
  await assert.rejects(
    readOptionalCatalogueEnrichment(() => Promise.resolve(['late logo']), controller.signal),
    cancelled,
    'a late success from a cancelled transport must not become active enrichment',
  );

  console.log('Optional catalogue enrichment preserves successful rows and propagates cancellation.');
}

void main();
