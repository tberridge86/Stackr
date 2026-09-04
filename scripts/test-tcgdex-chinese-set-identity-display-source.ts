import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { readTcgdexChineseSetIdentityDisplaySource } from './build-tcgdex-chinese-set-identity-display-source';

// The production default verifies the separately retained, hash-bound review
// evidence. This unit fixture verifies the frozen source's own fail-closed
// structure without depending on a parent worktree's untracked reports.
const current = readTcgdexChineseSetIdentityDisplaySource(undefined, false);
assert.equal(current.bodySha256, 'bef7c15704acca9b2e993398d3f36a9acc630619339dc83dc20284d7983bc629');
assert.deepEqual(Object.keys(current.entries), ['cbb1c', 'csv1c']);
assert.deepEqual(current.entries.csv1c, {
  effectiveCode: 'CSV1C',
  providerPath: 'data-asia/SV/CSV1C.ts',
  sourceSha256: 'b03f3e0bac65af408a7c8a9764569e8d844cb7c33446dfb9d5a6ff7294589211',
  declaredCode: 'CSV1C',
  nativeName: '亘古开来',
  normalizedNativeName: '亘古开来',
  officialCardCount: 127,
  releaseDate: '2025-01-17',
  resolution: 'exact_source_code',
});
assert.equal(current.entries.cbb1c.providerPath, 'data-asia/SV/CBB1C.ts');
assert.equal(current.entries.cbb1c.declaredCode, 'CSV1C');
assert.equal(current.entries.cbb1c.nativeName, '宝石包 第一卷');
assert.equal(current.entries.cbb1c.resolution, 'path_stem_rekey_of_reviewed_internal_id_typo');
assert.equal(current.frozen.policy.canonicalDatabaseWriteAuthorized, false);

const root = mkdtempSync(resolve(tmpdir(), 'stackr-chinese-set-identity-display-'));
try {
  const original = JSON.parse(readFileSync(current.sourcePath, 'utf8')) as Record<string, any>;
  for (const [label, mutate] of [
    ['commit', (value: Record<string, any>) => { value.source.pinnedCommit = '0'.repeat(40); }],
    ['policy', (value: Record<string, any>) => { value.policy.canonicalDatabaseWriteAuthorized = true; }],
    ['path', (value: Record<string, any>) => { value.entries.cbb1c.providerPath = 'data-asia/SV/CSV1C.ts'; }],
    ['internal id', (value: Record<string, any>) => { value.entries.cbb1c.declaredCode = 'CBB1C'; }],
    ['native name', (value: Record<string, any>) => { value.entries.cbb1c.nativeName = '宝石包 第二卷'; }],
    ['resolution evidence', (value: Record<string, any>) => { value.reviewedResolutionEvidence.evidenceId = 'unreviewed'; }],
  ] as const) {
    const tampered = structuredClone(original);
    mutate(tampered);
    const path = resolve(root, `${label.replace(/\s+/g, '-')}.json`);
    writeFileSync(path, `${JSON.stringify(tampered, null, 2)}\n`, 'utf8');
    assert.throws(() => readTcgdexChineseSetIdentityDisplaySource(path, false), `${label} tamper must fail closed`);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}

console.log('Pinned TCGdex Chinese set identity display source passed');
