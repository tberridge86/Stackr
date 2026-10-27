# Stackr client and gateway health — 27 October 2026

Checked at 15:11 UTC (Europe/London). Source: `b5d643a997041db2a8c42b5b6cb0180e8ddf28e7` (main). Read-only specialist pass for the platform-health coordinator. No app/backend deployment, device operation, database mutation or R2 action. No duplicate repair was introduced.

## Results

| ID | Status | Evidence | Practical action |
| --- | --- | --- | --- |
| CLIENT-ACCOUNT-01 | Failed in main source; existing repair awaiting delivery | `lib/binders.ts:577` caches binder metadata by binder ID/options without account/session; `:603` does the same for cards. RLS checks occur only on cache misses. Existing PR #446 contains a demonstrated before/after account-switch runtime regression and the repair. | Continue PR #446; do not implement a second cache rewrite. Verify the affected account-switch journey in its delivered client. |
| CLIENT-SEARCH-01 | Failed completeness contract in main source; existing repair awaiting delivery | `lib/stackrApiV1.ts:1231` exposes no search cursor; `lib/stackrDomainAdapter.ts:1564` performs one capped request (maximum 50). Main is a first-results interface, not complete search pagination. | Use PR #446's revision-bound identity cursor and client continuation; coordinate its SQL, backend, gateway and client changes. |
| CLIENT-GATEWAY-01 | Passed local regression | Fresh `node --test gateway/test/cache-retrieval.test.mjs`: 13/13 pass. Auth/cookie requests bypass shared cache; private/no-store/Set-Cookie responses are not made public; private responses are not shared between anonymous callers. Source at `gateway/src/cache.js:162`. | Verify the deployed gateway identity before translating this result into a live claim. |
| CLIENT-RESILIENCE-01 | Passed local regression | Fresh `node --test gateway/test/circuit-isolation.test.mjs`: 4/4 pass. Asset failures do not block otherwise healthy card facts; backend and recognition circuit boundaries remain separate. | Reuse these tests; no new implementation justified by this pass. |
| CLIENT-IDENTITY-01 | Passed local regression | Fresh `node scripts/test-search-printing-language.mjs`: exit 0. Fixture validates printing language before result limit, translated lookup, UUID constraints and variant identity without sibling-finish expansion. Optional-artwork failures in its output are deliberate fixture cases. | Preserve this identity contract in pagination delivery. |
| CLIENT-PAGING-02 | Source checks present; not freshly executed | `scripts/test-ui-pagination.ts` covers bounded 50-row transport, complete National Dex windows, duplicate/version rejection and 16,000-row set snapshots. `lib/binders.ts:534` pages saved binders by received row count and rejects duplicate/cross-account rows. | Reuse hosted results for the selected release; do not enable strict server page enforcement until supported installed clients paginate correctly. |
| CLIENT-DEVICE-01 | Unmeasured | No installed-device interface or authenticated QA session used. No real-device latency, image decoding, offline/account-switch or login/reset journey measured. | One short acceptance pass on the actual release: login, A→B account switch, Home, multi-page Search, Binder, card detail, weak-network retry. |

## Existing work recovered, not repeated

Live GitHub PR metadata was read on 27 October: [PR #446](https://github.com/tberridge86/Stackr/pull/446) remains open, head `d76f5099f1cb1811df01b3eace6532d8eaf83a59`. It already owns Home retrieval, binder account/session isolation, search continuation and restore security. It says unmerged and undeployed, with build 61 the last attested distributed app; that statement is release evidence, not a new inspection of the user's phone.

Read exact-head files:

- `lib/binderAccountCache.ts`: cache keys include binder, account and generation; an idle Auth observer invalidates account entries; late fills and reads recheck session/collection revision.
- `docs/releases/evidence/infrastructure-boundaries-20261026/binder-before.txt`: the real default/assets edit path reproduced `leakedPrivateName=true`, `readsForB=0` after A→logout→B.
- `docs/releases/evidence/infrastructure-boundaries-20261026/binder-after.txt`: same scenario reports `leakedPrivateName=false`, `readsForB=1`; covers A/B/A, held responses, offline reuse, edits and mutation invalidation.
- `docs/releases/evidence/search-pagination-20261026/local-validation.json`: recorded candidate validation and its limits; gateway 62/62, runtime continuation, typecheck/lint and API contract checks. These historical receipts are not labelled as rerun here.
- `docs/releases/evidence/search-pagination-20261026/measurement-summary.json`: synthetic fixtures preserve 1,202 large-cohort identities and hydrate 50 on the first page. Its PGlite timings are explicitly not hosted API or phone measurements.
- `docs/releases/evidence/infrastructure-boundaries-20261026/acceptance-blockers.json`: designated QA credentials were absent and installed-phone acceptance unverified at its recorded 26 October checkpoint.

PR #436 separately owns preserved Build 60 retrieval and daily movers with an unapplied migration; it is not a prerequisite for silently folding unrelated features into this health pass.

## Validation limits

Node 24.22.1 was available. The isolated sparse checkout has no installed `tsx`/TypeScript dependency tree. A direct Node attempt at `scripts/test-account-request-guard.ts` stopped at extensionless TypeScript module resolution; this is a harness limitation, not a failing account assertion. No dependency installation, full build or duplicate mobile export was undertaken. Existing TypeScript/React runtime evidence is reused from #446 and should be tied to its final delivered source by the release owner.

No current global performance percentage, device p95 or full pagination coverage is claimed. The largest actionable client work is delivery and acceptance of #446, not another implementation.
