# Stackr signed-off metadata — production promotion

Production promotion completed and validated on 27 September 2026. This supersedes the **source-intake-only** status in the 26 September report. The owner explicitly authorized the production mutation in this conversation.

## Destination and authoritative read path

- Supabase production project: `oakdbbzdqwurpjnoqhmu`.
- Set source of truth: `catalog.sets`; product/deck/pack metadata: `catalog.sealed_products`.
- Existing source: `ingest.sources` → `stackr_manual` (`a23954d2-49ca-4f2e-8cee-ed628e179006`). No parallel source, schema, bucket or API was created.
- Immutable workbook values: `ingest.raw_source_records`, original intake run `e061242a-7aa6-5fff-8dfe-ae3840a06651` (642 reference rows and 13 companion sheets).
- Reference-ID links: `ingest.external_identifiers`, 639 canonical links.
- Public read path: `api.catalogue_sets` joins canonical sets to existing published catalogue versions; gateway `https://api.stackrtcg.com/v1/sets` reads this projection.
- Promotion run: `ea50db41-86ff-5969-b534-61cf3bb155c8`. Before/after images: `audit.ingest_merge_decisions`, filtered by this run.

## Exact changes

| Operation | Records |
| --- | ---: |
| Existing canonical sets updated | 333 |
| Existing canonical sets matched, already equal | 132 |
| New canonical sets inserted | 102 |
| New sealed products inserted, including four pack editions | 110 |
| Workbook references linked to canonical entities | 639 |
| Event programmes retained in source only | 2 |
| Unresolved core record, Aura Seeker | 1 |

Some products already have a legacy set/checklist identity. Those set UUIDs were preserved and the new sealed-product row links to the existing checklist. Thus the 677 entity operations correspond to 639 workbook identities, not 677 distinct workbook rows. The run's reference counters are 465 matched existing identities + 174 newly represented identities + 2 source-only events + 1 unresolved record.

Existing set-field changes: 283 English display names, 70 native names, 63 exact release dates, 12 printed totals and 121 numbered totals. `field-changes.csv` gives every old/new value. Only those five metadata fields and the automatic `updated_at` timestamp changed on existing sets. IDs, operational/provider codes, series associations, card records and links remain stable. Workbook catalogue codes are preserved in the source and reference map; they do not replace application routing/provider codes.

**Publication boundary:** the 102 new sets are in the production canonical table but were not added to published catalogue versions. The existing 696 publicly visible sets remain the same identities. New sets await normal card-coverage publication. Existing published set metadata changes are live through the API. This import does not certify card, image or set-art completeness, and it does not recompute coverage snapshots.

## Value interpretation and exceptions

- Names and precise day dates use the signed-off workbook. Partial month/year dates remain recorded verbatim in source; existing exact dates were preserved, and new canonical dates remain null where precision is insufficient.
- Null workbook base-card values do not erase existing printed totals. New unknown printed totals remain null.
- Existing set totals were preserved for rows whose workbook totals include subsets. This avoids folding separately catalogued galleries into parent-set counts. Both the signed-off aggregate and the preservation reason remain in source/audit.
- Ongoing/provisional counts remain snapshots in source/audit. They were not asserted as final canonical counts: existing values were retained; new unknown totals remain null. Delta Reign and announced 30th Celebration lower bounds follow this rule.
- The workbook's twelve flagged rows remain documented, including Aura Seeker, ongoing promo catalogues, Start Deck 100 Battle Collection and the two N/A event programmes. Aura Seeker is the only open original intake conflict.
- Trainers Camp and New Trainer Journey are validated source records with N/A card totals. They were not misclassified as sets or sealed products. The corrected Trainers Camp name is retained in the source.
- PTCGC, JA-SI, MG-G and MG-M are retained in their correct new canonical set/product rows. Existing application codes were not globally renamed.
- Era, code basis, market, reference-count semantics, physical quantities and evidence URLs remain losslessly in the established source records because the destination set/product tables have no matching columns for all of them.
- Original workbook/raw payload bytes and hashes remain unchanged. Historical intake payload wording such as “promotion pending” and the workbook's older “review only” column remain provenance; the new completed promotion run, validation status, identity links and audit are the current disposition.

## Validation

All 677 entity operations were read back against the prepared plan. All 465 existing before-images exactly matched the saved backup. All 639 external identity links were verified. All 655 original source hashes were preserved. Source intake now has 654 valid rows and one quarantined Aura Seeker row; 641 original reference conflicts are resolved and one remains open.

Live set detail, language-list and card-list endpoints returned HTTP 200 for:

| Language | Representative set | Stable application code | Printed / total |
| --- | --- | --- | --- |
| English | Base Set | base1 | 102 / 102 |
| Japanese | Expansion Pack | PMCG1 | 102 / 102 |
| Simplified Chinese | Storming Emergence: Abundant | csm1cc | 151 / 212 |
| Traditional Chinese | Sword & Shield: Set A | SC1a | 154 / 187 |

Every public metadata field checked equals the production projection. Full before/after row fingerprints also match for all 64,400 artwork assets, 59,246 card printings, 12 catalogue versions and 1,261 version memberships. Untouched fields and untouched rows across all 788 pre-existing canonical sets match exactly. No pricing or artwork write statements, application deployments or schema migrations were performed. Validation is recorded in `validation.json`; this is a data/API regression check, not a full interactive app test.

## Backup, transaction and rollback

The original workbook remains at `D:/Stackr-1/reports/catalogue/metadata-signoff/2026-09-26/Stackr_Metadata_CANONICAL_SIGNED_OFF_2026-09-26.xlsx`, SHA-256 `add080a95d52e714e86fc4e6a43ec28892e647cabb79cd72412d9a6b2f353414`, archived in commit `b32000f5625f74efb15d9acb54c59b024f67d7d1`.

This production package is at `D:/Stackr-1/reports/catalogue/metadata-signoff/2026-09-27-production/`. It includes the exact applied SQL, complete pre-change sets, post-change readback and audit, field diff, 642-row reference map, validation and file checksums.

The promotion ran as one atomic, owner-authorized DML transaction. It checked the source hash/count, guarded against concurrent changes, rejected code collisions and verified patches inside the transaction. No schema migration was required.

`rollback.sql` is provided but **has not been executed**. It requires affected canonical rows still to equal this promotion's recorded after-images, removes only this run's new canonical entities/identity links, and restores the five changed metadata fields. Source and audit history remain preserved. Automatic update timestamps advance on rollback; it is a logical metadata rollback, not a byte-for-byte time reversal. Review new dependencies before using it; foreign keys or concurrent edits will stop unsafe rollback.
