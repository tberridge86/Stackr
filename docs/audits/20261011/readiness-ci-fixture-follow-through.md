# Readiness CI fixture follow-through

The first resumed candidate `511ebc169f9fa8a103e88551391313a8d89b0d4b` was published to existing PR329. Its exact-head checks finished with ten successes, two failures and two skipped release/canary gates. It was not a fully passing candidate.

## Confirmed fixture failures

- [lint-type-unit](https://github.com/tberridge86/Stackr/actions/runs/38156530805/job/114520551072) reached the old `test-home-activity-ui.ts` extracted-handler fixture and failed with `visibleVariantQuantities is not defined`. The current Set Detail handler also requires its ownership identity/generation and per-key mutation refs.
- [card-first validate](https://github.com/tberridge86/Stackr/actions/runs/38156530809/job/114520550819) expected the older `ownershipReady` summary expression. The stronger reviewed source uses `ownershipVisible` to prevent prior-account projection before effects. Running the next step locally exposed the old filter fixture's same missing visible-map input.

## Smallest correction and retained controls

Only three test fixtures change. No production code or workflow/gate is relaxed.

- The layout contract scopes its ownership summary check to the single existing `StackrBrowseSummary` and expects the current stronger visibility guard. Grid, header, filters, unknown totals, no unverified completion percentage and the other original contracts remain.
- The filter fixture executes the screen's actual `visibleVariantQuantities` initializer. Original finish/ownership/rarity/search/exact-price-row and immutability checks remain. Added controls verify retained private quantities stay hidden when ownership is unavailable while public catalogue browsing remains useful.
- The activity fixture supplies the current handler's actual dependencies. Original saved-holding/history-failure/identity-change/no-extra-history and original-request manual repair controls remain. A signed-out invocation must leave persistence, visible quantities and activity unchanged. Its baseline write count is captured rather than assuming an unchanged-quantity invocation skips the existing upsert.
- CommonJS `__dirname` global declarations resolve existing scoped-lint environment errors; execution is unchanged.

## Verification and limits

Baseline failures reproduce locally. Final 13 layout/shared-component cases, five filter/reset/toolbar cases, full `test:home-release` and full `test:home-activity` pass. Application TypeScript and all three fixtures' scoped lint pass. Independent review reran the dedicated controls and accepted all three with no P1/P2. Diff check passes.

These remain source/VM/mocked-boundary checks. The signed-out fixture is not a physical account-switch test; the separate complete-screen account-generation suite carries that broader local regression evidence. No installed-device, live data, latency or release claim follows. The corrected published revision needs its own fresh hosted results; do not reuse the failed first head's successes as final-head evidence.
