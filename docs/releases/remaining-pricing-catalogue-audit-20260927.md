# Remaining pricing and published catalogue audit — 27 September 2026

## Focused pricing correction

The current exact TCGdex adapter rejects English Cardmarket aggregates even when
the provider proves a single ordinary holo product. Fifteen exact provider
records, representing 16 saved copies, returned current Cardmarket quotes but no
TCGplayer quote. Reuse the existing estimate writer for these evidenced holos.
Keep explicit TCGplayer finish quotes first; reject competing or missing finish
flags, unknown flags, ambiguous ordinary products and stamped-product aggregates.
Preserve actual provider timestamps and stale status. No sold-price claim.

Three additional saved references have proven English matches: SV Promo
`svp-51` -> `svp-051` (Snorlax), Black Bolt `zsv10pt5-122` -> `sv10.5b-122`
(Golett), and Surging Sparks `sv8-209` -> `sv08-209` (Skarmory). Reuse existing
set/collector resolution with explicit saved language. A foreign set alias may
not shadow an English mapping; conflicting same-language aliases still fail.
No holdings, artwork, catalogue aliases, grades or language values are rewritten.

Local exact provider replay accepts all 15 holo records. Current direct probes
also returned the three correctly named/numbered mapped cards. This is not a
production refresh receipt; the last published baseline is 326/366 priced copies.
Publication results must be appended after protected main refresh and readback.

## Measured catalogue scope

Production project `oakdbbzdqwurpjnoqhmu`, 27 September around 20:31–20:35 UTC.
SQL aggregates cover the complete published views, not a 1000-row sample.
Core identity means nonempty native name, collector number, variant code, and
present canonical set/printing identity, grouped by language.

| Language | Core identity / variants | Printings with eligible image reference / printings | Populated sets / published sets | Published logo / sets |
|---|---:|---:|---:|---:|
| English | 33359/33359 | 22673/23857 | 217/219 | 141/219 |
| Japanese | 14100/14100 | 8329/12948 | 122/170 | 139/170 |
| Korean | 239/239 | 0/239 | 3/97 | 0/97 |
| Simplified Chinese | 20408/20408 | 12127/12956 | 136/136 | 0/136 |
| Traditional Chinese | 8166/8166 | 2146/7436 | 83/83 | 0/83 |

Image coverage reproduces eligible published variant, explicit same-artwork,
and printing-level asset relations used by `api.catalogue_set_card_rows`.
It measures usable references, not a whole-file download/render census. Logo
counts exclude bundled app fallbacks and cannot establish total app logo coverage.
An additional full 705-set replay through the existing local artwork and published
fallback resolvers, checking that bundled files exist, finds any eligible logo/cover
reference for EN 172/219, JA 165/170, KO 0/97, SC 125/136 and TC 6/83:
468/705 (66.38%). This remains reference coverage, not phone-render verification.
Populated sets do not establish complete expected card membership. Published
records are not an independently verified inventory of every released set.
All-metadata completeness must not be claimed: rarity, English display names,
finish and set release-date gaps remain. The core identity check alone is 100%.

## Retrieval and CoroCoro

Measured public gateway from this Windows client, first observed request plus
four repeats for successful scenarios. This is not a controlled cold-cache or
installed-phone test. API/backend health still reports source `37817f2cb83b`.

| Scenario | First observed | Repeats | Correctness |
|---|---:|---:|---|
| English set list | 2028 ms | 83–94 ms | passed |
| Japanese exact SV2a 157 search | 823 ms | 63–87 ms | exact expected identity |
| CoroCoro search | 4996 ms | 63–79 ms | 20 Japanese promo matches with issue aliases |
| Japanese artwork manifest | 8120 ms | stopped | HTTP 504 |
| Chinese multipart collector search | 8184 ms | stopped | HTTP 504 |

Curated CoroCoro tests and the 81 supplied magazine-cover file hashes, issue
matching and presentation tests pass locally. General CoroCoro search returns
promos; this does not prove every issue or the two curated Mew records is in the
published API. Installed build 46 rendering remains unverified. Sub-500 ms across
all retrieval paths is not met. Earlier retrieval fixes are merged but are not
in the measured deployed backend.

## Source exceptions

Scrydex's first exact card request returned HTTP 401; no credential retries.
Pokemon Price Tracker returned HTTP 429: an eBay-inclusive request required
100 credits with 99 daily credits remaining and no purchased credits. The
reported reset is 28 September 00:00 UTC. No purchase or activation was made.
ACE 10 and CGC 9 holdings still require exact graded evidence.
The saved Simplified Chinese Scovillain printing is identified as promo 020,
holo; identifying it does not itself provide a price.
Pitch Black retains a duplicate-catalogue identity conflict. Existing artwork
crosswalk evidence expressly does not prove an exact finish; do not use it to
overwrite physical price identity or substitute raw prices for slabs.
