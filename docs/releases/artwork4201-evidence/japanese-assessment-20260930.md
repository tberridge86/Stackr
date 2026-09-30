# Japanese remaining-artwork assessment — 30 September 2026

This is a read-only source and identity assessment of the Japanese share of
`remaining4201.json`. It does not fetch, retain, resize, attach or publish any
artwork. The 7,960 previously published recovery fronts are outside this scope.

## Measured scope

| Bucket | Printings | Sets | Result |
| --- | ---: | ---: | --- |
| Japanese entries in the 4,201 recovery list | 2,221 | 33 | current worklist denominator |
| `Exact source needed` | 2,192 | 27 | requires a native front with exact identity proof |
| Artwork choices | 20 | 2 | SV11B/SV11W have two official candidates per collector number |
| Identity or card-name conflicts | 7 | 3 | direct authoritative identity evidence collected |
| Insufficient resolution | 2 | 1 | exact identity remains known, but only 139×196 source thumbnails exist |

The 2,192 exact-source rows comprise PMCG1–6 (457), neo1–4 (323), VS1
(143), web1 (47), E1–5 (492), PCG1–9 (722) and MC (8).

## Legacy PokeData crosswalk

PokeData's live Japanese set index exposes English product aliases for 26 of
the 27 historical groups. The product/date mappings are useful discovery
evidence: PMCG1–6 map to IDs 386–381; neo1–4 to 380–377; VS1 to 440; web1 to
441; E1–5 to 376–372; and PCG1, 2, 3, 4, 5, 6, 7, 8 and 9 to 360, 359, 355,
341, 340, 331, 326, 325 and 436. The eight MC rows have no mapped PokeData
product.

This did **not** produce a publishable cohort. For the 2,184 mapped targets,
the API returned one image URL for 503, more than one URL for 1,156, and none
for 525. More importantly, early-set fields are internally misaligned: for
example, the PMCG1 target `002` is Caterpie, but PokeData's row with that
number is labelled Ivysaur and points at `008.webp`. Comparable mismatches
occur in PMCG3, PMCG4 and neo records. Set plus collector number is therefore
not enough evidence to attach a Japanese front. No PokeData image was fetched
or retained.

The complete read-only crosswalk, individual rows and SHA-256 output evidence
are in `pokedata-legacy-crosswalk-20260930.json` (`e3150b57d60c5de16b1c3ff06b49636adbc04601e95e28af3c1f2211a66ccac9`).

## Nine exception records

Live TCGdex Japanese card records agree with Stackr's existing canonical
identity for all nine exceptions: set, collector number, native name, rarity
and one Holo default variant. This supports preserving the canonical records;
it does not provide usable card-image pointers for these cards.

| Records | Finding | Remaining condition |
| --- | --- | --- |
| S8 126–129 | TCGdex confirms Training Court, Basic Grass Energy, Basic Fire Energy and Power Tablet as Secret Rare Holo cards in Fusion Arts. | The frozen official metadata directory contains no matching pointers, so no exact front is available in the approved snapshot. |
| SM12a 184 and 197 | TCGdex confirms Lucario & Melmetal GX and Roxie’s Performance respectively. The frozen official records 37452 and 37465 instead carry shortened/wrong names (`メルメタルGX`, `ホミカ`); their live official pages still do not contain Stackr’s canonical full native title. | Retain conflict; do not attach those fronts or rewrite the canonical name. |
| SM12a 217 | TCGdex confirms Lucario & Melmetal GX, Hyper Rare, Holo. | No matching frozen official pointer. |
| SM1+ 064 and 068 | TCGdex confirms Sylveon GX and Basic Grass Energy with Holo defaults. | Existing candidate source is only 139×196, below the recovery minimum; a full-size native front is still needed. |

The source record and official-page checks are stored in
`nine-exception-source-check-20260930.json`. They contain metadata and page
hashes only, never image bytes.

## SV11B and SV11W choices

Each of the 20 entries has two frozen official metadata records with the same
set, number, name, rarity and artist, but different official page/image IDs.
Live TCGdex confirms their default printing variant is Holo; it also reports
both Poké Ball and Master Ball reverse variants for the corresponding standard
cards. The frozen metadata does not label either image with that finish. A
default-Holo policy alone cannot prove which of the two official image IDs is
the Holo front. Keep these 20 as finish-selection decisions until an
authoritative image-to-finish relationship is evidenced.

## Next bounded action

The next safe Japanese acquisition lane is an evidence-backed, small-batch
native-front source that supplies all of: immutable product identity, collector
number, native card name, exact printing/finish where variants exist, and an
approved full-size image. The legacy PokeData aliases can guide discovery but
must not be used as an attachment crosswalk.
