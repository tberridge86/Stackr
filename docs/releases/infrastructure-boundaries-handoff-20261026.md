# Infrastructure boundary work — 26 October 2026

Reviewed checkpoint against PR #446, baseline df45ef50420cab9dae7e2fefb6e929cd1110363c. This record is not a release approval or an app build source.

## Completed local milestones

- Reproduced INFRA-ACCOUNT-CACHE-001 with actual binder/cache modules and edit-screen hooks: account B displayed A’s private edit fields without a new read. The repair rejects that reuse. Expanded regressions and independent review passed.
- Implemented restore comparisons for private/Auth/Storage security metadata, RLS, policies, table/column/function grants, owners, security-definer settings, trigger enabled state, role settings and Auth identity digests. Forty-four local PGlite checks pass, including the reviewed empty-default-ACL regression. Actual restore, login, MFA and session recovery remain unverified.
- Inspected five production function definitions read-only and pinned them for local negative tests. Seventeen tests reject non-admin/anonymous calls and profile authority escalation; the intended trusted admin remains admitted. These synthetic dependency tests are not hosted client authentication.
- Prepared an explicit CI-only PostgreSQL 17 run of the existing valuation equivalence/plan harness. It uses a fixed localhost service and a unique disposable database; no production URL is accepted. Transport safety guards pass; hosted PostgreSQL 17 execution is pending.

## Current gates

- Required typecheck and lint passed (zero errors; eight pre-existing app warnings). Home release and deployment tooling regressions passed.
- Full binder retrieval and Home retrieval suites now pass after three fixtures were updated to load the actual account-cache module.
- Independent review is GO. The stale legacy retry and first-session refresh cancellation are fixed and regression-tested. See the independent-review receipt.
- Designated QA email/password in D:/workspace/stackr-qa.local.json remain empty. No authenticated Home timings, actual Data API cap or priced-printing acceptance has been claimed.
- No physical-device interaction is available. Build 1.0.6 (61) remains the last attested distributed app; this candidate has not been installed.
- Search continuation is still unfinished; current deployed search returns at most one page with nextCursor:null. No speculative pagination fix or production limit increase has been applied.

## Read-only operational observations

See evidence/infrastructure-boundaries-20261026/operational-observation.json. Backend and configured gateway health returned 200. The initial /health probe on the gateway returned the documented invalid-path response; /v1/health is the correct route.

The latest observed bulk run had 331 completed and 350 unmapped groups. Cardmarket product/guide feed success timestamps were 22 October. The separate catalogue-cycle table was empty; this does not imply that bulk pricing is inactive. The active scheduler owner, reliable alert cadence, retry exhaustion and load capacity remain unqualified. One database snapshot showed 8 background, 1 active and 23 idle sessions with max_connections 60; it is not a load test.

## Restore qualification scope

Security equality does not establish that the source policy is safe. Provider-managed role expiry, connection limits, memberships and settings may legitimately differ between projects; differences fail closed and require explicit review. No automatic waiver or production role normalization is performed.

Database fingerprints now include private tables; security metadata includes Auth and Storage. Auth users/identities are hashed inside the database and raw rows/credentials are never emitted. Storage object bytes, bucket configuration and public/private delivery still require the separate storage verifier. A real isolated restore must confirm that the backup contains Auth data and that custom policies/triggers in managed schemas were restored. The CLI’s default schema dump excludes managed schemas; do not infer security restoration from a successful dump.

No live migration, restore, scheduler change, provider refresh, R2 change, merge or app deployment has been performed in this unit.

## Pending delivery

Local review and focused qualification are complete. Publish this frozen checkpoint and record exact-head CI evidence before continuing search changes. Keep the Profile migration ledger mapping (20261025154000 → 20261026072532) unchanged. Prepare any new SQL rollout separately; the existing proposal remains unapplied.

The PG17 fixture job owns its entire disposable PostgreSQL service because roles are cluster-global. The adapter refuses execution outside the specifically named CI job. Do not reuse it against a shared local or remote database.
