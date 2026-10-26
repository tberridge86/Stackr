# Home independent valuation - 26 October 2026

Reviewed candidate b50547de15a49712d99c67829c38a0bb1d9428b6 is saved in draft PR #446. Required local checks, independent review and all three applicable exact-head hosted workflows passed. The separate release-candidate gate was skipped. Not merged, deployed, distributed or accepted on a phone.

## Source and behaviour

Baseline candidate: 4dadab24a0152bf971fb38b104dc43be966d8aed. Current integration main: b5d643a997041db2a8c42b5b6cb0180e8ddf28e7. Earlier final receipts: b44313bec68d3b4b05a17267ff6735cf2506cf4e. These earlier workflows/export receipts do not qualify a newer source automatically.

This continuation changes features/home/HubScreen.tsx and scripts/test-home-startup-runtime.ts. The coding lead owned both files; parent owned evidence/queue; independent reviewer was read-only. Original dirty checkouts and all R2 work were preserved. The historical D:/Stackr integration path was inaccessible; GitHub main and the existing clean candidate established the integration baseline.

Before: verified user -> complete saved/owned facts -> local binder settings -> prepared valuation. After: verified user -> one prepared GET concurrently with unchanged complete facts/settings. A ready summary with nonempty matching server revisions and reconciled complete price coverage can publish its quantity, price and comparable history independently.

Partial/updating/pending/legacy responses still use the complete-facts and retained exact-price reconciliation. Partial prepared coverage cannot remove better stored evidence. Collector facts have independent loading/error state, so a ready value neither invents an empty binder nor hides a collector failure. No incomplete collector snapshot is persisted.

A known quantity mismatch discovered when facts finish downgrades the valuation to updating, retains its own denominator and exposes a warning even when the previous valuation was empty. Same-quantity remote identity edits cannot be proved atomically by these separate endpoints; no claim of atomic cross-device snapshot consistency is made.

Local edits, refresh generations, logout, account A/B/A, blur, unmount, known auth denial, slow cache restore and timeout cannot publish an obsolete valuation. Existing facts transport cancellation remains. The prepared client method has no caller AbortSignal: its obsolete result is rejected under existing deadlines, but this change does not abort the underlying prepared HTTP request.

No new cache, API, database/index, provider, polling, schedule or asset-delivery layer was introduced. Public/private cache separation and legacy/R2 references are unchanged. Existing saved-card projection from PR #446 remains intact.

## Matched fixture results

Real Hub hooks/effects and the production status notice JSX execute with mocked network/complete-facts boundaries and a fake clock. One deterministic run per cohort/scenario. These are controlled scheduling results, not CPU, hosted HTTP, render or installed-phone latency.

| Cohort | Saved placements / owned rows | Full placements retained | Complete-ready state with facts 200 ms / prepared 100 ms, before -> after |
| --- | --- | --- | --- |
| Empty | 0 / 0 | 0 | 300 -> 100 simulated ms |
| Small | 8 / 6 | 8 | 300 -> 100 simulated ms |
| Large | 1702 / 1323 | 1702 | 300 -> 100 simulated ms |
| Five languages, same collector number | 5 / 5 | 5 | 300 -> 100 simulated ms |

Large partial-ready cases with configured delays facts 200 / prepared 100 and facts 100 / prepared 200 settle at 300 -> 200 simulated ms. They still wait for both sources. Facts settlement itself remains unchanged.

Every completed cohort load makes one prepared service-boundary call. Auth SDK calls remain 5 for the empty/binderless fixture and 6 for nonempty cohorts including optional binder confirmation. SDK counts are not HTTP counts. The facts boundary aggregates complete rows; this harness does not measure underlying Data API pages or bytes.

No additional request/byte reduction is claimed. Prior unchanged reader evidence remains the original large fixture 1,256,922 -> 1,080,420 bytes and 11 cold reads at cap500, zero immediate warm facts reads. Actual authenticated server cap remains unverified.

Tradeoff: an early-cancelled load can now dispatch the prepared GET where the serial baseline never reached it. The existing GET may update materialization requested_at. No extra polling, retry or refresh POST was added; do not call the change universally write-neutral.

## Hosted evidence and limits

Read-only gateway /v1/health and backend /health succeeded. Backend reports source prefix 7c1acd409680 and deployment dfc23b30-9675-4ba0-ad2b-9f1875302747, production Supabase oakdbbzdqwurpjnoqhmu. Full backend source remains the established 7c1acd409680b38d5913d8cae76df560b5d91daa. Worker revision is not independently attested. Root gateway /health returns invalid_path; the versioned health route is /v1/health.

Read-only ledger inspection: 192 migrations, Profile collection_summary_v1 under generated 20261026072532, canonical 20261025154000. Daily-movers 20261022064554 remains absent/excluded. No migration applied or replayed.

Read-only pg_proc inspection confirms request_collection_valuation computes collection inputs/revision and may update generation requested_at even with refresh=false. Historical pg_stat_statements for its normalized PostgREST wrapper: 448 calls, mean 1531.47 ms, min 64.19 ms, max 7908.50 ms; global stats reset 2026-09-09. Modes/accounts/cache/lock conditions are mixed. This is not current cold/warm Home timing or before/after proof. No valuation RPC, provider price job or EXPLAIN ANALYZE was executed by this investigation. A safe representative query-plan investigation is the next database task; no speculative index was added.

Fresh Apple readback 2026-10-26T12:51:28Z: Build 1.0.6 (61), Apple ID a0ddb40d-697b-4f6c-9f6d-b45fe05b6992, VALID, IN_BETA_TESTING, unexpired, available to existing Team (Expo). An earlier in-memory capture returned no receipt; file-backed capture succeeded. No new build/submission/installation occurred.

Designated QA credentials were absent from checked process configuration and named environment files. Owner selected the existing account/local-file route, but the secure template remains empty. No account reset, privileged impersonation or customer data read was used. Authenticated Home timings/cap, real priced-printing coverage and installed-phone acceptance remain unverified. No synthetic results substitute for them.

## Validation and review

Required typecheck passed after completing fixture types and fixing the test host-node comparison. Original failures are retained. Ordinary lint passed with 8 pre-existing warnings; scoped Hub/runtime-test lint passed with 2 pre-existing duplicate-import warnings. Actual-Hub runtime, paired four-cohort measurements, Home release suite and collection-pricing UI suite passed; diff --check passed. Reviewer independently ran the final actual-Hub runtime suite successfully.

Resolved review findings: logout facts-loading reset; visible zero-to-positive stale-valuation warning; visible collector error when a cached binder survives a current summary success. Tests execute the production notice JSX and check no incomplete cache write. Final publication review is recorded separately. Backend/gateway test commands are not applicable to this app-only change.

## Rollout, rollback and next gates

Keep the one existing PR #446 candidate. Publish the exact reviewed source and obtain exact-head hosted CI; save its receipt separately so the tested app source is not confused with a later documentation commit. Any local iOS export is build preparation, not a native binary, TestFlight submission or phone acceptance.

New merge/mobile rollout approval is required: prior authorisation covered PR #439 / Build 61. Proposed lane is existing production-profile TestFlight delivery against unchanged compatible backend/database. No new migration is required. Recheck integration/R2 coordination and source before authorised merge/build; record actual EAS source/fingerprint/version/build/distribution afterwards. Never rebuild Build 61 merely to resume acceptance.

Rollback before distribution: leave Build 61 available. After authorised rollout, retain Build 61 for designated comparison where available and revert the scoped PR #446 app changes through a corrective release if required. No database or asset rollback is needed.

Remaining gates: designated-account authenticated measurements; applicable release approval; actual installed-phone acceptance for Home/Binders/Search/Pokedex, pricing, edits, account boundaries, offline recovery and images. The earlier Build 60 visual/haptics/artwork holds are not closed by this change.

Prioritised backlog: (1) authenticated Home acceptance and safe query-plan investigation of prepared RPC cost; (2) remaining cache/database bottlenecks supported by measurements; (3) job reliability, monitoring and recovery. R2 transfer work continues separately; no transfer, originals, public/private media or rollback receipt was changed here.

## First publication and CI follow-up

Published source 086959bc9ea267b3a0d528890291286225c39b49 passed Owner Pricing Identity and Card-first UI workflows. Platform run 40328036239 failed its commerce-release-lock step because test-gate0-dynamic-copy expected an inline account-denial reset now extracted into the shared revocation handler. The failure receipt is retained; it is not counted as a successful Platform run. A test-only correction checks the shared revocation body and both denial call sites; actual-Hub denial regressions remain required. Exact-head hosted CI must pass again after that correction.

All six production-profile local preflight steps passed on 086959bc, including an iOS JS/assets export, 74 packaged assets and sampled public API checks. The iOS bundle SHA-256 is de28a0fa477326518994ba563e47cc67c1dbdc9d1366248cec4d24bf8dabc75b. This is not an EAS native build. Any later test/docs-only commit must explicitly establish unchanged runtime/build inputs rather than relabel this receipt as an export of that later SHA. Public reads are single samples and do not measure authenticated Home or establish sub-100 ms retrieval.

## Final qualification receipt

App candidate: b50547de15a49712d99c67829c38a0bb1d9428b6, tree 0abfa5b88a0d445b18e8ca4cb12a8217b96cdc8e. All three applicable hosted workflows passed on this exact head: Platform 40329266168, Card-first UI 40329266116 and Owner Pricing Identity 40329266165. All eight normal Platform jobs passed; release-candidate-gate was skipped and is not claimed as passed. The earlier failed Platform attempt remains in the evidence.

The final source differs from the exported 086959bc source only in the guard test and documentation; all remaining tracked app/build inputs are identical (verified Git diff exit 0). The six-step local preflight and export receipt retain their original 086959bc source. No native build or deployment occurred. Read home-independent-valuation-release-state-20261026.json and home-independent-valuation-ci-20261026.json for current qualification, deployed baselines, rollout and remaining gates. This documentation-only evidence commit is not a replacement app source.
