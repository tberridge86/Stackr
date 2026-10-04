# Cardmarket public backup readiness

## Current state — 4 October 2026

Cardmarket is now an operational **general market-guide backup** in staging and production. It is not an exact-card, condition, finish, grade, sold-price, or holdings-valuation provider.

The production retained-feed import completed from the verified 4 October public files. It scanned all 150 bounded product pages, stored 9,224 reviewed printing mappings and 9,223 blended general estimates, and persisted 65,397 explicit repairs: 65,396 `missing_exact_mapping` and one `no_market_guide_value`. The difference between mappings and estimates is recorded rather than hidden.

The products revision is `ae42de16-eb38-414d-a45d-c688d558eeb7`, created 3 October 2026 09:44:53 UTC, SHA-256 `14a74405a86acfb80b42168e5cc019c0eae67925e8eee9893f53d35e4922d6ce`. The price-guide revision is `88df9af6-8055-4bf0-9c21-9c230681befe`, created 4 October 2026 00:40:55 UTC, SHA-256 `acdd6ed470fa738b7dd318d7548df425123d83b51d4ab258b0a0de43d9cf8e82`. Estimates retain their original EUR amount and the ECB EUR→GBP rate `0.85033` dated 2 October 2026.

The production readback returns `priceScope: blended_general_estimate`, `provider: cardmarket_public`, and the selected guide field, while language, condition, finish, and grade remain `null`. It explicitly sets `usableForExactVariant: false` and `usableForHoldingsValuation: false`.

## Durable daily operation

Separate staging and production Railway workers use successful source build `3534ea3` and dedicated 1 GB `/var/lib/cardmarket` volumes. The configured hourly minute-17 UTC check verifies the durable manifest and either reuses a same-day retained revision or advances the public provider revision. It does not redownload a verified same-day guide. Retained revisions, reviewed mappings, and checkpoints make restart/resume idempotent.

The first scheduled execution at 10:17 UTC is pending at the time of this update. A successful configured build is not evidence that the cron has executed; the scheduled run must be checked and recorded independently.

The loader accepts only reviewed printing mappings with language, variant, finish, and review evidence. Unmapped, ambiguous, missing-price, or unusable records are explicit repairs. It does not infer mappings from names, codes, or catalogue proximity.

## Public feed contract

- Price guide: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`
- Singles catalogue: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json`

Cardmarket publishes the public product catalogue and price guide as daily downloads. This static feed is separate from the retired OAuth API. The bounded parser validates deadline, body size, retry timing, ETag/304 responses, envelopes, and product IDs. The cache loader revalidates raw-file SHA-256 and source dates before any database operation.

Only `trend`, `avg30`, or `avg` are eligible market-guide fields. `low` is an asking floor and is rejected. GBP display requires a positive, non-future ECB conversion no more than seven days old; the EUR source amount, field, rate, date, source, feed revisions, and stale date are preserved.

## Scope and remaining work

Cardmarket gives a broad general guide for the reviewed printing cohort. Its public data does not prove language, condition, finish, or grade. The 65,397 repair records are a durable coverage queue, not a claim of coverage. New mappings need the same reviewed identity evidence before they can contribute a general estimate.

## Primary sources

- [Cardmarket announcement: public price guide and product catalogue](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download)
- [State of Cardmarket 2024](https://insight.cardmarket.com/en/Articles/the-state-of-cardmarket-2024)
- [Cardmarket Data](https://www.cardmarket.com/en/Magic/Data)