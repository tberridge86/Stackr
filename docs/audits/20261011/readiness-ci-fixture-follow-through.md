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

## Second published head and remaining fixture sweep

Exact head `9908433eda4bdaee8ade786f3d5e8bc9d1a1fa01` finished with eleven successful checks, one failed check and two skipped gates at 17:08 UTC. The corrected layout/filter/activity checks passed. [lint-type-unit](https://github.com/tberridge86/Stackr/actions/runs/38157493664/job/114523378024) reached `test:pokemon-language-flags` and failed an obsolete literal `fetchCardsForSet` call check after factual-loader options were added.

The replacement reads the actual Set Detail TypeScript AST. It requires `currentSet.id` and exactly `currentSet.language ?? language` in the existing options object while allowing the factual-loader options. All existing route, set-ID, selected-language and name checks remain. RED was reproduced; the full `test:pokemon-language-flags`, direct script and scoped lint pass. Independent review accepted the fixture.

A proactive local sweep ran the nineteen remaining fixture commands in the platform CI job: eighteen passed initially. The four-language catalogue test failed because Windows CRLF prevented its LF-only literal check from recognizing the existing pinned `CSV1C` to `CBB1C` provider-ID rekey. Normalising CRLF immediately before the same exact literal assertion fixes the test without changing the pinned snapshot, path, identity, language or rekey requirement. The full `test:four-language-catalogue-backfill` and scoped lint pass; independent review accepted the one-line correction.

These two changes affect test fixtures only. No production source, dependency, workflow, release gate or provider data is changed. The local sweep is recorded under the D-drive scratch receipt; it is not hosted evidence, and local Node24 differs from CI Node22. The next published head needs fresh hosted results. Skipped release/canary gates stay open.
