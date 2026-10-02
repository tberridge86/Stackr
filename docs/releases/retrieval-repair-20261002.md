# Retrieval repairs — 2 October 2026

Implemented and locally verified; production publication and physical iPhone acceptance pending.
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

Publish through normal GitHub checks; run backend_only for the search fix and retrieval_assets for the images, sequentially. Independently verify deployed SVAM GRA identity, nine new cache headers and all three M5 sizes, then save receipts here. Phone search failure beyond the reproduced preview defect remains unverified until the actual installation is checked.

Separate backlog unchanged: 2,908 artwork cases, 94 missing checklists, SV4a missing 40 cards, logo gaps, pricing/valuation exceptions and device acceptance. Native97 stays held after its third HTTP429; this repair does not retry it.
