# Approved pricing promotion — 10 October 2026

The user explicitly approved deploying the coordinated reviewed pricing release and a bounded live refresh with API verification. PR [323](https://github.com/tberridge86/Stackr/pull/323) was merged as `ea8190f3a0bda642e266438b68f19d4f398f7845`; all executed merged-main Platform CI, gateway/app CI and owner identity checks passed. This receipt distinguishes deployment, provider processing, stored quote evidence and phone delivery.

## Production promotion

| Component | Promoted identity | Preserved rollback identity / evidence |
| --- | --- | --- |
| Railway backend | `d634a6c5-b8a3-49e1-b79f-f0aa38a93f79`; health attests `ea8190f3a0bd`, `bundled_workflow_sha`, production project `oakdbbzdqwurpjnoqhmu` | Previous `b594fd37-3c01-4642-a516-cf5c038d8442` |
| Cloudflare gateway | Version `71032825-4494-46c2-82b0-de3a21d6953d`, deployment `946af123-25ca-4a8b-89f1-e441b52f8bb0`, 100% traffic | Previous version `072eeb72-fb64-422c-a0ba-e97f54dbbf95`, deployment `156a0dfa-d273-4a8e-a81b-87e95097d06e`, tag `gateway-privacy-92e444124a2cedc9647444a2656ff5d8f9343ce8` |
| TCGCSV daily worker | Build `7bd09c88-a1f8-4b53-b4b3-ce66effdba3b`, pinned merged SHA, SUCCESS | Previous `a5e2d334-3e79-4ece-83e9-050a76443eab`; existing `13 * * * *` schedule/start command retained |
| Cardmarket daily worker | Build `ab681e9b-74b6-413d-a7c4-80af61805780`, pinned merged SHA, SUCCESS | Previous `eafd088d-4d3d-4c5b-8798-6280fde437e3`; `17 * * * *`, `/var/lib/cardmarket`, volume `86718ccd-b9a3-4570-ad10-c114a3be4eb6`, full ledger/checkpoint paths retained |

Repository variable `STACKR_CATALOGUE_PRICING_SCHEDULER=railway` gives the bulk lane one scheduler owner. Other owner/exact-provider activation flags were not changed. Cardmarket watch paths now also include `catalogue-price-daily-status.mjs` and `catalogue-price-database.mjs`.

The unrelated production staged patch `8e29d75c-d567-4a9a-9e96-8a40e51a22f3`, containing only the backend `PIKAQIAN_API_KEY` addition, remained STAGED with one change after deployment. No whole-patch acceptance, schema migration or catalogue correction was performed.

Before merging, production-scoped nonmatching watch holds prevented the existing full-owned worker, queued-owner worker and performance canary from auto-deploying. Each generated a SKIPPED deployment at the merge SHA. Original source, schedules and running deployment identities were retained. The full-owned worker already had a CRASHED deployment (`85ab229c-b224-46f6-8828-3915de54a43c`); this release did not restart that unbounded apply command.

## Executed evidence and limits

- Backend workflow [38042528663](https://github.com/tberridge86/Stackr/actions/runs/38042528663) successfully deployed and verified the bundled production SHA. Its broad smoke failed only because the first `pokemon/pikachu/cards?limit=1` source page was filtered to empty; all other health, language, published catalogue, search, image-delivery, commerce restriction and CORS checks passed. The failure was retained, investigated and not reported as a fully passing deployment.
- Gateway workflow [38042782973](https://github.com/tberridge86/Stackr/actions/runs/38042782973) passed. The existing Durable Object namespace `aa7d685ce0ee4139b5b70cf0b33db23c` and origin/admin secret bindings were attested, with 100% traffic on the new version.
- Additional actual gateway probes passed: valid `provenOnly=true` and past `soldSince` filters require owner authentication; invalid boolean, impossible calendar date and future cutoff return 400. General/exact catalogue reads require authentication. Pricing denials retain `private, no-store` and `Vary: Authorization`.
- The production pricing smoke passed nine checks against the actual backend deployment and gateway. `ownerPricingValidated=false`: no owner access token was available. Authentication was not bypassed or manufactured.
- A direct actual-backend pricing-service read against the production database verified six named vintage controls in `general` and `exact` modes. This validates actual service logic and stored source evidence, but is not an owner-authenticated HTTP or iPhone check.

## Bounded TCGCSV refresh and measured coverage

The exact merged worker ran locally using the existing production Railway service environment, explicit project binding and server-only credential. No credential values were printed or written. The direct CLI used `--apply --max-groups=1` with a ten-minute deadline. It finished without timeout and claimed zero groups because the current dated run was already processed. Therefore that call does **not** prove new quote writes.

Run `02f8ffc5-98fb-42b9-8a1e-42258b265535`, provider dataset `2026-10-09T20:05:19+0000`, read at 09:49–09:50 UTC:

| Measure | Result |
| --- | --- |
| Published variants scanned | 76,317 |
| Classified / unclassified | 76,269 / 48 |
| English TCGCSV quotes / stale | 23,125 / 15 |
| Japanese TCGCSV quotes / stale | 6,980 / 29 |
| Completed / unmapped groups | EN 168 / 52; JA 163 / 298 |
| Open repair records | 36,336 |
| Unsupported-language outcomes | 28,813 |
| Unsupported-finish outcomes | 1,240 |
| No-provider-quote outcomes | 4,843 |

Provider freshness is verified, but `fullCatalogueCurrent=false` and run status is `needs_mapping`. Counts are variant/source counts, not unique physical cards; provisional app baselines and separate Cardmarket blends are not silently added to TCGCSV coverage.

At 10:02:17 UTC a separately reviewed, one-shot two-row canary revalidated Alakazam/Mewtwo against the unchanged retained build. It inspected all 204 Base Set candidates with both global collision checks, made zero provider requests, and called `store_catalogue_bulk_prices` exactly once with two variant results and no `printingQuote`. The RPC acknowledged two results; authoritative readback confirmed the pinned printing/set/publication/product/language/subtype, positive GBP/USD amounts, FX source/date, unexpired provider dates and new finite `recorded_at` timestamps. Both recorded timestamps advanced from 9 October 20:14:05 to 10 October 10:02:17.689128 UTC. This is ingestion revalidation of the same provider build, not a new market-data publication. The full before-state and replay-prevention receipt were flushed to disk before the only write; ambiguous writes are never automatically replayed. The adapter passed eight in-memory regression checks and independent review.

## Vintage identity checks

Actual service reads returned fresh general estimates of £53.52 for Base Set Alakazam holo (`f9ca90c1-feed-4601-88ac-8fe58aad6b6e`) and £65.72 for Base Set Mewtwo holo (`86480ddd-a187-4fb2-90cd-aef268442317`). Source category 3/group 604/products 42346 and 42347 use USD 70.76 and 86.89, dated ECB USD/GBP `0.7564072818133143` on 9 October. They remain condition-unspecified general estimates; exact mode does not turn those guides into near-mint or sold evidence.

Jungle Scyther 10 holo and Fossil Dragonite 4 holo remain unavailable because exact provider identity is unresolved. Their rare/vintage identity excludes the generic common-card baseline. Scyther 26 normal and Dragonite 19 normal currently have Cardmarket blended general values (£32.10 / £266.83), explicitly unusable for exact variants or holdings. These amounts are not endorsed as accurate unlimited/near-mint prices: their cited raw-record evidence is missing in production, and the retained public products omit collector number, edition and finish. Source product pages returned 403. No new Cardmarket writes were performed for those unverified products.

The official Cardmarket products payload hash matched retained revision `6539ef8e-b899-4544-a5cc-6e8bfb849118`: `5c4e63a65594fc59f5e9da8fd48884088dada0ea13f9973f1aed2b8927bc3ef1`. Fresh guide revision `a1cef405-31f6-4e6d-803e-f64ab410828d` has hash `62c8c28eb297c1ebcc1dd86a590c105b649055b0c2a1ab6a2253a363da722b86`, source 10 October 00:48:43 UTC. Revision accessibility is proven; mounted-file and newly promoted cron execution must be separately observed before claiming that runtime path succeeded.

## Release boundary

The Pikachu smoke failure came from a published Traditional Chinese Marnie Trainer printing (`4a459e00-0853-43a7-b0a6-e9d0f56c42f6`) incorrectly carrying the English display name Pikachu. The route safely excludes Trainer/Energy identities. A bounded continuation fix scans at most four empty source slices and retains honest cursors, with tests for rejected aliases, language filtering and bounded resumption. The incorrect catalogue translation remains a separate data repair; it was not overwritten without the identity/provenance evidence.

The continuation repair passed `npm run typecheck:backend`, `npm run test:pokedex-release`, six independent actual-service in-memory assertions and scoped diff checks. Its live promotion and a repeated full gateway smoke are tracked separately from the initially failed backend workflow.

The last validated unsigned iOS export from runtime commit `07c12e0` is 11,593,655 bytes, SHA256 `6066af05384e7532e8b860dd2967abd9ffe7b125791aadcaedb20214d56cd30e`. It is not a signed native build or a TestFlight upload. Backend/gateway rollout alone cannot prove that existing iPhones have the corrected raw-panel caller, loading screens or haptics. Owner-authenticated HTTP proof and matching mobile delivery remain explicit release requirements.
