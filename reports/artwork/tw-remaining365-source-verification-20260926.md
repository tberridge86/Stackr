# Stackr: remaining 365 Traditional Chinese fronts

**Source verification completed:** 26 September 2026, 21:46 UTC (22:46 BST).
**Production status:** NOT UPLOADED. No production writes were made in this workstream.
**Official Taiwan source permission status:** REVIEW REQUIRED; no source approvals were changed.

## Results

| Traditional Chinese set | Original missing-front cohort | Recovered in previous batch | Newly identity-and-byte verified | Still to source in this cohort | Newly published in these batches |
|---|---:|---:|---:|---:|---:|
| SV4a | 294 | 116 | 178 | 0 | 0 |
| SV2a / Pokemon 151 | 187 | 0 | 187 | 0 | 0 |
| Total | 481 | 116 | 365 | 0 | 0 |

The newly verified scope is exactly SV4a numbers 177–354 and SV2a numbers 021–207. The 116 previous recoveries are a separate prepared package. These figures describe the existing published printing cohort; they do not certify every possible foil finish, every card absent from the catalogue, or the entire Stackr artwork catalogue.

All 365 new fronts were matched programmatically to official Taiwan card pages by native name, printed collector number, printed denominator, expansion symbol, product and exact linked Taiwan image URL. The exact source roster also matched the production roster checksums. All downloaded originals passed MIME, dimensions, pixel-limit, decoding, nonblank-image and SHA-256 checks. There were zero duplicate image hashes and zero unresolved identity/image checks in the final 365-row report. These checks are not a claim of individual human visual review or an exact-foil scan certification.

## What was corrected during acquisition

The initial lookup assumed sequential official page identifiers. An unrelated promo page interrupted that sequence. The reconciliation re-indexed captured pages by their actual printed card number and name instead of accepting neighbouring card images.

The last 23 SV2a downloads were not dead links. They exceeded the initial 5,000,000-byte audit limit. After confirming that failure reason, only those 23 originals were fetched under a bounded 12 MiB limit. All other identity and image tests, including the 8-megapixel limit, remained enabled. All 23 passed; their original dimensions are 1736 × 2426 pixels and file sizes range from 5,054,629 to 6,487,320 bytes.

## Evidence and reproducibility

- Final successful workflow: https://github.com/tberridge86/Stackr/actions/runs/36274025129
- Final workflow commit: `7f9521f4f201feb78d0dd7b328c756019dee8984`.
- Parser commit: `2f2dc1ea94b0bac87dc2251fb11f5f1ef043723a`.
- The consolidated review archive contains all 365 reduced previews, contact sheets, the exact target manifest, row-level source URLs, official identity-page references, checksums and a full-original archive index. Its preview images are NOT production renditions.
- Consolidated review artifact: https://github.com/tberridge86/Stackr/actions/runs/36274025129/artifacts/10917145140
  - 31,957,258 bytes.
  - SHA-256: `5bd019b100f476c98e6e875c1534fb8741cdd03baea4c01a213f2c3e2dfb593a`.
- First 342 full-resolution originals and official-page evidence: https://github.com/tberridge86/Stackr/actions/runs/36273754891/artifacts/10917120115
  - 709,591,126 bytes.
  - SHA-256: `097ff4745831222c6e20d3400a6cbed19b6cb5a4935403843bc9284882ce6b37`.
- Final 23 full-resolution originals and official-page evidence: https://github.com/tberridge86/Stackr/actions/runs/36274025129/artifacts/10916269076
  - 125,346,456 bytes.
  - SHA-256: `f7f4aae5f5d08c198df046f866916a3e7ac438f853720158f4c4970fa2b04c25`.

Full-original artifacts were configured for seven-day retention; the consolidated review archive for fourteen days. Preserve them in an approved durable destination before expiry if they are needed for a later import.

## Production and approvals remain separate

A read-only production check at 21:46:13 UTC still returned 294 missing SV4a printing links and 187 missing SV2a printing links. Source recovery has NOT reduced live missing-art counts yet.

The official Taiwan source is not registered as approved in the current source registry. Existing Japan or TCGdex approvals were not reused to approve a different source. This report makes no legal conclusion about rights; the source-use review must be recorded before publication.

The production-environment review for the read-only preflight run https://github.com/tberridge86/Stackr/actions/runs/36270453935 is still pending. Approving that run authorises its read-only access check; it does not itself import artwork or release the app. No approval gate was bypassed.

After the source review and protected access check, the remaining implementation is a controlled import: preserve originals, build the three required production renditions using the existing image pipeline, attach them to exact printing/variant identities, and verify API delivery before counting them as published. This new 365-front package currently contains raw source evidence and review previews, not a completed production-rendition import.

No pricing, catalogue identities, source permissions, held Supreme Victors mappings or app release was changed.
