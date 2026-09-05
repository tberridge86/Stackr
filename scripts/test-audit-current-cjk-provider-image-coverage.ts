import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { buildCurrentCjkProviderImageCoverageAudit } from './audit-current-cjk-provider-image-coverage';

const root = mkdtempSync(resolve(tmpdir(), 'cjk-provider-image-audit-'));
try {
  const canonicalLedgerPath = resolve(root, 'ledger.jsonl');
  const providerRowsPath = resolve(root, 'provider.jsonl');
  const providerRoot = resolve(root, 'cards'); mkdirSync(providerRoot);
  const jaCards = resolve(providerRoot, 'ja.json'); const twCards = resolve(providerRoot, 'zh-tw.json'); const cnCards = resolve(providerRoot, 'zh-cn.json');
  const ids = { ja: '00000000-0000-4000-8000-000000000001', tw: '00000000-0000-4000-8000-000000000002', cn: '00000000-0000-4000-8000-000000000003' };
  const setIds = { ja: '00000000-0000-4000-8000-000000000011', tw: '00000000-0000-4000-8000-000000000012', cn: '00000000-0000-4000-8000-000000000013' };
  const ledger = [
    ['ja', ids.ja, setIds.ja, '1'], ['zh-tw', ids.tw, setIds.tw, '2'], ['zh-cn', ids.cn, setIds.cn, '3'],
  ].map(([language, entityId, setId, collectorNumber]) => JSON.stringify({ entityType: 'variant_image_state', dimension: 'card_image_state', entityId, language, facts: { active: true, exactNativeCardImage: false, setId, collectorNumber, nativeImageStatus: 'missing' } })).join('\n') + '\n';
  const mappings = [
    { language: 'ja', canonical: { variantId: ids.ja, mappingLanguage: 'ja' }, providerId: 'JA-1', providerSetId: 'JA' },
    { language: 'zh-tw', canonical: { variantId: ids.tw, mappingLanguage: 'zh-tw' }, providerId: 'TW-1', providerSetId: 'TW' },
  ].map((row) => JSON.stringify({ entityType: 'provider_printing', status: 'matched_exact', ...row })).join('\n') + '\n';
  writeFileSync(canonicalLedgerPath, ledger); writeFileSync(providerRowsPath, mappings);
  writeFileSync(jaCards, JSON.stringify([{ id: 'JA-1', image: 'https://assets.tcgdex.net/ja/SV/SV1/001' }]));
  writeFileSync(twCards, JSON.stringify([{ id: 'TW-1' }])); writeFileSync(cnCards, '[]');
  const result = buildCurrentCjkProviderImageCoverageAudit({ canonicalLedgerPath, providerRowsPath, providerCardPaths: { ja: jaCards, 'zh-tw': twCards, 'zh-cn': cnCards } });

assert.equal(result.summary.local_only, true);
assert.equal(result.summary.network_accessed, false);
assert.equal(result.summary.image_bodies_downloaded, false);
assert.equal(result.summary.database_modified, false);
assert.equal(result.summary.storage_modified, false);
assert.equal(result.summary.live_availability_verified, false);
assert.equal(result.summary.missing_exact_native_image_count, 3);
assert.equal(result.summary.candidate_url_declared_in_pinned_provider_snapshot_count, 1);
assert.deepEqual(result.summary.by_language, {
  ja: { missing_exact_native_image: 1, candidate_url_declared_in_pinned_provider_snapshot: 1, no_exact_provider_mapping: 0, provider_row_has_no_image_url: 0 },
  'zh-cn': { missing_exact_native_image: 1, candidate_url_declared_in_pinned_provider_snapshot: 0, no_exact_provider_mapping: 1, provider_row_has_no_image_url: 0 },
  'zh-tw': { missing_exact_native_image: 1, candidate_url_declared_in_pinned_provider_snapshot: 0, no_exact_provider_mapping: 0, provider_row_has_no_image_url: 1 },
});
assert.equal(result.candidates.length, 3);
assert.equal(new Set(result.candidates.map((candidate) => candidate.canonical_variant_id)).size, result.candidates.length);
assert.ok(result.candidates.every((candidate) => candidate.live_availability_verified === false));
assert.ok(result.candidates.every((candidate) => !candidate.provider_image_url || /^https:\/\/assets\.tcgdex\.net\/(ja|zh-tw|zh-cn)\//.test(candidate.provider_image_url)));
assert.equal(
  createHash('sha256').update(ledger).digest('hex'),
  '185b3b16874d1c0f6b710a1aa42f061b8d549dc12295e6df71b0fc2c7df84365',
  'the audit fixture must remain hash-bound',
);

console.log('Current CJK provider image coverage audit tests passed.');
} finally {
  rmSync(root, { recursive: true, force: true });
}
