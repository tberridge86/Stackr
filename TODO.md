# Scanner Performance Optimization TODO

- [x] 1) Fix and optimize `lib/cardSight.ts` for reliable API calls (mobile-safe payload strategy).
- [x] 2) Fix `lib/scanStore.ts` integration issues (missing import/types and queue processing stability).
- [x] 3) Split scan behavior by mode:
  - market mode = quick value scan
  - binder mode = binder add flow
- [x] 4) Update market camera navigation to open scan in market mode.
- [x] 5) Fix binder cover resolver fallback for legacy/variant cover keys.
- [ ] 6) Optimize scan speed + accuracy in `app/scan/index.tsx`:
  - adaptive image profiles (fast pass + accuracy retry)
  - request timeout guard
  - smarter auto scan cadence (no overlapping captures)
  - reduce duplicate-frame processing
- [ ] 7) Add backend timing + fast-fail checks in `backend/routes/cardsight.js`.
- [ ] 8) Run targeted verification:
  - market scan latency/accuracy
  - binder scan latency/accuracy
  - cardsight endpoint error paths
