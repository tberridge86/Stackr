import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditJapaneseSetLogoRuntimeCoverage } from './audit-japanese-set-logo-runtime-coverage';

const temporaryRoot = mkdtempSync(join(tmpdir(), 'stackr-ja-logo-audit-'));
const outputDir = join(temporaryRoot, 'report');
try {
  const evidencePath = join(temporaryRoot, 'canonical-catalogue-row-evidence.jsonl');
  writeFileSync(evidencePath, [
    { entityType: 'set_art_slot', dimension: 'set_logo', entityId: '00000000-0000-4000-8000-000000000001', language: 'ja', facts: { setCode: 'PMCG6' } },
    { entityType: 'set_art_slot', dimension: 'set_symbol', entityId: '00000000-0000-4000-8000-000000000002', language: 'ja', facts: { setCode: 'MG' } },
  ].map((row) => JSON.stringify(row)).join('\n') + '\n');
  const result = auditJapaneseSetLogoRuntimeCoverage({ evidencePath, outputDir, expectedTargetSetCount: 2 });
  assert.equal(result.target_set_count, 2);
  assert.equal(result.manifest_logo_count, 204);
  assert.equal(result.before.matched_current_sets, 1);
  assert.equal(result.after.matched_current_sets, 1);
  assert.deepEqual(result.proposed_exact_aliases, []);
  assert.deepEqual(result.resolution_counts, { exact_key: 1, exact_alias: 0, unique_manifest_code: 0, ambiguous_manifest_code: 1, no_manifest_bound_exact_identity: 0 });
  assert.equal(result.unused_manifest_logo_count, 203);
  assert.equal(existsSync(join(outputDir, 'manifest.json')), true);
  const rows = JSON.parse(readFileSync(join(outputDir, 'japanese-set-logo-runtime-coverage.json'), 'utf8'));
  assert.equal(rows.find((row: { set_code: string }) => row.set_code === 'MG')?.resolution, 'ambiguous_manifest_code');
  console.log('Japanese set-logo runtime coverage audit passed');
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
