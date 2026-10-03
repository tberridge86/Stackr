# Catalogue price guide release readiness

## What is integrated locally

The release branch contains a separate, durable catalogue price guide. It is not a replacement for condition-specific or sale-backed valuation.

- `scripts/refresh-catalogue-bulk-prices.mjs` imports whole provider groups for TCGCSV category 3 English and category 85 Japanese, using namespaced feed keys, persisted set/card mappings, leases, resumable checkpoints, a 100,000-card group guard, and collision quarantine. It stores only condition-unspecified general market estimates.
- `supabase/migrations/20261003224016_catalogue_price_bulk_cache.sql` adds bounded service-only price reads, cache feed/retry accounting, and price-outcome tracking.
- `supabase/migrations/20261003224031_restore_full_catalogue_price_guide.sql` adds permanent provider set/card mappings, reviewed repair audit records, sweep state, coverage, and provider-build revision handling.
- `backend/lib/marketPricing/cataloguePriceRead.js`, `backend/lib/marketPricing/service.js`, `backend/routes/v1.js`, and `gateway/src/{routes,validation}.js` provide a private, user-authenticated `POST /v1/market/catalogue-prices` endpoint. It performs one bounded price-identity RPC for up to 100 references plus an optional batched Cardmarket fallback read, and never calls providers.
- `20261003231006_batch_catalogue_price_identity_reads.sql` replaces repeated wide catalogue serialization with one thin bulk identity read. `20261003232812_japanese_exact_price_identities.sql` resolves Japanese sets only when both the published set code and provider abbreviation are unique, then maps a product only with one exact canonical printing and one provider product at that collector number. Duplicate identities remain repairs; changed automatic codes quarantine their old quotes. English names and runtime translation maps are not Japanese price identity evidence.
- `20261003234257_bounded_published_price_read.sql` bounds actual variants before checking publication instead of expanding the whole catalogue view. `20261003234442_cover_general_price_foreign_keys.sql` adds the two missing general-price foreign-key indexes. Draft/deprecated records remain excluded; anonymous/authenticated database callers remain denied.
- `lib/cataloguePriceCacheCore.ts`, `lib/cataloguePrices.ts`, `lib/stackrDomainAdapter.ts`, and `lib/useCataloguePriceOverlay.ts` persist list prices by hashed account/server/language/mode scope. They render a saved quote immediately, refresh in the background, retain the last usable value on failure, and label stale values.
- `app/card/[id].tsx`, `app/pokemon/[id].tsx`, `app/set/[id].tsx`, `app/(tabs)/search.tsx`, and `features/binder/BinderDetailScreen.tsx` consume the general-guide overlay. Each price is labelled as a general estimate with its provider/freshness label and source date. Detail raw/GBP reads through `pricingV2` continue to use their separate exact, condition-aware cache path; an explicit refresh now also bypasses the one-minute presentation cache and the adapter cache.

The guide is deliberately independent of holdings. Coverage candidates are published catalogue cards, including unowned cards; ownership caches do not determine guide coverage.

## Validation performed locally

The following use local fixtures and PGlite. They did not access a provider, Railway, Supabase, or production catalogue.

- `node scripts/test-catalogue-bulk-provider.mjs` passed: category/language isolation, 600-card pagination, resumable runs, mapping reuse, cross-page identity collision quarantine, reverse holo, and disabled live rollout.
- `npx tsx scripts/test-catalogue-price-bulk-cache.ts` passed: service-only first migration read, exact/general isolation, revisions, persistent restart cache, and stale retention after refresh failure.
- `npx tsx scripts/test-catalogue-price-guide.ts` passed against all nine migrations: RLS denial for anonymous reads, EN/JA set maps, exact finish maps, feed evidence rejection, reviewed repair audit, resumable completion, coverage denominator, and newer provider-build revisions. The dedicated Japanese fixture also verifies code/number ambiguity, stale mappings, quote quarantine and idempotent requeue.
- `npm --prefix gateway ci --ignore-scripts && npm --prefix gateway test` passed 46/46.
- Full TypeScript, backend typecheck, and lint pass; lint retains existing warnings outside this change.

## Live evidence and present state

Read-only diagnostics found production has the legacy snapshots and TCGdex mappings, but none of the new bulk guide tables or RPCs yet. Therefore production currently has no imported whole-universe guide from this implementation. Staging `lmwfhvexfcoyeuoyrlco` has nine immutable, ledger-matched migrations, ending at `20261003234442`. The full product/price feeds for all 679 provider groups (220 English, 459 Japanese) were downloaded for build `2026-10-03T20:05:38+0000`, including unmapped groups. The first repaired Japanese canary priced 103/103 cards; 113 unambiguous Japanese code groups were safely requeued from the cached feeds. Final status is `needs_mapping`: 200 groups complete, 479 unmapped, 46,950 open repairs. Staging stores 9,937 English and 6,720 Japanese quotes, covering 22.31% of all 74,672 published variants or 36.42% of the 45,739 provider-supported variants. See [the final coverage and freshness receipt](releases/pricing-readiness-20261004.json). Full card coverage remains a release gate. Production has received neither the migrations nor an import.

The final service-role PostgREST read returned all 100 sampled English prices in 2,775/108 ms on first/repeat requests and all 100 Japanese prices in 747/116 ms. These measurements do not establish phone, signed-in gateway, or guaranteed cold database-cache performance. The code fixtures verify draft/deprecation/language eligibility; the live function privilege check confirms only service-role execution.

The existing Railway price worker remains owner-oriented. The full-guide workflow is guarded by `STACKR_CATALOGUE_BULK_PRICING_ENABLED`; the flag was enabled only for the completed manual staging operator runs. No worker remains running, and no schedule activation, deployment, or production migration was performed. The manual full-guide lane installs dependencies before running; guide scheduling remains separate from Railway's owner lanes. Daily conversion uses a recent attributed ECB observation unless a complete explicit FX observation is supplied.

TCGCSV requires a server-side client, `last-updated.txt` as the first revision check, daily download cadence, a custom user agent, and bounded request pacing. Its files provide product/subtype market fields, not condition-specific SKU pricing. See [TCGCSV documentation](https://tcgcsv.com/docs).

Cardmarket's public catalogue and price-guide downloads are a separate supported restoration path. Its guide is daily and may have blended language/condition scope, so it must be stored as a labelled general guide value until a verified exact mapping rule exists. See [Cardmarket's download announcement](https://news.cardmarket.com/en/Magic/were-making-the-price-guide-and-product-catalogue-available-for-download).

Comparable collector products publish broad guide values on roughly daily cadence rather than individually querying every visible card: [Collectr describes its 1–2 day price pulls](https://getcollectr.notion.site/Everything-You-Wanted-to-Know-About-Prices-f64d490171a549a2bcd1a037e7f74602), and [Dex documents selectable regional marketplaces](https://dextcg.com/help/preferences/set-your-currency-and-marketplaces).

## Remaining release gates

1. The guide regression and service-only/RLS staging smoke checks pass. Verify the new backend/gateway endpoint in a deployed signed-in owner session.
2. Review measured full staged sweep coverage, unmapped groups, open repairs and provider-build timestamps before enabling a recurring schedule.
3. Add reviewed mappings for ambiguous and provider-only sets. The worker must leave them terminally `unmapped` and report `needs_mapping`; it must never guess a set or card identity.
4. eBay OAuth and a bounded Browse probe passed in the deployed worker environment at 22:58:29 on 3 October, without mutating prices. Browse/listing evidence remains distinct from completed-sales evidence.
5. Complete the staged Cardmarket download import and record its source file revision, scope and labelling. The staged schema now retains original EUR with a dated, attributed GBP conversion; the reader accepts only its blended, unscoped general-estimate contract. Do not promote it to exact language, finish, condition, graded, or sold valuation.
6. Confirm the new price endpoint and overlays in a signed-in owner staging session: set, search and binder/list views must expose `general market estimate` or `stale general market estimate`, the source update date, and unavailable reasons without writing them into holdings.
7. Hold production migration, import, schedule activation, deployment, and TestFlight until all staged gates are accepted.
