# PDX-003 named-route repair — 11 October 2026

Source: `D:/Stackr-release-recovery-20261009`, branch
`codex/specialist-audits-backend-repair-20261010`, integration base
`26b413d28014230f407bcc297136b4e6e59857aa`. This includes main
`38db6229f0dc419db37cca009320db9c1a7bbe92` / PR #328. The repair was dispatched
at PR #329 head `925461ebba900038c60cc5232567f910287049a9`; the historical
Pokédex audit remains pinned to its inspected source
`5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`. All historical reports remain
unchanged. The root coordinator owns the shared queue and integration.

## Result and scope

The locally tested change aligns backend retrieval and mobile ownership for
`nidoran-f`, `nidoran-m`, `raichu-alola` and `deoxys-normal`. Exact reviewed
aliases add only `raichu-alola` → `Alolan Raichu` and `deoxys-normal` → bare
`Deoxys`. No general suffix removal, inferred translation, catalogue correction
or canonical printing/variant rewrite was added.

PDX-003 is **partially repaired**: these named cases are covered, while the
broader provider-form alias population is unreviewed. This report does not
certify the other regional/default/form mappings or all 325 provider forms in
the historical index audit. Other Pokédex findings remain separate work.

## Reproduction and change

Direct backend imports and an actual-source TypeScript VM loader reproduced
these controls before edits. The same controls pass after the change:

| Route / card title | Before backend / mobile | After backend / mobile |
| --- | --- | --- |
| nidoran-f / Nidoran♀ | true / false | true / true |
| nidoran-m / Nidoran♂ | true / false | true / true |
| raichu-alola / Alolan Raichu | false / false | true / true |
| deoxys-normal / Deoxys | false / false | true / true |
| nidoran-f / Nidoran♂ | false / false | false / false |
| raichu-alola / Raichu | false / false | false / false |
| deoxys-attack / Deoxys | false / false | false / false |
| mew / Mewtwo | false / false | false / false |

The new backend fixture failed against the old implementation because the
Alolan route returned zero rather than the three expected English/Japanese/
Traditional Chinese printings. The new mobile regression failed against the
old implementation at `nidoran-f / Nidoran♀`. Both now pass through their
actual consumer paths.

- `backend/lib/pokedexCards.js`: keep gender glyphs distinct, add the two exact
  aliases and provide the candidate lookup name. The default Deoxys alias
  accepts a bare title or existing card mechanics such as `V`/`EX`; explicit
  nondefault/unknown form titles are not reduced to that bare alias.
- `backend/lib/stackrApiV1.js`: use that lookup name in the published-name
  source query, before filtering. A broad `raichu` candidate token reaches both
  title orders, followed by strict regional matching. `deoxys` reaches bare
  titles. Existing four-page empty-scan bounds and consumed-name cursors remain.
- `lib/pokedexCollection.ts`: match the backend Unicode, gender, apostrophe and
  whole-token normalization policy; apply the same exact aliases to ownership
  and bounded legacy search terms.
- `scripts/test-pokedex-route-repair.mjs`: actual service lookup controls for
  both genders, reordered/default aliases, explicit/unknown forms and Mew/
  Mewtwo. A paginated Japanese lookup preserves canonical printing, native and
  supplied English titles, language, set, collector number and distinct normal/
  reverse-holofoil variants.
- `scripts/test-pokedex-loading.ts`: actual backend/mobile parity matrix;
  actual owned-name service controls using fictional physical, binder and
  manual-marker ownership; approved Japanese/Chinese English-name bridges;
  old-API fallback consumers that retain only eligible forms and stay incomplete.

The matcher policies remain in their existing separately deployed source
trees, with parity tests. Railway uploads `backend` as a service root and Metro
excludes `backend`; a root shared import would break the existing packaging.
There are no new helpers, dependencies, schemas or packaging changes.

## Exact alias evidence

Bounded read-only primary-provider metadata observed during this repair on
11 October 2026, before the 00:25 UTC validation report:

- [PokeAPI Raichu species metadata](https://pokeapi.co/api/v2/pokemon-species/raichu/)
  identifies species 26 / `Raichu`, default variety `raichu` and nondefault
  variety `raichu-alola`. The official
  [Pokémon TCG Trainer Kit](https://www.pokemon.com/uk/pokemon-tcg/product-gallery/sun-moon-trainer-kit-lycanroc-alolan-raichu/)
  uses the title `Alolan Raichu`. The historical Stackr audit additionally
  records real `Alolan Raichu ex` printing
  `d19d10be-6592-4a4d-8351-feb119ae9989`; this repair did not re-fetch that live
  Stackr printing or claim its current production state.
- [PokeAPI Deoxys species metadata](https://pokeapi.co/api/v2/pokemon-species/deoxys/)
  identifies species 386 / `Deoxys`, with `deoxys-normal` marked as its default
  variety; `deoxys-attack`, `deoxys-defense` and `deoxys-speed` are nondefault.
  The official
  [Fusion Strike card checklist](https://assets.pokemon.com/assets/cms2/pdf/trading-card-game/checklist/swsh8_web_cardlist_en.pdf)
  lists bare `Deoxys` at collector number 120. The official
  [Legends Awakened checklist](https://assets.pokemon.com/assets/cms/pdf/tcg/checklists/DP6_Cardlist_Lo.pdf)
  also retains explicit `Deoxys Attack Forme` titles, motivating negative form
  controls instead of general qualifier stripping.

These facts support named-route/title compatibility only. A bare `Deoxys`
title does not prove the physical card depicts Normal Forme. No artwork or
absent metadata was used to infer that form. Native Japanese/Chinese strings
in regression fixtures use explicit published English-name bridges; this
repair adds no new native-to-English translations.

## Independent review correction

The first locally passing diff had a default-Deoxys alias expression anchored
only at its end. Independent review found that it wrongly accepted unverified
leading qualifiers: `Cosmic Deoxys`, `Future Deoxys` and `Origin Deoxys V` were
false on the dispatched baseline but true in that first diff. Its original
regressions did not cover these prefixes.

The reopened regression controls reproduced this defect: the actual service
returned all three fictional prefixed printings for `deoxys-normal`, and the
mobile control failed at `Cosmic Deoxys`. Both alias expressions now require the
complete title from start to end: bare `Deoxys` followed only by explicitly
allowed mechanics. No owner-prefix alias was introduced. All three prefix
negatives run through backend/mobile parity and actual source-query/service
fixtures; bare `Deoxys`, `Deoxys V`, exact `Deoxys Normal Forme`, gender and
Alolan controls remain covered.

## Checks and delivery state

Commands ran from the repository root with TEMP/TMP set to
`D:/Stackr-recovery-artifacts-20261009/runtime-temp`:

- Red: `node scripts/test-pokedex-route-repair.mjs` and
  `node --import tsx scripts/test-pokedex-loading.ts` exited 1 on the failures
  above before runtime edits.
- Green: `npm run test:pokedex-release` passed, including existing pagination,
  bounded empty scan, high-variant printing preservation, Trainer/Energy
  exclusion, artwork identity, ownership pagination/failure and marker controls.
- Review correction: both individual narrow regressions failed against the
  first diff on the prefix controls above; `npm run test:pokedex-release`
  passed after the complete-title anchor correction.
- Scoped `git diff --check` passed. Application typecheck/lint and backend
  typecheck are the root coordinator's integration gates, not yet claimed here.

Implemented and narrowly tested locally; independent identity review pending.
No commit, push, merge, deployment, native publication, live catalogue or price
write, schema change, remote database script or background job was performed by
this repair specialist. Live API behavior, installed-device behavior, whole-form
coverage and performance remain unverified.
