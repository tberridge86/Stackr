# Home cold payload candidate — 26 October 2026

This is a focused successor to merged PR #439, using runtime baseline b5d643a997041db2a8c42b5b6cb0180e8ddf28e7. The deployed app remains Build 1.0.6 (61). This candidate has not been merged, deployed, distributed or accepted on a phone.

## Change and practical effect

Home now requests the 20 saved-card fields consumed by its display, ownership/pricing-input construction and existing read-only binder reopen snapshot. It no longer downloads the four stored price fields that the existing cache immediately replaces with null. It also excludes six unused production metadata fields and future arbitrary columns from this private display read.

Identity, language, API aliases, notes, slot order, creation time, ownership quantity, condition and grading fields remain. Every page is read, including the empty exhaustion page. The existing 500-row request size, lower-server-cap handling, owner checks, independent saved/owned reads and separate prepared valuation are unchanged.

The six omitted metadata fields are cert_number, slab_image_url, graded_value, graded_at, owned_card_variant_id and lifecycle_version. Current Home consumers do not read them; the existing binderReopenSnapshot whitelist already excludes them. Export and listing consumers use their own reads. Tests compare the actual final custom-binder snapshot before/after using populated 30-column rows, rather than pretending every old wildcard property remains.

Legacy schemas can omit language, grade_company or grade. Only an exact named missing-column error (42703/PGRST204) before any successful saved page permits a retry, removing just that field. There are at most three compatibility retries. Unknown-column, permission, session, network and later-page failures do not fall back to a wildcard or publish partial data.

## Matched measurements

Offline actual-module fixture, Node/Windows environment recorded in measurements.json; uncompressed response-array JSON bytes, excluding headers, authentication traffic, valuation, catalogue enrichment, images and rendering. Counts are Data API facts reads, not every Home request. The source baseline is the current b5d643a implementation, already using 500-row pages.

| Cohort | Saved / owned rows | Reads before -> after | JSON bytes before -> after |
| --- | --- | --- | --- |
| Original 24-column large fixture | 1,702 / 1,323 | 11 -> 11 | 1,256,922 -> 1,080,420 |
| Populated 30-column large fixture | 1,702 / 1,323 | 11 -> 11 | 1,743,771 -> 1,080,420 |
| Small, populated 30-column fixture | 8 / 6 | 6 -> 6 | 8,573 -> 5,531 |
| Empty | 0 / 0 | 2 -> 2 | 4 -> 4 |
| Five languages, same collector number | 5 / 5 | 6 -> 6 | 6,846 -> 4,939 |

The directly comparable original large fixture saves 176,502 bytes (14.04%). The larger saving in the 30-column fixture depends on deliberately populated synthetic metadata; it is not a measured customer payload. Immediate warm reads remain zero. Explicit refresh and expiry reload complete projected results. Server caps 500/100/50/17 retain complete results; this change does not claim fewer requests at any cap.

Five matching samples per cohort use a fixed artificial 50 ms delay per Data API read. Original-large complete-facts medians were 432.64 -> 452.01 ms cold and 3.54 -> 3.69 ms warm. Other raw samples are retained. The harness also constructs projected response objects, so these are synthetic host timings, not database, hosted API or phone timings. No latency improvement is claimed.

Local in-memory PostgreSQL/PGlite executes representative before/after plans with 10,000 foreign rows. The large saved-card comparison returns 1,702 rows in five analyzed pages in each variant; each analyzed page also has a separate verification SELECT. Synthetic saved-query JSON falls from 1,361,298 to 855,804 bytes and estimated row width from 388 to 239. Plans include estimated and actual rows; foreign-account exclusion passes. These are a separate fixture, not the client payload table above. No index or schema change is justified or included.

## Actual Home dependency trace and remaining work

- Focus and initial-session events converge on one startup guard. Account-scoped persisted preview and fresh collection retrieval start independently.
- Hub validates the user, then saved binders/cards and owned variants overlap. The facts harness records 18 getSession calls and one getUser call for the large fixture. SDK calls are not equated with HTTP requests; getSession can refresh an expired session.
- Saved binders precede their saved-card pages. Complete facts precede local master-set/name-art settings and authenticated publication of counts, active-binder and duplicate/missing-card summaries.
- Prepared collection valuation is requested after those facts; further user confirmations occur before state changes. The prepared result includes coverage/trend information but does not replace saved placements, unowned preview cards or duplicate construction. A missing/lower-coverage prepared result follows the existing exact stored-price fallback. That broader path is not newly optimized here.
- Active-binder catalogue/branding enrichment loads separately after useful facts. Bounded binder preloading reuses the complete nonprice custom rows. Optional enrichment still has its own retrieval costs.
- General content, chase cards, activity and Minty work start after interactions plus 180 ms, outside the mandatory facts chain. Metadata/price enrichment and image downloads are additional work, not included in these byte counts.
- Return navigation reuses the existing 30-second facts cache. Edits bump the collection revision; refresh forces a new generation. Logout/account changes abort and invalidate leases. Existing persisted Home content survives transient failures with stale/coverage messaging.

No new cache, invalidation mechanism or auth shortcut was needed. Relevant lifecycle regressions and independent review assess the existing boundaries; this is not a claim that every cache in the application is qualified.

## Hosted state and access limits

Fresh health reads still attest backend prefix 7c1acd409680, deployment dfc23b30-9675-4ba0-ad2b-9f1875302747, production project oakdbbzdqwurpjnoqhmu. Gateway health is healthy but does not attest its Worker revision. Apple readback at 08:56:26Z confirms Build 61 VALID, not expired and available to existing Team (Expo).

Read-only production metadata confirms the 30-column saved-card schema and Profile ledger version 20261026072532. A zero-row anonymous GET using the exact new projection returns HTTP 200 and []; this proves column compatibility only. It does not establish authenticated pagination, collection completeness, latency or account isolation.

One managed QA account exists, but no designated QA login/token is configured in this session. No account credentials were reset or sessions manufactured. Authenticated Home cap, private before/after latency, real priced-printing coverage and first usable screen on an installed phone remain unverified. No new phone acceptance result was supplied or found in this task.

The Profile canonical migration 20261025154000 maps to generated ledger version 20261026072532. Do not replay it or run broad migration tooling before supported history reconciliation. Daily movers and unrelated migrations remain excluded.

## Validation, rollout and rollback

See evidence/home-payload-20261026/ for raw matched measurements, local executed plans, scoped hosted receipts, required checks and the independent review. The candidate changes one runtime file plus focused tests and measurement/evidence files. No backend/gateway/schema/asset changes or live jobs are included.

New mobile delivery requires approval for this candidate after qualification. Do not rebuild or resubmit Build 61 as an acceptance step. Before delivery, recheck current main and R2 coordination, exact-head CI, approved release source and compatible backend. Rollback is a scoped revert of the Home projection change or retention of the already distributed compatible Build 61; no database or asset rollback is required.

Next gates: exact-head CI and final release review; obtain designated-account hosted measurements; perform installed-device acceptance of complete counts/printing/pricing, account changes, edits/refresh, cancellation, offline/retry and legacy/R2/private images. Job reliability, monitoring, recovery drills and release-lane credential repair remain queued.

Original dirty checkouts and the clean Build 61 checkout were preserved. No R2 transfer, catalogue writer, media reference, immutable original or rollback receipt was changed.

Required local validation: npm run typecheck passed after the query result was typed as the explicit projection and null prices were materialized before returning complete records. The initial failure receipt is retained. npm run lint passed with eight pre-existing warnings; scoped changed-file lint passed without warnings. Actual-module paired retrieval, focused saved collection, Home startup/offline/account recovery, owned pricing units, binder preload and binder reopen checks passed. No native build was run.

Prior deployed release evidence: https://github.com/tberridge86/Stackr/blob/178894a3ab0a617e9e7fe62000cd256613e19e76/docs/releases/controlled-rollout-handoff-20261025.md
