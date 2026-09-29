# Stackr: what is ready and what is still missing

Updated 29 September 2026, evening. This report separates card records, card pictures, set checklists and set logos. They are different jobs and their outstanding counts must not be added together.

## Artwork publication underway

[The active publication run](https://github.com/tberridge86/Stackr/actions/runs/36621263622) is processing the approved **7,911 card fronts and 23,733 display-size images**. It uses the recovered files already prepared, including earlier greeting-chat work. It does not collect those pictures again.

The earlier run preserved **3,275 verified files** before a storage error. [PR255](https://github.com/tberridge86/Stackr/pull/255) fixed the missing retry for that error and passed all eight applicable checks, plus 63 focused tests. The resumed run must finish its file checks and publication before these pictures count as delivered through the API. At the 19:47 UTC database check, **zero of this batch's card-front associations were published**; the combined rehearsal/publication step was still running. This is a checkpoint, not a final outcome. Require the final receipt and API readback before release.

## Plain-English position

| Area | What is already done | What is still unresolved |
|---|---|---|
| Card details and set names | The signed-off import's 677 set/product operations are present. Stored card details now reach the API correctly; 57,436 published printings were retained with no differences from their stored values. | **Aura Seeker** is the one unresolved original metadata identity. Some dates/totals remain deliberately unknown or provisional where the source is incomplete. Matching stored values does not mean every optional card field is filled. |
| Storm Emeralda and anniversary cards | All **480 cards in the checked release group** passed identity, saved-detail and matching artwork-reference checks. | The new app still needs checking on the phone. This 480-card result is not a promise that every anniversary product in every language is complete. |
| Recovered card pictures | **7,911 fronts** are prepared and approved; their publication has resumed. | Finish and verify that publication. Separately, **4,250 artwork cases** remain outside this batch; reasons are below. |
| New sets and card lists | **102 new set records** exist; 8 have published cards. | **94 sets have no imported card checklist** and remain unpublished. Full names and codes are listed below. A set name being present does not mean its cards have been imported. |
| Set logos | 134 supplied Chinese logo files are retained; **123 are linked to exact Simplified Chinese set identities in the release code**. Japanese crop corrections are included. | **11 supplied images are not yet assigned**, and **4 codes had no supplied logo image**. These are listed separately below. New-app rendering is unverified. |
| CoroCoro covers | Checks passed for the **81 supplied covers** and the curated CoroCoro records. | Check the installed screens. This is not a count of every issue ever published. |
| Set codes | Existing app IDs and routing codes have been preserved; signed-off source/printed codes remain recorded. | Confirm the specific logo/code aliases below rather than guessing. Two collector-code searches, English 30C/provider EN30C `R` and Japanese M6a `WAT`, need correction; the cards themselves exist and open from their set lists. |
| Pricing | Existing pricing and valuation corrections are merged. | Newer backend/refresh-worker delivery and fresh collection totals remain unverified. The evening provider check still showed the older backend and failed old worker deployments. |
| Speed and phone release | Repeated API reads were fast in the recorded sample. October 1's normal TestFlight continuation is scheduled. | Some first reads exceed 0.5 seconds. The new build, installation, values, images, haptics, gyro and camera checks remain. |

## The 4,250 artwork cases still needing work

These are from the frozen 12,161-case artwork worklist, not 4,250 missing card records. A card can already be in the catalogue and still lack a verified picture.

| Why it is unresolved | Cards | What is needed |
|---|---:|---|
| No exact usable source image identified yet | 3,530 | Find a usable picture of that exact card and language. |
| Known provider image is unavailable | 50 | Restore the source or obtain an approved alternative. |
| Simplified/Traditional Chinese identity does not agree | 605 | Confirm the correct language and printing before attaching the picture. |
| Printed set total does not agree | 33 | Confirm the card number and the total printed beside it. |
| More than one possible artwork | 20 | Select the correct front using reliable printing evidence. |
| Card name or identity conflicts | 7 | Resolve which card the record and picture represent. |
| Image is too small | 2 | Obtain a sufficiently clear original. |
| V-UNION needs individual card fronts | 2 | Obtain/verify the individual fronts rather than a combined picture. |
| Supplier image is for a different card | 1 | Replace the incorrect source match with the correct card image. |
| **Total** | **4,250** | |

By language: **English 713; Japanese 2,221; Korean 239; Simplified Chinese 829; Traditional Chinese 248.** The [full saved exception register](artwork4250-exceptions-20260928.json.gz) retains each card's exact identity and reason.

## Logos: the exact outstanding list

### Images exist, but the correct set link is unresolved — 11

| Supplied label/code | Remaining issue |
|---|---|
| 30thC — 30th Celebration | Confirm the matching Simplified Chinese published set; the supplied logo is not wired into the current resolver. |
| CBB6C — Gem Pack Vol. 6 | Confirm the matching published set and link. |
| 30thP — 30th Celebration Promos | Confirm its relationship to the app's `promo-30th-p` code. |
| CSOLC — Quicksand Card Display Pendant Gift Box | Confirm letter **O** in the supplied label versus digit **0** in catalogue `cs0lc`. |
| Gym Event Promo Pack Vol. 1 | Confirm the exact set identity; no printed code supplied. |
| Gym Event Promo Pack Vol. 2 | Same identity check. |
| Gym Event Promo Pack Vol. 3 | Same identity check. |
| Gym Event Promo Pack Vol. 4 | Same identity check. |
| Gym Event Promo Pack Vol. 5 | Same identity check. |
| Gym Event Promo Pack Vol. 6 | Same identity check. |
| Scarlet & Violet Energies | Confirm an actual energy-set identity; do not attach it to the promo set by guesswork. |

### No logo image was supplied — 4 codes

**30thD, CSEC, SP and SMP.** The supplied pack contained placeholders for these. This is a statement about that pack; it does not prove no other existing fallback/source is available. The 11 assignment gaps and these four missing-source entries are not a catalogue-wide missing-logo census.

## New sets without imported card checklists — 94

Rechecked directly in production on 29 September evening: **15 English, 51 Japanese, 3 Simplified Chinese and 25 Traditional Chinese**. All 94 have zero canonical card records and remain unpublished. These records are not automatically ready for import merely because their names exist; source completeness, release status and product/checklist identity still need checking.

| Language | Set code | Set name |
|---|---|---|
| English | DLR | Delta Reign |
| English | M13 | McDonald's Collection 2013 |
| English | PPS1 | Play! Pokémon Prize Pack Series One |
| English | PPS2 | Play! Pokémon Prize Pack Series Two |
| English | PPS3 | Play! Pokémon Prize Pack Series Three |
| English | PPS4 | Play! Pokémon Prize Pack Series Four |
| English | PPS5 | Play! Pokémon Prize Pack Series Five |
| English | PPS6 | Play! Pokémon Prize Pack Series Six |
| English | PPS7 | Play! Pokémon Prize Pack Series Seven |
| English | PPS8 | Play! Pokémon Prize Pack Series Eight |
| English | PPS9 | Play! Pokémon Prize Pack Series Nine |
| English | PTCGC | Pokémon Trading Card Game Classic |
| English | TT22 | Trick or Trade 2022 |
| English | TT23 | Trick or Trade 2023 |
| English | TT24 | Trick or Trade 2024 |
| Japanese | ADV-P | ADV-P Promotional cards |
| Japanese | BW1-Black | Black Collection |
| Japanese | BW1-White | White Collection |
| Japanese | BW2 | Red Collection |
| Japanese | BW3-Hail | Hail Blizzard |
| Japanese | BW3-Psycho | Psycho Drive |
| Japanese | BW4 | Dark Rush |
| Japanese | BW5-Blade | Dragon Blade |
| Japanese | BW5-Blast | Dragon Blast |
| Japanese | BW6-Cold | Cold Flare |
| Japanese | BW6-Freeze | Freeze Bolt |
| Japanese | BW7 | Plasma Gale |
| Japanese | BW8-Spiral | Spiral Force |
| Japanese | BW8-Thunder | Thunder Knuckle |
| Japanese | BW9 | Megalo Cannon |
| Japanese | CS1 | Collection Sheet Journey Partners |
| Japanese | DP1-D | Space-Time Creation: Diamond Collection |
| Japanese | DP1-P | Space-Time Creation: Pearl Collection |
| Japanese | DP2 | Secret of the Lakes |
| Japanese | DP3 | Shining Darkness |
| Japanese | DP4-Dawn | Dawn Dash |
| Japanese | DP4-Moon | Moonlit Pursuit |
| Japanese | DP5-Cry | Cry from the Mysterious |
| Japanese | DP5-Temple | Temple of Anger |
| Japanese | DP6 | Intense Fight in the Destroyed Sky |
| Japanese | DPt-P | DPt-P Promotional cards |
| Japanese | DPt1 | Galactic's Conquest |
| Japanese | DPt2 | Bonds to the End of Time |
| Japanese | DPt3 | Beat of the Frontier |
| Japanese | DPt4 | Advent of Arceus |
| Japanese | DS | Dragon Selection |
| Japanese | EBB | EX Battle Boost |
| Japanese | J | J Promotional cards |
| Japanese | JA-PROMO-UN | Unnumbered Promotional cards |
| Japanese | JA-SI | Southern Islands |
| Japanese | L-P | L-P Promotional cards |
| Japanese | MCD02 | McDonald's Original Minimum★Pack |
| Japanese | MOV10 | Movie 10th Anniversary Premium Sheet |
| Japanese | MOV11 | Movie Commemoration Premium Sheet |
| Japanese | P | P Promotional cards |
| Japanese | PCG-P | PCG-P Promotional cards |
| Japanese | PLAY | PLAY Promotional cards |
| Japanese | PPP | PPP Promotional cards |
| Japanese | S8aP | Promo Card Pack 25th Anniversary Edition |
| Japanese | SC | Shiny Collection |
| Japanese | T | T Promotional cards |
| Japanese | Vending1 | Expansion Sheet: Vending Series 1 (Blue) |
| Japanese | Vending2 | Expansion Sheet: Vending Series 2 (Red) |
| Japanese | Vending3 | Expansion Sheet: Vending Series 3 (Green) |
| Japanese | WC10 | World Collection |
| Japanese | XY | THE BEST OF XY |
| Simplified Chinese | 30thC | 30th Celebration |
| Simplified Chinese | CBB6 | Gem Pack Vol. 6 |
| Simplified Chinese | M-P | M-P Promotional cards |
| Traditional Chinese | AC1a | All Stars Collection: Set A |
| Traditional Chinese | AC1b | All Stars Collection: Set B |
| Traditional Chinese | AC2a | Dreams Come True Collection: Set A |
| Traditional Chinese | AC2b | Dreams Come True Collection: Set B |
| Traditional Chinese | AS5a | Double Burst: Set A |
| Traditional Chinese | AS5b | Double Burst: Set B |
| Traditional Chinese | AS6a | Legendary Clash: Set A |
| Traditional Chinese | AS6b | Legendary Clash: Set B |
| Traditional Chinese | M-P | Mega Evolution Promotional cards |
| Traditional Chinese | M1L | Mega Brave |
| Traditional Chinese | M1S | Mega Symphonia |
| Traditional Chinese | M2 | Inferno X |
| Traditional Chinese | M2a | MEGA Dream ex |
| Traditional Chinese | M3 | Nihil Zero |
| Traditional Chinese | M4 | Ninja Spinner |
| Traditional Chinese | M5 | Abyss Eye |
| Traditional Chinese | M6 | Storm Emeralda |
| Traditional Chinese | M6a | 30th Celebration |
| Traditional Chinese | S-P | Sword & Shield Promotional cards |
| Traditional Chinese | SM-P | Sun & Moon Promotional cards |
| Traditional Chinese | SV11W | White Flare |
| Traditional Chinese | TW-BASE | Base Set |
| Traditional Chinese | TW-EXLM | EX Legend Maker |
| Traditional Chinese | TW-PWC | Pikachu World Collection — Traditional Chinese card |
| Traditional Chinese | TW-SV11B | Black Bolt |

## What is needed before calling the release ready

1. Finish the artwork publication and verify that the Stackr API returns the correct fronts.
2. Confirm the pricing backend and refresh workers are deployed and refresh saved values correctly.
3. Build the reviewed release through the existing October 1 TestFlight process and verify the installed app.
4. Keep the remaining source, logo and checklist gaps visible. Do not label these complete or claim 99% coverage without a defined population and a matching audit.

The source-research backlog is separate from delivering the reviewed fixes. Existing metadata, working artwork, prices and holdings are preserved throughout.

Evidence: [API acceptance](october-1-api-acceptance-20260929.md), [fresh set checklist readback](october-1-new-set-status-evening-20260929.json), [artwork recovery receipt](artwork7911-storage-recovery-20260929.json), [release queue](october-1-2026.md).
