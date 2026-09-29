# Stackr artwork publication review

Ready for owner publication approval. Preparation and technical verification are complete; production publication has not been approved or started.

The frozen queue selects **7,911 unique card fronts and 23,733 display derivatives** from the saved 12,161-record artwork worklist. Every record is accounted for: **4,250 remain explicitly classified exceptions**. These are artwork associations for existing cards, not 12,161 missing card metadata records or a new whole-catalogue coverage census.

| Release language | Fronts |
|---|---:|
| English | 471 |
| Japanese | 2,398 |
| Traditional Chinese | 5,042 |
| Total | 7,911 |

The 43 immutable GitHub packages contain the originals, display images, manifests and identity evidence. [Download links and SHA-256 checksums](artwork7911-downloads-20260928.md), [checksum file](artwork7911-SHA256SUMS-20260928.txt), [complete accounting](artwork7911-accounting-20260928.json), [card-by-card exceptions](artwork4250-exceptions-20260928.json.gz).

The frozen compressed plan SHA-256 is `20f4d3b1e5673f494c05c0330257296f78e3b35c21b06254523dfb066ea2f2cd`. Its implementation revision is `7ae82a9370cc63efe0c9053667ef9d89a5b53df0`, in [draft PR #247](https://github.com/tberridge86/Stackr/pull/247).

## Identity and preservation

The original 3,303 identities and all 4,611 additional candidates were matched to production and staging. Two unavailable Taiwanese HTML pages were resolved by visually checking the exact official image bytes against the native name, SV3 set mark and printed numbers 125/108 and 134/108. Their evidence explicitly records that the HTML page was unavailable.

Two Japanese Morpeko V-UNION images were found to depict the four-card composite. The final plan uses visually checked individual PokeData fronts for S8b 056 and 226 instead. Original archives and the original frozen plan are retained unchanged under `tools/artwork-review-20260928/initial3303/`; the two composite files are excluded from the new publication plan. A regression check now rejects multi-number composite images as individual fronts.

Historical provider acquisition is now explicitly opt-in; an ordinary approval or evidence commit cannot start reacquiring the prepared images.

The publication uses the existing protected `deploy-production.yml` artwork release lane and existing asset schema/storage. The historical workflow scope identifier remains `artwork3303`; its actual bounded population is the reviewed 7,911-row hash above. The lane requires the exact main revision and current approval record, verifies archived bytes and identities again, rehearses staging and production with rollbacks, and preserves existing artwork. It adds printing-front assets and current-version links while preserving card metadata, holdings, prices, finish attributes and source-wide permissions.

## Exceptions

| Reason | Cards |
|---|---:|
| Exact native-language source needed | 3,530 |
| Provider image unavailable | 50 |
| Insufficient image resolution | 2 |
| Simplified/Traditional Chinese identity conflict | 605 |
| Printed set denominator conflict | 33 |
| Multiple artwork candidates | 20 |
| Native-name/provider identity conflict | 7 |
| Taiwanese V-UNION composite needs an individual front | 2 |
| Incorrect supplier image for SCD 097 Croagunk | 1 |
| Total | 4,250 |

SCD 097 Croagunk is excluded because its official source returns the identical Clobbopus 087 image; direct inspection confirmed the wrong printed name and number. The release now rejects an original image associated with conflicting card identities.

The two Taiwanese V-UNION records are S8a 025 Pikachu V-UNION and S8b 056 Morpeko V-UNION. Their official pages cover four physical card numbers, so a combined image is not assigned to either single-card record. The exception file retains exact printing IDs, names, languages, set codes, numbers, available source evidence and next actions for every record.

## Verification results

| Check | Measured result |
|---|---|
| Card identities | All 7,911 selected identities are covered by the production and staging preflights; 47/47 Pocket provider bindings rechecked in the published catalogue. |
| Archived bytes and decoding | All 31,644 retained image references match the immutable files from the completed full checksum/decode audit. The final verification proves an exact unchanged subset after excluding one incorrect association. There are 31,581 distinct storage objects, including legitimate shared Energy artwork. |
| Final staging rehearsal | 7,911/7,911 fronts across 80 transactions: API-manifest visibility, repeat-write idempotency and rollback all passed. |
| Post-rehearsal state | Zero saved release assets and zero new Taiwanese provenance source rows in staging and production. |
| Tests | 58 release/adjacent-lane tests passed; 28 acquisition/identity tests passed. All seven standard platform CI jobs and the pricing-identity job passed at the implementation revision. The full-platform release-candidate gate was skipped because this is the bounded artwork lane. |
| Publication | Not merged or deployed. Approval remains false; production writes are zero. |

Evidence: [final file verification](artwork7911-file-verification-20260928.json), [final staging rehearsal](artwork7911-staging-rehearsal-20260928.json), [final read-only checks](artwork7911-final-readonly-checks-20260928.json), [shared-image audit](artwork7911-shared-image-audit-20260928.json), [file-verification workflow](https://github.com/tberridge86/Stackr/actions/runs/36488119977), [platform CI](https://github.com/tberridge86/Stackr/actions/runs/36488124134), [pricing identity tests](https://github.com/tberridge86/Stackr/actions/runs/36488124138).

## Approval and delivery state

The approval record remains false. It requires approval of this exact 7,911-front plan and confirmation that the existing artwork permission covers storing, resizing and displaying the **4,926 official Taiwanese fronts** in this plan. Earlier English-source permission is preserved; no broader source activation is proposed.

This is preparation for approval, not a production delivery receipt. No production assets, card metadata, holdings, pricing or installed-client state have been changed. Installed build 47, app rendering, whole-catalogue percentages, logos/covers and sub-0.5-second retrieval have not been verified by this artwork preparation task.
