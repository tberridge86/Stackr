# Signed-off metadata intake — 26 September 2026

## Result and boundary

The original `Stackr_Metadata_CANONICAL_SIGNED_OFF_2026-09-26.xlsx` was retrieved from the owner's referenced ChatGPT conversation and imported into the existing production ingestion store. All 642 reference records and all 13 accompanying sheets are retained. This is a completed source-intake operation, **not a completed canonical promotion or public metadata release**. No `catalog` rows, published versions, application code, prices or artwork were changed.

The workbook's owner sign-off is preserved. It does not make its namespaced reference IDs canonical database UUIDs. Its legacy per-row `Production ready = NO — review only` annotations are also preserved without modifying the signed-off bytes.

## Authoritative architecture inspected

- Repository: `D:\Stackr-1`, branch `chore/api-gateway-v1`, starting HEAD `4de71b535faaac6b876804c5ee156df8b47afbe6`.
- Production Supabase project: `oakdbbzdqwurpjnoqhmu` (confirmed against repository linkage and the live project).
- Canonical set table: `catalog.sets`.
- Public projection: `api.catalogue_sets`, joining canonical sets to `catalog.catalogue_version_sets` and published `catalog.catalogue_versions`.
- Existing HTTP reader: `backend/lib/stackrApiV1.js`, served through `https://api.stackrtcg.com/v1/sets` and `/v1/sets/{setId}`.
- Existing ingestion contract: `scripts/catalogue-ingestion/pipeline.ts`, `manualAdapters.ts`, and `docs/stackr-api/data-ingestion-reconciliation.md`. Source retention precedes canonical mapping, with ambiguous records quarantined and merge decisions audited.
- Existing SQLite library: `D:\Stackr-1\outputs\metadata-library\stackr-metadata.sqlite`. This is a supplemental evidence library, not the live canonical catalogue. It was not replaced or made a second runtime source.
- Local reviewed-repair SQL exists, but live inspection found no `api.apply_reviewed_metadata_repair_batch` function or its audit table in this production database. The local function also limits supported set fields and protects non-null existing values. No bypass or broad deployment of the dirty checkout was performed.

## Exact destination and changes

Existing source `stackr_manual`, source UUID `a23954d2-49ca-4f2e-8cee-ed628e179006` was reused. No new source, schema, table, bucket or API route was created.

Import run:

```text
e061242a-7aa6-5fff-8dfe-ae3840a06651
metadata-signoff-v1-2026-09-26-add080a95d52e714
```

| Existing table | Changes |
| --- | --- |
| `ingest.import_runs` | One manual run, completed for source intake; metadata explicitly says canonical promotion pending |
| `ingest.raw_source_records` | 655 new rows: 642 reference rows and 13 companion-sheet records |
| `audit.ingest_merge_decisions` | 655 new audit rows recording source intake and absence of canonical promotion |
| `ingest.data_conflicts` | 642 open review rows retaining candidate mapping status without assigning canonical UUIDs |
| `catalog.*`, pricing and artwork tables | No writes |

Reference records are quarantined for canonical reconciliation. Companion sheets are valid source attachments. Import counters follow canonical outcomes: `records_retrieved=642`, `records_inserted=0`, `records_updated=0`, `records_conflicted=642`; `metadata.rawRowsStored=655` records successful raw retention. The 655 deterministic raw IDs make repeated batches idempotent. The run is complete only after source and audit counts match.

This was data-only DML using the existing tables and constraints. **No schema migration was applied.** Inserts were transaction-batched. One oversized final batch failed parsing without inserting any rows; the transaction was verified to have left the count at 640, the duplicated payload was reduced, and the final 15 records then succeeded. Full remote readback verified every row afterwards.

## Versioned workbook and backup

Archive directory:

```text
D:\Stackr-1\reports\catalogue\metadata-signoff\2026-09-26\
```

The exact workbook is retained there under its original name, alongside `workbook-values.json`, `production-sets-before.json`, `canonical-mapping-candidates.json`, `canonical-review-queue.csv`, `import-manifest.json` and `validation.json`. These are evidence and rollback/reference artifacts, not an additional application data source. The downloaded original remains in `D:\Downloads`.

Workbook size: 289,133 bytes.

```text
SHA-256 add080a95d52e714e86fc4e6a43ec28892e647cabb79cd72412d9a6b2f353414
```

The before snapshot retains the inspected identity, language, names, codes, release date, counts, region and deprecation fields for all 788 canonical set rows. No previous source rows were overwritten.

## Validation

- 642 unique reference IDs, unique same-language display names and unique same-language workbook codes.
- Source language counts: English 192, Japanese 246, Simplified Chinese 64, Traditional Chinese 140.
- 655/655 remote payloads exactly equal the extracted source values and their SHA-256 checksums. Unicode and exception annotations survived ingestion.
- All inspected fields across all 788 canonical set rows equal the before snapshot.
- Public set counts remain EN 217, JA 163, ZH-CN 136, ZH-TW 83, KO 97.
- Public `/v1/sets` returned HTTP 200.
- Each representative `/v1/sets/{id}` returned HTTP 200 and matched the live public projection for UUID, language, code, both names, release date and counts. These checks establish preservation of existing behavior, **not publication of the new workbook values**.

| Language | Workbook representative | Existing canonical set UUID | API code | Result |
| --- | --- | --- | --- | --- |
| EN | Base Set | `97e3aeb6-2645-4c3a-9fd4-10d95a181b6e` | `base1` | Source readback and live API pass |
| JA | Expansion Pack | `46c7cd20-9ca5-4128-a244-9a04f9a4c9f7` | `PMCG1` | Source readback and live API pass |
| ZH-CN | Storming Emergence: Abundant | `195b9d09-dd64-4e41-9b7d-0c9fb7f2062c` | `csm1cc` | Source readback and live API pass |
| ZH-TW | Sword & Shield: Set A | `9ebab1ca-0ebf-429c-83ed-9fe6735f9832` | `SC1a` | Source readback and live API pass |

Read the imported source through the existing database:

```sql
select external_id, language_code, raw_payload->'reference' as signed_off_metadata
from ingest.raw_source_records
where import_run_id = 'e061242a-7aa6-5fff-8dfe-ae3840a06651'
  and raw_payload->>'schemaVersion' = 'stackr-signed-off-reference-v1'
order by language_code, external_id;
```

The `ingest` schema remains private. No claim is made that the public API exposes these quarantined source rows.

## Remaining promotion work

The workbook contains 453 card-set/collection records, 76 promo catalogues, 106 products/decks, four pack editions, two events/programmes and one unconfirmed candidate. Those categories cannot all be inserted as canonical sets.

A conservative comparison found 327 **mapping candidates**, requiring a same-language name plus matching code or matching date and printed size. These are proposals, not accepted canonical links; region, game, parent/component scope and contradictory fields still need review. The remaining 315 require identity/product-scope reconciliation. No new external identifier links were written.

Among the 327 candidates, 234 differ from production in at least one inspected metadata field: 191 display-name differences, four native-name differences, 25 release-date differences, 50 printed-size differences and 106 numbered-total differences. Counts overlap across records. Those discrepancies are retained in the review artifacts rather than silently discarded or published.

Examples explain why direct replacement is inappropriate:

- Workbook Base Set code `BS` is an alias; the app uses `base1`. Preserve operational IDs and attach aliases through the established identifier system after mapping.
- Hidden Fates workbook total 163 includes a subset, while its current canonical parent total is 69. Celebrations is 50 versus a parent total of 25. Replacing parent totals without component reconciliation would change count semantics.
- Traditional Chinese release dates must be reconciled to their regional releases rather than copied from another language.

Next implementation work is to establish exact canonical links and component/count semantics, prepare a reviewed before/after metadata patch, validate the existing repair path in staging and production, and then verify newly promoted values through the public API. Source sign-off and the user's import authorization remain recorded; this document does not request a second sign-off.

## Signed-off exceptions retained

- Aura Seeker: official code, release date and checklist counts remain unresolved.
- Nine rows are explicitly provisional/snapshot/minimum: SVP Black Star Promos; MEP Black Star Promos; Delta Reign; M-P Promotional cards; Unnumbered Promotional cards; Traditional Chinese Start Deck 100 Battle Collection; and Traditional Chinese Mega Evolution, Scarlet & Violet, and Sword & Shield promo catalogues.
- Delta Reign's 135 remains an announced minimum, not a closed checklist total.
- Trainers Camp and New Trainer Journey retain not-applicable counts.
- Additional source notes, including lower-bound statements, remain in the retained count-fill sheets. None were converted into certified exact production totals.

## Recovery

No application rollback is needed because no canonical or published rows changed. If the source intake must be withdrawn, use this run UUID to soft-deprecate its raw records and mark the run rolled back, retaining audit history. Do not delete earlier source versions or alter catalogue publication. The versioned workbook and remote source sheets preserve the signed-off input independently of that withdrawal.
