# Ongoing pricing coverage

The owner authorized continuing pricing work in the background toward 100% on 4 October 2026. The active goal and hourly `Grow Stackr price coverage` follow-up belong to the current chat. Existing daily provider workers continue independently. Preserve the dirty primary checkout; use this isolated release worktree and PR312. Do not restart paused catalogue or eBay sold automations.

The last verified complete production denominator is 76,269 published variants, with fresh general estimates for 29,099 (38.15%) at 10:32 UTC on 4 October. This measures exact TCGCSV variant quotes plus reviewed Cardmarket blended printing estimates, deduplicated by current publication membership. It is not an exact-condition/grade or completed-sales claim. The latest 15:52 UTC health read confirmed 13,614 English and 6,902 Japanese TCGCSV quotes with zero stale rows. There were 99 English and 296 Japanese unmapped provider groups, with no pending/running/failed groups before the new repair batch.

## Current batch: 20261004-01

Five category-3 English set aliases were reviewed against the retained provider groups/products and current published set identities in staging and production. Canonical set codes and UUIDs agree between environments. Each target has one published English set and one retained provider group; no existing provider-set mapping is replaced. Full retained product-to-current-printing reconciliation found 416 products with an exact unique English name and collector number and zero ambiguous printing matches. This is candidate identity evidence, not 416 new prices.

| Provider group | Provider name | Canonical code | Exact unique product/printing matches |
| --- | --- | --- | ---: |
| 1375 | Expedition | ecard1 | 81 |
| 1381 | Triumphant | hgss4 | 89 |
| 1399 | Unleashed | hgss2 | 77 |
| 1402 | HeartGold SoulSilver | hgss1 | 104 |
| 1403 | Undaunted | hgss3 | 65 |

The existing `review_catalogue_bulk_mappings` RPC acknowledged all five staging set mappings. The reviewed set mappings retain the mandatory per-card name, collector, subtype, collision and quote checks. A bounded run of the existing staging worker is being verified before production mapping application. No new-price coverage gain is claimed until persisted fresh quotes and the current deduplicated denominator are measured. Local candidate payload: ignored `.tmp/pricing-coverage-batch01-mappings.json`.

The reviewed-batch preflight now accepts deliberate multi-set promo groups and rejects a canonical variant assigned conflicting set/provider identities or a category/product/finish assigned to several canonical variants, including cross-group collisions. Focused migration/identity/RLS tests, typecheck and lint pass; lint has nine existing warnings and no errors. This local guard change has not been deployed into a worker image and is not required by the currently deployed set-repair RPC.

## Next work

1. Verify batch 01 through staging worker and stored exact variant prices, then apply its same reviewed mappings to production and verify the existing worker. Reuse current artifacts and schedules; do not build a phone release for data-only mapping changes.
2. Measure before/after fresh deduplicated coverage over all current published variants, then review remaining English expansion and year-specific promo aliases in similarly bounded retained-feed batches.
3. Review Japanese provider-group/set-code gaps separately. Collector numbers alone are insufficient without a proven exact native set mapping and unique current printing.
4. Preserve and regenerate Cardmarket private provenance in bounded resumable pages when necessary. Existing staging evidence shows remaining Korean and Simplified Chinese TCGdex Cardmarket IDs collapse multiple languages/printings; these cannot be accepted as exact foreign-price mappings. Seek genuine provider-product/language evidence and record access/coverage blockers explicitly.

## Boundaries

Never invent a price, reuse an English price as an exact foreign-card value, or count an unavailable outcome as priced coverage. Keep the complete published denominator even for unsupported languages and finishes. Distinguish mapping candidates, accepted mappings, stored quotes, backend readability and phone visibility. Save fresh source revisions, timestamps, counts and actual remaining reasons after each material batch. The user authorized necessary bounded price refreshes and provider-mapping writes, with staging validation first. New subscriptions, paid provider activation, native/OTA publication, commerce changes and outside messages are outside this pricing follow-up.
