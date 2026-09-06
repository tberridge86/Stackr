# Pinned Stackr-1 tasks: next TestFlight source queue

Prepared 6 September 2026. This is the single integration handoff for the five pinned Stackr-1 tasks. It queues reviewed source, not an EAS build, TestFlight upload, OTA update or server deployment.

## Release identity

- Assembly branch: `codex/next-testflight-pinned-20260906`.
- Clean assembly directory: `D:\Stackr-next-testflight-20260906`.
- Starting main: `9c3d00eb76f2682a0f7a23d6b31f722afb534fde` (includes the already-merged binder PR #134 and recognition PRs #132/#135).
- App version: **1.0.3**, unchanged. `app.json` and `eas.json` remain identical to this base. The `app.config.js` addition only selects interactive web output for an explicit local preview; ordinary production and owner native configuration remain unchanged.
- Existing profile/channel/runtime: `production-owner` / `owner-recognition` / `1.0.3-owner-recognition-v1`.
- No native build number is reserved or incremented. The historical owner build 25 is not this candidate.
- The shared dirty `D:\Stackr-1` checkout is not the release source. Older task branches must not be replayed wholesale.

## Pinned-task inventory

| Pinned task (exact title) | Source disposition | Release evidence and limits |
| --- | --- | --- |
| Add iPhone 15 live preview | `961cf04a54f5dca82f21bfda73b79a443d693465` / component PR #137, plus coordinator attribution fixes `34fafd6` and `fedbb24` | Production-targeted developer preview, bounded Windows watcher and environment-isolation tests; tooling excluded from EAS upload. Only a live wrapper-owned child receives launch-source attribution; reused/switched servers are unverified and stale navigation responses are ignored. Browser preview is not native/device approval. The old owner-OTA branch is excluded. |
| Assess app visual variety | Approved Home from `f9ecb0ed2bd7bacc184fa0b857a864d9f224bfbc`, plus scoped UI/service follow-up `da7d25d9920d17d05d9941b3d8e70d4abe01d3a6` (assembly `fea3aec`) | Full-width compact chart, value-first layout, collecting rail, profile recovery/account guards, accessibility, grading-query intent and offer warnings. Direct/Tracked remains a dormant planning contract. Broader older screen work is explicitly held, not silently declared shipped. |
| Fill image and metadata gaps (2) | Main PR #134 plus preparation fix `46e394245a962d359c212c25fdf5524a165427e1` (assembly `db25618ce81850994db1375fc32f841597ac5fc8`) | Binder identity, saved quantities, native-language presentation and optional enrichment regressions passed. Production image RPC preparation remains a server dependency, not a completed live restoration. |
| Improve recognition accuracy (2) | Main PRs #132/#135 plus `d2fd400425b7a113b175d2d9f9646d77f715acaf` | Prevents stale-owner capture deletion after account switch/sign-out. Existing owner-only server inference retained; no new model, native inference, measured real-device accuracy or auto-add claim. |
| Add live price refresh charts (2) | Pricing PR #136 plus local approved Home integration through `f9ecb0ed2bd7bacc184fa0b857a864d9f224bfbc` | Authenticated refresh, bounded worker, exact-variant real history and retained sale evidence. A passing fixture does not certify live sold prices. Activation stays separate. |

Task IDs, in the same order: `01a06798-b744-7270-a687-5792132f35e4`, `01a06b3f-0e4f-73f0-90ae-e9d57ebfc66a`, `01a072dd-c789-7562-8843-a1d4a0634e68`, `01a072e4-4254-7130-b1d6-07688fa0040c`, `01a072e8-7a33-7e12-8657-a0fd70e7d2bd`.

Use this combined branch for the next release review. Pricing PR #136 and preview PR #137 are components of this assembly, not separate releases to merge after it. Preserve historical task receipts as evidence of their own commits; they are not a receipt for this combined checkout.

## Checks on the assembled tree

At intermediate assembly `db25618`, app/backend type checks, lint (zero errors, ten existing warnings), deployment tooling, live/personal pricing, Home, binder catalogue, collection-pricing UI, benchmark-tool regressions, mobile runtime, generated API contract, API integration and gateway tests passed. Gateway: 27/27. API route coverage: 37/37. Independent cross-feature review found no actionable integration defect.

After the last task handoff, the combined app/backend type checks and lint passed again (zero errors, ten existing warnings). All five UX/service suites, Home, commerce release locks, owner recognition (16 HTTP/auth tests plus capture/account races/archive/build/submission dry-run), mobile runtime and deployment-tooling checks passed. Preview attribution/navigation races and proxy checks passed. The four-language binder/picker/flag/native-display checks passed on the assembled code. Repository, introduced-commit history and exported-bundle secret checks passed.

Both ordinary production and production-owner resolved app configuration were compared with the starting main and are exactly equal. The preview-only config option does not revise native identity, version or runtime. Existing dependency lockfiles and models were not changed.

### Combined local iOS export

- Command: `node scripts/export-owner-recognition-ios.mjs`; production-owner environment, no dotenv import.
- Result: exit 0; 2,734 modules and 471 assets.
- Output: `D:\Stackr-next-testflight-20260906\.tmp\owner-recognition-ios-export`.
- Hermes bundle: `_expo/static/js/ios/entry-72985b76bc75f3e0bbf2c7946673b653.hbc`.
- Bundle size: 9,976,229 bytes.
- SHA-256: `1d7268a11eaca8b8cae2053e3b40da60daacbc22946f0db1525f4e4f7530e945`.
- Mobile code snapshot: `fea3aec`; subsequent `34fafd6`/`fedbb24` only improve excluded developer preview tools. Release documentation does not change the bundle.
- Bundle secret scan: passed, 473 files scanned. The existing Android-only missing `google-services.json` warning remained; the iOS export completed successfully.

This is a local JavaScript/Hermes export, not native compilation, signing, a submitted build, a phone installation, live sold-price validation or complete binder coverage. The aggregate draft PR runs the repository's normal checks against its exact head, including isolated PostgreSQL 17 pricing rehearsal, combined interface/preview tests and Linux web export. Review that final head's results; prior component PR green checks do not substitute for aggregate CI.

The first aggregate CI run passed database rehearsal, API/gateway, security, integration, recognition containers and Linux web export. It correctly rejected the stale catalogue compatibility binding after pricing added eight lines to the operating-boundary document. Independent review confirmed that this delta only narrows personal pricing access/cache/label behaviour. A new append-only technical compatibility record binds the current document while preserving the previous review, original decisions, hashes, runtime controls and amber separation. Tampering or removing either bridge still fails closed. No source permission or activation was added; this follow-up changes only review/test tooling and documentation, not the exported mobile code.

## Explicitly held scope

All five pinned tasks are represented, but this is a queue of their tested slices, not a claim that every historical experiment in those chats is release-ready. The broader Search/Market/Community/Binder/family/camera/navigation screens and fulfilment backend still have unintegrated dependencies. Their exact disposition is in the [25-file UX/service handoff](../ux-service-testflight-20260906-handoff.md). No wholesale dirty-root screen batch, old scanner experiment or service migration was imported. Keep these held until their own scoped integration and checks pass.

## Technical rollout dependencies — not requests to repeat permission forms

1. **Binder backend:** the earlier protected preparation run `34021293972` failed in argument parsing before connecting to the database. The merged backend opts into `api.card_image_manifest_for_identities`; do not deploy that backend before its bounded two-migration preparation and independent RPC/index/permissions/DTO verification. The new URL fix is queued, not executed. Follow [the scoped binder runbook](../historical-asset-query-recovery.md). Check multiple sets in EN/JA/zh-cn/zh-tw and paginated saved inventories; preserve quantities. Full historical image/count coverage remains unverified.
2. **Pricing:** retain disabled refresh/ingestion/publication controls until the target-schema rehearsal, six pricing migrations, same verified owner configuration on backend and gateway, reviewed source/benchmark evidence and bounded end-to-end canary pass. Keep asks, aggregates and individually evidenced sales distinct. No Terapeak/130point scraper is included. Follow [pricing readiness and rollback](../pricing/live-pricing-production-readiness.md).
3. **Database history:** the combined ledger is sixteen entries ahead of the frozen legacy reconciliation evidence (eight earlier entries, two binder and six pricing). The exact file assertion is updated without changing the historical evidence or opening global deployment. Do not use an unrestricted migration push to prepare this release.
4. **Recognition:** retain server-verified owner access, transient photographs unless explicitly saved, deletion controls and auto-accept/auto-add off. A local export does not replace phone testing or the protected real-capture holdout. See [recognition handoff](../local-recognition/27-next-testflight-readiness-20260906.md).
5. **Marketplace:** previewing Direct/Tracked choices is not implemented tracked fulfilment. Keep actual fulfilment and other existing commerce release locks disabled; no new payments, carrier enforcement, immutable fulfilment transitions or issue-ticket capability is asserted.

## Execution hold and device acceptance

Keep the assembled pull request draft/unmerged until its exact-head checks are reviewed. This readiness pass does not run EAS build/submit/update, publish OTA, deploy backend/gateway, dispatch staging/production jobs, apply hosted migrations, import catalogue rows or refresh provider prices.

When the next build is separately requested, use this reviewed source and the existing owner profile. After signing/installing it, verify Home on an actual iPhone, login/sign-out/account switching, private capture/save/delete, Scan navigation, binder language/quantity/image behaviour, safe-area/touch targets, refresh pending/error/stale states and evidence links against the enabled backend. Record actual results; do not convert preview or synthetic checks into native/live acceptance.
