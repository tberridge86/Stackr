# Independent PDX-004 ownership eligibility review — 2026-10-11

**No actionable finding remains in the reviewed change.** PDX-004’s explicit Trainer/Energy eligibility guard is ready for local integration. It prevents known non-Pokémon cards from deriving Pokémon ownership names while preserving their inventory and ownership records.

## Baseline and scope

Reviewed against `4504a75276a0680540c9edfc59f7239e86ac55fc` in `D:/Stackr-release-recovery-20261009`, branch `codex/specialist-audits-backend-repair-20261010`.

At initial inspection, only the coordinator’s repair queue was modified. Reviewed task changes:

- `lib/pokedexCollection.ts`
- `scripts/test-pokedex-loading.ts`
- `docs/audits/20261011/pokedex-ownership-eligibility-repair.md`

Coordinator queue/release-receipt edits and the previously reviewed PDX-003 repair were separate from this implementation review.

The reviewer made no writes, commits, catalogue changes, provider requests, remote database calls, jobs or deployments. Tests used local fixtures; the route regression used a loopback server.

## Correctness and boundaries

At `lib/pokedexCollection.ts:162`, the new predicate checks `supertype`, `raw_data.supertype` and `raw_payload.supertype`. Any explicitly normalized `Trainer` or `Energy` value excludes the card from name derivation. Blank, null or contradictory outer metadata cannot mask a known raw classification.

The check runs at `lib/pokedexCollection.ts:584`, before display-name resolution and normalization. Existing approved-name handling and gender/form matching remain unchanged.

The guard covers the actual adapter contract: `stackrLegacyCardToRow` at `lib/stackrDomainAdapter.ts:1248` omits outer `supertype` but retains `raw_data`. Canonical conversion supplies classification in that raw metadata. A top-level-only repair would have missed this path.

Authentication, account filters, ownership queries, pagination and binder batching are unchanged. The repair filters derived names only; it does not remove holdings or change exact printing, set or source-contribution IDs.

## Regression evidence

The new regression at `scripts/test-pokedex-loading.ts:175` exercises 20 scenarios independently through physical inventory, owned binder cards and manual Pokédex markers: 60 actual-consumer controls.

Coverage includes:

- Explicit Trainer/Energy and adapter-shaped raw classifications.
- Blank, null, conflicting, case-varied and full-width metadata.
- Eligible Pokémon, gender titles and supplied Japanese/Chinese English names.
- Missing, null and unrecognized classification compatibility.
- Retained card/set/source identities, unchanged fixtures and no ownership writes.

The worker reported that all 36 contaminated controls failed before the guard and were excluded afterward; the other 24 compatibility controls remained valid. This reviewer independently ran the corrected regression, but did not rerun the worker’s historical red snapshot.

## Checks

Independently passed:

- `node --import tsx scripts/test-pokedex-loading.ts`
- `node scripts/test-pokedex-route-repair.mjs`
- Scoped `git diff --check`
- Eight additional controls using the actual source row-adapter function and eligibility predicate, confirming raw classification handling and retained exact identities.

TEMP/TMP used `D:/Stackr-recovery-artifacts-20261009/runtime-temp`.

The parent separately reported final frozen-snapshot `npm run typecheck`, `npm run lint` and whole-task diff check passing. Lint had zero errors and eight existing warnings. These are parent-supplied results. No backend or gateway runtime changed, and their gates were not rerun or claimed for this pass.

## Remaining limits

Missing and unrecognized classifications retain existing name-derived compatibility. That behavior does not establish verified Pokémon eligibility or complete classification coverage.

TRANSLATION-MARNIE-001 remains a separate unpublished correction proposal. This guard prevents the false-completion symptom for explicitly classified Trainer records; it does not correct their English aliases.

PDX-001 remains unresolved: the current index snapshot contains only ID/name pairs, without a verified species/form mapping contract. This pass adds no numeric cutoff, suffix inference or denominator change.

The reviewed source is locally tested and independently reviewed. Merge, deployment, installed-device behavior, live coverage and performance remain unverified.
