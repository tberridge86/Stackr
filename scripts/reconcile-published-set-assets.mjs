import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DELIVERY_HOST = 'assets.stackrtcg.com';
const hashFromKey = (key) => String(key ?? '').match(/(?:^|\/)([a-f0-9]{64})\//)?.[1];

function recordedPublicUrl(value) {
  if (typeof value !== 'string' || value.trim() !== value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname === DELIVERY_HOST
      && !url.username && !url.password && !url.port ? value : null;
  } catch { return null; }
}

/** Reconcile captured, read-only manifest evidence. This module never contacts a service. */
export function reconcilePublishedSetAssets(snapshot, pages, collection, supersessions = []) {
  assert.ok(collection === 'logos' || collection === 'covers', 'Expected logos or covers');
  const assetType = collection === 'logos' ? 'set_logo' : 'sealed_product_image';
  assert.ok(Array.isArray(snapshot[collection]), 'Missing source identity registry');
  assert.ok(Array.isArray(pages) && pages.length, 'Missing captured manifest pages');
  const identities = new Set();
  const assets = [];
  const evidence = pages.map((page, index) => {
    assert.equal(page.sourceEnvironment, 'production', 'Capture must declare its production source environment');
    assert.ok(Array.isArray(page?.data?.assets), 'Missing captured API asset rows');
    assert.ok(typeof page.meta?.requestId === 'string' && page.meta.requestId, 'Missing capture request ID');
    assert.ok(typeof page.meta?.generatedAt === 'string' && Number.isFinite(Date.parse(page.meta.generatedAt)),
      'Missing capture timestamp');
    if (index === pages.length - 1) {
      assert.ok(!page.meta.pagination?.nextCursor, 'Last captured page still has a continuation');
    }
    assets.push(...page.data.assets);
    return { source: page.source ?? 'Production asset manifest response',
      ...(page.sourceRevision ? { sourceRevision: page.sourceRevision } : {}),
      ...(page.scope ? { scope: page.scope } : {}),
      requestId: page.meta.requestId, generatedAt: page.meta.generatedAt };
  });
  const unresolved = [];
  assert.ok(Array.isArray(supersessions), 'Supersession evidence must be an array');
  const replacements = new Map();
  for (const replacement of supersessions) {
    assert.ok(!replacements.has(replacement.setId), `Duplicate supersession identity: ${replacement.setId}`);
    assert.equal(replacement.assetType, assetType, 'Supersession asset type differs from the registry');
    assert.ok(snapshot[collection].some((row) => row.setId === replacement.setId), 'Supersession set is absent from the registry');
    assert.ok(evidence.some((capture) => capture.requestId === replacement.captureRequestId
      && capture.generatedAt === replacement.captureGeneratedAt), 'Supersession lacks its exact captured evidence');
    replacements.set(replacement.setId, replacement);
  }
  let superseded = 0;
  const mapped = snapshot[collection].map((row) => {
    assert.ok(typeof row.setId === 'string' && row.setId, 'Missing canonical set identity');
    assert.ok(!identities.has(row.setId), `Duplicate fallback set identity: ${row.setId}`);
    identities.add(row.setId);
    const expectedHash = hashFromKey(row.storageKey);
    assert.ok(expectedHash, `Missing original content hash for ${row.setId}`);
    const replacement = replacements.get(row.setId);
    if (replacement) assert.equal(replacement.previousContentSha256, expectedHash, 'Supersession previous hash mismatch');
    const currentHash = replacement?.contentSha256 ?? expectedHash;
    const identity = { ...row };
    for (const field of ['deliveryUrl', 'detailUrl', 'assetId', 'contentSha256', 'supersedesContentSha256']) delete identity[field];
    const matching = assets.filter((asset) => asset.setId === row.setId
      && asset.assetType === assetType && asset.permissionStatus === 'approved'
      && !asset.unavailableReason && asset.contentSha256 === currentHash
      && (!replacement || (asset.assetId === replacement.assetId && asset.deliveryUrl === replacement.deliveryUrl))
      && typeof asset.assetId === 'string' && asset.assetId && recordedPublicUrl(asset.deliveryUrl));
    const byAsset = new Map();
    for (const asset of matching) {
      const previous = byAsset.get(asset.assetId);
      assert.ok(!previous || JSON.stringify(previous) === JSON.stringify(asset),
        `Conflicting captured asset ${asset.assetId}`);
      byAsset.set(asset.assetId, asset);
    }
    // A migration can preserve several immutable rows. Do not choose between
    // different recorded URLs or change artwork merely because a set ID agrees.
    const urls = new Set([...byAsset.values()].map((asset) => asset.deliveryUrl));
    if (!byAsset.size || urls.size !== 1) {
      unresolved.push({ setId: row.setId, setCode: row.setCode, expectedHash,
        reason: byAsset.size ? 'ambiguous_published_delivery' : 'no_exact_published_match' });
      return identity;
    }
    const asset = [...byAsset.values()].sort((a, b) => a.assetId.localeCompare(b.assetId))[0];
    const detail = collection === 'logos' && Array.isArray(asset.derivatives)
      ? asset.derivatives.find((item) => item.role === 'detail-page' && recordedPublicUrl(item.deliveryUrl))
      : undefined;
    if (replacement && currentHash !== expectedHash) superseded++;
    return { ...identity, assetId: asset.assetId, contentSha256: asset.contentSha256,
      ...(replacement && currentHash !== expectedHash ? { supersedesContentSha256: expectedHash } : {}),
      deliveryUrl: asset.deliveryUrl, ...(detail ? { detailUrl: detail.deliveryUrl } : {}) };
  });
  return {
    snapshot: { ...snapshot, deliveryEnvironment: 'production',
      deliverySource: 'Production api.asset_manifest; exact recorded delivery URLs', deliveryEvidence: evidence,
      [collection]: mapped },
    report: { collection, total: mapped.length, matched: mapped.length - unresolved.length, superseded, unresolved },
  };
}

function run() {
  const args = process.argv.slice(2);
  assert.ok(args.length === 4 || args.length === 5,
    'Usage: node scripts/reconcile-published-set-assets.mjs <logos|covers> <registry.json> <capture.json> <output.json> [supersessions.json]');
  const [collection, registryPath, capturePath, outputPath, supersessionsPath] = args;
  const snapshot = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const captured = JSON.parse(fs.readFileSync(capturePath, 'utf8'));
  const pages = Array.isArray(captured) ? captured : [captured];
  const supersessions = supersessionsPath ? JSON.parse(fs.readFileSync(supersessionsPath, 'utf8')).supersessions : [];
  const result = reconcilePublishedSetAssets(snapshot, pages, collection, supersessions);
  fs.mkdirSync(path.dirname(path.resolve(outputPath)), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result.snapshot, null, 2) + '\n');
  console.log(JSON.stringify(result.report, null, 2));
  if (result.report.unresolved.length) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) run();
