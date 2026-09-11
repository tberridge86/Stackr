# Owner pricing readback — 11 September 2026

## State and scope

The owner reported that the suggested card could not be found by search, was reachable through a binder, and still showed no price after the reported Cloudflare owner-variable change. That is a failed device acceptance check, not completed pricing recovery.

This candidate starts from `10e1f4c64735102136e0d4c9d730e1f8ee829ea5` and changes only the collection-price loader's response to systemic request failures, its regression tests and read-only CI. It does not deploy the gateway/backend, update the installed client, change provider scope, rotate refresh selection, populate canonical estimates or establish a successful authenticated Claydol quote. Standard CI, integration and compatible owner-client delivery must be recorded separately.

## Read-only production observations

Source: Supabase connector SQL against `oakdbbzdqwurpjnoqhmu`, `audit.observability_events`, `api.catalogue_cards`, `api.market_price_estimates` and `public.market_price_snapshots`; Railway runtime logs for deployment `5cbc34ff-788d-4efb-a893-cacf909c17e6`. Observed at 19:49:10 UTC and checked again at 19:58:22 UTC. No production writes were made during this investigation.

| Recorded event | Scope and result |
| --- | --- |
| Search rate limiting | 707 recorded gateway search HTTP 429 events between 19:45:54.919 and 19:47:15.698 UTC. These events are not individually attributed to a device/account by this receipt. |
| Price timeouts | 14 recorded card-price HTTP 504 events between 19:46:02.798 and 19:46:03.291 UTC; mean recorded duration 9,795 ms. |
| Price service errors | 5 recorded card-price HTTP 503 events between 19:46:03.401 and 19:46:03.434 UTC. |
| Later successful HTTP response | One recorded card-price HTTP 200 at 19:48:12.042 UTC; gateway duration 4,774 ms. HTTP 200 is not evidence of a positive quote. |
| Access denials | Zero recorded card-price HTTP 401/403 events from 19:40 UTC through the 19:58:22 check. This is not an independent attestation of the current Cloudflare version/bindings or of every user's access. |
| Canonical estimates | `api.market_price_estimates` still contained zero rows. The source-labelled TCGdex fallback must be assessed independently. |

The later HTTP 200 correlates to request `11dd52e4-8762-4020-8193-057c177d4c6b`, trace `f18fcceee9eb4b41cb510d73550472f0`, path `/v1/cards/8aa7b1ea-372c-416b-b644-a381ad914359/price?productType=raw_card&currency=GBP`. Catalogue SQL identifies this as English **Krookodile ex, Chaos Rising 055, holo**, printing `32f95dbd-067f-4189-9f0e-8bf1382b48bb`. No global snapshot was found under either of those variant/printing IDs. The current exact provider refresher is normal/default-only. This supports a separate coverage gap; it does not prove which card the owner intended to test or supply the response body.

The suggested **Claydol, Chaos Rising 047, English, normal** is variant `9bd2b346-f607-40c3-8642-b96fd6ecef2f`, printing `2b185d92-527a-4a70-b6bd-2f29d07adb37`, set `816ff627-a585-4953-99c4-a15c9b0b80e5`. Its global source-labelled TCGdex snapshot was saved at 18:02:34.636 UTC, provider timestamp 17:12:20.048 UTC, provider reference `me04-047`. This proves stored evidence, not an owner-authenticated response, current FX accuracy, or an individual completed sale. A positive authenticated response for this exact identity remains unverified.

## Demonstrated loader defect and repair

Before this patch, `resolveAnyReference` catches every failed request and tries the next alias. The batch then moves on to every other collection row, including after 401, 403, 429 and service errors. A throttle or an owner denial cannot be repaired by trying the same card's name instead of its ID. The code also collapsed pricing transport failures to a generic unavailable result.

This patch preserves genuine no-match/404 alias fallback and item-specific failure isolation, but stops new work within the current collection-price load when a recognized authentication, authorization, throttle, server or network failure occurs. Already-completed prices and in-flight results are preserved. Unscheduled rows remain null and carry a deferred failure classification rather than being counted as successfully priced. Deferred rows have no request ID of their own. There is no automatic retry, global owner-price cache, new provider, relaxed identity rule, limit increase or permanent account lockout.

The structured `requestFailure` field distinguishes request failure from HTTP-200 missing evidence at the loader boundary. This receipt does not claim all existing screen components have been updated to display it.

## Local controlled regression evidence

Node 22.16.0, real `lib/collectionPricingApi.ts`, injected identity/API dependencies only:

```sh
node --experimental-strip-types --test scripts/test-collection-price-backpressure.mjs
```

17 tests passed. Coverage includes serial/parallel throttles; 401/403/429/500/503/504 quote failures; retained successful prices; HTTP-200 unavailable data; 404 alias fallback; item-specific errors; wrong finish/missing condition/unresolved identities; load/account isolation; superseded work; network failure; and a healthy in-flight sibling.

For the same controlled **300 rows, 3 distinct aliases each, concurrency 1, every resolution returns 429** fixture:

- Exact baseline blob `af37397f2a5e5b4bda8d79302067f0220e93acfd`: **900 resolver calls**, regression fails as expected.
- Patched loader: **1 resolver call**, 299 unrequested rows marked deferred.
- Patched concurrency-4 case: **4 resolver calls**, 296 deferred rows.

These are deterministic loader call counts, not a measured production reduction, network latency result or proof that this loader generated all 707 recorded 429s. Other callers, UUID-to-search fallbacks and overlapping screen loads remain potential sources of traffic.

## Remaining acceptance and release handoff

1. Correlate the owner's exact displayed card/finish and installed client with a request, then capture the actual price response status/body/source/timestamp without exporting credentials.
2. Verify the published gateway's personal owner binding, real owner success and other-user/anonymous denial independently; do not declare a private endpoint fixed from HTTP status alone.
3. Deliver this bounded client patch through the existing compatible owner release lane after reviewed CI. Do not publish or overwrite the unrelated frozen performance candidate in PR #184.
4. Resolve remaining search traffic amplification and the slow underlying price read; do not hide failures by increasing rate limits/timeouts.
5. Repair missing/stale refresh rotation and exact holo/reverse coverage separately, with provider, language, finish and condition provenance intact. Do not substitute normal prices for holo cards or label provider estimates as eBay last sold.

Rollback of this candidate is source-only until an owner client update is published. No database migration or configuration rollback is needed for this patch.
