# Release 55: independently ready Search groups

The existing `runSearch` in `app/(tabs)/search.tsx` publishes an initial partial
snapshot, then waits for all six bounded final source results before publishing
late non-card results. A ready set, product, collector or market listing can
therefore wait behind an unrelated source's four-second final deadline.
This is the remaining partial-publication scope of `PERF-002`.

## Small adjustment

The existing sets, products, public profiles and listings promises now publish
their own results as each settles after the initial snapshot. No new request,
transport, source or dependency was introduced. The original final reconciliation,
deadline, loading state, factual cards and ownership enrichment are retained.
Graded/raw listing classification, error wording and same-query recovery use
the established policies. An explicit successful empty group removes prior
matches; a failed group retains same-query matches with its error.

Each update checks the active request both before scheduling and inside the
state updater. Query, category, language, account and unmount invalidations
retain their existing request-generation boundaries.

## Verification

- `SEARCH_SETTLEMENT_BASELINE=1 node --import tsx scripts/test-search-settlement-runtime.ts`
  executes the original coordinator from `23c64b0e28c2260ba7b5312fbc0fee1bba8dbc6f`
  and fails the assertion that a ready set publishes before a stalled card
  source's final deadline.
- The same script against the repair passes all four independent ready groups,
  the graded/raw split, successful empty replacement, honest failure retention,
  invalidation, timeout and late-completion controls.
- `test-search-recovery.ts` and `test-search-settlement.ts` pass.
- Independent source review accepted this scope with no P1/P2 finding.

The regression extracts and executes the actual coordinator with synthetic
sources and timers. It is not a mounted native-screen test or an iPhone timing
measurement. It does not establish physical transport cancellation, a p95 target,
whole-catalogue correctness or installed-device acceptance. Source validation
and the final candidate's hosted CI are recorded in the release receipt.

## Delivery

Prepared and independently reviewed locally for Release 55. Merge, matching API
and mobile delivery, signed build and iPhone acceptance are separate pending
steps. This repair does not authorize or perform any live action.
