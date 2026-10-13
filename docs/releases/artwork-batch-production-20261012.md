# Artwork batches: production delivery and remaining source holds

## Queue update — 13 October 2026

The owner removed extra permission prompts for offline work and then explicitly directed Tif to use internet sources and queue artwork for the production push without owner batch review. This direction is recorded as standing queue approval; there is no pending owner artwork-review step.

Ten originals in EN-CARDS-001, EN-CARDS-002 and EN-CARDS-005 have now been gathered, matched and checked. Current public card responses matched all ten original card IDs, English language, set IDs, collector references and canonical names. The package includes those ten unmodified originals and 30 fully decoded, hash/dimension/size-verified WebP display files, prepared with the existing offline helper without enlargement. Oddish is 597x834; the eight MEE energies are 727x1018; Gardevoir is 734x1024. MEE printed001-008 and Gardevoir printed93/101/DeltaSpecies/Celebrations25badge were inspected. The original CC014 catalogue alias is retained and no canonical name/collector or physical finish was changed.

The local queue is durable and frozen at queueId STACKR-EN-FRONTS-20261013-010. The archive contains43files (40images +3metadata receipts),5,828,179bytes; SHA-256 de494b5c6a98b462db09738034df10c7deef226f552283354008dd9cf1056fd7. The public queue metadata is in [artwork-next-push-20261013.json](./artwork-next-push-20261013.json); original image bytes remain in the owner package.

The next push requires a bounded new-cohort adapter around the shared publisher; existing frozen English49/Pocket131/Native97 cohorts and hashes remain unchanged. This queue does not activate a worker or production workflow. Ten queued pictures are not newly live: the production count remains702/2944,30completed batches,2242unfinished tasks including the ten queued pictures. No production writes occurred in this queue preparation.

Historical source observations below remain dated12October. Factual third-party origins and unknown vendor licence/physical-finish facts are preserved; no additional owner permission prompt or review is being requested for the queue. Source facts are not relabelled merely to fill production approval fields.

## Historical production snapshot — 12 October 2026

Checked 12 October 2026. Inventory: STACKR-ARTWORK-20261012.

The owner asked Tif to process the fixed artwork batches through production. The saved list has 2,944 unique tasks in 161 batches. Batch IDs and historical identities are retained so follow-up requests can resume the same items.

## Current outcome

- 97 Japanese VS1 printing fronts newly published; JP-PREPARED-001 through JP-PREPARED-004 are complete.
- 605 older Chinese catalogue cases were already corrected before this work. Their old IDs now resolve to exact Traditional Chinese replacement records. All 605 public card responses and approved original image files were checked. SC-CHECK-001 through SC-CHECK-026 are complete; these are not new publications.
- 702 saved tasks are live and checked, across 30 completed batches.
- 2,242 tasks remain across 131 batches: 1,948 exact card fronts, 36 Traditional Chinese set logos, 256 language/card/version cases and two sharper Japanese originals. The 256 include the 224 still-active SC-CARDS records, 29 Japanese checks and three Traditional Chinese checks.

These counts cover the fixed repair list, not every missing image in the app. All remaining batches have a recorded review and blocker; a source review is not completed artwork.

## Production publication

Protected [production workflow run 38306295956](https://github.com/tberridge86/Stackr/actions/runs/38306295956) completed successfully at source revision 0188361a1b1e278ea180f9eec5ec487af52ca8cd with release_scope=native97.

The existing frozen Native97 approval and archive were used without expanding source permission. Publication created 97 asset rows and 97 version links; 388 immutable objects were verified (97 originals and 291 display derivatives; 274 newly stored and 114 already present). The approved correction changed 97 Japanese printing names and 193 native search-name rows. Independent before/after review preserved all 193 English search-name rows and printing English displays. Only printing/native search-name fields and their timestamps changed; all 193 variant records remained entirely unchanged. Ownership and pricing changes were zero.

The production publisher receipt reports published_manifest_and_public_bytes_verified. Receipt SHA-256: 2844d5350fdbe01158a4641d1d592eb52cfaac2dfec4fd6c3a4d9e042adb346f. Archive SHA-256: afc0f06595f6a2bb597584dc24d76fb3f8865d27e07fcf3dd8d9056b0653187e.

Independent checks used the app-configured public production API. All 97 card responses matched card ID, Japanese language, set, collector reference, corrected native name and approved artwork. The scoped artwork manifest returned all 97 assets. All 388 public original/grid/search/detail files matched expected hashes, sizes and dimensions and decoded successfully. No failures were recorded. This verifies printing-front delivery, not an exact physical foil/stamp or a phone screen.

62 targeted publisher, native-name and receipt tests passed using the canonical plan bytes. Current checkout files and frozen hashes were not rewritten. No backend/mobile/OTA/gateway deployment, migration, price refresh or broad source activation was performed.

## Existing Chinese corrections

The initial artwork-only query used obsolete IDs and missed 605 catalogue redirects. The corrected check followed each old public card ID to its exact replacement, matched current Traditional Chinese language/set/collector/name, and verified all 605 distinct approved originals by content hash, size, dimensions and full image decoding. The original IDs remain in the batch inventory alongside current IDs and artwork bindings. Existing images are not represented as newly uploaded or as high-resolution replacements.

## Remaining source and identity holds

- EN-CARDS-001: metadata-supported Scrydex source for English Pokemon TCG Pocket Oddish 088, Crimson Blaze B1a. The page and provider ID tcgp-B1a-88 match the target. Applicable new-cohort storage/resize/publication permission is not established; no image bytes have been fetched. The rarity labels differ between providers and remain in the source review. Earlier Pocket131 and English49 approvals do not cover this target.
- EN-CARDS-002: two Gardevoir source pointers. CC014 to printed 93 / Delta Species needs explicit binding/name review, source permission and image inspection.
- EN-CARDS-005: eight normal Mega Evolution Energy front pointers with printed 001-008. Source permission and pixel/quality checks remain. Reverse and stamped versions remain separate.
- EN-CARDS-003: the exact Aquapolis b versions remain unverified. EN-CARDS-004: intended Worlds stamp/version remains unresolved; the prior generic card-back lead is rejected. EN-CARDS-006/007: exact My First Battle deck/border fronts remain unresolved, with conflicting reused Potion/Switch provider product IDs.
- Current TCGdex metadata for the remaining front cases does not supply the required exact pictures. The early alternative English discovery sampled 20 targets from 48 stable cases, not every alternative website. The legacy Japanese PokeData fields contain demonstrated number/name/image mismatches; they remain discovery leads. 233 Japanese metadata names lack native script. A referenced legacy crosswalk file was not recovered by the bounded searches; no image binding was invented.
- SC-CARDS-001 through SC-CARDS-010: 224 active SV7/SV9a records have one-to-one current Traditional Chinese counterparts and matching metadata, but printed-language evidence and a separately reviewed canonical repair are still required. The existing 605 correction explicitly covers five other sets. No Traditional Chinese image was copied into a Simplified Chinese record; no dependent collection or pricing history was changed.
- TC-CARDS-001: four SV-P promo fronts still needed. TC-CHECK cases require exact individual V-UNION fronts or rejection of mismatched species/collector sources.
- TC-LOGOS-001 through TC-LOGOS-004: 36 exact Traditional Chinese marks remain absent from reviewed metadata. The six-mark local pack and older Simplified Chinese logo candidates do not cover these set IDs. Provider-served runtime permission does not establish persistence permission.

Ten remaining card targets have recorded source pointers (Oddish, Gardevoir and eight Energy cards). None is counted as gathered, eligible or published. The owner source-coverage questions remain pending; operational publication authorisation is already recorded and is not being requested again.

## Preservation and rollback

Previous immutable objects were retained. A receipt-bound rollback preparation targets exactly the new 97 asset UUIDs and restores only intended native metadata from current before snapshots, preserving later English corrections. It disables public service of the new assets because the current manifest does not filter deprecated_at alone. Version links and all immutable files are retained. The rollback ends with ROLLBACK and has not been executed or SQL-syntax validated.

Rollback preparation SHA-256: e7508b20604a03133bb1656b7c1ed9e7269e9acdd9dd9c88194580e99080cafa.

Raw receipts, before snapshots, source payloads and rollback materials remain in the protected owner recovery evidence. No private before-image payloads, credentials or licence documents are added here.

## Release handoff

Before a future TestFlight build, preserve the completed Native97 evidence and recheck the app-configured API as appropriate for that build. Disclose every pending batch below; this work does not certify full-catalogue completion, an actual handset or general production readiness. No automation or new background schedule was created.

The owner copy contains Missing artwork - batch guide.txt, artwork-batches.json, Production progress.txt and production-progress.json. Completed items expose currentDelivery fields with current IDs/names/artwork and evidence. Historical labels are retained as historical; currentTask explicitly identifies the active 224 Chinese identity holds.

## Fixed batch ledger

| Batch | Tasks | Live checked | Status | Remaining blocker |
| --- | ---: | ---: | --- | --- |
| EN-CARDS-001 | 1 | 0 | Source found; permission evidence pending | Confirm that existing artwork permission covers this exact new Scrydex Oddish image |
| EN-CARDS-002 | 1 | 0 | Source links found; identity and permission checks pending | Bind CC014 to printed 93 and the Delta Species card; confirm permission for the new source; inspect the actual image |
| EN-CARDS-003 | 4 | 0 | Reviewed; exact Aquapolis b versions still needed | Unlettered Aquapolis source pages do not prove the separate b versions |
| EN-CARDS-004 | 1 | 0 | Reviewed; Worlds stamp and card version unresolved | Confirm the intended HGSS18 Worlds stamp/version; previous generic card-back source was rejected |
| EN-CARDS-005 | 8 | 0 | Source links found; permission and image checks pending | Confirm permission for all eight new Scrydex Energy fronts; inspect images; keep normal, reverse and stamped versions separate |
| EN-CARDS-006 | 25 | 0 | Reviewed; exact deck and border pictures still needed | Match My First Battle deck/border; the bounded source sample did not establish exact fronts; Potion/Switch product references conflict |
| EN-CARDS-007 | 9 | 0 | Reviewed; exact deck and border pictures still needed | Match My First Battle deck/border; the bounded source sample did not establish exact fronts; Potion/Switch product references conflict |
| EN-CARDS-008 | 1 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-009 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-010 | 2 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-011 | 24 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-012 | 5 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-013 | 11 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-014 | 12 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-015 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-016 | 5 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-017 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-018 | 5 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-019 | 16 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-020 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-021 | 3 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-022 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-023 | 4 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-024 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-025 | 3 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-026 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-027 | 4 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-028 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-029 | 3 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-030 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-031 | 4 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-032 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-033 | 4 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-034 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-035 | 4 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-036 | 25 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-037 | 4 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| EN-CARDS-038 | 2 | 0 | Current source metadata reviewed; exact picture needed | Find an exact permitted front; current set metadata has no picture for these cases |
| JP-CARDS-001 | 5 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-002 | 8 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-003 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-004 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-005 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-006 | 21 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-007 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-008 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-009 | 7 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-010 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-011 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-012 | 7 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-013 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-014 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-015 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-016 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-017 | 13 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-018 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-019 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-020 | 21 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-021 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-022 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-023 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-024 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-025 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-026 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-027 | 5 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-028 | 3 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-029 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-030 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-031 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-032 | 11 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-033 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-034 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-035 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-036 | 11 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-037 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-038 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-039 | 2 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-040 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-041 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-042 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-043 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-044 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-045 | 18 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-046 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-047 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-048 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-049 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-050 | 2 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-051 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-052 | 23 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-053 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-054 | 23 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-055 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-056 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-057 | 15 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-058 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-059 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-060 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-061 | 21 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-062 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-063 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-064 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-065 | 23 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-066 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-067 | 21 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-068 | 25 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CARDS-069 | 19 | 0 | Current source metadata reviewed; exact picture needed | No matching full card picture is recorded. |
| JP-CHECK-001 | 2 | 0 | Identity or finish evidence still needed | The previously checked picture is unsuitable or belongs to a different card. |
| JP-CHECK-002 | 4 | 0 | Identity or finish evidence still needed | The card name and source picture do not agree. |
| JP-CHECK-003 | 3 | 0 | Identity or finish evidence still needed | The card name in Stackr differs from the name recorded by the source.; The card name and source picture do not agree. |
| JP-CHECK-004 | 10 | 0 | Identity or finish evidence still needed | Several pictures match this card; the correct version or finish still needs checking. |
| JP-CHECK-005 | 10 | 0 | Identity or finish evidence still needed | Several pictures match this card; the correct version or finish still needs checking. |
| JP-PREPARED-001 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| JP-PREPARED-002 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| JP-PREPARED-003 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| JP-PREPARED-004 | 22 | 22 | Live and verified | Complete; see verified delivery evidence |
| JP-SHARP-001 | 2 | 0 | Sharper original still needed | The recorded picture is only 139 by 196 pixels; a sharper original is needed. |
| SC-CARDS-001 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-002 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-003 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-004 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-005 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-006 | 7 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-007 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-008 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-009 | 25 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CARDS-010 | 17 | 0 | Language identity review required | The source labels these as Simplified Chinese, but each has exactly one matching Traditional Chinese card; do not attach a wrong-language picture |
| SC-CHECK-001 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-002 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-003 | 14 | 14 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-004 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-005 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-006 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-007 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-008 | 6 | 6 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-009 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-010 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-011 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-012 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-013 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-014 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-015 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-016 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-017 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-018 | 12 | 12 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-019 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-020 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-021 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-022 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-023 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-024 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-025 | 25 | 25 | Live and verified | Complete; see verified delivery evidence |
| SC-CHECK-026 | 23 | 23 | Live and verified | Complete; see verified delivery evidence |
| TC-CARDS-001 | 4 | 0 | Exact permitted promo front still needed | No matching full card picture is recorded. |
| TC-CHECK-001 | 1 | 0 | Exact individual front still needed | The source combines several cards; this needs the individual card picture. |
| TC-CHECK-002 | 1 | 0 | Exact individual front still needed | The source combines several cards; this needs the individual card picture. |
| TC-CHECK-003 | 1 | 0 | Exact individual front still needed | The previously checked picture is unsuitable or belongs to a different card. |
| TC-LOGOS-001 | 10 | 0 | Current source metadata reviewed; exact logo needed | No exact approved local logo or current provider logo pointer for these Traditional Chinese sets |
| TC-LOGOS-002 | 10 | 0 | Current source metadata reviewed; exact logo needed | No exact approved local logo or current provider logo pointer for these Traditional Chinese sets |
| TC-LOGOS-003 | 10 | 0 | Current source metadata reviewed; exact logo needed | No exact approved local logo or current provider logo pointer for these Traditional Chinese sets |
| TC-LOGOS-004 | 6 | 0 | Current source metadata reviewed; exact logo needed | No exact approved local logo or current provider logo pointer for these Traditional Chinese sets |
