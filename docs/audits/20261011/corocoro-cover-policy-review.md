# CoroCoro cover-policy repair review

**Review time:** 2026-10-11
**Frozen comparison:** `fcf697bab7785c3ed87747ed1721e9c033818557`
**Reviewed working-tree paths:** `lib/corocoroSuppliedCovers.ts`, `lib/corocoroCoverReferences.ts`, and `scripts/test-corocoro-mobile-delivery.ts` only.
**Scope:** source selection and policy controls for existing owner-supplied CoroCoro issue covers. No production request, deployment, native build, emulator, or installed-device rendering occurred.

## Decision

**Accept the scoped source repair.** It routes both the bundled issue-cover resolver and the development-only February 1997 preview through the existing fail-closed `getMagazineSetCoverForSet` policy. It does not alter card identity, magazine/card correlation, quantities, cover asset files, source-page links, remote image import behaviour, or presentation surfaces.

## What changed and why it is bounded

| Existing element | Frozen-baseline behaviour | Repair | Review result |
| --- | --- | --- | --- |
| `getCorocoroSuppliedCover` | Returned any matching `monthly:YYYY-MM` bundled cover unless its local `sourceEnabled` flag was false. The separate magazine-cover disable/denylist controls therefore did not govern this path. | Validates the exact monthly issue key and asks `getMagazineSetCoverForSet` for the matching Japanese CoroCoro issue before returning the existing `covers[issueId]()` source. | The shared policy requires one exact identity, Japanese language agreement, source enabled, and no exact-key denylist match. It fails closed for malformed/bessatsu IDs and keeps the existing `sourceEnabled: false` result. |
| `getCorocoroIssueCoverPresentation` local preview | In development web/localhost only, February 1997 directly returned a local HTTP preview image, bypassing the magazine-cover disable/denylist controls. | Uses the same resolver with the exact February 1997 Japanese issue ID and a local preview source callback. | The bypass remains constrained to the same local development context, but now returns no image whenever the shared source control denies that exact issue or all covers. No remote publisher/seller image is introduced. |
| `CorocoroIssueCover` regression coverage | Checked the 26 static source files and a few archive associations, but not the complete rendered component’s policy outcome. | Adds a small transpiled-component harness with actual CoroCoro resolvers, then checks allowed, both disable switches, both denylists, oversized denylist, unrelated denylist, and local-preview controls. | Meaningful source-selection coverage: the component selects its existing placeholder when policy denies the cover and keeps an allowed supplied cover visible. Native elements are fixtures, so this is not a rendering/device test. |

## Identity and source-control evidence

- The new supplied-cover input derives only `ja:magazine:corocoro-comic:YYYY-MM` from a strict `monthly:YYYY-MM` issue key. That matches the existing magazine metadata’s stable identifier; it cannot select a generic publication, date-only record, another language, another publication, or a guessed issue.
- `getMagazineSetCoverForSet` already rejects conflicting language/identity claims, ambiguous matches, disabled sources, the exact cover-key denylist, oversized denylist values, absent bundled sources, and unknown issues. The repair passes the original static bundled source callback only after those checks.
- The resolver returns only the existing bundled source. Its 26 `require(...)` statements, asset paths and `COROCORO_SUPPLIED_COVER_COUNT` are unchanged. The cover remains an issue cover; it is not supplied as card-face artwork or a seller image.
- The preview’s HTTP URL remains local-only behind the pre-existing `development && web && localhost/loopback` predicate. Passing it as the resolver callback means it receives the same source controls before it becomes a presentation image.

## Checks run

All commands were run against the reviewed working tree; all passed.

| Check | Result | What it establishes |
| --- | --- | --- |
| `node scripts/test-magazine-set-cover-pack.mjs` | Pass | All 81 reviewed supplied cover files and the owner-directed bounded-review metadata match. |
| `scripts/test-magazine-set-covers.ts` | Pass | Exact, language-safe, fail-closed issue matching plus disable/denylist behaviour in the shared resolver. |
| `scripts/test-magazine-set-cover-surfaces.ts` | Pass | Existing surfaces retain magazine-cover use as set art and do not replace card or seller imagery. |
| `scripts/test-corocoro-mobile-delivery.ts` | Pass | All 26 bundled CoroCoro covers resolve for production iOS fixture context; archive links, malformed-ID rejection, component policy cases and local-preview controls pass. |
| `scripts/test-corocoro-issue-archive.ts` | Pass | Exact Mew issue links, dates, source/distribution filters and archive counts remain intact. |
| `scripts/test-issue304-artwork-delivery.ts` | Pass | Existing CoroCoro cover/card-art separation remains intact. |
| `git diff --check` for the three reviewed paths | Pass | No patch whitespace errors. Line-ending notices were informational only. |

## Limits retained for release evidence

- This review did not build an iOS bundle. `corocoroSuppliedCovers.ts` now imports the existing magazine-cover resolver, whose normal default asset-resolver module is part of the static module graph. The changed function supplies its own 26-cover callback, but a native bundle/asset-manifest check is still needed to quantify route/bundle impact and prove the expected assets are present.
- The component harness proves resolver selection and placeholder selection, not React Native layout, accessibility output, image decode, offline behaviour, or installed-iPhone rendering.
- No source-rights conclusion, production activation, deployment, or all-issue cover-completeness conclusion follows from these tests.

## Handoff

The repair is safe to retain as a focused source-control correction. Before a native release claim, run the existing iOS bundle verification against the exact candidate build and perform an installed-iPhone check of one allowed supplied cover, one denied cover, and the placeholder state. Keep the original exact-issue and language constraints; do not turn the resolver into a general publication/date cover lookup.
