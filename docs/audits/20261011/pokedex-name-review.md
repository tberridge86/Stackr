# Independent Pokédex name repair review — 2026-10-11

PDX-003 is **partially repaired and ready for local integration within the reviewed scope**. No actionable blocker remains in the corrected snapshot. This review supports gender-name parity and two exact aliases: `raichu-alola` ↔ `Alolan Raichu`, and `deoxys-normal` ↔ bare `Deoxys`. It does not establish completion of the remaining form mappings or delivery to the running app.

## Baseline and scope

The review baseline was integration HEAD `26b413d28014230f407bcc297136b4e6e59857aa`, containing main `38db6229f0dc419db37cca009320db9c1a7bbe92`. The historical `5da3ba5` audit baseline was not used to attribute this task’s changes. Initially, the only working change was the root-owned repair queue.

Reviewed task files:

- `backend/lib/pokedexCards.js`
- `backend/lib/stackrApiV1.js`
- `lib/pokedexCollection.ts`
- `scripts/test-pokedex-route-repair.mjs`
- `scripts/test-pokedex-loading.ts`
- `docs/audits/20261011/pokedex-name-repair.md`

The review was read-only. No files, catalogues or assets were modified; no provider calls, remote operations, jobs, migrations, deployments, commits or pushes were performed.

## Reviewed behavior

The backend now resolves the reviewed route aliases into useful candidate search terms before applying the species matcher. In `backend/lib/stackrApiV1.js:1452`, the actual catalogue consumer uses the resolved lookup term; returned candidates still pass the strict species filter. The Alolan route includes Alolan Raichu and excludes ordinary Raichu.

Backend and mobile normalization agree on Nidoran gender glyphs and gender words. The client adds the reviewed title aliases to its legacy search terms and applies matching rules to ownership results. Actual-module tests cover opposite genders, possessives, Farfetch’d and Mew/Mewtwo separation.

The reviewed changes retain canonical printing IDs, language/set/collector metadata, distinct physical finishes, continuation cursors and the existing four-empty-page bound. Tests exercise the service consumer and legacy client fallback, rather than relying solely on helper assertions.

The exact aliases are deliberately mirrored between backend and mobile. This preserves the separate Railway backend package and Metro application boundaries. Parity tests exercise both implementations.

## Resolved finding

**P2 — PDX-003-REVIEW-01: default Deoxys alias accepted unsupported title prefixes.**

Locations: `backend/lib/pokedexCards.js:57` and `lib/pokedexCollection.ts:88`.

The first submitted implementation anchored the new default-title pattern only at its end. Independently reproduced fictional candidates `Cosmic Deoxys`, `Future Deoxys` and `Origin Deoxys V` therefore matched `deoxys-normal` in both actual modules. The baseline backend rejected these candidates. Because the service queries `%deoxys%`, the new exception could admit unsupported qualified names into default-route results and default-form ownership.

The corrected implementation anchors the complete permitted title with `^deoxys…$`. Both parity tests and actual-service fixtures now reject all three unsupported prefixes while retaining bare Deoxys, Deoxys V and the existing exact Normal Forme control.

**Status: resolved in the corrected snapshot.** The evidence report preserves the initial finding and its correction.

## Validation

Independently executed:

- `node scripts/test-pokedex-route-repair.mjs` — passed before and after correction.
- `node --import tsx scripts/test-pokedex-loading.ts` — passed before and after correction.
- Scoped `git diff --check` for the five implementation/test files — passed.
- An actual-module baseline/current comparison — reproduced the original prefix gap.
- A corrected actual backend/mobile probe containing 17 positive and negative controls — passed, including unsupported prefixes, default positives, nondefault and unknown requests, gender separation, Alolan separation, possessives and Mew/Mewtwo.

These checks used local fixtures and a loopback test server, with TEMP/TMP directed to the supplied D: temporary directory.

Separately, the worker reported `npm run test:pokedex-release` passing. The parent reported final corrected-snapshot `npm run typecheck`, `npm run lint` and `npm run typecheck:backend` passing, plus the whole task diff check. Lint reported zero errors and eight existing warnings. Those broad results are parent-supplied evidence, not independently rerun checks. No gateway files changed.

## Remaining limits

PDX-003 remains open for unreviewed forms. This repair introduces only the two exact aliases; meaningful nondefault or unknown qualifiers do not receive a general stripping exception. `normal-deoxys` is not newly mapped. An English card-title match does not prove a printing’s physical Deoxys form, and no physical-form inference is added.

The worker’s report attributes the aliases to bounded PokeAPI metadata and official TCG references. This reviewer inspected that evidence record but did not independently re-fetch those sources. Native-language matching still depends on explicit approved English-name evidence; this change supplies no inferred translations.

Local fixtures do not establish live catalogue completeness, production query performance, all-form coverage or device behavior. The source is not yet merged, deployed or device verified. The appropriate queue state is **PDX-003 partially repaired**, with the remaining mappings and delivery verification explicit.
