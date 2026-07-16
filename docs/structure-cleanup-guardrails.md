# Stackr Structure Cleanup Guardrails

This cleanup track is intentionally conservative. The goal is to reduce project noise, unused assets, and oversized files without changing app appearance, navigation, data behavior, or pricing/scanning logic.

## Safe Order

1. Audit first, delete later.
2. Keep Expo Router route files in `app/` as the source of URL behavior.
3. Move implementation code behind route wrappers only when imports still resolve and `npx tsc --noEmit` passes.
4. Do not move assets until every static `require(...)` path is updated and a fresh bundle passes.
5. Treat generated, archive, and design-export folders separately from app-used assets.

## Asset Cleanup Rules

- Use `npm run audit:assets` to find likely-unused assets.
- Do not delete anything from `assets/achievements`, `assets/rev2`, `assets/binders`, or `assets/images` only because it looks unused. Some collections are intentionally registered as complete sets.
- Prefer moving confirmed design-only files outside the bundled `assets/` tree, or ignoring them, before deleting them.
- After any asset removal, run a fresh Expo export for the target platform.

## Code Cleanup Rules

- Keep shared UI in `components/`.
- Keep feature implementation in `features/`.
- Keep shared data/API/domain helpers in `lib/`.
- Split giant screens into nearby helpers and subcomponents before changing behavior.
- Avoid route renames unless a redirect/wrapper preserves the existing path.

## Required Checks

- `npx tsc --noEmit`
- `npm run lint`
- Fresh Expo bundle check after asset/path changes

