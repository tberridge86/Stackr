# Card-first browsing UI candidate — 12 September 2026

## Scope and delivery status

User-authorised native UI implementation from main `10e1f4c64735102136e0d4c9d730e1f8ee829ea5`, continued in PR #187 on `agent/release/card-first-browse-ui`. Source changes are not installed-build acceptance. Concurrent retrieval #180/#184 and pricing #186 remain separate. No backend, database, entitlement, provider, image-source or pricing-owner changes are included.

## Implemented surfaces

- Set detail: one two-column card list; compact search/ownership controls; combined identity and owned-entry summary scrolls with the list. Finish/rarity/sort choices use the existing bottom sheet, not permanently stacked rows. Opening a set and Clear all select **All finishes**, preserving every loaded printing. Changing set resets that scope's filters; valid user-selected groups survive same-set refresh. The filter badge counts actual selections, not the existence of finish groups. No new classification, deduplication, card identity, quantity mutation, image resolver or pagination logic.
- Collection library: compact title/profile/reorder row and binder/scan/sort actions. Discover/Pokedex/duplicates shortcuts scroll with the real grid. Existing binder artwork, private ownership and drag ordering are retained. Sorting opens in a sheet.
- Binder detail: existing cover artwork and summary retained. Visibility, master-set, scan, refresh, chase and sort controls move into an options sheet. Owned first/Missing first remain sorting rather than being relabelled as filters. Secondary-modal actions wait for dismissal, ignore duplicate taps and clear on scope change/unmount.
- Search and Discover Sets: one compact toolbar; existing category/language choices remain in their sheets. Search's existing recent-search submit callback, loading indicator and showcase-specific placeholder are retained by the shared toolbar. Search source, permissions and result-selection paths are unchanged.
- Market: shared search/filter toolbar replaces the duplicate filter/sort/count/chip stack. The existing sheet contains sorting, layout and removable filters. Search suggestions, buy-mode chase restriction, seller gates and listing rendering remain unchanged.
- Home: real Collection activity precedes optional valuation. GBP pricing state, coverage, refresh callbacks and the existing StackR logo/wordmark are retained.
- Binder creation actions: reuse the same existing `StackrNavigationIcon` Collection glyph as the actual bottom navigation. This is not the generic book icon from generated mockups. Set detail, library, discovery, Home actions and the creation form use that source. Illustrated binder artwork is not replaced. The oversized two-layer bottom-tab halo is removed; navigation dimensions and safe-area calculations are retained.

## Counting ambiguity

The former set percentage divided owned catalogue entries by `printedTotal` without proving a common basis. This candidate labels published totals and owned/loaded catalogue entries separately and withholds that potentially misleading percentage. All finishes means all **loaded catalogue rows**, not proof that the source catalogue contains every official printing. Canonical membership/completion and the reported 86-versus-120 discrepancy remain separate data acceptance items.

## Exact validation evidence

The previous complete candidate `4ccfbb8a628fa30c6c835f6eaa7683ea883e4027` passed focused UI workflow 34677781638 and all seven ordinary Platform CI jobs in 34677781783. The conditional release-candidate job was skipped, not passed. Web export passed; no device was verified by these jobs.

Follow-up runtime commit `63b16a912563a0574290bb3abff20e380b7325f4` fixes the remaining forced finish-group default and preserves the Search submit/loading behaviours lost during toolbar consolidation. Five new regressions execute the actual screen state/reset/filter/badge/effect expressions and actual toolbar callbacks with controlled native dependencies. All five fail against the pre-fix source artifact (SHA256 `7b5128d9221d959e0db22fe4b305d0ce60b54b8cc7db2a2100e74cdb80a3174a`) and all five pass after correction. The existing 13 UI tests also pass locally. These 18 tests are not native layout, phone timing or provider-coverage measurements.

Workflow 34701852143 applied only the three exact before/after-hash-checked runtime outputs and required TypeScript, both UI suites, Home, binder-catalogue and personal-loading tests before pushing those source files. Final committed-source checks are recorded on PR #187 after this cleanup. Temporary transfer code and its write-enabled workflow are removed. The retained validation workflow is read-only and PR-triggered to avoid duplicate push/PR runs.

## Installed-build acceptance — outstanding

Record source commit, native version/build, received update ID, channel/runtime, device model, OS and text size. Use the existing owner release path and retain its protected-environment and exact-source safeguards. The inspected owner iOS workflow requires an exact reviewed main SHA; starting it on the previous main cannot include this PR. Submission and installation are separate from building.

Verify the real signed-in production-owner journeys for Home, Collection, Set detail, Binder detail, Search, Discover Sets, Market and Create Binder. Capture actual screen evidence, not generated mockups. Check initial card viewport, scroll-away summary, two-column image integrity, last-row/bottom inset, keyboard/large text, long translated names, all-finish defaults, selection and reset, exact quantities, custom/master/graded and read-only binders, native sheet dismissal, error/offline states and large-list pagination. Confirm recent-search submission still persists and the existing Collection icon appears at each creation entry point.

Do not claim the requested 60–65% browsing viewport, two complete rows, retrieval latency, TestFlight availability or installed success without the relevant observations. Release, device acceptance and any blocked access remain explicit; no new blanket approval requirement is introduced.
