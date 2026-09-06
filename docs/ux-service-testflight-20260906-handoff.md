# Bounded UX / service readiness handoff — 6 September 2026

Status: ready for the coordinator's **local integration and combined verification**, not an uploaded or submitted TestFlight build. No full build/export was run in this pass. Physical-device acceptance and remote CI remain outstanding.

- Owned worktree: `D:/Stackr-ux-service-ready-20260906`
- Branch: `codex/ux-service-testflight-ready-20260906`
- Base: `9c3d00eb76f2682a0f7a23d6b31f722afb534fde` (`origin/main` as supplied by the coordinator).
- Commit: the commit containing this document; coordinator receives its exact hash separately.
- No push or PR created; not merged into main by this task.
- Version stays **1.0.3**. App/native/runtime configuration, dependencies/lockfiles, pricing, backend/gateway/database code, assets, icons and access controls are unchanged.
- No changes to `D:/Stackr-1`, the pricing worktree or the coordinator's integration worktree in this pass. Existing source fallbacks are preserved.

## Ready slices

| Slice | Included | Limits |
| --- | --- | --- |
| Shared interface | Preview-only inset context, native pass-through, optional explicit safe-area edge ownership, uncapped default text scaling with per-component overrides | Component tests cover 393×852, 430×932 and landscape; not fresh browser or physical-device screenshots. Individual native-header ownership/layout changes are not ported. |
| Profile recovery | Failed reads differ from missing profiles; retain same-account details; request/account guards; Retry; setup waits for known account data | Pure state tests, not authenticated native/multi-account end-to-end proof. No broader profile redesign. Supabase guidance informed missing-data and account boundaries; no permissions or schema changed. |
| Catalogue query intent | Recognised slab-grading modifiers are separated from card identity, e.g. PSA 10 Charizard searches the catalogue for Charizard | Marketplace keeps its original query. Four-tab/mixed-results hierarchy and broad search recovery are not in this packet. |
| Offer clarity and accessibility | Both directions of a one-sided exchange and invalid quantities warn before acceptance and in confirmation; truthful card-only limitations; status-only Problem flagged; action roles/states/44px targets; no automatic scroll past the decision | No API/data/state-machine changes. This does not prove stock reservation or server integrity. Current-main offer layouts are retained, not replaced by dirty-root screens. |
| Direct / Tracked | Planning matrix and dependency-free rules, eight labelled synthetic test fixtures | **No live selector, persisted service fields, tracking, shipping, payment or support-ticket activation.** See `docs/marketplace-trade-services.md`. |

Home is separate and already integrated by the coordinator from **f9ecb0ed2bd7bacc184fa0b857a864d9f224bfbc**. This packet does not modify HubScreen, ValueTrackerCard or StackrBackdrop; retain the integrated Home pricing contracts and layout.

## Verification completed on this branch

- `npm run typecheck` — passed.
- `npm run lint` — passed, 0 errors and 10 pre-existing warnings in unchanged app/component files.
- `npm run test:ux-service-release` — all five suites passed: actual shared component checks, profile state, grading intent, offer warning/control wiring, Direct/Tracked planning fixtures.
- `npm run test:commerce-release-lock` — passed; includes 138 hostile dynamic-copy fixtures, 18 safe listing fixtures and 35 hostile Minty fixtures. Its existing disputed-label assertion was updated to Problem flagged while retaining the backend status assertion and all original security checks.
- `npm run test:mobile-runtime-config` — passed.
- Focused lint — 0 errors, 12 existing warnings (10 unused symbols in `lib/cardSearch.ts`, two existing require-style imports in the commerce-lock test); `git diff --check` passed.
- `npm run ci:secret-scan` — passed; no bundle was produced or scanned in this pass.
- Independent scoped offer/service review found no blocking regression; its remaining stale error label was corrected.

Package script and Platform CI add `test:ux-service-release` only. Preserve the coordinator's pricing/Home/preview scripts and checks when merging those two files. No concurrent exports or native builds were run here.

## Exact packet inventory — 25 files

Shared (5):

- `app/_layout.tsx`
- `components/Text.tsx`
- `components/StackrScreen.tsx`
- `components/StackrSafeAreaBoundary.tsx` (new)
- `scripts/test-shared-ux-release.ts` (new)

Profile (5):

- `components/profile-context.tsx`
- `features/profile/ProfileScreen.tsx`
- `app/profile/setup.tsx`
- `lib/profileLoadState.ts` (new)
- `scripts/test-profile-load-state.ts` (new)

Catalogue intent (3):

- `lib/cardSearch.ts`
- `lib/cardSearchIntent.ts` (new)
- `scripts/test-card-search-intent.mjs` (new)

Offers / service rules (8):

- `app/offer/index.tsx`
- `app/offer/new.tsx`
- `lib/tradeOfferReview.ts` (new)
- `lib/tradeService.ts` (new, dormant planning contract)
- `scripts/fixtures/tradeServicePreviewFixtures.ts` (new, test-only)
- `scripts/test-offer-review-release.ts` (new)
- `scripts/test-trade-service-release.ts` (new)
- `scripts/test-commerce-release-lock.ts` (label assertion only plus unchanged-status guard)

Release wiring / documents (4):

- `package.json` (test script only)
- `.github/workflows/platform-ci.yml` (test step only)
- `docs/marketplace-trade-services.md` (new)
- `docs/ux-service-testflight-20260906-handoff.md` (new)

## Held older work — do not imply all screens shipped

The untracked dirty-root handoffs `docs/ux-refresh-20260905-handoff.md` and `docs/ux-refinement-20260906-handoff.md` inventory 80 distinct product/test paths, 75 excluding five superseded Home paths. This packet is a **selective port**, not that entire batch. Completed local preview work is not automatically release-integrated work.

- **Broad Search hierarchy/recovery:** depends on the dirty-root source settlement/deadline layer (`searchReliability`), revised result/display types, optional artwork budgets and domain mapping. Reconcile these against current-main query, Gate 0 copy and rights contracts before porting UI, preserving existing categories/relevance and partial-error behavior.
- **Market filters, listing camera and evidence/intent:** whole screens depend on unqueued marketplace trust, listing-intent persistence, capture/haptics and artwork changes. Retain production-disabled controls; do not copy missing services or schema wholesale.
- **Movement refinement:** requires reconciliation with the coordinator's queued live pricing, preview-fixture and nullable valuation contracts. Not ported here.
- **Collection, Binder and card/set/detail compression:** dependency chain includes ownership lifecycle, factual/English display, controlled artwork and interactive card inspection. Coordinate with the already-owned CJK/metadata packet; do not overwrite that work.
- **Community, Local, friends and notifications:** independent source loading, community safety, attendance/identity and real-account actions still need a scoped integration and validation pass.
- **Settings, seller, Orders, family, cosmetics and scanner UI:** broader shared/route/provider changes remain separate. Family requires managed-session containment and native/account tests; scanner/camera work remains owned by recognition. Do not import family accounts, haptics, observability or artwork helpers just to make a copied screen compile.
- **Global non-Home backdrop/navigation:** held to preserve the integrated Home backdrop variant and existing route/header ownership.
- **Offer integrity and fulfilment backend:** immutable counters, expiry, atomic reservation, quantities, server transitions, tracked two-legged fulfilment and a real issue record remain unverified/unfinished. The original legacy acceptance RPC definition is not available in this local source inventory; client checks cannot certify it. The service-level migration is held, not queued/applied.
- **Commerce:** checkout, payments, refunds, orders and any automatically included authentication stay disabled/separate.

Next integration checks belong to the coordinator: combine this scoped commit, resolve only relevant package/CI/layout overlaps, rerun combined tests and the single export, then perform physical-iPhone safe-area/large-text/profile/offer smoke testing. This task has not queued anything in EAS or App Store Connect.
