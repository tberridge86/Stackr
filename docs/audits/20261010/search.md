# Independent search audit — 10 October 2026

Auditor: `stackr_search`. Source revision
`5da3ba5edd07d0390f5169d5a6713c7cbfd3a0b1`, branch
`codex/specialist-audits-backend-repair-20261010`, recovery checkout
`D:/Stackr-release-recovery-20261009`. Bounded checks completed at approximately
22:31 UTC on Windows. Exclusive write: this report. Existing artwork, pricing,
adapter and backend changes were inspected in status/diff and preserved. No
runtime file, shared queue, catalogue, price, deployment, commit or push changed
in this audit.

The actual screen loses native-script terms in mixed queries and cannot rank a
native-only set query. A separate reproduced failure hides the fresh card-source
error when disk-cache rows are available. Existing deterministic identity,
translation and recovery controls pass. Search completion remains subject to
the already reported **PERF-002**; that is not a new queue issue here.

## Scope and delivery boundaries

Read `AGENTS.md`, `.codex/AUDIT_PROTOCOL.md`, `docs/agents/README.md`, the
performance brief, assignment plan, performance/translation reports and
`docs/stackr-api/versioned-catalogue-search-api.md`. Applied the Supabase and
React Native skills to access-boundary and mobile-flow review. Traced:

- `app/(tabs)/search.tsx`, `app/search.tsx` and
  `components/search/SearchResults.tsx`;
- `lib/searchNormalisation.ts`, `cardSearch.ts`, `globalSearch.ts`,
  `productSearch.ts`, `pokemonTcgSearch.ts`, `searchRecovery.ts`,
  `searchCardResultCache.ts`, `searchFacetScope.ts`, `optionalCatalogueEnrichment.ts`,
  `stackrDomainAdapter.ts` and `stackrApiV1.ts`;
- backend `/v1/search`, published-name/identity retrieval and the named existing
  fixtures; July global-search indexes, September canonical lookup indexes,
  October bounded collector view, and public-directory/Gate 0 containment SQL.

`app/search.tsx` redirects to the tab. The mounted tab owns its progressive
multi-source flow. Git-tracked app/components contain no `runGlobalSearch`
caller; its four-language fixture is auxiliary-helper coverage and must not be
presented as the tab's actual request fan-out. The tab sends one canonical card
request with a selected language or no language, plus independent set, conditional
product, public-profile and active/null-status listing reads.

No fresh live request or physical-device measurement was made by this auditor.
The translation report's 22:25 UTC scoped Marnie/Pikachu/native search receipt
and live backend `9fae8fac7e8a` are cross-referenced evidence, not this audit's
new measurement. Current source, current live API and signed mobile build 54
are distinct delivery states. API latency, cold/warm phone latency, downloaded
bytes, actual request counts and installed-screen accessibility are unmeasured.

## SEARCH-001 — High: screen normalization removes identity-bearing query terms

`lib/searchNormalisation.ts:29–45` strips everything outside an ASCII character
allowlist after NFD normalization. `search.tsx:982–984` uses the first expanded
query as the retrieval query. An inline, network-free probe compiled the actual
helper and extracted the actual mounted `runSearch` callback; it recorded:

| Input | Actual card query dispatched by the screen |
| --- | --- |
| `リザードン ex` | `ex` |
| `ピカチュウ 025` | `025` |
| `皮卡丘 ex` | `ex` |
| `ピカチュウ` | `ピカチュウ` — raw fallback preserves the native-only card input |
| `Nidoran♀ δ` | `nidoran` |
| `Nidoran♂ δ` | `nidoran` |
| `Pokémon` | `pokemon` — passing Latin-accent control |

Native-only set input `黒炎の支配者` produces an empty expanded-term array.
The extracted actual `rankSet` returns zero, and `searchSetsQuick` discards
zero-score entries (`search.tsx:504–518,607–628`). Thus native-only cards and
native-only sets do not have the same behavior. This is a deterministic source
failure, not a claim about one measured live catalogue result or phone screen.

The backend's general normalizer preserves `リザードン ex`; its specialized
English alias resolver distinguishes the two Nidoran genders and the delta form.
The screen removes those distinctions before that resolver receives its query.
The initial ad hoc probe incorrectly expected the backend's *general*
normalizer to retain gender; that assertion failed. The corrected probe used
the actual specialized alias normalizer, and all stated reproduction assertions
passed. No backend-normalizer repair is inferred from the failed assumption.

Smallest repair: assign `lib/searchNormalisation.ts` and the existing tracked
`scripts/test-progressive-card-search.mjs` exclusively. Preserve Unicode/native
terms and meaningful gender/form symbols through expansion and ranking while
retaining English abbreviation expansion, accent/punctuation handling and
collector-number syntax. The progressive script currently mocks expansion as
`q => [q]`; load the actual helper and add the named inputs above so its extracted
screen callback protects the consumer boundary. Retain the backend translation
fixture as the printing/gender control. Screen changes require a separate
exclusive assignment; no screen edit was made here.

Acceptance: the actual callback dispatches every identity-bearing native/gender/
form term, native-only set terms rank the intended named set, and exact IDs,
set/number, English abbreviations, graded intent and zero-result controls still
pass. Proposed owner: search, coordinated by root. State: reproduced/proposed,
not implemented or delivered by this audit.

## SEARCH-002 — Medium: cache-hit card failure is hidden from the error state

The cached-row callback assigns `canonicalCards` (`search.tsx:993–999`), the
same variable assigned by fresh canonical results (`:1007–1012`). Both the first
and final phase prefer this variable over reporting a rejected factual source
(`:1057–1064,1151–1160`). The actual extracted callback was run with one cached
card and a rejecting `searchLocalPokemonCards`; the card remains visible and
the final error state is `{}`. Retaining useful cached facts is correct; treating
the unsuccessful revalidation as a successful source hides the retry/incomplete
state. This case differs from a fresh canonical callback followed by failure of
optional artwork, where factual retrieval has already succeeded.

Smallest repair: separately track disk-cache facts and fresh canonical facts;
retain cached rows but expose a card-source failure if factual retrieval never
succeeded. Keep optional-artwork failures from turning successful card facts
into a catalogue outage. Add the cache-hit plus factual rejection case to
`scripts/test-progressive-card-search.mjs`, capturing actual `setErrors`, alongside
its existing fresh-canonical plus optional-failure control. No runtime repair
was assigned in this audit. Proposed owner: search; state reproduced/proposed.

## Reconciled findings and passing controls

**PERF-002 remains one shared issue.** The tab's 240 ms debounce, 420 ms
first-phase barrier and final six-source `Promise.allSettled` at `:1129` were
independently traced. No final screen deadline/AbortController exists. Cached
cards and the canonical callback publish early; other completed sources can
remain behind a pending sibling. Request generations protect replacement
queries, auth changes, refresh and blur, but do not cancel underlying transport.
The existing progressive fixture proves obsolete canonical callbacks/final
results cannot paint over a newer query. It does not prove independent final
settlement for a permanently stalled profile/listing source.

**Translation T-01 remains one semantic-data issue.** The translation specialist
verified all twelve `zh-tw` Trainer `瑪俐` aliases incorrectly selected as Pikachu,
and prepared an exact Marnie proposal. The scoped live Marnie query is empty while
Pikachu/native queries return those Trainer identities. Current search identity
checks cannot make an approved but semantically incorrect alias correct. This
report adds no duplicate issue and no publication claim.

Six existing Git-tracked scripts ran individually from the repository root with
TMP/TEMP on `D:/Stackr-recovery-artifacts-20261009/runtime-temp`; all exited zero:

1. `node --import tsx scripts/test-search-recovery.ts`: total/partial failures,
   successful empty results, same-query retention and immutable source arrays.
2. `node scripts/test-progressive-card-search.mjs`: canonical facts before
   stalled artwork, optional failure, two-second/four-concurrent-image bounds,
   first/final rendering and obsolete-query rejection.
3. `node --import tsx scripts/test-global-search-language-fanout.ts`: auxiliary
   en/ja/zh-cn/zh-tw helper retains three successful shards when Japanese fails.
4. `node scripts/test-search-printing-language.mjs`: exact IDs and selected-set
   boundaries; English Charmander aliases in selected Chinese printings; variant
   aliases do not expand sibling finishes; dotted/provider set codes; full-width
   `SVAM GRA` and padded `M5 002`; wrong-language/wrong-set/missing-number controls.
5. `node --import tsx scripts/test-card-search-intent.mjs`: PSA/BGS grades are
   separated from card identity; `151`, `Pikachu 10`, `4/102`, hash and number-only
   inputs retain their meaning.
6. `node scripts/test-backend-translation-search.mjs`: named approved Brute
   Bonnet native-title groups in ja/zh-cn/zh-tw/ko, bounded selected-set aliases,
   exact canonical/external/collector priority, printing/gender exclusions,
   current-name rejection and optional translation failure/deadline controls.

The printing test logged `optional_translation_search_failed` with a null code;
its passing stored-name/partial-success assertion is expected fixture behavior,
not evidence that no dependency failed. All transport in these checks was mocked.
The inline actual-callback probes above also passed their corrected assertions.

## Remaining coverage and smallest handoff

- The developer-named `searchReliability.ts`, `optionalSearchEnrichment.ts` and
  both standalone search tests are absent in recovery. In the original dirty
  checkout all four are untracked (`??`); their named current source was inspected
  read-only and preserved. They were not copied, recreated or executed here.
  The existing tracked scripts above cover this committed baseline; no claim is
  made that recovery has the original checkout's source streaming, 450 ms bulk
  enrichment pool or twelve-request compatibility budget.
- Canonical API results expose match reasons and printing/variant identities;
  the screen maps printing rows and routes to `/card/<id>`. The scoped backend
  fixtures validate language/set/finish matching and alias priority. Whole
  catalogue ranking, route-selected finish behavior and tie stability remain
  unmeasured. `/v1/search` and its client currently have no search cursor and
  return `nextCursor: null`; the screen increases a local set display window.
  This is not cursor pagination proof for complete card/product/listing search.
- Set/language filters and sorting were traced in retrieval/rendering. Product,
  profile and listing reads have caps of 24/10, 8 and 18, respectively; the screen
  applies further facets to returned rows. No authenticated listing/profile
  search, cutoff completeness, page-boundary stress or arbitrary facet
  combination was tested. Public-directory projection, client RLS usage and
  active/null listing predicates are source controls, not fresh live-policy proof.
- Auth transitions clear previous account-sensitive snapshots and increment the
  request generation. Public disk-card cache is query/language scoped, capped at
  48 rows per entry with a 24-hour expiry; total-query storage cardinality,
  freshness across catalogue versions and disk-race invalidation were not proved
  by this audit. No account leak was reproduced or asserted.
- The inspected SQL defines trigram product/listing indexes, exact external and
  collector indexes, and a service-only, published, security-invoker collector
  view. Index existence in source is not proof of applied production indexes,
  execution plans or latency. No remote SQL/migration/benchmark was run.
- Result tiles expose button labels and card inspection actions in source. No
  screen-reader/device UI session was performed. Documentation-only changes do
  not justify full TypeScript/lint/backend/gateway/build checks.

Root owns queue deduplication and subsequent exclusive runtime assignments.
Implement SEARCH-001 independently, then verify the actual screen/helper
regression. Keep SEARCH-002 and PERF-002 as separate scoped repairs. Finish with
matching runtime/API and installed-device evidence before claiming delivery.
