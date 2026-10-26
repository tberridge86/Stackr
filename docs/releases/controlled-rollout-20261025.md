# Controlled release continuation

User authorisation covers the reviewed PR439 merge after current-source checks and independent review, only the pinned Profile migration, normal production TestFlight build/distribution, and designated-account verification. It excludes unrelated migrations, pricing jobs, schedules, new paid services and active R2 operations.

## Release review and correction

Starting source9e8108fc0b8053d944ff2927e908e76fe3fd49ee was four commits ahead of main6dfe188166df76b41d44801ab66970b0a3881ae5, with all five exact-head workflows passing. Whole-PR review found RELEASE-PUSH-001: the changed Japanese-image workflow matched its own main-push filter, potentially starting excluded catalogue/R2 work and cancelling a staging writer.

The fix removes only that self-path. Existing ten ingestion/recovery paths, manual/comment triggers, owner/dependency guards, credential scope and concurrency are preserved. Narrow writer guards failed before and passed after; negative controls reject self-path restoration, wildcard widening and concurrency changes. Scoped lint and independent review pass. No runtime or SQL source changed. The published containing commit still requires fresh exact-head CI before merge; final receipts belong in the original checkout's controlled-rollout handoff and PR439.

## Profile migration applied

Production project: oakdbbzdqwurpjnoqhmu.
Canonical file: supabase/migrations/20261025154000_collection_summary_v1.sql.
Canonical LF SHA256:01945a9e2bd98f7884662bef002f5a8fa50d22e5998709af7193f57566ace09c,10720bytes.
Applied ledger version:20261026072532, name collection_summary_v1.

The single-migration MCP operation accepted the exact approved file. Its API generates a version and cannot accept the canonical version. Both identities are retained explicitly; no manual ledger relabel occurred. Blanket migration push/replay is held until supported history reconciliation. Only one ledger entry was added (191to192); all prior entries are unchanged. Daily-movers20261022064554 and all unrelated pending migrations remain excluded.

Live preflight saved function absence, ledger, required columns and five-table RLS/SELECT grants. Post-apply function body exactly matches the approved SQL; stable SECURITY INVOKER and empty search path are retained. Only authenticated can execute; anonymous and missing-subject invocations reject with42501.

A read-only authenticated-role probe using the existing managed QA subject returned the expected empty collection, while excluding45 otherwise-visible foreign public binders. This account has no saved/owned rows. These are database-role probes, not an actual JWT login, second real account or populated coverage test. Local seeded SQL/identity/coverage regressions remain the populated correctness evidence.

See [applied receipt](evidence/controlled-rollout-20261025/profile-applied.json). Full before/after ledger and function receipts are preserved in the original checkout's matching evidence directory.

Rollback: restore a compatible app if required; after dependency checks remove only the newly created public.collection_summary_v1(uuid[]) without CASCADE, then reconcile its generated ledger version through a supported approved history lane. No ownership/catalogue data or assets were changed.

## Hosted observations and app lane

Fresh backend health confirms source7c1acd409680, provenance bundled_workflow_sha, deploymentdfc23b30-9675-4ba0-ad2b-9f1875302747, production, correct Supabase project. Configured gateway https://api.stackrtcg.com/v1/health returns statusok. A healthy response does not attest a new gateway source version.

Three public Data API probes returned500pokemon_cards IDs each (10493JSONbytes), at519/100/101ms. These are a small public projection without an account JWT, not private Home or a full collection measurement. Hosted private Home before/after and first usable screen remain unverified because designated-account login sessions are unavailable.

Existing normal iOS lane: build-owner-ios-release.yml with explicit build_profile=production, verify_only=false, exact merged main SHA and freshly attested full backendSHA7c1acd409680b38d5913d8cae76df560b5d91daa. Channelproduction, runtime1.0.6; remote build number auto-increments. The workflow starts a build without submission. Distribution must select the exact completed EAS build ID; the owner-recognition submission helper is not suitable for this production profile.

The browser is signed in to GitHub and exposes Run workflow; local gh credentials are invalid. No native build or submission has yet been requested at this containing commit. Final build/distribution results must be appended to shared release evidence, never inferred from CI.

## Disclosed holds

Daily catalogue movers remains explicitly unavailable while its excluded migration/backend work is deferred. Its unavailable/retry state does not replace results with personal movers, and collection history loads independently. This remains an outstanding Build60 feature, not a completed repair.

Earlier artwork and Build60 phone holds remain open until actual app/API/device acceptance, including correct logos, exact printing artwork, haptics and Showcase lighting. Use the existing home-cold-device-acceptance-20261025.md checklist. Native build, TestFlight submission, tester availability, installation and acceptance are distinct states.

No R2 migration, original asset, object pointer, rollback receipt, production schedule, price job or paid service was changed. Job reliability, monitoring and recovery remain queued.
