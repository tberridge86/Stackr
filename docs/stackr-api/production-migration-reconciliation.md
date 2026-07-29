# Production migration reconciliation

## Purpose

This runbook establishes whether the existing production database can safely
adopt the repository migration chain. It does not authorise catalogue data
imports, catalogue activation, or migration-history repair.

Production project: `oakdbbzdqwurpjnoqhmu`

Validated staging project: `lmwfhvexfcoyeuoyrlco`

## Current evidence

- The repository contains 71 timestamped SQL migrations through
  `20260729055009_catalogue_production_release_controls.sql`.
- The production Supabase migration API reports zero tracked migrations.
- Production has no `catalog`, `ingest`, `market`, `ml`, `api`, or `audit`
  relations.
- Production contains legacy `public` catalogue tables and views that overlap
  with early repository migrations.
- The four production views currently reported as security-definer are
  `catalogue_health`, `japanese_catalogue_health`, `tcg_card_printings`, and
  `tcg_set_cover_images`.
- Staging tracks seven catalogue-specific migrations. Two staging proxy
  migrations are intentionally absent from the production migration chain.

An empty migration history is not proof that all repository migrations are
unapplied. Existing production objects show that at least part of the legacy
schema was created outside the tracked migration mechanism.

## Non-negotiable gate

Do not run `supabase migration repair`, `supabase db push`, or an individual
production migration until every older migration has been classified as one
of:

1. `fingerprint_match`: all relevant objects and behaviour match the migration;
2. `partially_present`: an explicit compatibility migration is required;
3. `not_present`: the migration must run normally;
4. `superseded`: a reviewed replacement migration covers it without losing
   data or permissions.

Migration timestamps must never be marked applied solely because similarly
named tables exist.

## Read-only evidence commands

Run from the repository root after linking the Supabase CLI to production:

```powershell
npx supabase@latest migration list --linked

npx supabase@latest db dump `
  --linked `
  --schema public `
  --file outputs/production-public-schema-before-catalogue.sql

npx supabase@latest db push `
  --linked `
  --dry-run `
  --include-all
```

Run `supabase/manual/production_migration_baseline_audit.sql` in the SQL editor
and retain its output with the release evidence. The script is read-only.

The dry run is expected to report a large migration set while production
history is empty. That output is evidence, not approval to remove `--dry-run`.

## Required reconciliation artefact

Create a reviewed CSV or Markdown table with one row for every migration and
these columns:

- migration version;
- migration name;
- classification;
- compared production objects;
- definition, constraint, policy, trigger, and grant fingerprints;
- data compatibility notes;
- approved action;
- reviewer;
- evidence timestamp.

For data migrations, compare stable business keys and counts without exporting
customer data. For functions and views, compare normalised definitions. For
tables, compare columns, types, defaults, constraints, indexes, RLS state,
policies, triggers, and grants.

## Safe release sequence

1. Take a production backup and record its recovery point.
2. Complete the 71-row migration reconciliation artefact.
3. Rehearse the approved baseline plus pending migrations on a production-like
   clone, not the current me5 staging database.
4. Run all repository migration, ingestion, API, and security checks on that
   clone.
5. Review the dry-run output and schema diff.
6. Obtain explicit production approval for any history writes.
7. Apply migrations in one controlled release window.
8. Run Supabase security advisors and catalogue API smoke tests.
9. Prepare a draft catalogue version, run the readiness function, and activate
   only after data and licensing gates pass.

## Decision

Production migration execution remains **NO-GO**. The repository now contains
the controls needed after reconciliation, but production history and the local
migration chain are not yet aligned.
