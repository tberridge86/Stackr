# Build 60 pricing implementation and evidence

Date: 2026-10-22. Work performed in the isolated repair checkout at `D:/Stackr-1/.tmp-build60-20261022/repair`, based on `b6fb68aa479bbb391554ff1c95b0f5311edd9b90` with the upstream `2172db553ef8cc717ac4a65872a7be163243ffdf` source overlay. This report records the pricing specialist's completed local implementation and checks, not production or device evidence.

## Findings and changes

- `lib/pricing.ts` accepted `forceRefresh` but did not forward it to `fetchStackrPrice`. The fix forwards `force: true` so a manual stored-price read bypasses both the presentation cache and the persisted exact-price cache. Ordinary reads retain their account-scoped caching.
- Existing `/market/movers` read a bounded sample from `market.price_estimates`. Its latest-two-estimate comparison did not establish daily movement. Daily bulk catalogue guides overwrote their latest rows and supplied no comparable retained history to that endpoint. The app's market lane was already independent of collection membership; changing a collection filter alone could not fix this gap.
- New opt-in `scope=catalogue_daily` with `sortBy=money|percent` reads the supported current published catalogue, ranks both movement directions globally before the output limit, and returns explicit coverage. Legacy requests retain their prior contract. An absent daily RPC fails explicitly; it never falls back to the legacy sample or collection prices.
- Append-only migration `supabase/migrations/20261022064554_catalogue_daily_market_movers.sql` adds private immutable guide receipts and service-only capture/read functions. Existing approved TCGCSV guide writes retain their OLD and NEW quote payloads, including original amount/currency, FX provenance, identity and provider dates. No provider retrieval or schedule is added.
- Daily comparisons require actual consecutive UTC source dates, matching provider product, printing, set, language, finish and catalogue publication, with a usable current guide no older than 48 hours. Same-day revisions cannot become extra days; corrected prior-day revisions remain receipts. Missing days, remaps, stale/future quotes and conflicting FX amounts do not produce daily movers.
- Supported guide evidence is TCGCSV English/Japanese normal, holo and reverse-holo raw-card market-guide evidence. It remains condition-unspecified and carries no completed-sale claim. Blended Cardmarket evidence and unsupported languages are not silently substituted. Coverage reports published, supported, quoted, comparable, unsupported, unquoted, stale and insufficient-history variants; unchanged comparable prices count toward coverage without invented movement.
- `backend/lib/marketPricing/service.js`, `backend/routes/v1.js`, `lib/valueHistoryRead.ts` and `docs/stackr-api/openapi.v1.yaml` implement and validate the daily contract. The route forwards coverage and retains the personal response cache boundary. The transform preserves source amounts and validates daily provenance; legacy callers retain their paired-estimate behavior.

## Checks executed by this specialist

- `node --import tsx scripts/test-market-history-client.ts` — passed. The new regression was also run with only the forwarding fix temporarily removed: it failed with `actual undefined`, `expected true`; restoring the fix passed. The temporary reversal was restored.
- `node scripts/test-catalogue-daily-movers.mjs` — passed against real PGlite SQL and the actual pricing service. The fixture contains more than 220 identities and verifies global cash/percentage tails, full coverage before result caps, OLD/NEW capture, immutable source/FX receipts, repeat-date deduplication, corrected day revisions, timezone offsets, date gaps, remaps, staleness, future dates, invalid FX, retired variants, role restrictions and missing-schema failure. The actual route handler was also executed without a socket to verify coverage forwarding and private/no-store response behavior; this is not an independent authentication-middleware test.
- `node --import tsx scripts/test-value-history-daily.ts` — passed for global coverage, genuine UTC day pairs, penny movements, invalid/stale/future provenance, conflicting identities and insufficient history.
- `npm run typecheck:backend` — passed.
- `git diff --check` on this specialist's changed tracked files — passed.
- The unmodified `node scripts/test-market-pricing-service.mjs` could not complete because its socket route fixture received sandbox `EACCES` connecting to `127.0.0.1`. All remaining checks passed from an ephemeral copy omitting only `await assertRoutes();`; the temporary copy was removed. This is a qualified non-socket service-suite result, not a full unmodified-suite pass.

The integration lead subsequently reported 56 gateway scope-validation checks and source-review approval. Those later integration checks were not executed by this specialist. Application presentation, generated API types, overall TypeScript/lint checks and release integration are owned by the integration lead.

## Delivery limits and remaining evidence

No remote migration, SQL query, price refresh, provider activation, catalogue mutation, deployment or production/staging job was performed by this specialist. The migration was created locally with the CLI and exercised only against the local PGlite fixture.

The daily read itself is stored-data-only: one RPC, a validated 1–100 result limit, no per-card provider calls, no collection read, no refresh enqueue and no history write. Its global coverage/ranking scans the supported published source population before limiting returned movers; production performance has not been measured.

The migration remains unapplied remotely. Existing latest-only guide rows do not establish missing past days. After approved activation, a subsequent approved guide update can retain its prior row and new row; movement appears only when those receipts establish valid consecutive source dates. There is no synthetic history or silent historical backfill. Missing history and unsupported coverage must remain visible.

Backend activation, accumulated source-date history, configured-API response verification and installed-app/TestFlight verification remain separate release evidence requirements. Local passing fixtures do not establish live catalogue coverage, daily worker completion or device delivery.
