# Retrieval repairs — 2 October 2026

Image and backend search repairs published and independently verified through the production API. Physical iPhone acceptance is pending; some first API reads still exceed 0.5 seconds. See measured results below.
Base: main 3faf8edf4602258cef36ca08b7abd96cabcc3cc6. This work does not rebuild build 49 or publish an OTA.

## Search

Production `SVAM GRA` in Traditional Chinese returned HTTP 200 with zero cards before repair. Expected printing: ff38c18b-d0a7-4baf-8a2a-1b6faf4aa17e. The parser now resolves a letter-only collector number against an exact set first; matching is case-insensitive. Wrong language, wrong selected set, missing set and partial collector controls pass. Ordinary names retain their fallback and no global alphabetic collector scan is introduced.

The browser preview at port 8085 had the API feature flag unset, so it read legacy staging tables and returned no Charizard results. With the API enabled and the restricted loopback proxy supporting public search/card reads, the repaired preview returned 54 cards and 2 sets for Charizard. This is a staging browser observation, not proof about the owner's installed phone or production artwork. The preview launcher now defaults an unset API flag to true; explicit development overrides remain possible. Authentication, price endpoints, mutations and non-loopback access remain blocked in the preview proxy.

[Browser search evidence](evidence/retrieval-20261002/search-results-web.jpg).

## Image delivery

Frozen package: 13 files, SHA256 plan a2c1d358bd7d5fc76188b7ca03c8251a64f44fc97ddb9e182dd965d79e9a7277.

- Nine existing WebP files have malformed actual HTTP cache headers. Copy their identical checksum-verified bytes to new immutable cache-v2 paths; change only three active assets' nine derivative references. Preserve the original stored files. The fourth matching record 4c6bf875-e836-432f-8b72-7b044a5e23a1 is already unavailable and remains untouched.
- Japanese M5 #002 / アゴジムシ (d8bd6e96-a51e-4b2b-b71a-031ec159820e, variant 134b24e5-ad9e-419b-b69a-8b4ce82c09cc) has approved official source artwork but zero renditions. Existing image processing prepared a normalized original plus search 96×134, grid 240×335 and detail 720×1005. Update only the existing approved asset's storage fields. Keep its original source URL, printing, variant, rights and published catalogue membership.
- The protected existing production workflow has an isolated retrieval_assets scope. Exact main SHA, frozen payload hashes, byte decoding, permissions, identities and current row state are checked before publication. Objects use upsert:false; all public bytes/headers verify before transactional association changes. Every affected API binding is checked after commit. Receipts survive failure; do not blindly rerun if only API cache propagation is pending.

These are 13 files and four asset-row repairs, not 13 newly identified cards. Historical front-recovery totals are unchanged.

## Measurements and binder preload

[Baseline receipt](evidence/retrieval-20261002/baseline.json) and [nine header observations](evidence/retrieval-20261002/cache-header-readback.json) are desktop network observations. The three initial production requests took approximately 2,957 ms (Charizard), 667 ms (SVAM GRA, incorrect empty result) and 751 ms (M5 #002 detail). Each is one observation; no p95, phone-speed or universal under-0.5-second claim follows.

Keep cached, account-isolated binder summaries/covers and the existing bounded nearby-thumbnail preload (six ahead, maximum 18). Do not eagerly fetch every full-size card in every binder. Existing device-local binder observations distinguish model-ready, visible rows and editable ownership; they do not establish full image decode or phone tap-to-render time.

Physical phone timings are unmeasured. Need installed build/OTA identity, phone/OS, network, first and repeat search/card/binder interactions, correct visible results and images. The owner was asked whether search fails on phone, preview or both and for the installed build. No device answer was available at preparation. No personal holdings or raw queries are added to telemetry.

## Validation and remaining work

Passed: search printing/language checks, full API v1 tests, personal-loading group, preview proxy and iPhone preview tests, deployment tooling checks, TypeScript, six publisher tests (including rollback/idempotency/header/hash rejection), payload decode/hash verification and YAML parse. Scoped lint: zero errors, one pre-existing require-style warning in the proxy test.

Publication completed through normal GitHub checks in the separate retrieval_assets and backend_only lanes. Deployed SVAM GRA identity, nine new cache headers and all three M5 sizes are independently verified in the receipts below. Phone search failure beyond the reproduced preview defect remains unverified until the actual installation is checked.

Separate backlog unchanged: 2,908 artwork cases, 94 missing checklists, SV4a missing 40 cards, logo gaps, pricing/valuation exceptions and device acceptance. Native97 stays held after its third HTTP429; this repair does not retry it.

## Japanese padded-number follow-through

On 2 October the owner explicitly authorized fixing Japanese retrieval and recording production approval through the logged-in GitHub account. Production asset run [36983406958](https://github.com/tberridge86/Stackr/actions/runs/36983406958), source 29a07d02feca336091c1452ccc4e8dc5b5bbc3e9, passed after normal environment approval. The downloaded [publisher receipt](evidence/retrieval-20261002/published-receipt.json) independently hashes to SHA256 f91f55cbe17a6b9cb4e41f829b972c11a7f354b648be5f17b3f9bffca4d3fd7a, matching its artifact checksum. [Independent public verification](evidence/retrieval-20261002/published-live-verification.json) confirms all 13 files' bytes, hashes, decodability and valid one-year cache headers, plus all four API asset associations. M5 #002 now exposes all three sizes; its search thumbnail is 4,032 bytes. Existing originals and the unavailable mirror record were preserved.

Fresh desktop API [diagnostic observations](evidence/retrieval-20261002/japanese-baseline.json) reproduced a separate correctness and latency defect:

| Requested card | First observed API time | Actual returned set | Correct? |
| --- | ---: | --- | --- |
| Japanese M5 002 | 6,783 ms | S11 | No |
| Japanese SV4a 001 | 2,247 ms | SV11B | No |
| Japanese SV2a 157 | 346 ms | SV2a | Yes |
| English base1 4 | 406 ms | base1 | Yes |

Each row is one observation, including full response decoding, with shared cache state unknown. These are not phone timings or an SLA sample. The SV11B external-original image in the second response belongs to the wrong returned card; it does not establish that all Japanese cards use external artwork.

The set-number path removed leading zeros then compared against unnormalized stored numbers. After missing the exact set it tried additional strategies and could return an unrelated set's matching number. The repair reuses the deployed `api.catalogue_card_collectors` normalized identity view, applies set and language filters before the bounded limit, then hydrates matching variant identities only. Recognized explicit set-number queries stop after that lookup, including honest no-match results. The existing fallback path also retains a supplied padded number. No migration, price, holding, metadata or rights change is required.

Local validation passed: API v1 integration, the personal-loading regression group, the existing 12-case five-language fixture benchmark and backend type checking. Added controls cover padded/unpadded/fullwidth/hyphenated numbers, wrong-set siblings, no match in a known set, selected-set isolation and indexed SVAM GRA matching. Fixture benchmark timings are not production speed measurements. Scoped lint had zero errors and one pre-existing import warning.

## Verified production delivery at 20:44 UTC

[PR301](https://github.com/tberridge86/Stackr/pull/301) passed all eight applicable checks; the separate release-candidate gate was skipped by its existing condition. It merged as 3bbff56bf94f23b003901ad565dd4d4ea61f00d0. The earlier waiting backend run 36985046706 was [cancelled before deployment](evidence/retrieval-20261002/superseded-backend-cancelled.json). One replacement [protected production run 37061882832](https://github.com/tberridge86/Stackr/actions/runs/37061882832) was approved using the owner's explicit authorization and completed successfully. No approval setting was changed.

[Railway deployment receipt](evidence/retrieval-20261002/japanese-backend-deployment.json): 2d0ad3f2-9e79-4dcb-8ef7-c60bb5b7425b, source 3bbff56bf94f23b003901ad565dd4d4ea61f00d0. The workflow re-ran release checks, preserved the prior rollback target, and [verified runtime/source identity and access controls](evidence/retrieval-20261002/japanese-backend-smoke.json). Anonymous pricing requests correctly remained unauthorized; authenticated owner prices were not validated by this smoke run. No native build, OTA, gateway configuration or database migration was published.

[Live API verification](evidence/retrieval-20261002/japanese-live-verification.json), Windows desktop Node HTTP client, 20:44 UTC on 2 October:

| Search | Before: first observed | After: first observed | After: four repeats | Exact identity |
| --- | ---: | ---: | ---: | --- |
| M5 002 (ja) | 6,783 ms; wrong set | 2,607 ms | 61–66 ms | Correct M5 #002 |
| SV4a 001 (ja) | 2,247 ms; wrong set | 772 ms | 63–71 ms | Correct SV4a #001 |
| SV2a 157 (ja) | 346 ms | 497 ms | 56–64 ms | Correct SV2a #157 |
| base1 4 (en) | 406 ms | 457 ms | 53–73 ms | Correct Base Set #4 |
| SVAM GRA (zh-tw) | Earlier empty result | 458 ms | 59–72 ms | Correct Grass Energy |

All 25/25 positive responses had the expected top-one printing, set and language. The separate M5 99999999 negative control correctly returned zero results. First-observed responses reported DYNAMIC and repeats HIT; shared production caches were not reset. Four repeats per case and five unique cases are diagnostic observations, not a population p95/SLA or phone-performance claim. The non-padded controls did not improve on this small first-request sample.

A [bounded follow-up](evidence/retrieval-20261002/japanese-followup.json) returned correct identities for m5 0002 (1,293 ms), SV4a 1 (589 ms) and M5-002 (452 ms); direct card reads took 1,044 ms for M5 #002 and 413 ms for SV4a #001. All five reported DYNAMIC. First-load latency above 0.5 seconds therefore remains a real exception, despite fast cached repeats and repaired wrong-set fallback. End-to-end internal latency attribution remains unmeasured; do not infer a provider/database/network split from these requests.

The [read-only database plan](evidence/retrieval-20261002/japanese-query-plan.json) independently confirms the M5 normalized-number lookup uses the existing card_printings_collector_normalized_base_lookup_idx, constrained by number and set. This one SQL-connector observation used 149.823 ms planning and 11.731 ms execution; it is not an API service-role timing or a claim that the entire database is optimally designed. No schema/index change was needed for the demonstrated correctness repair.

Remaining acceptance: the installed phone's build/OTA identity, network and search/binder/card first-render timings are still unavailable. The browser preview used earlier is not phone evidence. Catalogue/checklist/logo/pricing exceptions above remain separate and unchanged. All repaired active image bytes/associations and search cases are verified; universal artwork completeness and universal sub-0.5-second retrieval are not claimed.
