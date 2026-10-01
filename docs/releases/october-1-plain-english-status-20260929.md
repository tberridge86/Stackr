# Stackr: what is ready and what is still missing

**Latest artwork completion (October 1 record):** [65 Japanese/Korean fronts published and independently verified](artwork65-completion-20261001.md). Recovery total: **8,777 fronts / 26,331 derivative references / 35,041 distinct stored objects**. [Run 36808289201](https://github.com/tberridge86/Stackr/actions/runs/36808289201), source `fbbe5f3ad17dc675f89cb785e64757590e431981`, passed all **65 card and 260 image checks**, with no first-attempt failures. Its [receipt artifact](https://github.com/tberridge86/Stackr/actions/runs/36808289201/artifacts/11138975625) is independently checksum-verified. All nine recovery cohorts remain present. **817 of the owner's 4,201 cases are resolved; 3,384 remain**. Exactly 53 printing native names and their 53 native search-name rows were corrected atomically with the artwork; other card fields, aliases, variants, prices and holdings were preserved. Another **72 Japanese fronts and 216 derivatives are prepared offline** and need precise native-name corrections before protected publication. The **94 missing checklists**, logo, pricing and installed-device gates remain separate.

Updated 1 October 2026 after the Native65 publication and independent verification. This report separates card records, card pictures, set checklists and set logos. They are different jobs and their outstanding counts must not be added together.

## Earlier 7,911-front publication

[Run 36621263622](https://github.com/tberridge86/Stackr/actions/runs/36621263622) successfully published all **7,911 approved card fronts and 23,733 display-size image references**. Verification finished at **00:25:54 UTC on 30 September** (01:25 UK time).

All **31,590 unique storage files** passed the publisher's public-byte checks: **28,315 were created in this run**, and **3,275 existing files were reused and verified**. The final downloaded artifact checksum was independently verified. Its entire printing/set/language/version and file-key/hash inventory matches the frozen approved plan. A fresh production read confirms **7,911 assets and 7,911 links**; **30 of 30 independent live API checks** passed across English, Japanese and Traditional Chinese. See the [completion receipt and checksums](artwork7911-published-20260930.json) and [API results](artwork7911-api-canaries-20260930.json).

This completed **100% of the original approved batch**, not every artwork gap in the catalogue. Subsequent verified publications closed 866 of the separate 4,250 artwork cases, leaving **3,384**. The **94 missing set checklists**, remaining logo identities, pricing exceptions and phone checks remain separate. No metadata, prices or holdings were changed by the original, Native96 or Korean232 publication. The SH33 batch corrected one verified printed denominator from 38 to 53, preserving all 59 existing card identities. Native65 corrected 53 demonstrated native-name errors and their native search rows, preserving all other fields and aliases.

## Plain-English position

| Area | What is already done | What is still unresolved |
|---|---|---|
| Card details and set names | The signed-off import's 677 set/product operations are present. Stored card details now reach the API correctly; 57,436 published printings were retained with no differences from their stored values. | **Aura Seeker** is the one unresolved original metadata identity. Some dates/totals remain deliberately unknown or provisional where the source is incomplete. Matching stored values does not mean every optional card field is filled. |
| Storm Emeralda and anniversary cards | All **480 cards in the checked release group** passed identity, saved-detail and matching artwork-reference checks. | The new app still needs checking on the phone. This 480-card result is not a promise that every anniversary product in every language is complete. |
| Recovered card pictures | **8,777 fronts and 26,331 display-size references are published and verified**. All 65 latest card checks and 260 distinct image checks passed without failures. Fresh database readback confirms all nine cohorts remain present. | **3,384 artwork cases** remain; reasons are below. Phone rendering still needs checking. |
| New sets and card lists | **102 new set records** exist; 8 have published cards. | **94 sets have no imported card checklist** and remain unpublished. Full names and codes are listed below. A set name being present does not mean its cards have been imported. |
| Set logos | 134 supplied Chinese logo files are retained. Seven additional exact mappings now bring the release-code total to **130**: four retained files plus three newly sourced PNGs. Japanese crop corrections are included. | **7 supplied images still lack exact set links**; **30thD** still needs a verified logo and mapping. New-app rendering is unverified; these bundled logos are not a new API asset publication. |
| CoroCoro covers | Checks passed for the **81 supplied covers** and the curated CoroCoro records. | Check the installed screens. This is not a count of every issue ever published. |
| Set codes | Existing app IDs and routing codes have been preserved; signed-off source/printed codes remain recorded. The corrected English 30C/provider EN30C `R` and Japanese M6a `WAT` searches are deployed and passed public API checks. | Confirm the specific logo/code aliases below and installed search behaviour. |
| Pricing | Reviewed backend and both existing workers deployed; all 317 selected identities refreshed on the successful protected retry. All 204 server-side Home/binder comparisons passed; 360/366 copies had prices or labelled general estimates at the recorded readback. | Six copies remain unpriced, two providers returned credential errors, market observations remain older than the freshness policy, and the automatic worker's next scheduled execution plus signed-in/device values still need verification. See the [measured pricing handoff](railway-restored-20260930.md). |
| Speed and phone release | Repeated API reads were fast in the recorded sample. October 1's normal TestFlight continuation is scheduled. | Some first reads exceed 0.5 seconds. The new build, installation, values, images, haptics, gyro and camera checks remain. |

## The 3,384 artwork cases still needing work

These are the remaining cases from the frozen 12,161-case artwork worklist, not missing card records. A card can already be in the catalogue and still lack a verified picture. The original 7,911 publication plus 866 subsequent recoveries leave 3,384 cases. The next 72 prepared fronts below remain in the count until actually published.

| Why it is unresolved | Cards | What is needed |
|---|---:|---|
| Exact-source work still unresolved | 2,674 | Find or independently review a matching front, then publish it. Some unreviewed source files are already retained. |
| Verified front held for native-name correction | 72 | Correct only the demonstrated saved native-name errors, then publish the matching front atomically. |
| Known provider image is unavailable | 1 | Restore the source or obtain an approved alternative. |
| Simplified/Traditional Chinese identity does not agree | 605 | Confirm the correct language and printing before attaching the picture. |
| More than one possible artwork | 20 | Select the correct front using reliable printing evidence. |
| Card name or identity conflicts | 7 | Resolve the five identity conflicts and two card-name conflicts against exact printing evidence. |
| Image is too small | 2 | Obtain a sufficiently clear original. |
| V-UNION needs individual card fronts | 2 | Obtain or verify the individual fronts rather than a combined picture. |
| Supplier image is for a different card | 1 | Replace the incorrect source match with the correct card image. |
| **Total** | **3,384** | |

By language: **English 465; Japanese 2,083; Korean 0; Simplified Chinese 829; Traditional Chinese 7.** The [current exception register](artwork3384-exceptions-20261001.json.gz) preserves exact identities and previous categories. The 33 SH denominator cases are resolved; production's separate declared total of 78 versus 59 canonical printings remains a metadata follow-up.

The next prepared batch contains **72 Japanese E1 fronts and 216 derivatives**. Root reviewed every printed title and collector fraction; all 288 retained/generated files passed offline verification. All 72 require precise native-name corrections before protected publication and are not counted as delivered. [Exact review and preparation evidence](japanese-next72-reviewed-20261001.json). The Korean count of zero applies only to this frozen artwork queue, not a whole-catalogue completeness claim.

The latest actual HTTP response-body median/p95 was **285/3,606 ms for card detail, 204/2,663 ms for manifests and 370/3,397 ms for images**. These times exclude deliberate verifier pacing; every request passed without retries. The slower tail means the requested universal sub-0.5-second target remains unmet in this sample. Installed-phone performance is unmeasured.

## Logos: the exact outstanding list

### Seven entries resolved for the next app release

| Previously outstanding | Exact catalogue code | Result |
|---|---|---|
| 30thC | 30thC | Existing supplied logo linked to the exact Chinese set; no imported cards yet. |
| CBB6C | CBB6 | Existing Gem Pack Vol. 6 logo linked; operational code preserved; no imported cards yet. |
| 30thP | promo-30th-p | Provider explicitly associates this promo set with the 30THP logo. |
| CSOLC | cs0lc | Provider and official Chinese product identity confirm the letter-O/zero discrepancy. |
| CSEC | csec | Original product logo sourced and checked. |
| SP | promo-s-p | Original provider promo-series mark sourced and checked. |
| SMP | promo-sm-p | Original provider promo-series mark sourced and checked. |

All 134 owner-supplied PNGs remain unchanged. The three new files retain their original bytes. Promo-series marks are provider artwork, not claimed as dedicated official expansion logos. The [source and checksum receipt](chinese-logo-recovery-20260929.json) records each exact identity. This is client-bundled presentation work: it needs the new native release and phone checks.

### Images exist but still need an exact set link — 7

**Gym Event Promo Pack Vol. 1, 2, 3, 4, 5 and 6**, plus **Scarlet & Violet Energies**. All 72 listed Gym cards already exist in the S-P catalogue; the unresolved work is exact pack grouping and display links. The Energies source groups eight unnumbered energies; its display labels are not verified printed collector numbers. No code or language guessing has been applied.

### Still missing a verified logo — 1

**30thD**. The [official product announcement](https://www.pokemon.cn/tcg/product/21608.html) identifies the Espeon/Umbreon deluxe decks; the [saved source review](logo-source-review-20260930.json) lists the corresponding deck as **30thDC**, with 40 numbered cards and five unnumbered energies. Its observed symbol is only 25 × 14 pixels. A usable logo/cover and exact alias mapping remain unresolved. The 30thC booster logo is not substituted. These eight unresolved entries are from this supplied-pack review, not a catalogue-wide missing-logo census.

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

1. Retain the completed artwork receipts and check the new fronts in the installed app; continue exact-source recovery against the 3,923-row register.
2. Verify the automatic worker's next scheduled execution and signed-in/device values; retain the six unpriced holdings and provider-credential exceptions from the pricing handoff.
3. Build the reviewed release through the existing October 1 TestFlight process and verify the installed app.
4. Keep the remaining source, logo and checklist gaps visible. Do not label these complete or claim 99% coverage without a defined population and a matching audit.

The source-research backlog is separate from delivering the reviewed fixes. Existing metadata, working artwork, prices and holdings are preserved throughout.

Evidence: [API acceptance](october-1-api-acceptance-20260929.md), [fresh set checklist readback](october-1-new-set-status-evening-20260929.json), [artwork recovery receipt](artwork7911-storage-recovery-20260929.json), [release queue](october-1-2026.md).
