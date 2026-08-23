import assert from 'node:assert/strict';
import {
  buildImportManifest,
  buildMarketIdentityKey,
  normalizeSoldRows,
  parseCsv,
  sha256,
  stableJson,
} from './lib/ebay-sold-import.mjs';
import { APPROVED_STAGING_PROJECT_REF, run } from './import-ebay-sold-observations.mjs';

const csv = `variant_id,product_kind,source_item_id,source_url,raw_title,sold_price,shipping_price,currency_code,sold_at,observed_at,condition_code,grader_code,grade_value,sale_type,parsed_match_confidence,attribution_text
354c315a-6be7-467e-baeb-26403e3280e0,raw_card,123456789012,https://www.ebay.co.uk/itm/123456789012,"Radiant Charizard, Crown Zenith 020",6.50,1.25,gbp,2026-08-20T18:30:00Z,2026-08-21T09:00:00Z,raw_near_mint,,,manual_verified_sale,0.99,eBay Product Research`;

const parsed = parseCsv(csv);
assert.equal(parsed.length, 1);
assert.equal(parsed[0].raw_title, 'Radiant Charizard, Crown Zenith 020');

const rows = normalizeSoldRows(parsed, { now: new Date('2026-08-23T12:00:00Z') });
assert.equal(rows[0].currencyCode, 'GBP');
assert.equal(rows[0].shippingPrice, 1.25);
assert.equal(rows[0].saleType, 'manual_verified_sale');
assert.equal(rows[0].payloadHash.length, 64);
assert.match(buildMarketIdentityKey(rows[0]), /^stackr-market-v1\|raw_card\|/);

const manifest = buildImportManifest(rows);
assert.equal(manifest.manifestSha256.length, 64);
assert.equal(manifest.manifestSha256, buildImportManifest(rows).manifestSha256);
assert.equal(sha256({ b: 2, a: 1 }), sha256({ a: 1, b: 2 }));
assert.equal(stableJson({ b: 2, a: 1 }), '{"a":1,"b":2}');

assert.throws(
  () => normalizeSoldRows([{ ...parsed[0], source_url: 'https://example.com/item/123' }], { now: new Date('2026-08-23T12:00:00Z') }),
  /eBay domain/,
);
assert.throws(
  () => normalizeSoldRows([{ ...parsed[0], sold_at: '' }], { now: new Date('2026-08-23T12:00:00Z') }),
  /explicit ISO-8601 timestamp/,
);
assert.throws(
  () => normalizeSoldRows([{ ...parsed[0], parsed_match_confidence: '0.5' }], { now: new Date('2026-08-23T12:00:00Z') }),
  /between 0.9 and 1/,
);
assert.throws(
  () => normalizeSoldRows([{ ...parsed[0], product_kind: 'graded_card', condition_code: 'graded' }], { now: new Date('2026-08-23T12:00:00Z') }),
  /requires condition_code=graded/,
);
assert.equal(APPROVED_STAGING_PROJECT_REF, 'lmwfhvexfcoyeuoyrlco');
await assert.rejects(
  () => run(['--file=never-read.csv', '--target=production'], {}),
  /locked to target=staging/,
);
await assert.rejects(
  () => run(['--file=never-read.csv', '--target=staging'], { SUPABASE_URL: 'https://production-example.supabase.co' }),
  /Refusing non-staging Supabase project/,
);

console.log('Verified eBay sold import tests passed.');
