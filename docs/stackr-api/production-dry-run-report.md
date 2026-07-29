# Production migration dry-run report

## Decision

Production remains **NO-GO**. The required authenticated Supabase CLI dry run
did not execute, so the expected 72-migration plan has not been independently
confirmed against the production connection.

Production project: `oakdbbzdqwurpjnoqhmu`

Evidence time: `2026-07-29 16:20:13 UTC`

CLI version: `2.110.0`

## Command attempted

```powershell
npx supabase@latest db push `
  --linked `
  --dry-run `
  --include-all
```

Result:

```text
LegacyProjectNotLinkedError: Cannot find project ref. Have you run supabase link?
```

The repository has no local Supabase project link. A preceding non-interactive
link attempt could not authenticate because this terminal has no Supabase CLI
access token. The CLI correctly refused to continue. No token, database
password, or service credential was requested in chat or written to the
repository.

The connected Supabase read-only interface separately reports an empty
production migration ledger. That corroborates the Prompt 5 inventory, but it
is not a substitute for the mandated CLI dry-run output.

## Expected plan

The repository contains exactly 72 timestamped migrations. The Prompt 5
schema-only rehearsal applied all 72 in timestamp order. The generated matrix
also contains exactly 72 ordered rows and currently has SHA-256:

```text
56fa7c51911f9fc77452a5bae69d47603f56a9a79fe6eb4ff8c1edde31672cc1
```

These facts establish the expected result, not the actual production dry-run
result. A release owner must run the command above from an authenticated local
terminal and verify all of the following before the decision can change:

1. Exactly 72 versions are listed.
2. Versions are listed in filename timestamp order.
3. No unexpected destructive statement or remote-only migration appears.
4. No parser, permission, extension, connection, or migration-history error is reported.
5. The captured output names the production project and reviewed Git commit.

Any mismatch keeps production at **NO-GO**. Do not use migration-history repair
to make an unexpected result disappear.

## Production effect

No migration, import, catalogue activation, Railway deployment, or production
database write occurred. All database inspection used aggregate-only `SELECT`
queries. Supabase documents that `db push --dry-run` prints the proposed changes
without applying them: https://supabase.com/docs/reference/cli/supabase-db-push
