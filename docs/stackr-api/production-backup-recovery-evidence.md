# Production Backup and Recovery Evidence

Date: 2026-07-30

Production project: `oakdbbzdqwurpjnoqhmu`

Repository branch: `codex/prompt7-migration-chain-reconciliation`

Pull request: [#12](https://github.com/tberridge86/Stackr/pull/12)

## Decision

The manual backup and restore gate passed. Production was read only throughout
the exercise. No migration was applied, no catalogue version was activated,
and PR #12 remains an open draft and is not merged.

The backup gate is no longer a release blocker. The overall production release
remains NO-GO until the updated branch passes CI, the final production dry run
is repeated, and a separate production migration approval is given.

## Current State

- Supabase organization plan: Pro.
- Production PostgreSQL version: `17.6.1.104`.
- Production migration ledger: empty.
- Repository migration count: 75.
- PITR: disabled.
- Completed managed physical backups visible: 8, dated 2026-07-23 through
  2026-07-30.
- Paid disposable branch creation was rejected before the plan upgrade and did
  not create a branch or incur branch charges. No branch was created after the
  upgrade.

## Manual Backup

The backup was created using Supabase CLI 2.110.0 connection filtering and
PostgreSQL 17.10 client tools. Short-lived database credentials were retained
in process memory and were not written to the repository or backup artifacts.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| `roles.sql` | 297 | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| `schema.sql` | 173,429 | `c1d0563fd6c29ea4d541575f5bb14c595a0911ab2bbeb720b2096a1425daf47a` |
| `data.sql` | 414,361,485 | `f02fe10d5263a4749814d78df52384d77462a4a0a58c2ff17a0a6e6f2dcbabd9` |
| `managed-auth-storage-schema.sql` | 106,053 | `0fcedf10c659cc6a11341d41bb48696746a3f6f4a72e3eb947057f0a6c570449` |
| `managed-auth-storage.dump` | 201,792 | `72bf1e2418a4b7e779e744b995912ae3584d00d94db6142e4dc002d650385fe6` |
| `source-baseline.json` | generated evidence | `e9bcca8da60e5063b201d08be0443aae302405cd575af9a85d7302e5dd3bf0a1` |
| `restore-validation.json` | generated evidence | `ff152bef58149d80fe13e0430fb3c607a6976bd0d83849fab6f685a591a1f18f` |
| `checksums.sha256` | 106 entries | `85d8fe86883b40d371922caeaaab22166e740524ba1756e3bd3e03fc85d241ec` |

Supabase database dumps retain Storage metadata but not object bodies. All 95
Storage objects were therefore archived separately using a manifest that maps
the original bucket and object key to a content-hashed local file.

| Bucket | Objects | Bytes |
| --- | ---: | ---: |
| `card-scans` | 10 | 0 |
| `profile-backgrounds` | 9 | 7,428,708 |
| `trade-listings` | 76 | 38,658,959 |

All 95 object downloads passed SHA-256 verification. The ten `card-scans`
records are zero-byte source objects and were retained and reported as such.

## Restore Rehearsal

The backup was restored to a fresh PostgreSQL 17.10 database bound only to
`127.0.0.1:55432`. No hosted project or billable Supabase branch was used.

The official dump assumes hosted `auth` and `storage` schemas already exist.
For an independent local restore, their production definitions were retained
in both plain SQL and PostgreSQL custom archive formats. The custom archive was
split into pre-data and post-data sections so dependencies were restored in
this order:

1. Supabase API roles and standard extensions.
2. Auth and Storage tables and functions.
3. Auth and Storage constraints and indexes, except one deferred trigger.
4. Public application schema.
5. The deferred `auth.users` trigger that calls `public.handle_new_user`.
6. Auth, Storage, and public data in one transaction with triggers disabled.

The local restore omitted only the `supabase_vault` extension declaration. It
is platform managed, unavailable in the standard local PostgreSQL package, and
has no referenced objects in the backed-up application schema. The original
backup file was not changed.

The successful restore completed in 43.1 seconds, produced a 467,703,475-byte
database, and generated an empty error log.

## Validation Results

- Source tables measured: 110.
- Restored tables measured: 110.
- Source rows measured: 460,991.
- Restored recoverable rows: 460,853.
- Recoverable table or row-count mismatches: 0.
- Relation-count match: passed.
- Function-count match: passed.
- Trigger-count match: passed.
- Policy-count match: passed.
- Extension match except platform-managed `supabase_vault`: passed.
- Invalid constraints: 0.
- RLS-enabled tables: 103.
- Policies: 164.
- `auth.users` insert trigger present: 1.
- `public.handle_new_user` function present: 1.
- Storage checksum failures: 0.

The 138-row difference is expected and consists only of 77 rows from
`auth.schema_migrations` and 61 rows from `storage.migrations`. Supabase's
supported data dump excludes these platform-managed histories so the target
platform retains its own service schema version. All application, Auth user,
session, Storage bucket, and Storage object metadata counts matched exactly.

## Migration and Repository Checks

- Disposable GitHub rehearsal run
  [30491110344](https://github.com/tberridge86/Stackr/actions/runs/30491110344)
  passed in 1 minute 54 seconds. It loaded the production schema baseline,
  applied all 75 migrations, validated the 75-row ledger and resulting schema,
  ran database tests, and stopped the disposable database.
- `npm run test:database-migrations`: passed all canonical catalogue,
  ingestion, deployment, critical-security, and Prompt 7 contracts.
- `npm run lint`: passed with 0 errors and the same 19 inherited warnings.
- `npm run typecheck`: passed.
- `npm run typecheck:backend`: passed.
- `supabase db push --linked --dry-run --include-all`: passed with
  `dryRun: true` and exactly 75 pending migrations.
- Production migration ledger after the dry run: unchanged and empty.
- Current production security advisors: 39 total, consisting of 4 errors, 19
  warnings, and 16 information notices. The four errors are the known legacy
  security-definer views addressed by the pending migration chain:
  `tcg_card_printings`, `catalogue_health`, `tcg_set_cover_images`, and
  `japanese_catalogue_health`.
- Supabase security-definer view remediation reference:
  <https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view>

## Encrypted Recovery Package

The verified backup is stored outside the repository at:

`D:\Stackr-secure-backups\stackr-production-pre-migration-20260730.7z`

- Archive bytes: 107,314,930.
- Archive SHA-256:
  `fa2eff353bf534245af8f32957f39951261bef9f9f8ed456b5b15c0fd7bd8734`.
- Encryption: AES-256 7z archive with encrypted headers.
- Recovery key: Windows DPAPI protected for the current Windows user.
- Archive integrity test: passed.
- Recovery script extraction test: passed.
- Recovered files: 107.
- Rechecked checksum entries: 106.
- Recovery checksum failures: 0.

The archive, DPAPI key, recovery script, README, and archive checksum file must
remain together and must never be committed to GitHub. The DPAPI key is tied
to the current Windows account. A separate copy on an encrypted external drive
is still required for protection against loss of this computer.

## Rollback Procedure

1. Stop migration processing and prevent new catalogue activation.
2. Record the failed request ID, migration version, and database timestamp.
3. Prefer the closest completed Supabase physical backup from before the
   migration when restoring the hosted project. Plan for service downtime.
4. If managed restoration is unavailable, use the encrypted manual package to
   build and validate a replacement project before changing application
   configuration.
5. Restore Storage object bodies from `storage-manifest.json` only after their
   hashes match the manifest.
6. Re-run schema, row-count, RLS, policy, constraint, API, and catalogue health
   validation before reopening writes.

## Exact Next Stage

Commit this evidence to the existing draft PR branch, run all relevant CI and
database checks, repeat `supabase db push --linked --dry-run --include-all`, and
review current Supabase security advisors. Do not merge PR #12 and do not run a
non-dry-run production push without separate approval.
