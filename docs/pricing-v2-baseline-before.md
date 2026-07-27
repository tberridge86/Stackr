# Pricing V2 Baseline Report

Generated: 2026-07-26T18:52:53.728Z

Scope: all (20359 cards)

| Metric | Legacy | Pricing V2 |
| --- | ---: | ---: |
| Cards with usable price | 17470 (85.81%) | 0 (0%) |
| Price unavailable | 2889 (14.19%) | 20359 (100%) |
| Prices older than 7 days | 16622 | n/a until V2 backfill runs |
| Prices older than 30 days | 16606 | n/a until V2 backfill runs |
| Prices older than 90 days | 1 | n/a until V2 backfill runs |

## Integrity Signals

- Duplicate card-record keys: 0
- Mismatched language observations: 0
- Raw identities with graded evidence: 0
- Graded identities with raw evidence: 0

```json
{
  "generatedAt": "2026-07-26T18:52:53.728Z",
  "scope": {
    "language": "all",
    "cards": 20359
  },
  "legacy": {
    "usablePriceCards": 17470,
    "usablePricePercent": 85.81,
    "unavailableCards": 2889,
    "unavailablePercent": 14.19,
    "olderThan7Days": 16622,
    "olderThan30Days": 16606,
    "olderThan90Days": 1
  },
  "pricingV2": {
    "usablePriceCards": 0,
    "usablePricePercent": 0,
    "unavailableCards": 20359,
    "unavailablePercent": 100
  },
  "integrity": {
    "duplicateCardRecords": 0,
    "mismatchedLanguageObservationCount": 0,
    "rawPricedFromGraded": 0,
    "gradedPricedFromRaw": 0
  }
}
```
