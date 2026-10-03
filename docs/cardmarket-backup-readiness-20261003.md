# Cardmarket public backup readiness — 3 October 2026

## Current state

The Cardmarket general-price backup is **schema-ready in staging only**. Migration `20261003225832_cardmarket_general_price_backup.sql` is applied to staging project `lmwfhvexfcoyeuoyrlco`; production is untouched. It has not received a Cardmarket payload, a reviewed mapping, or a stored price: imported feed revisions, mappings, and live general-price rows are all **zero**. The backup therefore serves no card and must not be described as operational.

Cardmarket publishes public daily Pokémon catalogue and price-guide downloads. The public guide can support a broad, general market guide only after exact reviewed identity mapping. It cannot establish a language-, condition-, grade-, finish-, or sold-price valuation.

## Verified public feed evidence

- Price guide: `https://downloads.s3.cardmarket.com/productCatalog/priceGuide/price_guide_6.json`
- Singles catalogue: `https://downloads.s3.cardmarket.com/productCatalog/productList/products_singles_6.json`

One bounded full read of each file on 3 October 2026 validated the current parser:

| Feed | Rows | Feed `createdAt` | ETag | SHA-256 |
| --- | ---: | --- | --- | --- |
| Price guide | 79,688 | `2026-10-03T02:41:55+0200` | `"bc29ddf805de2f88594b3f77ab597797"` | `9d56fe70cb13047eca401adf51e34c067dac8e6c49249a00cd05522322b7be58` |
| Singles catalogue | 74,620 | `2026-10-03T11:44:53+0200` | `"1b18027d11ac945b0900b7b37a8fa3f4"` | `14a74405a86acfb80b42168e5cc019c0eae67925e8eee9893f53d35e4922d6ce` |

Those payloads were not retained as import inputs. There is no cached real feed in the repository. The row-count difference is not coverage: it requires a measured join and an explicit unmapped/ambiguous repair queue.

Cardmarket’s 5 June 2024 announcement says that its product catalogue and price guide are public downloadable files updated daily. This static download path is distinct from the retired OAuth API restrictions.

## Staging contract

The staging migration creates an independent Cardmarket namespace. It leaves the existing TCGCSV/Tcgplayer English/Japanese constraints unchanged.

- Feed revisions retain source URL, source date, ETag, SHA-256, byte length, retrieval time, and a per-file service-only lease. A successful file kind can be claimed only once per 24 hours.
- A durable mapping links one reviewed Cardmarket product/category to one Stackr **printing**, never a variant. It requires language, variant, and finish evidence plus a review reference. Mapping changes append an audit record and invalidate the old blended quote.
- `api.store_cardmarket_blended_general_prices` accepts only `trend`, `avg30`, or `avg`; `low` remains an asking-floor field and is rejected as a market estimate.
- GBP display values require a positive EUR→GBP conversion with non-empty source, no future timestamp, and an age of at most seven days. The original EUR amount, selected guide field, FX rate/date/source, feed revisions, and stale time remain stored.
- `api.read_cardmarket_blended_general_prices(uuid[])` is service-only and returns printing-scoped `blended_general_estimate` quotes. Its metadata sets language, condition, finish, and grade to `null`, and explicitly marks `usableForExactVariant: false` and `usableForHoldingsValuation: false`.

The backend may use this read only as a general-guide fallback attached to the matched printing. It must never select it for exact card pricing, collection/holding totals, a condition/finish price, a graded price, or a last-sold claim.

## Offline adapter and gates

`scripts/cardmarket-public-guide.mjs` validates bounded downloads: 45-second deadline, 32 MiB body limit, transient/network retries, `Retry-After`, ETag/304 revision handling, non-empty envelopes, and valid IDs. `scripts/cardmarket-cached-ingestion.mjs` consumes only retained JSON files and a reviewed ledger. It makes no network or database call by default, pages at 500 products, emits deterministic review items, and refuses stale or future FX evidence when preparing a store batch.

The parser and cached-planner tests are fixture tests. The migration test is a local PGlite test. They prove contracts, not production data coverage.

The remaining gate is concrete:

1. On the next permitted daily refresh, retain both real raw files and retrieval metadata.
2. Claim and record both staging feed revisions under the service-only daily lease.
3. Create reviewed, evidence-backed printing mappings without name/set/number inference.
4. Run the bounded offline plan, persist only its reviewed `trend`/`avg30`/`avg` candidates with current FX evidence, and persist every missing or ambiguous result as a repair.
5. Measure staging rows, mapping coverage, repairs, source age, and the backend’s general-only display path before considering production.

## Related provider evidence

A Railway credential probe for eBay OAuth/Browse passed at `2026-10-03T22:58:29.813Z`. It is independent from Cardmarket and does not fill the Cardmarket backup gate. Browse evidence remains active/listing evidence, not a Cardmarket import or an eBay sold-price claim.

## Primary sources

- [Cardmarket announcement: public price guide and product catalogue](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download)
- [State of Cardmarket 2024](https://insight.cardmarket.com/en/Articles/the-state-of-cardmarket-2024)
- [Cardmarket Data](https://www.cardmarket.com/en/Magic/Data)
- [Finding and listing Pokémon cards](https://help.cardmarket.com/en/finding-and-listing-pokemon-cards)
