# PikaQian pricing access — 5 October 2026

PikaQian now documents a legitimate **Simplified Chinese price API**. Stackr's saved local key still cannot read it: one authenticated, read-only request at **2026-10-05T21:42:07.497Z** returned **HTTP 403 `tier_required`**. No prices were imported, subscriptions changed, jobs triggered, or database/catalogue records modified.

The tested route was `GET /v1/cards/020d2403-8f70-422b-bb34-1670bd7950e7/prices`, using a provider ID from the existing completed name export. The key was loaded from the existing server settings file and was not printed or retained in this receipt. The response was not retried. The [JSON receipt](pikaqian-pricing-access-20261005.json) records the access result and capture-manifest hash.

## What the provider can contribute

The [price endpoint documentation](https://pikaqian.com/docs/api/get-card-prices-v-1-cards-card-id-prices-get/) describes reviewed eBay-sale aggregates, in **integer USD cents**. Each raw/graded bucket averages the trailing seven days of sales, falling back to the most recent sale when that bucket has no sales that week. `updated_at` is the summary recomputation time, not necessarily the sale date. `recent_sale_count` covers all grade buckets; it cannot establish multiple recent ungraded sales. These are market guides rather than individual-condition exact prices or proof of a particular latest sale.

The [card catalogue documentation](https://pikaqian.com/docs/api/list-cards-endpoint-v-1-cards-get/) exposes Simplified Chinese set, collector number and print-treatment identities. It includes holo, reverse, Poké Ball, Master Ball and open-ended stamped treatments. These require exact canonical matching; they must not be collapsed into a generic normal/holo identity. PikaQian does not supply a Traditional Chinese pricing lane.

The [tier documentation](https://pikaqian.com/docs/tiers-and-rate-limits/) says Free has metadata only, Hobby unlocks raw prices and all variants, and Pro adds individual sales and graded prices. The [pricing page](https://pikaqian.com/pricing) lists Hobby at **US$20/month / 5,000 requests**, Pro at **US$60/month / 50,000 requests**, and Business at **US$200/month / 1,000,000 requests**. It describes Pro for production/commercial workloads; this is the provider's plan description, not an independently verified licence determination. No plan was purchased or upgraded.

## Current Stackr evidence

- The completed local translation export contains **12,921 base-card name records** from **130 pages**, completed at 21:30:47 UTC. Its six fields are provider record ID, Chinese name, English name, source set ID, card type and variant flag. It omits collector number, finish, price and source-price date. It is useful name evidence but cannot bind prices to physical variants.
- The current PikaQian adapter imports metadata/artwork and declares no price capability. An approved `ingest.sources` catalogue row does not approve or activate a price feed. Production has no PikaQian `market.source_providers` row or current, non-deprecated PikaQian raw-source records.
- A production read of published catalogue version `79f43e8f-7062-4d29-8571-569eccb7c249` still found **20,453 Simplified Chinese variants**, all classified `PRICE_UNAVAILABLE`. No projected PikaQian coverage is counted as completed pricing.

Once existing server access legitimately includes pricing, the missing implementation is a dedicated central ingestion lane: fetch complete print identities, verify language/set/collector/printing/finish, retain raw prices separately from grades, preserve summary and actual-sale dates where available, convert cents to USD and use dated USD→GBP FX, and retain source/history through the existing classified bulk read. Expensive cards require direct variant evidence; an aggregate's fallback age must remain explicit.

PikaQian cannot fill every gap automatically. Its docs explicitly say `404 price_not_found` is common for low-rarity cards. Missing-price, unsupported-treatment, stale or ambiguous rows must remain honest unavailable/qualified-guide results. Do not manufacture nominal common-card values or use another language's price.

**Next external dependency:** pricing entitlement on the saved key. Deployment and authenticated app acceptance remain separate outstanding release steps recorded in the [recovery receipt](pricing-recovery-20261005.md).
