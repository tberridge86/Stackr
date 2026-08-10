# Stackr API Migration Plan

Audit date: 2026-07-27
Stage 1 did not create migrations, implement API routes, push Supabase changes or deploy.

## Migration Principles

- Additive first. Do not drop, rename or rewrite production tables in early stages.
- Feature-flag every client switch.
- Keep old and new paths running in parallel until parity is proven.
- Use request IDs and structured logs from the first route/service.
- Preserve current scanner UI and fallback behavior.
- Do not expose service-role keys, database credentials or provider credentials in mobile builds.
- Do not identify cards by name alone.
- Store provenance, retrieval time, source identifiers, confidence and licence/rights status for imported records.
- Do not claim a stage is complete until lint, type checking and relevant tests pass.

## Production Blocker To Resolve First

The connected Supabase project reported no recorded migration history while the repository contains 63 local migration files and many live tables. This means Stage 2 cannot safely apply production catalogue migrations yet.

Before production Stage 2:

1. Produce a schema-only live snapshot.
2. Compare live schema to committed migrations.
3. Decide whether the repository migrations are authoritative, historical reconstruction, or partial documentation.
4. Establish a non-destructive baseline migration strategy.
5. Generate/commit Supabase TypeScript database types.
6. Resolve live/local Edge Function drift.
7. Resolve live/local private storage bucket drift.
8. Add a CI gate before Railway production auto-deploys.

## Stage 2: Canonical Stackr Catalogue Database

Goal: implement the canonical trading-card data model in Supabase Postgres without breaking current app flows.

Stage 2 should create or migrate toward separate schemas where compatible:

- `catalog`: canonical games, languages, series, sets, cards/printings, variants, rarities, finishes, names, aliases, assets and catalogue versions.
- `ingest`: sources, import runs, raw source records, external source identifiers and data conflicts.
- `market`: price identities and public-safe/private market data split.
- `ml`: scanner benchmarks, recognition labels, feedback datasets and model evaluation metadata.
- `api`: public-safe projections for Supabase/API reads.
- `audit`: structured operational logs, change history and import/review events.

Private schemas `ingest`, `ml`, `audit` and private market tables must not be exposed directly through the Supabase Data API.

### Stage 2 Required Model Shape

The canonical key must be deterministic and should follow:

```text
game + language + canonical_set_id + collector_number + variant_code
```

Required support:

- English, Japanese, Simplified Chinese, Traditional Chinese and Korean.
- Native set/card names plus English display names and translated aliases.
- Collector numbers as strings, with separate sortable components.
- Set codes scoped by game/language/provider/canonical set identity.
- Normal, holo, reverse holo, first edition, unlimited, promo, stamped, Poke Ball, Master Ball and regional variants.
- Raw card, graded card and sealed product identities without combining them.
- Source provenance, confidence, raw source IDs and licence/rights status.
- Deprecation/correction fields without deleting historical identifiers.
- Catalogue version and change-sequence support for mobile delta sync.

### Stage 2 Database Safety

Stage 2 migrations should:

- Be generated through the Supabase CLI after a clean local iteration path is selected.
- Enable required extensions explicitly, likely `pg_trgm`; do not add vector columns yet.
- Use RLS on exposed schemas and defense-in-depth RLS on private schemas.
- Use `security_invoker` views for public-safe projections where available.
- Revoke direct public access to private schemas.
- Avoid deprecated `auth.role()` policy checks.
- Add grants intentionally for `anon`, `authenticated`, service roles and admin/service functions.
- Add B-tree, full-text and trigram indexes based on tested query shapes.
- Include reversible rollback SQL or safe down-plan notes.

### Stage 2 Tests

Migration tests must cover:

- Duplicate collector numbers in the same set with different variants.
- Duplicate collector numbers across different sets.
- Conflicting external IDs.
- Translated names and aliases.
- Variants sharing the same artwork.
- Raw, graded and sealed identities remaining separate.
- Public-safe projection excluding raw payloads, internal notes, provider secrets and licensing-review internals.
- RLS/grant behavior for anon reads, authenticated reads, admin writes and service-only ingestion writes.

## Stage 3: Read-Only API Facade

Goal: introduce the first `/v1` routes only after the canonical schema/projection is available in a safe environment.

Initial routes:

- `GET /v1/health`
- `GET /v1/catalogue/cards/:id`
- `GET /v1/catalogue/search`
- `GET /v1/catalogue/sets`
- `GET /v1/prices/cards/:id`

Acceptance:

- Request IDs and structured logs on every route.
- API response contracts covered by tests.
- Feature flag off by default in the mobile app.
- Current direct Supabase path remains the fallback.

## Stage 4: Pricing Service Cutover

Goal: move pricing reads and refresh workflows to a single pricing service.

Scope:

- Pricing route under `/v1/prices`.
- Pricing V2 methodology response shape.
- Queue-backed refresh.
- Evidence/source breakdown.
- Separation of sold/verified evidence and active asking-price indications.
- Review queue for insufficient/conflicting evidence.

Rollback:

- Disable Pricing V2/API flag.
- Use current app pricing fallbacks.
- Pause refresh workers if provider pressure or data quality is poor.

## Stage 5: Recognition Service Wrapping

Goal: make scanner recognition calls pass through a private recognition service without changing the scanner UI.

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
- Restore current `identifyCardsDetailed` path.
- Keep feedback records backward-compatible.

## Stage 6: Feedback Dataset And Scan Lab

Goal: make feedback, shadow-mode pilot and scan-lab uploads part of a single API event spine.

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
- Do not delete consented data except through explicit user deletion/withdrawal flow.

## Stage 7: Provider Adapter And Ingestion Queue Consolidation

Goal: move all provider access into workers/adapters.

Scope:

- TCGdex adapter.
- TCGCSV adapter.
- Pokemon TCG adapter where permitted.
- PokeData/PokeWallet/ScryDex adapters only where rights are approved.
- Pricing adapters.
- Image cache adapter with rights checks.
- Provider sync logs, import runs and retry queues.

Rollback:

- Pause workers.
- Keep old cached records.
- Correct bad metadata additively rather than destructive deletes.

## Stage 8: Retire Direct Mobile Data Paths

Goal: remove mobile direct table/provider access once coverage, RLS equivalence and API parity are proven.

Scope:

- Replace direct Supabase table reads/writes with API client calls.
- Keep Supabase Auth only if it remains the identity provider.
- Remove direct provider fetches from app screens.
- Remove direct provider-backed Supabase Edge Function invocation.
- Delete obsolete fallback code only after a release soak.

Rollback:

- Maintain at least one release with old paths still present behind disabled fallback flags.
- Re-enable old flags if API error budgets fail.

## Rollback Procedure For Stage 1

No production rollback is required for Stage 1 because only documentation was changed.

To revert Stage 1 documentation changes:

```text
git restore docs/stackr-api
```

If Stage 1 docs are committed and pushed, revert that commit through a normal pull request rather than force-pushing.

## Stage 2 Recommendation

No-go for production Stage 2 migration today.

Exact next work before Stage 2: reconcile Supabase migration history and live/local drift, then run Stage 2 canonical catalogue database work against a local or isolated Supabase environment before production.
