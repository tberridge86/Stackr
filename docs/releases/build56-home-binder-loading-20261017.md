# Build 56 Home and binder loading repair

The owner reports smooth launch and instant binder covers, followed by Home collection/value remaining in loading, missing binder values, inconsistent Sync/percentage labels without quantities, and no binder contents opening. This is physical-device feedback in the build 56 release conversation; the installed build number and network trace have not been separately captured.

Baseline: `fe283dbd080372cfd740fec330200f0f402ab6bd`, released app 1.0.6 / native 56 / runtime 1.0.6. Repair branch: `codex/build56-home-binder-loading-20261017`. Work uses the clean readiness integration checkout, preserving the unrelated dirty original checkout.

## Demonstrated causes

- The installed Supabase SDK can hold its auth lock while `getUser()` waits indefinitely for HTTP. A local real-SDK/mocked-HTTP reproduction shows subsequent `getSession()` and binder database requests never dispatch until that request settles. Screen-only timeouts do not release this lock. This is a structural reproduction consistent with the symptoms, not proof of the owner's precise network failure.
- Binder library factual counts and prices previously started only after optional catalogue branding. Counts also waited for prices. A slow optional service could therefore leave covers visible with no useful collection details.
- Required canonical set facts had no deadline during set resolution/metadata, before the complete-set reader's own bounded network lane. A stuck promise could prevent retry and binder contents from settling.
- The library displayed a percentage without an owned quantity. Its saved binder-card query also relied on the default row limit rather than complete pagination.

## Repair scope

Bound underlying same-origin Supabase account/private GET/HEAD reads, including response-body reads, and token-renewal attempts so stalled requests can release the SDK lock. Ordinary collection writes, password/sign-up calls, storage and unrelated hosts retain their existing transport. Preserve real access-denial responses and local sessions on transient transport failures.

Start binder summaries from saved binder rows before optional branding; publish factual owned quantities independently of stored-price retrieval. Paginate binder-card reads, bound optional metadata, retain honest unavailable/partial price labels, and offer retry after failed reads. Give Home and binder detail essential reads a deadline and keep account-generation checks around all late results. Bound canonical facts without treating a timeout as an empty or complete set.

No provider refresh, catalogue/database mutation, deployment, OTA update or native build is part of local validation. This repair does not establish new price coverage or fabricate missing prices. Token renewal may retry several bounded attempts under the installed SDK's own policy, so a single 10s attempt is not a whole-screen timing guarantee.

## Validation and delivery

Local validation passed on 17 October 2026:

- `npm run typecheck` passed on the final corrected implementation.
- `npm run lint` passed with no errors and eight pre-existing warnings in unrelated app/components. Scoped ESLint over the changed TypeScript files also passed with no errors; pre-existing feature/helper warnings remain.
- `npm run test:startup-loading` passed, including Home runtime, account/session isolation and the mobile cache group. `npm run test:collection-loading` passed, including real-SDK/mocked-HTTP lock recovery, body cancellation, canonical facts deadlines, paginated collection rows and the actual library screen.
- `npm run test:binder-retrieval` passed. The final `scripts/test-binder-reopen.mjs` run passed 22 checks, including a real file-backed SQLite reopen/rollback, uncached auth timeout/retry, saved-view preservation and deferred/superseded auth events.
- `npm run test:binder-catalogue` and `npm run test:home-release` passed. Focused saved-library and unpriced-binder checks passed.
- Final library runtime fixtures cover 1,702 saved rows, optional metadata failure, account A/B late results, quantities visible before prices, retry after a price timeout, and a positive canonical master set with two owned finishes out of 204.

Independent read-only source review found two introduced issues before publication: separately aged price caches could reuse an old quantity, and parallel master catalogue/ownership results were swapped. The final code keys prices by a SHA256 signature of exact inputs and binder allocation, and correctly aligns the results. Both corrections passed independently: quantity 3 to 4 changes the fixture value from £21 to £28 despite a still-fresh previous price cache; canonical master ownership is 2/204. No remaining actionable issue was found in the reviewed diff. Test-owned ignored scratch databases/reports are local validation only.

Prepared, tested and reviewed: **yes**. Merged, deployed and verified on iPhone: **no**. The installed phone remains on the existing release until a separately authorised delivery. Device acceptance remains open for repeat Home focus, official/custom binder opening, counts, values and account transitions. No live owner account contents or price coverage were inspected. Hosted CI is separate from these local results.

Rollback for a future authorised app delivery: retain the previous release and revert only this repair's source changes; no database migration or data rollback is required.

## References

[Supabase account API hang guidance](https://supabase.com/docs/guides/troubleshooting/why-is-my-supabase-api-call-not-returning-PGzXw0), [auth-event callback guidance](https://supabase.com/docs/reference/javascript/auth-onauthstatechange). Current Supabase changelog inspected 17 October 2026: no dependency upgrade is included.
