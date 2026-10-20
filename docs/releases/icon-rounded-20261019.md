# Rounded Stackr icon family — 19 October 2026

## Result and delivery boundary

This presentation-only change refines the existing 22 SVG feature icons and
connects the remaining feature controls to the shared family. It uses the
existing SVG renderer, navy outline and purple accent, with no new dependency.
The work is local only: no web deployment, push, native release or TestFlight
submission is included.

Final implementation commit: `354a400348d4fc26b75053f7f91bc9fa987fcbb8`, following
`14da2b0e1b2d09b0e6cbc90e34e01c7a5a373a21`, based on
`6290c32b7352c52c2772af196ea70f552ec1b0ea`. The isolated source checkout is
`D:/Stackr-organization/previews/icon-rounded-20261019` on
`codex/stackr-icon-rounding-20261019`; integration targets the existing
`D:/Stackr` consolidation branch.

## Existing elements and adjustments

- All 22 icons share `STACKR_ICON_STROKE_WIDTH = 1.7`, the existing 24-unit grid,
  and round caps/joins. Both Duplicates cards now have 2-unit corner radii.
- Discover's three cards use matching rounded corners; Collection's inset panel,
  Scan's brackets/card, Search's magnifier, Home, Market, Trade and intake trays
  have coordinated corners or spacing. Perspective boxes, tags, stars and shields
  retain their recognisable silhouettes.
- Shared buttons, icon buttons and state blocks accept optional typed
  `stackrIcon`; it takes precedence over the existing font `icon`. Loading still
  takes precedence over either glyph. Legacy callers retain their old rendering.
- Scan actions, card inspection/collection actions, Duplicates search/empty
  states/listing actions, Notifications, Seller's Collector shortcut, valuation
  controls and feature tips now select the shared feature designs explicitly.
  The rendered-page pass also updated Home/Collection tips, Seller's stock-in/out
  tips and scanner, and the camera screen's manual card-search action.
- Existing navigation, hero/feature tiles, Collection, Discover, Pokédex and Search
  already use the shared component or its PNG-source compatibility wrapper, so
  they receive the same geometry and weight. The PNG registry is unchanged.

Layouts, interaction props, routes, data access, labels, touch targets, notification
badges, loading behaviour and semantic colours are preserved. Primary filled
buttons retain white icons. No pricing, identity, ownership, image-delivery or
catalogue logic changed.

## Coverage and retained symbols

The source pass checked Home's `HubScreen` and `HomeCommandCenter`, Discover's set/binder controls,
Collection's binder controls, Pokédex's compatibility-rendered icons and tips,
Search's `StackrCardActionIcon` references, Duplicates, persistent navigation,
headers, Scan, Notifications, Seller and pricing/listing controls.

Retained font glyphs have different roles: input magnifiers and navigation arrows;
close/filter/grid/list/edit/status controls; card/binder missing-artwork markers;
community post categories; admin diagnostics; camera/recentre controls; CoroCoro's
magazine-library symbol. These are not alternate drawings of the 22 branded
feature identities. Where a legacy `icon` remains alongside `stackrIcon` or an
`imageIcon` in a migrated control, the explicit branded selection wins.

Stackr logos, card and set artwork, avatars, achievements, protection-tier images,
content thumbnails and artwork fallbacks were not edited. No new dark theme was
introduced; the existing app remains light-only.

## Verification

- Final `npm run typecheck`: passed.
- Final `npm run lint`: passed, zero errors and the same eight pre-existing
  warnings in Search, quality observability, price helpers, Prices and foil UI.
- Final `npm run build:web`: passed. All 44 feature SVG paths are present in the
  export: 10 JavaScript bundles and 101 HTML routes. Final entry:
  `entry-4faa1cfa01973e7d7c0857e05f0151f9.js`. Source and bundle SHA-256 values are
  recorded in `export-check.json`.
- Source audit: 2,949 interaction/accessibility/layout/label attributes and 257
  button elements unchanged across the 19 affected TSX modules.
- One-off component checks: 49 cases passed for legacy rendering, branded
  precedence, light/dark colour branches, white primary icons, disabled/loading
  states, selection, action callbacks and state semantics. No test-suite files
  were added for the artwork changes.
- Browser preview: all 22 designs at 20/24/32/48 pixels (88 instances) use 1.7
  strokes; desktop 1120px and mobile 375px have no horizontal overflow. Actual
  shared button/state components were rendered with existing typography.
- Keyboard focus remained visible (`auto 1px`); rendered buttons retain 48px
  minimum targets, with the primary control 52px high. Notification-dot placement,
  disabled/selected/loading states, white controls and dark-surface contrast were
  inspected. Dark contrast is a component preview, not a shipped theme.

Evidence lives in `D:/Stackr-organization/evidence/icon-rounded-20261019`, including
`comparison-desktop.jpg`, `desktop-full.jpg`, `mobile-full.jpg`, the vector sheet,
source/control/browser checks and source-commit receipt. Comparison layouts are
  local previews; they are not authenticated app journeys or installed-phone proof.

The built app was also rendered on Home, Discover Sets, Collection, Pokédex,
Search and Duplicates at 1120px and 375px; screenshots and the exact entry identity
are recorded in `app-page-check.json`. Navigation and Collection shortcuts worked;
Duplicates search opened and closed successfully. All feature-family paths use
1.7 strokes. The other observed 1.5 strokes belong to preserved Korean flags.

The Duplicates page has an existing oversized decorative backdrop: document bounds
reach 941px while the body hides horizontal overflow and visible controls fit the
375px viewport. Layout props and backdrop artwork were not changed.

These app checks used a signed-out local browser. Some catalogue/ownership reads
were unavailable; populated signed-in states, camera interaction and installed
phone behaviour were not exercised. The empty Duplicates illustration was checked
through the actual shared state component; the signed-out page showed its existing
unavailable state. This change does not close any video retrieval or pricing issue.

## Final delivery receipt

`local-integration.json` records the target revision, clean branch check and exact
source matches against the verified export when the local integration succeeds.
Only the 19 icon-related TSX modules and this release note belong to the change.
Live web publication, native releases and TestFlight remain held.
