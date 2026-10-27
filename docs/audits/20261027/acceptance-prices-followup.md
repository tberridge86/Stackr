# Price acceptance follow-up — 27 October 2026

Source inspected: platform-health candidate `9345d69` (pricing code unchanged
from main `b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`). Live database:
`oakdbbzdqwurpjnoqhmu`. Reads at 15:24–15:26 UTC used read-only transactions
with 5-second limits, or 8 seconds for four exact-price identities. No provider
refresh, queue write, pricing mutation or production deployment occurred.

## Result

**Partial pass for stored identity and honest labels; freshness coverage fails
the acceptance goal.** A successful valuation publication is not evidence that
its component prices are fresh. An authenticated API/installed-app journey was
not available, so screen labels and real owner delivery remain unmeasured.

At 15:26:16, the latest exact summary (calculated 15:21:45) contained 389 units:
180 priced with older evidence, 209 unpriced, and zero fresh. Its oldest source
timestamp was 14 October; newest was 26 October 22:54 UTC.

At 15:26:43, a newer generation (calculated 15:26:26) contained the general
summary: 389 units, 371 priced with older evidence, 18 unpriced, zero fresh.
The 371 comprise 180 exact-priced units and 191 explicitly general estimates.
These are different valuation modes, not contradictory coverage counts. Do not
report the 209 exact-only missing units as the general-mode screen's gap.

## Bounded identity and provenance trace

Sampled stored holdings selected without returning owner IDs, quantities or
private binder details. Four public card references were followed through
language-scoped aliases and canonical catalogue variants.

| Reference / saved finish | Live stored result | Acceptance consequence |
| --- | --- | --- |
| English `me3-33`, normal | Canonical normal variant `d69d46e2-ffd7-4e27-ada6-9bdf461cc75d`; stored TCGdex/TCGplayer estimate GBP 0.06. Provider timestamp 10 September 21:01:58; stale-after 11 September 03:01:58. Original payload has USD 0.07 normal market estimate. | Correct language/normal identity and source-labelled market estimate; stale. This sample does not establish a current FX rate. |
| English `me3-13`, reverse holo | Canonical reverse-holo variant `d4f0c947-1107-475e-b8b0-f0a5f56921ac` exists; `latest_stored_exact_prices` returns no estimate or snapshot for it. | No exact stored price. Normal pricing must not silently become a reverse-holo quote. |
| Japanese `S12a-001`, saved holofoil | Japanese alias resolves to canonical normal base `40518fcf-4f54-48db-980b-b4ce9b44c2d4`, not a proven holo variant. Base estimate GBP 0.03, TCGdex/Cardmarket; original normal trend EUR 0.04. | Base may support an explicitly labelled general estimate. It does not prove the saved holo finish's exact price. |
| Japanese `S12a-002`, saved holofoil | Japanese alias resolves to canonical normal base `74705ef8-229f-4f51-b23e-b8c9cb5e2491`; GBP 0.11, TCGdex/Cardmarket; original normal trend EUR 0.13. | Same exact/general distinction. |

Both Japanese base snapshots were provider-dated 26 October 22:54:32 and expired
27 October 04:54:32, before this check. All three stored snapshots explicitly
had `proven_last_sold=false` and `price_type=market_estimate`. Japanese and
Traditional Chinese aliases share the strings `S12a-001/002`; their distinct
language codes must remain part of resolution. No Chinese holding was returned
by the bounded prefix sample, so no Chinese-owned price acceptance is claimed.

## Fresh local verification

- `node scripts/test-general-price-identities.mjs` — passed: language/printing
  matching, exact-first selection and explicitly labelled general estimates.
- `node scripts/test-catalogue-price-fx.mjs` — passed: dated ECB USD/EUR rates,
  invalid/missing/duplicate dates/rates, outage and response-size bounds.
- `node scripts/test-market-pricing-estimate-builder.mjs` — passed.
- Called the actual `createMarketPricingService().storedExactPrices()` adapter
  with the sampled English snapshot through a mocked stored-only RPC. It
  returned GBP 0.06, `freshness=stale`, `quoteScope=exact_variant`, zero sold
  samples and `provider_market_estimate_shipping_unknown`. This verifies source
  response transformation, not the currently deployed API or phone display.

The dated ECB test belongs to the catalogue FX path. The legacy TCGdex path in
`backend/lib/tcgdex.js` separately has environment-configured USD/EUR conversion
rates with numeric defaults. Its persisted snapshot retains original provider
payload but does not record a dated conversion-rate receipt in the inspected
writer. Passing the ECB test therefore does not certify the legacy snapshot's
exchange-rate provenance. No price values were changed on that basis.

## Concrete next action

1. Release/QA: verify that the installed app displays the general-versus-exact
   distinction and stale status for these cases through a real owner session.
2. Pricing: investigate why the current successful generation has zero fresh
   units; separate provider update cadence from worker fetch cadence. Do not
   extend freshness thresholds or overwrite source dates to improve a count.
3. Pricing/performance: use the already captured 58.6-second generation timings
   to target catalogue round trips and exact-price lookup work. This follow-up
   makes no additional latency or improvement claim.
4. Pricing: retain a dated conversion-rate receipt in future legacy-provider
   snapshots if that lane remains active; do not mistake general catalogue FX
   tests for legacy-path proof.

No new price feed, schema proposal or duplicate PR #446 optimisation was added.
