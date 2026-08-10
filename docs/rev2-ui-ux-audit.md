# StackR Rev 2 UI/UX Audit

Date: 2026-07-19

Scope: every visible app route, major subscreen, popup, modal, information box, and recurring UI pattern currently present in the StackR app. This is an audit and recommendation document only. It does not change app behaviour.

## Rev 2 Standard

The best current StackR screens have a clear visual language:

- Soft home-style backdrop, not a hard top colour band.
- Large but not space-hungry page titles.
- Purple as the primary action colour, used consistently.
- White cards with light lavender borders.
- StackR custom PNG icons instead of stock/system-looking icons where a brand icon exists.
- Compact, familiar controls: search, filters, sort, scan, chase, market actions.
- Bottom navigation with a selected lavender glow.
- Plain purple back arrow without a bulky hero button.
- Popups that feel like StackR, not default iOS sheets.

The main problem is not that the app lacks a style. It is that the style appears in several versions at once: older yellow warning blocks, oversized heroes, mixed button treatments, duplicated action names, and several custom modal layouts.

## Screen Inventory

### App Shell

- Root app shell: providers, bottom navigation, deferred latest features modal, global StackR popup provider.
- Persistent bottom navigation: Home, Collection, Scan, The Market, Search.
- Hidden tab routes: Community, Inventory/Seller Mode, Profile, Trade, Explore, Pokedex.
- Auth routes: login, callback, reset password.
- Utility redirects: root index, callback aliases, deep-link safety route.

Rev 2 notes:

- The shell already has the right idea with shared providers and hidden tab routes.
- The shell needs one formal rule for page top spacing, status bar spacing, and backdrop so pages cannot slip underneath phone indicators.
- Redirect routes should be kept for safety, but documented as compatibility shims.

### Home Hub

Primary route:

- Home dashboard / Hub.

Subscreens and interactions:

- Collection value card.
- Minty Insight preview and full insight view.
- Scan Card action.
- Search action.
- Build Trade action.
- Community entry row.
- Continue Binder section.
- Opportunities list.
- Recent activity list.
- Chase sheet.
- Minty settings.
- Role selection.
- Feedback / bug report prompt.
- Home menu and notification/profile shortcuts.

Rev 2 notes:

- Home is the current benchmark for backdrop and page feel.
- Minty Insight is one of the strongest brand moments and should be reused wherever insights appear.
- The home popup is a good content structure, but the visual shell should be shared with all feature tips.

### Collection

Primary route:

- Collection Vault / Binder Cards library.

Subscreens and interactions:

- Binder grid.
- Scan Card CTA.
- New binder.
- Sort.
- Discover Sets.
- Pokedex.
- Duplicates.
- Binder card menus.
- Binder artwork cards.
- Progress, value, and owned counts.

Rev 2 notes:

- The Collection Vault hero still needs tighter vertical economy.
- "Scan Card" should match the same scan button treatment used throughout the app.
- Sort should be a white, non-gradient control.
- The three shortcut tiles should use quiet action styling, not a second hero language.
- Binder card artwork and logos should use standard sizes.

### Binder Detail

Primary route:

- Binder detail by binder ID.

Subscreens and interactions:

- Binder hero.
- Binder stats.
- Scan to Binder.
- Master set toggle.
- Public/private toggle.
- Missing, Duplicates, Chase counters.
- Binder card grid.
- Sort sheet.
- Add manually.
- Add card modal.
- Add filters.
- Card detail view.
- Quantity controls.
- Graded slab detail where binder is graded.
- Chase card controls.
- Remove from binder.

Rev 2 notes:

- This is the clearest example of the current space problem.
- Large top ribbons reduce useful scroll space and can hide content under the status area.
- Master set and public/private controls should use equal box sizes, equal typography, and aligned toggles.
- Graded binders do not need master set controls.
- Graded binder hero should be compact: binder name, stats, graded icon, public/private and scan on one tight row where possible.
- The back arrow should be a plain purple arrow.

### Sets And Products

Primary routes:

- Set detail.
- Product detail.
- Sealed product detail.
- Japanese catalogue/admin routes.

Subscreens and interactions:

- Set hero.
- Set card grid.
- Variant and quantity modal.
- Product listing details.
- Market guide.
- Price refresh.
- Japanese set/product lookup.
- Admin catalogue import tools.

Rev 2 notes:

- Set details need reliable total card counts so progress does not show 100 percent when totals are missing.
- Product images need corrupt-image fallback states.
- Japanese product titles and set names need standard line handling because they can be longer than English names.

### Pokedex

Primary route:

- Pokedex.

Subscreens and interactions:

- Search.
- Region filters.
- Masterset progress.
- Pokemon grid.
- Pokemon detail route.
- Owned status.
- Card list by Pokemon.

Rev 2 notes:

- The Pokedex is visually strong but the top section is too tall.
- Region filters should become a compact horizontal rail.
- Masterset progress should collapse or shrink once the user scrolls.
- Pokemon cards should keep fixed image/title/number dimensions so the grid feels calm.

### Duplicates

Primary route:

- Duplicates.

Subscreens and interactions:

- Summary stats.
- Sort.
- Grid/list toggle.
- Duplicate card rows.
- Detail modal.
- Sort sheet.
- Remove/reduce quantity actions.

Rev 2 notes:

- This screen has a clear job and should stay dense.
- Long values should use two-line-safe layouts rather than truncating core details.
- Sort and view toggles should match Collection/Market controls.

### Scan

Primary routes:

- Scan.
- Scan result.
- Scan diagnostics.
- Legacy scan/camera redirects.
- Card camera route.

Subscreens and interactions:

- Camera preview.
- Auto-detect mode.
- Manual capture mode.
- Permission diagnostic.
- Recognition results.
- Match selection.
- Incorrect match feedback.
- Add to binder.
- Add to chase.
- Retry flow.

Rev 2 notes:

- Camera UI can stay dark and immersive, but overlays should use StackR controls.
- Auto-detect should advise: move closer, align card, hold steady, too dark, glare detected, card found.
- Manual mode should be a visible toggle, not a hidden fallback.
- Scan result hero should stay compact. The old yellow "Select match" chip should not return.
- Back-stack behaviour should exit scan cleanly after repeated attempts.

### Search

Primary route:

- Search.

Subscreens and interactions:

- Search input.
- Category filters.
- Recent searches.
- Card results.
- Set results.
- Sealed results.
- Graded slab results.
- Listing results.
- Collector results.
- Filter sheet.
- Showcase/profile update actions.
- Product/category deep links.

Rev 2 notes:

- The screen is close, but empty/search-start states should be shorter.
- Recent-search chips should have consistent height and text handling.
- Search should not expose old favourite language except for favorited Market listings.
- Search detail cards should avoid big top blank areas.

### Market

Primary route:

- The Market.

Subscreens and interactions:

- Buy/Trade segmented mode.
- Search.
- Category chips: raw, graded, sealed, accessories, etc.
- Listings feed.
- Listing detail.
- Create listing floating action.
- Favorites/favorited listings.
- Offers.
- My Listings.
- Filters.
- Sort.
- Report/hide/block actions.
- Mark unavailable.
- Product detail from listing.
- Buyer/seller badges.
- Protection badges.

Rev 2 notes:

- Market needs the deepest visual polish after binder/scan.
- The top area can be more compact.
- Filter sheets should use compact chips and segmented controls rather than long full-width text boxes.
- Listing cards need a tighter hierarchy: image, title, set/product meta, price, seller, actions.
- Save/favorite behaviour needs one name: "Favorited listing".
- Users should not be able to favorite/save their own listings.
- Yellow warning blocks around listings should become StackR info/warning panels.

### Listing Creation

Primary route:

- Create Listing.

Subscreens and interactions:

- Product/category selection.
- Identification.
- Manual entry.
- Condition.
- Value.
- Protection.
- Evidence/photos.
- Camera capture overlays.
- AI/condition guidance.
- Gold verification.
- Details.
- Review.
- Success.
- Draft discard prompt.
- Condition guide modal.
- Delivery picker.
- Guided listing camera modal.

Rev 2 notes:

- The flow should prioritise usable space above the keyboard.
- Header copy should remain one line: "Identify your card and build a trusted listing."
- Step chips should be horizontally scrollable, smaller, and consistent.
- The footer above the keyboard should sit close to the keyboard with minimal dead space.
- Protection tiers should use the gold/silver/bronze brand icons, not stock shields.
- Camera surface photos should enable light automatically where supported.
- Every evidence tier should explain only the next required capture, not all rules at once.

### Offers And Trades

Primary routes:

- Offers inbox.
- Offer detail.
- New offer.
- Offer review.
- Orders.
- Trade redirect routes.

Subscreens and interactions:

- Incoming/outgoing offers.
- Cash offer.
- Card offer.
- Counter offer.
- Accept/decline/withdraw.
- Sent/received milestones.
- Dispute.
- Review.
- Trade card picker from own collection.

Rev 2 notes:

- Trade creation must list everything the user owns.
- "Mark for Trade" should be removed from card detail flows if trade setup is not part of the current product direction.
- Chases should use the new chase logo and one action label only.
- Offer actions should use standard confirmation popups.

### Community

Primary route:

- Community.

Subscreens and interactions:

- Social.
- Flex.
- Trades.
- Local.
- News.
- Collector profile.
- Shop modal.
- Card picker modal.
- Flex picker modal.
- Meetup modal.
- Create/join meetup.
- Report/block/hide prompts.

Rev 2 notes:

- Community has some older card treatment around yellow rarity labels and old action icons.
- The top bar is invasive on feed content.
- Feed cards should feel immersive but not oversized.
- Long prompt chips should become compact suggestion pills.
- News copy needs tighter handling so long posts do not dominate the first view.

### Profile

Primary route:

- Profile.

Subscreens and interactions:

- Profile hero.
- Identity setup modal.
- Avatar/photo picker.
- Level and XP.
- Team badge.
- Stats.
- Showcase.
- Collector Journey.
- Achievements.
- Coin Shop.
- Settings.
- Logout prompt.

Rev 2 notes:

- "Favorite card" language should be reconsidered outside Market saved listings.
- Showcase slots can be renamed around StackR language: Featured Card, Chase Card, Grail, Featured Slab.
- The profile hero is strong but could be more compact for smaller screens.
- Achievement badges need consistent icon sizing and locked/unlocked states.

### Seller Mode / Inventory

Primary routes:

- Inventory.
- Seller home.
- Seller onboarding.
- Seller orders.

Subscreens and interactions:

- Stock in.
- Stock out.
- Stock product detail.
- Sale modal.
- Pending stock-out modal.
- Stripe onboarding.
- Seller order tracking.

Rev 2 notes:

- Seller Mode should feel more operational and less decorative.
- Empty states should be compact.
- Product stock modals should use the same bottom-sheet layout as Market and Collection.

### Price Tools

Primary routes:

- Value History.
- Price Builder.
- Prices.

Subscreens and interactions:

- Collection history.
- General market risers/fallers.
- Owned risers/fallers.
- Price search.
- Price card detail modal.
- Minty market read.
- PokeTrace live sold comps.
- Cached daily prices.
- Price movement.

Rev 2 notes:

- This area has useful depth but can confuse users with repeated price panels.
- Distinguish clearly between live sold comps, backup lookup, cached daily prices, and marketplace list price.
- Pricing cards must allow long values without clipping.
- Minty should include mascot PNG wherever he speaks.

### Admin / Support / Diagnostics

Primary routes:

- Japanese catalogue admin.
- Social content admin.
- Scan diagnostics.
- Grade diagnostics.
- Splash preview.
- Modal demo.

Rev 2 notes:

- These routes can be plainer, but still need safe spacing and StackR backdrop.
- Admin pages should not leak into normal user navigation.
- Diagnostics should use a dark technical panel only when needed.

### Legacy And Compatibility Routes

Routes that appear to exist mainly to preserve older links or move users to new destinations:

- Collection alias.
- Binder alias.
- Binder legacy.
- Marketplace / Market Place alias.
- Listing index/camera aliases.
- Trade aliases.
- Community alias.
- Search alias.
- Camera alias.
- Deep-link safety route.

Recommendation:

- Keep them if existing links depend on them.
- Make each route a tiny redirect only.
- Hide them from navigation and future design work.
- Add a route map comment/doc so they are not mistaken for active screens.

## Popups, Modals, And Information Boxes

### Shared Popup System

StackR already wraps standard app alerts through `StackrPopupProvider`, so most `Alert.alert(...)` calls become themed. This is good and should stay.

Current shared popup behaviour:

- Queues one popup at a time.
- Chooses tone from message/buttons.
- Uses StackR card styling.
- Supports destructive, cancel, and primary actions.

Recommended changes:

- Use StackR PNG icons instead of generic icon fonts where a brand icon exists.
- Add standard popup sizes: compact confirmation, action sheet, feature explanation, destructive confirmation.
- Avoid using `Alert.alert` for multi-action quick menus. Use a StackR quick-action sheet instead.

### Feature Tips With "Don't Show This Again"

Known feature-tip scenarios:

- Home: Welcome to the Hub.
- Collection: Collection destination intro.
- Pokedex: Pokedex collection intro.
- Community: Social intro.
- Seller Mode / Inventory: Seller Mode intro.
- Price Builder: Price Builder intro.

Recommended changes:

- Use one shared Feature Tip shell with consistent icon size, close button, CTA, and toggle.
- Make copy shorter and action-led.
- Limit feature tips to high-value first-run education only.
- Store dismissal under stable keys, but version keys only when content materially changes.

### Other Recurring Modals

Home:

- Minty insight modal.
- Role modal.
- Chase sheet.
- Feedback and bug prompts.

Collection/Binder:

- Master set intro.
- Binder card detail.
- Add manually.
- Add card filters.
- Quick action sheet.
- Graded card add modal.
- Remove/reduce quantity confirmations.

Market/Search:

- Market listing detail.
- Market filters.
- Listing actions.
- Search filters.
- Profile/showcase selection prompts.

Listing:

- Guided camera.
- Condition guide.
- Delivery picker.
- Draft discard.
- Protection/evidence instructions.

Community:

- Collector profile preview.
- Shop detail.
- Card picker.
- Flex picker.
- Meetup creator.

Profile:

- Identity setup.
- Profile image access.
- Showcase slot action.
- Logout confirmation.

Inventory/Seller:

- Stock product modal.
- Stock-out picker.
- Pending stock-out.
- Sale capture.
- Seller onboarding errors.

Price/Set:

- Price card detail.
- Set quantity modal.
- Slab conversion.
- Latest features modal.

Recommended modal standard:

- Use bottom sheets for filters, sort, quick actions, pickers, and short forms.
- Use centered popups for confirmations and feature education.
- Use full-screen modals only for camera, complex creation flows, and profile setup.
- Use the same close/back affordance everywhere.

## Core UX Recommendations

### Priority 0: Fix The Space And Safety Problems

- Standardise top safe-area spacing across every page using Home as the visual standard.
- Remove hard top bands and oversized blank headers.
- Make all back arrows a plain purple arrow.
- Compact Binder Detail, Graded Binder, Market, Pokedex, Search, and Create Listing headers.
- Stop content from sliding behind the status bar or bottom nav.
- Ensure all prices, names, labels, and grades fit inside their boxes.

### Priority 1: Standardise Controls

- One primary CTA style for scan actions.
- One secondary button style for sort/filter/view/listing actions.
- One selected-tab glow style.
- One toggle style and one toggle label style.
- One bottom-sheet style.
- One popup style.
- One icon sizing scale.

### Priority 2: Remove Old StackR Language

- Replace "Set as Favourite" outside Market favorited listings.
- Use "Add to Chase" or "Remove from Chase" once, not duplicate chase actions.
- Remove "Mark for Trade" from card pages where trade is not the active action.
- Replace stock shield/protection icons with gold/silver/bronze StackR icons.
- Replace old yellow callouts with StackR lavender/neutral info panels unless there is a real warning.

### Priority 3: Simplify Main Journeys

- Scan journey: open camera, guide capture, show likely matches, let user correct, add to binder/chase/listing.
- Collection journey: choose binder, scan/add, review missing/duplicates/chase, manage cards.
- Market journey: browse, filter, open listing, offer/buy/favorite, create listing.
- Listing journey: identify, condition, value, protection, photos, review.
- Community journey: view feed, flex card, join local, read news.

### Priority 4: Make Data States Clear

- Pricing should label source clearly:
  - Live sold comps.
  - Backup lookup.
  - Cached daily prices.
  - User listing price.
  - Estimated value.
- Missing data should never look like success.
- Product totals should be unknown/needs sync rather than 100 percent complete.
- Corrupt images should show StackR fallback artwork.

## Screen-By-Screen Simplification Ideas

Home:

- Keep as benchmark.
- Make Minty Insight expandable to full message.
- Keep primary action hierarchy: Scan first, Search/Trade secondary, Community row.

Collection:

- Make header shorter.
- Keep Scan Card and Sort aligned.
- Use quiet cards for Discover Sets, Pokedex, Duplicates.

Binder Detail:

- Collapse the hero on scroll.
- Put scan and visibility controls in one compact band.
- For graded binders, remove master set entirely and show a small graded icon near stats.

Pokedex:

- Reduce header copy.
- Make region rail smaller.
- Let masterset progress collapse after scroll.

Market:

- Replace long filter buttons with compact segmented controls and chips.
- Make Favorites/Offers/My Listings smaller quick links.
- Hide favorite/save on own listings.
- Keep Create Listing floating but away from listing content.

Create Listing:

- Keep the one-line header.
- Shrink step chips.
- Anchor footer close to keyboard.
- Use clear next-step copy only.

Scan Result:

- Remove decorative chips that do not guide action.
- Show confidence and match quality plainly.
- Add "This match is not correct" feedback as a learning action.

Card Detail:

- Remove old favourite/trade actions.
- Keep Market Guide, Add to Chase, Add to Binder/List, and listing actions.
- Compact the top image/header area.

Community:

- Reduce feed header height.
- Use consistent card preview components.
- Replace long question chips with shorter prompts.

Profile:

- Rename favourite/showcase wording to match the new product language.
- Keep stats compact and consistent.

Seller Mode:

- Make it work-focused: stock, orders, revenue, issues.
- Reduce decorative space.

## Proposed Implementation Phases

### Phase 1: Shared UI Rules

- Create/lock shared components for:
  - Page header.
  - Back arrow.
  - Primary CTA.
  - Secondary action.
  - Segmented control.
  - Filter/sort sheet.
  - Feature tip popup.
  - Quick action sheet.
  - Empty state.
  - Price panel.
- Do not change logic in this phase.

### Phase 2: High-Impact Screen Pass

- Binder Detail.
- Graded Binder.
- Market.
- Create Listing.
- Scan Result.
- Pokedex.

Goal: reclaim vertical space and make controls feel familiar.

### Phase 3: Popup And Modal Pass

- Convert quick menus away from default alert style.
- Standardise all first-run tips.
- Standardise all filters/sort sheets.
- Standardise destructive confirmations.

Goal: every popup feels like StackR.

### Phase 4: Language And Icon Cleanup

- Remove old favourites/trade wording where not intended.
- Replace stock icons.
- Standardise chase logo usage.
- Standardise protection icons.
- Standardise Minty mascot usage.

Goal: one product language.

### Phase 5: Data And State Clarity

- Fix missing totals and misleading 100 percent completion.
- Fix price source labels.
- Fix image fallback states.
- Fix long price/name/grade clipping.

Goal: the app feels trustworthy.

### Phase 6: Legacy Route And Asset Tidy

- Document active routes vs redirects.
- Keep redirects but remove duplicated UI.
- Move active assets into clear Rev 2 folders.
- Leave old assets archived until no active imports remain.

Goal: cleaner structure without breaking continuity.

## Final Recommendation

The next best round of work is not a redesign. It is a standardisation pass.

The app already has a strong identity. The biggest UX win is to make every screen obey the same spacing, button, popup, icon, and copy rules. That will make StackR feel faster, calmer, and more premium without risking the core features.
