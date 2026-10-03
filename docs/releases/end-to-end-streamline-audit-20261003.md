# Stackr end-to-end streamlining audit — 3 October 2026

Audited baseline: `9044564e109eb77a244a9e511999f7d4e3ae817e`.
Audit branch: `agent/architecture/streamline-audit-20261003`.

This is a consolidation exercise, not a rewrite. It does not deploy, mutate production data or claim physical-device acceptance.

## Runtime architecture

Normal production mobile enables Stackr API. The chosen public-data route is:

```
screen -> shared domain boundary -> Stackr API -> canonical catalogue / stored artwork / stored prices
```

Authenticated private state such as ownership, activity and listings remains account-scoped and must not be confused with public catalogue authority.

Latest independently verified TestFlight remains 1.0.4 (51), from source `650cbad73340ba74453c7c1ec757bbcdd91364e1`. Availability is verified; installation and device acceptance are not.

The production backend is healthy, but its current Railway deployment does not expose a trustworthy Git source SHA. The two existing pricing workers have successfully deployed the issue-304 main source. The three new issue-304 database migrations are still absent from production.

## Authoritative routes

### Search

```
Search -> searchLocalPokemonCards -> parseCardSearchIntent -> searchStackrCards -> Stackr API
```

Canonical rows are emitted before optional artwork enrichment. A controlled TCGdex reference may fill a display-only image gap after identity is known; it is not allowed to change card/printing identity.

The previous `lib/cardSearch.ts` contained hundreds of lines of unreachable direct-table, fuzzy, local-index and provider-specific search logic. These were not called by the exported search path.

**Classification: SAFE TO REMOVE. Removed in this branch.**

### Sets / Discover

```
Discover -> fetchAllSets(language) -> Stackr adapter -> Stackr API
set detail -> fetchCardsForSet -> canonical paginated set cards
```

Language stays part of the canonical request. Do not replace this with local filtering of one incomplete page.

### Pokédex

```
species route -> fetchCardsForPokemon -> language shards -> searchLocalPokemonCards -> Stackr API
```

External species metadata is presentation-only and must not gate card retrieval.

### Binders

Binder/ownership state is private account data. Catalogue enrichment goes through the shared catalogue boundary. Persisted account-scoped Binder content may paint before optional prices/artwork/enrichment.

### Artwork

```
canonical printing/variant -> Stackr asset candidates -> exact small/detail/original renditions -> StackrImage
```

A different printing, magazine cover or set logo must never mask a missing card front.

### Pricing

Canonical prices are variant-based. Public reads belong behind Stackr API; private collection valuation is prepared by the authorised pricing workers. Exact, stale, unavailable, denied, failed, unchecked and general-estimate states remain distinct. Missing is never £0.

### Haptics

Preferred route:

```
interaction -> stackrHaptics.semanticEvent() -> saved preference / cooldown / native effect
```

This branch moves active tab and listing feedback away from local native-effect choice. The older preference-aware wrapper remains only for compatibility until all callers are migrated.

## Competing-route decisions

| Route/code | Decision |
| --- | --- |
| Dead fuzzy/direct-table/local-index helpers in `cardSearch.ts` | REMOVE |
| Direct-Supabase legacy catalogue adapter | KEEP AS FALLBACK until rollback support is intentionally retired |
| Controlled TCGdex missing-image reference | KEEP AS FALLBACK until stored asset coverage is equivalent |
| Redirect-only legacy routes | KEEP FOR COMPATIBILITY |
| Local haptic strength choices | CONSOLIDATE into semantic facade |
| Old haptic compatibility wrapper | KEEP TEMPORARILY |
| Exact duplicate asset paths | CONSOLIDATE after reference migration; do not bulk-delete |
| Superseded experimental material/search PRs | Do not merge; link/close once current replacements are established |

## Changes in this branch

### Search simplification

`lib/cardSearch.ts` is reduced to one application-facing search adapter.

Removed unreachable implementations include:
- direct set/card database search;
- Japanese dex-id database search;
- local card-index fallback;
- private edit-distance/fuzzy ranking stack;
- duplicate set/card presentation mapping;
- provider-specific query construction.

The exported function signature and current canonical callback/enrichment behavior are retained.

Focused tests verify:
- short/grading-only input creates no catalogue request;
- language and limit forwarding;
- canonical rows appear before optional image enrichment;
- complete artwork avoids the provider-reference call;
- missing artwork may use only the controlled exact-identity display fallback;
- all-language scope stays independent of locale;
- canonical errors do not silently jump to another database/index.

### Haptic consolidation

Active tab and listing interactions now use semantic events:
- tab/choice -> `selection`
- saved evidence photo -> `captureSaved`
- completed analysis -> `analysisCompleted`
- published listing -> `listingCompleted`

The action remains the trigger; no extra haptic activation control is added.

### Small dead-code removal

Removed unused Search imports, an unused Search set mapper and unused UI imports.

## Quantified source cleanup

Before this report, the branch versus audited main is:
- 920 lines removed;
- 187 lines added, including regression tests;
- net reduction: **733 lines**;
- `lib/cardSearch.ts`: **868 lines removed**.

This does **not** claim a network latency gain from deleting unreachable code. The runtime Search matching request count was already one canonical path; the value is lower complexity and lower risk of accidentally reviving contradictory results.

## Retrieval findings

Current existing API evidence remains:
- repeat reads roughly **53–73 ms**;
- first reads up to **2.607 s**.

These are API timings, not phone launch-to-visible timings. No physical-device cold/warm timing is claimed here.

A separate deployment retrieval problem is proven: the GitHub-linked API performance canary fetched a repository-level source snapshot around **1.10 GB** despite its backend root directory, then repeatedly failed fetching that snapshot. Root directory narrows build context but does not reduce the observed source snapshot transfer.

No `.railwayignore` exists on main. Whether GitHub-triggered Railway snapshots honor it is not established by current evidence and must be rehearsed on the canary rather than assumed.

## Repository byte audit

Current main tree:
- 4,384 tracked blobs;
- about **1.150 GB** current-tree bytes;
- about **729.6 MB** unique by exact blob SHA;
- about **420.7 MB** exact duplicate current-tree bytes;
- 557 duplicate-content groups;
- 608 extra duplicate files.

The largest duplicate groups are profile/team artwork, Binder artwork and repeated brand/backdrop files. Current runtime registries generally point at `assets/rev2/...`, but older paths must be reference-audited before removal.

**Classification: CONSOLIDATE, not bulk-delete.**

Deleting current duplicates also does not shrink existing Git history; history rewriting is outside this application audit.

## Safe next sequence

1. Build an exact static/runtime reference map for duplicate assets.
2. Repoint live references to one canonical copy and test bundling/screens before deleting old copies.
3. Rehearse a source-snapshot filtering strategy on the API canary only; require a materially smaller snapshot and identical backend behavior.
4. Continue semantic haptic migration caller-by-caller; remove the compatibility wrapper only when its caller count reaches zero.
5. Measure Search, Pokédex, Binder and Discover from a fully closed physical app and again warm.
6. Audit remaining public direct-Supabase reads separately from legitimate private account state.
7. Close superseded draft implementations once linked to their current authoritative replacements.

## Guardrails retained

Do not regress card/printing/variant/language/finish identity, ownership, Binder quantities, artwork, pricing truth states, Search/Pokédex independence, Discover languages, Marketplace, scanner gates, haptic preference, card inspection or release controls.

The target is one named authoritative route with explicit, bounded fallbacks—not a smaller codebase at the cost of hidden behavior.
