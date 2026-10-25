# Coding implementation evidence — 2026-10-22

## Revision and scope

Work took place in `D:/Stackr-1/.tmp-build60-20261022/repair`, preserving the original dirty checkout and other specialists' changes. The source overlay came from remote main `2172db553ef8cc717ac4a65872a7be163243ffdf`; the local snapshot HEAD observed while recording this report was `bdad4ea26e4f8f7bf83fe3e108ca2e6cbd01c4e5`. Findings describe local repair changes, not a deployed release. Runtime fixtures ran on Windows with Node 24.15.0.

The bounded trace inspected `lib/config.ts`, `lib/stackrApiV1.ts`, `lib/stackrApiTransportPolicy.ts`, `lib/requestCache.ts`, `lib/stackrDomainAdapter.ts`, saved binder paths, and gateway route/validation contracts. This report covers the shared retrieval repairs and final gateway integration repair; the broader Build 60 work is recorded in [the release repair evidence](../../releases/build60-feedback-repairs-20261022.md).

## Reproduced defects and repairs

| Finding | Cause and bounded repair | Identity/account boundary |
| --- | --- | --- |
| P1: public retrieval blocked before network dispatch | Every remote request awaited device storage. A never-settling storage read or write held public sets, cards, assets and search. Explicit public catalogue routes now allow 25ms for an optional device ID, then dispatch without it; errors are optional too. | No replacement device ID is invented. Authenticated/private requests retain required device initialization and fail closed after 10 seconds. Gateway IP protection remains. |
| P1: timed-out card Retry reused the same pending request | Shared pending card cache entries had no deadline. They now settle after the existing seven-second catalogue budget, evict failures, and forward their owner AbortSignal through actual card/search transport. Late results cannot replace a successful retry. | A shared request owns cancellation; an individual consumer does not cancel other consumers. Cache generation and identity keys remain intact. |
| P1: unavailable card request became another search | UUID resolution swallowed all failures and attempted search. Only a genuine 404 now permits the existing exact variant-ID fallback. | Authentication, rate-limit and server failures remain failures, not invented absence or a looser identity result. |
| P1: daily movers rejected at gateway | App/backend accepted `scope` and `sortBy`, but the gateway allowlist rejected both. The gateway now accepts only `catalogue_daily`, `money`/`percent`, daily GBP/raw-card queries and a daily limit of 100. Sorting requires daily scope. | Existing owner checks, private responses, duplicate rejection and unrelated-route allowlists remain enforced. |

Request initialization checks cancellation before work and before dispatch. Aborting during storage initialization cannot dispatch later when storage completes. Cancellation also prevents a 304 recovery replay and publication of an aborted response. Anonymous loopback preview still avoids device storage; authenticated requests retain their configured HTTPS origin and security headers.

## Checks actually performed

- `node --import tsx scripts/test-client-card-retrieval-runtime.ts` — passed. Imports the complete real client and adapter; only native/storage and remote transport boundaries are fixtures. Covers stuck real AsyncStorage read/write, restored persisted identity, optional storage errors, cancellation before/during bootstrap, private timeout/error/401/Retry, account/device headers, anonymous/authenticated preview separation, aborted 304 replay, shared deadline/deduplication, late completion, status-specific fallback and actual card/search transport abort.
- `node --import tsx scripts/test-stackr-preview-proxy.ts` — passed.
- `node --import tsx scripts/test-stackr-api-transport-policy.ts` — passed.
- `node --import tsx scripts/test-stackr-api-cache-recovery.ts` — passed.
- `npm --prefix gateway test` — 56/56 passed, including the new actual `handleRequest` daily-movers regression. The isolated checkout initially lacked `jose`; the existing exact version 6.2.4 was copied from the original checkout's gateway dependency folder. No dependency installation or package change was needed.
- `git diff --check` on the shared client/adapter and gateway changes — passed. An earlier `test-stackr-api-v1.mjs` run failed its backend hydration fixture at line 720; the parent owns that fixture repair and final integration evidence.

No additional full typecheck/lint was run by this worker during the parent's integration checks. Native module fixtures emit an Expo logger warning; the client runtime checks above complete successfully. The parent owns package test wiring and the final integrated gates.

## Live image limitation and delivery status

The parent's [read-only production readback](../../releases/build60-retrieval-readback-20261022.json) distinguishes approved metadata from deliverable bytes. Japanese Storm Emeralda `M6-001` / printing `2a295d0a-cec3-56d4-a1ce-91f51c389801` has one approved, printing-scoped external image, no derivatives and no owned fallback. Correct manifest request `6b7eb975-5b7d-4265-a6c1-3d1d33c35ace` was generated at `2026-10-22T07:15:23.730Z`. The official Heracross URL rendered a 503 maintenance page; an English Fusion Strike owned-storage image loaded successfully. No mirror was invented and foreign-image guards were left unchanged.

This worker performed no deployment, publication, price refresh, catalogue mutation, remote database operation or production job. Live reads in the linked receipt were performed by the parent. No installed-phone verification, native latency measurement, whole-catalogue coverage or deployed-repair success is claimed. The storage hang is a reproduced client defect, not proof that the recorded phone had stalled storage.
