# Production migration reconciliation

## Scope

Prompt 5 reconciles the local migration chain with the production schema and
rehearses it on an isolated, schema-only production baseline. It does not write
production data, repair production migration history, deploy Railway, import
me5, or activate a catalogue version.

Production project: `oakdbbzdqwurpjnoqhmu`

Validated me5 staging project: `lmwfhvexfcoyeuoyrlco`

Temporary rehearsal project: `isfybjkwvcuqpqtmkujo`

Evidence date: `2026-07-29`

## Production state

- Supabase reports zero production migration-history rows.
- Production has 97 inventoried `public` objects: 79 tables, six views, ten
  functions, and two sequences.
- Production has no `catalog`, `ingest`, `market`, `ml`, `api`, or `audit`
  schema.
- `public.binders.id` is `uuid`; production contains 43 binder rows.
- `public.inventory_movements` is absent.
- `public.price_alerts` contains zero rows and lacks the Minty `active` column.
- `public.pokemon_cards` contains 20,359 rows.
- Production remained read-only throughout this work.

An empty ledger is not evidence that the legacy schema is absent. The migration
matrix therefore uses only `partially_present` or `not_present`; no row is
claimed as `fingerprint_match` without a complete pre-migration fingerprint.

## Migration matrix

The authoritative 72-row matrix is
`docs/stackr-api/production-migration-matrix.csv`.

| Classification | Rows | Meaning |
| --- | ---: | --- |
| `partially_present` | 50 | Production overlaps the migration, but no ledger row proves it was applied in full. |
| `not_present` | 22 | The migration's target schema or primary objects are absent from production. |
| `fingerprint_match` | 0 | Deliberately unused because full before-state equality was not established per migration. |
| `superseded` | 0 | No migration is skipped or replaced. |

Every local migration must be replayed in order. Do not use migration-history
repair merely because a similarly named production object exists.

## Rehearsal method

1. The me5 staging project was paused with the user's approval so a free
   temporary project could be created without increasing recurring cost.
2. A schema-only baseline was generated from PostgreSQL catalogue metadata.
   No customer rows, authentication users, object contents, or secrets were
   copied.
3. The baseline recreated all 97 production objects. Relation signatures and
   all ten function definitions matched the production source before replay;
   ACL differences were ordering-only.
4. The migration chain was replayed in timestamp order. Large migrations were
   sent in parser-safe statement chunks because the database tool has a request
   size and wait window. Chunk boundaries never split comments, strings, quoted
   identifiers, or dollar-quoted function bodies.
5. Expected schemas, compatibility repairs, release controls, and migration
   records were checked after replay.

The 72 source migrations produced 99 rehearsal apply records because large SQL
files were split for transport. That does not change production migration
versions or SQL ordering.

## Reconciliation fixes

### Binder foreign key

`20260627120000_inventory_movements_and_binder_schema_repair.sql` initially
failed because it declared `inventory_movements.binder_id` as `text` while the
live `binders.id` is `uuid`. The column now uses `uuid`.

### Legacy price alerts

`20260715143000_minty_insight_platform.sql` encountered an existing legacy
`price_alerts` table without the Minty fields. It now adds every required field
with guarded `ADD COLUMN IF NOT EXISTS` statements before indexes are created.

### Final preflight

`20260729064011_legacy_production_migration_preflight.sql` repeats those two
checks for environments where an older migration may already be marked
applied. It fails closed on an incompatible binder type and marks only objects
it creates. The paired manual rollback removes only marker-owned, unused
objects and refuses destructive rollback after writes.

### Reward-table RLS

The clean-chain security advisor found one error: RLS was disabled on
`achievement_coin_rewards`. The historical migration now enables RLS and gives
authenticated users the intended explicit read policy. Revalidation returned
zero security errors.

## Rehearsal results

- All 72 migrations reached the end of the ordered schema rehearsal.
- All six canonical schemas exist after replay.
- `inventory_movements.binder_id` is `uuid`.
- `price_alerts.active` is `boolean`.
- Canonical catalogue, raw-ingest provenance, release-event, recognition, and
  market objects exist.
- Catalogue versions and release events remain empty; nothing was activated.
- The embedding-index tool timed out after its final chunk committed. The
  migration ledger and expected objects confirmed the commit before execution
  continued, so the chunk was not replayed.
- Security advisor after the RLS correction: zero errors, 35 warnings, 12
  informational findings.
- Performance advisor: 326 warnings and 383 informational findings, dominated
  by legacy unindexed foreign keys, RLS init-plan suggestions, unused indexes,
  and overlapping permissive policies.

The remaining advisor findings are recorded as inherited or follow-up work;
they are not reported as passing. Remediation reference:
https://supabase.com/docs/guides/database/database-linter

## Limitation

This was a schema-only production baseline. It proves DDL compatibility with
the observed production schema, but it cannot prove the effects of seed,
backfill, update, or delete statements against live customer rows. Those rows
are marked in the matrix and require backup, dry-run review, and a controlled
release decision.

## Decision

Migration reconciliation is complete enough for pull-request review.
Production execution remains **NO-GO** until the data-impact review, provider
licensing decision, production backup, final CLI dry run, and explicit release
approval are complete.
