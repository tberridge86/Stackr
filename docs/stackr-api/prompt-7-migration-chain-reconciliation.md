# Prompt 7 Migration-Chain Reconciliation

## Scope

This review reconciles the migration chain on `chore/api-gateway-v1` with the
Prompt 6 production-readiness branch. It does not apply migrations, deploy an
application, activate a catalogue version, or change production data.

The current chain remains authoritative because it includes later gateway,
quality, application-migration, release-control, and critical-containment work.
Safeguards present only in Prompt 6 are folded into existing current-chain
migrations to avoid competing timestamps and to preserve a 75-migration dry run.

## Nine Differences

The complete decision matrix is in
`docs/stackr-api/prompt-7-migration-differences.csv`.

Six current-only migrations are retained:

1. Curated CoroCoro Mew metadata coverage.
2. Stackr API gateway controls.
3. Quality, performance, and observability controls.
4. Application identity migration and provider-retirement evidence.
5. UUID-based release activation controls, hardened in place.
6. Critical security containment, expanded in place.

Three Prompt 6-only migrations are intentionally not copied:

1. Pokemon TCG import support is folded into the existing ingestion migration.
2. Catalogue release safeguards are implemented in the existing UUID release
   contract, while its legacy-view security fixes are in critical containment.
3. Legacy production compatibility checks are folded into critical containment.

## Restored Safeguards

The reconciliation restores four shared-chain behaviors that had regressed:

- `achievement_coin_rewards` has RLS and its authenticated read policy.
- `inventory_movements.binder_id` is UUID-compatible with `binders.id`.
- legacy `price_alerts` receives the guarded columns used by later indexes and
  application code.
- `promo` remains a first-class finish group in the canonical taxonomy and seed.

The ingestion foundation now keeps raw-record uniqueness within one import run,
retains cross-run history for provenance, and seeds the `ultra_rare` and
`mega_hyper_rare` rarities required by the approved Pokemon TCG adapter.

## Release Controls

The deployment scripts and database contract already use UUID release function
signatures, so those signatures are preserved. The implementation now adds:

- non-empty request IDs and reasons;
- idempotent activation and rollback requests;
- an invariant allowing at most one active catalogue version;
- advisory and table locking;
- draft-only activation;
- contiguous, pending mobile change-sequence checks;
- rejection of foreign or out-of-range assignments;
- forward-only rollback through a new compensating catalogue version.

An old deprecated or rolled-back version cannot be reactivated as a shortcut.
The production and manual rollback workflows now require the UUID of a validated
draft compensating version instead of the previously active catalogue UUID.

## Security And Compatibility

The final containment migration now sets these legacy views to security-invoker
execution when they exist:

- `public.catalogue_health`
- `public.japanese_catalogue_health`
- `public.tcg_card_printings`
- `public.tcg_set_cover_images`

The underlying image, price, check-summary, and sync-run tables receive explicit
RLS and restricted read grants. The compatibility preflight validates the live
binder UUID type, refuses incompatible inventory schemas, and adds only missing
price-alert fields.

The critical-containment rollback is deliberately conservative. It never makes
the private scan bucket public, restores broad market reads, disables RLS, or
returns the four views to security-definer execution. It removes only empty,
marker-owned compatibility objects.

## Automated Guard

`scripts/test-prompt7-migration-chain-reconciliation.mjs` requires:

- exactly 75 migration files;
- all six current-only migrations;
- no duplicate copy of the three folded Prompt 6 migrations;
- the restored historical fixes;
- ingestion provenance and rarity safeguards;
- UUID release readiness and forward-only rollback;
- legacy-view security-invoker controls;
- a rollback that cannot republish private scans.

The guard is part of `test:database-migrations`, so the existing platform CI
workflow runs it automatically.

## Verification Record

Pre-edit baseline:

- lint: passed with 19 existing warnings and no errors;
- mobile TypeScript: passed;
- backend TypeScript: passed;
- database migration contracts: passed;
- Stackr API v1 integration contract: passed;
- gateway tests: 17 passed;
- deployment tooling contract: passed;
- web export: passed with 92 routes.

Post-edit verification:

- lint: passed with the same 19 warnings and no errors;
- mobile and backend TypeScript: passed;
- canonical, ingestion, deployment, critical-containment, and Prompt 7
  migration contracts: passed;
- asset pipeline and recognition orchestrator contracts: passed;
- Stackr quality evaluation and protected observability tests: passed;
- OpenAPI/generated-client check and Stackr API v1 tests: passed;
- gateway tests: 17 passed; gateway dry build passed;
- recognition service: 16 passed with one dependency deprecation warning;
- model benchmark smoke tests and pilot dataset checks: passed;
- deployment tooling: passed;
- web export: passed with 92 routes;
- repository and exported-bundle secret scans: passed;
- Node audit gate: passed with zero critical findings. Existing findings are
  root 21 high/17 moderate/1 low, backend 6 high/4 moderate, gateway zero;
- Python dependency audit: no known vulnerabilities;
- recognition Docker build: not run because Docker is unavailable locally.

Read-only live advisors, before any migration application:

- security: 39 findings (4 errors, 19 warnings, 16 informational). The four
  errors are the security-definer legacy views addressed by this branch, but
  they remain live until an approved migration application;
- performance: 353 findings (252 warnings, 101 informational), including 41
  unindexed foreign-key, 100 auth RLS init-plan, 60 unused-index, 149
  multiple-permissive-policy, and 3 duplicate-index findings.

The linked production migration ledger still contains no remote migration
versions. This command completed successfully:

```text
npx --yes supabase@2.110.0 db push --linked --dry-run --include-all
```

It reported `dryRun: true` and exactly 75 pending migrations. It did not apply
schema, data, seed, role, storage, catalogue-version, or deployment changes.

## Production Decision

**NO-GO for production application.** The dry run and repository checks pass,
but Supabase dry run plans rather than executes the SQL. A fresh disposable
database rehearsal, a verified restorable backup/PITR point, and review of the
remaining live security findings are still required. No production push is
authorised by this document.

## Rollback

Before production application, rollback is simply to revert this branch. After
an approved future application, use the reviewed manual rollback scripts only
for additive objects they own and prefer a forward corrective migration for all
security and catalogue release state. Never reactivate a historical catalogue
version or make private scan storage public as a rollback technique.

## Exact Next Step

Open a draft pull request against `chore/api-gateway-v1` and let GitHub run the
Linux/Docker jobs. Then execute all 75 migrations against a fresh disposable
database and record the SQL-level result. Do not merge or run a non-dry-run
production database push.
