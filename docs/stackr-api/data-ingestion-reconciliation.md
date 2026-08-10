# Stackr Data Ingestion And Reconciliation

Audit/stage date: 2026-07-27
Migration: `supabase/migrations/20260727213835_stackr_data_ingestion_reconciliation.sql`
Scope: additive repository implementation only. No production Supabase migration was pushed.

## Source Adapter Contract

The TypeScript adapter framework lives under `scripts/catalogue-ingestion/`.

`SourceAdapter` requires:

- `identifySource`
- `healthCheck`
- `fetchSets`
- `fetchCards`
- `fetchVariants`
- `fetchAssets`
- optional `fetchPrices`
- `normaliseRecord`
- `validateRecord`

Provider IDs are stored as source identifiers and raw-record IDs only. They never become Stackr permanent catalogue IDs.

## Implemented Adapters

| Adapter | Source code | Purpose | Automated refresh |
| --- | --- | --- | --- |
| `manual-csv` | `stackr_manual` | Manually curated CSV datasets. | No |
| `manual-json` | `stackr_manual` | Manually curated JSON datasets. | No |
| `tcgdex` | `tcgdex` | API-backed catalogue adapter with conditional-request metadata. | Disabled until terms review explicitly allows scheduling |

Forbidden or failed provider access is reported as `forbidden`, `unavailable` or `failed`. The pipeline does not bypass access controls.

## Raw Record Retention

Every provider item is retained before normalisation in `ingest.raw_source_records`.

Stage 3 extends that table with:

- `provider_record_id`
- `source_endpoint`
- `http_metadata`
- `validation_status`
- `validation_errors`

Existing Stage 2 fields already retain provider/source, source URL, payload checksum, raw payload, retrieval time, provider update time, legal-use status and import-run ID.

## Reconciliation Flow

The runner follows this order:

1. Ensure the source exists in `ingest.sources`.
2. Record source health in `ingest.source_health_reports`.
3. Start or resume an idempotent `ingest.import_runs` row.
4. Fetch provider records through the selected adapter.
5. Validate and retain the raw payload.
6. Map language and set.
7. Calculate the proposed canonical key from game, language, canonical set ID, collector number and variant.
8. Check exact external-ID matches.
9. Check exact canonical identity matches.
10. Upsert only safe set/card/variant/asset records.
11. Quarantine ambiguous records in `ingest.data_conflicts`.
12. Log decisions in `audit.ingest_merge_decisions`.

Records with unapproved, denied, restricted or unknown legal-use status are quarantined instead of imported.

## Durable Queues

`ingest.work_queue` is a table-backed durable queue with idempotency, leasing fields, retry attempts, exponential backoff state and dead-letter handling.

Supabase Queues/PGMQ can be adopted later if the project database version and extension availability are verified in an isolated environment. Stage 3 does not enable PGMQ blindly because local Supabase migration validation is still blocked in this workspace.

Supported queue names:

- `catalogue_ingestion`
- `asset_processing`
- `embedding_generation`
- `price_refresh`
- `conflict_review`

`ingest.provider_schedule_policies` stores refresh schedules, but the migration enforces:

```sql
enabled = false or automated_refresh_allowed = true
```

No automated provider refresh is enabled by this stage.

## Admin Commands

CLI:

```powershell
npm run catalogue:ingest -- run-source --source=manual-csv --file=data/catalogue.csv
npm run catalogue:ingest -- run-language --source=manual-json --file=data/catalogue.json --language=ja
npm run catalogue:ingest -- run-set --source=tcgdex --language=ja --setId=sv2a
npm run catalogue:ingest -- resume-import --source=manual-csv --file=data/catalogue.csv --runKey=stackr-manual
npm run catalogue:ingest -- rebuild-record --source=manual-json --file=data/catalogue.json --providerRecordId=card-123
npm run catalogue:ingest -- conflicts --limit=50
npm run catalogue:quality-report -- --language=ja
```

Backend endpoint:

```text
POST /api/admin/catalogue-ingestion/run-source
POST /api/admin/catalogue-ingestion/run-language
POST /api/admin/catalogue-ingestion/run-set
POST /api/admin/catalogue-ingestion/resume-import
POST /api/admin/catalogue-ingestion/rebuild-record
GET  /api/admin/catalogue-ingestion/conflicts
GET  /api/admin/catalogue-ingestion/quality-report
```

The endpoint uses the existing `STACKR_ADMIN_API_KEY` / `ADMIN_API_KEY` protection pattern and queues durable work. It does not expose service-role credentials.

## Catalogue Quality Report

Private view: `ingest.catalogue_quality_report`

The report includes:

- expected versus imported card totals;
- expected versus imported set totals;
- cards missing images;
- sets missing logos or symbols;
- duplicate canonical keys;
- unresolved variants;
- conflicting names;
- stale source records;
- records without approved legal-use status.

The view is private and service-role only.

## Rollback Procedure

No production migration was applied in Stage 3.

Repository rollback:

1. Revert the Stage 3 commits that added the migration, ingestion scripts, backend admin route and this document.
2. Remove the new package scripts from `package.json`.

Isolated validation database rollback before imports:

```sql
drop view if exists ingest.catalogue_quality_report;
drop view if exists ingest.dead_letter_queue;
drop view if exists ingest.source_health_current;
drop table if exists audit.ingest_merge_decisions cascade;
drop table if exists ingest.source_health_reports cascade;
drop table if exists ingest.provider_schedule_policies cascade;
drop table if exists ingest.work_queue cascade;
drop table if exists ingest.import_checkpoints cascade;
alter table ingest.raw_source_records
  drop column if exists validation_errors,
  drop column if exists validation_status,
  drop column if exists http_metadata,
  drop column if exists source_endpoint,
  drop column if exists provider_record_id;
drop function if exists ingest.next_retry_at(integer, integer, integer);
```

If imports have run, export `ingest`, `catalog` and `audit` rows for the affected import runs before rollback so provenance and merge decisions are not lost.
