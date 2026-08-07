import assert from 'node:assert/strict';
import {
  decodeStoragePack,
  encodeStoragePack,
  inventoryManifestSha256,
  selectRestoreSample,
} from './deploy/storage-recovery-pack.mjs';

const objects = [
  {
    bucket_id: 'public-assets',
    name: 'cards/a.webp',
    metadata: { mimetype: 'image/webp', size: 3 },
    user_metadata: null,
    bytes: Buffer.from('one'),
  },
  {
    bucket_id: 'public-assets',
    name: 'cards/b.jpg',
    metadata: { mimetype: 'image/jpeg', size: 8 },
    user_metadata: { source: 'test' },
    bytes: Buffer.from('two-two-'),
  },
  {
    bucket_id: 'private-scans',
    name: 'scan/one.jpg',
    metadata: { mimetype: 'image/jpeg', size: 5 },
    user_metadata: null,
    bytes: Buffer.from('three'),
  },
];

const packed = encodeStoragePack(objects);
const decoded = decodeStoragePack(packed);
assert.equal(decoded.length, objects.length);
assert.deepEqual(decoded.map((row) => row.bytes.toString('utf8')), ['one', 'two-two-', 'three']);
assert.equal(decoded[1].metadata.mimetype, 'image/jpeg');

const corrupt = Buffer.from(packed);
corrupt[corrupt.length - 1] ^= 1;
assert.throws(() => decodeStoragePack(corrupt), /checksum_mismatch/);

const buckets = [
  { id: 'public-assets', public: true },
  { id: 'private-scans', public: false },
];
const sample = selectRestoreSample(objects, buckets, 2);
assert.ok(sample.some((row) => row.bucket_id === 'public-assets'));
assert.ok(sample.some((row) => row.bucket_id === 'private-scans'));
assert.equal(
  inventoryManifestSha256(objects),
  inventoryManifestSha256([...objects].reverse()),
  'inventory manifests must not depend on query order',
);

console.log('Storage recovery pack tests passed.');
