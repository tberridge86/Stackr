# Build 60 retrieval integration - 23 October 2026

The 22 October retrieval batch was locally complete but had never reached main.
This candidate brings it onto main `7e22cee8d94f2904c3c2cfcf2c0e28da74eabdcc`,
alongside the later approved-original fallback, price-source selection and
branded Showcase repairs. It does not establish installed-phone acceptance.

## Source preservation and integration

- Original repair: `8c40cc06a`, preserved on `repair/build60-feedback-20261022`.
- Current branch: `agent/release/retrieval-integration-20261023` in
  `D:/Stackr-1/.tmp-build60-20261022/repair`.
- Git transport was unavailable. The GitHub connector supplied current-main
  files and signed commit data. The complete baseline tree independently matched
  `c63f8af7a34821585c62959f5c69ed87d3523aa8`; reconstructed commit bytes matched
  the real main SHA above. The candidate has real main as its parent, rather
  than pushing the earlier artificial snapshot ancestry.
- PR435's InteractiveCardPreview, haptics and sensor/lifetime regressions remain
  unchanged. The viewer adds only original-detail preservation. The obsolete
  touch-only change and lighting-unavailable wording were not carried forward.
- Exact variant/finish/edition selection, unified Showcase entry points and
  collapsed optional card-detail panels remain in the retrieval batch.
- CI now invokes the complete Build60 aggregate in place of its already-included
  feedback-recovery and card-inspection calls, so new regressions run in CI.

## Local validation

- Root typecheck and backend typecheck passed.
- Lint passed: zero errors, eight existing warnings in unrelated files.
- Gateway: 56/56 tests passed.
- Retrieval transport/runtime, optional assets, exact saved-binder recovery,
  price-history/account recovery, daily SQL/service/route and translated search
  checks passed inside `test:build60-feedback`.
- That initial aggregate stopped at the obsolete `Inspect card` label assertion.
  The assertion now matches the actual `Open Showcase` action. The full remaining
  `test:card-inspection` aggregate then passed, including 67 stage checks and
  existing exact-material CPU/WASM checks. Native GPU/haptics were not measured.
- New upstream foreign-artwork component fallback test and all seven normal
  price-source selection tests passed against the integrated candidate.
- Independent read-only review of the diff against main found no actionable
  correctness, privacy or identity regression in retrieval, daily history or
  the preserved Showcase integration.
- CI YAML parsing and aggregate wiring checks passed; `git diff --check` passed.
- Regenerated API types match the committed contract; 43/43 OpenAPI routes pass.
  The wrapper's checkout-local CLI path was absent, so the same installed
  root OpenAPI CLI was invoked directly and its output compared exactly.

## Delivery state and next release gates

Build 60 source remains `311fc84a95de4c730b61473f891079547d1a9b6f`; the newer app
repairs require app delivery. All 23 original phone criteria remain open.
This session performed no backend/gateway deployment, native/OTA publication,
provider refresh, remote database write or catalogue mutation.

The daily-history migration `20261022064554_catalogue_daily_market_movers.sql`
remains unapplied. Coordinate its rollout with backend and gateway before the
new app's daily-scope request. Genuine consecutive provider dates are required;
no historical movement is fabricated. Fresh pricing and authenticated readback
remain open after source PR430; selecting a newer stale quote is not a refresh.

The 71 Japanese printing fronts are already published. The
[PR433 publication receipt](https://github.com/tberridge86/Stackr/pull/433#issuecomment-6358813152)
records successful run `39911999260`, 71 assets/links and 284 verified objects,
with rollback retained. Do not republish this batch to address latency. Its
three-card sample recovered 3/3 through manifests but had only 2/3 inline images.
JA web1/001 `9391a7cd-5a08-4140-a641-c70e4ec7d58a` took 10,650.53 ms on a single
card GET and lacked inline artwork (request
`3fdea6ae-af94-4eea-b814-4747862f2353`). This is an investigation target, not a
measured cause or p95 result. Phone rendering remains unverified; 43 first-edition
VS fronts and seven canonical corrections remain outside the published batch.

Before native release: confirm current production backend/gateway revision,
rehearse/apply the coordinated daily-history migration through the existing
release lane, verify fresh exact price/source dates, and recheck bounded cold/warm
card/manifest/image reads including the web1 sample. Then verify Home, saved
Fusion Strike/Storm binders, unified Showcase and catalogue movers on the phone.
Earlier exact artwork/source/edition holds remain in the original repair report.
