# CoroCoro device crash investigation

**Observed:** 12 October 2026 (owner report)

**Source reviewed:** `1356d4c` (`app frozen 018`), then the bounded native-window repair below.
**Scope:** the Discover-to-CoroCoro route, exact issue covers, and card-pocket loading only. This is not evidence for the unrelated set-logo, Discover-language or Pokédex reports.

## Reported journey

On the iPhone, opening the CoroCoro magazine library was reported to glitch or leave the app. The report did not identify the exact edition, control, iOS crash report, or whether the app was terminated, backgrounded for an external source page, or navigated back. Treating those as different outcomes is essential: a local source check cannot prove a native termination.

## What the current route does

`app/(tabs)/explore.tsx` navigates only to `/corocoro`. The initial route mounts
three publication cards, with one exact supplied Monthly cover and two explicit
placeholders. It does **not** mount the 34-issue archive on the reported first
tap. The route then:

- groups the checked local CoroCoro evidence into 34 exact publication/month issues;
- shows 26 exact issue covers from the existing offline bundle, and the existing placeholder for the remaining 8 issue slots;
- requests a card only after a detail issue is opened, for the exact mapped Japanese card ID; and
- exposes source links only on the selected issue detail, where an external source page intentionally leaves Stackr for the browser.

The source contains no unguarded remote magazine-cover import, generic date inference, card/cover substitution, or automatic card navigation.

## Confirmed initial-mount fault and bounded repair

React Native's installed `Libraries/Core/setUpGlobals.js` creates `global.window = global` when `window` is absent. That native object does not provide a browser `location`. On every issue-card mount, including the three cards at the first `/corocoro` route, `CorocoroIssueCover` read `window.location.hostname` whenever `window` existed. A native-like mounted reproduction with `window = {}` therefore failed before the library could draw with:

```
TypeError: Cannot read properties of undefined (reading 'hostname')
```

`components/CorocoroIssueCover.tsx` now supplies a hostname only on web and uses an optional `location` lookup. Native keeps the prior empty-hostname policy; web retains its hostname value when one exists. The change does not alter issue identity, source permissions, link targets, supplied-cover selection, pricing, or navigation.

## Bounded reproduction and evidence

| Check | Result | Limit |
| --- | --- | --- |
| Native-like RED reproduction | Fail before repair | The actual cover component mounted with React Native's `window` shape (`{}`) throws on `window.location.hostname`. |
| Native-like GREEN reproduction | Pass after repair | The same mounted cover and the actual default, Monthly and exact-detail route harness now complete. |
| `node --import tsx scripts/test-corocoro-mobile-delivery.ts` | Pass | The 26 offline covers, exact issue links and Discover navigation policy remain intact. |
| `npm run test:magazine-set-covers` | Pass | All 81 supplied cover assets match the reviewed metadata and exact/language-safe resolver policy. It does not make every asset a CoroCoro issue cover. |
| `node --import tsx scripts/test-corocoro-screen-runtime.ts` | Pass | React mounts the actual default route, the 32-issue Monthly grid, and the exact May 2001 issue using the real archive data and supplied-cover resolver. It proves the initial route selects 3 issue-cover components/1 local image; the Monthly selection selects 32 components/26 local images. Native navigation and image-decode behaviour remain unmeasured. |

An early post-repair `npm run test:mobile-recovery` attempt stopped earlier in `scripts/test-startup-reduce-motion.ts:137` on the shared startup-storyboard assertion. That historical interruption was outside the CoroCoro files and occurred before its CoroCoro checks; it is not evidence for or against this repair.

The monthly publication page currently uses a `ScrollView` and mounts its filtered issue tiles together. At most 26 existing bundled images are selected in its documented data set, but that page is not the initial `/corocoro` route named in the report. It remains a separate plausible native memory/render-pressure hypothesis, not a confirmed crash cause; the supplied cover files are approximately 446×650 pixels and no crash trace attributes a termination to them.

## Decision

The initial-mount exception is a confirmed source-level cause consistent with the reported first-tap exit, and the minimal environment guard is repaired locally. Removing covers, changing navigation, or virtualising the publication page remains unjustified because none is needed for this fault.

## Needed device proof

Record one short Build 55 attempt with the exact taps and result:

1. Discover Sets → CoroCoro magazine library.
2. Monthly CoroCoro → a supplied-cover issue (May 2001) → its card pocket.
3. Monthly CoroCoro → a placeholder issue (for example February 2022) → back.
4. If it leaves Stackr, note whether the tapped control was a **Source** link and capture the iOS/TestFlight crash entry if one exists.

That distinguishes whether the repaired native exception fully accounts for the physical symptom or whether a second problem remains in browser handoff, navigation, image decoding, or card fetch.

## Delivery state

Prepared and locally checked; no production change, native publication, or physical-device verification occurred. The source fault is fixed locally, but Build 55/next-build device verification is still required before claiming the reported iPhone exit is fixed. Existing partial cover coverage remains **26/34 documented issue slots in the app view**; the other 8 show the explicit no-cover placeholder. This is not whole-series cover completeness.
