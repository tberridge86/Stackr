# Prompt 7 Migration-Chain Reconciliation

## Scope

This review reconciles the migration chain on `chore/api-gateway-v1` with the
Prompt 6 production-readiness branch. It does not apply migrations, deploy an
application, activate a catalogue version, or change production data.

The current chain remains authoritative because it includes later gateway,
quality, application-migration, release-control, and critical-containment work.
Safeguards present only in Prompt 6 are folded into existing current-chain
migrations to avoid competing timestamps. The later staging reconciliation
initially produced a 76-migration chain. The latest base branch adds the legacy
catalogue operational-access hardening migration, producing the current
77-migration chain.

## Nine Differences

The complete decision matrix is in
`docs/stackr-api/prompt-7-migration-differences.csv`.

Seven current-only migrations are retained:

1. Curated CoroCoro Mew metadata coverage.
2. Stackr API gateway controls.
3. Quality, performance, and observability controls.
4. Application identity migration and provider-retirement evidence.
5. UUID-based release activation controls, hardened in place.
6. Critical security containment, expanded in place.
7. Legacy catalogue operational-access hardening from the latest base branch.

Three Prompt 6-only migrations are intentionally not copied:

1. Pokemon TCG import support is folded into the existing ingestion migration.
2. Catalogue release safeguards are implemented in the existing UUID release
   contract, while its legacy-view security fixes are in critical containment.
3. Legacy production compatibility checks are folded into critical containment.

## Restored Safeguards

The reconciliation restores six shared-chain behaviors that had regressed:

- `achievement_coin_rewards` has RLS and its authenticated read policy.
- `inventory_movements.binder_id` is UUID-compatible with `binders.id`.
- legacy `price_alerts` receives the guarded columns used by later indexes and
  application code.
- `promo` remains a first-class variant/distribution group, while its stable
  compatibility finish code is classified under `other` rather than presented
  as a physical card finish.
- the owned-card backfill removes obsolete four-column uniqueness constraints
  and indexes by column signature before creating the condition-aware identity;
- every trigram-index migration places `extensions` on its transaction-local
  search path after installing `pg_trgm`.

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

- exactly 77 migration files;
- all seven current-only migrations;
- no duplicate copy of the three folded Prompt 6 migrations;
- the restored historical fixes;
- ingestion provenance and rarity safeguards;
- production-shape owned-card uniqueness compatibility;
- deterministic `pg_trgm` operator-class resolution;
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
- recognition Docker build: not run locally because Docker is unavailable;
- GitHub CI: all nine jobs passed, including the Linux recognition-container
  image build and health check.

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

At that pre-merge checkpoint it reported `dryRun: true` and exactly 75 pending
migrations. The later taxonomy reconciliation migration brought the reviewed
branch to 76 files, and the latest legacy catalogue operational-access hardening
migration now brings the current chain to 77 files. No hosted-production command
has validated the 77-file chain. The historical dry run did not apply schema,
data, seed, role, storage, catalogue-version, or deployment changes.

### Fresh production-copy rehearsal

The encrypted manual production backup was checksum-verified and restored to a
disposable PostgreSQL 17.10 instance listening only on `127.0.0.1`. The source
backup was PostgreSQL 17.6 and contained 110 tables plus 95 Storage objects.
All 95 object checksums matched and no recoverable application-data mismatch was
found. Platform-owned migration history was deliberately excluded.

The restored managed `auth` and `storage` schemas required their standard local
role grants to be reapplied because the sectioned dump excludes managed ACLs.
The local PostgreSQL distribution does not contain the platform-managed
`supabase_vault` extension; the backup contained no referenced Vault objects, so
that documented platform exception did not affect the rehearsal.

Against a fresh clone of that baseline:

- the dry run planned exactly 76 migrations, from `20260513170000` through
  `20260730080047`;
- all 76 migrations executed successfully in order;
- the migration ledger contains exactly those 76 versions;
- a second dry run returned `upToDate: true` with no pending migrations;
- all constraints validate;
- the four legacy views use `security_invoker=true`;
- `promo` is active under `variant_group=promo` and its compatibility finish is
  active under `finish_group=other`;
- no obsolete four-column owned-card uniqueness object remains, while the
  seven-column identity index exists;
- `pg_trgm` is installed in the `extensions` schema;
- all private canonical schemas exist with RLS on every table.

Machine-readable evidence is in
`deploy/evidence/production-backup-migration-rehearsal-2026-07-30.json`.
After validation, the local database server was stopped and all 6,810 files in
the plaintext rehearsal area were truncated to zero bytes. The encrypted backup
was retained and its SHA-256 checksum was reverified.

This remains valid historical recovery and execution evidence for the former
76-migration chain. The 77th migration was added afterward, so the current chain
requires a fresh isolated rehearsal from the same production-shaped baseline
before it can be considered for promotion.

## Production Decision

**NO-GO for production application.** Backup recovery is verified, but the
clean-room execution evidence covers only the former 76-migration chain.
Production remains explicitly unauthorised. The draft pull request must pass
fresh GitHub CI, the full 77-migration chain must be rehearsed from scratch, and
the hosted production migration ledger and dry run must be rechecked against the
final commit before any separately approved cutover. No production push is
authorised by this document.

## Rollback

Before production application, rollback is simply to revert this branch. After
an approved future application, use the reviewed manual rollback scripts only
for additive objects they own and prefer a forward corrective migration for all
security and catalogue release state. Never reactivate a historical catalogue
version or make private scan storage public as a rollback technique.

## Exact Next Step

Commit and push the reconciled branch, then require fresh GitHub CI on the draft
pull request. Rehearse all 77 migrations from scratch against a disposable
production-shaped baseline. After review, and only with separate production
authorisation, repeat the read-only hosted migration-history comparison and the
linked 77-file dry run. Do not merge the draft pull request or run a non-dry-run
production database push yet.
