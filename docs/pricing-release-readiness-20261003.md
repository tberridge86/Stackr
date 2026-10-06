# Catalogue price guide readiness — updated 4 October 2026

The guide is deployed to staging and production and imports every TCGCSV English/Japanese provider group independently of ownership. It retains source feeds and durable identity mappings, serves 100-reference bulk reads, persists phone prices between launches and sends only changed price rows on subsequent reads. Missing or stale quotes remain explicitly labelled.

Daily provider updates are detected by hourly checks: TCGCSV at minute 13 UTC and Cardmarket at minute 17. Cardmarket uses durable volume storage, conditional ETags, database-reviewed mappings, restart-safe revision IDs and resumable checkpoints. Scheduler deployment is distinct from proof of a completed scheduled execution; see the final [pricing receipt](releases/pricing-readiness-20261004.json).

Cardmarket supplies 9,223 reviewed blended general estimates from a fully processed retained feed. eBay Browse access is verified for asking-price fallback. Neither source is relabelled as a completed sale, exact condition/finish valuation or holdings price.

Coverage is measured over current physical published variants, with Cardmarket printing estimates expanded only as general presentation and overlap removed. It remains below 100%; see [production coverage](releases/production-price-coverage-20261004.json). Unsupported languages/finishes, missing provider values and unresolved maps are visible beta gaps.

The complete audit, current migration/deployment evidence, performance limits, native build and remaining handset acceptance are recorded in [the release audit](releases/stackr-readiness-audit-20261004.md).
