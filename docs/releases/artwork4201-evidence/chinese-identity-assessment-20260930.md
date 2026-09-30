# Chinese identity and non-Japanese exception review

Observed 2026-09-30T19:38:47Z against production Supabase project
`oakdbbzdqwurpjnoqhmu`, using Stackr source revision
`4dfc387f53be58122d128af9283f5bf478cba1b8`. This is a read-only
classification. It makes no catalogue, asset, metadata, source-policy or
holding change.

## 605 Simplified Chinese language conflicts are a catalogue/source-label defect

All 605 records marked `Language identity conflict` are active `zh-cn`
printings whose candidate files are explicitly `data_tc/...`. The supplied
exception register records the same native name at both sides for every row;
the only mismatch is language. Production then confirmed a one-to-one
Traditional Chinese counterpart with the same set code, collector number and
native name for every one of the 605 rows.

| Claimed language | Set | `zh-cn` printings | Exact `zh-tw` counterpart | Result |
| --- | --- | ---: | ---: | --- |
| `zh-cn` | SV7a | 64 | 64 | false Simplified-Chinese duplicate |
| `zh-cn` | SV8 | 106 | 106 | false Simplified-Chinese duplicate |
| `zh-cn` | SV8a | 237 | 237 | false Simplified-Chinese duplicate |
| `zh-cn` | SV9 | 100 | 100 | false Simplified-Chinese duplicate |
| `zh-cn` | SV10 | 98 | 98 | false Simplified-Chinese duplicate |
| **Total** |  | **605** | **605** | no ambiguous or unmatched row |

The five target set UUIDs are `4719ccc9-35c0-406a-b2c2-989af15d77b0`,
`66d9e865-7d40-4b2e-8ef0-ae24fca87673`,
`a16f8d4c-d648-4bee-a219-9abc2aae49a6`,
`b67bee5b-da76-4575-a263-ab9cb69d4d7b`, and
`1dbfe92e-8914-49b2-974c-47683cf51d4d`. The five rows have no attached
artwork assets or catalogue-version asset links, so this recovery batch has
not put a wrong-language front into the app. They do have 605 printings and
750 active variants, including 382 variants in SV8a, so any correction must
preserve the canonical/variant history rather than delete rows.

The checked-in TCGdex native-name source independently exposes the same five
set codes and Traditional-script names under both `zh-cn` and `zh-tw`; for
example it calls the `zh-cn` SV8a set `太晶慶典ex` and SV7a `樂園騰龍`.
Its stated policy requires a strict language and native-name match. Therefore
the previous `zh-cn` import/recovery path is not a usable native-language
artwork source for these five sets.

### Bounded repair candidate

Prepare one staging-only reconciliation cohort of the 605 exact pairs. For
each pair, retain the current `zh-cn` printing and all dependent records,
mark its imported TCGdex language association as rejected for artwork, and
link it to the verified `zh-tw` counterpart as a *language-conflict
correction* rather than copying the image. The production published catalogue
must stop serving these records as Simplified Chinese only after a replacement
authoritative Simplified-Chinese identity/source has been verified. Do not
retag the stored Traditional Chinese front as `zh-cn`, merge rows, or delete
the 605 printings. The accompanying SQL is a read-only reproducibility query.

## Traditional Chinese SH denominator is a metadata correction, not 33 image choices

The 33 `Printed denominator conflict` entries are SH collectors 021--053.
The source carries an explicit total of `053`. Production has all numbered
printings 001--053 plus six named basic-energy printings (59 active printings
in total), while `catalog.sets.printed_total` is incorrectly `38`. The
numbered run itself proves the printed card denominator is at least 53. The
six energy rows need to remain outside that numeric denominator unless a
separate official checklist says otherwise.

**Exact candidate repair:** stage and review changing only SH (`929a6c13-5b43-4aba-b887-1f86cc94ce31`, `zh-tw`) `printed_total` from 38 to 53, with
the reviewed source-file evidence for 021--053 retained and rechecked against
the official checklist before write. This resolves
the 33 ledger items without changing the 53 existing card identities or the
six energy identities.

## Remaining non-Japanese cases

| Count | Identity | Classification | Next bounded action |
| ---: | --- | --- | --- |
| 2 | `zh-tw` S8a 025 and S8b 056 V-UNION | genuine composite-page conflict | keep unlinked; obtain individual-card fronts. The official pages each cover four physical cards. |
| 1 | `zh-tw` SCD 097 Croagunk | verified wrong source image | keep unlinked; the checked source byte is SCD 087 Clobbopus. Obtain the exact SCD 097 front or corrected official page. |

These three are genuine asset-source exceptions, not metadata fixes. They
remain valid owner/source-identification work and should not be auto-published.

## Scope boundary

The 20 artwork choices, five identity conflicts, two card-name conflicts and
two insufficient-resolution records are Japanese. They are deliberately not
reclassified here. The 3,530 exact-source cases require separate native-source
acquisition/review and are outside this identity-only result.
