# Next TestFlight release: pricing inclusion queue

Prepared 6 September 2026 for the owner's next larger TestFlight release. This is a source-review queue, not an EAS build queue or a TestFlight upload.

## Release instruction

The owner requested: "push this for the next big release in testflight. dont uprevise the version - just have it queued and fully ready" and reported that the price tracker was disproportionately small.

- Queue branch `codex/live-pricing-evidence-ready-20260905` for the next release's review. Do not merge automatically, publish an OTA, start an EAS build, submit to Apple, or deploy the backend/database as part of queueing.
- Preserve app version **1.0.3**. `app.json`, `app.config.js` and `eas.json` are unchanged from main at `daad49f5f45eb5e124c732cd6d787de38bcf1545`. No local or remote build number is changed by this preparation.
- Retain the existing owner-only audience and production-owner profile. Its resolved runtime is `1.0.3-owner-recognition-v1`, distinct from the ordinary production runtime. Do not substitute the standard production OTA lane for this future native release.
- EAS already assigns native build numbers remotely when a build is actually requested. This preparation does not reserve or assign the next number. The existing build 25 receipt is historical evidence, not a new build or an assertion that its installed binary contains these changes.
- Do not fold unrelated dirty workspace changes or the separate owner-OTA workflow branch into this pricing candidate.

## Included changes

The candidate contains the evidence-preserving live-pricing path, authenticated manual refresh, bounded automatic refresh scheduling, exact-variant stored history, and owner-only pricing access. See [live-pricing readiness](live-pricing-production-readiness.md) for the detailed implementation and rollout order.

The Home tracker replaces the tiny fixed-size sparkline with a responsive chart beneath the value. It uses the actual available card width, retains a thin line and restrained fill, and keeps refresh/range controls available. Missing comparable history stays explicitly unavailable; resizing does not create sample prices, extra sales, or invented movement.

## Checks before including this candidate

- `npm run typecheck`, `npm run typecheck:backend`, `npm run lint`
- `npm run test:live-pricing`, `npm run test:personal-pricing`, `npm run test:collection-pricing-ui`, `npm run test:poketrace-benchmark`
- `npm run test:mobile-runtime-config`, `npm run test:stackr-api-v1`, `npm --prefix gateway test`, `npm run check:api-contract`
- Isolated pricing migration rehearsal and repository secret scan; no hosted database or provider refresh is needed for these tests.
- Production-owner configuration validation and a local iOS JavaScript export. An export is not an Apple-signed native build, installation, real-device visual approval, or live-data accuracy test.
- Review the pull request's CI results for the final commit. A queued draft does not mean CI has finished or every check has passed.

## Live activation remains a separate rollout step

Before this pricing path is enabled in the next build, finish the target-schema rehearsal, configure the same verified owner account on backend and gateway, deploy the six migrations and server controls in the documented order, and check a bounded real-data canary against actual individual sale evidence. Preserve existing provider controls and do not label an unverified estimate "Last sold".

No repeat permission-document request is part of this queue. Real-data evidence and a successful end-to-end canary are technical acceptance requirements, not an assertion that personal use has been declined.

## Local release-preparation receipt

All the local code checks listed above passed on 6 September. Gateway tests passed 27/27 and the generated contract covered 37/37 operations. Lint has zero errors and ten pre-existing warnings. The six-migration isolated PostgreSQL 17.5/18.3 rehearsal receipt is retained in the linked readiness document; no hosted migration was applied.

The actual `ValueTrackerCard` was rendered through React Native Web with Stackr fonts at 320px and 390px browser widths. A labelled synthetic fixture exercised long prices, range switching, refreshing and missing history. It caught and led to fixes for intrinsic-width overflow and cramped compact headers. Final measured 320px results: 288px card, 234px SVG, no horizontal page overflow. The long amount remains available in the accessibility label. Icons were substituted in this temporary harness; this is component layout evidence, not native/Home-screen or live-data approval. The existing user preview was not replaced.

The final production-owner iOS export completed: 2,722 modules, 471 assets, Hermes bundle `entry-87c765b6d7dda532ed7b9446b1492780.hbc`, SHA-256 `2041b66b2d24ade83c8aa30be813c52bef68db388b4c0977029e2f3ec852f8ef`. Local output: `D:\Stackr-live-pricing-ready-20260905\.tmp\next-testflight-pricing-ios-final`. Expo emitted an existing Android-only `googleServicesFile` warning; the iOS export exited successfully. Native compilation, signing, TestFlight submission and physical-device testing were not performed or claimed.
