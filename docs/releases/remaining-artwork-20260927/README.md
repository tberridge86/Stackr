# Remaining artwork and new-set review — 27 September 2026

Baseline below observed at 2026-09-27T13:02:43.889631+00:00; superseded delivery updates follow. Pitch Black was subsequently published by run 36324355703 (revision ec9ff2913d18c103e1901dcdf0acc4fb971b71dc), verified at 14:11:26.075Z. The queue now has 468 published records: 348 original additions plus 120 duplicate-printing repairs. The 89 MEP images remain unpublished until their protected release completes.

## The 209-record correction

- **120 Pitch Black records are duplicates.** Every number and name matches the existing `me05` printing. All 120 current public originals passed SHA-256, byte-size and image-decoding checks. The duplicate `PBL` records remain intact and still have no direct assets; they are not 120 newly acquired/published images.
- **89 promo files are acquired for review:** 88 numbered MEP promos and Pikachu at the Museum. All 89 provider names/identities match, all 89 files decode and all hashes are distinct. Six images were visually sampled; this is not optical validation of all 89 or proof of an exact finish.
- **Museum identity resolved:** Pikachu at the Museum is a jumbo, unnumbered promo. Scrydex’s `mep-1000` is a provider key, not a collector number.
- **Publication pending:** these 89 images came directly from Scrydex. The earlier explicit permission and cohort attestation concerned the English Pokémon TCG API batch. Stackr’s source registry defaults to deny/quarantine for unbound sources; the owner has now confirmed storing, resizing and displaying this exact 89-file Scrydex cohort; see the linked attestation below. The registry was not changed.
- The previous 348 images remain published. Pocket’s 131 records remain a separate hold. Phone rendering remains unverified.

## Storm Emeralda and 30th Celebration

The published catalogue currently has no cards for these newly checked editions. Six matching production set records exist but have zero cards and no catalogue-version membership. Existing Japanese staging data is incomplete: M6 has 110 printings; M6a has 132. Source counts below are not published-card counts or verified physical-card totals.

| Edition | Source records collected | Published cards | Remaining issue |
|---|---:|---:|---|
| Japanese Storm Emeralda — M6 | 113 | 0 | 76-card official base feed; remaining secret-card images need exact binding; staging is short by three source numbers. |
| English 30th Celebration | 161 | 0 | Bind to existing 30C set; reconcile printed numbers, finishes, colour variants and separate energy scope. |
| English 30th Classic Collection | 30 | 0 | Ordinal provider numbers differ from reprinted collector numbers, including repeated numbers; retain original printing identity and both LEGEND halves. |
| Japanese 30th Celebration — M6a | 176 | 0 | Official gallery has 167 entries, including combined LEGEND art and energies. Resolve colour identifiers, five absent numbered entries and a name mismatch. |
| Traditional Chinese — both sets | Not yet bound | 0 | Empty set records; localized source acquisition remains. |
| Simplified Chinese — 30th Celebration | Not yet bound | 0 | Empty set record; localized source acquisition remains. |
| Korean — both sets | Not yet bound | 0 found | Official products found; canonical set/card import remains. |

## Source evidence

- [Official Japanese Storm Emeralda](https://www.pokemon-card.com/ex/m6/)
- [Official Japanese 30th Celebration](https://www.30th.pokemon-card.com/product/m6a)
- [Official English 30th Celebration](https://www.pokemon.com/us/pokemon-tcg/30th-celebration)
- [Official Traditional Chinese Storm Emeralda](https://asia.pokemon-card.com/tw/archive/special/card/m6/)
- [Official Korean Storm Emeralda](https://pokemoncard.co.kr/card/938)
- [MEP source](https://scrydex.com/pokemon/expansions/mega-evolution-black-star-promos/mep)
- [Official Museum promo identification](https://www.pokemon.com/uk/pokemon-news/experiencing-the-pokemon-natural-history-museum-pop-up-shop)

## Next execution

Owner permission is now bound to the exact 89-file cohort. Rehearse a printing-front-only additive release in staging and use the protected production workflow. Keep finish and jumbo distinctions. In parallel, resolve the listed new-set identity differences before a bounded metadata import; never promote the partial Japanese staging lists as complete sets.

## Exact new-set identity corrections to make

- Japanese Storm Emeralda staging omits **072, 074 and 076**. These are the second cards in three same-named paired Stadiums (071/072, 073/074 and 075/076). Preserve both collectors; matching by name would lose a physical card.
- Japanese 30th staging lacks 44 of the 176 inspected provider identifiers, including card 152, the other LEGEND half. This is a comparison to a provider population, not a verified physical-card denominator.
- Japanese 30th card **156** is `MサーナイトEX` in the official feed but `サーナイトEX` in TCGdex; preserve the official Mega distinction during binding.
- The inspected official Japanese 30th feed omits numbered cards **119, 121, 128, 129 and 131**, combines **151152** as one gallery item, and uses lowercase energy identifiers. TCGdex additionally lists R/G/B Mew identifiers. Preserve the source distinction pending exact printed-number/variant review.
- The English Classic Collection has repeated printed numbers 106 (three cards) and 11 (two cards). The PokemonTCG source preserves distinct provider IDs (`me55c-106`, `me55c-106p`, `me55c-106m`, `me55c-11`, `me55c-11g`) and image URLs. These suffixes are provider discriminators, not printed collector-number suffixes. Keep that distinction when creating canonical identities.
- The existing staging snapshot workflow is pinned to source revision `771a8381c57c73182b9776657a15cd1166c66d36`; it cannot be assumed to contain the newly inspected source state. No incomplete legacy snapshot was dispatched.


## MEP permission and release preparation

The owner explicitly replied “SCYDEX YES TOO.” on 27 September. [The scoped attestation](../../../catalogue/rights-evidence/mep89-scrydex-owner-confirmation.2026-09-27.json) binds 89 original SHA-256 hashes and permits their resized Stackr display files. It does not enable source-wide acquisition or recognition. [The release note](../mep89-artwork-20260927.md) records the bounded publisher and validation.
