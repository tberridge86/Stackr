import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const sql = readFileSync(resolve(process.cwd(), 'docs/sql/asset-manifest-card-image-equivalence-fixture.sql'), 'utf8');
const requestedVariants = new Set(['variant-cva']);
const requestedPrintings = new Set(['printing-cva', 'printing-derived-cva', 'printing-derived-asset', 'printing-asset']);
const variants = new Map([['variant-cva', 'printing-other'], ['variant-derived-cva', 'printing-derived-cva'], ['variant-derived-asset', 'printing-derived-asset'], ['variant-unrequested', 'printing-other']]);
const versions = new Map([['ja-v1', [true, false]], ['zh-tw-v2', [true, false]], ['draft-v', [false, false]], ['old-v', [true, true]]]);
const assets = new Map([
  ['a-cva-variant', asset('variant-unrequested')], ['a-cva-printing', asset(null, 'printing-other')], ['a-derived-cva', asset('variant-unrequested')], ['a-derived-asset', asset('variant-derived-asset')], ['a-dedupe', asset('variant-derived-asset')], ['a-asset-printing', asset(null, 'printing-asset')], ['a-cross', asset('variant-derived-asset')], ['a-coalesce-extra', asset('variant-derived-asset')],
  ['a-visibility', asset('variant-derived-asset', null, { visibility: 'private' })], ['a-public', asset('variant-derived-asset', null, { publiclyServable: false })], ['a-permission', asset('variant-derived-asset', null, { permission: 'review' })], ['a-rights', asset('variant-derived-asset', null, { rights: 'review' })], ['a-retention', asset('variant-derived-asset', null, { retention: 'expired' })], ['a-deleted', asset('variant-derived-asset', null, { deleted: true })], ['a-unavailable', asset('variant-derived-asset', null, { storageProvider: 'unavailable' })], ['a-logo', asset('variant-derived-asset', null, { type: 'set_logo' })],
]);
const cvas = [
  cva('ja-v1', 'a-cva-variant', 'variant-cva'), cva('ja-v1', 'a-cva-printing', null, 'printing-cva'), cva('ja-v1', 'a-derived-cva', 'variant-derived-cva'), cva('ja-v1', 'a-derived-asset'), cva('ja-v1', 'a-dedupe', 'variant-derived-cva'), cva('ja-v1', 'a-asset-printing'), cva('ja-v1', 'a-cross'), cva('zh-tw-v2', 'a-cross'), cva('ja-v1', 'a-coalesce-extra', 'variant-unrequested'),
  ...['a-visibility', 'a-public', 'a-permission', 'a-rights', 'a-retention', 'a-deleted', 'a-unavailable', 'a-logo'].map((assetId) => cva('ja-v1', assetId)), cva('draft-v', 'a-cross'), cva('old-v', 'a-cross'),
];
function asset(variantId, printingId = null, overrides = {}) { return { type: 'card_image', variantId, printingId, visibility: 'public_catalogue', publiclyServable: true, permission: 'approved', rights: 'approved', retention: 'active', deleted: false, storageProvider: 'provider', ...overrides }; }
function cva(versionId, assetId, variantId = null, printingId = null) { return { versionId, assetId, variantId, printingId }; }
function key(row) { return `${row.versionId}/${row.assetId}`; }
function targetVariants(includeInherited = true) {
  const inherited = includeInherited
    ? [...variants].filter(([, printingId]) => requestedPrintings.has(printingId)).map(([variantId]) => variantId)
    : [];
  return new Set([...requestedVariants, ...inherited]);
}
function manifestRows() { return cvas.flatMap((c) => { const [published, deprecated] = versions.get(c.versionId) ?? []; const a = assets.get(c.assetId); if (!published || deprecated || !a || a.type !== 'card_image' || a.visibility !== 'public_catalogue' || !a.publiclyServable || a.permission !== 'approved' || a.rights !== 'approved' || a.retention !== 'active' || a.deleted || a.storageProvider === 'unavailable') return []; const variantId = c.variantId ?? a.variantId; return [{ ...c, variantId, printingId: c.printingId ?? a.printingId ?? variants.get(variantId) ?? null }]; }); }
function currentMembers() { return manifestRows().filter((row) => requestedVariants.has(row.variantId) || requestedPrintings.has(row.printingId)); }
function candidateHitKeys(
  enabled = { cvaVariant: true, cvaPrinting: true, assetVariant: true, assetPrinting: true },
  includeInherited = true,
) {
  const targets = targetVariants(includeInherited);
  const hits = [];
  for (const c of cvas) {
    const a = assets.get(c.assetId);
    if (!a) continue;
    if (enabled.cvaVariant && targets.has(c.variantId)) hits.push(key(c));
    if (enabled.cvaPrinting && requestedPrintings.has(c.printingId)) hits.push(key(c));
    if (enabled.assetVariant && targets.has(a.variantId)) hits.push(key(c));
    if (enabled.assetPrinting && requestedPrintings.has(a.printingId)) hits.push(key(c));
  }
  return hits;
}
function candidateKeys(enabled, includeInherited) {
  return new Set(candidateHitKeys(enabled, includeInherited));
}
function candidateMembers(enabled, includeInherited) {
  const candidates = candidateKeys(enabled, includeInherited);
  return currentMembers().filter((row) => candidates.has(key(row)));
}
function keys(rows) { return rows.map(key).sort(); }

assert.doesNotMatch(sql, /\b(from|join)\s+(catalog|api)\./i, 'fixture must not query real schemas');
assert.match(sql, /versions\(version_id, published, deprecated\) as \(\s*values/i); assert.match(sql, /assets\(asset_id, asset_type/i); assert.match(sql, /cva\(catalogue_version_id, asset_id/i); assert.match(sql, /variants\(variant_id, printing_id\)/i);
assert.match(sql, /target_variants as materialized/); assert.match(sql, /candidate_rows as materialized/); assert.match(sql, /select unnest\(p\.p_variant_ids\)/); assert.match(sql, /av\.printing_id = any\(p\.p_printing_ids\)/); assert.match(sql, /c\.variant_id/); assert.match(sql, /c\.printing_id/); assert.match(sql, /a\.variant_id/); assert.match(sql, /a\.printing_id/); assert.match(sql, /cross join lateral/); assert.match(sql, /offset 0/); assert.match(sql, /not exists\(select 1 from differences\) as passed/); assert.match(sql, /external_url.*attribution.*mime_type/s);
const expected = ['ja-v1/a-asset-printing', 'ja-v1/a-cross', 'ja-v1/a-cva-printing', 'ja-v1/a-cva-variant', 'ja-v1/a-dedupe', 'ja-v1/a-derived-asset', 'ja-v1/a-derived-cva', 'zh-tw-v2/a-cross'];
assert.deepEqual(keys(currentMembers()), expected); assert.deepEqual(keys(candidateMembers()), expected);
assert.ok(!keys(currentMembers()).includes('ja-v1/a-coalesce-extra'), 'CVA identity overrides a matching asset identity');
for (const [branch, lost] of Object.entries({ cvaVariant: 'ja-v1/a-derived-cva', cvaPrinting: 'ja-v1/a-cva-printing', assetVariant: 'ja-v1/a-derived-asset', assetPrinting: 'ja-v1/a-asset-printing' })) { const enabled = { cvaVariant: true, cvaPrinting: true, assetVariant: true, assetPrinting: true, [branch]: false }; assert.ok(!keys(candidateMembers(enabled)).includes(lost), `removing ${branch} must lose its protected member`); }
assert.ok(candidateHitKeys().length > candidateKeys().size, 'multiple branch hits are deduplicated by UNION semantics');
for (const inheritedOnly of ['ja-v1/a-derived-cva', 'ja-v1/a-derived-asset']) {
  assert.ok(!keys(candidateMembers(undefined, false)).includes(inheritedOnly),
    'omitting printing-to-variant expansion must lose the inherited-only member');
}
assert.ok(candidateKeys().has('ja-v1/a-logo'),
  'candidate preselection must leave non-card filtering to the final manifest read');
if (process.argv.includes('--sql')) process.stdout.write(sql); else console.log('Offline self-contained asset-manifest equivalence fixture passed; no PostgreSQL or production query ran.');
