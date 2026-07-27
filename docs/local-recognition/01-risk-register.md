# Stackr Scanner Risk Register

Audit date: 2026-07-26

Scope: risks identified during Prompt 1 audit of the existing Stackr scanner. No production behaviour was changed.

| ID | Area | Severity | Evidence | Risk | Recommended next control |
| --- | --- | --- | --- | --- |
| R-001 | Native build/runtime | High | `app.json` uses `expo-camera`, `react-native-vision-camera`, ML Kit and ONNX plugins; `android/` exists; `expo-dev-client` is installed. | Scanner features can fail or appear not to load in Expo Go or stale dev clients. | Treat scanner testing as development-build/native-build only and document the required build target. |
| R-002 | Phone safe area/header | High | `ScanScreen` computes top controls as `insets.top + 110` for single-card scans, then centers the guide in the remaining height. | Header/status island and high guide content can overlap or become unclickable on phones. | Prompt 2 should adjust scanner safe-area layout and cycling guide frames without changing recognition. |
| R-003 | Auto frame performance | High | Auto checks call `takePictureAsync` repeatedly, then manipulate JPEG/base64. Localisation default sample FPS is 4. | Camera can feel slow, battery-heavy or fail under load, especially on lower-end devices. | Benchmark current timings, then migrate frame checks to a native/on-device pipeline after parity is measured. |
| R-004 | JavaScript image processing | High | `cardLocalisation`, `scanQuality` and OCR prep decode/crop/resize JPEGs through JS-visible base64 derivatives. | Slow recognition and UI jank under repeated auto scans. | Keep final photo URI capture, reduce JS decode frequency, and move repeated frame analysis native-side later. |
| R-005 | Remote photo egress | High | Recognition can call CardSight, Ximilar Edge Function and Anthropic fallback with scan image base64. | User photos can leave device/backend boundary without a clear scanner consent gate. | Add explicit consent and feature-flag gates before any remote recognition route that transmits user images. |
| R-006 | Cloud recognition dependency | High | `cardsightai`, Ximilar and Anthropic routes remain in fallback path. | Availability, cost, privacy and provider-confidence variability can affect scan results. | Keep cloud providers out of the future primary path and measure local/offline replacement before removal. |
| R-007 | Collector-number false positives | High | Local matcher and local-AI include safeguards, but several paths still rank/resolve candidates from provider and OCR evidence. | An isolated collector number can over-influence identity, especially when name/set/artwork evidence is weak. | Require corroborating evidence and one shared confirmation boundary for every route. |
| R-008 | Inventory callback acceptance | Medium | `ScanScreen` can call `scanStore.triggerCallback(base64Images[0], resolvedCard)` and return to inventory. | Inventory flows can consume a resolved card with less explicit review than the normal result screen. | Route callback results through the same confirmation/candidate-picker rules as the scan result screen. |
| R-009 | Full-frame fallback | Medium | Recognition variants include a resized full-frame fallback at width 1180. | Background clutter, fingers, binders or cases can dilute recognition and produce false candidates. | Prefer localised crop/guide crop and send full-frame only after explicit diagnostic fallback rules. |
| R-010 | Korean support gap | Medium | No `ko` support was found in app-level scanner language detection or TCGdex language config. | Korean cards cannot be identified reliably by the current scanner. | Add licensed Korean catalogue support and tests before claiming Korean scan support. |
| R-011 | Chinese language granularity | Medium | App-level OCR matcher returns `zh`; catalogue/search uses `zh-tw`; benchmark schema mentions `zh-Hans`/`zh-Hant`. | Simplified/traditional Chinese handling can be inconsistent. | Normalize language tags and add fixtures for `zh-Hans`, `zh-Hant` and `zh-tw`. |
| R-012 | English-only visual pack | Medium | Inspected scanner pack is `en-clip-base-v1` with English card metadata. | Visual-pack route may not provide equivalent Japanese/Chinese coverage. | Version separate multilingual packs and record model/catalogue/schema versions. |
| R-013 | Provider confidence normalization | Medium | Different routes return different confidence semantics and are normalized in `lib/cardSight.ts`. | Confidence values can be compared as if they are equivalent when they are not. | Convert provider scores into calibrated evidence fields before final confirmation. |
| R-014 | Stale scan types | Medium | `types/scan.ts` remains Ximilar-centric while current flow has local, Rare Candy, CardSight, Ximilar and Claude paths. | Type names can mislead future implementation and tests. | Update types in a later implementation phase after routing is stabilized. |
| R-015 | No camera E2E coverage | Medium | Test scripts cover pure logic, but no device camera E2E test was found. | Loading/layout/native-camera regressions may ship undetected. | Add development-build device smoke tests and safe-area screenshot checks. |
| R-016 | Backend CLIP cold start | Medium | Rare Candy/local-AI use `@huggingface/transformers` and model/vector loading. | First recognition can be slow or fail under memory pressure. | Add warmup, health checks and benchmark logging before tuning thresholds. |
| R-017 | Local index first load | Medium | `localCardIndex` pages `pokemon_cards` in batches and caches for seven days. | First scan after install/cache expiry can be slower than later scans. | Preload/index incrementally and log first-load latency separately. |
| R-018 | Raw training sample governance | Medium | Scanner rebuild schema includes `scanner_training_samples.storage_path`. | Future sample collection could accidentally store user photos without consent. | Keep training-sample ingestion explicit, consented and retention-limited. |
| R-019 | Result fallback without DB row | Low | `resolveMatches` can fall back to provider candidate objects if no local DB row resolves. | UI may show an identity that does not map cleanly to Stackr catalogue records. | Treat unresolved provider candidates as candidates requiring manual confirmation/search. |
| R-020 | Grading/recognition boundary | Low | `app/grade/index.tsx` and listing condition analysis call Ximilar grading paths. | Future scanner changes could accidentally mix identity recognition with condition grading. | Preserve a hard boundary: recognition identifies cards only, grading remains separate. |

## Exit Criteria Check

- Every current recognition route identified: met.
- Existing dependencies and versions recorded: met.
- Existing API and OCR calls mapped: met.
- Likely bottlenecks supported by code evidence: met.
- No application behaviour changed: met, docs-only changes.

## Next Recommended Prompt

Prompt 2 should fix the scanner phone safe-area/header layout and guide-window cycling while leaving recognition providers and data flow unchanged.

