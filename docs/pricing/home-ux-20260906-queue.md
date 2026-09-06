# Approved Home + live pricing: next TestFlight

Updated 6 September 2026 after the owner instructed: **include, then queue for TestFlight**. The approved Home is now integrated into the live-pricing source candidate, not merely attached as an unmerged source packet. This is a **local next-release queue**, not an EAS build job, OTA, Apple submission or live-pricing activation.

## Included

- Value-first Home, a measured 76px compact chart in an 80px unboxed chart area, signed GBP/percentage movement and direction arrow.
- One top-right refresh action, visible pricing coverage, inline history access and accessible Price details disclosure containing the single 7D/30D control.
- Search/Scan, collector goal, short card rail, concise On your radar rows, three recent activities before expansion and one Community entry. Original Stackr icons remain in use.
- English Home card/Chase List/activity captions with original foreign-language artwork and card identities retained. Missing English identification uses honest fallbacks.
- The approved quiet Home gradient, scoped through an opt-in backdrop variant; other screens are not restyled.
- Retained successful chase/activity rows when refresh fails, with account-change clearing preserved. Binder Retry calls the real collection loader.

## Pricing and native boundaries preserved

The visual changes were adapted into the pricing candidate's nullable totals, fresh/partial/stale/unavailable/empty states, known subtotals, warnings, cache and history. The earlier preview implementation did not replace the pricing data layer. Exact-variant refresh queuing, bounded background reads, owner-only access, source/evidence checks and Minty history gating remain intact.

No Home preview route, fixture module, synthetic prices or private-preview props were added to this candidate. Native Home remains `app/(tabs)/index.tsx` -> `features/home/HubScreen.tsx`, using real account data. Local browser QA fixtures exist only in ignored `.tmp` files and are not runtime imports.

App version **1.0.3**, production-owner profile, owner-only audience and runtime `1.0.3-owner-recognition-v1` remain unchanged. Native build numbers are not reserved or incremented. No credentials, API contracts, database migrations, provider flags or production records changed in this Home integration. Pricing activation still requires the separate [readiness gates](live-pricing-production-readiness.md).

## Exact integrated application and test files

Modified:

- `features/home/HubScreen.tsx`
- `components/ValueTrackerCard.tsx`
- `components/HomeCommandCenter.tsx`
- `components/StackrBackdrop.tsx`
- `package.json` — adds `test:home-release`; version/dependencies unchanged.
- `.github/workflows/platform-ci.yml` — runs the new Home regression suite.

Added:

- `components/HomeCollectorSections.tsx`
- `lib/homeDisplayLabels.ts`
- `lib/homeCardDisplayMetadata.ts`
- `scripts/test-home-display-labels.ts`
- `scripts/test-home-collector-sections.ts`
- `scripts/test-home-value-release-layout.ts`
- `scripts/test-home-release-integration.ts`

Release documentation and receipts are recorded beside this file. The shared `D:/Stackr-1` app/preview and unrelated worktree changes were not modified. Its Home handoff pointer was updated separately.

## Combined verification

- App and backend type checks pass.
- Standard lint passes with zero errors and ten pre-existing warnings; focused lint of changed Home files passes without warnings.
- `test:home-release`, `test:collection-pricing-ui`, `test:live-pricing`, `test:personal-pricing`, `test:poketrace-benchmark`, `test:mobile-runtime-config`, `test:stackr-api-v1` pass.
- Gateway passes 27/27; generated API contract and 37/37 route coverage pass. No gateway/backend code changed in this integration.
- Production-owner configuration validation and repository secret scan pass.
- Local iOS export and final browser QA receipts are recorded in the completion section below. A JavaScript/Hermes export is not a signed native build or a physical-device test.

## Completion receipt — 6 September 2026

The combined production-owner iOS export passed with 2,725 modules and 471 assets. Verified output: `.tmp/next-testflight-home-pricing-ios-20260906-verified`, Hermes bundle `entry-1040d663f64cb9c9ae95fa8a3831135f.hbc`. Source hashes, bundle SHA-256 and check results are in the [integrated release receipt](home-pricing-integrated-20260906-receipt.json). The exported bundle secret scan passed over 473 files. Expo emitted its existing Android-only `googleServicesFile` warning; the iOS export exited successfully.

Browser QA checked 393 x 852 and 430 x 932 using the actual extracted Home composition and integrated components with isolated local samples. Pricing details/range switching, Chase List, empty and error states, retained successful activity, header alignment and 44px compact controls were reviewed. A wrapped refresh icon was corrected and rechecked. The pricing-error Retry action now has an explicit accessible button role and a regression test.

This harness uses native-to-web adapters, a simulated safe area and neutral card-artwork placeholders, without the native tab bar or real account/API traffic. It is layout evidence, not physical-iPhone, provider coverage or live-pricing accuracy certification. The normal 4174/8097 user preview remains untouched.

## TestFlight acceptance still required

On a narrow and wider iPhone, check real-account Home load, chart fitting and 7D/30D switching, queued refresh and failure recovery, empty/unavailable/partial/stale pricing, binder/card/Search/Scan navigation, foreign artwork with English Home captions, safe area, large text, VoiceOver and haptics. No preview banner, sample records or loopback image request should appear.

Before a signed release, review the final combined commit/CI, perform normal native build/signing checks and preserve the pricing rollout gates. No remote branch push, EAS build, TestFlight upload, OTA or deployment was performed by this integration.

## Fallback and source traceability

The pre-integration pricing candidate is retained at commit `bb2a221` (with pricing code based on `e33855e`). The originally approved Home source remains frozen at `D:/Stackr-release-queue/home-20260906/source`; its [17-file manifest](home-ux-20260906-manifest.json) is historical snapshot evidence, not the integrated app manifest.

The pre-visual-change fallback at `D:/Stackr-fallbacks/before-home-value-priority-20260906/source` and the earlier full fallback at `D:/Stackr-fallbacks/before-ux-refresh-20260905` are untouched. Any recovery must compare subsequent changes and restore selectively after direction; never reset or clean the shared workspace.
