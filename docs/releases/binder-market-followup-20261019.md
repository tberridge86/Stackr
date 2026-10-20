# Binder ownership and stored market movers — 19 October 2026

Binder ownership confirmation previously waited for optional Chase placement
data. A pending placement request could therefore delay ordinary editing until
the transport timeout even after the mandatory ownership reads had succeeded.
Commit `752bd02ea99032ab2090474f51128ea42e660442` separates those requests.
Placement changes retain their own confirmed baseline, loading/error/Retry and
saving states. Late reads cannot replace a successful placement change. Binder
switches detach older mutations; same-binder Retry waits for all dispatched
writes before reconciliation. Custom-card removal completes its placement
cleanup across a same-account Retry and respects account invalidation.

Ownership queries also stopped at the server's row cap. Controlled callbacks
with 1,001 rows could mark ownership ready while missing a later binder, saved
card or variant quantity. Commit `f785779b00f359e06df11d136aa066e75bc477cb`
reads ordered UUID pages until an empty page confirms completion, even when
the server returns fewer rows than requested. It scopes 100-ID chunks, permits
two lanes and shares a 256-request budget within one ten-second logical read.
Ownership updates publish only after both lanes succeed. Failed, malformed,
overlapping or out-of-scope pages keep ownership unverified. Cancellation
requests transport abort and prevents later pages or stale state updates;
physical transports that ignore abort may settle later.

The legacy quantity-less projection is allowed only for a recognised missing
quantity-column error. A permission failure, timeout or unrelated schema error
cannot become a successful quantity of one. Partial primary rows are discarded
before a valid compatibility read. This repairs a conditional source defect;
the production row cap, owner's holdings and the video's exact path were not
queried, and this does not diagnose canonical set-total metadata.

The market endpoint previously selected only the highest percentage changes.
An actual-service fixture with 100 rising comparisons and one falling comparison
returned no fallers. Commit `28787faa77a0384fc3a1b93ce141c41d5b08cb09`
reads both percentage extremes concurrently, retaining the 100-result cap and
existing response shape. The sample keeps exact market identity and currency,
including separate conditions and grades. Conflicting overlapping observations
or a failed read remain retryable failures. Both dispatched reads settle before
the service returns. Cash ordering is within this percentage-selected sample;
whole-market cash rankings are not established.

## Verification

- `node scripts/test-binder-reopen.mjs`: 54 cases passed, including the actual
  source callbacks, account and binder changes, late responses, reordered-write
  settlement, custom-card removal and file-backed SQLite recovery. Pagination
  cases cover lower caps, 1,001-row populations, genuine empty results, exact
  quantities, partial failures, budget/deadline failures and late cancellation.
- `node scripts/test-market-pricing-service.mjs`: passed, including the actual
  market selection service, mixed/one-sided populations, bounds, identity,
  currency/product isolation, zero/null, conflicting observations and failures.
- Root typecheck/lint, backend typecheck and targeted binder lint passed.
  Targeted binder lint has the same eight warnings as its unchanged main
  baseline; root lint retains its eight existing warnings.
- Independent reviews passed for the final binder and market bytes. The final
  pagination review replayed 27 actual callback cases and two additional
  exact-identity/quantity cases. Earlier
  binder review findings and their failed cases are retained in private evidence.
- The hosted retrieval workflow exposed an older extracted-loader fixture
  missing the new state references. Commit
  `bac2e8dd36a0cdbb71ab24dfb42133e8cc086454` supplies those dependencies,
  preserves the pending ownership chain and tests optional placement remaining
  independent of useful facts. All 12 cases passed locally; no app source
  changed in that correction. The initial failed hosted result is retained.

The final required-check receipt is
`3952aaad3c6bf28cb0c933a4c3abde05d31c7a4f9cc812f71ef4b93315e07c2a`.
Optional-placement review:
`74aece6bad53d4e8dbca767b06c9e5b3553def1083c6d8b3f78cb7653698f8d5`;
final pagination review:
`3c5c0f134df69a438f3319497ff425a829de5e77182b5643acdcf6a55dd329f2`;
market review: `a42fa89f298ce06c123c146d122c6a061855a1280c756bfc7046438e6fb56718`.

These are source and controlled-fixture results. No backend deployment, native
build, provider refresh, database change or phone performance measurement was
performed by these repairs. Installed ownership, pricing evidence, rendering,
retry and network-condition acceptance remain open. TestFlight stays held.

The app changes merged through PR414 into main
`e132ac2e664016b3b1b9d3cdc510b5aeb8bfd9ff`, with exactly the same reviewed
source and test hashes. All ten applicable PR checks and eight post-merge
checks passed. Delivery receipt:
`75c2c77118640157b1ab5d5ea6ad0b6e17612d5a0ec3dbfc1af917751dfe47f5`.
Isolation receipt:
`500318ec3c8473ec2af8199a95b3dbd8d8b9d5182fe08ad609a76b2913b8d10d`.
The original commits remain preserved on the pushed PR413 branch.

The market repair remains held in draft PR413. Fresh production configuration
shows both unpinned owner-price workers follow main and watch `/backend/**`;
their start commands apply provider refreshes. A backend merge and deployment
need approval covering those live effects and the backend performance canary.
The existing staged primary-API patch remains untouched. No worker settings or
schedules were changed. Railway documents the
[automatic deployment trigger](https://docs.railway.com/deployments/github-autodeploys)
and [watch-path behaviour](https://docs.railway.com/builds/build-configuration#configure-watch-paths).
