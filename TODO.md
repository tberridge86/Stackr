# Scanner Performance Optimization TODO

- [ ] 1) Fix and optimize `lib/cardSight.ts` for reliable API calls (mobile-safe payload strategy).
- [ ] 2) Fix `lib/scanStore.ts` integration issues (missing import/types and queue processing stability).
- [ ] 3) Improve `lib/useScanCamera.ts` performance controls and continuous scan behavior.
- [ ] 4) Fix `app/scan/card-camera.tsx` invalid continuous toggle usage and align with hook/store APIs.
- [ ] 5) Optimize hot path in `app/scan/index.tsx` (capture/manipulation/network timing + safer auto interval handling).
- [ ] 6) Run lint check for touched files and verify no new scanner-related errors.
