# Release 55 CI fixture follow-through

**Revision inspected:** `3b1a3bc` (hosted result: 11 successes, 1 failure, 2 skips)

## Baseline failure

`npm run test:master-set-artwork` stopped in `scripts/test-master-set-ownership.ts` when the extracted `BinderDetailScreen` quantity callback read the release-55 account-bound history guards. The fixture predated that callback contract and omitted `accountGenerationRef` (the reported error originated at the direct callback invocation on line 73). This was a fixture-only failure; it was not an application, database, or provider result.

## Repair

The fixture now supplies the callback's actual local dependencies:

- stable current-owner, account-generation and load-generation refs;
- binder language used by the captured history snapshot;
- the existing activity double behind a durable-intent and durable-recording double, retaining `expectedUserId` and a stable event ID; and
- an assertion that the emitted history has the loaded snapshot facts (`Fixture`, `en`, nullable number/images).

The existing assertions remain: Base copies survive a first Reverse edit, unavailable finishes cannot write, metadata remains intact across master-set toggles/reloads, and a failed holding write reloads the saved quantity. The fixture does not add a live write or change app/runtime behaviour.

## Adjacent extracted-consumer audit

The other callback-extracting harnesses and the complete Set consumer fixture were inspected. `scripts/test-binder-direct-history-recovery.ts` already supplies the account/load/owner refs, binder language and durable history helpers. `scripts/test-home-activity-ui.ts` and `scripts/test-set-account-boundary.ts` supply the Set consumer's corresponding ownership/history dependencies. No other fixture change was needed.

## Local verification

All commands below set `TEMP` and `TMP` to `D:/Stackr-recovery-artifacts-20261009/runtime-temp/release55-tool-temp` and set `TSX_DISABLE_CACHE=1`; no new large temporary cache was intentionally created on C:.

- `npm run test:master-set-artwork` — pass. Its intentional simulated rejected-write log remains part of the master-set ownership control.
- `node --import tsx scripts/test-binder-direct-history-recovery.ts` — pass.
- `node --import tsx scripts/test-home-activity-ui.ts` — pass.
- `node --import tsx scripts/test-set-account-boundary.ts` — pass; its offline/current-write-failure lines are intentional negative controls.
- `git diff --check` — pass.

No commit, deployment, hosted write, provider call, runtime/configuration change, or package change was made by this follow-through.

## Independent review

Independent review accepts the fixture repair. The extracted Binder callback now receives its real account/load/current-owner guards and binder language, while the durable-history double forwards the original activity payload with the expected owner and one stable event ID to the pre-existing activity double. The new snapshot assertion strengthens the direct-history contract; it does not replace any Base-preservation, unavailable-finish, reload/toggle, metadata or rejected-write control.

`npm run test:master-set-artwork` was independently rerun with the documented D-drive temporary environment and `TSX_DISABLE_CACHE=1`; it passed. The rejected-write log is an intentional negative control. This establishes local fixture compatibility only: the published candidate still requires fresh hosted checks, and neither a native build nor device acceptance is implied.
