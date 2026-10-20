# PERF-002: search reliability reuse reconciliation

Prepared as a read-only comparison on 11 October 2026. The comparison itself did not change either checkout. Its recommended bounded screen repair was subsequently implemented in an isolated worktree and commit, recorded below; it has not been merged, deployed, or installed on an iPhone.

## User problem, outcome and journey

Someone searching Stackr should be able to browse the useful card or set matches
that are already available. Before this repair, the screen could show an early
partial result, but one primary source that never returned kept the final search
state pending indefinitely. That leaves a person unsure whether the results are
finished, incomplete, or still working.

The repaired journey is: type a query, receive the existing fast first-paint
results, then have every primary source settle as success, failure, or an honest
timeout. A slow or failed sibling does not remove useful results. Replacing the
query, language, category, or signed-in account prevents old callbacks from
painting the new search. Existing retry behaviour remains the action to rerun a
search; this repair deliberately adds no new visual control or persistence.

## Current implementation and bounded acceptance

The smallest safe repair is now isolated in
`D:/Stackr-recovery-artifacts-20261009/runtime-temp/worktrees/perf002-search-settlement`,
runtime repair `9a62df9c48b13679e70d6c08ea8dfa8fd322b639`, current tested branch head `db48cbc0ff216a0944f7813341decda3ed5b3349` (`fix(search): bound stalled source settlement`):

- `app/(tabs)/search.tsx` wraps each final primary-source promise in
  `settleSearchSource`. It reports an explicit rejected settlement after
  4,000 ms rather than claiming a physical network cancellation.
- Four seconds follows the existing gateway `BACKEND_TIMEOUT_MS` default in
  `gateway/src/proxy.js`; it is a UI settlement deadline, not a new service
  timeout policy.
- The existing request generation and `searchIdentityEpoch` remain the
  authority for stale-query and account safety.
- `scripts/test-search-settlement.ts` proves a fast result publishes, a source
  that never settles becomes an explicit rejection within an injected deadline,
  and a source error remains an error. The existing progressive and recovery
  tests prove first-paint, replacement-query and useful-result retention paths.

The isolated commit passed `node --import tsx scripts/test-search-settlement.ts`,
`node scripts/test-progressive-card-search.mjs`,
`node --import tsx scripts/test-search-recovery.ts`, `npm run typecheck`, and
`npm run lint` (zero errors; eight existing warnings outside the change).

The follow-up isolated regression test
`scripts/test-search-settlement-runtime.ts` executes the actual `runSearch`
coordinator body and `settleSearchSource` implementation in a harness with
minimal mocked data boundaries and deterministic timers. It proves a stalled
set source clears coordinator loading, retains early cards and prior same-query
set content, records the set-group error, and cannot repaint after simulated
request invalidation or a late transport success. Its boundary cases increment
the real request-generation guard directly to model replacement query, category,
language, account and unmount invalidation. It does not prove that every React
effect fires that guard before timeout, render a React Native screen, exercise a
real transport abort, or establish iPhone accessibility/device behaviour.

This is **not full PERF-002 closure**. The final coordinator still waits for
every bounded source before it publishes the non-card final groups; it does not
independently publish each late group as soon as that group settles. It also
uses logical stale-result guards rather than universal physical cancellation.
The commit closes the permanent-final-loading failure, while independent
group-settlement UX and transport-specific cancellation remain separate scope.

## Accessibility, identity, privacy and persistence

No visual hierarchy, labels, account data, analytics, or storage schema changed.
The existing screen presents results and error recovery; source-level timeout
text uses the normal error path. The repair only retains in-memory results for
the current search identity and does not persist partial or account-derived
data. Its route/account guard is source-level evidence; a rendered screen-reader
review and iPhone accessibility check remain outstanding.

## Conclusion

Do **not** copy the original checkout's `searchReliability.ts` or `optionalSearchEnrichment.ts` wholesale. They are untracked, unreviewed work that depends on a substantially divergent Search screen and card/adapter changes. The maintained checkout already has equivalents for the useful parts:

- `app/(tabs)/search.tsx` has a local `settleWithin` first-paint mechanism, per-query `requestRef` guards, source-level `Promise.allSettled`, same-query result retention, and a `searchIdentityEpoch` in its result key.
- `lib/optionalCatalogueEnrichment.ts` provides an `AbortController`-backed, parent-aware deadline for optional catalogue enrichment. `lib/cardSearch.ts` and `lib/stackrDomainAdapter.ts` already use it.

The confirmed remaining PERF-002 fault is narrower: after the first partial render, the screen still waits on an unbounded `Promise.allSettled` for every primary source before it declares the search settled. A source that never resolves can keep final loading/pending state open. `requestRef` prevents stale UI writes, but it does not cancel the underlying primary requests.

## Provenance and compatibility

The work in `D:/Stackr-1` is not a branch that can safely be cherry-picked:

| Original path | Git state | Compatibility finding |
| --- | --- | --- |
| `app/(tabs)/search.tsx` | modified, uncommitted; 804 additions/569 deletions against its old tracked base | Different screen lifecycle and result state from maintained source |
| `app/search.tsx` | modified, uncommitted | Adds route-param forwarding through the new helper; independent of PERF-002 |
| `lib/cardSearch.ts` | modified, uncommitted; 105 additions/863 deletions | Uses an `onEnriched` API absent from maintained source (`onCanonicalResults`) |
| `lib/stackrDomainAdapter.ts` | modified, uncommitted; 787 additions/298 deletions | Overlaps maintained optional-enrichment architecture |
| `lib/searchReliability.ts` | untracked | Duplicates local first-paint/error helper concepts |
| `lib/optionalSearchEnrichment.ts` | untracked | Duplicates/enlarges optional-enrichment control flow already covered by maintained `optionalCatalogueEnrichment.ts` |

The original checkout's last tracked history for these paths is the July baseline `42ee5fcc13cd093b1fb4fec617b84b336ef873ad`; its helpers have no commit provenance. The maintained checkout is on the current integration lineage; it already imports `readOptionalCatalogueEnrichment` into both the card search and Stackr adapter paths. A full import would create two deadline/pooling abstractions with different cancellation semantics.

## What can safely be reused as ideas

`searchReliability.ts` is useful as a behavioural reference only:

- Its source-group model supports independent publication and source-specific errors.
- Its `streamSearchSources` design publishes a snapshot when each request settles.
- Its deadline wrapper does **not** abort transport; it merely rejects the wrapper promise.

`optionalSearchEnrichment.ts` is also a reference only:

- It limits optional reads to two concurrent operations and returns a snapshot after a budget expires.
- It deliberately holds slots for a transport that ignores timeout, preventing a runaway request trail.

The maintained helper is preferable for current catalogue enrichment because it propagates a parent abort and aborts a child controller. It does not itself solve the Search screen's primary-source completion policy.

## Smallest safe implementation plan

Give one owner exclusive control of these paths:

1. `app/(tabs)/search.tsx`
2. A new **small, screen-specific** helper only if the existing local `settleWithin` cannot be extended cleanly, for example `lib/searchRequestSettlement.ts`
3. `scripts/test-progressive-card-search.mjs` and one focused new search-settlement test

Keep `lib/optionalCatalogueEnrichment.ts`, `lib/cardSearch.ts` and `lib/stackrDomainAdapter.ts` out of the first patch unless a test proves a direct missing contract. The current problem can be repaired at the screen coordinator without another enrichment rewrite.

Implementation requirements:

- Preserve the current immediate canonical-card callback and cached-result behaviour.
- Publish each primary group independently after the first-paint budget, recording `pending`, fulfilled, and rejected states separately.
- Give every primary group a clear UI deadline/error state so a transport that never settles cannot keep the search permanently loading.
- Preserve the exact `requestRef` generation check at every asynchronous state write. Include the existing `searchIdentityEpoch`/account boundary in the generation that makes a request current.
- Retain prior same-query groups only after a failed or pending refresh; never carry them into a different query/account/category/language scope.
- Let optional enrichment remain optional. Late artwork/listing/ownership enrichment may update the current request only and must not overwrite a newer query/account result.

## Transport limitation

The maintained adapter supports `AbortSignal` on several catalogue reads, and optional catalogue enrichment aborts child work. The Search screen does not currently construct or pass a controller through its primary requests. Some primary reads are Supabase query builders and may not expose a compatible cancellation path through the current wrappers. Therefore the first patch must not claim it cancels all network traffic.

Use logical cancellation (`requestRef`/generation guards) for every path. Add physical cancellation only where the called API has an explicit tested `AbortSignal` contract, and test that an abort cannot turn an older request into the current screen state.

## Test reuse

| Original test | Reuse decision |
| --- | --- |
| `scripts/test-search-reliability.ts` | Reuse its independent-settlement and honest empty/error cases as new focused tests; it currently only validates the untracked helper, not the mounted screen. |
| `scripts/test-search-enrichment-budget.ts` | Do not port as-is. Its mocks expect the untracked optional pool and older adapter contracts. Mine its stalled-artwork and bounded-work scenarios against maintained `optionalCatalogueEnrichment.ts` only if the first patch touches it. |
| `scripts/test-instant-card-search.ts` | Do not port as-is: expects `onEnriched`, while maintained code uses `onCanonicalResults`. Adapt only its stale-refresh and failed-query retry assertions to the existing API. |
| `scripts/test-market-search-card-reference-hydration.ts` | Out of scope for PERF-002; it covers controlled market-card reference hydration. |
| Maintained `scripts/test-progressive-card-search.mjs` | Extend. It already exercises first/final phases, stale query rejection, current canonical-card callback and optional artwork failure. |
| Maintained `scripts/test-search-recovery.ts` | Retain. It already checks partial failure summaries and same-query result retention. |

## Acceptance evidence for the next owner

1. A deliberately never-settling source shows a partial result plus an honest timed-out/incomplete state within the stated bound.
2. A fast cards or sets source becomes visible before a slow sibling settles.
3. A source failure preserves useful same-query cached data but does not call the result set complete or empty.
4. A query, language, category, or account-epoch change makes all old source completions harmless.
5. Existing progressive-card-search and search-recovery tests continue to pass; add a focused test for the new completion/deadline policy.

This repair does not establish real iPhone latency, full transport cancellation, or all source availability. Those need separate live/device evidence.

## Coordinator integration review

Root independently reran the source-settlement and actual coordinator harness at db48cbc after a separate reviewer traced the error, retention and stale-request paths. Accepted only as bounded final settlement; independent per-source publication and physical transport cancellation remain unresolved PERF-002 scope. The harness simulates invalidation and mocked first-phase/group boundaries; it is not a mounted React screen or accessibility/device proof. Both new controls are added to the existing test:personal-loading command used by platform and candidate CI. No remote/live action was taken.
