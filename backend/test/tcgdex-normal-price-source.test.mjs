import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summariseTcgdexNormalPricing, summariseTcgdexExactVariantPricing } from '../lib/tcgdex.js';

// Bounded public-provider observation: en/me04-025, retrieved 22 October 2026.
// TCGplayer's normal observation lagged Cardmarket by almost seven days.
function card() {
  return { id: 'me04-025', localId: '025', set: { id: 'me04' },
    variants: { normal: true, reverse: true, holo: false },
    pricing: {
      tcgplayer: { unit: 'USD', updated: '2026-10-14T22:55:13.910Z',
        normal: { marketPrice: 0.09, midPrice: 0.15 },
        'reverse-holofoil': { marketPrice: 0.20 } },
      cardmarket: { unit: 'EUR', updated: '2026-10-21T22:54:33.026Z', trend: 0.03 },
    } };
}

test('newer normal observation preserves exact identity and source provenance', () => {
  const input = card();
  const quote = summariseTcgdexNormalPricing(input, 'en');
  assert.equal(quote.priceSource, 'tcgdex_cardmarket');
  assert.equal(quote.pricingUpdatedAt, input.pricing.cardmarket.updated);
  assert.equal(quote.sourceCurrency, 'EUR');
  assert.equal(quote.providerCardId, input.id);
  assert.equal(quote.providerSetId, input.set.id);
  assert.equal(quote.number, '025');
  assert.equal(quote.language, 'en');
  assert.equal(quote.tcg_mid, null);
  assert.equal(quote.cardmarket_trend, quote.price);
  assert.strictEqual(quote.raw, input);
  assert.ok(Date.parse(quote.pricingUpdatedAt) + 6 * 3600000 < Date.parse('2026-10-22T08:19:39Z'), 'newer remains stale at observation time');
});

test('TCGplayer wins newer observations and timestamp ties', () => {
  for (const updated of ['2026-10-21T22:54:33.026Z', '2026-10-21T23:00:00Z']) {
    const input = card(); input.pricing.tcgplayer.updated = updated;
    assert.equal(summariseTcgdexNormalPricing(input, 'en').priceSource, 'tcgdex_tcgplayer');
  }
});

test('invalid or future observations cannot displace an older usable quote', () => {
  for (const updated of [null, 'invalid', new Date(Date.now() + 3600000).toISOString()]) {
    const input = card(); input.pricing.cardmarket.updated = updated;
    assert.equal(summariseTcgdexNormalPricing(input, 'en').priceSource, 'tcgdex_tcgplayer');
    input.pricing.tcgplayer.updated = updated;
    assert.equal(summariseTcgdexNormalPricing(input, 'en'), null);
  }
});

test('zero value and unsupported currency fall back without using lowest asks', () => {
  for (const change of [p => { p.trend = 0; p.low = 0.01; }, p => { p.unit = 'JPY'; }]) {
    const input = card(); change(input.pricing.cardmarket);
    assert.equal(summariseTcgdexNormalPricing(input, 'en').priceSource, 'tcgdex_tcgplayer');
  }
});

test('non-English normal quotes never select the English TCGplayer lane', () => {
  for (const language of ['ja', 'zh-cn', 'zh-tw', 'ko']) {
    const input = card(); input.language = language;
    input.pricing.tcgplayer.updated = '2026-10-21T23:00:00Z';
    const quote = summariseTcgdexNormalPricing(input, language);
    assert.equal(quote.priceSource, 'tcgdex_cardmarket');
    assert.equal(quote.language, language);
  }
});

test('normal selection does not broaden holo or reverse identities', () => {
  const input = card();
  const reverse = summariseTcgdexExactVariantPricing(input, 'en', 'reverse_holo');
  assert.equal(reverse.priceSource, 'tcgdex_tcgplayer');
  assert.equal(reverse.pricingUpdatedAt, input.pricing.tcgplayer.updated);
  delete input.pricing.tcgplayer;
  assert.equal(summariseTcgdexExactVariantPricing(input, 'en', 'reverse_holo'), null);
  input.variants.normal = false;
  assert.equal(summariseTcgdexNormalPricing(input, 'en'), null);
});

test('single-provider quotes and invalid TCGplayer fallback keep the usable source', () => {
  for (const key of ['tcgplayer', 'cardmarket']) {
    const input = card();
    delete input.pricing[key === 'tcgplayer' ? 'cardmarket' : 'tcgplayer'];
    assert.equal(summariseTcgdexNormalPricing(input, 'en').priceSource, `tcgdex_${key}`);
    input.pricing[key].updated = null;
    assert.equal(summariseTcgdexNormalPricing(input, 'en'), null);
  }
  for (const mutate of [p => { p.updated = 'invalid'; }, p => { p.unit = 'JPY'; }, p => { p.normal.marketPrice = 0; }]) {
    const input = card(); mutate(input.pricing.tcgplayer);
    assert.equal(summariseTcgdexNormalPricing(input, 'en').priceSource, 'tcgdex_cardmarket');
  }
});
