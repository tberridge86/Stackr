# Remaining English artwork triage — 30 September 2026

## Boundary and method

The frozen 4,201-row list contained 664 English rows. The 45 exact,
receipt-backed English45 fronts were published separately; the current
[3,923-row exception register](../artwork3923-exceptions-20260930.json.gz)
therefore contains **619** English rows: 618 `Exact source needed` and one
`provider_image_unavailable` row. This is a read-only source and identity
assessment; it neither downloads fronts nor changes production data.

The checked inventory is recorded in the companion [saved-source review](english-remaining619-tcgdex-source-review-20260930.json.gz), plus the pinned
PokemonTCG data material used for the published
[English45 cohort](../english45-production-receipt-20260930.json). It is a
saved review, not a claim about the provider's current live state. An exact
identity here means the set code, local collector and English name agree with
the frozen row. It does **not** mean that an image is available, that an image
is licensed for this publication lane, or that two same-name cards can share a
front. The controlled TCGdex image route remains limited by the
[card-reference notice](../../third-party/tcgdex-card-reference-notice.md).

## Count by source problem

| Source problem | Rows | What the saved evidence proves | Safe next action |
| --- | ---: | --- | --- |
| Trainer Kit deck records with exact card identities but no front pointer | 431 | Each row has a matching TCGdex kit/card record by kit, local number and name. The 16 relevant metadata files contain zero card `image` fields. | Locate an authoritative deck-card image source that identifies the kit and its local card number; verify each front before preparing a cohort. |
| Modern promo/energy records with exact identities but no front pointer | 94 | The saved TCGdex records match the frozen identity, but the target records have no image pointer. | Use a bounded, accepted source for the precise promo/energy printing; do not infer a URL or reuse same-name art. |
| Legacy/special records with exact identities but no front pointer | 93 | Saved TCGdex names/local IDs agree for these targets, but their records have no image pointer. | Obtain a primary or otherwise accepted exact front and preserve the special-printing identity. |
| No saved identity payload | 1 | HGSS Black Star Promo has no checked TCGdex set payload. | Establish an authoritative set/collector/name link before seeking a front. |
| **Total** | **619** | **No row has an already accepted, exact controlled front in the reviewed inventory.** | **No automatic artwork reuse is safe.** |

The 94 modern rows are 2023 McDonald's (15), 2024 McDonald's (15), Promos-A
(27), SVE Basic Energies (24), and SVP Black Star Promos (13). The 93
legacy/special rows are My First Battle (34), Unseen Forces Unown Collection
(28), Aquapolis suffix variants (8), Poké Card Creator Pack (5), MEE Basic
Energies (8), Yellow A Alternate (6), Celebrations Classic Collection (1),
SWSH Black Star Promo (1), Miscellaneous Promo / Ancient Mew (1), and Crimson
Blaze (1). The remaining unrepresented identity payload is the single HGSS
Black Star Promo row.

HGSS Black Star Promo `HGSS18`, Tropical Tidal Wave, is the only
`provider_image_unavailable` row. The saved source review retains its two
recorded PokemonTCG-image 404 results. Crimson Blaze remains an `Exact source
needed` row.

## Trainer Kit family: 431 rows

The Trainer Kit rows are the largest coherent English recovery group. They are
not a collection of generic reprints: the deck/kit code and local number are
part of the printing identity. The saved TCGdex records provide that identity
link but provide no card-front pointer for any of these targets.

| Kit family | Rows |
| --- | ---: |
| BW — Excadrill (`tk-bw-e`) | 30 |
| BW — Zoroark (`tk-bw-z`) | 30 |
| HS — Gyarados (`tk-hs-g`) | 30 |
| HS — Raichu (`tk-hs-r`) | 30 |
| SM — Alolan Raichu (`tk-sm-r`) | 30 |
| SM — Lycanroc (`tk-sm-l`) | 18 |
| XY — Bisharp (`tk-xy-b`) | 30 |
| XY — Latias (`tk-xy-latia`) | 30 |
| XY — Latios (`tk-xy-latio`) | 30 |
| XY — Noivern (`tk-xy-n`) | 30 |
| XY — Pikachu Libre (`tk-xy-p`) | 30 |
| XY — Suicune (`tk-xy-su`) | 30 |
| XY — Sylveon (`tk-xy-sy`) | 30 |
| XY — Wigglytuff (`tk-xy-w`) | 30 |
| DP — Manaphy (`tk-dp-m`) | 12 |
| DP — Lucario (`tk-dp-l`) | 11 |
| **Trainer Kit total** | **431** |

The recorded [10 September coverage audit](../captured-artwork-coverage-20260910.json)
also reports zero direct controlled fronts and zero explicit same-version
artwork links for every one of these 16 kit sets. That rules out a safe
existing-front reuse from the current Stackr catalogue evidence. A matching
Pokémon name, basic Energy name, or a different set's card number is
insufficient: these decks contain repeated names and energies at several local
numbers.

## Specific identity traps

| Scope | Rows | Why it remains distinct |
| --- | ---: | --- |
| Aquapolis `50a`, `50b`, `74a`, `74b`, `95a`, `95b`, `103a`, `103b` | 8 | One unlettered provider image cannot establish the `a`/`b` printing or finish. |
| Celebrations Classic `CC014` | 1 | The pinned PokemonTCG image source says `Gardevoir ex δ`; the frozen row says `Gardevoir ex`. This is a semantic difference, even though the separate saved TCGdex identity agrees with the frozen row. |
| Yellow A Alternate | 6 | The alternate suffix is a printing distinction, so a same-name front is not evidence. |
| Named Energy rows outside Trainer Kits | 36: SVE 24, MEE 8, My First Battle 4 | A shared basic-energy image needs an exact deck/printing link before reuse. |
| Promos-A | 27 | The target records are later entries without a saved image pointer; a source that merely has other P-A images does not establish these 27. |

## Result

The saved material gives an exact identity crosswalk for 618 of 619 rows,
including all 431 Trainer Kit rows, but gives **zero** accepted fronts for this
residual group. The next recoverable cohort should therefore start only after
one bounded source has demonstrated an exact kit/set/collector and card-front
relationship. It should keep the five identity traps above out of any bulk
same-name or generic-energy reuse.
