# Official Traditional Chinese SH checklist recheck

Observed 2026-09-30 against the official Taiwan Pokémon Card Game site. No
database, storage or production workflow write was made.

## Whole set

`https://asia.pokemon-card.com/tw/card-search/list/?expansionCodes=SH` returned
**59** card results across three pages. The official result pages enumerate
numbered cards **001/053 through 053/053** and six separately named basic
energy cards. This agrees with production's 59 active SH printings and proves
that the set's `printed_total` must be **53** for the numeric checklist; the
six energy identities must not be folded into that denominator.

The current production row is:

| Set UUID | Language | Code | Current total | Proposed reviewed total |
| --- | --- | --- | ---: | ---: |
| `929a6c13-5b43-4aba-b887-1f86cc94ce31` | `zh-tw` | SH | 38 | 53 |

## 33 exact targets

Each target's official page was fetched successfully. Its printed number was
the target collector number followed by `/053`, it displayed the SH expansion
mark, and it exposes one corresponding individual PNG. The page URLs use
detail IDs 2034--2066 in exact collector-number order.

| Collectors | Official detail IDs | Official image names |
| --- | --- | --- |
| 021--031 | 2034--2044 | `tw00002034.png`--`tw00002044.png` |
| 032--042 | 2045--2055 | `tw00002045.png`--`tw00002055.png` |
| 043--053 | 2056--2066 | `tw00002056.png`--`tw00002066.png` |

For example, collector 021 is
`https://asia.pokemon-card.com/tw/card-search/detail/2034/` and its exact
front pointer is `https://asia.pokemon-card.com/tw/card-img/tw00002034.png`.
Collector 053 is detail 2066 and `tw00002066.png`. Native names on all 33
pages match the production printing name after ignoring the page's separate
evolution-stage label.

## Prepared review cohort

Run `node prepare-sh33-acquire-input.mjs` in this directory to create
`sh33-acquire-input.json`. It creates 33 bounded rows for the existing
`tools/artwork-closeout-20260928/acquire-tw.py` path, with:

- existing printing identities and native names preserved;
- proposed `printed_total: 53` alongside the original value 38;
- exact official page and PNG pointers;
- `REVIEW_REQUIRED`, `NOT_PUBLISHED`, and `production_writes: 0` safeguards.

The generated file is preparation only. It must be paired with the narrow
staged SH metadata correction and then passed through the existing official
page/byte validator before any publication proposal.
