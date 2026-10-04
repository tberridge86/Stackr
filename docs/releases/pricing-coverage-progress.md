# Ongoing pricing coverage

The owner authorized continuing pricing work in the background toward 100% on 4 October 2026. The active goal and hourly `Grow Stackr price coverage` follow-up belong to the current chat. Existing daily provider workers continue independently. Preserve the dirty primary checkout; use this isolated release worktree and PR312. Do not restart paused catalogue or eBay sold automations.

Production coverage is **29,845 / 76,269 published variants (39.13%)**, measured in bounded physical identity queries between 17:43 and 17:44 UTC on 4 October. The earlier 10:32 UTC baseline was 29,099 (38.15%): **746 previously unpriced variants now have general estimates**. This counts exact TCGCSV variant quotes plus reviewed Cardmarket blended printing estimates once per current publication membership. It is not an exact-condition/grade or completed-sales claim, and the language reads are not one atomic database snapshot. See [the latest verification receipt](pricing-coverage-progress-20261004-1831.json), [the 18:12 continuation receipt](pricing-coverage-progress-20261004-1812.json) and [the previous batch receipt](pricing-coverage-progress-20261004-1641.json).

| Language | Published variants | Fresh guide prices |
| --- | ---: | ---: |
| English | 33,359 | 18,461 |
| Japanese | 14,100 | 7,320 |
| Korean | 239 | 10 |
| Simplified Chinese | 20,405 | 0 |
| Traditional Chinese | 8,166 | 4,054 |

Reviewed batches have added **1,083 fresh primary TCGCSV quotes**, with physical identities and dated FX conversions verified. Backup-price overlap means their net combined coverage gain is 746. Direct service SQL calls to `api.read_catalogue_prices` returned fresh exact quotes for selected expansion/promo and Trainer Gallery variants. The latest Delta and Rumble batches have separate physical stored-quote and FX verification. Authenticated owner HTTP and phone visibility were not measured in these batches.

## Current batch: 20261004-01

Five category-3 English set aliases were reviewed against the retained provider groups/products and current published set identities in staging and production. Canonical set codes and UUIDs agree between environments. Each target has one published English set and one retained provider group; no existing provider-set mapping is replaced. Full retained product-to-current-printing reconciliation found 416 products with an exact unique English name and collector number and zero ambiguous printing matches. This is candidate identity evidence, not 416 new prices.

| Provider group | Provider name | Canonical code | Exact unique product/printing matches |
| --- | --- | --- | ---: |
| 1375 | Expedition | ecard1 | 81 |
| 1381 | Triumphant | hgss4 | 89 |
| 1399 | Unleashed | hgss2 | 77 |
| 1402 | HeartGold SoulSilver | hgss1 | 104 |
| 1403 | Undaunted | hgss3 | 65 |

The existing `review_catalogue_bulk_mappings` RPC acknowledged all five mappings in staging and production. The reviewed mappings retain mandatory per-card name, collector, subtype, collision and quote checks. Staging materialization verified ten Expedition canaries. Independent production plans from its own retained feeds and current published candidates then stored and verified 811 positive exact-variant quotes through the existing guarded API. Local candidate payload: ignored `.tmp/pricing-coverage-batch01-mappings.json`.

The reviewed-batch preflight accepts deliberate multi-set promo groups and rejects a canonical variant assigned conflicting set/provider identities or a category/product/finish assigned to several canonical variants, including cross-group collisions. Focused migration/identity/RLS tests, typecheck and lint pass; lint has nine existing warnings and no errors. The current paged-report worker integration is source-only at the 18:31 receipt; deployment evidence must be recorded separately.

## Batch: 20261004-02

Sixty exact McDonald's promo variants from 2011, 2012, 2014, 2015 and 2016 were reviewed in staging and production (groups 1401, 1427, 1692, 1694 and 3087). Reviewed aliases remove a provider title's collector suffix only when its full collector identity agrees with the canonical English card and exactly one current printing and finish match. The pure automatic matcher was not broadened. Stage and production each materialized and verified 60/60 positive quotes from their own retained feeds. These cards already had Cardmarket general estimates, so this batch improves exact primary evidence and backup redundancy but adds zero to the combined coverage numerator.

## Refresh reliability

The hourly TCGCSV execution at 16:15–16:17 UTC completed nine new groups but failed group 1403 (Undaunted) with a statement timeout in `resolve_catalogue_bulk_set`. Forward migration `20261004162804_bounded_reviewed_provider_set_resolver` now uses the equivalent bounded physical publication joins in the base name resolver. It is applied in staging and production with identical bodies and aligned canonical ledger versions. Japanese exact-code wrappers, publication/card identities and service-only access are unchanged. Full live calls completed under the eight-second budget (staging 550 ms; production 2,386 ms); these include repair bookkeeping and are separate from the narrower warm lookup comparison.

Recovery used the existing claim, resolver, candidate, pure planner with whole-group collision preflight, full-page store and lease-bound finish contracts against retained feeds. Undaunted processed all 177 variants with 127 priced outcomes; all three Trainer Gallery groups processed 30/30 priced variants. Later complete recoveries processed Dragon Frontiers 101/96 priced, Delta Species 116/98 priced and Rumble 16/13 priced. The durable run has **zero pending, running or failed groups**, 135 complete/85 unmapped English groups and 163 complete/296 unmapped Japanese groups. Its status is `needs_mapping`, which is an honest mapping gap rather than 100% priced coverage. The scheduled production executions at 17:16 and 18:17 UTC both completed with exit code zero. Their optional legacy whole-coverage report still timed out; this is retained explicitly in the receipts. No provider feed was fetched for recovery.

The Cardmarket execution at 16:18 UTC succeeded. Existing daily provider datasets and hourly resumable schedules continue. The Chinese eBay backup language-evidence repair at `de7b05e` passes focused and backend pricing tests, and all twelve applicable PR checks passed on that head. This repair has not been deployed; active listings remain asking-price evidence, and Simplified/Traditional Chinese are never interchangeable.

## Batch: 20261004-03

The Astral Radiance, Lost Origin and Silver Tempest Trainer Gallery groups (3068, 3172, 17674; canonical codes `swsh10tg`, `swsh11tg`, `swsh12tg`) each supplied 30 exact Holofoil variants. Eighty-four titles match directly; six TG29/TG30 products have an explicitly reviewed terminal ` (Secret)` alias with the same current set, English name, collector, printing and finish. The generic matcher was not changed. Each environment independently reviewed, planned, stored and physically verified 90/90 quotes from its own retained provider feeds. None overlap the Cardmarket backup, so all 90 increase combined coverage. Ignored evidence files begin `.tmp/trainer-gallery-` and `.tmp/pricing-coverage-batch03-`.

## Next work

1. Promote the tested paged-report worker at its exact source commit to staging, verify its scheduled execution and then promote production. Both workers currently pin an older source commit, so pushing the branch or redeploying that old artifact alone cannot publish this change. Recheck that no unrelated Railway changes are staged before accepting an environment patch. Do not build a phone release for data-only mapping changes.
2. Continue reviewing remaining English and Japanese bulk set identities in bounded retained-feed batches, measuring fresh deduplicated coverage after each accepted batch.
3. Review Japanese provider-group/set-code gaps separately. Collector numbers alone are insufficient without a proven exact native set mapping and unique current printing.
4. Continue bounded Cardmarket TCGdex private source retention before restarting provenance materialization. The missing production retention RPC and observation bridge are now repaired with a forward migration; service-only access, immutable retry/reuse and three current physical KO/CN/TW canaries passed in both environments. The retained source records preserve actual URLs, rights metadata, external keys and dates; they add zero prices until reviewed. The existing materializer fetches no provider data, so merely rerunning all 150 pages cannot repair Asian evidence. The new retention runner has a durable language/version/source checkpoint and distinguishes reused inputs from provider skips. Once enough source inputs are present, the no-argument materializer begin creates a fresh run; process calls are fixed 500-ID pages and should be bounded to five pages per hourly tick. Shared provider IDs across languages/printings remain quarantined.
5. Stage and promote the tested Chinese eBay language-evidence fix through the existing pricing release workflow, then verify provider details and source-labelled asking estimates for exact foreign identities.

## Batches: 20261004-05 and 20261004-06

Dragon Frontiers (1411) and Delta Species (1429) supplied 109 new exact primary quotes after cohort-only review of Delta Species/δ and Star/☆ title aliases. Full collector, current printing, language, finish, retained feed and collision checks agree independently in staging and production. This adds 73 previously unpriced combined variants. Pokémon Rumble (1433) supplied 13 exact Normal quotes, adding two previously unpriced combined variants. The three unresolved Rumble variants remain unresolved. Radiant Collection produced no new accepted mappings: its valid shared-set quotes already belong to a different provider group and are protected by the new authoritative-group candidate exclusion.

## Paged coverage verification

The legacy whole-report query still exceeds the production eight-second budget. Two equivalent hash/projection optimisations were tested only in staging and did not reliably solve it; their migrations are not recorded as applied in production. The separate service-only `catalogue_bulk_price_coverage_page` RPC is applied identically in both environments. It pages raw current variant identities before physical and market joins, advances through invalid-only pages, and preserves the full physical denominator.

The actual worker client completed all **39 production pages** between 18:30:53 and 18:31:55 UTC, with a stable published-version context. It scanned 76,317 raw identities and counted **76,269 valid physical variants**. Its primary-only total was **21,599 priced, zero stale**, matching the 14,697 English and 6,902 Japanese exact TCGCSV quotes. These primary-only counts must not replace the combined Cardmarket/TCGCSV coverage numerator. The report explicitly records a non-atomic observation window, and its client rejects changing versions, bad cursors, invalid counts and incomplete terminal pages. The complete focused price-cache suite, typecheck, syntax checks and lint passed after integration. Source verification does not prove the scheduled image has been deployed.

## Boundaries

Never invent a price, reuse an English price as an exact foreign-card value, or count an unavailable outcome as priced coverage. Keep the complete published denominator even for unsupported languages and finishes. Distinguish mapping candidates, accepted mappings, stored quotes, backend readability and phone visibility. Save fresh source revisions, timestamps, counts and actual remaining reasons after each material batch. The user authorized necessary bounded price refreshes and provider-mapping writes, with staging validation first. New subscriptions, paid provider activation, native/OTA publication, commerce changes and outside messages are outside this pricing follow-up.
