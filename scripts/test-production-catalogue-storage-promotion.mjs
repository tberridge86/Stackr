import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyRetainedProductionObjects } from './deploy/catalogue-storage-verification.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function objectFor(bytes, filename = 'card.webp') {
  const content = Buffer.from(bytes);
  const hash = sha256(content);
  return {
    name: `catalogue/${hash}/${filename}`,
    metadata: { size: content.length, mimetype: 'image/webp' },
    bytes: content,
  };
}

function downloadFrom(objects) {
  return async (name) => {
    const object = objects.get(name);
    if (!object) throw new Error(`unexpected_download:${name}`);
    return new Blob([object.bytes]);
  };
}

const copiedOnly = await verifyRetainedProductionObjects({
  sourceObjects: [],
  targetByName: new Map(),
  downloadTargetObject: downloadFrom(new Map()),
  concurrency: 2,
});
assert.deepEqual(copiedOnly, {
  retainedObjectCount: 0,
  retainedByteSize: 0,
  retainedContentHashVerifiedCount: 0,
});

const first = objectFor('first retained image');
const second = objectFor('second retained image');
const retainedTarget = new Map([[first.name, first], [second.name, second]]);
const retained = await verifyRetainedProductionObjects({
  sourceObjects: [first, second],
  targetByName: retainedTarget,
  downloadTargetObject: downloadFrom(retainedTarget),
  concurrency: 2,
});
assert.equal(retained.retainedObjectCount, 2);
assert.equal(retained.retainedContentHashVerifiedCount, 2);
assert.equal(retained.retainedByteSize, first.bytes.length + second.bytes.length);
// These three counts are written directly into promotion evidence; their
// reconciliation prevents a successful journal from hiding an unverified item.
assert.equal(retained.retainedObjectCount, retained.retainedContentHashVerifiedCount);

const corrupt = { ...first, bytes: Buffer.from('first retained imago') };
const corruptTarget = new Map([[first.name, corrupt]]);
await assert.rejects(
  verifyRetainedProductionObjects({
    sourceObjects: [first],
    targetByName: corruptTarget,
    downloadTargetObject: downloadFrom(corruptTarget),
    concurrency: 1,
  }),
  /retained_production_object_content_hash_mismatch/,
);

await assert.rejects(
  verifyRetainedProductionObjects({
    sourceObjects: [first],
    targetByName: new Map(),
    downloadTargetObject: downloadFrom(new Map()),
    concurrency: 1,
  }),
  /retained_production_object_missing/,
);

const short = { ...first, bytes: first.bytes.subarray(0, first.bytes.length - 1) };
const shortTarget = new Map([[first.name, short]]);
await assert.rejects(
  verifyRetainedProductionObjects({
    sourceObjects: [first],
    targetByName: shortTarget,
    downloadTargetObject: downloadFrom(shortTarget),
    concurrency: 1,
  }),
  /retained_production_object_size_mismatch/,
);

process.stdout.write('production catalogue storage promotion tests passed\n');
