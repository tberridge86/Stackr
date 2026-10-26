# Stackr controlled rollout — 26 October 2026

This continues the explicitly authorised PR #439 rollout. It does not authorise unrelated migrations, price jobs, schedule changes, paid services or changes to active R2 work.

## Current delivery state

- Implemented and tested: the full candidate and the merge-trigger correction passed independent review. All five exact-head hosted workflows passed at f46c984a814bab6c0f30d03266ffa010a00b1c11. All three applicable push workflows subsequently passed at the merge.
- Merged: PR #439 merged as b5d643a997041db2a8c42b5b6cb0180e8ddf28e7. Its tree, 54fa26324eb3355fa92f062dab7b829f873c09ad, exactly matches the reviewed head.
- Database: the pinned Profile migration is applied and verified. No other migration was applied.
- Native: EAS build c0acb3f0-8366-48cf-b55c-99b30a2b7469 FINISHED at 2026-10-26T08:10:04.309Z, production 1.0.6 (61), exact merged source and fingerprint dfe1bddd9007cd2ad0a40e660d01da3f7663c9d0. Downloaded IPA metadata and SHA-256 verified.
- TestFlight: submission 3d8d7489-6c38-446a-bf24-37fd95f4d47f FINISHED. Apple confirms VALID / internal IN_BETA_TESTING, with matching EAS build/submission/runtime/fingerprint. A read-only Apple relationship query at 08:33:15Z confirms this exact Apple build (a0ddb40d-697b-4f6c-9f6d-b45fe05b6992) belongs to the existing internal Team (Expo) group and is available to that group. No external beta review or audience expansion.
- Hosted API: public delivery contracts and actual anonymous RPC denial passed. Private Home measurements and populated account acceptance remain blocked by unavailable designated-account JWT sessions.
- Installed phone: unverified.

## Source and independent review

Whole-release review found RELEASE-PUSH-001: merging the changed Japanese-image workflow would match its own main-push trigger and could start excluded catalogue/R2 work. The correction removes only that self-path, preserves the other ten explicit paths and existing manual triggers/concurrency, and adds positive and negative regression checks. Independent review found no remaining source blocker. No release path intersects the seven registered R2 writers.

Canonical head f46c984a was based on main 6dfe188166df76b41d44801ab66970b0a3881ae5. Exact-head checks:
- Platform 40286110245
- Gateway 40286110114
- Pricing identity 40286110154
- Card-first UI 40286110113
- Binder retrieval 40286110117

All passed. The separate full-platform release-candidate assessment was skipped; this is the existing narrow normal-production native lane, not a claim that the full-platform assessment passed.

The original dirty checkout and existing candidate assets were preserved. Native work uses a clean canonical checkout at D:/workspace/Stackr-rollout-b5d643a-20261026. It was fetched from GitHub at the exact merge, including tracked assets.

## Scoped Profile database rollout

Project: oakdbbzdqwurpjnoqhmu.
Canonical file: supabase/migrations/20261025154000_collection_summary_v1.sql.
Canonical LF SHA-256: 01945a9e2bd98f7884662bef002f5a8fa50d22e5998709af7193f57566ace09c.
Applied ledger version: 20261026072532, name collection_summary_v1.

The single-migration executor generated its own version. Both identities are recorded explicitly; the canonical version is not falsely represented as applied. The ledger grew from 191 to 192 with exactly one addition and all earlier entries unchanged. Do not replay the canonical migration or use a blanket pending-migration push. Supported history reconciliation remains a separate hold. Daily movers 20261022064554 and all unrelated migrations are excluded.

Preflight captured function absence, the ledger, required columns, RLS policies and grants. After application, the function body exactly matched the approved SQL. SECURITY INVOKER, stable volatility, empty search path and authenticated-only execution were verified. Anonymous execution and authenticated invocation without a subject were denied. An actual anonymous HTTP RPC returned 401 / 42501.

A read-only authenticated-role test for the existing managed QA account returned the correct empty summary while excluding 45 foreign public binders otherwise visible under that role. This is a DB-role simulation, not a user-JWT session or a populated two-account API test. Local seeded SQL/RLS fixtures supply real price/identity correctness evidence. A separately reviewed hosted DB-role fixture then inserted 10 and 1,003 synthetic unavailable-price holdings only inside a transaction for the managed QA account. It returned exactly 13 and 1,337 copies, five language prefixes, correct raw/graded/duplicate/unavailable coverage, and zero foreign binders. The transaction ended in ROLLBACK; a separate read confirmed zero owned rows, binders and synthetic rows. See profile-hosted-qa-fixture.json. Its single function timings (242.121 ms small, then 38.71 ms large in the same transaction) are not matched cold/warm Home or network benchmarks.

Receipts are in evidence/controlled-rollout-20261025/: profile-before.json, profile-apply-prepared.json, profile-applied.json, profile-ledger-after.json, profile-definition-after.sql and profile-http-anonymous-denial.json.

Rollback: retain a compatible prior app. If database rollback becomes necessary, inspect dependencies and remove only the newly created public.collection_summary_v1(uuid[]) without CASCADE; reconcile generated migration history through a supported approved lane. No customer holdings, catalogue data or assets were changed.

## Measurements and hosted verification

| Measurement | Before | After / observation |
| --- | --- | --- |
| Large deterministic Home facts, 1,702 saved / 1,323 owned, cap 500 | 66 reads; 1,256,977 JSON bytes | 11 reads; 1,256,922 bytes |
| Same fixture, immediate warm return | 0 reads | 0 reads |
| Large fixture with cap 50 | 66 reads | 66 reads; complete results |
| Earlier Profile fixture, 1,003 placements | 30 reads; 496,050 bytes | 1 read; 550 bytes |
| Actual public Data API ID projection | No matched before sample | 500 rows and 10,493 bytes in each of three reads; 519 / 100 / 101 ms |

The Home payload remains approximately 1.26 MB. Fixture timings used artificial per-request delay and are not hosted or phone latency. The public 500-row projection does not establish the private Home page cap or full-screen timing. No production row limit was changed.

The existing verifyPublishedMobileDelivery check passed through the actual configured network, including complete Pokédex continuation, five catalogue languages, four reviewed translation samples and the base history schema with compatible missing optional snapshot columns. A reviewed Traditional Chinese sample explicitly reports scan_acquisition_required with no image; it must not be represented as artwork completion.

Backend source: 7c1acd409680b38d5913d8cae76df560b5d91daa; live health attests its 12-character prefix and bundled_workflow_sha provenance.
Backend deployment: dfc23b30-9675-4ba0-ad2b-9f1875302747.
Configured public gateway: https://api.stackrtcg.com; /v1/health is healthy. Current Worker source/traffic version is not independently attested by that health response.
Database project: oakdbbzdqwurpjnoqhmu.
Public delivery and runtime receipts: hosted-mobile-delivery.json, served-runtime.json and frozen-mobile-delivery-receipt.json.

## Native release route

The authorised GitHub run 40286973319 selected production, verify_only=false, exact merge b5d643a and the backend revision above. Its production environment approval succeeded. It failed before EAS dispatch because EXPO_TOKEN was empty. No build was created by that workflow.

The existing authenticated local EAS route used by earlier releases was verified for account tommo86 with pinned CLI 23.2.0. No credentials or permissions were changed. The initial dependency install hit a global npm-cache EEXIST; a separate cache completed successfully. An initial test stopped because Bash was not on the Windows child PATH; adding the existing Git Bash resolved that environment failure.

Independent review approved the local preflight and build wrapper. Review closed a stale-receipt weakness: dispatch requires all six exact preflight steps to pass and binds the delivery receipt to the successful final step. The build wrapper rechecks clean source/tree, explicitly requests production iOS, rejects EAS_NO_VCS, and records a request marker before invoking EAS to prevent blind duplicate requests.

The actual iOS export passed, including 74 recovery assets. Bundle SHA-256: 0252075187dd01223c5ae044357b88955aa5cb41373883e7dd1c6daecca40a60.
Production channel/runtime: production / 1.0.6.
Bundle ID / Apple app: com.tommo86.Stackr / 6772118450.
API: https://api.stackrtcg.com; price API: https://pocketvault-production.up.railway.app.
Native build and submission have separate exact receipts; neither is inferred from the export. The IPA is 390,040,377 bytes, SHA-256 b5d7d8d71b5d88a6e687342324b2a32c31f6201217d6270262bc8c7efd35fd45. Its bundle ID, version/build, production channel and runtime match. Embedded update ID: 7964f2aa-1ea6-4278-859e-e0b2fca618e4. The embedded legacy manifest does not expose Git source; source provenance comes from EAS. Apple VALID processing is separate from local metadata inspection.

One request started at 2026-10-26T07:53:18.998Z. EAS incremented build 60 to 61 and confirmed existing signing credentials. The upload and native build completed. One exact-ID submission was accepted and finished; see frozen-ios-build-receipt.json, eas-build-current.json, native-ipa-verification.json, native-submission-request.json, eas-submission-current.json apple-build61-status.json and apple-testflight61-group-relationship.json. Do not repeat either request.

Expo Doctor reported 17/18 checks with five patch-alignment warnings: expo 54.0.36 versus ~54.0.37; expo-asset 12.0.13 versus ~12.0.14; expo-constants 18.0.13 versus ~18.0.14; expo-file-system 19.0.23 versus ~19.0.24; expo-updates 29.0.19 versus ~29.0.20. Independent review confirmed these dependency versions and the lockfile were unchanged by the release; no concrete release-blocking regression was found. This warning remains disclosed, not hidden by changing exclusions or frozen dependencies.

## Remaining acceptance and holds

Use home-cold-device-acceptance-20261025.md. Build 1.0.6 (61) is now available to the existing internal Team (Expo) testers. Open TestFlight, choose Stackr 1.0.6 (61), and record the installed build, phone/OS and network, then:
1. Cold/warm Home: complete counts, exact multilingual printing identity and honest pricing coverage.
2. Account A → logout → B, including pending requests; no account data crosses.
3. Reversible holding/binder edit and refresh; cancellation rejects late results.
4. Offline reopen, failed refresh, reconnect and retry; useful scoped cached content remains.
5. Binders, Search and Pokédex continuation, exact legacy/R2 artwork and private-media isolation.

Daily movers remains explicitly unavailable while its separate migration/backend work is excluded; collection history is independent. Existing artwork, haptics and Showcase phone holds remain open. No active R2 migration, immutable original, object pointer or rollback receipt was changed.

Job reliability, monitoring and recovery remain queued.

## Final handoff status

Main was rechecked at b5d643a997041db2a8c42b5b6cb0180e8ddf28e7. All eight exact-source CI runs are recorded as successful in controlled-rollout-ci-20261025.json. The two earlier read-only TestFlight relationship probes failed because their queries were incompatible with the API; the final supported group-build relationship GET succeeded without changing membership.

Remaining priorities: (1) installed Build 61 acceptance and authenticated designated-account Home cap/latency measurements; (2) fix any evidenced release defect, preserving exact pricing and account boundaries; (3) reconcile the generated Profile migration ledger mapping before any future broad migration tooling; (4) revisit cold Home payload/database work only against those measurements. Job reliability, monitoring and recovery remain queued. No new deployment or build is required merely to resume these acceptance checks.
