# Scoped release approval package — 25 October 2026

Prepared only. No migration, deployment, build submission, provider refresh, schedule change or R2 operation has been executed in this task.

## Source and current gates

Use the final containing commit on PR439 and its exact-head checks, recorded in the publication handoff; re-attest main and all component revisions immediately before release. Starting candidate1134846c535a687e1afdc2e7f898ef6fd2d1606d is independently reviewed, conflict-free and has five passing workflows; main6dfe188166df76b41d44801ab66970b0a3881ae5 remains unchanged at readback. The cold Home change is client-side only and requires no new database migration/index, backend deployment or gateway deployment. The combined PR also contains earlier work; do not infer that all older component release gates are closed.

## Exact Profile database change for approval

- Target: Supabase project `oakdbbzdqwurpjnoqhmu`, production.
- File: `supabase/migrations/20261025154000_collection_summary_v1.sql`.
- Canonical LF SHA-256: `01945a9e2bd98f7884662bef002f5a8fa50d22e5998709af7193f57566ace09c` (10,720 bytes).
- Object: `public.collection_summary_v1(uuid[])`, stable SECURITY INVOKER, empty search path, authenticated-only execute.
- Effect: additive read aggregate and execute grants; no collection/catalogue data, pricing jobs, schedules or assets are changed.
- Ledger readback:191 entries, latest20261005205507; this version is absent. Ledger absence alone does not prove that a manually created function is absent.
- Excluded: daily-movers20261022064554 and every other pending migration.

Before an authorised apply, inspect the exact existing function/definition/grants, dependency list and migration ledger; verify current table/RLS grants and record a rollback receipt. Stop if an existing unrecorded function conflicts. Execute only the pinned SQL and record its exact version through the approved migration mechanism. Do not use a broad pending-migration push or the general production workflow's `apply_migrations` switch. No dedicated Profile-only release workflow has been verified; the executor must demonstrate a single-file plan before mutation.

After apply, verify two authenticated accounts, exclusion of foreign public binders, anonymous denial, complete counts and conservative coverage against independent expected values. Check that a denied/malformed RPC does not silently use the missing-function fallback. Use safe staging for execution analysis unless a production read plan is specifically approved.

Rollback: first restore the recorded compatible client release if necessary. If this apply created the previously absent function, remove only `public.collection_summary_v1(uuid[])` after dependency checks, without CASCADE, and reconcile the migration ledger through the same approved mechanism. If a pre-existing function was explicitly approved for replacement, restore its captured definition/grants instead. No data or asset restore is required by this additive change.

## App delivery for approval

Merge only the reviewed candidate with current-main checks, then use `.github/workflows/build-owner-ios-release.yml` against the exact resulting main SHA. Pass explicit reviewed values for `expected_main_sha`, `expected_backend_sha`, `build_profile` and `verify_only`. The last two are optional in the workflow schema, but their defaults must not decide the release audience or action. Attest the backend actually serving the configured API; a historical release log is insufficient to invent this value. Choose the approved audience; do not assume the workflow default `production-owner` is the intended production audience.

A `verify_only=true` run creates an export/verification receipt, not a native build. `verify_only=false` requests a native build, and submission/distribution/phone acceptance remain distinct. Record the resulting EAS build ID, version/build number, update ID if used, fingerprint and API configuration. Use the prepared [device checklist](home-cold-device-acceptance-20261025.md).

The last documented native receipt is historical Build60 /1.0.6, EAS23565784-9fa5-4f9c-ae48-2376756891fb, source311fc84a95de4c730b61473f891079547d1a9b6f, from the22October report. Workflow39558210992 was re-read and has `VERIFY_ONLY=true`; it must not be used as native build or installation proof. Fresh EAS/device attestation is unavailable here.

App rollback: restore the exact pre-release app/update through the existing release lane, retaining its runtime compatibility; verify the rollback on the same device. Reverting source alone does not roll back an installed app.

## Concrete remaining blockers

1. Scoped production migration and app delivery authority is not established for this new candidate; earlier R2/artwork and Build60 approvals are not silently extended.
2. Direct backend/gateway/EAS readback is inaccessible from this execution environment. Latest successful release logs were re-read, but are not a new served-source attestation.
3. Actual hosted PostgREST row cap, private Home latency and two-account API acceptance remain unmeasured.
4. A phone/install receipt and owner acceptance are still required.

Keep R2 transfers, immutable originals, public/private separation and rollback receipts intact. Do not change schedules or start price jobs to qualify this client change.
