# Independent review — infrastructure boundary checkpoint

Baseline: df45ef50420cab9dae7e2fefb6e929cd1110363c. Reviewed in the isolated candidate checkout on 26 October 2026 by stackr_reviewer (read-only, independent of implementation).

Final result: GO for source checkpoint publication and hosted CI. No remaining blocking scoped finding.

| Finding | Correction | Independent result |
| --- | --- | --- |
| Stale legacy PGRST204 edit retry after account/route change | Validate account generation and loaded route again before dispatching the fallback write | Reproduced before; guarded retry and held-response tests pass |
| First getSession token refresh falsely cancelled initialization | Exempt initialization TOKEN_REFRESHED while retaining sign-in/out and A/B/A boundaries | Focused startup refresh regression passes |
| Restore comparison missed disabled triggers and Storage security | Compare trigger definitions/enabled state and Storage RLS/policies/ACLs; compare role settings | Local deliberate-mutation tests pass |
| Explicitly empty default ACL disappeared during aclexplode | Preserve the default-ACL parent object and empty state separately from grants | Empty ACL versus absent/default fails comparison |

Independently executed: binder account-cache runtime, binder read-budget, unpriced loading, catalogue retry; restore-security (44 checks); captured production-function boundaries (17 checks); mocked native PostgreSQL fixture safety; updated default PGlite valuation harness (four cohorts, exact JSON/hash equivalence, 6→3 aggregate nodes).

Root additionally ran required typecheck, lint (zero errors, eight existing app warnings), full binder-retrieval, Home release/retrieval, deployment tooling and existing security source contracts.

Limits: tests use local synthetic rows or pinned production function bodies with synthetic dependencies. No hosted negative authentication, actual restore, login/MFA/session recovery or installed-phone acceptance is established. Native PostgreSQL 17 execution awaits the dedicated CI job. No SQL proposal was applied. Matching restore security does not prove the source policy is safe; managed-role differences deliberately fail closed for explicit review.
