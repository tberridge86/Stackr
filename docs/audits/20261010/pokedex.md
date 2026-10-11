# Independent Pokédex audit — 10 October 2026

Source revision: `5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`, branch
`codex/specialist-audits-backend-repair-20261010`, maintained checkout
`D:/Stackr-release-recovery-20261009`. This specialist owns only this report.
Other agents' existing runtime changes were preserved; no runtime, catalogue,
account, database, queue, deployment, commit or push was changed.

## Result and evidence scope

The dedicated printing route and ownership service have useful, passing bounded
regression coverage. Five remaining consumer/identity findings are reproducible:
provider forms contribute to a species completion denominator; ownership can
remain associated with a previous account or an unsuccessful read; form and
gender names differ across retrieval and ownership; an owned Trainer with a
wrong approved alias can mark a species owned; and populated partial card results
hide their continuation failure and retry control.

Read `AGENTS.md`, `.codex/AUDIT_PROTOCOL.md`, `docs/agents/README.md`, the
performance/backend briefs and assignment plan. Inspected the tracked
`app/(tabs)/pokedex.tsx`, `app/pokemon/[id].tsx`, `lib/pokedexCollection.ts`,
`lib/pokedexCollectionCore.ts`, `lib/pokemonDisplayNames.ts`, `lib/foreignPokemon.ts`,
`lib/stackrDomainAdapter.ts`, `lib/ownership.ts`, auth context/layout, the two
manual-marker migrations, versioned client/router/service, published index and
existing narrow fixtures. The named index file was summarized locally; no full
public Pokémon/card catalogue was scanned. Supabase and React Native skill
guidance informed read-only account/list checks.

Local service fixtures and inline VM controls execute actual source with fictional
ownership rows. Public API checks contain no account reads or credentials. Source
claims are separate from live responses. Parent supplied the historical backend
health identity `9fae8fac7e8a`, deployment
`7070a53d-6b09-41e7-9e06-ee3fcb7b8212`, production
`oakdbbzdqwurpjnoqhmu`; this specialist did not re-attest that deployment.
The public gateway can serve cached responses. Installed-phone rendering,
account switching, latency, cache age, image decoding and OTA identity are
unmeasured. Signed build 54 predates this maintained-source work.

## Verified service and UI contracts

- `backend/routes/v1.js:365` exposes `/v1/pokemon`; line 369 exposes
  `/v1/pokemon/:name/cards`. `lib/stackrApiV1.ts:975` encodes the entire name.
  The detail screen passes the list's provider route ID plus its name; a known
  name starts card facts while optional PokeAPI metadata is pending.
- `backend/lib/stackrApiV1.js:1420` reads published native/English/translated/alias
  names, applies whole-token matching, reads only that consumed source page's
  printing IDs, excludes explicit Trainer/Energy rows, and filters canonical
  card language. A source scan is capped at four name pages per request. Cursor
  advancement follows the consumed names even when every candidate is rejected.
  An empty response with a cursor remains incomplete. Matched printing variants
  use stable 500-row pages so a high-variant neighbour cannot hide another
  printing. The four-page cap bounds name pages, not an absolute number of
  variant reads.
- `lib/pokedexCollection.ts:326` follows every opaque printing cursor, publishes
  the initial 24-card page promptly, then uses continuation limits of 120 and
  deduplicates canonical printing IDs. A failed later page preserves earlier
  cards with `complete: false`; hard-capped legacy search fallback also stays
  incomplete. Set labels/prices are optional and published after useful facts.
- Initial artwork hydration uses at most 16 printings; visible batches at lines
  118/456 of the detail screen are at most 100. One artwork batch uses at most
  three 100-asset manifest pages, printing-scoped approved assets and a short
  retryable negative cache. Native `Image` recovery remains the existing
  [PERF-003 handoff](performance.md); no duplicate repair is claimed here.
- Ownership merges physical `user_card_variants`, owned rows in the current
  user's binders, and `user_pokedex_cards` manual markers by `set_id:card_id`.
  Reads use stable ID pages of 500 and binder filters of at most 100 IDs.
  A failed later ownership page rejects the result rather than returning a
  complete prefix. No quantities are added together: detail ownership counts
  unique printings, while list ownership is currently name-derived.
- Marker controls write only `user_pokedex_cards`. Physical variants or owned
  binder rows block removal before any write and direct the user to collection
  controls. Deletion is scoped to current user, card and set, with explicit
  `is(set_id, null)` for null sets. An unresolved set cannot create a marker.
  Migration source enables RLS and user-ID policies; live RLS was not queried.
- The actual list cache key is `stackr:pokedex:pokemon-list:v2:published`, not the
  historical v1 key mentioned in the brief. No key was changed. Complete memory
  or disk data displays before background refresh; disk acceptance requires
  1,350 unique valid entries. Partial/truncated/mixed-version lists are not
  persisted, and superseded list requests cannot publish or persist a final
  result. FlatList uses stable provider-ID keys and bounded rendering batches.

## PDX-001 — High: provider forms are counted as National Dex species

Evidence: `backend/lib/pokedexIndex.js` publishes the named
`backend/data/pokedex-index.json` snapshot of `/api/v2/pokemon`, not a species
index. Snapshot version is `pokeapi-2026-10-09-b622b084c112`, retrieved
`2026-10-09T08:37:03.454Z`, `sourceCount: 1351`, `entryLimit: 1350`. Its 1,350
entries contain 325 IDs above 1025. Named controls include species/provider 25
Pikachu, 122 Mr. Mime, default entry 386 `deoxys-normal`, and form 10100
`raichu-alola`. `app/(tabs)/pokedex.tsx:409` uses all entries as the completion
denominator; lines 464/485 present provider IDs as Pokémon numbers. Region chips
use National Dex numeric intervals, so form 10100 is excluded from every region
chip even though it appears under All.

Four bounded public PokeAPI reads at 22:28:51 UTC independently verified:
`pokemon?limit=1` reports 1,351 entries; `pokemon-species?limit=1` reports 1,025
species; `pokemon/raichu-alola` has ID 10100 but points to species 26; and
`pokemon-species/raichu` includes that alternate variety. The public Stackr
index at 22:29:37 UTC reports 1,350 with the same snapshot version, request
`9f2b398c-a1dd-4b05-924f-97d0d010b5ae`.
The [PokeAPI resource contract](https://pokeapi.co/docs/v2#resource-listspagination-section)
defines a resource count; its Pokémon and species resources are distinct.

Impact: the UI's species-style “Masterset progress” and numbers represent a
capped provider-entry catalogue including forms. Owning all 1,025 species does
not establish 1,350-species completion. This is a measured current mismatch,
not a permanent assumption about the number of species.

Smallest repair: publish reviewed index entries with distinct stable species,
provider Pokémon/form and route IDs. Compute species completion once per
species; keep meaningful regional/alternate forms available as explicit child
entries or a separate form view with correct labels and region semantics.
Preserve cache-first paging and version the cache only after verifying its new
schema. Owner: Pokédex implementation coordinated with backend/performance.
Verify Raichu species 26/form 10100, Deoxys default/form routes and a complete
species fixture without counting a form twice.

## PDX-002 — High: unsuccessful/account-changing ownership reads retain false state

Evidence: list focus callback at `app/(tabs)/pokedex.tsx:353` has an `active`
focus flag but no auth-context dependency, requested/current user comparison,
ownership reset or error state. Its catch only logs. Detail loader at
`app/pokemon/[id].tsx:127` correctly checks generation and a final current-user
comparison, but retains prior `ownedKeys`; neither screen subscribes its
ownership state to auth changes. The root AuthProvider updates user state
without assigning these screens an account-specific remount key.

Reproduction: an inline TypeScript-AST/VM harness extracted and executed the
actual list `useFocusEffect` callback. Existing keys stayed visible while the
next refresh was pending; a late result published without an account comparison;
then a rejected next-focus read left the prior result unchanged. A separate
harness executed the actual detail `loadOwnership` with a new fixture account,
existing old-owner keys and a rejecting ownership read; the old keys remained.
No real inventory was used. On a first detail read failure, the initial empty
Set instead presents zero owned/all missing, although ownership is unknown.

Impact: source permits another account's ownership to remain visible during an
account change or failed refresh. Detail's late-result guard prevents one stale
commit but does not give already displayed data an account boundary. A failure
also cannot honestly establish zero ownership or absence.

Smallest repair: use the existing auth context plus account-load generation,
store the account identity with successful ownership, invalidate on account
change and display pending/error state until that account has a successful
read. Preserve a previous successful snapshot only for the same account and
label its failed refresh. Disable ownership-derived completion/filter/mutation
decisions while the account's ownership is unknown. Owner: Pokédex with account
boundary review. Verify A→B during an in-flight request, failed B request,
sign-out, same-account offline fallback and focus refresh after deletion/move.

## PDX-003 — High: form and gender controls differ between retrieval and ownership

The backend normalizer in `backend/lib/pokedexCards.js` preserves gender glyphs.
The client normalizer at `lib/pokedexCollection.ts:42` removes them as
non-ASCII punctuation. The backend and client also require the provider form
name's exact token order rather than resolving a verified card-title alias.

An inline VM loader used the actual client module, and direct imports used the
actual backend matcher. Controls produced:

| Route name / card title | Backend match | Client ownership match |
| --- | --- | --- |
| pikachu / Pikachu ex | true | true |
| mr-mime / Mr. Mime | true | true |
| raichu-alola / Alolan Raichu | false | false |
| deoxys-normal / Deoxys | false | false |
| nidoran-f / Nidoran♀ | true | false |
| nidoran-m / Nidoran♂ | true | false |
| nidoran-f / Nidoran♂ | false | false |
| mew / Mewtwo | false | false |

Bounded live reads at 22:29:04 UTC returned an empty, still-incomplete first
slice for `/pokemon/raichu-alola/cards` (request
`d4c96d5c-8af2-4270-8a73-04d43b6ac762`), while encoded `Alolan Raichu` returned
real `Alolan Raichu ex`, printing `d19d10be-6592-4a4d-8351-feb119ae9989`,
request `4e702e84-8c0c-4d15-8584-2ef38b514b86`. That first empty response is
not claimed as a complete live no-match. Source/fixture controls establish the
alias mismatch. Nidoran-f returned real `Nidoran♀` printing
`c3fa37fa-3503-49f8-8634-c2841b24e64d`, request
`2dd4c7b6-b830-4b55-b757-d83d78d986bf`; feeding that native/English title into
the actual client matcher still fails.

Impact: real Nidoran ownership cannot light the gendered list entry; meaningful
form/default entries can request an incompatible name and omit legitimate
card titles. Smallest repair: resolve reviewed species/form/card aliases by
stable identity, share normalization policy with gender preserved, and map
default provider entries back to species identity. Do not infer all names from
substring or remove form identity. Owner: Pokédex, coordinated with translation
and backend. Verify both Nidoran genders, Alolan/base Raichu, Deoxys, Mr. Mime,
Mew/Mewtwo and approved Japanese/Chinese aliases. An indexed identity mapping
also avoids the current all-entries × all-owned-names loop at list lines 386–407;
its latency remains unmeasured.

## PDX-004 — High: Trainer exclusion is absent from species ownership mapping

The dedicated route excludes explicit Trainer/Energy rows, but
`fetchOwnedPokemonNameSet` at `lib/pokedexCollection.ts:539` only takes the
preferred/English display title from owned card rows; it never checks the
already available supertype. `stackrCardToLegacyCard` retains supertype in
both the mapped row and raw data.

The exact public Trainer printing `4a459e00-0853-43a7-b0a6-e9d0f56c42f6`
was read at 22:29:37 UTC, request `c032660a-2828-448e-877a-e6a6745a64ce`:
language `zh-tw`, native `瑪俐`, English `Pikachu`, supertype `Trainer`, SC1b
number 171. This corroborates [translation T-01](translation.md); it does not
re-audit that report's other eleven IDs.

Reproduction: an inline VM harness ran the actual ownership service with one
fictional physical row referencing that exact printing, no binders/manual
markers, its observed mapped card fields and the real display/core helpers.
`fetchOwnedPokemonNameSet()` returned `['pikachu']`, and the actual list matcher
marked Pikachu owned. No private ownership was queried.

Smallest repair: exclude known Trainer/Energy rows from Pokémon ownership name
mapping as well as retrieval, then resolve ownership using reviewed species
identity. The 12-ID semantic alias correction remains translation/backend's
separate provenance-preserving data task; exclusion only prevents this false
completion symptom. Verify an owned Marnie Trainer and named Energy negative
control do not mark Pikachu owned, while a real Pikachu in each ownership source
does. Owner: Pokédex; metadata handoff T-01 remains open.

## PDX-005 — Medium: populated partial results hide continuation failure and retry

`scripts/test-pokedex-loading.ts` demonstrates the actual service retains 24
cards with `complete: false` and an error when a later page fails. Detail
`applyCards` preserves that error, but `app/pokemon/[id].tsx:510` renders the
error and Retry only inside `ListEmptyComponent`. A populated FlatList does not
render it. Lines 493–499 continue displaying an ordinary `owned / cards.length`
progress bar and “Loading more matching cards…” even after loading stopped.

Impact: the user has useful partial facts but no visible failure/retry and a
denominator based on an incomplete prefix; owning the prefix can fill the bar.
Smallest repair: expose partial/error/loading status and Retry in the header or
footer independent of emptiness; label the loaded count as partial and suppress
complete-total progress until pagination completes. Owner: Pokédex/performance
coordinated screen repair. Verify populated second-page failure, retry success,
legacy incomplete fallback and truly empty complete results. Source and service
fixtures establish this path; no screenshot/phone-render claim was made.

## Bounded public controls and links

Gateway: `https://api.stackrtcg.com`, seven initial named route reads and five
bounded follow-up/index/detail reads, concurrency at most two. No route was
fully exhausted to measure a species total.

| Control | Observed result |
| --- | --- |
| Pikachu, en, limit 1, 22:29:03 | Pikachu-EX `f77496f3-8862-4aa4-9ad6-aae176a93fd6`, XY174; cursor retained; request `307f8ee5-35df-4a44-85fa-58d343a54312`. |
| Encoded `Mr.%20Mime`, en, limit 1 | Sabrina's Mr. Mime `61d34672-1efc-451c-a905-bfbf771e01a5`, 59, two variants; request `74a90185-b68c-4b6d-950e-7884326a09d9`. |
| Exact Mr. Mime card detail | Same printing, language en, set `f43aed17-4a1d-49b7-9f98-fbf3f0e44c8d`, number 59 and two variants; request `f90f0f52-a8f3-4e7c-a900-0ba9adf57eb3`. Detail UI's `/card/[id]` link at line 322 retains canonical printing ID and set ID. |
| Pikachu, ja, first limit 1 | Empty with cursor, request `94b2b2ff-bce1-451e-b820-b37dc67485e0`; correctly not treated as final empty. |
| Same ja cursor, limit 24 | Two ja Pokémon printings, `df91f6b7-562e-41f7-82d4-928ed8b3b1fa` and `a6da2147-423c-5a76-b9fd-db61b1c27850`, further cursor retained; request `992b46a3-b562-4fe8-b83e-9bd1ab4bd7e0`. |
| Pikachu, zh-tw, limit 1 | Real `皮卡丘` printing `5e9929bb-ff79-46dc-beb0-6a0e02af63da`, language label Traditional Chinese, number 014; request `cd8c2fa5-d154-408f-ae57-3d131e60bf95`. |

The detail UI currently displays all languages and offers ownership filters;
there is no claimed language-picker behavior. Fixture/API language filters
preserve distinct canonical printings. Native/approved English fields are
retained, and neither Trainer nor Energy can become a species result through
the dedicated route solely on the basis of a misleading alias.

## Checks and remaining validation

Passed from repository root with TEMP/TMP on D:, 22:27–22:29 UTC:

- `npm run test:pokedex-release`: native English/translated fixture lookup,
  251 printing pagination, high-variant completion, Trainer/Energy rejection,
  four-source-page empty bound, consumed-page cursor continuation, language
  filtering, gender lookup, versioned route envelope, artwork batch identity;
  service ownership reads 3,003 fixture contributions over complete pages,
  rejects later-page failure, guards physical/binder removal before writes,
  scopes manual deletion including null sets, and publishes facts before artwork.
- `npm run test:pokemon-language-flags`: shared flags, English binder labels and
  Discover set-language controls.
- `node --import tsx scripts/test-issue304-cold-retrieval.ts`: progressive facts,
  cache-first list behavior, first 151 entries, truncated/mixed-version rejection,
  same-list offline preservation, retry and superseded-response guards.
- Inline actual-source VM controls: matcher table, list failed-focus retention,
  detail failed-new-account retention and fictional owned-Trainer false completion.

The suggested `test:catalogue-reliability` and `test:retrieval-consolidation`
scripts are absent in this checkout; the existing dedicated release and cold
retrieval checks were used. Typecheck/lint were not rerun for this report-only
audit; runtime owners must run them for eventual TypeScript repairs. Broader
language coverage, complete species printing totals, production inventory/RLS,
UI automation, native rendering and latency remain unmeasured. The parent owns
integration, shared-file assignment, independent review and repair-queue entries.
