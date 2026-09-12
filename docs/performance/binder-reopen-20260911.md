# Saved binder reopening — 11 September 2026

Status: implemented and focused-tested on the existing draft PR #184, `perf/binder-first-paint`. Not merged, deployed, published as OTA, installed or physically device-verified by this task. No hosted database, backend, gateway, provider, pricing worker or commerce setting was changed.

## Source and evidence

Starting candidate: `2ee2d534bf64625aee60fef1eafbbc5aa810b34d`.

Integrated runtime: `3527ecc6d68d3d257f79fd8c511ae6af958f5731`.
Final runtime with full-identity refresh and truthful saved valuation guards: **`35a872198764857544df7c62451d8255529361bb`**.

[Run 34642465780](https://github.com/tberridge86/Stackr/actions/runs/34642465780) successfully applied the final guarded change, ran all focused checks and committed that exact source. Evidence artifact **10280607600**, `binder-reopen-validation`, contains the tested source SHA, SHA-256 hashes, the new test report and the existing parallel-loader report. The new report was observed at **2026-09-11T20:07:58.860Z**, with **17/17 passing cases**. These are source/SQLite functional tests, not real phone timings.

The temporary source-application workflow and patch scripts were removed. Existing read-only retrieval CI was extended in `44885d83a8ea58183ae77c049a87d08cd4e084ea` to run the new tests and retain evidence on subsequent committed-source checks. The final workflow has read-only repository permission, no source rewriting, no persisted checkout credentials and pinned actions. No canary run was requested in this task; earlier API timings remain historical evidence, not new results attributable to this change.

## What is implemented

### Reopen an eligible saved binder without waiting for the network

`lib/binderReopenSnapshot.ts` and `lib/binderReopenRuntime.ts` provide an owner-only, read-only materialized view of the last complete official binder. This is not a second canonical catalogue, a price cache or an authorization source. It stores the already-validated display and saved ownership information needed to reopen that view.

The screen starts the optional local preview read alongside the existing network authentication and binder reads. A local unexpired session selects the account namespace; it never grants a server read or write. A valid saved view may render while those network requests are pending. The screen clearly labels it as saved, shows its saved timestamp, and disables mutations until the required fresh ownership and catalogue checks complete.

This initial lane is deliberately limited to the owner's own official binder with a resolved canonical set, known count and complete identities. It does not add offline snapshots for other users' public/shared binders or custom binders. An expired or absent local session does not unlock a saved view.

### Keep the last complete view on failed or invalid refresh

Explicit refresh invalidates ordinary request/catalogue caches without discarding the saved read-only view. A five-minute public catalogue TTL expiring does not by itself remove that saved view. Network errors leave the last complete view visible, labelled as not refreshed. A 117-card refresh cannot replace a saved 124-card view. Full count is insufficient too: a wrong-language or mismatched canonical identity is rejected by the owner-view admission guard.

The replacement snapshot must pass owner, environment, binder, canonical set, language, unique identity count, default-variant membership and row-state checks. Partial, malformed, wrong-owner and future-dated snapshots are not admitted. Only a complete refreshed model can replace the saved model. A failed SQLite transaction rolls back rather than partially replacing the prior entry.

Explicit recognized access denial, sign-out, account changes and ordinary binder mutation invalidation remove access to saved views. Memory invalidation is immediate; disk clearing is queued and disk reads remain blocked until that clear succeeds. Generation checks prevent delayed reads or old writes from restoring invalidated state. A delayed older disk result cannot replace a newer in-memory entry or a completed network result.

### Bound storage and avoid misleading prices or provider persistence

The cache accepts at most eight binder snapshots, with an estimated 8 MiB memory budget, an 8 MiB retained SQLite payload budget and a 2 MiB per-entry limit. A snapshot is usable for less than 24 hours from its saved timestamp; this is a display/acceptance limit, not a claim of synchronous physical erasure at exactly 24 hours. Entries are evicted within each validated write transaction. The optional private view table is separate from the public catalogue table and is addressed by API/Supabase environment, account and binder.

Persistence uses a whitelist of scalar/string-array presentation and identity fields. Arbitrary provider payloads, credentials, price objects and transient controlled TCGdex images are excluded. Saved prices are intentionally not treated as live estimates; the cached header says **Pricing awaits refresh**, rather than displaying a fabricated zero valuation. Pricing and artwork retain their existing independent live enrichment paths.

### Measure visible content separately from editing readiness

`lib/performance.ts` now exposes `beginBinderRetrieval` and `getBinderRetrievalObservations`. A bounded device-local ring holds at most 32 aggregate observations without account, binder or card identifiers and without remote transmission.

The screen records three different stages:

- `modelReadyMs`: the first nonempty model is available to the screen, recording whether it is a saved preview or network result and whether catalogue completeness is established.
- `visibleContentMs`: FlatList reports a current row as viewable, configured at 50% item visibility. Stale row objects and cancelled loads cannot complete a newer observation.
- `ownershipEditableMs`: the ownership-ready state has committed and the screen is no longer read-only.

The clock starts at **screen load**, not the original navigation tap. FlatList viewability is a useful exposed-row signal, not proof of image decode, physical pixel paint, responsive interaction or completion of the entire viewport. These observations are instrumentation for the next device pass, not an already-achieved latency result. No native timings were invented from Node tests or a `setState` call.

## Validation performed

The successful final integration run passed:

- TypeScript typechecking.
- Existing `test:binder-catalogue` and `test:personal-loading` groups.
- Existing 12 first-paint/cache tests and 12 actual-loader/parallel-matching tests, retaining the previous assertions.
- New 17 reopening, refresh, isolation, timing and SQLite cases.

The new suite exercises the actual screen load callback extracted from TypeScript, with explicitly controlled network/storage promises. It proves read-only preview rendering before pending auth/ownership responses, partial and wrong-language refresh retention, complete network replacement, rejection of stale navigation/account results, cache retention limits, exclusion of credentials/prices/transient images, and separate timing events. These tests do not mount native React or operate an iPhone.

A real file-backed Node SQLite test executes the runtime adapter SQL, closes and reopens the database, checks account/environment separation, injects a write failure to verify rollback, verifies the eight-entry retention limit and checks clearing. This is stronger than an in-memory storage mock, but it is not Expo SQLite execution on iOS/Android.

## Still required before release

1. Run this exact candidate on a physical device and measure eligible warm reopen, persisted reopen, expired/failed refresh, complete refresh, account change and edit readiness. Include device, installed runtime, network/cache state, valid-card count, failures and all latency samples. Extend timing to the actual navigation tap for an end-to-end claim.
2. Verify the native SQLite adapter, application-level startup/auth routing, app restart, image decoding and cancellation. A cached mounted binder is not a claim that the whole app starts offline. Cache misses, evicted entries, snapshots older than the hard limit and absent/expired sessions still use the existing live loading path.
3. Revalidate the normal production gateway and initial uncached response path. The previously observed first-request spikes remain unresolved by this client change. Warm historical canary samples do not certify production or device performance.
4. Complete the broader Platform CI and release-owner integration checks. Focused tests do not override release checks or the existing draft hold.

The public per-set catalogue's existing TTL behaviour and the old scanner-wide cursor-only delta implementation are unchanged. This increment preserves a separate last-complete owner view during refresh; it does not claim to have completed global atomic catalogue delta sync, full image persistence or every-screen local-first retrieval. No threshold was loosened to declare the 500 ms goal achieved.
