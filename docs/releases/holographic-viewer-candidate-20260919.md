# HOLOGRAPHIC VIEWER HANDOFF

Isolated implementation candidate, observed 19 September 2026. No merge, deployment, OTA, EAS/native build, TestFlight submission, remote database write, catalogue mutation, or production job was performed.

## Source

- Branch: `agent/release/holographic-inspection-20260919`
- Implementation commit: `c0b6d37f0e1c17424a74e937969f704a72c7dd49`
- Draft PR: https://github.com/tberridge86/Stackr/pull/209
- Base main: `989da7d489d4e127ac80a8798a1bf67367942954` (verified against GitHub before work and again before committing).
- Worktree: `D:\Stackr-holographic-inspection-20260919`. The original dirty `D:\Stackr-1` checkout was preserved.
- The PR head additionally contains this receipt. Its final full head SHA is recorded in the PR description and task handoff; the implementation commit above identifies the tested source and screenshots without a self-referential documentation hash.

## Existing architecture and audit

Stackr already used `InteractiveCardPreview` in card details and the binder detail modal, with Reanimated rotation input, touch movement, and an Expo gradient. `cardPreviewMotion` supplied bounded/wrapped motion helpers, and `lib/haptics.ts` centralized haptics. This candidate consolidates those into the same motion component, now mounted only by one reusable inspection provider/viewer. Existing haptic code remains unchanged.

The audit inspected 21 open PRs and related branches. No competing viewer/Skia/sensor implementation was found; older preview/haptic work was already on main. Open PRs #46/#47 touch the general haptic test, which is left unchanged. Pricing/retrieval work was not replayed or modified. Repository release and performance guidance was read before implementation.

Reference browser and source review, exact revisions, licences, and qualitative findings are in [the reference audit](../holographic-reference-audit.md). No source, texture, mask, or Pokémon artwork from those projects was incorporated. The procedural material is original. Skia's MIT notice was added.

## Interaction and rendering

Eligible Home cards, Search cards, binder grid/showcase cards, catalogue Market listings, card details, the Pokémon picker, and the binder add-card picker use a shared 400ms hold. Normal navigation/selection taps are retained. Accessible Inspect actions are supplied; card details also has a visible Inspect button. The viewer remains open after release and offers Close, Recenter, Card details, and existing binder Card actions as appropriate. Binder options use their existing dismissal protocol before presenting the viewer. The Home Chase modal keeps its existing selection behavior; its main Home rail provides inspection.

The provider keeps the current screen mounted and does not navigate or invalidate its data. It opens from the supplied image and metadata, triggers the existing haptic, and runs details/quick-action callbacks after the inspector unmounts. The viewer uses the cached Expo image first and overlays a higher-resolution image only after it has decoded. Home/Market eligibility requires exact canonical artwork matching. Binder inspection uses canonical raw artwork, never its saved capture fallback. Condition-photo requests are rejected at both entry and material boundaries.

The canonical scan remains the base layer. Native Skia renders one transparent procedural material layer over it, avoiding another download/decode of the scan. One SkSL program implements six modes. Up to four normalized include/exclude regions provide optional masks, tied to exact card, language, and variant identity. These are geometry masks; arbitrary detailed raster masks are not implemented in this candidate.

Reanimated's existing rotation sensor API is calibrated on opening and orientation changes. Bounded, smoothed sensor values combine with one-finger drag. The same shared values drive card perspective and shader light/pattern uniforms. There is no time-driven shimmer. Sensor/material children unmount on background, Reduce Motion, or close; animations are cancelled on disable/unmount. Web uses touch perspective and restrained neutral reflection, without WebGL or spectral parity claims.

## Fidelity matrix

| Profile | Visually implemented | Finish metadata wiring | Mask and current real-card behavior |
| --- | --- | --- | --- |
| Plain/non-holo | Yes; neutral reflection, no colour | Canonical normal/non-holo codes | Generic, no foil region |
| Vintage/cosmos | Yes; sparse fixed inclusions with light-dependent facets | Explicit cosmos codes supported; no verified real printing fixture available | Requires verified template/printing regions; currently neutral on actual cards |
| Reverse | Yes; inverse-region foil | Canonical reverse/reverse-holo codes | Requires verified exclusion geometry; currently neutral on actual cards |
| Modern diagonal | Yes; directional spectral bands and fine grooves | Canonical holo/line/diagonal codes; generic holo does not prove its physical pattern | Requires verified regions; currently neutral on actual cards |
| Textured/full-art | Yes; restrained engraved microtexture | Only explicit textured finish codes; full-art rarity alone is insufficient. Real printing coverage unverified | Generic full-card fallback for explicit finish; no actual embossed contour claim |
| Radiant/patterned | Yes; crossed facet pattern | Only explicit radiant finish codes; real printing coverage unverified | Generic full-card fallback for explicit finish |
| Unknown | Yes; same safe plain inspection | Missing, stale, conflicting, or unrecognized identity/finish | Generic neutral reflection; no rainbow |

All finish resolution reads Stackr's canonical variant payload and selected variant, never the name or rarity. Selected saved binder variants are preserved. The verified mask registry contains **zero real records**: no template or printing-specific accuracy is claimed. The available local catalogue pack was marked blocked and did not establish reliable real printing/mask evidence. Seven explicitly synthetic geometry fixtures exercise the material library; no real catalogue metadata was invented for the demo. The development UI study has no invented finish metadata and exercises the unknown/plain path.

## Verification

| Command/evidence | Result and scope |
| --- | --- |
| `npm run typecheck` | PASS, 0 TypeScript errors |
| `npm run lint` | PASS, 0 errors; 12 pre-existing warnings |
| Targeted ESLint on changed features/lib/test files | PASS, 0 errors |
| `npm run test:card-inspection` | PASS, 8 scripts, 0 failed: existing card/general haptics; motion 31/31; profiles 7 primary + 27 safety assertions; interaction and Home provenance/handlers; lifecycle 18/18; SkSL/pixels 25/25 |
| `node --import tsx scripts/test-binder-catalogue-presentation.ts` | PASS, existing saved-art/quantity/catalogue-total regressions |
| `node --import tsx scripts/test-binder-reopen.mjs` | PASS, 18 tests including real file-backed SQLite reopen/rollback; not Expo/device latency |
| `node --import tsx scripts/test-market-evidence.ts` | PASS, existing seller/sold/provider evidence semantics |
| `node --import ./scripts/enable-node-tooling-runtime.mjs --import tsx scripts/test-edition-aware-image-selection.ts` | PASS, existing edition selection |
| `node --import tsx scripts/test-home-collector-sections.ts` | PASS, existing Home component behavior with native boundaries mocked |
| `node --import tsx scripts/test-home-saved-collection.ts` | PASS, saved collection/account/loading regressions |
| `node --import tsx scripts/test-home-release-integration.ts` | PASS, existing Home integration guards |
| `npm run test:home-release` | PASS, 4 existing Home scripts, 0 failed (display labels, rendered components, value layout, release integration) |
| `node --import tsx scripts/test-card-foil-rendering.ts --write-fixtures` | PASS, actual SkSL compiled/rendered through Skia CPU/WASM; 25 cases |
| `git diff --check` | PASS |

React's test renderer prints a deprecation warning; native boundaries in lifecycle tests are mocked. Counts above distinguish named cases from source/handler assertion scripts. No executed candidate test is skipped. Earlier TypeScript narrowing/mock-boundary failures were fixed before the final passing run. The aggregate suite replaces the existing haptics-only invocation inside standard Platform CI, retaining those original tests. GitHub CI status is recorded separately in the PR; local results do not claim the release-candidate gate passed.

Browser verification used the actual Expo development app and its development-only original geometry study at `/dev/card-inspection`. Confirmed: persistent modal, close focus and restored trigger focus, repeated open, Recenter, drag gesture, details/action callbacks with retained counters, Close/Escape, and portrait/landscape layouts. The initial cold Metro compilation timed out; a bounded two-worker restart completed successfully. Browser logs include existing RN Web style/layout/accessible-attribute warnings. This was not a signed-in real binder/search device walkthrough or a timed long-press/haptic measurement.

## Performance and native implications

Measured here: zero inactive native-sensor mounts and zero inactive material mounts in lifecycle tests; one sensor mount when active; unmounts on background/Reduce Motion/close; preserved child identity/state; deterministic shader pixels and bounded material opacity. Closing does not initiate a list fetch in the tested provider lifecycle. No physical timing, frame-rate, GPU-memory, battery, or cold/warm list benchmark was measured. **60fps is a target, not an achieved result.**

Normal cards continue using their existing cached image components. Their new cost is event/provenance metadata; they instantiate no canvas or sensor. The former inline detail effects are consolidated into the inspector. No API route, catalogue lookup, pricing request, per-frame network call, or remote universal texture dependency was added. A higher-resolution image may use the existing asset cache/network policy after opening.

Added runtime dependency: `@shopify/react-native-skia` **2.2.12**, matching Expo SDK 54's bundled version. Development-only dependencies: React test renderer and its types **19.1.0**. Expo config, EAS config, and runtime version were not changed. A new compatible native binary is required for custom builds that do not contain Skia. Existing owner OTA/runtime compatibility must be reassessed with that future binary; this candidate must not be sent to the old binary as an assumed-compatible OTA. No build or delivery was triggered.

Source/CPU-WASM tests: **passed**. Web UI: **checked**. Native simulator: **not tested**. Physical iPhone/Android: **not tested**.

## Visual evidence

- [Portrait viewer](evidence/holographic-inspection-20260919/viewer-web-390x844.png): real web UI, original synthetic art, neutral web fallback.
- [Landscape viewer](evidence/holographic-inspection-20260919/viewer-web-844x390.png): same UI with readable side-by-side controls.
- [Returned screen state](evidence/holographic-inspection-20260919/returned-state-web-390x844.png): details/actions counters retained after dismissal.
- [Material contact sheet](evidence/holographic-inspection-20260919/material-contact-sheet.png): actual SkSL and resolver parameters through CPU/WASM, deliberately synthetic masks. Columns: plain, cosmos, reverse, diagonal, textured, radiant, unknown. Rows: tilt (-0.7,-0.4), neutral, tilt (0.7,0.4). This is not a native screenshot or real printing fidelity proof.

## Exact changed/added files

```text
.github/workflows/platform-ci.yml
app/_layout.tsx
app/(tabs)/search.tsx
app/binder/add-cards.tsx
app/card/[id].tsx
app/dev/card-inspection.tsx
app/pokemon/[id].tsx
components/CardFoilSurface.native.tsx
components/CardFoilSurface.tsx
components/CardFoilSurface.types.ts
components/CardInspectionProvider.tsx
components/CardInspectionViewer.tsx
components/HomeCollectorSections.tsx
components/HomeCommandCenter.tsx
components/InteractiveCardPreview.tsx
components/market/MarketComponents.tsx
components/search/SearchResults.tsx
data/fixtures/card-holo-profile.synthetic.json
docs/holographic-reference-audit.md
docs/releases/evidence/holographic-inspection-20260919/material-contact-sheet.png
docs/releases/evidence/holographic-inspection-20260919/README.txt
docs/releases/evidence/holographic-inspection-20260919/returned-state-web-390x844.png
docs/releases/evidence/holographic-inspection-20260919/viewer-web-390x844.png
docs/releases/evidence/holographic-inspection-20260919/viewer-web-844x390.png
docs/releases/holographic-viewer-candidate-20260919.md
features/binder/BinderDetailScreen.tsx
features/home/HubScreen.tsx
features/market/MarketTabScreen.tsx
lib/binderCataloguePresentation.ts
lib/cardFoilShader.ts
lib/cardHoloMaskRegistry.ts
lib/cardHoloProfile.ts
lib/cardInspection.ts
lib/cardPreviewMotion.ts
package-lock.json
package.json
scripts/test-card-foil-rendering.ts
scripts/test-card-holo-profile.ts
scripts/test-card-inspection-interactions.ts
scripts/test-card-inspection-lifecycle.ts
scripts/test-card-preview-motion.ts
scripts/test-home-card-inspection.ts
scripts/test-home-collector-sections.ts
THIRD_PARTY_NOTICES.md
```

## Remaining physical-device acceptance work

1. Obtain an explicitly authorized native candidate build containing Skia, with the correct source/runtime identity; install it on a supported phone.
2. Verify real sensor direction, neutral calibration, angle wrap, orientation changes, unavailable-sensor drag fallback, Reduce Motion, background/resume, repeated open/close, haptics, VoiceOver/TalkBack, and image upgrades on the installed binary.
3. Check real Home/Search/Binder/Market flows, including filter/scroll retention, ownership taps, options/quick-action sheet handoff, and unchanged condition photos.
4. Measure frame times, memory recovery and battery behavior; compare cold/warm list retrieval against the baseline. Native visual tuning/parity remains unaccepted until observed.
5. Before claiming accurate regional cosmos/reverse/diagonal effects, verify representative real printing/finish identities and masks. This does not block testing plain/generic behavior, but those regional effects remain deliberately neutral in the current runtime registry.

**CANDIDATE READY FOR DEVICE TEST**
