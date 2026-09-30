# 278 more artwork fronts published — 30 September 2026

The 4,201-case recovery pass published **278 additional fronts and 834 display
derivative references** through the existing Stackr API. The recovery total is
now **8,238 published fronts**, with **3,923 artwork cases remaining**.

| Completed batch | Fronts | Display derivatives | Production run |
| --- | ---: | ---: | --- |
| Traditional Chinese SN, SV4K, SV4M, SV5K and SV5M | 200 | 600 | [36770968764](https://github.com/tberridge86/Stackr/actions/runs/36770968764) |
| English Skyridge, Aquapolis, Celebrations Classic, BW promos and SVP | 45 | 135 | [36773167099](https://github.com/tberridge86/Stackr/actions/runs/36773167099) |
| Traditional Chinese SH collectors 021–053 | 33 | 99 | [36773609955](https://github.com/tberridge86/Stackr/actions/runs/36773609955) |

## Verification and preservation

All **278 public card responses** and **1,112 original/derivative image files**
passed independent checks. The API returned the expected printing identities,
source attribution and controlled artwork. Actual delivery URLs and paths were
matched to the verified objects. Image bytes, SHA-256, format and dimensions
were checked; HTTP success alone was not counted as verification.

Fresh database readback confirms all five disjoint recovery cohorts: 7,911,
49, 200, 45 and 33 assets, printings, catalogue-version links and API manifest
entries. The total is **8,238 fronts, 24,714 derivative references and 32,898
distinct storage objects**. Earlier public continuity checks passed **79/79**:
30 multilingual canaries from the earlier 7,911 and all 49 previous English
fronts. This is API verification, not installed-phone rendering evidence.

The one metadata correction was SH's **printed denominator, 38 → 53**. All
59 existing SH printing identities and every other set field were preserved,
apart from the ordinary update timestamp. The normal public set endpoint now
returns `printedTotal: 53`. Production's separate `total: 78` remains unchanged;
its disagreement with 59 canonical printings is an explicit follow-up.
No prices, holdings, source activation, backend deployment or mobile build
changed in this artwork pass.

## Transient failures retained in the evidence

The first English run stopped before publication on a storage HTTP 429. Both
rehearsals had rolled back; six immutable files were saved and no card
association was committed. The successful continuation verified and reused
those six files, then created the other 174. No files were replaced.

Independent image reads also encountered rate limits. The Taiwanese checks
passed after 50 files needed retries (56 HTTP 429 attempts). One initial
English image response could not be decoded; its failed-only repeat matched
the exact expected bytes. Original failures and retry results are retained.
Large verification reads and publication were then sequenced separately.
These results do not establish universal sub-0.5-second retrieval or device
acceptance; the measured response timings are in the completion receipt.

## What remains

| Category | Cases | Next action |
| --- | ---: | --- |
| Exact source still needed | 3,285 | Find an exact native-language front with authoritative set and collector identity. |
| Simplified/Traditional Chinese identity conflict | 605 | Reconcile the source-language mapping while preserving all existing records; these have exact Traditional Chinese counterparts. |
| Finish, identity or unusable-image review | 33 | Resolve 20 finish choices, seven name/identity conflicts, two undersized sources, two composite fronts, one wrong source image and one unavailable provider front. |
| **Total** | **3,923** | Every row remains in the linked exception register. |

By language: Japanese **2,221**, Simplified Chinese **829**, English **619**,
Korean **239**, Traditional Chinese **15**. English includes **431 Trainer Kit
records** whose checked identity metadata has no image pointers. They need
exact deck/card sources; same-name artwork is not sufficient evidence.

Still separate: **94 sets without published card checklists**, six Gym
promo-pack grouping/display links, Scarlet & Violet Energies grouping, and
the 30thD/30thDC alias/cover issue. Existing pricing and device acceptance
gates remain in the October 1 release handoff. This pass does not establish
catalogue-wide metadata, artwork or logo completion percentages.

[Measured completion receipt](artwork278-published-20260930.json),
[full verification evidence](artwork278-verification-20260930.json.gz),
[3,923-row exception register](artwork3923-exceptions-20260930.json.gz),
[English source triage](artwork4201-evidence/english-remaining619-triage-20260930.md),
and [downloadable source packages and checksums](https://github.com/tberridge86/Stackr/releases/tag/artwork-residual-recovery-20260930).

Implementation: [PR267](https://github.com/tberridge86/Stackr/pull/267) and
[PR268](https://github.com/tberridge86/Stackr/pull/268), each with eight applicable
CI checks passed; the separately invoked release-candidate gate was skipped.
TW200 used source `c1eaecb62f02e73c98cf3bd86801b67f90d9d536`; English45 and SH33
used `a1e268dcb9fcfb5254c2f4587894ebc6d366e014`.
