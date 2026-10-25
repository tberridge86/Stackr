# Independent review: Build 60 feedback repairs

Date: 2026-10-22. Checkout: `D:/Stackr-1/.tmp-build60-20261022/repair`, branch `repair/build60-feedback-20261022`.

The first review compared task-owned changes with snapshot `bdad4ea26` (parent-identified upstream source `2172db553ef8`). The later retrieval review compared its unstaged changes with the accepted, staged first batch. Unrelated snapshot-parent changes were outside the review. This report is the reviewer's only authored file; no application source, catalogue, remote system or deployment was changed by the reviewer.

## Scope and outcome

No remaining actionable findings were identified in the reviewed final changes.

The first batch covered daily market-history SQL and retained source/FX receipts; pricing service, route, OpenAPI and client contracts; global cash/percentage ranking and explicit coverage; saved binder artwork and branding recovery; image cache/retry callbacks; unified Showcase selection and motion; simplified card details; and bounded reordered-word search. Review traced source identity, consecutive UTC dates, stale/missing history, publication membership, permissions, approved artwork selection, presentation-only merges, account/request guards and failure states. Home-related evidence was assessed as local runtime evidence, not measured phone performance.

The retrieval sweep covered public-route device initialization, private/authenticated and preview boundaries, cancellation, shared card-resolution deadlines and cache retry, UUID 404 fallback, optional backend set artwork, and the gateway's daily-mover contract.

## Findings resolved during review

- **Global ranking mode:** the screen could relabel a retained cash-ranked subset as percentage leaders after a failed mode switch. Results now retain their ranking mode and mismatched rows are masked immediately. The runtime regression exercises the failed switch.
- **Unknown finish disclosure:** an invalid or unknown finish profile could be labelled non-foil. Non-foil copy now requires `no_holo_finish`; unresolved selections remain explicit.
- **Delayed drag feedback:** drag haptics could outlive preference hydration and their viewer state. The optional current-request guard now expires on lifecycle/motion changes; focused tests cover delayed dispatch.
- **Gateway daily-mover query:** the gateway originally rejected the new `scope`/`sortBy` parameters. Its allowlist and bounded validation now forward the daily contract while retaining owner authentication, private caching, duplicate checks and supported query limits.

Final search review confirmed that reordered matching is restricted to bounded ordinary name tokens, requires all terms on the same published-name row, and retains exact-identity priority and language/set guards. Installed `postgrest-js` source confirmed repeated `ilike` calls append filters rather than replacing them.

## Independently executed checks

- `git diff --check`: passed during both review phases.
- `node --import tsx scripts/test-client-card-retrieval-runtime.ts`: passed. It exercised the complete client and adapter with mocked storage and transport. An ExpoModulesCoreJSLogger mock warning appeared without failing the assertions.
- `node --test backend/test/set-card-artwork-fallback.test.mjs`: **5/5 passed**, including facts-only reads, approved artwork, failure/body stalls, essential-facts errors and parent cancellation through the actual SDK boundary.
- `node --test --test-name-pattern 'daily catalogue movers' gateway/test/gateway.test.mjs`: **1/1 passed**, covering forwarding, validation, authentication/configuration rejection and the private-cache boundary.

No additional tests were executed for this report.

## Reported evidence reviewed, not independently rerun

The parent/specialists reported passing PGlite migration/service/route tests with more than 220 fixture identities, daily-history transforms, pricing-cache regression, backend typecheck, artwork/image/search/runtime checks, 56 binder reopen/SQLite cases, and the complete gateway suite (**56/56**). Their test source and relevant assertions were inspected where they supported changed invariants. These results are attributed to those agents, not presented as reviewer executions. Root-owned final integration checks remain the release owner's evidence.

## Delivery and validation limits

This is source and local-fixture evidence. The migration was not activated, provider writes were not run, and no deployment or TestFlight build was verified by the reviewer. Actual installed-phone startup, image rendering, touch/motion and perceived haptics remain unverified. Production database latency and broader token-query latency were not measured. Missing approved source alternatives, upstream image outages, unsupported price coverage and insufficient daily observations remain concrete delivery limitations rather than fabricated replacements or comparisons.
