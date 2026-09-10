# Build 34 reconciliation — 10 September 2026

The owner reports missing search results, artwork/logos, prices and earlier UI work in build 34. Inspection started from main `6f439fd9bcf31dc69adbf55e4ebe6c4785e77b1e`. It does not establish the source SHA or OTA identity running in the owner's installed build 34.

## Source reconciliation

PRs #147 and #151–154 include earlier data-loading, catalogue/search, image and haptic work. PR #163 includes the colour scheme, #164 startup recovery, #165 card haptics and #166 price cadence. Older dirty worktrees are therefore not evidence that all those changes were omitted; they have been preserved.

Five migrations recorded in production on 9 September were absent from main: `20260909132452`, `20260909133445`, `20260909133512`, `20260909133545`, and `20260909133639`. This patch restores their recorded statements, original versions and order. They include intermediate function revisions followed by the final service-only collector identity view. No migration was applied by this task. A database without this history must prepare these migrations before enabling the updated API.

## Findings and repairs

| Area | Evidence | Change or remaining gap |
| --- | --- | --- |
| Search IDs | Live `me2-125` returned no match. Production contains English `me02`, collector 125, Mega Charizard X ex. | Resolve dashed set/card references after exact external identifiers; apply explicit legacy Mega aliases only to English sets. Preserve provider finish precedence. |
| Collector search | Production has `api.catalogue_card_collectors`; the API still filtered an arbitrary limited card page for tolerant matches. | Connect the normalized identity view before card hydration, with language and selected-set filters. Restore its migration history. |
| Artwork fallback | Logs show printing-scoped manifest requests failing with SQL 57014 after approximately 8–12 seconds. A public request reproduced a downstream timeout. The existing bounded RPC returned for the same printing in approximately 194 ms of database execution, with no artwork available. | Request `assetType=card_image` from the client and use the bounded RPC for that explicit printing-scoped request. Preserve generic manifest semantics and pagination, including the 1,000-record boundary. This fixes a lookup path; it does not create missing artwork. |
| Palette | Main uses navy `#07145F` for text and feature panels beside purple `#6938F5`. | The initial charcoal proposal was superseded after owner feedback: use pale lilac feature panels, white cards, plum text and purple actions. See the [Japanese image and light-palette continuation](japanese-images-light-palette-20260910.md). |
| Bottom navigation | The mounted shell mixes raster symbols and sizes from 34 to 44 units. | Use native SVG icons on a common 24-unit grid, 1.8-unit stroke and 28-unit rendered size. Keep labels, selected state, routes, touch targets and haptics. |
| Marketplace | Responsive two-column listings and device-local favourites exist. No Market Movers section is mounted; local saves do not supply shared demand counts. | Improve listing-card surface definition. Shared demand counts and a populated Market Movers section remain unfinished functionality. |
| Logos | Repair workflow 34390566138 reports 138 repaired records and three failures, including source 404 responses. | Partial repair is confirmed. No complete-coverage claim. |
| Prices | The owner worker executes, but eligibility is restricted and automatic sweeps are capped. | No provider activation or pricing expansion here. A new native build alone cannot provide full price coverage. |

The running API was last deployed by workflow 34394911991 at source `178a37fe05e8b9999f3d7b71c7276ba58878a287`; its backend tree matches the inspected main before this patch. Worker watch paths skip unrelated mobile changes. A skipped worker deployment is not proof of a missing API release.

## Verification and delivery limits

- App and backend TypeScript checks pass.
- API v1 integration and focused search/language/finish tests pass. New cases cover compact/padded Mega IDs, provider precedence, foreign-language exclusion, normalized collector identities, empty artwork and maximum-size pagination.
- Home collector component regressions pass. Changed client files lint with zero errors and four existing array-style warnings in the domain adapter.
- Read-only production SQL confirms the existing collector view returns the expected variant and the image RPC exists. This is database evidence, not a deployed-patch or device test.
- Visual QA is incomplete: the cloud browser cannot reach the local preview, and the sparse checkout lacked raster assets for the ValueTracker layout test. No revised native screenshot is claimed.
- The frozen iOS workflow still selects `5bed24775b561d9b7733b9c243ad5fb986f3d118`, predating later palette/haptic/cadence merges. Its failed run does not establish build 34's contents, which may have been built through another route. Any new native release must select a verified reviewed source.

This is a reviewable source repair. Backend deployment, a new owner native build, installed-build identity and physical-device verification remain outstanding. Full pricing, artwork completeness, shared favourites/demand and Market Movers remain open.

Query review: [Supabase query optimization](https://supabase.com/docs/guides/database/query-optimization).
