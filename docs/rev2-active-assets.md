# StackR Rev 2 Active Asset Map

This document tracks the active Rev 2 asset structure used by the app. It exists to keep future cleanups safe: active imports should point into numbered folders, while older loose folders should remain untouched until they are proven unused.

## Active Numbered Folders

- `assets/rev2/01-brand`: app icons, logos, wordmarks, splash, and the shared backdrop.
- `assets/rev2/02-navigation-icons`: current StackR navigation and action icon set.
- `assets/rev2/03-ui-illustrations`: hero icons, Minty mascot, and UI metadata artwork such as rarity symbols.
- `assets/rev2/04-listing-categories`: listing category artwork used by Create Listing and listing category pickers.
- `assets/rev2/05-binder-covers`: binder cover cutouts and custom binder name art.
- `assets/rev2/06-profile-teams`: team logos and profile avatar sets.
- `assets/rev2/07-achievements`: achievement badges and binder reward artwork.
- `assets/rev2/08-pokedex-regions`: region filter artwork for Pokedex.
- `assets/rev2/09-grading-master-set`: graded/master-set mode icons and slab label artwork.
- `assets/rev2/10-market-trade`: marketplace, trade, and protection tier assets.
- `assets/rev2/99-legacy`: holding area for assets after a no-import proof, not a deletion target.

## Current Cleanup Decisions

- Rarity symbols were copied from the loose `assets/rev2/Rarity Symbols` folder into `assets/rev2/03-ui-illustrations/rarity-symbols`.
- Protection tier imports now use `assets/rev2/10-market-trade/protection-tiers`.
- The old loose folders were not deleted.

## Safety Rule

Before moving any further asset:

1. Confirm the asset is imported by code.
2. Copy it into the relevant numbered Rev 2 folder.
3. Update only the matching static import paths.
4. Run the asset existence check and app checks.
5. Leave the old source folder in place until there is a separate no-import cleanup pass.
