# Stackr API Migration Plan

Audit date: 2026-07-27
Stage 1 did not create migrations or implement API routes.

## Migration Principles

- Additive first. Do not drop, rename or rewrite production tables in early stages.
- Feature-flag every client switch.
- Keep old and new paths running in parallel until parity is proven.
- Use request IDs and structured logs from the first route.
- Preserve current scanner UI and fallback behaviour.
- Do not expose server credentials or provider keys in mobile builds.
- Do not claim completion until lint, type checking and relevant tests pass.

## Stage 2: API Facade And Baseline Hardening

Goal: create a minimal versioned API surface without changing user-visible scanner behaviour.

Scope:

- Add `api.stackr.app` route shape locally or in the current backend.
- Add `/v1/health`.
- Add request ID middleware.
- Add structured backend logging.
- Add API client wrapper in the app.
- Add read-only catalogue/search facade routes for selected current app reads.
- Add read-only pricing facade for Pricing V2 response shape.
- Add tests for API response contracts and auth failure states.
- Add a production-safe schema snapshot process.

Feature flags:

- Keep direct Supabase reads as fallback.
- Keep existing Railway endpoints as fallback.
- Keep Ximilar/CardSight fallback enabled.

Acceptance:

- Lint and type checks pass.
- Existing scanner tests pass.
- New API contract tests pass.
- No service-role/provider credential is present in the client bundle.
- Direct app behaviour remains unchanged when the API flag is off.

## Stage 3: Catalogue And Search Cutover

Goal: move catalogue/search reads behind Stackr API.

Scope:

- Canonical search endpoints for cards, sets, printings, variants and sealed products.
- Exact identity keys that include language, set, collector number and variant.
- Backward-compatible projections for screens currently reading `pokemon_cards` and `pokemon_sets`.
- Read-through caching and response freshness headers.
- Coverage report endpoint by language/set/source/rights status.

Rollback:

- Disable catalogue API client flag.
- Return app to direct Supabase read path.
- Leave additive schema untouched.

## Stage 4: Pricing Service Cutover

Goal: move pricing reads/refresh to a single pricing service.

Scope:

- Pricing route under `/v1/prices`.
- Pricing V2 methodology response shape.
- Queue-backed refresh.
- Evidence/source breakdown.
- Active listing vs sold/verified evidence separation.
- Review queue for insufficient/conflicting evidence.

Rollback:

- Disable Pricing V2/API flag.
- Use current app pricing fallbacks.
- Stop queue workers if causing provider pressure.

## Stage 5: Recognition Service Wrapping

Goal: make recognition calls pass through a private recognition service without changing scanner UI.

Scope:

- `/v1/recognition/identify`.
- Request size/image validation.
- OCR hints and capture metadata.
- Ximilar/CardSight/local visual fallbacks behind one service.
- Provider decision logs.
- Shadow-mode local recognition snapshots.
- Feedback dataset linkage.

Rollback:

- Disable recognition API flag.
- Restore direct current `identifyCardsDetailed` path.
- Keep feedback records compatible.

## Stage 6: Feedback Dataset And Scan Lab

Goal: make feedback, shadow-mode pilot and scan-lab uploads part of the API event spine.

Scope:

- Versioned feedback routes.
- Consent and deletion handling.
- Signed/private image uploads.
- Dataset export manifests.
- Leakage checks by physical card session.
- Reviewer/admin API boundaries.

Rollback:

- Disable upload flags.
- Keep local queues.
- Do not delete already-uploaded consented data except through explicit user deletion/withdrawal flow.

## Stage 7: Provider Adapter And Ingestion Queue Consolidation

Goal: move all provider access into workers/adapters.

Scope:

- TCGdex adapter.
- TCGCSV adapter.
- Pokemon TCG adapter where permitted.
- PokeData/PokeWallet/Scrydex adapters where permitted.
- Pricing adapters.
- Image cache adapter with rights checks.
- Provider sync logs and retry queues.

Rollback:

- Pause workers.
- Keep old cached records.
- Use corrective migration for bad metadata rather than destructive deletes.

## Stage 8: Retire Direct Mobile Data Paths

Goal: remove mobile direct table/provider access once coverage and parity are proven.

Scope:

- Replace direct Supabase table reads/writes with API client calls.
- Keep Supabase Auth only if still the auth provider.
- Remove direct provider fetches from app screens.
- Remove direct Supabase Edge Function invocation.
- Delete obsolete fallback code only after a release soak.

Rollback:

- Maintain one release with old paths still behind disabled fallback flags.
- Re-enable old flags if API error budgets fail.

## Migration Gaps Before Stage 2

- Authoritative production schema snapshot is needed because committed migrations do not fully create every table currently used by the app.
- Generated Supabase TypeScript database types are missing.
- No mobile build CI workflow was found.
- Backend request ID and structured logging need to be added before expanding routes.
- Local recognition model/catalogue assets are blocked.

## Stage 2 Recommendation

Proceed with Stage 2 only as a limited API facade and instrumentation stage. Do not perform scanner primary-path replacement, destructive migrations or provider cutovers yet.
