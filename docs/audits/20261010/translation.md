# Independent English-name audit — 10 October 2026

Source revision: `5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`, branch
`codex/specialist-audits-backend-repair-20261010`, recovery checkout
`D:/Stackr-release-recovery-20261009`. This specialist owns only this report and
[the exact correction proposal](marnie-alias-correction.json). Other agents'
changes were preserved. The original `D:/Stackr-1` was inspected read-only for
the named source inputs, local translation modules and check-mode builders.

## Result and delivery state

The known Traditional Chinese Trainer error is independently confirmed for all
12 IDs in its exact approved-name group. Each public card response preserves
`zh-tw`, native title `瑪俐`, Trainer classification, set/number and variant/finish,
but supplies English display name `Pikachu`. Official native and English evidence
supports the proposed display/search alias **Marnie**. The proposal is pending
canonical review; no runtime map or catalogue record was changed.

The 6 October owner-approved batch completed 19,315 card-name selections with
zero amber remaining, as recorded by the supplied completion receipt and current
generated manifest. This audit does not reopen that closed bulk work. The new
failure is a source-backed semantic correction to 12 already completed names.
Current checks verify the recorded names and hashes; they cannot certify that
every recorded translation is semantically correct. Outstanding set names and
rules/descriptive text are separate scopes and remain unmeasured here.

| State | Evidence |
| --- | --- |
| Source checked | Recovery backend manifest contains 19,315 exact aliases: JA 11,280; Traditional Chinese 7,227; Simplified Chinese 569; Korean 239. Narrow regression and identity/provenance fixtures pass. |
| Original local work checked | The untracked owner-name builder and mirror sync exist in `D:/Stackr-1`; both `--check` modes passed. Their mirrored backend/mobile map preserves the same faulty 12-ID record. |
| Proposal prepared | Exact 12 public printing identities, original workbook rows/hash, observed English name, proposed alias, source references, validation requirements and rollback conditions are in the JSON proposal. |
| Implemented/committed/merged | No translation runtime repair or commit by this specialist. Backend's concurrent Japanese set guard is a separate local repair. |
| Live | All 12 unique card-detail reads were HTTP 200 at 22:22:58–22:23:00 UTC; a second bounded capture at 22:25:06–22:25:08 UTC records the compact review evidence. API/gateway responses can be cached; repeated request IDs are retained without claiming a fresh database read. |
| Live backend | `/health` at `2026-10-10T22:23:01.059Z` reported `9fae8fac7e8a`, `bundled_workflow_sha`, deployment `7070a53d-6b09-41e7-9e06-ee3fcb7b8212`, production. |
| Phone | Unmeasured. Signed build 54 predates the latest recovery work; this audit inspected no installed device. |

## Bounded paths and contracts

Read `AGENTS.md`, `.codex/AUDIT_PROTOCOL.md`, `docs/agents/README.md`, the catalogue
brief, assignment plan and backend audit. Inspected the requested
`backend/lib/cardNameTranslations.js`, `backend/lib/cardDisplayNames.js`,
`lib/pokemonDisplayNames.ts`, `lib/foreignPokemon.ts`, `lib/japaneseCatalogue.ts`
and `lib/setDisplay.ts`; followed the actual versioned serializer/search,
`lib/stackrDomainAdapter.ts`, `lib/foreignCardPresentation.ts`, card-detail caller,
generated maps and named set/translation fixtures. `lib/japaneseCatalogue.ts`
is a health-summary reader, rather than a translation registry.

Backend `cardNameTranslations.js` is the shared name resolver in this release
checkout. An approved exact ID requires matching language and complete native
title. A later reviewed canonical name with recognized source/status/official
flag and SHA-256 evidence takes precedence over the dated approved snapshot.
Without that reviewed provenance, an exact approved record supersedes stale
English fields. Ambiguous native groups need exact printing identity. Gender,
forms and case-sensitive EX/ex suffixes remain distinct. Placeholders are
rejected by the shared English-name cleaner and do not become search evidence.

The canonical API keeps `names.native` and `names.englishDisplay` separate and
returns an English supplement with provenance and authority status. The active
mobile adapter retains these fields and marks its raw payload canonical;
canonical null names remain unresolved on the phone. Client display uses the
existing English/pending policy while retaining native identity in the payload.
No fallback policy was changed by this audit.

The recovery mobile archive deliberately excludes generated card-name maps;
it consumes the server result. The original dirty checkout has untracked
`lib/cardNameTranslations.js`, mirrored generated name maps,
`scripts/build-owner-approved-card-name-runtime.mjs`,
`scripts/sync-card-english-runtime.mjs` and additional translation tests.
These were confirmed before use. The sync builder reads backend source and
writes four mobile targets unless `--check` is supplied. Its absence in recovery
is intentional release architecture, not failed generation. Original-checkout
check evidence is distinct from committed recovery fixture coverage.

Set-name supplements distinguish direct English fields, pinned Japanese provider
metadata, and owner-approved editorial translations. The latter remain
`model_translation_draft`, non-authoritative, runtime-only supplements requiring
exact language/code/native title and the existing rights gate. Narrow positive
controls included JA `SGG`, Simplified Chinese `CS5.5C`, and Traditional Chinese
`SVAM`; mismatched native/language/code controls fail closed. JA
`エリカの招待` resolves `Erika's Invitation`, and `皮卡丘ex` resolves `Pikachu ex`
separately in `zh-cn` and `zh-tw`. These are fixture/display results, not a claim
of equivalent printings or current language-wide coverage.

The merged Chinese ingestion guard rejects `zh-cn` SV7a/SV8/SV8a/SV9/SV10 source
identities across set/card/variant/asset types, including provider-ID prefixes
when a nested set is absent. A focused SV8 fixture containing EnglishName
`Pikachu` was rejected; a CSV1C control was accepted. The source retains those
contradictory provider records for review instead of importing their identities,
artwork or prices. This gate prevents new imports; it does not correct previously
published aliases or prove that an old generated label establishes language or
printing identity. Parent's existing 605-pair conflict receipt is referenced,
not recounted as a new census by this specialist.

## T-01 — High: completed native Trainer group has the wrong English alias

The exact generated record is `['zh-tw', '瑪俐', 'Pikachu', [12 IDs]]` in
`backend/lib/generated/ownerApprovedCardEnglishNames.js`. The containing generated
snapshot's records hash (all 19,315 printing records) is
`3309ae44ba128205f00276e78a7eb05e5c00e0069eac140f653e951566b95581`.
All 12 entries trace to the original non-amber selection in
`D:/Stackr-1/.tmp/approved-english-metadata-20261006/accepted.json`; its actual
SHA-256 matches manifest input hash
`5fd3a144044626b02c85bc105858d836cc57a39c3c1e5e67609826ae69661868`.
The selected workbook SHA-256 is
`078bc294c53196ae49a5c4691130888179acc428b92cde94b743abbcefc81cf8`.
Named SC1b 171 printing `4a459e00-0853-43a7-b0a6-e9d0f56c42f6` came from workbook
row 13688. The original selection already says Pikachu; this is not introduced
by serialization or a new species inference. The 16,800-row non-amber application
receipt is complete at 6 October 18:54:34 UTC; later bridge/proposal completion
is represented by the 19,315 runtime manifest. The old excluded-amber count is
historical and must not be reported as today's unresolved card-name count.

The [official Taiwan card page](https://asia.pokemon-card.com/tw/card-search/detail/7432/)
identifies `瑪俐`, Supporter, D 171/153, artist kirisAki and `劍&盾` SET B.
The [official English Sword & Shield checklist](https://assets.pokemon.com/assets/cms2-en-uk/pdf/trading-card-game/checklist/swsh1_web_cardlist_en.pdf)
names Marnie at 169 and 200. The
[official English promo database](https://www.pokemon.com/uk/pokemon-tcg/pokemon-cards/series/swshp/SWSH121/)
independently names the Trainer-Supporter Marnie. Together these support the
complete-title English display alias; they do not prove cross-language printing,
artwork, rarity, price or collector-number equivalence. Only SC1b 171's specific
official native printing page was inspected; the other eleven exact public
identities share the full native title and are retained separately in the proposal.

The incorrect record also contaminates search. Locally,
`findNativeCardNamesForEnglishQuery('Pikachu', 'zh-tw')` includes `瑪俐`, while
the Marnie query does not. `searchPublishedEnglishTranslations` verifies the
actual printing against that same approved resolver, so an accurate identity
check cannot reject a semantically wrong approved label.

The live public `/v1/search` checks at 22:25:26 UTC were confined to language
`zh-tw`, set UUID `205ab185-9052-4965-b9f0-20fe44b7b61f`, limit 20:

| Query | Result |
| --- | --- |
| Marnie | Empty, request `50990f44-8522-44a0-8350-d3553bc5520d`. |
| Pikachu | Returns the SC1b 149 and 171 Trainer IDs as stored `english_display` exact-name matches, request `d53acb47-89bf-4c99-b867-888fa6c817c4`. |
| 瑪俐 | Returns those two exact native-name identities, request `ba57d627-43f1-4d14-9327-0b22cdbcb41a`. |

Smallest repair: review the exact 12-ID proposal, preserve the immutable original
receipt, correct the existing source/canonical name rows through the established
provenance workflow, reconcile the dated generated group, and remove stale
Pikachu aliases only from the affected printing/variant scopes. Retain unrelated
real Pikachu aliases. Snapshot-only correction cannot remove stored search
aliases. A canonical correction with valid later reviewed provenance can win
over the dated map, but the map's native candidate index also needs reconciliation
for reliable Marnie lookup. Rollback must use current 12-row before-images and
scoped name/provenance/publication state; the historical 16,800-row rollback must
never be used for this correction.

Acceptance: exact 12 Marnie display/search results, native names unchanged,
Trainer classification retained, no Pikachu search hits for these IDs, real
Pikachu control preserved, and identical language/set/number/variant/finish/assets/
price identity. Source-supported proposal only; review/publication is outstanding.

## T-02 — Medium: client manual Japanese set lookup bypasses conflict guards

Recovery `lib/pokemonDisplayNames.ts:522` permits a Japanese legacy ID to
override an explicit Chinese language, and `:651` tries older ID/code aliases
without the backend's newly added conflict test. Both following inputs reproduce
client name/supplement `Pokemon Card 151`, labelled authoritative:

```js
{ language: 'zh-cn', id: 'ja:sv2a', setCode: 'sv2a', localName: '测试' }
{ language: 'ja', setCode: 'sv2a', raw: { language: 'zh-tw', set_code: 'sv4a' } }
```

The concurrently repaired backend returns null for both. Provider/editorial
exact-language guards do not help because the manual-name branch runs first.
This is a reproduced source defect with contradictory input, not evidence that
an installed phone currently contains either corrupt record. Parent owns the
client follow-up: match backend conflict behavior in the assigned display module,
add explicit client/backend parity controls, preserve native/pending fallback and
directly reviewed English metadata. No client edit by this specialist.

## T-03 — Medium: legacy mobile species fallback can label a Trainer Pikachu

`lib/pokemonDisplayNames.ts:815` correctly respects canonical API null English
names. For a noncanonical legacy record, however, `:841` continues into a dex-ID
fallback without requiring a complete native Pokémon title or excluding Trainers:

```js
getEnglishCardDisplayName({ language: 'ja', localName: 'マリィ', raw: { dexId: [25] } })
// 'Pikachu'
```

Adding `raw.stackr.canonical: true` returns null as expected. This demonstrates
legacy-input risk in the actual mobile helper, separate from T-01's approved
source error. No current live legacy Marnie/dex record or phone reproduction was
claimed. Parent owns a bounded follow-up to remove incomplete species-derived
full-title inference and use the established server/shared full-title contract,
preserving native identity and the current unresolved display policy.

## Checks actually performed

All following commands exited 0 in the recovery checkout, with TMP/TEMP on D:

- `node scripts/test-backend-approved-card-names.mjs`
- `node scripts/test-backend-translation-search.mjs`
- `node --import tsx scripts/test-server-name-delivery.mjs`
- `node --import tsx scripts/test-native-language-display.ts`
- `node --import tsx scripts/test-chinese-set-translation-runtime-lookup.ts`
- `node --import tsx scripts/test-japanese-set-english-runtime-lookup.ts`
- `node --import tsx scripts/test-tcgdex-chinese-set-identity-display-source.ts`

Read-only original-checkout commands also passed:
`node scripts/build-owner-approved-card-name-runtime.mjs --check` and
`node scripts/sync-card-english-runtime.mjs --check`. Their check modes validate
hashes/counts and byte-identical mirrors, respectively; they do not replay the
complete approved inputs or establish semantic translation correctness.

Ad hoc named-record probes independently reproduced T-01/T-02/T-03 and the
Chinese ingestion guard/control. The audit did not write runtime regressions,
run aggregate builders, ingestion/sync, remote database scripts, a full catalogue
pipeline or an application build. Documentation-only output requires no new
TypeScript/backend/gateway code gate. JSON structure and scoped whitespace were
checked after writing the proposal/report.

## Concrete remaining actions and limits

1. Catalogue/translation owner reviews the 12-ID evidence, captures current
   canonical printing and English name/alias/provenance before-images, and
   prepares the scoped correction with concurrency locks and reversible audit/
   publication receipts. Public API timestamps and historical linked-name IDs
   cannot stand in for a fresh canonical mutation preflight.
2. Parent assigns the two client display follow-ups separately; shared search and
   Pokédex specialists verify corrected consumption without treating an English
   alias as species, printing, artwork or price proof. Trainer exclusions already
   protect Pokédex species listing but do not fix card/search titles.
3. Release owner carries reviewed code/data through its authorized publication
   lane, reconciles stored aliases and runtime hashes, then verifies actual API
   details/search and installed-device display. This audit grants no deployment,
   live data correction, source activation or licence entitlement.
4. Set names and rules/attack/flavour text need their own named source-backed
   candidates and existing provenance/rights review. No new text or set identity
   was invented, and no old incomplete set-name report was promoted to current
   coverage. Language-wide completeness, whole-catalogue semantic accuracy,
   descriptive translation coverage and phone state remain unmeasured.
