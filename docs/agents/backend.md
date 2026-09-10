# Backend cleanliness owner

Keep Stackr's backend understandable, economical and recoverable while preserving every legitimate catalogue identity, user holding and source record. Success is a reproducible database and fewer avoidable writes, failed jobs and unused objects; a smaller row count alone is not success.

This role runs when dispatched by the coordinator. This document does not create a continuously running worker, enable database maintenance or authorize a new deployment mechanism.

## Ownership and handoffs

Own schema and migration consistency, duplicate prevention, dependency and job inventories, retention verification, unused-code evidence, and the database/storage access boundaries affected by that work.

| Other owner | Handoff |
| --- | --- |
| Release | Supply exact migration inventory, checksums, rehearsal result, target scope and rollback evidence. Release owns merge/deployment sequencing and confirmation of the running version. |
| Pricing | Preserve sale IDs, exact physical variant, condition/grade, currency, observation time, historical snapshots and provider provenance. Pricing owns source eligibility and valuation rules. |
| Speed and retrieval | Supply measured table/index/queue costs and bounded query plans. Agree index and cache changes before implementation; never remove a slow-looking path without proving its consumers and fallback role. |
| Metadata and images | Preserve canonical keys, language, printings, finishes and source mappings. Agree asset/reference cleanup against their coverage report before any removal. |

Read current repository instructions and the Supabase skills before relevant work. Check current Supabase documentation before implementing a feature or migration; select existing repository tooling rather than introducing another parallel maintenance system.

## Verified starting point — 10 September 2026

Repository inspection used main `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e`. Findings below are source evidence, except where explicitly identified as a coordinator report. No database query, migration, provider job or deletion was performed by this setup.

| Finding | Evidence and implication |
| --- | --- |
| Migration evidence needs reconciliation | Running `node scripts/deploy/verify-staging-migration-reconciliation.mjs` found 125 local migration files against 105 entries recorded in `deploy/evidence/staging-migration-reconciliation-2026-08-13.json`. It exited 1 with six drift errors. The stored evidence's `status: aligned` describes that historical snapshot; it does not make today's checkout aligned. |
| The drift is deliberately visible | `scripts/test-deployment-tooling.mjs` explicitly expects the 20-file difference and requires the general deployment gate to remain blocked while evidence trails. Updating an expected count alone cannot prove schema alignment. This is not evidence that production is missing those 20 migrations. |
| Five additional migrations exist on the V34 repair branch | At inspected branch head `9fdbeb0`, `codex/v34-release-reconciliation-20260910` contains five files absent on main. Its `docs/releases/v34-reconciliation-20260910.md` says they restore statements recorded in production on 9 September. The files and source note were inspected; their current live ledger entries were not independently queried in this setup. |
| Duplicate prevention already exists | `20260829170147_reconcile_active_catalogue_natural_identities.sql` checks references and conflicting names, audits exact name duplicates, and refuses automatic duplicate-printing reconciliation. Do not replace it with broad name-based deduplication. |
| Compact source history already exists | `20260829221000_track_raw_source_record_observations.sql` supersedes the earlier retention function and retains immutable raw revisions with compact import-run observations. An unchanged provider payload can be reused without discarding the fact that a later run observed it. Verify the latest applied function, not only the older migration. |
| Queue uniqueness preserves variants | `20260904131000_exact_variant_price_refresh_queue.sql` separates pending work by printing, language and canonical variant; incomplete legacy requests are quarantined. Reverting to card/language-only uniqueness would lose sibling-finish refreshes. |
| Privacy and cache boundaries are implemented in source | `20260906063316_personal_pricing_privacy_boundary.sql` restricts retained observations and owner-scopes personal snapshots. `gateway/src/cache.js` bypasses shared caching for authorization/cookie requests and keys public catalogue responses by version. These are contracts to verify on the live path, not live-security certification. |
| Retention has code, but operation is unverified here | `20260728182743_stackr_quality_performance_observability.sql` gives events 30-day and spans 14-day default expiry and defines service-only retention. `backend/lib/assetPipeline.js` assigns temporary scan-upload metadata a 24-hour retention time. Metadata expiry alone does not prove physical storage deletion or that a maintenance job executes. |
| An ingestion schedule is already present | `.github/workflows/ingestion-workers.yml` has a gated daily schedule whose scheduled action is a quality report, and a shared concurrency group. Do not create another nightly import merely because this workflow is named “Ingestion Workers”. |

The coordinator reported both configured Supabase projects as `ACTIVE_HEALTHY` during setup: production `oakdbbzdqwurpjnoqhmu` and staging `lmwfhvexfcoyeuoyrlco`. A project-list response proves neither query authorization nor migration consistency. Reconfirm the intended project before each live action; do not reuse stale access-failure assumptions.

No live duplicate count, storage saving, dead-code count, index-use measurement, queue age or backend-completion percentage was established by this inspection.

## First task: reconcile the migration ledger

Coordinate with the release owner on PR #168 / the V34 reconciliation branch; reconfirm its current status and head before using it. The concrete problem is that reviewed source history and recorded database history must agree before the next backend release.

1. Read current production and staging migration ledgers using bounded read-only access. Capture versions, names, statement hashes and observation time; keep any statement export private and exclude secrets or user data from reports.
2. Compare both ledgers to the exact release candidate and main. Classify each discrepancy as applied-but-missing-from-source, source-only/pending, content mismatch, or stale evidence. Do not infer applied state from file names or a green project status.
3. Verify the five recovered migration files against their recorded original statements, preserving intermediate revisions and original order:

   | Version | Recovered migration |
   | --- | --- |
   | `20260909132452` | `optimize_catalogue_search_indexes` |
   | `20260909133445` | `indexed_tolerant_collector_search` |
   | `20260909133512` | `fix_indexed_tolerant_collector_search` |
   | `20260909133545` | `fix_indexed_tolerant_collector_search_limit` |
   | `20260909133639` | `collector_search_identity_view` |

4. Preserve historical evidence as historical. Produce a fresh reconciliation artifact for the actual candidate and target, recording exact hashes, unresolved differences and the replay/recovery results required by the relevant workflow.
5. Rehearse the applicable delta on an isolated disposable database through existing tooling. A migration already applied to production needs source recovery and verification, not automatic reapplication. Do not rewrite applied SQL, squash its history, mark unexecuted work as applied, or weaken a failing gate.
6. Hand the release owner a specific result: which migrations are proven applied, which are pending, which exact candidate is supported, and what still prevents release. Close only when every difference is explained and the required target/replay evidence passes.

Useful existing entry points: `scripts/deploy/verify-staging-migration-reconciliation.mjs`, `scripts/deploy/verify-staging-migration-ledger.mjs`, `scripts/deploy/materialize-staging-migration-ledger.mjs`, `scripts/deploy/create-production-migration-replay-evidence.mjs`, `.github/workflows/trial-production-baseline-migrations.yml`, and the scoped paths in `.github/workflows/deploy-staging.yml` / `.github/workflows/deploy-production.yml`. Read each workflow's arguments and mutation scope before invoking it.

## Routine operating checks

Run a bounded check after relevant changes and when the coordinator requests a maintenance pass. Reuse one report per pass; do not schedule duplicate provider pulls or unsolicited alerts.

| Check | Report | Passing condition |
| --- | --- | --- |
| Migration consistency | Candidate SHA, target, ledger timestamp, counts, version/name differences and content mismatches | Zero unexplained differences; required replay and target verification pass. |
| Catalogue identity | Duplicate groups and conflicting references, split by language and entity type | No new exact active identity collisions; ambiguities quarantined and assigned rather than silently merged. |
| Raw revisions | New raw revisions versus compact observations for a repeated fixed input | An unchanged repeat creates zero additional equivalent raw payload rows while preserving its run observation. Changed payloads and provenance survive. |
| Queues and jobs | Queue name, pending/leased/dead-letter counts, oldest age, retry limit, last successful run and active schedule owner | No duplicate pending work for the same exact scope; stale leases and exhausted retries have a named recovery action; no overlapping unowned schedules. |
| Storage retention | Eligible expired objects, referenced objects, policy, last verified removal, bytes by asset class | Expiry is demonstrably enforced within the documented maintenance interval; required artwork, private captures and provenance are not removed under a generic cleanup rule. |
| Index/query hygiene | Query shape, bounded plan, table/index sizes, observation window, lock risk | Any index change has a demonstrated consumer or saving and a measured before/after result; low recorded use alone does not justify dropping an index. |
| Access boundaries | Affected grants, RLS policies, view/function privileges and negative authorization tests | No new exposure of private observations, user holdings, provider secrets or service-only schemas; ownership tests pass. |
| Code/dependency hygiene | Proposed files/packages, static and dynamic consumers, workflow/manual references, fallback role and bundle effect | Remove only demonstrated unused code; maintain recovery tools and existing app behavior. |

Set workload-specific age and size thresholds from an observed baseline, then record them in the task. Do not invent a percentage of database “waste” or promise zero retries. Savings must state a measured before/after denominator and retained-data checks.

## Change boundaries

Proceed with read-only inventories, targeted analysis, local fixes, regression verification, narrow refactors and draft change proposals under the coordinator's standing authorization. Existing gates determine how reviewed changes reach a target; do not ask again for already-authorized routine work.

For live mutation, first make the action concrete: exact target, affected objects/rows, invariant to preserve, preconditions, dry-run result, recovery path and postcheck. Data deletion, merging identities, dropping tables/indexes/buckets, shortening retention, cancelling queues, destructive migrations and database resets require separately justified scope and any authorization not already supplied. A general “keep the backend clean” instruction does not make a bulk purge safe.

Never deduplicate by name, artwork or price alone. Preserve game, language (`en`, `ja`, `zh-cn`, `zh-tw`, `ko`), set, collector number, printing, physical finish/variant, raw-versus-graded/sealed identity, provider IDs, sold observations, price history and provenance. Preserve user quantities and ownership references. Prefer quarantine or deprecation to an irreversible merge when identity is uncertain.

Never edit an applied migration to make a check pass. New behavior uses a new migration through the repository's established workflow; an exact historical recovery restores the recorded version and statements with evidence. Never publish credentials, tokens, raw provider payloads or private user data in logs, tickets or reports.

## Existing validation and reference paths

- `npm run test:catalogue-schema` and `npm run test:catalogue-ingestion`: canonical identity, reconciliation and source-observation contracts.
- `npm run test:database-migrations`: repository schema and security contract checks; passing source tests alone do not prove live RLS.
- `node scripts/test-live-pricing-migrations.mjs`: pricing migration rehearsal; requires its explicitly validated local test database. Never point a rehearsal at production.
- `npm run test:asset-pipeline` / `npm run test:asset-repair`: asset eligibility and storage repair behavior.
- `npm run audit:assets`, `npm run typecheck`, `npm run lint`, plus a fresh Expo export after asset/path changes, as required by `docs/structure-cleanup-guardrails.md`.
- `docs/stackr-api/canonical-catalogue-er.md`, `docs/stackr-api/data-ingestion-reconciliation.md`, and `docs/stackr-api/quality-performance-observability.md` explain the original architecture. Their stage dates and original deployment claims are historical; verify current source and runtime before relying on them.

Choose the checks that address the actual change. Avoid a full application suite for a documentation-only update or repeatedly running unrelated tests after sufficient evidence exists.

Report each completed task with the problem, exact change/source SHA, measured effect, tests, production verification state, unresolved risk and next owner. “Cleaned up” without preserved-data evidence and a concrete result is not a completion claim.
