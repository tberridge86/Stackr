import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { reconcilePublishedSetAssets } from './scripts/reconcile-published-set-assets.mjs';

// Local-only reproduction helper. Input must be actual post-publication API captures.
const root = path.dirname(fileURLToPath(import.meta.url));
assert.ok(process.argv.length > 2, 'Supply captured production manifest page paths');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const pages = process.argv.slice(2).flatMap((file) => {
  const value = read(file);
  return Array.isArray(value) ? value : [value];
});
const baseline = read(path.join(root, 'baseline/lib/generated/publishedSetLogos.generated.json'));
const history = read(path.join(root, 'baseline/lib/generated/publishedSetAssetSupersessions.generated.json'));
const manifest = read(path.join(root, '../publication/object-manifest.json'));
const verification = read(path.join(root, '../actual-verified-objects.json'));
assert.equal(createHash('sha256').update(JSON.stringify(manifest)).digest('hex'),
  '6a2f7b809ba62214998b05bf47d078e02fa6d96593f1c769ea2017bffdd97598');
const ids = new Set(manifest.assets.map((item) => item.target.setId));
assert.equal(ids.size, 2);
const previousRows = baseline.logos.filter((row) => ids.has(row.setId));
assert.equal(previousRows.length, 2);
assert.ok(!history.supersessions.some((row) => ids.has(row.setId)), 'Expected untouched two-row history baseline');
const receipts = previousRows.map((row) => {
  const planned = manifest.assets.find((item) => item.target.setId === row.setId).asset;
  const candidates = pages.flatMap((page) => (page.data?.assets ?? []).filter((asset) => asset.setId === row.setId)
    .map((asset) => ({ page, asset })));
  assert.equal(candidates.length, 1, 'Expected one exact post-publication API row per set');
  const { page, asset } = candidates[0];
  assert.equal(page.sourceEnvironment, 'production');
  assert.equal(asset.assetId, planned.asset_id);
  assert.equal(asset.contentSha256, planned.content_sha256);
  assert.equal(asset.assetType, 'set_logo');
  assert.equal(asset.permissionStatus, 'approved');
  assert.ok(!asset.unavailableReason);
  const original = verification.objects.find((object) => object.key === planned.storage_key);
  const detail = planned.derivative_list.find((object) => object.role === 'detail-page');
  const verifiedDetail = verification.objects.find((object) => object.key === detail.storageKey);
  assert.equal(original.status, 200);
  assert.equal(verifiedDetail.status, 200);
  assert.equal(asset.deliveryUrl, original.deliveryUrl);
  assert.equal(asset.derivatives.find((object) => object.role === 'detail-page')?.deliveryUrl, verifiedDetail.deliveryUrl);
  return { setId: row.setId, assetType: 'set_logo', language: row.language, setCode: row.setCode,
    previousContentSha256: row.contentSha256, previousAssetId: row.assetId,
    previousDeliveryUrl: row.deliveryUrl, previousDetailUrl: row.detailUrl,
    assetId: asset.assetId, contentSha256: asset.contentSha256,
    deliveryUrl: asset.deliveryUrl, captureRequestId: page.meta.requestId, captureGeneratedAt: page.meta.generatedAt,
    captureSource: page.source ?? 'Actual production public asset manifest response' };
});
const reconciled = reconcilePublishedSetAssets({ ...baseline, logos: previousRows }, pages, 'logos', receipts);
assert.equal(reconciled.report.matched, 2);
assert.equal(reconciled.report.superseded, 2);
assert.deepEqual(reconciled.report.unresolved, []);
const updatedRows = new Map(reconciled.snapshot.logos.map((row) => [row.setId, row]));
const registry = { ...baseline, deliveryEvidence: [...baseline.deliveryEvidence, ...reconciled.snapshot.deliveryEvidence],
  logos: baseline.logos.map((row) => updatedRows.get(row.setId) ?? row) };
assert.deepEqual(registry.logos.filter((row) => !ids.has(row.setId)), baseline.logos.filter((row) => !ids.has(row.setId)));
const supersessions = { ...history,
  source: 'Production asset manifest evidence: initial read-only database capture normalized by unchanged main backend, plus exact post-publication public API captures identified per supersession',
  scope: 'Published approved fallback identities reconciled to recorded replacements. Previous storage pointers remain in the logo registry; this reconciliation changes no catalogue rows or permissions.',
  supersessions: [...history.supersessions, ...receipts] };
for (const [file, value] of [['lib/generated/publishedSetLogos.generated.json', registry],
  ['lib/generated/publishedSetAssetSupersessions.generated.json', supersessions]]) {
  fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');
}
console.log(JSON.stringify({ logos: registry.logos.length, changed: receipts.length,
  unchanged: registry.logos.length - receipts.length, supersessions: supersessions.supersessions.length,
  detailRenditions: registry.logos.filter((row) => row.detailUrl).length,
  originalOnly: registry.logos.filter((row) => !row.detailUrl).length,
  captures: receipts.map((row) => ({ requestId: row.captureRequestId, generatedAt: row.captureGeneratedAt })) }));
