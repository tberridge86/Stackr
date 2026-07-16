# Stackr Performance Guardrails

These rules keep the app fast without changing the visual language.

## Shared Sizing

- Use `lib/stackrSizing.ts` for Stackr logo, footer icon, action icon, and card image ratios.
- Keep card art at `stackrCardImageSizes.cardAspectRatio` unless the surface is intentionally a slab, sealed product, avatar, or square product tile.
- Add new logo dimensions to `stackrLogoSizes` instead of hard-coding per screen.

## Images

- Use `StackrImage` for repeated remote artwork in lists, grids, carousels, and search results.
- Keep one-off local icon assets on React Native `Image` when they are static and already bundled.
- Prefer `prefetchStackrImagesAfterInteractions` for route-level image warming so navigation and gestures stay responsive.

## Lists

- Use `stackrListPerformance` for large `FlatList` card grids and marketplace lists.
- Keep `keyExtractor` stable and avoid index keys for user data.
- Avoid doing search, price, or ownership calculations inside `renderItem`; prepare the display data before rendering when a list can grow.

## Navigation

- Keep global shell elements memoized when they only depend on theme, route, and app mode.
- Avoid eager remote image prefetching during screen transitions; schedule it after interactions.
