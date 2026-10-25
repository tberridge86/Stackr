# Build 60 feedback repairs — 22 October 2026

Integration update: [23 October continuation](retrieval-integration-20261023.md)
supersedes the older checkout and motion/lighting handoff below. The retrieval
batch is now rebased onto actual main `7e22cee8`, preserving PR435's combined
sensor/drag motion, branded studio light and lifetime-safe haptic controls.
The original commit and its local test evidence remain preserved.

Local implementation and regression checks are complete. No issue is closed as
verified on the installed phone. No deployment, native publication, database
migration, provider refresh or catalogue mutation was performed for this batch.

## Source and native reconciliation

- Owner video: `WhatsApp Video 2026-10-21 at 18.57.00.mp4`, 32,310,870 bytes,
  576×1024, 266.918333 seconds.
- SHA-256: `8824e4b96ad77f7417b2e732f9b980f6e9d340990af462f7ef48c0cb7c6cfd0a`.
- The Expo receipt inspected on 22 October shows successful production iOS
  version **1.0.6 (60)**, commit
  `311fc84a95de4c730b61473f891079547d1a9b6f`, fingerprint
  `2c0656f260a23d3858078b1b058a8440b3301ba6`.
  [Native build receipt](https://expo.dev/accounts/tommo86/projects/Stackr/builds/23565784-9fa5-4f9c-ae48-2376756891fb).
- GitHub compare from that commit to current main
  `2172db553ef8cc717ac4a65872a7be163243ffdf` is eight commits ahead and zero
  behind. Its 18 changed files concern reports and scripts; app components,
  runtime libraries and backend request handlers are unchanged. Earlier
  retrieval, icon, translation, logo and pricing runtime repairs were therefore
  already present in Build 60's source. Source inclusion does not establish
  successful API delivery, TestFlight installation or phone acceptance.
- The working repair branch is `repair/build60-feedback-20261022` in the isolated
  checkout `D:/Stackr-1/.tmp-build60-20261022/repair`. The original dirty checkout
  was preserved. Local baseline `bdad4ea26` snapshots current upstream source on
  the available local history; it is not an ancestor commit on remote main.
  Integrate the subsequent repair commit by cherry-picking onto current main;
  do not push this snapshot ancestry over main.

## Observed video evidence

These are inspected frames from the supplied video, not a complete timed
interaction study or a reliable audio transcript. Timing is approximate.

| Time | Visible evidence |
| --- | --- |
| 00:08 | White Stackr splash remains visible. |
| 00:27–00:29 | Fusion Strike saved binder has its header logo but visible tiles say “No image”; checking updates/read-only ownership state and valuation pending are visible. |
| 00:45 | Shelmet, Fusion Strike #13, opens a large blank card surface above the binder's Card Details panel. |
| 01:28 | Japanese Storm Emeralda saved binder has blank card tiles and absent header branding while ownership remains unconfirmed. |
| 02:08 | Binder loading screen remains visible. |
| 03:01 | Japanese Discover Sets shows some promotional-set logos successfully. Missing logos are not universal. |
| 03:52 | Home is visible; frame is blurred, so exact card identity is not asserted. |

Haptic strength, smoothness, cold/warm latency and exact installed update cannot
be established from these frames. The owner's broader feedback remains accepted
input, distinct from the specific observations above.

## Changes and acceptance status

| Area | Local change | Still needs delivery evidence |
| --- | --- | --- |
| Navigation/Home and artwork | Expo Image now shares the URI cache keys used by prefetch. Stale image callbacks are ignored. Completed manifest pages survive later optional failures. Full Showcase images preserve original detail. Existing progressive Home reads remain intact and were retested. | Phone cold/warm navigation and Home timing; exact missing Home printing and API image bytes. No measured speedup is claimed. |
| Saved set thumbnails | Saved catalogue version drift no longer rejects an otherwise exact current approved image. Preferred pages stream before whole-set facts; UUID, set, language, collector number, variant, finish and artwork bindings must match. Only image presentation changes; saved facts, quantities, ownership and version remain intact. | Reopen the same saved Fusion Strike/Storm binders against the configured API; verify actual thumbnails and identity. |
| Set logos | Saved preview branding hydrates independently of pending auth/ownership, with account and request guards. | Exact saved-header logos on phone; missing source assets remain absent. No logo acquisition/publication happened. |
| Showcase/haptics | Card detail and scan artwork open the shared Showcase; competing tilt surfaces were removed from detail, binder and profile previews. Showcase uses one touch-driven motion path. Drag feedback expires on close/pause/reset/background and obeys stored preferences. Explicit unresolved finish/edition cannot fall back to a default material or be labelled non-foil. | Actual iPhone gesture, accessibility, haptic and dismissal behaviour. Binder management/details and graded-condition surfaces remain functional screens. |
| Lighting | Missing reviewed material remains clearly unavailable. | Production material registry contains zero reviewed packs. Exact physical-printing evidence and approved material maps are required; generic fabricated foil was not substituted. |
| Search | NFKC/whitespace normalization stays consistent in the client. Ordinary two-to-six distinct name tokens match in either order, with every token required on one published name row. Existing aliases, translated/native names, set/language constraints and exact-identity priority remain. | Phone queries and production query latency. Typo/edit-distance correction is not implemented. Client normalization alone was not proven to cause the video failure. |
| Prices | Forced price reads now bypass the persisted exact-price cache. Stored price remains visible while optional evidence panels are collapsed. | Actual provider coverage/freshness and configured API readback. A forced stored read does not create a missing quote or refresh a provider. |
| Card details | Repeated pricing panels and long card facts expand through working controls; extra pricing components do not mount until requested. Selection changes collapse them again. | Phone layout/interaction acceptance. |
| Daily catalogue movers | Explicit catalogue-daily API scope ranks the whole supported published catalogue globally by cash or percentage before limiting. It returns coverage of unsupported/unquoted/stale/insufficient-history variants. Switching ranking modes cannot retain a differently ranked sample under a new label. | Approved migration activation, actual consecutive provider dates, API deployment and phone verification. It is not yet available live. |

## Retrieval sweep and production readback

The follow-up sweep fixes shared request failures, with actual client/adapter
and installed Supabase SDK regressions:

- A pending card promise previously had no expiry. A stalled request could stay
  cached forever, so Retry rejoined it. The existing seven-second catalogue
  deadline now owns and aborts the transport, removes failed pending entries,
  and rejects late responses from an older request after a successful retry.
- Every remote request previously waited for device AsyncStorage before fetch.
  Explicitly public catalogue reads now wait at most 25 ms for optional device
  identity. Private or authorization-bearing requests retain required identity
  and fail closed after ten seconds. Cancellation is checked before bootstrap,
  dispatch, cache replay and completed JSON. Preview/HTTPS/account guards remain.
- Only an actual 404 permits a canonical UUID to fall back to exact variant
  search. Authentication, rate-limit and backend failures retain their error
  instead of starting a second read and turning failure into an empty result.
- The fallback set-card service now honours `includeAssets=false`. Requested
  artwork uses the same bounded 500 ms enrichment as detail/search: an optional
  failure cannot erase usable card facts. Parent cancellation and essential
  facts errors still fail.
- The gateway now forwards the daily movers scope/ranking parameters, with
  bounded validation. Without this change the app request would receive a
  gateway 400 before reaching the repaired backend. Owner authentication,
  disabled-pricing gates and private cache rules are preserved.

[Read-only API receipts](build60-retrieval-readback-20261022.json) record exact
paths, request IDs and server timestamps for the configured production gateway.
Fusion Strike returned approved images for all 89 cards on the inspected page;
its Shelmet #13 exact search returned both variants with images. An owned
Caterpie original actually loaded at 600x825. Fusion Strike and Storm Emeralda
both returned approved set logos. Storm Emeralda returned approved image
metadata for 96/96 cards on its inspected page.

However, the first Japanese card's official image URL actually rendered a
**503 maintenance page**. The exact Heracross printing's manifest contained only
that external URL, no derivatives and no owned alternative. This is a concrete
origin-delivery blocker even though API metadata says approved. No substitute
identity, unlicensed mirror or catalogue publication was invented. Restore the
origin or publish an independently verified approved replacement before marking
that exact card delivered. These samples do not establish whole-catalogue
coverage, image availability on 21 October, or phone timing.

## Daily history rollout and rollback

`supabase/migrations/20261022064554_catalogue_daily_market_movers.sql` is local and
unapplied. It captures immutable OLD/NEW guide receipts on subsequent writes,
retaining source identity, timestamp and FX evidence. It compares consecutive
UTC provider dates only; same-day revisions, missing days, stale/future quotes,
remapped identities and mismatched FX do not create daily movement. There is no
fabricated backfill and no new worker schedule. Exact supported TCGCSV variant
quotes are used; unsupported catalogue languages/finishes remain in coverage.

The existing endpoint without `scope=catalogue_daily` remains compatible. The
new app request fails explicitly if daily history is unavailable; it does not
silently show the older latest-two-estimate sample as daily data. Stage the
migration and backend before the native change. Retain at least two actual
consecutive source dates and verify both ranking modes and coverage through the
configured app API. Operations require the existing explicit release approval.

Application rollback is the inverse of the repair commit. If database capture
is activated later, preserve its immutable history; a reviewed forward migration
may disable the capture trigger without deleting source receipts. Do not replay
or remove historical migrations as rollback.

## Validation

- `npm run typecheck`: passed.
- `npm run lint`: passed, eight pre-existing warnings in unchanged files.
- `npm run typecheck:backend`: passed.
- `npm run test:retrieval-sweep`: passed; full client/adapter storage and retry
  runtime, 8 SDK fallback/version tests, HTTPS, cache, optional enrichment and
  preview-proxy boundaries. Native logger warnings are test-harness warnings.
- `npm --prefix gateway test`: all 56 tests passed, including real request
  handling for both daily ranking modes and preserved owner/private controls.
- `npm run generate:api-contract`: generated contract updated.
- `npm run test:build60-feedback`: passed; actual SQL/service/route, daily
  transform, image/cache/manifest, saved-artwork, account/Retry, search and
  Showcase/haptic tests. SQL fixture covers 235 identities and global tails.
- Final reordered-word actual service test passed after its change.
- Home progressive startup runtime, uncached Card Detail runtime, optional
  enrichment, image identity reassignment and preferred set-logo checks passed.
- Binder reopen: 56 cases including real local SQLite reopen/rollback passed.
- The exact-price cache regression failed before the one-line force-forwarding
  fix and passed after it.
- Full legacy market-pricing route suite cannot open loopback in this sandbox
  (`EACCES`). Its non-socket assertions passed in an ephemeral copy; the new daily
  test executes the actual route handler without a socket. Hosted HTTP checks
  remain required.
- `node scripts/test-stackr-api-v1.mjs`: service assertions, including paginated
  optional assets, passed before its HTTP section hit the same loopback `EACCES`.
  Old query mocks now implement SDK abort signals and assert preservation of
  facts on optional asset failures. This full HTTP suite is not claimed passed.
  The existing public-catalogue cancellation HTTP suite is blocked likewise.
- Independent read-only review found and prompted fixes for ranking-mode
  mismatch, unknown-finish disclosure and delayed haptic expiry. Final review
  reported no remaining actionable findings. Native hardware boundaries are
  mocked; Skia checks use CPU/WASM, not the iPhone GPU.
- Independent retrieval review found the gateway scope gap and re-reviewed its
  fix. Actual client runtime, backend SDK fallback and daily gateway handler
  checks passed independently; no remaining actionable findings were reported.

## Preserved open release work

Keep all 23 original issues in `video-repair-register-20261018.json` open until
their installed-device journeys pass. The older release evidence retains
unresolved provider timeout/coverage, exact Home Varoom identity, JA web1 #024,
ordinary EN base1 #42, remaining Pikachu/listing imagery and held SVP1 publication.
This repair neither consumes nor silently drops those batches. Before TestFlight,
reconcile each pending artwork batch with immutable source, rights/identity,
supersession/rollback receipt and actual API/app image response. No standing
artwork approval supplies missing source licence or edition evidence.
