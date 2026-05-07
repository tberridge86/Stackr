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

### Phase 2: Frontend Fixes (NOT COMPLETED - requires separate work)
- [ ] 4. Update app/card/[id].tsx to use /api/price/ebay with rarity
- [ ] 5. Update app/binder/[id].tsx to use /api/price/ebay with rarity
- [ ] 6. Update app/scan/result.tsx to use /api/price/ebay with rarity

### Phase 3: Testing
- [ ] Test with "Blastoise Base" query to verify correct pricing

## Completion
Backend fixes complete - should now return more accurate prices for rare Pokemon cards.
The fallback query now includes setName, number, and rarity hints for better matching.
