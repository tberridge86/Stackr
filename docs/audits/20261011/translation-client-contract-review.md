# Independent client naming-contract review — 2026-10-11

**No actionable defect remains in the task changes.** TRANSLATION-SET-PARITY-002 and TRANSLATION-TRAINER-FALLBACK-003 are locally tested and reviewed for integration. The Japanese lookup aggregate still fails an unchanged document-binding gate; this report does not claim that aggregate passes.

## Baseline and scope

Reviewed against `586183926c209f7836a70baa90eabd6d75929fe4` in `D:/Stackr-release-recovery-20261009`, branch `codex/specialist-audits-backend-repair-20261010`.

Initially, only the coordinator’s queue was modified. Reviewed task files:

- `lib/pokemonDisplayNames.ts`
- `scripts/test-japanese-set-english-runtime-lookup.ts`
- `scripts/test-native-language-display.ts`
- `docs/audits/20261011/translation-client-contract-repair.md`

Coordinator queue/receipt edits and previous repairs were outside this implementation review. Relevant unchanged backend resolvers, presentation consumer, builders and named decision metadata were inspected for contracts and validation boundaries.

The review was read-only. No source, generated map, rights decision, catalogue or account data was changed. No live provider calls, jobs, publication, deployment, commits or pushes were performed.

## Reviewed behavior

The client manual set lookup now matches the reviewed backend policy:

- `lib/pokemonDisplayNames.ts:367` checks every supplied language field before allowing Japanese region/prefix inference.
- `:442` detects contradictory explicit codes and known manual aliases.
- `:509` gives supplied codes precedence over older ID/provider aliases, including an unknown explicit code.
- `:586` applies conflict protection before supplementary provider/editorial lookup.

Direct English fields retain their existing precedence. Valid manual names, agreeing aliases, opaque canonical IDs and exact provider/editorial identities remain supported. Existing rights flags, kill switches, native-name binding and canonical-write restrictions are unchanged.

At `lib/pokemonDisplayNames.ts:616`, Japanese species fallback requires the complete native name followed only by an existing case-sensitive mechanic. `ex` and `EX` remain distinct; the whitelist also preserves GX, V, VMAX, VSTAR, BREAK, LV.X and V-UNION. Unknown modifiers, partners and forms remain unresolved.

Dex-ID and Pokémon Card 151 collector-number inference were removed. Canonical-null ordering, explicit English names and existing exact Trainer/Energy mappings remain intact. Actual presentation controls preserve native inputs, language, set, printing, number, finish, edition, provenance and withheld unverified rules.

## Regression and integration evidence

Independently passed:

- Actual client/backend set fixture: **42/42 controls**.
- Actual helper/presentation fixture: **39/39 controls**.
- Existing foreign-card presentation regression.
- Japanese identity builder `--check`: **215 bound codes and 41 exclusions**.
- Scoped diff check.

Both changed fixtures were independently rerun after the final fixture correction. The approved-name test now asserts that the supplement and non-empty source printing IDs exist before access. This resolves the optional-field typing issue without substituting fallback provenance. The runtime helper remained unchanged during that correction.

The worker’s evidence records baseline failures of 26/42 set scenarios and 22/39 card scenarios, plus a separate nine-case consumer comparison. Those historical red executions are worker-supplied evidence, not independently repeated by this reviewer.

The parent reported final `npm run typecheck`, expanded `npm run lint` covering the edited helper/fixtures, and whole-task diff check passing. Lint had zero errors, eight existing warnings and no introduced warnings. These are parent-supplied integration results. Backend and gateway runtime files were unchanged; their gates were not rerun or claimed.

Checks used the supplied D: temporary/cache location.

## Unrepaired pre-existing validation gate

The reviewer independently reproduced:

```text
scripts/build-japanese-set-english-runtime-lookup.ts --check
Error: operating boundary binding SHA-256 mismatch.
```

The failure occurs at `scripts/tcgdex-metadata-green-gate.ts:17`, before generated-artifact drift comparison.

The unchanged decision at `catalogue/rights-reviews/tcgdex-japanese-set-english-display-green.2026-09-04.json:39` expects:

```text
f93aa675f76aadbe77e58bbbb0e0a81fdeb4268de8ca4d7a8190e9a6df5efb1b
```

Both current bytes and the exact baseline Git blob of `docs/stackrtcg-ip-operating-boundary.md` hash to:

```text
3ddb9d0b1fa0057db6a1830a703f86349238a675c4f52e93556e8baff8aebc0a
```

The relevant builder, source and decision files have no task diff. The aggregate therefore remains failing despite passing runtime fixtures and the separately executed identity check. Reconciliation belongs to a distinct follow-up; this finding does not establish a licence or activation conclusion. No binding, gate or generated artifact was altered.

## Delivery limits

The repairs are locally implemented, tested and independently reviewed. Merge, publication, deployment and installed-device verification remain pending.

The separate 12-printing Traditional Chinese Marnie correction remains unpublished. This work adds no replacement map, new form registry or source activation. Whole-catalogue translation completeness, live API/provider behavior and device behavior were not measured.
