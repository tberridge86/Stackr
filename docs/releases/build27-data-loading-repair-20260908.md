# Build 27 data and loading repair — 8 September 2026

## Release baseline

Investigated main `1ebc6a196160b21064ff8a2c2f3666bdf3cd26e3` (PR #146) and the production backend uploaded from `e3c9b00cb668671c5ac74e1c3f05934b1de9240f` (PR #144). The existing owner-recognition release uses TestFlight 1.0.3 (27), runtime `1.0.3-owner-recognition-v1`, and channel `owner-recognition`. Its latest observed OTA group was `a4b8463e-3d10-4ba0-85ca-82f25f505748`.

The combined architecture remains the canonical catalogue and approved asset records in Supabase, the Stackr API on Railway, exact-identity provider references where available, and the app's bundled magazine covers. The fixes preserve the recent scanner teaching, personal collection loading, English-set visibility, pricing identity, and cover-pack changes.

## Confirmed problems and changes

| Problem | Evidence | Repair and release state |
| --- | --- | --- |
| Slow catalogue name lookups | A production `EXPLAIN ANALYZE` name lookup took 1,120.638 ms. Its plan hashed a 75,797-row published-variant membership subquery. | Migration `20260908111410` retains the publication predicates and keeps membership checks correlated. The same view query measured 82.645 ms after deployment, about 93% less database execution time. Applied to staging and production. This measures one database query, not phone load time. |
| English name aliases returning Chinese cards | `/v1/search?q=Charmander&language=en&limit=2` returned two `zh-cn` cards. Name language describes the alias, not necessarily the printing. | Migration `20260908111830` exposes `printing_language_code`; it is live in staging and production. The API change filters by that field before limiting name results and checks the requested language/set on every strategy. API deployment still required. |
| Image component stopped after one failed rendition | The component selected the first supplied URI and went straight to a fallback on failure. A failed prefetch could also remain marked as complete. | Try the supplied thumbnail, ordinary image and full rendition before the final fallback; preserve explicit bundled-cover priority and image policy. Retry failed prefetches and isolate rendition cache entries. Mobile OTA still required. |
| Home priced entire virtual binders before valuing owned cards again | `HubScreen` called price-enriching `fetchBinderCards` for each binder, then performed its ownership-aware collection valuation. | Home requests binder rows without that redundant pricing pass. Existing callers retain pricing by default; priced and unpriced cache entries remain separate. Mobile OTA still required. |

Both view migrations preserve `security_invoker=true` and the existing grants. The performance rewrite was checked against 638 rows across English, Japanese and Chinese name probes with zero missing or added rows. Migration names and versions in this change match production's migration history. The printing-language migration retained the original columns and appended one new column.

The final language-filter check exposed another index problem: the existing name index starts with the alias language, so the corrected query could not seek efficiently by name alone. Migration `20260908113546` adds a partial covering index on active `(normalized_name, name_type)` records. It was rehearsed in staging and applied in production. The actual API-shaped Charmander lookup then used that index, returned 80 English-name rows after excluding 27 Chinese-printing aliases, and measured 445.424 ms in production (including 107 published-membership checks). This is a different query from the earlier 82.645 ms probe; neither is an end-to-end device benchmark.

## Remaining source and operations gaps

Some missing card art has no available record in the current feed. Japanese SM6 Greninja GX 020, variant `05c88283-dad0-451c-bd08-fa6cbb59002f`, had no `catalog.assets` row; its live set/card provider responses supplied no usable image. The app correctly reports `scan_acquisition_required`. Retrying image rendering cannot manufacture that missing source. An exact printing image must be acquired and attached through the established asset pipeline.

The existing 81 PNG magazine covers and the explicit February 1997 / May 2001 CoroCoro mappings are retained. Additional issue artwork must match an existing issue identity; this change does not fabricate sets or borrow another edition's image.

Price availability is mixed. Production has stored provider estimates, including 1,091 TCGdex/TCGplayer-labelled snapshots most recently dated 7 September and 120 TCGdex/Cardmarket-labelled snapshots most recently dated 6 September. There were also 332,374 unlabelled historical snapshots last updated on 29 July. The canonical `market.price_estimates` store and unprocessed `public.price_refresh_queue` were empty when inspected. These stored estimates do not establish a fresh individual sold-comparison feed.

Price workflow run `34061375184`, created 6 September, is waiting for the protected production environment approval. It occupies the serialized `stackr-price-refresh` concurrency group; newer scheduled work is pending or cancelled. The waiting run uses older source SHA `a335d64b1c6f025c7e94fa6013614b6d70fbb2c3`. Cancel/review that stale run and start a current-main refresh through the authorized GitHub controls. The scheduled workflow's production approval requirement also needs an explicitly approved operational arrangement so future refreshes do not repeatedly stall. This repair does not remove environment protection or invent provider evidence.

## Validation and release handoff

Local verification passed the personal-loading suite, new image-candidate and language-selection regressions, existing catalogue API integration, collection-pricing UI tests, TypeScript app/backend checks, the controlled TCGdex reference boundary test, and all three magazine cover tests (including all 81 file hashes). The new regressions run through `test:personal-loading` in Platform CI. The image and language fixtures exercise failed thumbnail fallback, preserved bundled artwork, translated lookup, foreign aliases preceding the English result, and UUID language/set constraints. Set cards and the binder toploader now supply their existing large image as an alternate rendition.

The deployment-tooling regression's expected migration ledger now includes these three exact additions. Its assertions that the frozen reconciliation evidence and global deployment gate remain blocked are retained; no approval record or release protection is changed.

For backend release, use the existing `deploy-production.yml` workflow with `release_scope=backend_only`, the exact verified main SHA, and a valid canonical pricing smoke variant. Railway's backend service currently uses an uploaded source snapshot, so redeploying its existing deployment would not publish this code. All three database migrations are already applied; do not replay them under newly generated version numbers.

Publish the mobile change through the existing owner-recognition OTA flow after CI, maintaining runtime `1.0.3-owner-recognition-v1` and the approved bundled covers. Verify the served update and then check Home, binder covers, alternate image renditions and English/Chinese searches on the device. Do not describe this report or a merged PR as proof that the API or mobile update has been released.
