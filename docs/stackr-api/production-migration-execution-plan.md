# Production migration execution plan

## Current gate

This runbook is not authorisation to execute. Production remains **NO-GO**.

Release blockers:

1. Run and retain the authenticated CLI dry-run output for exactly 72 migrations.
2. Verify a restorable production backup or PITR recovery point in the Supabase dashboard.
3. Resolve or explicitly accept the four security-advisor errors.
4. Approve the 981-row owned-card conversion and 1,288 binder links.
5. Decide whether 26 existing later-coded achievements should receive retroactive rewards.
6. Approve catalogue and image legal-use status; both remain `under_review`.
7. Approve the Git commit, matrix checksum, release owner, and maintenance window.

Supabase states that scheduled backups are available in **Database > Backups**
for paid plans and that Storage object contents are not included in database
backups: https://supabase.com/docs/guides/platform/backups

## Read-only dry run

From an authenticated local terminal at the reviewed commit:

```powershell
npx supabase@latest link --project-ref oakdbbzdqwurpjnoqhmu

npx supabase@latest db push `
  --linked `
  --dry-run `
  --include-all
```

Save the output as release evidence without including the access token or
database password. Verify exactly 72 ordered versions and compare them with
`production-migration-matrix.csv`. Any discrepancy returns the decision to
**NO-GO**. Do not repair or reset migration history.

## Backup gate

Record all of the following before a write window is approved:

- backup type: scheduled, PITR, or operator-generated logical backup;
- successful backup timestamp and recovery point before the release;
- retention window and expected recovery-point loss;
- restore owner and tested restoration procedure;
- separate plan for Storage objects, which database backup does not restore;
- production project ref and Git commit.

Prompt 6 could not inspect dashboard backup metadata through the connected
database interface, and browser control was unavailable. Backup readiness is
therefore unverified and blocking.

## Controlled release

Only after every gate above is signed off:

1. Freeze catalogue and schema writes.
2. Recheck the production migration ledger is still empty.
3. Re-run the authenticated dry run and compare its output with the approved evidence.
4. Apply the reviewed chain exactly once from the approved commit using an interactive release process.
5. Stop at the first error. Do not skip ahead or alter migration history.
6. Re-run security and performance advisors.
7. Verify auth, binder reads/writes, catalogue reads, search, manifest, and delta endpoints.
8. Confirm no catalogue version, model, price estimate, or me5 import was activated by the schema release.
9. End the write freeze only after the release owner signs the checks.

The mutating apply command is intentionally omitted from documentation and CI
while production is **NO-GO**.

## Rollback

Before catalogue activation, use the reviewed manual rollback files for recent
canonical migrations in reverse timestamp order. The Prompt 5 preflight
rollback removes only marker-owned additions and refuses to drop used tables.

If customer-row DML has run, a rollback guard refuses, or a legacy migration
partially commits, stop and restore the verified backup. Do not delete
migration-ledger rows or force history repair. Storage recovery is separate
from database recovery.

Published catalogue changes use forward-only compensation with a higher change
sequence. Never delete published delta history.

## After schema release

1. Resolve provider catalogue and image legal-use status.
2. Run the me5 importer in production dry-run mode.
3. Import raw records with complete provenance while under-review assets remain private.
4. Create a draft catalogue version and run readiness checks.
5. Activate only through a separate explicit approval.
