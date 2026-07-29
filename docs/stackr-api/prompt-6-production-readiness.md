# Prompt 6: production readiness dry run

## Current state found

- Production has zero tracked migrations and no canonical/private schemas.
- The repository contains exactly 72 timestamped migrations.
- Prompt 5 rehearsed all 72 against a schema-only production clone.
- Twenty-two migrations contain DML; all now have explicit scope, target, and aggregate live-data review entries.
- Production contains 43 binders, 1,672 binder cards, 615 user card variants, 23 user card flags, and 20,359 Pokemon cards.
- Production remains read-only and no catalogue version is active.

## Files created or changed

- `.github/workflows/catalogue-ingestion-ci.yml`
- `docs/stackr-api/production-dry-run-report.md`
- `docs/stackr-api/production-live-data-impact-review.md`
- `docs/stackr-api/production-migration-execution-plan.md`
- `docs/stackr-api/production-migration-matrix.csv`
- `docs/stackr-api/prompt-6-production-readiness.md`
- `package.json`
- `scripts/migration-reconciliation/dmlImpact.mjs`
- `scripts/migration-reconciliation/generateMatrix.mjs`
- `scripts/test-production-readiness.mjs`

The unrelated existing `app.config.js` change remains excluded.

## Migrations created

None. Prompt 6 is evidence and release-gating work only.

## Dry run

Supabase CLI `2.110.0` was used. The required command was attempted:

```powershell
npx supabase@latest db push `
  --linked `
  --dry-run `
  --include-all
```

It stopped with:

```text
LegacyProjectNotLinkedError: Cannot find project ref. Have you run supabase link?
```

Non-interactive CLI linking also stopped because no Supabase access token was
available. No secret was requested or exposed. The expected 72-migration plan
was not represented as an actual dry-run result.

## Live-data results

- Market seeds end with 28 existing identities and no net row-count change; 17 rows have field differences.
- Variant deduplication finds zero duplicate groups and deletes zero rows.
- Owned-card conversion would insert 981 owned-card identity rows and link 1,288 binder rows.
- Initial achievement reward backfill would insert 68 ledger rows.
- Twenty-six existing achievements match later reward seeds that do not backfill historical ledger rows.
- Provider-record and provider-mapping compatibility updates affect zero rows.
- Pricing-source upserts are value-preserving for all four current rows.
- Six new Stackr buckets are absent and would be inserted; five are private and one is public catalogue storage.
- Canonical, ingest, market, and model seeds target newly created schemas rather than legacy catalogue rows.

## Advisor results

- Security: 39 findings, including four security-advisor errors, 19 warnings, and 16 informational findings.
- Performance: 332 findings, including 231 warnings and 101 informational findings.

The four security errors are inherited security-definer views. They are not
reported as passing.

## Backup readiness

Backup/PITR metadata is not exposed by the connected Supabase database tools.
The signed-in dashboard could not be inspected because browser control was
unavailable. No verified recovery point was recorded. Supabase documents the
backup dashboard and restoration limits at
https://supabase.com/docs/guides/platform/backups.

## Test status

- `npm run lint`: passed with five pre-existing unused-variable warnings and zero errors.
- `npx tsc --noEmit`: passed.
- `npm run test:catalogue-schema`: passed.
- `npm run test:catalogue-ingestion`: passed.
- `npm run test:catalogue-release-controls`: passed.
- `npm run test:migration-reconciliation`: passed.
- `npm run test:production-readiness`: passed.
- `npm run test:stackr-api-v1`: passed.
- General production build: not run because the repository has no `build` script.
- GitHub CI: pending until the draft pull request is opened.

A final read-only production snapshot at `2026-07-29 16:23:31 UTC` matched the
starting counts, still showed zero tracked migrations, zero canonical schemas,
and zero new Stackr buckets. Production remained unchanged.

## Unresolved blockers

1. Authenticated CLI dry-run output for exactly 72 migrations.
2. Verified restorable backup or PITR recovery point.
3. Security disposition for four advisor errors.
4. Approval of the owned-card and binder-link conversion.
5. Product decision for later-coded historical achievement rewards.
6. Provider catalogue and image legal-use approval.
7. Explicit production release owner and maintenance-window approval.

## Rollback procedure

Use the reviewed manual rollback scripts in reverse order before activation.
If live-row DML has executed or a rollback guard refuses, restore the verified
database backup and execute the separate Storage recovery plan. Never rewrite
migration history or delete published mobile delta history.

## Recommendation

Production remains **NO-GO**. This branch is suitable for review as a
readiness-evidence change, but it does not authorise a migration, me5 import,
catalogue activation, or deployment.

## Exact next stage

Run the authenticated production dry run from a local terminal, verify the
backup recovery point in the Supabase dashboard, resolve the reward and
ownership approvals, and clear the security/legal gates. Only then schedule a
separate explicitly approved production migration window.
