# Independent controlled-release review

The reviewer independently examined the whole PR #439 release diff, including earlier app, backend, identity, caching and workflow changes, and reran the focused retrieval, backend SDK and Profile SQL/RLS regressions.

## Findings resolved

- RELEASE-PUSH-001: the Japanese-image workflow's own main-push path could start excluded catalogue/R2 work. Removing only that self-path and adding negative regression controls preserved the ten intended paths, manual triggers and concurrency.
- Local build request gate: an old successful delivery receipt could survive a failed preflight rerun. The wrapper now requires all six exact current preflight commands to pass, checks source/tree/profile, and binds the delivery receipt to the successful final step.
- Local submission gate: the app uses Expo's {policy: appVersion} runtime configuration, not a literal string. The wrapper now checks that policy plus app version and independently verifies the finished EAS runtime string.

## Review outcomes

Published source f46c984a814bab6c0f30d03266ffa010a00b1c11: GO after all five exact-head checks passed.
Merge b5d643a997041db2a8c42b5b6cb0180e8ddf28e7: tree-identical to reviewed source.
Pinned Profile migration: source/security GO; only approved SQL applied. The executor-generated ledger version is explicitly mapped to the canonical file; broad replay remains held.
Native preflight: all six steps passed. Reviewer independently recomputed the exported iOS bundle hash and reconciled the matching delivery/build receipts.
Exact build c0acb3f0-8366-48cf-b55c-99b30a2b7469: production 1.0.6 (61), reviewed source, production channel/runtime and expected fingerprint. Submission GO conditional on fresh FINISHED status; root subsequently verified FINISHED and submitted that exact build.
Submission audience: only existing Team (Expo), automatic group setup disabled; no external group attachment or beta review request.
Reversible hosted QA fixture: account scoping, trigger checks, NULL-safe assertions and rollback reviewed. Root executed the single transaction, obtained correct 10-row/13-copy and 1,003-row/1,337-copy summaries, and separately verified zero fixture rows after rollback.

The reviewer performed no provider mutations. Private user-JWT Home measurements, real priced-printing hosted coverage and installed-phone acceptance remain separate and unverified.

## Final distribution evidence

Apple confirmed build 61 VALID, internal IN_BETA_TESTING and not expired. The supported read-only Team (Expo) group-build relationship GET confirmed exact Apple build a0ddb40d-697b-4f6c-9f6d-b45fe05b6992 membership at 2026-10-26T08:33:15.100Z. No membership mutation or external beta review was performed. Earlier incompatible query failures remain preserved locally.

Expo Doctor patch-alignment warning review: the five package versions and lockfile were unchanged by this release. No concrete release-blocking regression was identified; the warning remains disclosed in native-doctor-warning.json. This does not constitute installed-device acceptance.

Final independent publication review: GO for the selected 17 shared evidence files. Exact-source CI, build/submission, Apple group relationship, migration mapping, QA rollback, disclosed warnings and remaining acceptance limits are consistent. No credentials, real QA account IDs, tester data or signed private artifact URLs were found in that set.
