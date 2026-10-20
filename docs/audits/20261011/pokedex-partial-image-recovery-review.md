# PDX-005 / PERF-003 partial results and tile recovery

Reviewed locally on 11 October 2026 in the maintained integration checkout, after species/search follow-through `94d6a9e3cce81abfd3af6511a5aee4ff4f65eb2d` and Set Detail privacy `9bdd2355799fd6e69a8ac14aa59c205481159b63`. Main `3d08536f7bd581ed1266f176c13640c0a712305f` is reconciled. No database mutation, deployment, merge to main, native/OTA publication or installed-device test occurred.

## Existing problem and smallest change

The existing Pokémon Detail loader can return useful cards with `complete: false` and a continuation error. The populated FlatList hid its error and Retry inside `ListEmptyComponent`, displayed an ownership ratio/bar using a partial denominator, and continued saying more cards were loading after the request stopped.

Keep the existing loading, pagination, cached prefix, ownership, navigation and Retry epoch. Show the loaded-card count while incomplete, put the factual warning and existing Retry action in the visible header, and restore the ownership ratio/bar only after complete results. A new retry preserves useful cards, while the existing request-generation guard rejects superseded results.

Only TCG tile artwork moves to the existing `StackrImage` component. Pass all vetted same-printing candidates, the existing detail rendition, contain fit and accessibility label. Key by canonical card identity before legacy raw identity, retaining set/number; rendition URL changes do not change the key. Hero and Pokémon sprite retain their two existing native Image paths. No dependencies, new interaction model, price changes or architecture changes were introduced.

## Actual verification and independent review

`scripts/test-pokedex-partial-results.ts` compiles and executes the complete screen with controlled hook/source fixtures. It inspects FlatList's empty component only when the actual data is empty, so a hidden retry cannot accidentally satisfy the populated-result check. This is local consumer evidence, not native rendering or physical-device proof.

- Meaningful RED against frozen `9bdd235`: the assertion fails because the old populated prefix shows `1 / 24` and loading copy instead of the partial count/status (exit1). Root and independent reviewer reproduced this failure.
- GREEN: 24 retained rows plus a continuation error show the partial status, accessible warning and visible Retry, without a misleading complete bar.
- Pressing actual Retry starts a second request and retains the prefix; a superseded callback cannot clear it. Thirty complete cards restore the established `1 / 30` ratio/bar and clear the warning/retry.
- No-error partial and known-empty complete controls remain honest. Tile candidates, detail URI, canonical-key priority/stability, contain fit and accessibility are asserted; the two hero/sprite native Images remain.
- Existing species-index, pagination/loading and 15 Pokédex account-boundary groups pass. Existing complete-module account fixture adds only the necessary `StackrImage` import facade. The shared image-recovery test passes exact rendition retries, vetted candidate advancement and corrected-prop recovery.
- The new regression is included in existing `test:pokedex-release`, which passed. Affected-file lint, application TypeScript and whitespace checks pass; independent reviewer accepted with no remaining P1/P2 finding in this scoped repair.

## Delivery and remaining acceptance

Status: implemented, locally tested and independently reviewed; commit identity is recorded in the integration receipt/queue. Merge, backend/app delivery and installed iPhone proof are pending. The owner reference is iPhone 15 Pro, owner-reported iOS26.6.1, 5G mobile data, previously installed Stackr1.0.6 build54. No measured latency, decoded whole-catalogue artwork coverage or whole Pokédex completion is claimed. Species and private-state release evidence remains in its separate reports.
