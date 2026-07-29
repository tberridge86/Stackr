# Production migration execution plan

## Current gate

This is a runbook, not an authorisation to execute. Production remains
**NO-GO**.

Blocking approvals:

1. Review every matrix row containing DML against current production data.
2. Approve provider catalogue and image legal-use status; both remain
   `under_review`.
3. Review the remaining Supabase security-advisor warnings.
4. Take and verify a production backup with a recorded recovery point.
5. Approve the final dry-run output and release window.

## Read-only dry run

Run from the repository root using a local authenticated Supabase CLI session:

```powershell
npx supabase@latest link --project-ref oakdbbzdqwurpjnoqhmu

npx supabase@latest db push `
  --linked `
  --dry-run `
  --include-all
```

Expected result: all 72 local versions are listed because the production
migration ledger is empty. Any different count, SQL ordering, destructive
statement, or new error restores the **NO-GO** decision.

Do not run `migration repair`. The rehearsal proved that the corrected chain
can replay in order; marking rows applied would discard the compatibility and
security changes.

## Controlled release

Only after the five blockers are approved:

1. Freeze catalogue and schema writes for the release window.
2. Record the production project ref, Git commit, matrix checksum, backup
   recovery point, and dry-run output.
3. Apply the migration chain once with `--include-all` from the reviewed commit.
4. Stop immediately on the first error; do not repair history or skip ahead.
5. Run the Supabase security and performance advisors.
6. Verify auth, binder reads/writes, catalogue reads, search, manifest, and
   delta endpoints.
7. Confirm no catalogue version is active and no me5 data was imported by the
   schema release.
8. End the write freeze only after the release owner signs the checks.

The production apply command is intentionally not automated in CI. It requires
an interactive release decision and must never be run from an Expo client or a
developer branch.

## Rollback

Before catalogue activation, use the reviewed manual rollback files for the
recent canonical migrations in reverse order. The Prompt 5 preflight rollback
removes only objects carrying its ownership marker and refuses to drop a table
after data has been written.

If a legacy migration changes live rows or a rollback guard refuses to proceed,
stop and restore the verified production backup. Do not delete migration-ledger
rows, drop customer tables, or force a history repair.

Catalogue data rollback is forward-only: create a compensating catalogue
version with a higher change sequence. Never delete published delta history.

## Post-schema stages

1. Resolve legal-use status for provider records and images.
2. Run the me5 importer in production dry-run mode.
3. Import raw records with provenance while assets remain private when under
   review.
4. Create a draft catalogue version and run readiness checks.
5. Activate only with a separate explicit approval.
