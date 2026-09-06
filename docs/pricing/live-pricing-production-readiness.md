# Live pricing: release candidate, not an accuracy certification

Prepared 5 September 2026 for the owner's private Stackr use. Internal authority: [operating boundary](../stackrtcg-ip-operating-boundary.md). This work does not approve public redistribution, provider charges, or scraping. No production write, provider refresh, or deployment was performed during this preparation.

Updated 6 September: the owner confirmed personal use and asked that permission questions stop. That instruction is now recorded in the operating boundary. Continue the technical work without further document-upload prompts. The personal-use implementation below is prepared locally; existing provider activation controls and real-sale accuracy requirements are not represented as completed.

## What this candidate delivers

- A smaller Home tracker, explicit manual refresh, foreground-only reads every three minutes, and rotating batches of 12 refresh requests every 15 minutes. Manual runs cover at most 100 eligible cards. These are target polling intervals, not a guarantee of new sales or job-start times.
- An authenticated, idempotent refresh queue with exact card, language, printing, finish, edition and condition metadata. Requests return queued/pending/cooldown, never “price updated” before a provider response is stored.
- One serialized scheduled worker, capped at 30 due requests per run with spacing between cards. Five-minute runs are skipped while disabled; there is no full-catalogue sweep. Gateway writes are limited to 30 per minute, 12 variants per batch, and are not cached.
- Canonical sale-derived estimates published into the store consumed by the main pricing API, with transactional acknowledgement before the request is completed. The publisher defaults to read-only and admits only exact raw-card GBP sales within a bounded 180-day, 200-observation scope.
- Chart snapshots project the acknowledged canonical estimate, preserving the same GBP item-price amount, exact variant, source and expiry. They never turn a multi-sale average into an individual "Last sold" amount. Provider changes, shipping-basis changes and asking-to-sold transitions restart comparable chart history instead of inventing movement.
- Retained sale evidence with provider/item IDs, original item price and currency, sale timestamp, exact identity, source URL, raw-evidence hash and verification state. Cross-provider repeats of an eBay item are counted once; conflicting prices or sale timestamps are excluded.
- Separate labels for asking prices, provider aggregates, source-labelled legacy estimates and individually evidenced sales. Unknown shipping remains unknown. Canonical sale aggregates use item price excluding shipping, not an invented delivered price.
- History uses real stored snapshots, source/identity filtering and per-identity time buckets. An unchanged market may legitimately produce a flat line. Partial collection coverage, played/graded/sealed cards and expired carried-forward quotes cannot manufacture portfolio movement.
- Personal pricing is the default: backend and gateway verify the configured owner before reading prices or accepting refreshes. Legacy pricing/PokeTrace routes follow the same check. Responses are private and not shared-cacheable. Pricing client reads carry the user's token over HTTPS, bypassing the anonymous loopback preview proxy; catalogue requests remain anonymous.
- A sixth migration blocks direct client reads of retained raw observations and shared snapshots. Authenticated users retain their own personal-snapshot read/write path; service-role processing remains intact. No existing price rows are deleted.

## Production evidence inspected (read-only)

Snapshot taken during this preparation on 5 September 2026, not a continuously updated health report:

| Store | Observed state |
| --- | --- |
| Canonical sold observations | 0 |
| Canonical price estimates | 0 |
| Legacy public price observations | 0 |
| Legacy market snapshots | 332,779 |
| Snapshots without a source label | 332,374; not eligible as verified sold evidence |
| Source-labelled TCGdex snapshots | 405 (357 TCGplayer-derived, 48 Cardmarket-derived); estimates only |
| Production PostgreSQL | 17.6; `pg_catalog.sha256(bytea)` available |
| New canonical batch publication RPC | Not installed at inspection |

The former producer/consumer gap was real: scheduled legacy refreshes wrote market snapshots while the main API read the empty canonical estimate store. This candidate connects those paths without relabelling the old rows as sales.

## Release gates and exact rollout order

1. Pass `npm run test:personal-pricing`, `npm run test:live-pricing`, `npm run test:collection-pricing-ui`, `npm run typecheck`, `npm run typecheck:backend`, `npm run lint`, `npm --prefix gateway test` and `npm run check:api-contract`. Existing unrelated lint warnings are not accuracy evidence. Platform CI runs the new regression suite and an isolated PostgreSQL 17 fixture rehearsal.
2. Review the six pricing migrations listed below against the target's actual schema and rehearse the application, retained-evidence ingestion and publication on a permitted non-production database. The in-memory fixture checks SQL behaviour, not production schema completeness or provider accuracy. Duplicate active canonical estimate scopes must be reviewed; the unique-index migration deliberately fails instead of deleting them.
3. With deployment/database approval, apply those migrations in order, then deploy backend and gateway before the frontend. Keep `MARKET_PRICE_REFRESH_ENABLED=false`, `PRICING_ENGINE_V2_ENABLED=false`, `PRICING_V2_CANONICAL_PUBLISH_ENABLED=false`, and both PokeTrace controls false until their checks below pass. Never deploy the migration test fixture to a shared database.
4. Bind the worker to an explicit `STACKR_EXPECTED_SUPABASE_PROJECT_REF` and matching `SUPABASE_URL`. Use protected server secrets; neither eBay nor PokeTrace secrets belong in the app. Railway/Supabase settings do not automatically populate the scheduled GitHub worker environment.
5. For sold evidence, attach the owner's stated written permission/T&Cs to a recorded source-specific review, including retention, transformation, attribution and delivery scope. The checked-in pending template is not permission. Complete the labelled manual PokeTrace/Terapeak benchmark and bind its reviewed report and rights-review hashes to the deployed checkout. Every matched sale must agree on its native-currency item price; percentage-error statistics alone cannot pass activation. The manual date comparison is day-level and does not certify exact intraday timestamps. Do not scrape Terapeak or 130point. Private use narrows deployment scope but does not prove the data feed's accuracy.
6. Only after the documented provider review, database rights ledger and benchmark pass, configure the PokeTrace Scale secret and matching enabled/authorised flags. Run the offline activation checker first. Keep eBay seller-account sales and active Browse results out of last-sold evidence. UK coverage is not established by a GBP display price; this candidate does not invent a CompSniper integration or convert US sale evidence into a UK-sale claim.
7. Configure `STACKR_PRICING_ACCESS_MODE=personal` and the same scalar `STACKR_PRICING_OWNER_USER_ID` on backend and gateway, using the actual owner account ID rather than a role/admin claim. Missing/malformed owner configuration fails closed. Deploy the privacy migration and both access controls before activating writes; do not opt into the explicit legacy `public` mode for this personal-use rollout. Enable the worker and canonical publisher in a bounded canary, then enable backend `MARKET_PRICE_REFRESH_ENABLED` only when that worker is operational. Confirm one authenticated exact-variant request drains, individual sale evidence is retained, the canonical write is acknowledged, and the same variant/condition/currency is readable through the owner-authenticated gateway. Verify anonymous/other-user/legacy/direct-database denials. A 200 response with no evidence is not success. Inspect source links, item prices, dates, counts, freshness and chart history before expanding beyond the canary.

Migrations, in order:

1. `20260903120000_deduplicate_pending_price_refreshes.sql`
2. `20260903210000_verified_sold_provenance.sql`
3. `20260904123000_poketrace_sold_evidence_provider.sql`
4. `20260904130000_market_price_snapshot_history_buckets.sql`
5. `20260904131000_exact_variant_price_refresh_queue.sql`
6. `20260906063316_personal_pricing_privacy_boundary.sql`

Do not replay the first transitional queue index after the fifth migration, which replaces its index name. Both now preserve sibling variants, including during initial migration. The rehearsal explicitly checks the supported final-state reapplications.

## Honest completion criteria

Code and fixture tests do not make the live feed “super accurate.” At the 5 September inspection, production had no individually evidenced sold rows. The live-feed configuration, passing real benchmark, target migration rehearsal, deployment and bounded live canary remain technical completion criteria. Do not repeat permission questions during this personal-use implementation. Provider-observed completion is also not a guarantee against later cancellation/refund, which PokeTrace does not expose in the reviewed contract.

If a canary fails, disable manual queue admission, the exact worker and canonical publishing; disable PokeTrace delivery/ingestion at both runtime and database rights controls. Preserve evidence and pending requests for diagnosis. Do not erase canonical tables or replace rejected evidence with asking prices. Show an unavailable/stale label and retain the last honest timestamp.

## Local verification receipt — 5 September 2026

- Live-pricing regression suite, offline benchmark-tool tests, collection-pricing UI tests and API client/route integration tests passed.
- App and backend TypeScript checks passed. Standard lint passed with zero errors and ten pre-existing warnings. The staged release passed the repository secret scan and whitespace checks.
- Gateway: 26/26 tests passed. Generated API contract matched; documented route coverage 37/37.
- Isolated in-memory PostgreSQL 17.5 and 18.3 rehearsals passed the five migrations, supported reapplications, exact queue deduplication, provenance checks, canonical publication and synthetic PokeTrace ingestion. Cases include wrong card/finish, invalid price, repeated ingestion and raw-payload tampering. Synthetic approvals are transaction-local and rolled back; no production approval or sale was created.
- Fixed SQL syntax and privilege issues found by the rehearsal without granting the pricing role write access to the approval ledger or catalogue.
- This candidate is isolated on `codex/live-pricing-evidence-ready-20260905` in `D:\Stackr-live-pricing-ready-20260905`. Existing uncommitted work and the preview in `D:\Stackr-1` were preserved. The existing preview is not evidence that this release branch is deployed.

## Personal-use verification receipt — 6 September 2026

- Personal-pricing backend and client tests passed: verified owner access, anonymous/other-account denials, private error responses, authenticated refreshes and direct HTTPS token delivery. Public catalogue reads remain unchanged. The client harness emits an existing Expo logger warning; its assertions pass.
- Gateway tests passed 27/27, including owner checks before shared caches and private idempotency-replay responses. Generated API contract matched with 37/37 documented operations.
- Live-pricing, collection-pricing UI and API integration regressions passed. App/backend type checks passed; lint passed with zero errors and ten pre-existing warnings. Repository secret scan passed.
- Isolated PostgreSQL 17.5 and 18.3 rehearsals passed all six migrations. In addition to ingestion/publication checks, the fixture proves anonymous/other-account/shared-row read denials, raw-observation read denial, rejection of forged shared or cross-owner inserts and ownership reassignment, and preservation of legitimate personal-row writes and service reads. Existing permissive policies are included in the adversarial fixture.
- No production data, provider controls, credentials or deployment were changed by these checks. Live provider results and the current preview have not been validated against this release candidate.
