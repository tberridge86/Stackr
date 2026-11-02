# Core Home and binder retrieval — 2 November 2026

Baseline: verified main `832eba78ad8bbdd8dea1d358b811f2c11bc3f013`. Implementation lives in the isolated current-source workspace; the older dirty checkout was preserved. This report covers the performance specialist's owned changes only.

## Findings and repairs

The former Home route imported HubScreen, whose startup included opportunities, activity, Minty and broad saved-collection loading. The new route imports a small CoreHomeScreen directly. It displays collection counts and six saved binder names, with Search, View all binders, Create binder and sign-in actions. It imports no Hub, Market, Minty, social, scanner, achievements or provider service.

Home uses the existing compact collection RPC and a private binder query selecting five columns, filtered by user and limited to six rows. Account-keyed memory facts publish synchronously. An optional existing disk overview can supply a preview; it cannot block either live read or replace a fresh result or an access-denied result. The preview has its own query key and cannot truncate the complete library cache. Memory hits skip redundant disk reads.

Summary and binder requests settle independently. Existing account-generation and collection-revision guards protect both the cache fill and view publication, including sign-out/sign-in to the same account. Optional view disposal does not cancel another same-account subscriber's shared query. Missing compact RPC or transport failure stays explicit; Home does not fall back to a complete private-card scan. Existing compact-summary master preferences remain part of its accuracy contract and are bounded by the existing timeout.

The binder library previously awaited all custom-cover storage reads before returning its saved-row overview. It now returns rows first, then resolves custom covers with at most four concurrent reads under the existing optional-read deadline. Results merge with the current account/request's cache, retaining any independently refreshed catalogue branding. Core mode stops started-binder prefetch and price loading; ownership/completion facts and approved set branding remain available.

Binder detail uses the optional trade context because the core shell does not mount TradeProvider. Core mode stops visible-quote loading, catalogue quote decoration, prepared-valuation polling, modal provider lookups, showcase reads and achievement work. Scanner/public-sharing/Chase/market/value controls are hidden while card ownership, quantity/condition/grading edits, manual additions, custom removal, master-set selection, approved artwork recovery and inspection remain. Optional pricing, achievement and market modules are loaded only by their enabled paths. Existing private collection history tied to saved ownership is retained.

## Validation

`node scripts/test-core-home-data.mjs` passes 42 scenarios against the actual data module and extracted actual binder callbacks, using simulated transport and the real React Query cache:

- Two simultaneous Home readers issue one compact RPC and one six-row binder query.
- Memory paints before asynchronous work; a hung optional store/summary preference cannot delay live binders.
- Delayed summary and delayed binder cases each allow the other section to publish.
- Late disk responses cannot restore deleted/empty or denied binder results.
- Account A → B → A, deferred account capture, and in-flight collection invalidation prevent stale results/cache fills.
- Missing RPC, wrong-account rows, oversized previews and hung reads produce explicit errors/retry state.
- Cold library rows resolve without a custom-art storage read; core ownership facts remain while price calls are zero.
- Actual disabled modal/showcase/valuation/achievement callbacks return before their dependencies, and custom-binder removal remains available.
- Pending or failed authentication cannot start private Home reads, even if a residual user object exists. Home offers an explicit sign-in-check retry.
- The normal Binder library also rejects residual users during pending/failed verification. It hides private cached rows/counts and edit controls, and rechecks an open delete dialog or drag completion before writing. The explicit, unexpired saved-session read-only path remains separate.
- Binder Detail's existing independent server `getUser` and permission gate is exercised directly: pending, denied, anonymous and mismatched-owner responses cannot reach saved-card reads. Cached previews and incomplete ownership remain read-only. No Detail auth implementation change was needed.
- Home restores the existing offline entry after an asynchronous, account/runtime-validated disk snapshot check. The View saved binders callback rechecks user, expiry and session epoch before routing to explicit read-only mode. Absent/foreign snapshots, late proof, expiry, account/epoch changes and normal verified mode cannot enable the fallback. This proof never blocks Home or public navigation.

The artwork/translation specialist independently reviewed the final Home/Binder delta and reran all 42 scenarios successfully. Review covered manual additions, custom removal, ownership/quantity edits, exact-variant inspection, deferred custom artwork, disabled readers, the repaired Binder auth boundary and the proved offline entry. No actionable finding remained in this bounded delta. This specialist independently reran the saved-card alias regression and existing saved-binder artwork regression after review corrections; both pass. Parent integration checks are recorded separately.

The existing `test-binder-library-value-recovery.ts` passes with all legacy assertions retained; its isolated harness now declares non-core mode and injects the existing price mock through the deferred module boundary. `test-binder-library-progress-runtime.ts` similarly declares non-core mode and passes after the parent restored the declared renderer dependency. The earlier local missing-package limitation is resolved. No production behavior was weakened to satisfy either harness.

The requested standalone `test-startup-loading.ts`, `test-startup-phases.ts` and exact-baseline `test-home-startup-runtime.ts` also pass. They retain coverage of existing startup and legacy Home behavior; the new core Home behavior is covered by the 42-scenario suite above. Renderer deprecation messages and simulated failure logs are expected test output.

These are local module tests, not live authenticated app or phone timing measurements. No device-speed number is asserted. Parent owns full typecheck/lint/CI and release decisions. No remote data mutation, deployment or build was triggered by this work.

## Scope limits

Full binder detail still loads the complete saved catalogue needed for the existing binder behavior; this change does not claim server-side paging or eliminate necessary ownership reads. The initial binder library can appear before completion facts and cover enrichment settle. Unavailable translations or images remain explicit unless exact current approved metadata supplies them. Actual TestFlight navigation, offline behavior, image rendering and device latency remain acceptance checks.

The unchanged ownership-save helper can still refresh stored snapshot prices when marking a card owned. The disabled price-reader claim applies to core screen loading and optional panels, not every existing save helper.

