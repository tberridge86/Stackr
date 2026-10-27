# Stackr platform health — release and GitHub

Observed 27 October 2026, approximately 15:10–15:15 UTC. Source baseline:
`b5d643a997041db2a8c42b5b6cb0180e8ddf28e7`. Scope: current workflow source,
open PR metadata and exact-head checks. No deployment, merge, job dispatch,
secret read or repository cleanup was performed. The adjacent workstream owns
the running R2 transfer.

## Results

| Check | Status | Evidence / next action |
| --- | --- | --- |
| Production deployment exclusion | Failed in baseline; local fix tested | General production workflow used `stackr-production-deployment`, while owner and hardening backend workflows used `stackr-production-backend-hardening`. Both groups can replace service `299d7ad4-5ed8-4301-b609-ef99274078d0` concurrently. Change the two alternate lanes to the existing production group; retain `cancel-in-progress: false`. |
| Workflow action pinning | Passed, bounded source check | Parsed all 111 `.github/workflows/*.yml` files. All 492 external **step** action references end in a full 40-character SHA. This is not a dependency-vulnerability or permissions attestation. |
| Release dependency installation | Passed, sampled source check | Production, Pages and iOS lanes use `npm ci`. No new dependency versions or lockfiles were changed here. Other workstream owns backend dependency security. |
| Mobile build source selection | Passed in current source | `build-owner-ios-release.yml` uses explicit `expected_main_sha` and `expected_backend_sha`, checks source equality and preserves audience selection. The old hardcoded iOS SHA finding in the historical role brief is superseded. Installed-device identity remains unmeasured here. |
| Retrieval/account-boundary integration | Failed delivery / existing candidate | PR #446 is draft/open at `d76f5099f1cb1811df01b3eace6532d8eaf83a59`, unmerged and undeployed. Reuse it for Home, binder-account cache, search-pagination and restore-verification work. Exact-head GitHub checks: 14 success; `release-candidate-gate` and `canary-api-evidence` skipped. |
| Recovery integration | Pending existing workstream | PR #448 is draft/open at `09df26b94f7a09f551bae88085b3380a40b62f84`. Exact-head checks: nine success; `release-candidate-gate` skipped. Its deployed migration worker is a separate component from the API. Let the transfer owner finish receipts and integration. |
| Production monitor | Passed most recent observed run; continuous coverage unmeasured | `Production API Monitor` run 40493107091 succeeded at the current main source, created 11:02 UTC. Workflow checks project/environment binding, catalogue languages, commerce lock and CDN via existing smoke. A single successful run does not prove ten-minute coverage. |
| Scheduler ownership | Unmeasured live configuration | `price-refresh.yml` contains Railway handoff guards (`STACKR_CATALOGUE_PRICING_SCHEDULER` and `STACKR_PRICING_SCHEDULER`). `owner-provider-price-refresh.yml` also checks the owner. Live values were not read. Five recent price-refresh runs in the bounded 20-run sample were cancelled; run 40513477544 was pending with zero jobs at observation. This does not prove duplicate writes or that an active job was cancelled. Parent should compare live ownership and successful worker receipts. |
| Repository cleanup | Existing candidate, not repeated | PR #185 already proposes removing 44 local/editor/generated files (1,148,930 bytes) and retains runtime artwork. Reconcile that PR instead of repeating cleanup. No current tree-size measurement was completed. |
| Secrets, branch protection and environment controls | Unmeasured account configuration | Inspected production workflow declarations, not live secret values or repository administration settings. Do not infer account controls solely from YAML. |
| Rollback execution | Unmeasured live operation | Existing workflows retain before/after deployment evidence. No rollback was executed during a health audit of an active production service. |

## Minimal repair: PH-REL-001

Severity: medium; release reliability. Two independently serialized workflow
groups target the same production API, allowing overlapping deployments and
misleading before/after receipts. The smallest repair is to share the existing
production release group across the three workflows. No events, production
environment gates, commands, source checks or credentials change.

Changed files:

- `.github/workflows/deploy-owner-testflight-backend.yml`
- `.github/workflows/deploy-production-backend-hardening.yml`
- `scripts/test-production-release-concurrency.mjs`
- `scripts/test-deployment-tooling.mjs` (imports the new check into existing CI)

Validation: the new YAML check discovers four production backend upload jobs
across the three workflows; all share the same non-cancelling group. It excludes
staging and checks the existing R2 provisioning lane's group. Running against a
temporary copy with the original separate group correctly fails with
`production backend releases can overlap`. `git diff --check` passed.

Local command (the sparse checkout has no installed project dependencies):

```sh
NODE_PATH=/workspace/scratch/a131fb278b76/release-audit-deps/node_modules node scripts/test-production-release-concurrency.mjs
```

The isolated test dependency is `yaml@2.8.1`; no project dependency changed.
The full deployment suite and hosted CI have not been rerun here. Parent review
and normal PR CI remain the next integration steps.

GitHub concurrency preserves an active run when `cancel-in-progress` is false;
it is not a durable FIFO queue. Pending runs can be superseded. The shared group
already includes migration **provisioning**, gateway and other production lanes.
This edit neither restarts nor locks the independently running R2 worker.

## Evidence links

- [PR #446](https://github.com/tberridge86/Stackr/pull/446)
- [PR #446 exact-head Platform CI](https://github.com/tberridge86/Stackr/actions/runs/40366614116)
- [PR #448](https://github.com/tberridge86/Stackr/pull/448)
- [PR #448 exact-head Platform CI](https://github.com/tberridge86/Stackr/actions/runs/40518216202)
- [Existing repository cleanup PR #185](https://github.com/tberridge86/Stackr/pull/185)
- [Production monitor run](https://github.com/tberridge86/Stackr/actions/runs/40493107091)
- [Observed pending price-refresh run](https://github.com/tberridge86/Stackr/actions/runs/40513477544)

Priority: integrate the small concurrency repair; continue the existing #446 and
#448 workstreams; qualify live scheduler ownership and monitoring cadence. Do not
add a second release system or repeat completed source fixes.
