# Stackr combined local candidate — 12 September 2026

> Historical checkpoint at `af9c5d5`. The subsequent fixes, English artwork,
> recovered migration history and build results are recorded in
> [the continuation receipt](integrated-candidate-repair-20260912.md).
> Its current status supersedes the outstanding-code-fix and stopping notes below.

The latest committed retrieval, browsing UI, Home pricing, Japanese search and
existing scanner/image runtime are combined in one isolated local candidate.
**This is a tested source candidate, not a delivered app or a complete artwork
library. Release remains NO-GO pending the specific evidence below.**

## Exact source and integration

- Worktree: `D:/Stackr-integrated-candidate-20260912`.
- Branch: `codex/stackr-integrated-candidate-20260912`.
- Combined runtime revision: `9741fb11a6f04ebf2eaefabb295b50e8cd03608e`.
- Baseline main: `4c0be1ae7ac77b46debd241cf106f4834fe5ffb5`, including the
  pricing request-storm/failure-state fix `93cc32a` and Japanese Unicode search
  identity fix from PR #189.
- PR #184: `5134302c7a059e1385f41c9c12271dad88fffc92` — complete card facts,
  parallel reads, deferred artwork, persisted owner-scoped binder reopening.
- PR #187: `73cf62d7b2a65d4995e54ab7388438e08aa348e5` — compact browsing controls,
  two-column card grids, scrolling summaries, correct Collection glyph, and Home.
- PR #180: `f374cc5a3828fd3614cc99de8ed6bc19f36a8c90` — gateway coalescing/cache
  and its existing proposed binder-RLS migration source.

These are local Git merges only. The one conflict was adjacent imports in
`features/binder/BinderDetailScreen.tsx`; both features' imports were retained.
No behavioral conflict was resolved by selecting one whole file over another.
The runtime diff against baseline main spans 50 files. Subsequent receipt/test
updates do not change this runtime revision. The original `D:/Stackr-1` working
files and other worktrees are preserved.

Two stale assertions in the existing artwork policy test were reconciled with
the integrated code: `includeAssets` is now a phase-specific parameter with
approved artwork requested by default and explicitly during deferred enrichment;
the binder's existing cover takes precedence within the same rendering policy.
No artwork permission or runtime restriction was changed to make the test pass.

## What the user receives when this source is eventually delivered

- Binder card facts can paint before artwork/prices finish. Complete saved views
  reopen from memory or bounded persisted storage. Failed/partial/wrong-language
  refreshes retain a previous complete view; ownership editing waits for fresh
  access checks. Cache keys separate accounts, environments and language.
- Anonymous eligible gateway reads coalesce; private/authenticated responses
  remain outside shared caching. Image failures advance through distinct
  rendition/fallback candidates instead of retrying one source indefinitely.
- Set browsing defaults to All finishes. Compact filter sheets and scrolling
  summaries preserve two-column cards, existing artwork and the approved
  Collection icon. Search retains submission/history and loading feedback.
- Home shows collection activity followed by actual GBP stored estimates,
  coverage, history and refresh state. Partial, stale, unavailable and request
  failure states remain distinct; missing prices are not fabricated as zero.
- Existing scanner routing, camera focus handling, reference hydration and
  recognition fallbacks are retained. No new model was activated.

## Local verification

Observed 12 September 2026, approximately 15:32–15:38 UTC. Windows, Node
`v24.15.0`; existing root and gateway dependencies were linked into this worktree.
This is not a fresh `npm ci`, Linux CI run, Expo/iPhone runtime, or live API probe.

| Check | Result |
| --- | --- |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, 0 errors / 12 warnings |
| Scoped lint on binder/Home/Market and new retrieval/cache modules plus revised policy test | PASS, 0 errors / 8 binder warnings |
| `node --import tsx scripts/test-binder-first-paint.mjs` | 12/12 PASS |
| `node --import tsx scripts/test-retrieval-parallel.mjs` | 12/12 PASS |
| `node --import tsx scripts/test-binder-reopen.mjs` | 17/17 PASS, including file-backed Node SQLite reopen/rollback |
| `node --import tsx scripts/test-card-first-ui.cjs` | 13/13 PASS |
| `node --import tsx scripts/test-card-first-followup.cjs` | 5/5 PASS |
| `npm --prefix gateway test` | 40/40 PASS |
| `npm run test:home-release` | PASS, all four constituent suites |
| `npm run test:collection-pricing-ui` | PASS, all three constituent suites |
| `npm run test:personal-loading` | PASS, all eight constituent suites |
| `npm run test:binder-catalogue` | PASS, all six constituent suites |
| Scanner pipeline, recognition orchestrator, local on-device inference scripts | PASS, three existing suites |
| Native-language display, image candidates, provider set-mark runtime policy | PASS |
| `git diff --check` | PASS |

The first raw-Node invocation of the parallel retrieval test lacked the project's
`--import tsx` loader; the first gateway invocation lacked its dependency link.
Both setup issues were corrected and the affected suites passed. The set-mark
receipt was initially absent from the sparse checkout; its exact committed
content was restored before validation. These are not unresolved runtime failures.

[Parallel-read test receipt](evidence/integrated-candidate-20260912/binder-retrieval-regression.json)
and [SQLite/reopen receipt](evidence/integrated-candidate-20260912/binder-reopen-tests.json)
retain actual generated results. Their CPU timings are diagnostic fixture
measurements and must not be described as phone load times.

## Remaining acceptance and dependencies

1. **Artwork/card lists:** [coverage evidence](artwork-integration-evidence-20260912.md)
   records substantial gaps, especially Traditional Chinese and Japanese.
   The 14:08 UTC census has 2,382/8,166 and 8,620/13,771 usable card-image
   references respectively; published Chinese set-logo counts are zero. It does
   not prove all historical official printings or successful image delivery.
2. **Real retrieval:** the PR #184 handoff recorded a bounded normal-public-route
   timeout at 10 seconds. Correct identity/completeness plus cold/warm iPhone
   tap-to-visible-card p95 remain unmeasured on this combined source. Existing
   instrumentation begins at screen load, so it is not complete tap timing.
3. **Scanner:** no physical-camera accuracy, latency, language cohort, haptics or
   model acceptance was measured. Local inference deliberately refuses operation
   without approved model/catalogue artifacts. Review also identified a possible
   late capture completion after background/navigation; reproduce and resolve
   that through the scanner owner before acceptance. No experimental guard was
   retained in this candidate.
4. **Pricing/Home:** passing fixtures do not prove production price availability,
   source freshness or installed Home rendering. Verify actual owned cards and
   exact identity/finish/condition against the production service.
5. **Database/gateway:** PR #180's SQL exists only as source here. No migration
   was applied or database performance measured. PR #188's migration-ledger
   reconciliation is deliberately not included; release must reconcile exact
   applied migrations and the proposed RLS change before promotion. Gateway
   caching is tested locally, not deployed.
6. **Native/UI:** no build, web visual acceptance, OTA, TestFlight submission,
   installation, camera interaction or physical-device check was performed.
   Green local checks are not the release-candidate gate or integrated CI.

## Resting point and release control

The direct user request authorizes this isolated local integration. The separate
release assessment retains the production freeze. Main's lock was not changed;
no upstream push/merge, provider refresh, asset acquisition/publication,
catalogue/database mutation, backend/gateway deployment or native/OTA/TestFlight
publication occurred. No new scanner, pricing or UX feature scope was started.

Stop at this saved candidate and its evidence. Release coordination owns the next
decision and must preserve the exact source chain. The minimum action to preserve
this local checkpoint after its final commit is none; remaining app-delivery and
coverage work is explicitly unfinished rather than forced through the freeze.
