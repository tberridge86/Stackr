# Catalogue continuity and search acceptance — 12 September 2026

This receipt records a read-only census and a source-only fix based on main `10e1f4c64735102136e0d4c9d730e1f8ee829ea5`. Production database evidence was observed at 14:08:15 UTC from `oakdbbzdqwurpjnoqhmu`; staging evidence was observed at 14:08:14 UTC from `lmwfhvexfcoyeuoyrlco`. No database record, source registration, deployment, OTA, TestFlight build or installed device changed.

## Measured population

The database census aggregates the complete active published API views. It is not the quality reader's default 500-row sample. The accompanying CSV contains all **696/696 production active sets**, including the 144 active set shells that currently have no active published card variant. Active sealed-product population is **0** in every language, so sealed-product percentage coverage is **not measured**, not 100%.

| Language | Active sets | Sets with cards | Printings | Variants | Usable native images | Set logos | Set symbols |
|---|---:|---:|---:|---:|---:|---:|---:|
| en | 217 | 215 | 23,666 | 33,168 | 31,211 / 33,168 (94.100%) | 141 / 217 | 159 / 217 |
| ja | 163 | 115 | 12,619 | 13,771 | 8,620 / 13,771 (62.595%) | 97 / 163 | 2 / 163 |
| zh-cn | 136 | 136 | 12,956 | 20,408 | 19,431 / 20,408 (95.213%) | 0 / 136 | 0 / 136 |
| zh-tw | 83 | 83 | 7,436 | 8,166 | 2,382 / 8,166 (29.170%) | 0 / 83 | 0 / 83 |
| ko | 97 | 3 | 239 | 239 | 0 / 239 (0.000%) | 0 / 97 | 0 / 97 |

The production current views have native and English display names for every active set and printing. Remaining metadata gaps include Korean release dates (0/97 sets), zh-cn printed totals (51/136 sets), rarity on 2,805/12,619 Japanese printings, and rarity on 4,217/7,436 zh-tw printings. Image coverage is a database delivery census of approved current native or exact same-printing references; it is not proof of rendering on a phone.

Staging is not an interchangeable preview of production. The same published version keys currently project different active membership and metadata: staging has 0/163 Japanese set English names, 0/12,619 Japanese printing English names, 88/136 zh-cn set English names, 12,079/12,956 zh-cn printing English names, 2/97 Korean set English names and 0/239 Korean printing English names. Staging exposes 74,672 active variants versus production's 75,752. Promotion or acceptance evidence must state which environment was measured.

## Real Japanese app-path failure

The production EAS configuration uses `https://api.stackrtcg.com`. `StackrApiClient.search()` calls `/v1/search`, while the current set loader paginates `/v1/sets` with a limit of 250. A bounded production request for the native query `ピカチュウ` returned HTTP 200 after **12,566.727 ms** with **0 results** and reported the altered normalized query `ピカチュウ`.

The current production database contains **33 active Japanese printings / 36 variants** whose native name and stored normalized name are exactly `ピカチュウ`. The false empty result is therefore an API normalization defect, not a missing catalogue identity.

`normalizeSearchText()` decomposed every query to fold Latin accents but did not recompose it. Japanese dakuten and handakuten remain decomposed combining characters, so the resulting query no longer exactly matches the composed canonical database name. The source fix now removes combining accents only when they follow a Latin character, then recomposes the string. Controls show `Pokémon` still becomes `pokemon`, while composed and decomposed spellings of `ピカチュウ` both become exactly `ピカチュウ`.

The existing fixture search normalized both its query and fixture name with the same defective helper, so it could pass while the production database lookup failed. Explicit cross-boundary normalization assertions now protect the stored Japanese identity.

## Honest coverage output

The staging-only gap-summary renderer previously displayed `100.00%` whenever a denominator was zero. It now displays `not measured`, with a regression for an empty Korean population. This does not change the staging-only, read-only safety contract.

## Verification and handoff

- `node scripts/test-stackr-api-v1.mjs`: passed.
- `node scripts/test-catalogue-gap-report.mjs`: passed.
- `npm run typecheck`: passed.
- Targeted lint for the changed implementation/report files: passed.
- Full lint: zero errors and nine pre-existing warnings; `--max-warnings=0` therefore exits nonzero. None are in the changed implementation/report files. The existing default API test file also retains its unrelated default-import warning.
- `git diff --check`: passed.

Release should review and integrate this narrow backend/API source fix with the existing release lane, then deploy that exact accepted revision once the separate migration and release prerequisites pass. Acceptance requires a new production query returning the expected Japanese card identities; HTTP 200 alone is insufficient. The 12.6-second single request also corroborates the open performance problem but is not a latency benchmark and this PR does not overlap PR #184's performance work.

Device search, card rendering, navigation, scan/save and private collection acceptance remain unmeasured. Catalogue follow-up priorities by measured missing-image denominator are zh-tw (5,784), ja (5,151), zh-cn (977) and ko (239), preserving exact language, printing, finish and source provenance.
