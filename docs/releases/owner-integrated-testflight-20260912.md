# Integrated owner TestFlight release — 12 September 2026

The owner explicitly requested: **PROGRESS TO RELEASE TO TESTFLIGHT**.
This authorizes progressing the combined candidate through review, required
checks and the existing owner TestFlight delivery lane. It supersedes the prior
local-only stopping point for this delivery. Preserve commerce locks and do not
activate new catalogue/provider sources or replay historical migrations.

## Starting source

- Clean integration checkpoint: `f60bbb0550ccf8d25a0216803d8fc8e5be1798f0`.
- Runtime language-guard revision: `f0f1405831e12224a0a8df7e6ccfd4747f01a923`.
- Main observed before release: `4c0be1ae7ac77b46debd241cf106f4834fe5ffb5`;
  branch lock and admin enforcement remain enabled.
- [Candidate changes and local evidence](integrated-candidate-repair-20260912.md).

## Delivery evidence to complete

| Layer | Current state |
| --- | --- |
| Integrated PR and fresh CI | Preparing the reviewed candidate branch and draft PR |
| Main merge | Pending successful required checks and deployment coordination |
| Backend/gateway dependency delivery | Current versions and safe scoped lanes being verified |
| Database | Six historical retrieval migrations are already recorded in production; no replay authorized by this source recovery |
| EAS iOS build | Pending; use `production-owner`, `owner-recognition`, runtime `1.0.3-owner-recognition-v1` |
| TestFlight | Pending new build and submission to the existing owner tester group |
| Installed-device acceptance | Unmeasured for this candidate; collect after delivery |

TestFlight delivery will not be described as complete historic artwork or full
production acceptance. The dated Traditional Chinese card-image-reference census
is 2,382/8,166, and neither inspected Chinese archive supplied additional approved
logos. Live owned-card pricing and physical retrieval/scanner/UI evidence remain
separate acceptance items.
