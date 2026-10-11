# Client naming-contract repair — 11 October 2026

Baseline: `586183926c209f7836a70baa90eabd6d75929fe4`, branch
`codex/specialist-audits-backend-repair-20261010`, maintained checkout
`D:/Stackr-release-recovery-20261009`, matching open
[PR #329](https://github.com/tberridge86/Stackr/pull/329). Local checks finished
at approximately `2026-10-11T06:25:11Z`. This specialist owns only
`lib/pokemonDisplayNames.ts`, `scripts/test-japanese-set-english-runtime-lookup.ts`,
`scripts/test-native-language-display.ts`, and this report. The parent's queue
and release-handoff edits were preserved. No commit, push or live operation was
performed by this specialist; independent review and final application gates
belong to the parent.

## Implemented result

`TRANSLATION-SET-PARITY-002`: the client now follows the reviewed backend manual
set lookup. Every supplied top-level/raw/nested language must agree with the
Japanese scope before a Japanese manual alias can be selected. Conflicting
explicit codes or known manual aliases return no inferred title. An explicit
unknown code cannot inherit `Pokemon Card 151` from an older `ja:sv2a` ID.
Directly supplied English titles retain their existing precedence. Supplementary
provider/editorial lookups also reject the existing set-identity conflicts while
retaining their exact language/code/native-name requirements and rights gates.

`TRANSLATION-TRAINER-FALLBACK-003`: legacy Japanese fallback now requires the
complete native species title plus a reviewed case-sensitive suffix: empty,
`ex`, `EX`, `GX`, `V`, `VMAX`, `VSTAR`, `BREAK`, `LV.X`, or `V-UNION`.
Unknown decorations, forms, partners and regions remain unresolved. Dex IDs and
151 collector numbers no longer supply a full English title. The now-unused
number-inference functions and their private Kanto table were removed. Existing
exact Trainer/Energy mappings, directly supplied English titles and canonical
null handling retain their ordering. No new Marnie map or form registry was added.

Native names, language, IDs, collector numbers, set, printing, edition, finish,
provenance and rules payloads are retained. Existing pending display policy
continues for unresolved aliases. Alias text establishes neither printing/artwork
equivalence nor rules translation.

## Actual source and bounded evidence

Read the maintained `AGENTS.md`, `docs/agents/README.md`, `.codex/AUDIT_PROTOCOL.md`,
backend agent definition, catalogue/backend briefs and current repair queue.
Inspected the existing backend name resolver/display helper, requested client
display/foreign/Japanese/set modules, actual `buildForeignCardPresentation`
consumer, named generated metadata and relevant fixture/check-mode builders.
The three changed code/fixture files exist and are tracked at this baseline.
`lib/japaneseCatalogue.ts` is a health reader; it is not a translation registry.

The backend is the approved-name authority in this release architecture. The
client consumes its supplied canonical names and retains canonical nulls.
The [prior translation audit](../20261010/translation.md) records the 6 October
19,315-printing completion receipt with zero amber remaining. The unchanged
backend generated metadata still records approval date `2026-10-06`, 19,315
printings and records hash
`3309ae44ba128205f00276e78a7eb05e5c00e0069eac140f653e951566b95581`.
This bounded code repair does not reopen that completed batch or claim fresh
semantic validation of every alias. The separately unpublished 12-printing
Traditional Chinese Marnie proposal and PDX-001 remain outside this assignment.
Outstanding set names/rules text remain separate and unmeasured.

The original checkout was not modified. Its named owner-name builder and mirror
sync files were confirmed present read-only; their prior `--check` success is
reported in the earlier audit, rather than claimed as a new execution here.
Those untracked original modules are not dependencies of these recovery tests.

## RED and GREEN evidence

Before changing the helper, the newly extended actual-module fixtures failed:

| Command (repository root; TMP/TEMP on D:) | Baseline result | Repaired result |
| --- | --- | --- |
| `node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/test-japanese-set-english-runtime-lookup.ts` | Exit 1; 26 of 42 contract scenarios failed; backend controls matched their expected outputs | Exit 0; 42 of 42 passed |
| `node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/test-native-language-display.ts` | Exit 1; 22 of 39 contract scenarios failed | Exit 0; 39 of 39 passed |

The set scenarios cover top-level/raw/nested languages and codes, each known
manual alias location, unknown explicit code precedence, agreeing aliases,
opaque canonical IDs, direct English precedence, exact provider/editorial
positives, conflicting supplements and native-input retention. Existing source
metadata parity, ambiguous-identity exclusions and provider kill-switch controls
also pass in the fixture.

The card scenarios cover five Dex-field shapes, collector-number paths, unknown
titles/modifiers/partners/forms, wrong-case mechanics, all ten reviewed suffixes,
existing Trainer/Energy positives and canonical-null/direct-English ordering.
They invoke the actual presentation consumer and assert pending/partial status,
native title/set/language retention, withheld unverified rules and unchanged
input printing/number/finish/edition/provenance. Four named existing backend
approved results — `ニドラン♀` → `Nidoran♀`, `ニドラン♂` → `Nidoran♂`,
`アローラライチュウ` → `Alolan Raichu`, and `デオキシス` → `Deoxys` — are passed
through the consumer with their actual `published_stackr_exact_native_name`
supplement and source IDs. They remain non-authoritative/partial. These are
existing reviewed runtime aliases, not newly researched official mappings or
evidence of a physical Deoxys form.

The first post-source card run exposed one fixture expectation issue: the
whitespace control expected the displayed native name to retain outer spaces.
Existing `getLocalCardName` already trims outer whitespace. The fixture was
corrected to expect the complete trimmed native title while deep equality still
requires the input/raw native title to remain unchanged. The actual unchanged
backend returns `Pikachu EX` for ` ピカチュウ EX `, matching the repaired client.

The first RED table reports one failure per scenario and reaches helper
assertions before presentation assertions. To independently establish consumer
RED, a bounded read-only Node/TypeScript VM probe loaded the actual helper source
with `git show 586183926c209f7836a70baa90eabd6d75929fe4:lib/pokemonDisplayNames.ts`
and the unchanged actual presentation source, using their existing generated
imports. Nine named consumer defects fail at that frozen source and pass with
the repaired modules: Trainer/Dex, unknown 151 title, unknown decoration,
decoration ending ex, partner, form, EX, LV.X and V-UNION. The consumer probe
reported **9/9 RED at baseline and 9/9 GREEN currently**, preserved native inputs,
and confirmed the backend whitespace control. No provider or catalogue request
was made by that probe.

Additional unchanged controls passed:

- `npm run test:foreign-card-presentation` — exit 0.
- `node --import tsx scripts/test-server-name-delivery.mjs` — exit 0;
  actual API-to-legacy adapter retains approved provenance, later reviewed
  canonical corrections and explicit unresolved names.
- `node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/build-japanese-set-english-identity-lookup.ts --check`
  — exit 0; 215 bound codes / 41 excluded, source SHA-256
  `02681aecbfeb9945602a6709afca0292270252c683c7d4c9a6ccadcb30c9bb5c`.
- `git diff --check -- lib/pokemonDisplayNames.ts scripts/test-japanese-set-english-runtime-lookup.ts scripts/test-native-language-display.ts`
  — exit 0. Only routine Windows line-ending notices were emitted.

## Existing generation-check limitation

`npm run test:japanese-set-english-runtime-lookup` passes its 42/42 runtime fixture,
then exits 1 in the unchanged
`scripts/build-japanese-set-english-runtime-lookup.ts --check` stage with
`Error: operating boundary binding SHA-256 mismatch.` This occurs before its
generated-artifact drift comparison. The aggregate therefore is **not passing**.
Its final identity check was run separately and passed as recorded above.

The named decision is
`catalogue/rights-reviews/tcgdex-japanese-set-english-display-green.2026-09-04.json`.
`bindings.operatingBoundaryPath` points to
`docs/stackrtcg-ip-operating-boundary.md`, with expected SHA-256
`f93aa675f76aadbe77e58bbbb0e0a81fdeb4268de8ca4d7a8190e9a6df5efb1b`.
Both the current file bytes and that exact path's frozen baseline Git blob hash
to `3ddb9d0b1fa0057db6a1830a703f86349238a675c4f52e93556e8baff8aebc0a`.
Normalizing CRLF to LF yields the same actual hash, so this is not an edit or
line-ending change introduced by this task.

The relevant unchanged generated metadata lives in
`lib/generated/tcgdexJapaneseSetEnglishNames.generated.ts` and
`backend/lib/generated/tcgdexJapaneseSetEnglishNames.generated.mjs`. Fixture
metadata identifies 256 provider candidates, MIT source pinned at
`dd4fc9460b54b91c25df750c68ca36b9946448e2`, source file SHA-256
`92639734fb2bb7167c96d720a651c66ccf618d160bd9169e04dc6ba0a77280f9`, and upstream
map SHA-256 `8420715261c1a3b2237c822294e7ea3fe8e544ad970c8c0d60612752967957f5`.
Runtime fixture parity is verified; the provider builder's drift check remains
blocked by the pre-existing binding. Rights decisions, binding expectations,
gate code, catalogue sources and generated artifacts were left untouched.
No regeneration/import flags or source activation were used.

## Frozen handoff and limitations

The parent's first integration typecheck reported `TS18048` at native fixture
line 148 because `supplement.sourceCardIds` can be absent in the backend return
type. The approved-title fixture now explicitly asserts the supplement exists,
then asserts its source printing IDs exist and are non-empty before using the
same unchanged array. Missing provenance fails the fixture; no fallback value,
non-null assertion or mutation conceals it. The parent's explicit fixture lint
also reported two `Array<T>` style warnings at set fixture lines 56–57; those
annotations now use `T[]`. The reviewed runtime helper was unchanged during
this integration correction. Both direct fixture commands above were rerun and
passed again at 42/42 and 39/39, and scoped `git diff --check` passed again.
Parent typecheck/lint repetition remains pending at this handoff.

SHA-256 of assigned code/fixtures after final narrow controls:

| File | SHA-256 |
| --- | --- |
| `lib/pokemonDisplayNames.ts` | `7ebe51ea46589c222daded4c1b27a17a824fbd181fdd6df28a46646cf8526d7a` |
| `scripts/test-japanese-set-english-runtime-lookup.ts` | `c4897641db73b1843bc158cf745ed0d441458cfcc3ebee2fa995abed8072ed8f` |
| `scripts/test-native-language-display.ts` | `c6c01b1be45c53130498eeec5f3c9564ed6d16aa5dec11eaa7884d208f17f6db` |

All shell checks used `TMP` and `TEMP` set to
`D:/Stackr-recovery-artifacts-20261009/runtime-temp`. Source/fixture changes are
implemented and locally tested; root application typecheck/lint and independent
identity review were pending when this report was written. Backend and gateway
runtime files were unchanged by this specialist. Merge, deployment, signed-app
publication and installed-device behavior are unverified. Catalogue-wide
translation coverage and live provider/API delivery were not measured. No live
catalogue, snapshot, database, schema, job, price, provider refresh or credential
operation was performed. Rollback is the parent's scoped source revert; no data
rollback is needed because no catalogue data was changed.
