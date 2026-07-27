# StackR Rev 2 UI/UX Implementation Prompt Pack

Date: 2026-07-19

Use these prompts in order. They are chunked so each pass is small enough to review, but together they cover the full Rev 2 UI/UX audit.

Each prompt has the same non-negotiable rule:

Do not remove, rewrite, or change existing app features unless the prompt specifically asks for it. Preserve functionality and data flow. Make visual/UI changes only inside the requested scope. Prefer shared StackR components and tokens over one-off styling.

## Recommended Running Order

1. Foundation prompts.
2. High-impact screens.
3. Core flows.
4. Supporting screens.
5. Cleanup and QA.

If only a few can be done first, run prompts 1, 2, 3, 4, 8, 10, 11, and 14.

---

## Prompt 1: Rev 2 Baseline And Visual Guardrails

Audit the existing StackR Rev 2 visual system and create a short implementation baseline before editing UI.

Scope:

- Identify existing shared components for screen layout, backdrop, page headers, back arrows, buttons, cards, sheets, popups, toggles, icon sizing, empty states, and price panels.
- Identify any older components or inline styles that compete with Rev 2 styling.
- Do not change app behaviour.
- Do not delete assets.

Deliverables:

- Create or update a short doc listing the Rev 2 components/tokens that should be reused.
- List the top 10 duplicated UI patterns that should be consolidated.
- Recommend the safest first components to standardise.

Acceptance criteria:

- No feature behaviour changes.
- No visual changes unless documentation-only.
- Clear next implementation targets.

---

## Prompt 2: Shared Page Backdrop, Safe Area, And Back Arrow

Standardise the page backdrop and top spacing across StackR using the Home page as the visual reference.

Scope:

- Use the Home page backdrop style as the baseline for normal pages.
- Remove invasive top colour bars and oversized blank header spaces where they are caused by page wrappers.
- Standardise all back arrows to a plain purple arrow without a large hero/card container, unless a camera/fullscreen route deliberately needs a different treatment.
- Ensure page content does not sit underneath phone status icons.
- Preserve every screen's existing content and navigation.

Screens to include first:

- Binder detail.
- Card detail.
- Product detail.
- Set detail.
- Market.
- Search.
- Pokedex.
- Community.
- Value History.
- Create Listing.

Acceptance criteria:

- Pages keep the same content and features.
- Top content no longer clashes with phone status icons.
- Back arrows use one consistent purple treatment.
- No page loses useful visible content.

---

## Prompt 3: Shared Button And CTA System

Standardise StackR buttons so repeated actions feel familiar across the app.

Scope:

- Create or refine shared button variants:
  - Primary purple CTA.
  - Scan CTA.
  - Secondary white/lavender outline.
  - Quiet pill/action chip.
  - Destructive action.
  - Disabled action.
- Make "Scan Card", "Scan to Binder", and listing camera buttons visually related.
- Remove gradient fill from sort/filter utility buttons.
- Keep gradient only for true primary CTAs where Rev 2 already uses it intentionally.
- Preserve text, behaviour, press actions, and routing.

Priority screens:

- Collection Vault.
- Binder Detail.
- Graded Binder.
- Market.
- Create Listing.
- Search.

Acceptance criteria:

- Same action type looks the same across screens.
- Sort/filter buttons are white or quiet controls, not hero-gradient buttons.
- No feature action disappears.

---

## Prompt 4: Shared Popup, Modal, Bottom Sheet, And Feature Tip System

Standardise all StackR popups and information boxes.

Scope:

- Review `StackrPopupProvider`, `FeatureTipModal`, filter sheets, quick action sheets, and custom modals.
- Define a shared modal system:
  - Center popup for confirmations and feature education.
  - Bottom sheet for filters, sort, quick actions, pickers, and short forms.
  - Fullscreen modal only for camera and complex flows.
- Convert the most obvious custom quick-action `Alert.alert` menus into StackR quick-action sheets.
- Keep "Don't show this again" behaviour where it already exists.
- Make feature tips more compact and visually StackR.

Include:

- Home "Welcome to the Hub".
- Collection intro.
- Pokedex intro.
- Community intro.
- Seller Mode intro.
- Price Builder intro.
- Latest features modal.

Acceptance criteria:

- Popups feel like one StackR system.
- "Don't show this again" still works.
- Existing confirmations still fire correct actions.
- No default-looking iOS action sheets remain in the targeted areas.

---

## Prompt 5: Icon And Product Language Cleanup

Remove old StackR language and replace older icons with current Rev 2 brand icons.

Scope:

- Replace old favourite language outside Market favorited listings.
- Keep Market "Favorited listings" if that is the intended saved-listing concept.
- Remove "Set as Favourite" from card detail flows.
- Remove "Mark for Trade" from card pages where it is no longer part of the current UX.
- Remove duplicate chase actions.
- Standardise chase actions as "Add to Chase" and "Remove from Chase".
- Use the current chase logo everywhere chase appears.
- Use gold/silver/bronze protection icons instead of stock shield icons.
- Use Minty mascot PNG wherever Minty Insight appears.

Acceptance criteria:

- No old "Set as Favourite" card action remains outside saved Market listings.
- No duplicated "Add/Set as Chase" action appears on the same screen.
- Protection tiers use the intended branded icons.
- Features still route and save exactly as before.

---

## Prompt 6: Home Hub Rev 2 Polish

Polish the Home Hub without changing its information architecture.

Scope:

- Keep Home as the Rev 2 backdrop standard.
- Ensure Minty Insight preview opens into the full Minty message.
- Make Minty use the mascot PNG in preview and full view.
- Keep Scan Card as the strongest CTA.
- Keep Search and Build Trade secondary.
- Tighten vertical spacing only where it improves first-screen usability.
- Preserve value cards, opportunities, recent activity, and community entry.

Acceptance criteria:

- Home still feels like the benchmark screen.
- Minty Insight expands to full detail.
- No dashboard data is removed.

---

## Prompt 7: Collection Vault Rev 2 Polish

Refine the Collection Vault layout and controls.

Scope:

- Make the header more compact.
- Restore/standardise Scan Card text sizing.
- Ensure the Sort button is not gradient-filled.
- Make Discover Sets, Pokedex, and Duplicates shortcut tiles use a quiet consistent style.
- Keep binder cards, progress badges, values, and menu actions unchanged.
- Standardise binder artwork and logo sizes.

Acceptance criteria:

- Scan Card matches the app-wide scan CTA.
- Sort is a clean white/lavender utility control.
- Shortcut tiles do not clash with the hero button.
- Binder grid still works.

---

## Prompt 8: Binder Detail Hero And Controls

Compact and standardise Binder Detail hero controls.

Scope:

- Use the Home backdrop standard.
- Remove any large top ribbon/blank band blocking scroll space.
- Standardise Master set and Public/Private boxes:
  - Same height.
  - Same text scale.
  - Toggle aligned inside each box.
  - Icon large enough to read.
  - No tiny illegible labels.
- Keep Master set only where it is relevant.
- Keep Scan to Binder but make it less vertically dominant.
- Keep Missing, Duplicates, and Chase counters.
- Keep current binder functionality.

Acceptance criteria:

- Master set and Public/Private controls look balanced.
- Toggles stay inside their boxes.
- Top of page no longer eats a quarter of the screen.
- All binder actions still work.

---

## Prompt 9: Graded Binder And Slab Layout

Refine graded binder and slab presentation.

Scope:

- For graded binders, remove Master set controls.
- Put Public/Private and Scan to Binder on one compact row where possible.
- Add a small graded icon in the hero/stat area.
- Make slab labels readable across PSA, TAG, CGC, Beckett, AGS, Ace, and other supported graders.
- Keep grade text centered inside the grade box.
- Prevent grade text from crossing label art or dark areas.
- Prevent long card names from wrapping in a way that pushes text outside the label.
- Keep slab/card artwork unobstructed.

Acceptance criteria:

- Grading labels are readable and balanced.
- Grades stay inside their coloured/allocated boxes.
- Text overlays do not visibly clash with base label lines.
- Existing slab data still displays.

---

## Prompt 10: Market Visual Polish

Deep-polish The Market screen while preserving marketplace behaviour.

Scope:

- Make the top Market header more compact.
- Keep Favorites, Offers, and My Listings, but reduce dead space.
- Use "Favorited listings" language where relevant.
- Do not allow users to favorite/save their own listings.
- Replace old "Save listing" treatment if it conflicts with the Rev 2 favorited listing icon.
- Improve listing card hierarchy:
  - Image.
  - Title.
  - Set/product details.
  - Listing type.
  - Price.
  - Seller.
  - Protection.
  - Actions.
- Replace yellow warning/hero blocks with StackR info panels unless the warning is genuinely critical.
- Preserve buy/trade/filter/search/listing flows.

Acceptance criteria:

- Market looks cleaner and more premium.
- Own listings cannot be saved/favorited.
- No old save/favorite icon mismatch remains.
- Listings remain fully usable.

---

## Prompt 11: Market Filters And Sort Sheet

Redesign Market filters as a compact StackR bottom sheet.

Scope:

- Replace long full-width filter buttons with compact segmented controls or chips.
- Keep sort options:
  - Recently listed.
  - Price low to high.
  - Price high to low.
  - Best value.
  - Most relevant.
  - Closest chase match where available.
- Make disabled options look intentional.
- Make Min price and Max price inputs fit cleanly.
- Keep seller photos, condition, listing type, category, and protection filters.
- Preserve all filtering logic.

Acceptance criteria:

- Filter sheet no longer has large dead-space rows.
- Font sizes are consistent.
- Sheet feels native to StackR.
- Filters still apply correctly.

---

## Prompt 12: Card Detail And Product Detail Cleanup

Clean the card/product detail pages so old actions and top banners no longer dominate.

Scope:

- Remove unhelpful large top banner spacing.
- Keep card art visible without clipping important content.
- Replace old favourite/trade actions:
  - Remove "Set as Favourite".
  - Remove "Mark for Trade" where not intended.
  - Use one chase action.
- Keep Market Guide.
- Keep View Set/Product action.
- Ensure pricing panels never clip large prices.
- Use standard StackR back arrow.
- Keep bottom navigation safe.

Acceptance criteria:

- Top of card detail is not cut off.
- Old StackR action language is gone.
- Pricing values fit.
- Existing card, set, product, and market data still appears.

---

## Prompt 13: Search Screen Rev 2 Polish

Polish Search while keeping all search capabilities.

Scope:

- Tighten the top section.
- Keep search input, category chips, recent searches, and results.
- Make recent search chips consistent in height and spacing.
- Ensure long search terms fit or truncate cleanly.
- Make filter sheet match the Market/StackR sheet standard.
- Remove old icon treatments where current StackR category icons exist.
- Preserve navigation into cards, sets, sealed products, graded slabs, listings, and collectors.

Acceptance criteria:

- Search feels lighter and faster.
- Recent searches do not look uneven.
- Result cards still route correctly.

---

## Prompt 14: Create Listing Header, Steps, And Keyboard Footer

Reduce congestion in Create Listing and fix keyboard spacing.

Scope:

- Header copy must be one line: "Identify your card and build a trusted listing."
- Shrink the top header area.
- Make step chips compact and horizontally scrollable.
- Keep current steps and validation logic.
- Move the footer/action bar close to the keyboard.
- Remove large blank white space above the keyboard.
- Ensure fields remain visible when focused.

Acceptance criteria:

- Create Listing has more usable space.
- Keyboard no longer creates a large dead white band.
- User can still complete every listing step.

---

## Prompt 15: Listing Protection And Evidence Capture

Polish the listing protection and evidence capture flow.

Scope:

- Use branded Bronze, Silver, and Gold icons.
- Keep recommended tier logic.
- Make tier cards compact but readable.
- Explain only the current/next required capture.
- Automatically turn on camera light for surface/reflection photos where supported.
- Keep manual light controls available.
- Preserve photo capture requirements and validation.

Acceptance criteria:

- Protection tier UI matches StackR.
- Surface photos open with light enabled where possible.
- Evidence flow feels guided, not crowded.

---

## Prompt 16: Scan Camera Guidance And Auto Detection

Improve scan camera guidance and auto-detect UX.

Scope:

- Keep camera preview working.
- Add or refine on-screen guidance:
  - Move closer.
  - Move further away.
  - Align card inside frame.
  - Hold steady.
  - Too dark.
  - Glare detected.
  - Card found.
- Add a visible toggle for Auto scan / Manual capture.
- Ensure repeated scan attempts do not stack routes so the user has to press back many times.
- Keep OCR fallback where supported.
- Preserve Ximilar and local matching flow.

Acceptance criteria:

- User knows how to position the card.
- Manual mode is easy to find.
- Back exits scan cleanly.
- Recognition flow still returns results.

---

## Prompt 17: Scan Result And Learning Feedback

Clean Scan Result and add match correction learning.

Scope:

- Keep hero compact.
- Remove any unnecessary yellow "Select match" prompt.
- Use current StackR icons.
- Show likely matches clearly.
- Add "This match is not correct" action.
- Save incorrect-match feedback into the existing scan learning/retrieval feedback system or add a safe local feedback path if no backend table exists.
- Do not block users from retrying or manually searching.
- Preserve add-to-binder and add-to-chase actions.

Acceptance criteria:

- Scan result screen is less congested.
- User can report bad matches.
- Feedback is stored for future learning or queued safely.
- Existing scan result actions still work.

---

## Prompt 18: Pokedex Space And Grid Polish

Make Pokedex more space-efficient without losing its charm.

Scope:

- Reduce header height.
- Keep title, subtitle, search, region filters, masterset progress, and grid.
- Make region filter rail more compact.
- Make masterset progress compact or collapsible after scroll.
- Preserve owned markers.
- Keep Pokemon image cards consistent.

Acceptance criteria:

- More Pokemon are visible on first screen.
- Progress still communicates collection state.
- Grid remains stable and readable.

---

## Prompt 19: Community Feed Rev 2 Polish

Clean Community feed layout and remove older styling.

Scope:

- Make top Community header less invasive.
- Keep Social, Flex, Trades, Local, News tabs.
- Replace old/yellow card and rarity treatments with Rev 2 styling.
- Make prompt chips compact.
- Keep post cards, card previews, profile links, local shops, news, meetups, and modals.
- Use current StackR icons.

Acceptance criteria:

- Feed content starts higher without touching status icons.
- Cards feel immersive and consistent.
- No obvious old StackR styling remains.

---

## Prompt 20: Profile, Showcase, Achievements, And Coin Shop

Polish Profile and related collection identity screens.

Scope:

- Compact profile hero for smaller devices.
- Keep avatar, team, level, XP, stats, showcase, journey, achievements, and settings.
- Replace "Favorite card" language where it conflicts with current StackR terminology.
- Use terms like Featured Card, Chase Card, Grail, Featured Slab where appropriate.
- Standardise achievement icon sizes and locked/unlocked states.
- Preserve editing and saving behaviour.

Acceptance criteria:

- Profile looks Rev 2 and less cramped.
- Showcase language is aligned with product direction.
- Achievements remain clear.

---

## Prompt 21: Price Panels And Minty Insight Clarity

Standardise pricing and Minty insight panels.

Scope:

- Clearly separate:
  - Live sold comps.
  - Backup lookup.
  - Cached daily prices.
  - User listing price.
  - Estimated value.
- Ensure all price text fits, including large graded slab prices.
- Use Minty mascot PNG wherever Minty appears.
- Make Minty panels expandable where longer explanation exists.
- Replace duplicated/confusing market price blocks with clearer labels.
- Preserve pricing fetches and calculations.

Acceptance criteria:

- Users can tell which price source they are seeing.
- No price values are clipped.
- Minty feels consistent across Home, card detail, and price tools.

---

## Prompt 22: Value History And Price Tools Polish

Polish Value History, Price Builder, and Prices without reducing functionality.

Scope:

- Keep charts, movers, risers/fallers, seller mode cards, range toggles, and price search.
- Compact headers and cards.
- Standardise segmented controls.
- Make empty states shorter.
- Use Rev 2 info panels instead of custom one-off blocks.
- Preserve data fetching and calculations.

Acceptance criteria:

- Price tools feel less heavy.
- Charts and movers remain readable.
- Empty/no-data states are useful but not oversized.

---

## Prompt 23: Set, Product, And Japanese Catalogue Data States

Improve set/product data clarity and Japanese catalogue presentation.

Scope:

- Fix missing total card counts so progress does not incorrectly show 100 percent.
- Show "total unknown" or "needs sync" where totals are missing.
- Add clean fallback for corrupt product images.
- Ensure Japanese set names, product names, and card names fit without breaking layout.
- Keep Japanese catalogue APIs/data import logic intact.
- Preserve all existing search and listing flows.

Acceptance criteria:

- Pitch Black or similar sets do not show false 100 percent completion.
- Broken images show a StackR fallback.
- Japanese/foreign set data displays cleanly.

---

## Prompt 24: Seller Mode And Inventory Polish

Make Seller Mode feel operational and efficient.

Scope:

- Keep stock in, stock out, pending stock-out, sales, orders, Stripe onboarding, and product stock views.
- Reduce decorative empty space.
- Use compact empty states.
- Standardise modals with the shared sheet/popup system.
- Keep all inventory calculations and saved data.

Acceptance criteria:

- Seller Mode is easier to scan.
- Stock workflows still work.
- Modals feel consistent with StackR.

---

## Prompt 25: Offers, Trades, And Collection Picker Fix

Polish offers/trades and fix own-collection selection coverage.

Scope:

- Ensure creating a trade from the user's own collection lists all owned cards that should be eligible.
- Keep search/filtering inside picker.
- Remove old "Mark for Trade" language where not intended.
- Standardise offer accept/decline/withdraw/dispute confirmations.
- Keep offer data and routing intact.

Acceptance criteria:

- User can select from their full eligible collection.
- Offer/trade confirmations use StackR popup styling.
- No outdated trade wording remains in card detail.

---

## Prompt 26: Legacy Route And Redirect Cleanup

Make legacy routes safe and invisible.

Scope:

- Identify routes that only exist for redirects or backwards compatibility.
- Ensure they contain no duplicate UI.
- Keep redirects working.
- Hide legacy routes from navigation.
- Add a route map doc explaining active routes vs redirect shims.
- Do not delete routes unless there is proof nothing links to them.

Acceptance criteria:

- Legacy routes cannot show old UI.
- Deep links still work.
- Future cleanup is documented.

---

## Prompt 27: Asset Organisation Without Deleting Old Assets

Organise active Rev 2 assets without risking broken imports.

Scope:

- Identify assets actively imported by code.
- Move or copy active assets into a clear Rev 2 folder structure only when imports can be safely updated.
- Do not delete old assets.
- Keep an archive/legacy folder outside active import paths where appropriate.
- Update file paths in code for moved assets.
- Run import checks after changes.

Acceptance criteria:

- Active assets are easier to find.
- App still resolves every image.
- Old assets are not deleted prematurely.

---

## Prompt 28: Final Visual QA Pass

Run a final Rev 2 QA pass across the app.

Scope:

- Review each major screen on a small mobile viewport and a larger mobile viewport.
- Check:
  - Status bar spacing.
  - Bottom nav spacing.
  - Header height.
  - Button consistency.
  - Popup consistency.
  - Text clipping.
  - Price clipping.
  - Icon sizing.
  - Image fallbacks.
  - Empty states.
- Fix only small visual regressions found during QA.

Screens:

- Home.
- Collection.
- Binder Detail.
- Graded Binder.
- Pokedex.
- Duplicates.
- Scan.
- Scan Result.
- Market.
- Market Filters.
- Create Listing.
- Listing Camera.
- Search.
- Card Detail.
- Product Detail.
- Set Detail.
- Community.
- Profile.
- Value History.
- Price Builder.
- Seller Mode.

Acceptance criteria:

- No obvious Rev 1/old StackR styling remains in normal user flows.
- Text does not clip.
- Top/bottom safe areas are clean.
- Core actions remain usable.

---

## Suggested Batch Sizes

Smallest safe batches:

- Batch A: Prompts 1 to 4.
- Batch B: Prompts 5 to 9.
- Batch C: Prompts 10 to 15.
- Batch D: Prompts 16 to 21.
- Batch E: Prompts 22 to 28.

Most practical build order:

- Start with Prompt 1.
- Then do Prompts 2, 3, and 4 together only if the component system is already clear.
- Then handle Binder, Market, Create Listing, and Scan before lower-traffic screens.

Best first implementation prompt:

Run Prompt 2 first if you want immediate visual relief.

Best first product-coherence prompt:

Run Prompt 5 first if you want to remove old StackR language quickly.

Best first conversion/UX prompt:

Run Prompts 10, 11, and 14 if Market and Create Listing are the priority.
