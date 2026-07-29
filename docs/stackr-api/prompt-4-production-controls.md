# Prompt 4: production controls and migration reconciliation

## Scope

Prompt 4 reviews the me5 staging work for release safety, remediates the known
database-control gaps, and prepares a production migration path. It does not
write production data, deploy Railway, merge a pull request, approve provider
licensing, or activate a catalogue version.

## Current state found

- Branch: `codex/catalogue-production-controls`, stacked on
  `codex/me5-staging-import`.
- Production migration history: zero tracked migrations.
- Production canonical schemas: absent.
- Production security advisor: four existing security-definer view errors.
- Staging migration history: seven catalogue migrations after this Prompt 4
  migration was applied.
- Staging catalogue state after transactional tests: 121 change rows, zero
  versions, zero release events, and no test fixtures.
- Provider catalogue and image rights remain `under_review`; Prompt 4 does not
  change that decision.

## Fixes prepared

### Legacy view security

The migration conditionally hardens the four production legacy views with
`security_invoker = true`. It removes inherited write-like privileges and
retains read access for `anon`, `authenticated`, and `service_role`.

The views depend on RLS-protected diagnostic tables. Five narrow compatibility
policies and column grants preserve existing read paths while excluding raw
price payloads, provider coverage payloads, sync summaries, and error messages.

Supabase documents that views owned by `postgres` use owner rights by default
and recommends `security_invoker = true` on PostgreSQL 15 and later:
https://supabase.com/docs/guides/database/postgres/row-level-security#views

### Catalogue activation

The migration adds:

- a partial unique index enforcing one active published catalogue version;
- a service-only readiness function;
- an atomic, serialised activation function;
- an immutable private release-event table with request IDs;
- a service-only forward rollback function.

Activation requires a draft version with a complete sequence range beginning at
the next pending mobile change. It quarantines range conflicts by failing rather
than reassigning changes from another version.

Rollback does not reactivate an old sequence range. It requires a new draft
version containing compensating changes after the failed version's maximum
sequence. This keeps mobile delta sync monotonic.

## Files created or changed

- `supabase/migrations/20260729055009_catalogue_production_release_controls.sql`
- `supabase/manual/rollback_20260729055009_catalogue_production_release_controls.sql`
- `supabase/manual/production_migration_baseline_audit.sql`
- `scripts/test-catalogue-release-controls.ts`
- `.github/workflows/catalogue-ingestion-ci.yml`
- `docs/stackr-api/production-migration-reconciliation.md`
- `docs/stackr-api/prompt-4-production-controls.md`
- `package.json`

## Staging validation

The migration was applied only to staging project `lmwfhvexfcoyeuoyrlco`.

Transactional function tests proved:

- readiness accepts a complete first version;
- activation assigns all 121 existing change rows atomically;
- retrying the same activation is idempotent;
- only one active published version exists;
- rollback requires new compensating sequences;
- retrying rollback is idempotent;
- the failed version is retained as `rolled_back`;
- three release audit events are generated for activation, rollback activation,
  and rollback;
- the transaction rollback restored the original staging data.

Transactional compatibility fixtures proved:

- all four legacy views become security invoker;
- public read access remains;
- public write-like view privileges are absent;
- all five narrow RLS policies are created;
- `card_prices.display_price` remains readable;
- `card_prices.raw_payload` remains inaccessible;
- all fixture objects are removed by transaction rollback.

Staging Supabase security advisor result after migration: zero findings.

## Commands and results

- `npm run lint`: passed.
- `npx tsc --noEmit`: passed.
- `npm run test:catalogue-schema`: passed.
- `npm run test:catalogue-ingestion`: passed.
- `npm run test:catalogue-release-controls`: passed.
- `npm run test:stackr-api-v1`: passed.
- `git diff --cached --check`: passed.
- Staging activation and rollback transaction: passed and rolled back.
- Staging legacy-view compatibility transaction: passed and rolled back.
- Staging Supabase security advisor: zero findings.

There is no repository `build` script. The catalogue GitHub workflow runs lint,
type checking, catalogue migration tests, ingestion tests, release-control
tests, and API tests.

## Production status

Production was queried read-only. No production migration, data write,
catalogue activation, deployment, or permission change was performed.

The four production advisor errors remain until the migration chain is safely
reconciled and this migration is applied. Advisor remediation reference:
https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

## Rollback

Before any catalogue activation, run the manual rollback SQL to remove the
release functions and unique index and restore the legacy view execution mode.
The rollback does not restore accidental public write privileges.

If release audit rows exist, the audit table is retained. Catalogue data changes
must be reversed through a new forward-only compensating version; deleting
historical change rows is not supported.

## Production dry run

```powershell
npx supabase@latest db push `
  --linked `
  --dry-run `
  --include-all
```

This command must remain a dry run until the migration reconciliation document
is complete and reviewed.

## Recommendation

- Pull-request review: **GO**.
- Production database migration: **NO-GO** until migration history is
  reconciled on a production-like clone.
- me5 catalogue activation: **NO-GO** until provider metadata and image rights
  are approved and a production draft passes activation readiness.

## Exact next stage

Prompt 5 should reconcile every repository migration against a production-like
clone, produce the signed migration matrix, rehearse the full pending migration
chain, and return a production execution plan. It must not repair production
history or activate me5 without explicit approval.
