# PDX-002 independent account-boundary review

No remaining actionable finding was found in the final frozen repair. All three P2 findings raised during review are resolved. The scoped change is ready for source integration; release and device verification remain outstanding.

Reviewed baseline: `80c8eab31619e30fa6bf03b7eb48015bfcbf5338`, branch `codex/specialist-audits-backend-repair-20261010`, in `D:/Stackr-release-recovery-20261009`.

The review covered both Pokédex screens, `lib/pokedexCollection.ts`, new `lib/pokedexOwnershipState.ts`, new `scripts/test-pokedex-account-boundary.ts`, the specialist’s repair evidence and the parent’s one-line `package.json` release-test wiring. Existing `scripts/test-pokedex-loading.ts` was unchanged. Relevant account-generation, authentication, ownership-core and query contracts were traced without expanding into catalogue audits. Queue and release-receipt changes belong to the parent.

Final snapshot hashes matched the frozen handoff:

- Detail screen: `655BE072CD346CA003AA24C489C0BE22E1180D03AD52794C19915AEB0DFD8DC8`
- Shared hook: `99AD4FE9DE0E8029B6BE74CEF7C7E99F935444266BBF93832871E808D9D7A094`
- Account test: `8B69AA528F11A061DE5556597AC60B5DA2A12B8A6574D7209B17EA0D35ED3B2D`

Resolved review findings:

1. **P2 — PDX-002-REVIEW-01: invalid optimism displayed as saved ownership.** A verified-empty account A with a pending add could still display one owned printing after auth error, loading/ready, A→B→A or blur invalidated its mutation. Pending overlays now carry and check the initiating account/auth/focus/generation predicate during render at [pokedexOwnershipState.ts:92](D:/Stackr-release-recovery-20261009/lib/pokedexOwnershipState.ts:92). Actual-consumer controls verify that invalidated optimism disappears before reset effects run.

2. **P2 — PDX-002-REVIEW-02: duplicate invocation before rerender.** Calling the same tile handler twice could initiate two writes and supersede the first valid intent. The synchronous ref guard at [pokedexOwnershipState.ts:105](D:/Stackr-release-recovery-20261009/lib/pokedexOwnershipState.ts:105) now admits one operation. Only its matching token releases the lock. Regression controls also prove an old A completion cannot release a newer B operation’s lock.

3. **P2 — PDX-002-REVIEW-03: old-account error presented after the promise handoff.** The hook checked validity before rejecting, but the screen’s later catch could alert account B with A’s error. Independently instrumented consumer execution reproduced this window. The hook now returns a failure carrying the initiating validity predicate; the screen checks it immediately before synchronous logging and alerting at [pokemon detail:237](D:/Stackr-release-recovery-20261009/app/pokemon/[id].tsx:237). Current-account alerts remain functional; B, A→B→A, newer-generation, blur and auth-error cases suppress stale presentation.

The initial 11 passing groups missed the first two findings; the subsequent 13 passing groups missed the third. Those results are retained as historical evidence, not presented as complete boundary coverage.

The final implementation masks wrong-account snapshots during render, distinguishes unavailable ownership from verified-empty ownership and retains successful same-account snapshots with explicit saved/error/retry messaging. Catalogue browsing remains available while ownership is unknown. Mutation completion, rollback, reload, optimism, locking and error presentation retain the initiating account and generation.

Service controls reject expected-account or invalid-intent mismatches before writes. The diff preserves captured-user query scope, pagination, exact card/set identity, null-set deletion, source quantities and physical/binder removal guards. Writes remain confined to manual `user_pokedex_cards` markers.

Independently executed checks:

- Baseline read-only consumer harness, pinned in memory to the review baseline: **11 observations—8 defective observations and 3 positive controls**.
- Final `npm run test:pokedex-release`: **PASS**, including unchanged route/loading checks and **14/14** actual-consumer/service regression groups.
- `node --import tsx scripts/test-issue304-cold-retrieval.ts`: **PASS**.
- Original alert-handoff probe rerun against the direct actual hook, without the new fixture wrapper: formerly failing timings suppressed B’s alert; current-A positives still alerted. No B alert occurred in the tested timings.
- `git diff --check`: **PASS**.

These checks used fictional accounts, deterministic hook scheduling and mocked query/write results. The route fixture used a temporary loopback server. No live account, catalogue, provider or database operation occurred. The 14 final groups and 11 baseline observations have different denominators; no coverage percentage is claimed.

Parent-reported final third-snapshot integration gates:

- Application typecheck: **PASS**, exit 0.
- Expanded lint: **PASS**, zero errors, nine existing warnings and no introduced warnings. The parent verified the additional `canonicalError` warning against the baseline.
- Whole-task diff check: **PASS**.
- Earlier main-integration backend typecheck and narrow fast-set controls: **PASS**, including 3/3 fast-set controls. Backend and gateway runtime were unchanged by PDX-002.

Native rendering, installed-device account transitions, real offline timing and live RLS behavior remain unverified. Local guards cannot revoke a database request already dispatched; server authorization remains authoritative.

PDX-001 mappings, PDX-005 pagination/images, the existing translation document-binding failure and the unpublished Marnie correction proposal remain separate unresolved work. This repair changes none of those inputs or gates.

The reviewed repair is local source work. It was not merged, deployed, published or device-verified at review completion. The earlier pushed head’s eight successful checks plus one backend dependency-install network failure do not establish passing CI for this repair; later secret/audit steps in that failed job were skipped. No new secret finding is asserted.

This review made no source, artifact or catalogue changes.
