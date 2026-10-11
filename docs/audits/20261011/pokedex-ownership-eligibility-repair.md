# PDX-004 ownership eligibility repair — 11 October 2026

Source baseline: `4504a75276a0680540c9edfc59f7239e86ac55fc`, branch
`codex/specialist-audits-backend-repair-20261010`, matching PR #329 in
`D:/Stackr-release-recovery-20261009`. Final narrow checks completed before
`2026-10-11T04:19:43Z`. The coordinator owns queue, integration and release;
its existing queue edits and the previous PDX-003 repair were preserved.

## Result

`fetchOwnedPokemonNameSet` now excludes an owned card from species-name
derivation whenever supported top-level or raw metadata explicitly identifies
it as Trainer or Energy. Blank, null or contradictory outer fields cannot hide
the explicit raw classification. Matching uses the dedicated backend route's
existing NFKC, trim and lowercase policy; it adds no name/text heuristics.

The card still exists in physical, binder and manual-marker ownership. No exact
card, set, printing, variant contribution or inventory row is removed, altered
or rewritten. The change only prevents an ineligible title/English alias from
marking a Pokémon owned in the list.

Missing, null and unrecognized classifications retain existing compatibility.
They remain unknown metadata; preserving their previous name-derived behavior
does not certify a species identity or invent a classification. A later repair
can address richer identity/confidence presentation separately.

## Runtime path and reproduced failure

Inspected the current list/detail consumers, `lib/pokedexCollection.ts`,
`lib/pokedexCollectionCore.ts`, `lib/stackrDomainAdapter.ts`, versioned client,
backend species filter and existing loading/route fixtures. Guidance came from
the maintained AGENTS/protocol/backend definition, backend/catalogue briefs,
historical Pokédex audit and the named Pokédex definition in the original
checkout; no absent maintained agent module was recreated.

The list consumes `fetchOwnedPokemonNameSet` and the existing species matcher.
Its helper merges ownership through `fetchOwnedPokedexCards`, then fetches card
metadata through the existing adapter. `stackrCardToLegacyCard` retains canonical
`details.supertype` in `raw_data.supertype`; importantly,
`stackrLegacyCardToRow` omits the outer `supertype` but preserves `raw_data`.
Thus a top-level-only guard would miss the active canonical consumer path.

The display helper already supports `raw_data` and `raw_payload` metadata.
The guard checks those explicit classifications alongside any outer field,
without allowing a blank or conflicting representation to override a known
Trainer/Energy identity. It leaves display-name resolution unchanged.

Against the unmodified runtime, the new actual-source VM regression failed:
all 36 contaminated controls returned `['pikachu']`. This comprised 12
disqualifying metadata cases independently exercised through each of the three
ownership sources. With the guard, those controls return no derived names.
The other 24 controls preserve eligible or unclassified compatibility names.

| Fictional owned metadata | Before derived names | After derived names |
| --- | --- | --- |
| Trainer with supplied wrong Pikachu alias | pikachu | empty |
| Energy with supplied wrong Pikachu alias | pikachu | empty |
| Adapter-shaped raw Trainer/Energy, no outer classification | pikachu | empty |
| Blank/null outer, explicit raw Trainer/Energy | pikachu | empty |
| Conflicting outer Pokémon/raw Trainer or outer Energy/raw Pokémon | pikachu | empty |
| Explicit Pokémon with supplied English Pikachu | pikachu | pikachu |
| Missing/null/unrecognized classification | pikachu | pikachu, compatibility only |

The fictional native title `瑪俐` with a supplied `Pikachu` alias models the
historical audit's wrong-Marnie symptom; this run made no live card read.
TRANSLATION-MARNIE-001's data/source correction and publication remain a
separate, unpublished operation. This eligibility guard neither fixes nor
publishes that translation proposal.

## Exact changes and validation

- `lib/pokedexCollection.ts`: one private, constant-sized eligibility check
  over three supported metadata locations, applied before deriving owned names.
  No extra network request, ownership query, auth behavior or schema change.
- `scripts/test-pokedex-loading.ts`: actual `fetchOwnedPokemonNameSet` controls
  with independent physical, owned-binder and manual-marker fixtures. Coverage
  includes Trainer/Energy negatives; canonical raw shape; blank, null,
  conflicting and normalized metadata; valid Pokémon; native gender titles;
  supplied Japanese/Chinese English names; and missing-classification behavior.
  All 60 controls also verify exact card/set/source contributions survive,
  fixtures remain unchanged and no ownership write occurs.
- This new evidence file; historical reports remain unchanged.

Commands ran from repository root with TEMP/TMP set to
`D:/Stackr-recovery-artifacts-20261009/runtime-temp`:

- Red: `node --import tsx scripts/test-pokedex-loading.ts` exited 1 before the
  runtime guard, reporting all 36 contaminated controls across the three sources.
- Green: `npm run test:pokedex-release` passed after the final guard. Existing
  gender/form alias parity, paginated retrieval, Trainer/Energy route exclusion,
  artwork identity, ownership pagination/failure and marker protections also pass.
- Scoped `git diff --check` passed for the two changed tracked files.

Implemented and narrowly tested locally; independent review and coordinator
TypeScript/lint integration gates remain pending. No backend source changed,
so no backend typecheck is claimed by this specialist.

No commit, push, deployment, native publication, remote database script, live
read/write, provider request, job, catalogue mutation or source activation was
performed. Live API/device delivery and complete classification/species coverage
remain unverified. PDX-001 still requires a separate reviewed species/form index
mapping and contract; this repair does not alter its denominator or form scope.
