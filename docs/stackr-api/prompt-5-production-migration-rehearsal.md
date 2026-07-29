# Prompt 5: production migration rehearsal

## Current state found

- Production contains zero tracked Supabase migrations but 97 legacy `public`
  objects.
- Production has 43 binders, with `binders.id` stored as `uuid`.
- `inventory_movements` is absent.
- The legacy `price_alerts` table has zero rows and lacks the Minty columns.
- The six canonical/private schemas are absent from production.
- The repository contains 72 timestamped migrations.
- Provider catalogue and image legal-use status remains `under_review`.

Production was inspected read-only. No production migration, data write,
deployment, history repair, import, or catalogue activation occurred.

## Files created or changed

- `.github/workflows/catalogue-ingestion-ci.yml`
- `docs/stackr-api/production-migration-execution-plan.md`
- `docs/stackr-api/production-migration-matrix.csv`
- `docs/stackr-api/production-migration-reconciliation.md`
- `docs/stackr-api/prompt-5-production-migration-rehearsal.md`
- `package.json`
- `scripts/migration-reconciliation/generateMatrix.mjs`
- `scripts/migration-reconciliation/sqlChunks.mjs`
- `scripts/test-production-migration-reconciliation.mjs`
- `supabase/manual/rollback_20260729064011_legacy_production_migration_preflight.sql`
- `supabase/migrations/20260528114500_server_side_coin_awards.sql`
- `supabase/migrations/20260627120000_inventory_movements_and_binder_schema_repair.sql`
- `supabase/migrations/20260715143000_minty_insight_platform.sql`
- `supabase/migrations/20260729064011_legacy_production_migration_preflight.sql`

The unrelated existing `app.config.js` working-tree change is excluded.

## Migrations created

`20260729064011_legacy_production_migration_preflight.sql` adds a final,
idempotent compatibility guard. It creates only missing legacy objects, rejects
unsafe type mismatches, and marks its additions for conservative rollback.

Three older migrations receive compatibility or security corrections because
production tracks none of them:

- binder foreign keys now match the live `uuid` key;
- Minty price-alert columns are added before dependent indexes;
- the achievement reward lookup enables RLS with authenticated read access.

## Database rehearsal

- A temporary Supabase project received a schema-only clone of production.
- No customer data, user records, stored files, or secret values were copied.
- All 97 production objects were recreated before replay.
- All 72 migrations reached the end in timestamp order.
- Large files used parser-safe transport chunks, yielding 99 apply records.
- The final preflight passed twice and created no duplicate policies or indexes.
- Catalogue versions after testing: zero.
- Release events after testing: zero.
- Supabase security advisor: zero errors, 35 warnings, 12 information findings.
- Supabase performance advisor: 326 warnings, 383 information findings.

## Commands and results

- `npm run lint`: passed with five pre-existing unused-variable warnings.
- `npx tsc --noEmit`: passed.
- `npm run test:catalogue-schema`: passed.
- `npm run test:catalogue-ingestion`: passed.
- `npm run test:catalogue-release-controls`: passed.
- `npm run test:migration-reconciliation`: passed.
- `npm run test:stackr-api-v1`: passed.
- Repository build: not run because no `build` script exists.
- GitHub Catalogue Ingestion CI run 7: passed on the Prompt 5 pull request.

## Results

The corrected chain is DDL-compatible with the captured production schema.
The matrix classifies 50 migrations as `partially_present` and 22 as
`not_present`; none is marked applied merely from an object-name match.

The rehearsal does not prove live-row effects for migrations containing seed
or backfill DML because customer data was intentionally not copied.

## Unresolved blockers

1. Review migration rows containing DML against live production counts and
   constraints.
2. Approve provider catalogue and image legal-use status.
3. Review inherited Supabase advisor warnings.
4. Take and verify a production backup.
5. Review the final CLI `--dry-run --include-all` output.
6. Obtain explicit approval for the production release window.

Production migration and me5 activation remain **NO-GO**.

## Rollback procedure

Use the paired Prompt 5 rollback before repaired objects receive writes. It
removes only marker-owned additions and refuses to drop used data. Recent
canonical migrations have manual rollback files and must be reversed in
reverse order before activation.

If a legacy migration changes live data, restore the verified backup. Do not
delete migration-history rows or use `migration repair` to skip migrations.
Published catalogue data must be corrected through a new forward-only version.

## Exact next stage

Review the stacked Prompt 5 pull request and its CI. After human approval,
perform the read-only production dry run documented in
`production-migration-execution-plan.md`. Do not apply or activate anything in
production as part of that review.
