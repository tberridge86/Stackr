# Catalogue quality denominator guard — 2026-10-22

## Scope and revision

- Source inspected: `main` at `769b9fbd071f82aa774aa22889fce79da2187c28`.
- Read-only database observations: 2026-10-22 18:04–18:06 UTC.
- Production Supabase: `oakdbbzdqwurpjnoqhmu`; staging Supabase: `lmwfhvexfcoyeuoyrlco`.
- Population: every active `game_code = 'pokemon'` row returned by `ingest.catalogue_quality_report`, grouped by language. This is a set-quality inventory, not an authoritative product, printing, finish, image, or device-delivery universe.

## Measured population

`Accepted expected cards` below is the sum of non-null, non-negative, safe-integer set totals no greater than the report's conservative 10,000-card sanity ceiling. An empty population, or any missing or rejected set total, makes the aggregate expected-card denominator unavailable; it is never reported as complete.

| Environment | Language | Sets | Unknown expected totals | Rejected expected totals | Accepted expected cards | Imported cards | Cards missing images | Sets missing logos |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| production | en | 234 | 1 | 0 | 25,076 | 23,876 | 11,585 | 20 |
| production | ja | 221 | 1 | 0 | 21,702 | 15,129 | 6,060 | 59 |
| production | ko | 97 | 0 | 0 | 8,081 | 239 | 239 | 97 |
| production | zh-cn | 134 | 1 | 0 | 12,748 | 12,351 | 227 | 97 |
| production | zh-tw | 108 | 3 | 0 | 12,178 | 7,493 | 6,077 | 61 |
| staging | en | 217 | 0 | 0 | 23,595 | 23,685 | 2,000 | 32 |
| staging | ja | 397 | 0 | 217 | 17,702 | 23,837 | 4,864 | 255 |
| staging | ko | 97 | 0 | 0 | 8,081 | 239 | 239 | 97 |
| staging | zh-cn | 132 | 0 | 0 | 10,334 | 12,351 | 3 | 114 |
| staging | zh-tw | 83 | 0 | 0 | 7,493 | 7,493 | 6,077 | 36 |

Staging Japanese previously summed to 5,052,448 expected cards. The underlying view reads `catalog.sets.total` per set. Of 397 Japanese set rows, 214 repeat `23,198` and three repeat `23,458`; those values are language-wide catalogue-sized totals attached to individual sets, not set denominators. Examples include `S8a-P` (23,458 expected versus 22 imported) and `CLF` (23,198 versus 0). The report now rejects all 217 contaminated values, retains their exact set IDs, exposes the accepted subtotal separately, and reports the overall expected-card total and delta as `null`.

No data was mutated. Correcting the 217 underlying staging set totals is a separate identity-preserving repair and must not copy production totals blindly or collapse distinct languages, printings, finishes, or products.

## Japanese app-path trace

The active search screen `app/(tabs)/search.tsx` passes its selected language, including `ja`, to `searchLocalPokemonCards`. `lib/cardSearch.ts` forwards that language to `searchStackrCards`. In `lib/stackrDomainAdapter.ts`, an enabled Stackr API calls `StackrApiClient.search` (`GET /search`) with the language; the disabled-API fallback queries `pokemon_cards` and applies `language = 'ja'`. Canonical results are committed before optional asset-manifest/TCGdex enrichment, so optional image failures do not discard usable card identities.

Railway access required reauthentication during this run, so the deployed backend revision and a live `/search` response could not be confirmed. Supabase evidence therefore proves stored/report populations only. Installed-device rendering, image delivery, and phone timing remain unmeasured.

## Regression evidence

- `node scripts/test-catalogue-quality-report.mjs` on Node 24.19.0: 15 cases passed, 626 paginated rows recovered, seven tail gaps retained, and three synthetic invalid denominators rejected.
- The repository command uses `node --import tsx`; the isolated runner did not have dependencies installed, so the same test was executed with Node 24's built-in TypeScript stripping. Hosted CI remains the release gate.

## Release handoff

This change is reporting-only. It needs no Supabase migration, database write, Railway deployment, EAS build, or OTA. After review and merge, rerun `npm run catalogue:quality-report -- --target=staging` and confirm Japanese reports `expectedCardTotalStatus = rejected_invalid_values`, `rejectedExpectedCardTotalSets = 217`, and `expectedCardTotal = null` until the underlying set identities are repaired.
