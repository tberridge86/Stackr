# Local readability, navigation and showcase repairs

Prepared on 19 October 2026 from `3b2ac6ba26a6636a8d9a2d6713edb1e6cab9732c` in the isolated `codex/stackr-readability-navigation-20261019` checkout. Destination: `D:/Stackr`, branch `codex/stackr-repair-consolidation-20261018`. This is local UI work. Publication and TestFlight remain held.

## Changes

- Binder fallback names are at least 16pt (17pt for the existing larger Japanese treatment), values 14pt, counts and captions 12pt. Text wraps and footers grow; grid columns, logos and collection calculations are unchanged. The shared secondary text colour is `#696373`: 5.2902:1 against the existing `#F7F3FF` value background (previously 4.3973:1).
- Recent-search selection and removal are sibling buttons with independent callbacks and 48pt targets. The spelling suggestion also has a 48pt target and an explicit label. Activity keeps its Market destination with the branded Market icon, “Open Market” label and 48pt target. The shared header accepts an optional `rightAccessibilityLabel`.
- Home card values use at least 14pt; the duplicate value qualifier uses 12pt, sentence case and opaque white text. Values wrap instead of shrinking or being truncated. The grail group reflows below binder artwork on narrow screens to fit the larger values. Market uses the existing 52pt primary button, retaining the original listing permission gate and destination.
- `resolveActiveStackrTab` reads active route names/indices from the existing navigation stack. Details retain their originating section; direct collector cards/products default to Search and sets/Pokémon to Collection. Discover Sets, Pokédex and CoroCoro select Collection. Seller results are always valid seller tabs, with Dashboard as the fallback. No route parameters, account data or persisted breadcrumbs were added.
- A route allowlist enables native edge-swipe for the ten requested browsing screens. Full-screen back gestures stay disabled; scanning, binder editing, listing/offer creation and other workflows retain their restrictions.
- The full-screen inspector uses the existing `CardInspectionStage`. Its 48pt horizontal and 60pt vertical padding are included in portrait/landscape fitting. Labels say “Lighting on/off/unavailable”, with plain catalogue/lighting disclosures and the existing finish information. Canonical artwork, full-image layering, identity/finish eligibility, motion preferences and haptic algorithms are unchanged.

## Verification

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed after correcting the new renderer test's mock host-element types. |
| `npm run lint` | Passed, 0 errors; 8 existing warnings in unchanged code. |
| `npm run test:navigation-context` | 128 checks passed: section origins, detail chains, direct links, popped/inactive routes, mode changes and gesture allowlist. |
| `npm run test:recent-search-controls` | Passed: two labelled sibling controls, separate 48pt targets, removal cannot dispatch selection. |
| `npm run test:card-inspection-stage` | 58 checks passed: 5 viewport shapes × 3 text scales, truthful states, full artwork selection, material failure and Reduce Motion eligibility. Native/material boundaries are mocked. |
| Existing inspection checks | Interaction contract, Home inspection and 30 lifecycle cases passed. |
| `npm run test:card-haptics` | Passed, including 37 motion cases and preference/dispatch checks. |
| `npm run test:home-release` | All four existing Home release suites passed. |
| `npm run build:web` | Isolated export passed: 10 JavaScript bundles and 101 static routes, using the temporary junction workaround below. |
| Browser component comparison | 375pt mobile and 1280pt desktop, long English/Japanese/Traditional Chinese names, complete/partial/stale/unavailable/saved/checking valuations and large values. No horizontal overflow in the six mobile binder fixtures, including emulated 150% text. |
| Keyboard/accessibility inspection | Separate focusable recent/remove controls; removal retains a visible 1px automatic focus outline. Observed targets: header 48×48, recent/remove height 48, remove 48×48, primary button height 52. VoiceOver remains pending. |

The signed-out exported app preserved Collection selection when opening Discover Sets, and a direct CoroCoro link selected Collection. Activity correctly retained its sign-in gate; its signed-in header was verified through the actual shared component fixture and source destination, not an authenticated browser journey. The isolated preview returned partial set data with its existing Retry message. These checks do not establish catalogue completeness or fix the separate video retrieval issues.

The initial isolated web export found no routes through the shared dependency junction. The retry uses temporary copies of the installed router's exact context modules beside the candidate app and a temporary local resolver mapping. It restores `metro.config.js` byte-for-byte and removes both context copies afterwards; none of this preview setup is part of the integrated app source.

The rounded icon family, functional icon mapping, `InteractiveCardPreview`, printing identity/material eligibility, material registry and haptic implementation match the baseline. No backend, catalogue, pricing, account access or release configuration was changed.

## Evidence and remaining acceptance

Evidence is retained under `D:/Stackr-organization/evidence/readability-navigation-20261019`:

- `comparison-desktop.jpg`, `comparison-mobile.jpg`, `comparison-mobile-large-text.jpg` and `keyboard-focus.jpg`.
- `scope-and-contrast.json`, the isolated build receipt and the local integration receipt.
- `render-preview.cjs` reproduces the actual footer JSX, shared controls and stage using synthetic binder states and a neutral card layout fixture. It is a presentation comparison, not installed-phone evidence or an authenticated data test.

The production material registry is empty in this candidate. Verified-lighting states were exercised with a test fixture only; no new material approval or physical-finish claim was introduced.

**Independent navigation review is pending.** Separate agents are prohibited in this side conversation, so the implementation and tests above are self-verification. The focused resolver/gesture diff is ready for an independent reviewer; this document does not claim that review occurred.

**iPhone acceptance is pending:** native edge-swipe, VoiceOver, device text scaling, physical haptics and detail-to-inspector transitions with real artwork. Local web previews cannot establish these results. Publication and TestFlight remain held.
