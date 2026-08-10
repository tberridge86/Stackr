# StackR Rev 2 Visual Baseline And Guardrails

Date: 2026-07-19

Purpose: establish the Rev 2 components, tokens, and consolidation targets to reuse before making UI changes. This is documentation-only. No app behaviour, screen layout, routes, data flow, or assets were changed.

## Non-Negotiables

- Preserve existing features and navigation.
- Prefer existing shared StackR components over local one-off styling.
- Do not delete assets during visual cleanup.
- Do not introduce another button, sheet, popup, or card style unless an existing shared primitive cannot support the use case.
- Keep Home as the normal-page backdrop and atmosphere reference.
- Keep camera/scanner screens allowed to be darker and more immersive, but their controls should still feel StackR.

## Core Rev 2 Tokens

Use these as the source of truth:

- `lib/theme.ts`
  - `theme.colors.bg`, `theme.colors.card`, `theme.colors.surface`
  - `theme.colors.primary`, `theme.colors.secondary`
  - `theme.colors.text`, `theme.colors.textSoft`
  - `theme.colors.border`
  - `theme.colors.semantic`
  - `stackrRadii`, `stackrSpacing`, `stackrShadows`, `stackrGradients`
- `lib/typography.ts`
  - `Text` should flow through `components/Text.tsx`.
  - Use `typeScale` for display, page, section, card, body, caption, micro, button, and numeric styles.
  - Use `numericTextStyle` for prices, counts, grades, XP, quantities, and stats.
- `lib/stackrSizing.ts`
  - Logo sizes.
  - Action icon sizes.
  - Category icon sizes.
  - Tab bar sizes.
  - Card image sizes.
  - Bottom content padding.
- `lib/stackrIcons.ts`
  - Rev 2 navigation/product icons.
  - Current chase icon.
  - Current scan/search/sell/category icons.
  - Gold, silver, and bronze protection icons.

Guardrail: avoid hard-coded brand colours such as `#6938F5`, `#6136F5`, `#F59E0B`, `#FEF3C7`, and `#FFFBEB` in page code unless they are part of a local visual asset, chart, camera overlay, or semantic state that cannot use theme tokens yet.

## Existing Components To Reuse

### Screen Layout And Backdrop

Preferred:

- `components/StackrScreen.tsx`
  - `StackrScreen`
  - `StackrPageTitle`
  - `StackrPageHeader`
  - `StackrCardActionIcon`
  - `PokemonArtworkGlow`
- `components/StackrBackdrop.tsx`
  - `StackrBackdrop`
  - `StackrHeroBackdrop`
- `components/StackrScreenHeader.tsx`
  - Useful today, but should be reviewed before becoming the only header primitive because some screens need a simpler compact header.

Current issue:

- Many screens still use direct `SafeAreaView` wrappers with inline `backgroundColor`, `overflow`, and edge choices.
- This is a major reason top spacing and large header bands vary by page.

Baseline rule:

- New normal pages should use `StackrScreen` plus `StackrBackdrop`.
- Existing pages should move toward one shared page shell during cleanup, not more local wrapper code.

### Back Button

Preferred:

- `components/StackrBackButton.tsx`

Baseline rule:

- Use the plain purple arrow treatment.
- Do not wrap back arrows in large white circular hero buttons unless a specific fullscreen/camera use case needs it.

### Buttons And CTAs

Preferred for large visual actions:

- `components/StackrActionButton.tsx`
  - Good for scan actions and large card-style actions.
  - Supports `primary`, `secondary`, `quiet`.
  - Supports `hero`, `standard`, `compact`.
  - Supports image icons through `StackrCardActionIcon`.

Preferred for utility actions:

- `components/StackrControls.tsx`
  - `StackrButton`
  - `StackrIconButton`
  - `StackrChip`
  - `stackrControlTokens`

Current issue:

- Pages also have many local `TouchableOpacity` buttons with direct `theme.colors.primary`, custom heights, custom radii, and custom font sizes.
- Some utility controls use gradient fills, which makes sort/filter buttons compete with real primary CTAs.

Baseline rule:

- Use `StackrActionButton` for primary scan/hero actions.
- Use `StackrButton`, `StackrIconButton`, and `StackrChip` for utility and form controls.
- Utility actions such as Sort, Filter, View mode, Clear, Refresh, and Cancel should not use hero gradients.

### Cards, Images, And Card Identity

Preferred:

- `components/StackrCardTile.tsx`
  - Shared row/grid card tile.
- `components/StackrImage.tsx`
  - Shared image loading, caching, fallback, thumbnail/full image choice.
- `components/StackrCardIdentity.tsx`
  - Shared card title, set, number, and edition text handling.
- `components/BinderArtwork.tsx`
  - Binder cover artwork.
- `components/RaritySymbol.tsx`
  - Rarity overlay/symbols.
- `components/SlabStickerLabel.tsx`
  - Slab label rendering.

Current issue:

- Several screens still build card/listing tiles locally.
- This creates inconsistent title wrapping, image sizing, badge placement, and selection badges.

Baseline rule:

- Use `StackrImage` anywhere remote card/product artwork appears.
- Use `StackrCardIdentity` where long card names, set names, and card numbers are shown.
- Use `StackrCardTile` for generic card rows/grids unless the screen has a domain-specific card such as a marketplace listing.

### Popups, Feature Tips, And Alerts

Preferred:

- `components/StackrPopupProvider.tsx`
  - Globally themes most `Alert.alert(...)` calls.
- `components/FeatureTipModal.tsx`
  - Feature education with optional "Don't show this again".

Current issue:

- `Alert.alert` is visually intercepted, which is good, but multi-action quick menus still behave like alert menus rather than StackR action sheets.
- Several screens define custom `Modal` sheets locally with similar but not identical styling.

Baseline rule:

- Use `StackrPopupProvider` for simple confirmations, errors, and success messages.
- Use a shared bottom-sheet primitive for filters, sort, quick actions, and pickers. This primitive does not exist cleanly yet and should be one of the first consolidation targets.
- Use `FeatureTipModal` only for first-run educational moments.

### Empty, Loading, Error, And Permission States

Preferred:

- `components/StackrStates.tsx`
  - `StackrStateBlock`
  - `StackrLoadingState`
  - `StackrEmptyState`
  - `StackrErrorState`
  - `StackrOfflineState`
  - `StackrPermissionState`
  - `StackrSkeleton`
- Domain-specific:
  - `MarketEmptyState`
  - `MarketSkeleton`

Current issue:

- Many screens still have custom empty cards, custom loading cards, and custom warning blocks.

Baseline rule:

- Use `StackrStates` for generic states.
- Keep domain-specific empty states only when they add clear product context.

### Market And Listing Components

Preferred:

- `components/market/MarketComponents.tsx`
  - `MarketHeader`
  - `MarketShortcutRow`
  - `MarketModeSelector`
  - `MarketSearch`
  - `MarketFilterChip`
  - `MarketFilterSheet`
  - `MarketListingCard`
  - `ProtectionBadge`
  - `ProtectionDetail`
  - `MarketValueSummary`
  - `StickyMarketActions`

Current issue:

- Market has useful shared pieces, but they still contain inline values and some styling that overlaps with generic components.
- `MarketFilterSheet` is a good candidate to become or inform the global bottom-sheet primitive.

Baseline rule:

- Keep market-specific components for market-specific content.
- Pull generic sheet, chip, button, and state behaviour out into shared StackR primitives over time.

### Price And Insight Panels

Preferred for now:

- `components/PokeTraceMarketInsights.tsx`
- `components/ValueTrackerCard.tsx`
- `components/market/MarketComponents.tsx` `MarketValueSummary`

Current issue:

- Pricing appears in several styles and labels:
  - Live sold comps.
  - Backup lookup.
  - Cached daily prices.
  - User listing price.
  - Estimated value.
  - Market movement.

Baseline rule:

- Do not create another price panel style.
- Future work should consolidate pricing display into a shared price-panel system with explicit source labels and no clipping.

### Legacy/Premium UI Helpers

Existing:

- `components/PremiumUI.tsx`
  - `PremiumCard`
  - `LayeredPanel`
  - `StatPill`
  - `ProgressBadge`
  - `EmptyStateCard`
  - `ActionTile`
  - `TrustBadge`
  - `ValueSummaryCard`
  - `HeroActionPanel`

Current issue:

- This layer overlaps with newer StackR components.
- It is still used in active areas, especially scan result style pieces.

Baseline rule:

- Do not delete or rewrite `PremiumUI`.
- Do not add new usage unless the component is deliberately chosen.
- Prefer newer StackR components for future cleanup.
- Migrate away from `PremiumUI` gradually where it duplicates `StackrStates`, `StackrActionButton`, or shared card primitives.

## Top 10 Duplicated Patterns To Consolidate

1. Page wrappers and safe-area handling.
   - Current forms: `StackrScreen`, direct `SafeAreaView`, inline edge choices, manual status spacing.
   - Target: one normal-page shell and one fullscreen/camera shell.

2. Page headers.
   - Current forms: `StackrPageHeader`, `StackrScreenHeader`, local title/subtitle rows, large custom heroes.
   - Target: compact page header, optional hero header, and scroll-collapsible detail hero.

3. Back arrows.
   - Current forms: `StackrBackButton`, custom circular back buttons, inline Ionicons.
   - Target: one plain purple back button treatment.

4. Primary actions.
   - Current forms: `StackrActionButton`, `StackrButton`, local purple `TouchableOpacity`, local `LinearGradient`.
   - Target: one primary CTA and one scan CTA style.

5. Utility controls.
   - Current forms: chips, sort buttons, filter buttons, segmented controls, view toggles, refresh buttons.
   - Target: shared `StackrChip`, `StackrIconButton`, and segmented control primitive.

6. Bottom sheets.
   - Current forms: market filter sheet, duplicate sort sheet, binder option sheet, chase sheet, inventory product sheets, community pickers.
   - Target: shared `StackrBottomSheet`.

7. Popups and quick action menus.
   - Current forms: themed `Alert.alert`, feature tips, custom modals, multi-button alert quick menus.
   - Target: `StackrPopup`, `StackrFeatureTip`, and `StackrQuickActionSheet`.

8. Empty/loading/error states.
   - Current forms: `StackrStates`, `MarketEmptyState`, custom cards, inline warning panels, custom skeletons.
   - Target: use `StackrStates` by default with domain-specific wrappers only where useful.

9. Card/listing tiles.
   - Current forms: `StackrCardTile`, `MarketListingCard`, binder tiles, search result cards, duplicate rows, local card previews.
   - Target: shared card identity/image/selection/badge rules, with market retaining domain-specific listing cards.

10. Price panels.
   - Current forms: PokeTrace panels, Market Value, cached daily prices, Value History cards, Price Builder cards.
   - Target: shared price display primitives with source labels, numeric fitting, and standard empty states.

## Older Or Competing Styling To Watch

These are not all wrong, but they should be treated carefully during future cleanup:

- Direct hex colours for brand purple, shadow purple, gold/yellow warnings, and lavender fills.
- Yellow warning/info blocks used for non-critical messages.
- Local `LinearGradient` buttons on utility actions.
- Large rounded hero containers that consume the first viewport.
- Custom `Modal` bottom sheets with separate handles, close buttons, and padding rules.
- `Ionicons` for actions where StackR PNG icons already exist.
- Inline button definitions with `backgroundColor: theme.colors.primary`.
- Multiple local card shadows and border radii.
- `PremiumUI` components used as generic replacements for newer shared components.
- Price panels that create their own labels, stat cells, and numeric fitting.

## Safest First Components To Standardise

### 1. Page Shell

Create or refine a shared normal page shell that wraps:

- Safe area.
- Home-style `StackrBackdrop`.
- Standard horizontal page padding.
- Standard top and bottom content padding.
- Optional scroll container.

Why first:

- It fixes many top-bar and backdrop issues without touching business logic.

### 2. Compact Page Header

Create or refine one compact page header that supports:

- Back arrow.
- Title.
- Accent text.
- Subtitle.
- Right accessory.
- Optional compressed mode.

Why first:

- It reduces page-by-page hero drift.

### 3. Bottom Sheet Primitive

Create `StackrBottomSheet` for:

- Sort.
- Filters.
- Quick actions.
- Pickers.
- Short forms.

Why first:

- This is duplicated across Binder, Market, Search, Duplicates, Inventory, Community, and Set detail.

### 4. Segmented Control And Utility Chip

Create one segmented control primitive or extend `StackrControls`.

Use for:

- Buy/Trade.
- 7D/30D/90D.
- Grid/List.
- Sort/filter category groups.
- Card condition chips.

Why first:

- This cleans up many crowded screens without changing flows.

### 5. Price Panel Primitive

Create shared price display components:

- Price stat tile.
- Price source section.
- Empty/no-price state.
- Price movement summary.

Why first:

- Pricing confusion is a trust issue and appears in several screens.

## Practical First Implementation Targets

Start with these in order:

1. Shared page shell and compact header.
2. Back arrow usage audit.
3. Shared bottom sheet.
4. Button/control consolidation.
5. Price panel consolidation.

Then apply them to:

1. Binder Detail.
2. Market and Market Filters.
3. Create Listing.
4. Scan Result.
5. Pokedex.

This order gives the highest visible improvement with the lowest risk to data and feature behaviour.

## Acceptance Check For Future UI Work

Before any Rev 2 cleanup is considered done, check:

- Does it use shared StackR tokens instead of local colour/radius/type values?
- Does the top of the screen respect the phone status area?
- Does the bottom of the screen respect the tab bar or keyboard?
- Does the main action match the same action elsewhere?
- Are utility controls quiet and non-gradient?
- Is the popup/sheet style shared?
- Do prices, grades, names, and counts fit?
- Are StackR PNG icons used where available?
- Has any old favourite/trade/chase wording reappeared?
- Did the change avoid deleting assets or changing feature logic?
