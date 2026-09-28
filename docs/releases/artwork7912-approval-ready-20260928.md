> Superseded by [the final 7,911-front approval packet](artwork7911-approval-ready-20260928.md). The Croagunk SCD 097 source image was excluded after direct review. This document is historical preparation evidence.

# Stackr artwork publication review

Verification is still in progress. Production publication has not been approved or started.

The frozen queue selects **7,912 unique card fronts and 23,736 display derivatives** from the saved 12,161-record artwork worklist. Every record is accounted for: **4,249 remain explicitly classified exceptions**. These are artwork associations for existing cards, not 12,161 missing card metadata records or a new whole-catalogue coverage census.

| Release language | Fronts |
|---|---:|
| English | 471 |
| Japanese | 2,398 |
| Traditional Chinese | 5,043 |
| Total | 7,912 |

The 43 immutable GitHub packages contain the originals, display images, manifests and identity evidence. [Download links and SHA-256 checksums](artwork7912-downloads-20260928.md), [checksum file](artwork7912-SHA256SUMS-20260928.txt), [complete accounting](artwork7912-accounting-20260928.json), [card-by-card exceptions](artwork4249-exceptions-20260928.json.gz).

The frozen compressed plan SHA-256 is `430218e70febd06c8a22bccbc8c244b6d2c282a9aa3dec0cd9448578473d631e`. Its implementation revision is `2931a167990a2872a8d4330e33a2b86c946b3f20`, in [draft PR #247](https://github.com/tberridge86/Stackr/pull/247).

## Identity and preservation

The original 3,303 identities and all 4,611 additional candidates were matched to production and staging. Two unavailable Taiwanese HTML pages were resolved by visually checking the exact official image bytes against the native name, SV3 set mark and printed numbers 125/108 and 134/108. Their evidence explicitly records that the HTML page was unavailable.

Two Japanese Morpeko V-UNION images were found to depict the four-card composite. The final plan uses visually checked individual PokeData fronts for S8b 056 and 226 instead. Original archives and the original frozen plan are retained unchanged under `tools/artwork-review-20260928/initial3303/`; the two composite files are excluded from the new publication plan. A regression check now rejects multi-number composite images as individual fronts.

The publication uses the existing protected `deploy-production.yml` artwork release lane and existing asset schema/storage. The historical workflow scope identifier remains `artwork3303`; its actual bounded population is the reviewed 7,912-row hash above. The lane requires the exact main revision and current approval record, verifies archived bytes and identities again, rehearses staging and production with rollbacks, and preserves existing artwork. It adds printing-front assets and current-version links while preserving card metadata, holdings, prices, finish attributes and source-wide permissions.

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
| Total | 4,249 |

The two Taiwanese V-UNION records are S8a 025 Pikachu V-UNION and S8b 056 Morpeko V-UNION. Their official pages cover four physical card numbers, so a combined image is not assigned to either single-card record. The exception file retains exact printing IDs, names, languages, set codes, numbers, available source evidence and next actions for every record.

## Approval and delivery state

The approval record remains false. It requires approval of this exact 7,912-front plan and confirmation that the existing artwork permission covers storing, resizing and displaying the **4,927 official Taiwanese fronts** in this plan. Earlier English-source permission is preserved; no broader source activation is proposed.

This is preparation for approval, not a production delivery receipt. No production assets, card metadata, holdings, pricing or installed-client state have been changed. Installed build 47, app rendering, whole-catalogue percentages, logos/covers and sub-0.5-second retrieval have not been verified by this artwork preparation task.
