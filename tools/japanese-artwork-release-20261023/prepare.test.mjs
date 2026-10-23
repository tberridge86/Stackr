import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { assertSourceUrl, buildObjects, downloadOriginal, inspectOriginal, prepareRow, prepareCohort } from './prepare.mjs';
const require = createRequire(new URL('../../backend/package.json', import.meta.url));
const sharp = require('sharp');
const url = 'https://static.tcgcollector.com/content/images/aa/bb/cc/' + 'a'.repeat(64) + '.webp';
const original = await sharp({ create: { width: 120, height: 170, channels: 3, background: '#283950' } }).webp().toBuffer();
const generated = await buildObjects(original);
const objects = generated.map(({ buffer, ...object }) => object);
const row = { printing_id: '839d6cc3-0842-410b-b78b-804d4a4589a2', image_url: url, objects };
const fetchImage = async () => ({ ok: true, url, headers: new Headers({ 'content-type': 'image/webp', 'content-length': String(original.length) }), body: new Response(original).body });

test('preparation preserves original bytes and verifies deterministic derivatives without enlargement', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'stackr-japanese-prepare-'));
  try {
    const receipt = await prepareRow(row, root, { fetchImage });
    assert.equal(receipt.objects, 4);
    for (const object of objects) assert.ok(object.width <= 120 && object.height <= 170);
    assert.deepEqual(await readFile(path.join(root, objects[0].artifact_id, objects[0].file)), original);
    await assert.rejects(prepareRow({ ...row, objects: objects.map((object, index) => index === 1 ? { ...object, sha256: '0'.repeat(64) } : object) }, root, { fetchImage }), /Pinned derivative/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('download rejects source redirects, MIME drift and truncated or oversized original bytes', async () => {
  for (const changed of [
    { url: 'https://other.example/card.webp' },
    { headers: new Headers({ 'content-type': 'text/html' }) },
    { headers: new Headers({ 'content-type': 'image/webp', 'content-length': '1' }) },
    { body: new Response(original.subarray(0, 8)).body },
    { body: new Response(Buffer.concat([original, Buffer.from([0])])).body },
  ]) {
    await assert.rejects(downloadOriginal(row, async () => ({ ...await fetchImage(), ...changed })));
  }
  assert.deepEqual(await downloadOriginal(row, fetchImage), original);
  await assert.rejects(inspectOriginal(original, { ...objects[0], width: 121 }), /dimensions/);
  await assert.rejects(inspectOriginal(original, { ...objects[0], sha256: '0'.repeat(64) }), /hash/);
});

test('only literal static source host and image paths are accepted', () => {
  assert.equal(assertSourceUrl(url).href, url);
  for (const invalid of [url.replace('https:', 'http:'), url.replace('static.tcgcollector.com', 'evil.example'), url + '?size=large', url.replace('/content/images/', '/redirect/'), url.replace('https://', 'https://user@')]) assert.throws(() => assertSourceUrl(invalid), /Literal frozen/);
});

test('partial local source mapping fails before any unpaced network request', async () => {
  const rows = Array.from({ length: 71 }, (_, index) => ({ ...row, printing_id: String(index) }));
  let requests = 0;
  await assert.rejects(prepareCohort(rows, '/tmp/unused', { localFiles: new Map(), fetchImage: async () => { requests++; throw new Error('unexpected fetch'); } }), /Complete absolute local source paths/);
  assert.equal(requests, 0);
});
