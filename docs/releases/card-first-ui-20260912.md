# Card-first browsing UI candidate — 12 September 2026

## Scope and status

User-authorised native UI changes from main `10e1f4c64735102136e0d4c9d730e1f8ee829ea5`, isolated on `agent/release/card-first-browse-ui`, PR #187. Not merged, not a TestFlight/OTA publication and not installed-device acceptance. Concurrent retrieval #180/#184 and pricing #186 remain separate; no backend, database, entitlement, provider, image-source or pricing-owner changes are included.

## Implemented surfaces

- Set detail: one two-column card list; compact search/ownership controls; combined identity and owned-entry summary in the list header, which scrolls away. Finish/rarity/sort choices use the existing native bottom sheet rather than permanently occupying card space. No changes to card tiles, source resolution, card identity, quantity mutation or pagination.
- Collection library: compact title/profile/reorder row and binder/scan/sort actions. Discover/Pokedex/duplicates shortcuts scroll with the real grid. Existing binder artwork, private ownership and drag ordering stay intact. Sort options open in a sheet.
- Binder detail: existing cover artwork and summary preserved. Visibility, master-set, scan, refresh, chase and sort controls move into an options sheet. The original Owned first/Missing first behaviour is retained rather than falsely described as filtering or duplicates-only browsing. Actions that open another modal wait for dismissal, following the existing QuickActionSheet protocol; repeated taps are ignored and pending actions clear on scope change/unmount.
- Search and Discover Sets: one compact toolbar; all existing category/language choices remain accessible in their sheets. Search source, permissions and result-selection paths are unchanged.
- Market: shared search/filter toolbar replaces the duplicate filter/sort/count/chip stack. The existing sheet contains sorting, layout and removable filters; the buy-mode chase restriction, seller gates and listing rendering are unchanged.
- Home: real Collection activity precedes optional valuation detail. All GBP pricing state, coverage, refresh callbacks and the existing StackR logo/wordmark remain unchanged.
- Add/Create Binder: the existing `StackrNavigationIcon` Collection glyph is reused for set detail, library, discovery, Home actions and the creation form. Illustrational binder artwork is not replaced or redrawn. The oversized two-layer bottom-tab halo is removed; navigation dimensions and safe-area calculations are retained.

## Count discrepancy

The former set completion calculation divides owned catalogue entries by `printedTotal` when available. Those are not a proven common counting basis. This candidate labels the published total and owned/loaded catalogue entries separately and does not show a potentially misleading percentage. It does not claim to correct canonical set membership or infer base/secret/finish counts. Correct canonical completion remains a separate data acceptance item.

## Validation evidence and limits

Locally, 13 tests execute the actual shared component functions under mocked native primitives, check callbacks/accessibility/touch styles, inspect actual screen JSX structure and execute the extracted native-modal action queue; all passed. All changed TSX files parsed and git diff --check passed. These are not native rendering, phone timing or measured viewport claims.

Initial source `833f81b13e46e6529923596a2b9f35c8ed3efa0b` passed TypeScript and 12 focused tests in workflow run 34677322107. The Home suite then correctly failed on one remaining assertion requiring the old value-before-collection order. That assertion was updated to the requested collection-first order, not removed. All pricing, identity and account-isolation assertions remain. Runtime refinement `b233f84947e5b6c68c8ed23da4ca334c80ab16cc` adds native-modal dismissal sequencing and the 13th regression.

Final committed-source CI must be read from the PR. The retained Card-first UI validation workflow is read-only and requires TypeScript, all focused UI tests, existing Home/binder/personal-loading suites and scoped lint. All temporary source-transport files and write-enabled bootstrap workflows are removed from the final tree. No source patching occurs during final CI. A green CI run is not device delivery.

## Required installed-build evidence — still outstanding

Record exact commit/update ID, native version/build, channel/runtime, device model, OS and text size. Through the existing coordinated owner release path, capture Home, Collection, set detail, binder detail, Search, Discover Sets and Market on the real signed-in production-owner app. Verify compact initial viewport and scroll-away summary; two-column artwork integrity; long translated names; keyboard and large text; filter selection/reset; all binder entry points; back/swipe dismissal; private/read-only and custom/master/graded binders; ownership mutation and existing pricing-state indicators; offline/error states and large-list pagination. Check bottom inset and last-row visibility. Verify chase preview, quick actions, manual addition and scan open only after the options sheet dismisses.

No real-device performance improvement, 60–65% card viewport or two-complete-row result is certified by this candidate. Do not promote or declare finished without release-owner integration and that installed evidence.
