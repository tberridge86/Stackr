# TODO: Fix eBay Price Search Issues

## Problem
eBay price search returning wrong prices (£1.44-£2.51) for rare cards that should be £170+ because:
1. Fallback query doesn't include setName/number
2. Frontend uses `/price` instead of `/api/price/ebay` 
3. Rarity hints not being passed
4. Missing important Pokemon TCG keywords in filter

## Tasks

### Phase 1: Backend Fixes (COMPLETED)
- [x] 1. Fix buildFallbackQuery to accept and use setName/number parameters
- [x] 2. Fix fetchEbaySummary to pass full card info to fallback (setName, number)
- [x] 3. Update getImportantWords stoplist with additional Pokemon TCG terms

### Phase 2: Frontend Fixes (IN PROGRESS)
- [x] 4. Update app/card/[id].tsx to use /api/price/ebay with rarity
- [x] 5. Update app/(tabs)/trade.tsx to use /api/price/ebay with structured params
- [x] 6. Update app/market/index.tsx to use /api/price/ebay with structured params

### Phase 3: Testing
- [ ] Test with "Blastoise Base" query to verify correct pricing

## Phase 4: OAuth / Rate Limit Diagnostics
- [ ] 7. Add eBay OAuth scopes constant with developer analytics readonly scope
- [ ] 8. Update getToken() to request all required scopes
- [ ] 9. Improve /ebay-rate-limits error diagnostics (status + body passthrough)
- [ ] 10. Verify endpoints: /test-ebay-token, /ebay-rate-limits, /api/price/ebay

## Completion
Backend fixes complete - should now return more accurate prices for rare Pokemon cards.
The fallback query now includes setName, number, and rarity hints for better matching.
