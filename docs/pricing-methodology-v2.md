# Pricing Methodology V2

Date: 2026-07-26

## Goal

Pricing Engine V2 produces a fast, cached, explainable GBP valuation for an exact card or product identity. It separates verified sold evidence, secondary market estimates and active asking prices.

Normal mobile requests read from Stackr's cached `market_price_snapshots` rows through:

```text
GET /api/pricing/:cardId
```

External provider calls run through server-side refresh/backfill jobs only.

## Canonical Identity

Every pricing request is converted into one deterministic key:

```text
productType|language|setId|cardNumber|variant|finish|edition|gradingCompany|grade|rawCondition|sealedProductType|packageVariant
```

The identity includes:

- `productType`: `raw_card`, `graded_card`, `sealed_product`
- `language`: `en`, `ja`, `zh-CN`, `zh-TW`, `ko`
- Set ID/code/name aliases
- Collector number and printed total
- Variant, finish and edition
- Grader, grade and qualifier
- Raw condition when known
- Sealed product/package type

The engine must never combine prices across incompatible identity keys.

## Source Hierarchy

1. `ebay_sold`: verified completed transactions only, disabled until authorised sold-data access is configured.
2. `manual_verified_comp`: human-reviewed sold comps.
3. `existing_stackr_source`: secondary cached Stackr estimates from TCGdex, TCGPlayer/TCGCSV, CardMarket and legacy summaries.
4. `ebay_active`: active asking prices only; maximum confidence LOW.

Active listings are stored as `active_listing`, never `sold_transaction`.

## Match Scoring

Each raw provider result receives a score from 0 to 1 using:

- Card name
- Collector number
- Set name/code
- Language
- Product type
- Finish/variant
- Edition
- Grader and grade

Default automatic inclusion threshold: `0.85`.

Hard exclusions include lots, bundles, mystery products, proxies, customs, replicas, reprints, digital items, code cards, wrappers-only, oversized cards and raw/graded mismatches.

## Normalisation

Each observation stores original values before conversion:

- Original item price
- Original shipping price
- Original currency
- GBP conversion rate and timestamp
- Normalised GBP item price
- Normalised GBP delivered price

High shipping is flagged rather than allowed to distort the estimate.

## Calculation

The engine does not use a simple arithmetic average.

Process:

1. Keep only exact identity observations.
2. Remove rejected matches.
3. Deduplicate by external reference or observation hash.
4. Split sold, market-estimate and active-listing evidence.
5. Normalise currencies.
6. Flag uncertain Best Offer/shipping evidence.
7. Remove statistical outliers using MAD or IQR.
8. Weight by source reliability, match score squared, recency and sale type.
9. Use weighted median for the final value.
10. Use weighted lower/upper quantiles for the range.
11. Calculate confidence and review flags.

Decision hierarchy:

- Case A: At least 3 verified sold comps: sold evidence is primary.
- Case B: 1-2 sold comps plus secondary data: combined, reduced confidence.
- Case C: No sold comps but secondary estimates: secondary consensus.
- Case D: Active listings only: lower-end asking-price indication, LOW confidence.
- Case E: No current data: return stale verified value if available, otherwise insufficient evidence.

## Confidence

Confidence is scored 0-100 from:

- Match quality
- Exact comp count
- Verified sold comp count
- Recency
- Price dispersion
- Source reliability
- Source diversity
- Language certainty
- Variant certainty
- Condition/grade certainty

Labels:

- High: 75+
- Medium: 50-74
- Low: below 50

Active-listing-only valuations are capped at LOW.

## Storage

V2 writes:

- `price_observations`: raw and normalised evidence, match score, explanation and inclusion reason.
- `market_price_snapshots`: cached final V2 estimate and explanation fields.
- `pricing_sources`: provider capability and health registry.
- `pricing_review_queue`: source disagreement or no exact evidence.

V2 extends existing tables instead of removing legacy pricing.

## Environment

Server-side:

- `PRICING_ENGINE_V2_ENABLED=true`
- `SUPABASE_PROJECT_REF=oakdbbzdqwurpjnoqhmu` or `SUPABASE_URL=https://oakdbbzdqwurpjnoqhmu.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` or Supabase's newer `SUPABASE_SECRET_KEY`
- `EBAY_CLIENT_ID`
- `EBAY_CLIENT_SECRET`
- `EBAY_MARKETPLACE_ID`
- `EBAY_SOLD_API_URL` only when authorised sold-data access exists
- `EBAY_SOLD_API_KEY` only when authorised sold-data access exists
- `USD_TO_GBP`
- `EUR_TO_GBP`
- `JPY_TO_GBP`
- `PRICING_V2_MIN_MATCH_SCORE`

Client-side:

- `EXPO_PUBLIC_PRICING_ENGINE_V2_ENABLED=true`
- `EXPO_PUBLIC_PRICE_API_URL`

Provider keys must not be placed in the mobile client.

## Commands

```bash
npm run test:pricing-v2
npm run pricing-v2:baseline -- --output=docs/pricing-v2-baseline-report.md
npm run pricing-v2:backfill -- --language=ja --limit=100 --dry-run
npm run pricing-v2:backfill -- --language=ja --limit=100
npm run pricing-v2:deploy
npm run pricing-v2:compare -- --language=ja --limit=200
```

Use `--ignore-feature-flag` only in a controlled validation environment.

### Full Deployment Runner

```bash
npm run pricing-v2:deploy
```

Default behaviour:

- Runs Pricing V2 tests.
- Writes a before baseline report.
- Dry-runs each language lane.
- Backfills `en`, `ja`, `zh-tw`, `zh-cn` and `ko` raw-card and sealed-product identities.
- Skips identities that already have a V2 snapshot, so the command is restartable.
- Keeps eBay active-listing calls disabled by default during the full catalogue fill.
- Runs a queued refresh pass.
- Writes an after baseline report.
- Runs comparison reports by language.

Use `--include-active-listings` only for a deliberate active-listing refresh, because a full-catalogue run can create a very large number of eBay Browse requests.

## Release Gate

Do not switch production UI fully to V2 until:

- Migration succeeds.
- Baseline report has been generated.
- Backfill has run.
- `npm run test:pricing-v2` passes.
- `npx tsc --noEmit --pretty false` passes.
- Comparison report highlights differences above 25%.
- No raw/graded contamination is detected.
- No language contamination is detected.
- Cached API latency is acceptable.
