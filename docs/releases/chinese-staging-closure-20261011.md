# Chinese membership and staging closure — 11 October 2026

The additional three Simplified Chinese membership errors linked csmpic 013–015
to obsolete printing/set IDs. The physical variants and public card faces were
already correct. The guarded manual repair corrects only the three membership
links; it retains variant IDs, physical printings, artwork, provider evidence,
price outcomes and ownership references. It records exact old/new links and a
full-row preservation fingerprint in `audit.catalogue_events`.

Production (`oakdbbzdqwurpjnoqhmu`) and staging (`lmwfhvexfcoyeuoyrlco`) both
passed rollback rehearsal and committed this repair. Fresh checks found all
three corrected and zero published membership mismatches in either project.
There were zero scoped ownership, binder, asset or price rows; all three
existing price-outcome rows remained unchanged in each project. This does not
activate a pricing provider for Chinese cards.

Staging's remaining five false Simplified Chinese sets map to the existing
Traditional Chinese sets: SV7a, SV8, SV8a, SV9 and SV10. The separate staging
manual preserves all 667 source asset rows, 750 target asset rows and 1,210
target version-asset associations. All 667 source hashes already have exact
mapped target associations. The 605 published target assets remain available;
unavailable deduplication placeholders are preserved. It retires only the
five sets, 605 printings and 750 variants, retaining IDs and exact correction
pointers, resolving exactly 605 conflicts and publishing 1,360 mobile changes.
Its rollback rehearsal passed. The correction was committed after the deployed
staging resolver and corrected full public smoke passed. The commit receipt
records 4,000 unchanged preserved rows (MD5
`37d594c99d873610f1ad523e46d857eb`) and changes `11993–13352`.

The staging ownership dependency migration restores the authenticated
mutation/readiness functions, request history, conflict/version protections
and reservation guards. Four absent private support tables are necessary for
those safeguards. They receive forced RLS and service-only access; no marketplace
publication RPC, public grant or commerce activation is included. Installed
compatible objects are verified before a no-op; partial or incompatible
states abort. A failed first apply exposed the missing support tables and
rolled back without changing the 200-entry ledger. The corrected migration
was applied to staging as `20261011100654_reconcile_staging_binder_ownership`.
The source uses the hosted timestamp. Repository LF normalization removes two
outer-statement carriage returns; the SQL otherwise matches the hosted statement.
The hosted raw MD5 is `53fa9406c0ee9e92b0ffa830f83bee57`; canonical Git MD5 is
`8837d71bb1c503cfff19159b4f849a14` and canonical SHA-256 is
`57e909ab62401f775605cc6db550f8ee9d0012a4c93f51654566a0ce71e31981`.
Independent live checks confirmed all ten function definitions, the private
foundation, owner-only request access, authenticated wrapper access and zero
new ownership requests. A separate hardening migration,
`20261011100927_revoke_public_guard_function_execute`, removes direct public
and authenticated access to the four trigger-only reservation guards. Its
source matches the hosted statement (MD5 `9acf859e56c5b57dc71851d2d0db1583`).
The real JWT mutation/reservation tests still pass. Fresh advisors show no
anonymous security-definer access introduced by these functions; the four
private tables intentionally have no client RLS policies, and the authenticated
mutation wrapper is deliberately owner-scoped.

Actual SQL execution in disposable PGlite covers initial installation,
compatible replay, partial/malformed states, missing authentication, owner
isolation, idempotent retries, stale-version conflict, malicious broad RLS and
reservation-protected membership retention. These establish database behavior;
they do not establish a signed-in phone flow or a client switch to the RPCs.

The existing staging workflow gains a protected `backend_only` scope. It pins
the reviewed main SHA and existing staging resources, records a verified
rollback target, preserves runtime bindings and commerce locks, attests the
bundled source and tests old-ID resolution plus approved image bytes. Failure
restores the previous backend. The wider migration/model/index/mobile gates
and existing staging scopes remain intact. The new scope runs no migrations,
gateway deployment, mobile update or provider refresh.

Validation: both real SQL fixtures, backend typecheck, deployment tooling,
existing pricing rehearsal workflow guards, asset-pipeline tests and independent
specialist reviews passed locally. Both SQL fixtures are included in normal CI.
The original staging deployment is `3bd8e8c3-8c3e-4b5c-8296-77dcbc2f4417`;
production backend remains the previously verified `599c776f12201470273574c4d5f9f01632609dc1`.
PR #331 merged as `144cb333e467017983e5bcb249859df81122dd63` after all eight
normal checks passed; the separately invoked release-candidate gate was skipped.
Staging workflow run `38131384949` deployed `a57955a5-168b-4dfa-be2a-5f64e158c430`
with the exact bundled SHA. All five old set aliases, sampled printing/variant
links, stale-language requests and five actual approved image hashes passed.
The wider smoke failed because the workflow tested production's browser origin
instead of staging's. Live OPTIONS verifies `https://staging.stackr.app` is
permitted (204 with matching origin), while `https://stackr.app` is rejected (403).
The rollback attempt also rejected the previous deployment's normal `REMOVED`
state despite Railway reporting it rollback-eligible. The release follow-up
corrects the staging smoke origin and accepts this eligible superseded state
under the existing exact service/environment guards. The Chinese retirement
was subsequently committed after the corrected 39-check public smoke passed
against the same verified backend. No gateway configuration is changed.

Live staging application/deployment/delta receipts are recorded separately as
they complete. This scoped closure does not certify full migration alignment,
pricing coverage, TestFlight delivery, showcase or physical haptics.

Recovery: the three-card audit retains the original links for a bounded inverse
repair. The Chinese duplicate audit and reviewed alias map retain every source
and correction identity; use a separately reviewed inverse if necessary.
Do not delete ownership request history to undo an additive dependency migration.
Restore a bad runtime through the recorded Railway deployment, then repair schema
forward under the same ownership and commerce protections.
