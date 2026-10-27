import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, symlink, stat, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRecoveryReceiptStore } from './r2-recovery-b-receipt-20261027.mjs';

const run = 'production-recovered-20261027b';
const acceptance = () => ({ schemaVersion: 1, kind: 'stackr-r2-linked-continuation', runId: run,
  parentEvidencePreserved: true, sourceObjectsDeleted: 0, certificate: { fixture: true } });

test('durable acceptance is exclusive, private, hash-identified, and preserves existing evidence', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'r2-receipt-'));
  try {
    const store = createRecoveryReceiptStore({ parent }); assert.equal(await store.successorExists(), false);
    const digest = await store.persistAcceptance(acceptance()); const filename = path.join(parent, run + '.acceptance.json');
    const bytes = await readFile(filename); assert.equal(digest, createHash('sha256').update(bytes).digest('hex'));
    assert.equal((await stat(filename)).mode & 0o777, 0o600);
    await assert.rejects(store.persistAcceptance(acceptance()), error => error.code === 'EEXIST');
    assert.deepEqual(await readFile(filename), bytes);
    await mkdir(path.join(parent, run)); assert.equal(await store.successorExists(), true);
  } finally { await rm(parent, { recursive: true, force: true }); }
});

test('parent links and oversized receipts fail without creating an acceptance file', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'r2-receipt-'));
  try {
    const target = path.join(root, 'real'); await mkdir(target); const link = path.join(root, 'link'); await symlink(target, link);
    await assert.rejects(createRecoveryReceiptStore({ parent: link }).persistAcceptance(acceptance()), error => error.code === 'recovery_receipt_parent_invalid');
    const store = createRecoveryReceiptStore({ parent: target });
    await assert.rejects(store.persistAcceptance({ ...acceptance(), extra: 'x'.repeat(65536) }), error => error.code === 'recovery_receipt_bound');
    await assert.rejects(readFile(path.join(target, run + '.acceptance.json')), error => error.code === 'ENOENT');
  } finally { await rm(root, { recursive: true, force: true }); }
});
