# Independent performance audit — 10 October 2026

Auditor: `stackr_performance`. Inspected integration source
`5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`, branch
`codex/specialist-audits-backend-repair-20261010`, on Windows; final local check
timestamp `2026-10-10T22:18:28.2634712Z`. Exclusive write: this report. No runtime
code, catalogue, prices, jobs or deployments were changed.

The bounded audit confirms useful cache/progressive/image safeguards in current
source, but set detail still waits for optional artwork, and search completion
still depends on the slowest source. These are source-backed repair candidates;
they are not measured explanations of a particular installed iPhone interaction.
The coding audit independently identifies signed build 54 as predating current
loading/CoroCoro/history/haptics changes, and freshly attests live backend
`9fae8fac7e8a` rather than current main `5da3ba5…`. Those release findings are
cross-referenced evidence, not new performance/device observations by this agent.

## Scope and actual measurement

Read repository instructions, audit protocol, `docs/agents/README.md`, the
performance ownership brief and `docs/performance-guardrails.md`. Applied the
React Native skill to list/image/cache review. Traced `app/_layout.tsx`, startup
helpers/video/loading components, `app/(tabs)/search.tsx`, `app/set/[id].tsx`,
`app/(tabs)/pokedex.tsx`, `app/pokemon/[id].tsx`, `components/StackrImage.tsx`,
`lib/performance.ts`, request/catalogue/Pokémon/market caches, runtime fetch
diagnostics, `cardSearch.ts`, `stackrDomainAdapter.ts`, optional enrichment and
the actual image preloading hook. Read named fixtures only; no catalogue scan.

| Scenario | Evidence and denominator | Limit |
| --- | --- | --- |
| Startup routing / recovery | Local mocked auth/profile states; ready collector routes without a decorative floor in `app/index.tsx`; unresolved/error states remain honest | Does not mount the full native root/video or measure first useful pixels |
| Cold persisted search | Mocked AsyncStorage: 60 rows saved, capped at 48, different language misses, >24-hour data expires | No network, account or iPhone timing measurement |
| Cold Pokédex tab | Fixture 151 initial rows publish while a 1,199-row continuation is unresolved; only validated 1,350-row completion persists | Fixture sizes, not a fresh live catalogue census |
| Species cards | First 24 factual cards publish while the second page is pending; duplicate plus one unique continuation yields 25 cards | Simulated transport; no perceived-device latency |
| Set recovery | Concurrent weak/237-card-minimum callers share one read; three partial cards stay visible but are not retained for the stricter caller; recovery yields 237 and is cached after two total reads | No app screen render or live data measurement |
| Thumbnail fallback | Supplied rendition URLs deduplicate, exhaust in order and do not restart on equivalent object instances | Does not prove sharpness, native decode or correct live artwork |

Cold/warm startup-to-useful-content, navigation, query first correct result,
render/scroll cost, downloaded bytes, observed network/provider calls, API
latency and optional-enrichment latency are **unmeasured on a physical device**.
No before/after speedup or instant-across-screens claim is supported. Test process
duration is deliberately not reported as an app latency.

## Findings for the coordinator's queue

### PERF-001 — High: set detail keeps factual cards behind optional artwork

`app/set/[id].tsx:689–700` serially awaits set lookup, possibly an all-sets
fallback, then `fetchCardsForSet` before publishing either set information or
cards. It calls the helper without `includeAssets: false` or the set's known
minimum count. The default canonical path therefore reads all card pages and
awaits `enrichCanonicalSetCards`; its manifest and set metadata reads each have
a 2,000 ms optional child budget (`stackrDomainAdapter.ts:1024`,
`optionalCatalogueEnrichment.ts:16`). `pokemonTcg.ts:2011` then awaits the
controlled provider-reference fallback. That fallback is conditional on its
source flag and verified foreign identities; this is not proof it ran on the
phone. With the set helper's argument of one, its source upper bound is one
provider set read followed by up to eight card-detail reads, without a helper
deadline of its own.

This dependency is directly demonstrated by the awaited source chain. Current
warm asset cache can return without those reads for ten minutes, but the screen
still awaits set lookup first. The complete, public, scoped facts reader already
exists: five-minute TTL, 25 ms disk budget, 8 s network deadline, 24 entries,
2 MiB per entry / 8 MiB memory budget and equivalent bounded persistent storage.
Its key includes API namespace, canonical set, language and expected count, and
it strips prices, ownership and images. Simply importing that reader does not
prove set detail consumes it: this screen currently chooses the asset lane.

Small repair: route set detail through the existing facts lane with verified
language/count, publish cards immediately, then use existing same-identity
artwork enrichment independently. Preserve account/request guards and leave
ownership controls disabled until owner reads succeed. Add a screen fixture
holding artwork unresolved while facts are rendered; verify failed/late artwork
cannot lose quantities, prices, identities or factual rows. Proposed owner:
performance, with exclusive assignment of set screen and any shared adapter
handoff from the coordinator. No repair was edited in this audit.

### PERF-002 — High: search sources do not settle independently through completion

The actual tab has a 240 ms debounce and a 420 ms first-phase budget.
`search.tsx:1036–1042` waits for every first-phase settlement before publishing
sets/products/profiles/listings. Cached cards and the canonical card callback
are exceptions: they publish independently (`:993–1012`). After that phase,
`:1129–1197` waits for all six source promises with `Promise.allSettled` before
publishing completed non-card groups and clearing loading. A nonsettling
profile/listing transport therefore has no deadline in this screen and can
leave “Loading more results...” active while other facts have already arrived.
Request-ID guards prevent obsolete results painting, but do not cancel their
transport: no screen `AbortController` is present in the inspected flow.

Source request bounds: one canonical card search, limit capped at 100 by the
adapter; one set-facts search (pagination dependent); optional product query
24 or 10, profile directory 8, active listing query 18. Missing-image search
fallback currently processes up to the returned printing count in groups of
four concurrent individual manifest reads, under a 2,000 ms child deadline.
`cardSearch.ts:907–908` may then await another 2,000 ms optional provider-reference
step, with source bounds of eight sets and 24 detail reads if enabled. These
are code bounds, not measured request counts; image/provider work can continue
underlying a wrapper when that transport ignores cancellation.

Small repair: have each source publish/error independently with the existing
identity guards, a bounded source deadline and obsolete-request cancellation;
retain truthful partial results on optional failures. Preserve debounce and
settlement behavior while coordinating with the search owner. Test one source
held unresolved, one successful source, one failure, a replacement query and an
account switch. No runtime edit or budget change was made here.

The developer's named `lib/searchReliability.ts`,
`lib/optionalSearchEnrichment.ts` and three standalone reliability/budget tests
are absent from this maintained checkout. Thus a 12 s source deadline, 450 ms
enrichment cap, batch-manifest / at-most-12 compatibility reads and shared
enrichment concurrency two are **not verified in this source**. Do not silently
recreate absent helpers or describe the current 2 s / four-request implementation
as satisfying those different budgets. Reconcile the named original-checkout
work sequentially before assigning an implementation.

### PERF-003 — Medium: species card tiles bypass the shared image boundary

`app/pokemon/[id].tsx:365` renders repeated remote card artwork with React
Native `Image`; search and set tiles use `StackrImage`. The species tile selects
small-first candidates and preserves honest fallback state, so this is not
evidence that it always downloads originals or displays synthetic blur. It does
mean this path lacks the shared rendition cache keys, disk policy, controlled
source policy and bounded same-identity retry in `StackrImage`.

Proposed focused correction: adopt the shared component using the already
verified thumbnail, full fallback and identity-preserving candidate list.
Coordinate ownership with the Pokédex specialist before editing the shared
screen. Validate failed-small/working-full fallback and actual device cache
behavior. Measured benefit remains unknown.

## Safeguards verified in current source

- `StackrImage` defaults to transition zero and uses real thumbnails, not a
  blurhash/synthetic blur placeholder. Normal candidates prefer thumbnail;
  detail inspection uses full source pixels (`allowDownscaling=false`, ARGB),
  with the supplied real thumbnail as an interim image. Fallback cache keys
  include rendition URI and retry; one same-identity retry precedes the next
  vetted candidate. No blur setting or explicit fade override was found in the
  named search/set/Pokédex/card surfaces. This does not verify all app screens.
- Image prefetch waits for interactions; generic prefetch defaults to 18 and
  remembers at most 256 URIs. The viewport hook cancels obsolete queued work,
  starts with at most 12 initial indices and uses thumbnail windows. Search card
  rails are genuinely virtualized (`SearchResults.tsx:165`), initially four
  items, batches four, window three; the outer one-item list is not their only
  virtualization. Set grid initially renders 12 / batches ten / window five.
- The initial species page publishes before later facts, pricing, set names or
  artwork. First artwork warming is 16 cards; visible hydration is at most 100
  printing IDs, three 100-asset manifest pages, cache 512 entries, successful
  artwork TTL 60 s / missing artwork 30 s. Failed continuation retains facts
  and explicitly marks incompleteness; late images preserve earlier metadata.
- `requestCache` in-flight invalidation uses a generation and request identity;
  the regression passes that an old completion cannot remove a newer read.
  Account-sensitive callers use their own scoped keys/guards. The old
  `pokemonTcgCache` helper is still imported by card detail but its synchronous
  lookup is followed by exact fetch on a miss; its lack of TTL is not used here
  to claim a demonstrated cold search bottleneck.
- Startup auth/profile requests time out at ten seconds; fonts at five seconds.
  `AppShell` can mount behind the opening video once fonts are ready. The root
  overlay intentionally remains until video completion plus a 240 ms exit,
  with a 12.5 s force-exit limit; the component describes a local 4.2 s reveal.
  Ready route navigation is not proof this overlay has already gone. The user
  requested the new opening screen, so this audit does not remove it.
- `lib/performance.ts` general measurements are development-only; bounded
  binder model/visible/editable observations are device-local. Runtime fetch
  diagnostics are development/explicit-flag gated and time response headers,
  not full JSON decoding or image pixels. Neither is current iPhone acceptance.

## Checks actually run

All eight named scripts are Git-tracked in this integration checkout. Each ran
individually from the repository root using `node --import tsx <script>` with
TEMP/TMP on D:. All passed, exit zero:

1. `scripts/test-request-cache.ts`
2. `scripts/test-stackr-loading-indicator.ts`
3. `scripts/test-startup-loading.ts`
4. `scripts/test-issue304-cold-retrieval.ts`
5. `scripts/test-pokemon-set-card-cache-minimum.ts`
6. `scripts/test-stackr-optional-enrichment.ts`
7. `scripts/test-stackr-image-candidates.ts`
8. `scripts/test-pokedex-loading.ts`

These are mocked/local source-baseline checks, not live API, downloaded image
decode or installed TestFlight measurements. No typecheck/lint, backend/gateway
check, full build, benchmark, remote database script, provider refresh or live
load test was warranted for this report-only write. The coordinator owns
deduplication with search/Pokédex findings and exclusive runtime assignment.
Before calling performance delivered, obtain the matching signed mobile runtime
and real-device cold/warm receipts for startup, a known multilingual search,
set card first content and species card/image inspection.
