# Collection and set-logo repair reconciliation - 1 November 2026

Source baseline: GitHub main `0bf2e60222644682d600deb7cc0e94862fd2a71a`. This repair batch is a review candidate, not a production deployment or installed-phone acceptance result.

## Implemented in this batch

| Repair | Before | After | Evidence |
| --- | --- | --- | --- |
| COLL-20261101-01 | A delayed disk-cache write can replace eight saved cards with an older one-card snapshot; storage also delays valid live totals. | Version-aware writes stay ordered per account, obsolete writes are removed, and optional persistence does not block live totals. Existing identity and joined-read guards remain. | Exact main reproduces the disk overwrite; six regression scenarios and the existing current-main collection performance test pass; independent review passed. |
| LOGO-20261101-01 | The shared catalogue adapter ignores declared logo renditions and selects the full original. | Approved set logos select their recorded detail-page rendition. Missing/blank renditions retain the original; symbols, covers, exact-set matching and provenance are unchanged. | Actual-module direct/enriched mapping tests pass and fail on the original main. Independent review passed. |

Both regressions are wired into existing npm/CI lanes. The patch preserves the existing architecture: compact authenticated collection reads, account-scoped caches, canonical catalogue identity, and immutable R2 artwork locators. It adds no alternate catalogue or price-refresh path.

## Live logo sample

At `2026-11-01T19:07:14.566Z`, public `GET https://api.stackrtcg.com/v1/assets/manifest?assetType=set_logo&limit=1` returned approved asset `acquire:set_logo:59ec63a0-5a2a-452b-a03c-90d9264b90da`, request `a3e543e5-a4cc-43d5-b143-1af8512e1b79`. Its original is 1000x559 / 667,122 bytes. Its declared detail-page WebP is 720x402 / 58,190 bytes: 91.28% fewer bytes for this one asset. The declared R2 rendition loaded and decoded in Chrome at 720x402.

That image is the Japanese Detective Pikachu logo and still includes the source sheet's caption and set-code badge. This code repair reduces delivery size; it does not clean source crops or prove every logo is visually finished. No whole-catalogue byte reduction or device latency improvement is claimed. Bundled logo overrides may take precedence on individual screens.

## Reconciled existing work

| Existing work | Verified status | Next action |
| --- | --- | --- |
| Compact Profile summary / PR #439 | Merged; release record reports the migration applied once and internal TestFlight Build 1.0.6 (61) distributed. Earlier local handoff was stale. | Verify current signed-in phone journeys; do not replay the migration. |
| R2 eligible migration / PR #448 closeout | Final report at `35c49c309637717fe968606f0e97adfbd17ff5cd` records 62,098/62,098 eligible assets, zero remaining on October 27, exhaustive pointer checks and 13 verified GETs across 11 objects. | Preserve closeout; do not restart from the earlier collector's false completion flags. This is its eligible scope, not every catalogue image or present-day completeness. |
| SoulSilver / Lost Link crops, PR #203 | All four file blobs already match current main, despite the old PR remaining open. Both PNGs, manifest and reproducible crop script are integrated. | Do not duplicate the patch. Installed-phone appearance is still a separate check. |
| Chinese-logo preparation / PR #204 | Preparation tooling; published/runtime delivery of its full proposed pack is not established. | Resolve exact identities and complete the asset/runtime package before declaring delivery. |
| Retrieval/daily-movers / PR #436 | Open work overlaps later merged collection improvements; broad branch cannot be treated as a ready merge. | Reconcile remaining deltas against current main; keep its unapplied history migration separate. |

PR #203 blob checks: l1b `028900364b897eae31db8e677fedfee33fe82b67`; ll `023f82404e8fb2cd67f105a66a0199dd9db83cf4`; manifest `54c00529ca2ad3256aa96840fde417eaca2bf174`; script `ae11ebf3341a750b36e093e3cade97f5fd6ebd27`.

## Validation and remaining acceptance

- Six persistence scenarios cover stale writes, stalled storage, invalidation cleanup, account isolation, failed-storage recovery and obsolete joined callers. Existing current-main summary performance fixtures also pass.
- Logo tests cover declared rendition URLs, original fallback when no usable rendition is declared, no thumbnail downgrade, permission eligibility, exact-set enrichment and unchanged metadata/symbols/covers.
- Local `npm run typecheck` and `npm run lint` passed after excluding ignored `work/` backups from the dirty local checkout's TypeScript inputs. That local configuration-only edit is not part of this current-main patch.
- This partial isolated current-main snapshot cannot establish full application compilation. CI must validate the actual PR. Narrow semantic comparison introduced no collection-summary diagnostics; the older local dependencies still differ from main. Full-main compilation remains explicitly pending.
- Installed-phone cold/warm collection loading, save/remove/quantity changes, account switching and logo appearance remain pending. Public samples do not establish authenticated permission acceptance, private-upload access or all catalogue images.

The instructed recovery checkout is not writable/usable for Git in this session. Current main was read through GitHub; candidate files are isolated under `work/reconcile-20261101/current-main/`. Extensive existing local edits are preserved. No merge, deploy, native build, remote database mutation, catalogue publication, price refresh or permission expansion was performed for this batch.
