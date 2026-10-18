# Stackr functional icon family

The app's navigation, hero controls and feature shortcuts now share 22 SVG designs on a 24-unit grid, with 1.8-unit rounded strokes, navy `#0B1739` outlines and the existing purple `#6938F5` accent. Discover Sets uses three overlapping cards; Collection, Pokédex, Search and Scan retain their established meanings with simpler silhouettes.

`StackrNavigationIcon` retains its existing names, required `color` and optional `size`; optional `accentColor` defaults to `color` for existing monochrome callers. The image-source compatibility component recognises 23 explicit functional asset keys and renders the shared vectors. Other sources, protection tiers and images with load/error/progress callbacks continue through the original React Native Image implementation. The PNG registry remains unchanged.

This change updates the existing screen references, including shared action-icon rendering. It adds no dependency, animation, route, theme switch, API call or data operation. Logo, set and card artwork, avatars, achievement images and protection-tier assets remain unchanged. White button icons, selection, disabled opacity and notification badges retain their roles.

## Verification

- Component previews inspected at 20, 24, 32 and 48 pixels, with 375px mobile and 1120px desktop viewports. No horizontal overflow in either preview.
- White-button, disabled and notification states inspected. Dark-surface contrast is a component preview; the app remains light-only.
- A before/after syntax check preserved 1,020 interaction/accessibility attributes and 259 button elements across 24 changed existing modules. This is source-structure evidence, not an authenticated interaction or installed-device claim.
- Final-source root typecheck and lint passed; lint reported the same eight pre-existing warnings.
- Final-source web export passed: 10 JavaScript bundles and 101 static routes. The exported app contains all 44 SVG paths for the 22 designs, the compatibility renderer and the accented app navigation.
- Compatibility evaluation of the actual component with native image/view/theme shims passed: all 23 functional asset keys render vectors; all three protection images, arbitrary photo sources, five loading/error/progress callbacks, white tint, disabled opacity and accessibility labels remain supported. This is local component evidence, not native decoding or phone acceptance.

Local implementation is isolated on `codex/stackr-icon-family-20261018`, based on `32b97bbc2cec9d416072c0b17b011453987a3d4d`. No live, native or OTA publication is part of this change.
