import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fetchVerified, restoreMedia, validateManifest} from './restore-media.mjs';

const bytes = Buffer.from('a small pinned image fixture');
const entry = {path: 'src/assets/example.webp', sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, urls: ['https://media.example.test/exact.webp']};
const manifest = () => ({schemaVersion: 1, allowedHosts: ['media.example.test'], entries: [structuredClone(entry)]});
const fixture = async t => { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'stackr-media-test-')); t.after(() => fs.rm(root, {recursive: true, force: true})); return root; };

test('check reports missing media without creating it', async t => {
  const root = await fixture(t), result = await restoreMedia(manifest(), {root});
  assert.deepEqual(result.missing, [entry.path]);
  assert.deepEqual(await fs.readdir(root), []);
});

test('offline restoration copies and checks exact local bytes', async t => {
  const root = await fixture(t), from = await fixture(t);
  await fs.mkdir(path.join(from, 'src/assets'), {recursive: true}); await fs.writeFile(path.join(from, entry.path), bytes);
  const result = await restoreMedia(manifest(), {root, from, restore: true, offline: true});
  assert.equal(result.restored, 1); assert.deepEqual(result.failed, []);
  assert.deepEqual(await fs.readFile(path.join(root, entry.path)), bytes);
  assert.equal((await restoreMedia(manifest(), {root})).verified, 1);
});

test('corrupt existing media fails and is never overwritten', async t => {
  const root = await fixture(t), changed = Buffer.from('wrong');
  await fs.mkdir(path.join(root, 'src/assets'), {recursive: true}); await fs.writeFile(path.join(root, entry.path), changed);
  const result = await restoreMedia(manifest(), {root, restore: true, fetchImpl: () => assert.fail('must not download over existing bytes')});
  assert.equal(result.failed.length, 1); assert.deepEqual(await fs.readFile(path.join(root, entry.path)), changed);
});

test('download must match both byte count and SHA256', async t => {
  const root = await fixture(t);
  const result = await restoreMedia(manifest(), {root, restore: true, fetchImpl: async () => new Response(Buffer.alloc(bytes.length, 1))});
  assert.equal(result.failed.length, 1); assert.deepEqual(await fs.readdir(root), []);
});

test('matching download is created without leftovers', async t => {
  const root = await fixture(t);
  const result = await restoreMedia(manifest(), {root, restore: true, fetchImpl: async () => new Response(bytes)});
  assert.equal(result.restored, 1); assert.deepEqual(result.failed, []);
  assert.deepEqual(await fs.readdir(path.join(root, 'src/assets')), ['example.webp']);
});

test('rejects traversal, duplicate paths, credentials and unsafe origins', () => {
  for (const badPath of ['../outside.png', '/absolute.png', 'src/../outside.png', 'src\\outside.png']) {
    const value = manifest(); value.entries[0].path = badPath; assert.throws(() => validateManifest(value));
  }
  const duplicate = manifest(); duplicate.entries.push(duplicate.entries[0]); assert.throws(() => validateManifest(duplicate));
  for (const url of ['http://media.example.test/a', 'https://user:secret@media.example.test/a', 'https://127.0.0.1/a', 'https://media.example.test/a?token=private']) {
    const value = manifest(); value.entries[0].urls = [url]; assert.throws(() => validateManifest(value));
  }
});

test('rejects redirect to a host absent from the public allowlist', async () => {
  let calls = 0;
  await assert.rejects(fetchVerified(entry, validateManifest(manifest()), async () => { calls++; return new Response(null, {status: 302, headers: {Location: 'https://unapproved.example.test/a'}}); }));
  assert.equal(calls, 1);
});

test('rejects symlinked output directories', async t => {
  const root = await fixture(t), outside = await fixture(t);
  await fs.symlink(outside, path.join(root, 'src'), 'dir');
  const result = await restoreMedia(manifest(), {root, restore: true, fetchImpl: async () => new Response(bytes)});
  assert.equal(result.failed.length, 1); assert.deepEqual(await fs.readdir(outside), []);
});
