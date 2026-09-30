# Next 96 independently reviewed artwork fronts

**Prepared, not published.** This bounded group contains 16 English and 80 Japanese printing fronts from the remaining 3,777-case register. It uses three existing, independently downloaded and checksum-verified source archives; no image reacquisition or archive replacement is required.

The Japanese cards received a second, direct face review after inherited visual approvals proved unreliable. E3/015 (`9c2a3998-0250-4337-ac12-526484543921`) is explicitly excluded: the printed title is モンジャラ, while the saved name is タンゲラ. The separate 57-candidate group remains outside this release. E2/008 retains its existing アリアドス-008/092 name; the printed native title アリアドス and collector 008/092 are recorded as an explicit formatting match. The [81-card independent review](japanese81-independent-review-20260930.json) records all observations and the rejected card.

## Exact scope

- **English 16:** McDonald's 2024 (1), EX Trainer Kit (5), Sun & Moon Trainer Kits (3), XY Latias/Suicune kits (3), XY alternate artworks (4).
- **Japanese 80:** E1 (9), E2 (6), E3 (10), E4 (18), E5 (7), PCG1 (11), PCG2 (7), PCG3 (5), PCG4 (4), web1 (3).
- **288 derivative references; 384 total file references.** Originals, native source resolution and watermarks are retained. Front verification does not certify every foil finish.
- Frozen cohort SHA-256: `6c844ebe22b51ed3dc18a3c30486693e63768702008ac564a3cd980a5fbecd38`.

All files are retained in the [existing recovery archive release](https://github.com/tberridge86/Stackr/releases/tag/artwork-residual-recovery-20260930):

| Archive | Accepted fronts | ZIP SHA-256 |
|---|---:|---|
| `stackr-english16-verified-20260930.zip` (601835903) | 16 | `d72de9f1a9c45f8f25826ec6d8a18894aa7a78159f4a44d1ddda06dcedfecaae` |
| `stackr-japanese21-verified-20260930.zip` (601835898) | 20 of 21 | `b6c2526c0a1d87a563afb6a2e2b5821c495ef29d7c2ffe7d03a5f8d12f71c81c` |
| `stackr-japanese60-strict-species-20260930.zip` (601835899) | 60 | `6e64f63ec15bee1f7160909fe8f3bf8abdda4f28c67031c6392cd41464ec8910` |

The original archive names are historical labels; acceptance is defined by the frozen cohort and independent review, not by “verified” in a filename. All 388 image references in the three archives were decoded and checked; only the 384 references belonging to these 96 accepted fronts are selected for publication.

## Existing protected publication path

The `native96` choice in the existing production workflow reuses the established immutable upload, staging/production rollback rehearsals, exact-main check, collision/identity guards, atomic asset association and public-byte verification. It cannot run the broad deployment job. It leaves metadata, pricing, holdings, existing artwork and source activation unchanged. The existing inactive `tcgplayer_card_artwork` provenance row must match; the TCGCSV pricing source is unaffected.

Each row requires root's direct title/collector review tied to the original checksum, its exact provider category (English 3 or Japanese 85), group, product and source URL. Rehearsals repeat identity and existing-artwork checks immediately before publication. A failed upload preserves immutable progress and stops before associations; a later retry must use the same frozen cohort and reviewed revision. A successful run still requires independently downloaded receipts and live card/file checks before these 96 are deducted from the remaining list.

Validation: 34 publisher, native96 and workflow guards passed; all 384 selected file references independently decoded and checksum-verified. No production writes were made by preparation or local verification. Applicable GitHub checks must pass before normal production approval and dispatch.
