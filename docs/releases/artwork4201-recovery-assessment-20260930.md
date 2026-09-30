# Artwork recovery assessment — 30 September 2026

This is the current factual assessment of the frozen
[4,250 exception ledger](https://github.com/tberridge86/Stackr/blob/main/docs/releases/artwork4250-exceptions-20260928.json.gz)
after its 49 successfully published English fronts are deducted. It combines
the saved Japanese, English and Chinese identity/source reviews. It is an
evidence and handoff document, not a claim that every listed case is missing
metadata or that an archive has reached production.

## Current state

The frozen worklist contains **4,201** printing-level cases. This is the 4,250
exception ledger less the 49 fronts confirmed by the
[English49 publication record](https://github.com/tberridge86/Stackr/blob/main/docs/releases/english49-published-20260930.json).

| State | Fronts | Derivative references | Meaning |
| --- | ---: | ---: | --- |
| Already published before this worklist | 7,960 | not remeasured here | Earlier recovery work; outside this 4,201-row denominator. |
| Traditional Chinese package prepared | 200 | 600 | Hash-checked archive exists; **not published**. |
| English package prepared | 45 | 135 | Hash-checked archive exists; **not published**. |
| Frozen cases still in the worklist now | 4,201 | n/a | Includes the 245 prepared candidates until a successful production receipt proves otherwise. |
| Projected worklist after both packages publish successfully | 3,956 | n/a | Arithmetic only: 4,201 minus 245. Do not treat it as an achieved count before readback. |

The prepared packages are separate and additive. They preserve existing
metadata, holdings, prices and published artwork; neither has made a
production write.

| Package | Archive and evidence | Verification state |
| --- | --- | --- |
| Traditional Chinese 200 | [Durable recovery release](https://github.com/tberridge86/Stackr/releases/tag/artwork-residual-recovery-20260930) | 200 originals and 600 standard derivatives are prepared. Archive SHA-256: `739936977fb81f8802f37fb402eaf86358820f684fcf6481122f43d63cedfe71`. **NOT published.** |
| English 45 | [Durable recovery release](https://github.com/tberridge86/Stackr/releases/tag/artwork-residual-recovery-20260930) | 45 originals and 135 standard derivatives are prepared. Archive SHA-256: `02eef8b377d576700d03a4a56b94fed57119c7e2aa912b19b8de14cf3b6d1bff`. **NOT published.** |

After each protected publication, the release owner must use its receipt to
check created/reused objects, asset links and public API delivery before
subtracting its fronts from the live remainder.

## What the 4,201 cases are

| Language | Cases | Principal classification |
| --- | ---: | --- |
| English | 664 | 663 exact-source cases and one provider-image-unavailable case. |
| Japanese | 2,221 | 2,192 exact-source cases, 20 image/finish choices, seven identity/card-name conflicts and two undersized-source cases. |
| Korean | 239 | Exact native-source cases. |
| Simplified Chinese | 829 | 605 language-identity conflicts and 224 exact-source cases. |
| Traditional Chinese | 248 | 212 exact-source cases, 33 printed-denominator cases, two composite-front cases and one wrong-source-image case. |
| **Total** | **4,201** | Printing-level recovery worklist. |

Across languages, the frozen category counts are: 3,530 `Exact source needed`,
605 `Language identity conflict`, 33 `Printed denominator conflict`, 20
`Artwork choice`, seven name/identity conflicts, two insufficient-resolution
cases, two composite reviews, one source-image conflict and one unavailable
provider image. These categories have different remedies and must not be
merged into a single “missing artwork” number.

## Work safely prepared

### Traditional Chinese: 200 exact fronts

The prepared package contains exact, reviewed Traditional Chinese fronts for
SN (5), SV4K (46), SV4M (46), SV5K (26) and SV5M (77). Its read-only
production preflight found zero existing front assets for each frozen target.
The package and receipt remain the source of truth until publication.

### English: 45 exact fronts

The English package contains Skyridge H01–H09 (9), Aquapolis H01–H09 (9),
Celebrations Classic Collection (24), BW Black Star Promos BW04–BW05 (2), and
SVP 085 (1). Each original was matched to pinned PokemonTCG metadata through
an explicit alias rule, downloaded once, hash-checked and decoded before the
standard grid, search and detail derivatives were generated.

This does **not** certify physical foil finish. In particular, the eight
Aquapolis lettered records remain unprepared because a provider's single
unlettered image cannot safely represent both `a` and `b` printings.

## Work that still needs a decision or better evidence

### Japanese legacy sources

Japanese is the largest remaining source-acquisition area. PokeData product
aliases help find legacy product pages, but its early records have conflicting
name/number/image fields, so they are discovery evidence only. No automatic
Japanese attachment cohort is safe from that source.

The 20 SV11B/SV11W cases each have two official candidates for the same card
identity. The current data does not state which image is the default Holo,
Poké Ball reverse or Master Ball reverse. Keep these as finish-selection cases.
The seven existing identity/name conflicts and two low-resolution records also
remain unlinked until a full-size exact native front is available.

### Simplified Chinese language identity conflicts: 605

The 605 `zh-cn` rows are not safe artwork targets. Every one has an exact
Traditional Chinese counterpart with the same set code, collector number and
native name. The evidence identifies them as a source-language labelling issue,
not a reason to copy or retag Traditional Chinese fronts as Simplified Chinese.
Keep all current printings and variants; prepare a staging-only language-source
reconciliation only after an authoritative Simplified Chinese replacement is
verified.

### Traditional Chinese SH33 metadata denominator gate

The 33 SH rows for collectors 021–053 are a metadata denominator correction,
not 33 artwork choices. Official checklist evidence establishes numbered cards
001/053 through 053/053, while the current set `printed_total` is 38. The
reviewed proposed value is 53; six named basic-energy identities remain outside
the numeric denominator. The 33 individual official pages and image pointers
are prepared as evidence for a separate bounded metadata lane. The correction
must be staged and reviewed before any acquisition or publication through that
lane; this evidence is not an owner decision, an applied correction or approval
to publish.

Traditional Chinese also retains two V-UNION composite-page cases (S8a 025 and
S8b 056) and one wrong-source-image case (SCD 097 Croagunk). All three need
individual exact fronts and must remain unlinked.

### English and Korean source gaps

English needs source/identity evidence for the remaining McDonald's 2023/2024
sets, later SVP cards, Ancient Mew, MEE basic energies, Promos-A, alternate
printings and the eight Aquapolis lettered records. Korean has 239 exact
native-source cases and no prepared automatic cohort in this assessment.

## Separate checklist and logo scope

The **94 sets without card checklists** remain a separate catalogue-membership
and denominator task. They are not converted into image gaps and are not
included in the 4,201 printing-level recovery worklist. Likewise, set logos,
symbols and covers have their own asset denominators and source evidence; this
document does not claim a logo or cover completion rate.

## Safe next sequence

1. Publish the independently checked TW200 and English45 archives through the
   existing protected publisher, one bounded cohort at a time.
2. Verify each final receipt, all asset associations and public API bytes.
   Only then record the measured live reduction from 4,201.
3. Stage the SH 38-to-53 metadata correction for review; retain the six energy
   identities and do not write from the checklist evidence alone.
4. Pursue exact native-language source evidence for Japanese, Korean and the
   remaining English/Chinese cases. Quarantine ambiguous language, collector
   number or finish relationships instead of substituting a similar front.

Supporting evidence: [Japanese source assessment](artwork4201-evidence/japanese-assessment-20260930.md),
[Chinese identity assessment](artwork4201-evidence/chinese-identity-assessment-20260930.md),
and [official SH checklist evidence](artwork4201-evidence/sh-official-checklist-20260930.md).
