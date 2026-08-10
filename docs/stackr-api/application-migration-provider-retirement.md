# Stackr Application Migration And Provider Retirement

Audit and implementation date: 2026-07-28
Stage: 14
Scope: repository changes and local verification only. No production database migration, deployment, cache purge, credential removal or feature-flag activation was performed.

## Current State Found

The mobile app previously mixed direct Supabase catalogue reads, provider-shaped pricing data, direct legacy backend URLs and recognition compatibility code. User-owned data such as binders, collections, offers, listings, profiles and authentication still uses Supabase directly and is intentionally outside this catalogue/search/recognition/pricing migration.

The repository now has one typed `StackrApiClient` for the public `/v1` contract and a `stackrDomainAdapter` compatibility boundary for existing screen models. The compatibility boundary preserves current UI object shapes while the API is being validated. It does not merge identities by card name.

`EXPO_PUBLIC_STACKR_API_ENABLED` controls the catalogue/search/pricing rollout:

- Off, which remains the default: existing Supabase catalogue and price snapshots are read through the centralized legacy adapter so current populated screens remain available.
- On: the same screen call sites use `StackrApiClient` catalogue, search, asset and pricing methods.
- The API flag is not activated automatically when a build succeeds.

This two-path rollout was restored after a reported visual/content regression. The home-page collection summary and binder completion tracker also retain their exact pre-migration Supabase calculations until the new catalogue proves one-for-one data parity. No theme, font, spacing, navigation or global colour implementation was changed by the Stage 14 correction. Device screenshot parity still requires UAT.

## Migrated Application Boundaries

The active card/set hydration, card search and raw/graded card price paths in inventory, offers, scan result, card detail, price builder, watchlist, community and trade context now enter through `stackrDomainAdapter` or `StackrApiClient`. Home and binder use that boundary for migrated enrichment paths, but their visible collection summary/completion calculations are an explicit parity hold on the original implementation.

Recognition shadow evidence now uses:

```text
mobile shadow recorder
-> StackrApiClient
-> POST /v1/recognition/shadow-comparisons
-> authenticated gateway
-> private Railway shadow pilot route
```

The gateway rejects image bytes and image URI fields, enforces body limits and idempotency, forwards the signed-in user session to the existing internal-tester route, and wraps the response in the v1 envelope. Admin list and review operations also use versioned client methods.

The legacy recognition engine no longer performs a routine mobile Ximilar identity call. It returns fallback-required evidence and leaves emergency provider execution on the server-side path controlled by existing feature flags.

## Identity Migration

Migration `20260728202949_stackr_application_migration_provider_retirement.sql` adds private audit tables for:

- reversible legacy-to-canonical identity mappings;
- quarantined unresolved mappings;
- recognition primary/shadow comparisons;
- versioned provider-retirement gate evaluations.

Mappings require both canonical printing and variant IDs before they can be marked mapped or applied. Ambiguous rows require a quarantine reason. Previous, proposed and applied identities are retained for rollback. A partial unique index prevents duplicate active mappings for the same source row.

The migration is additive and service-role-only. It was not pushed to the connected Supabase project. The manual rollback refuses to drop the ledger while any mapping remains applied.

No live user collection was rewritten in this stage. A staging reconciliation command and evidence report are still required before any mapping can be applied to production user data.

## Local Cache Handover

The new catalogue cache is SQLite-backed. The old local recognition index is in AsyncStorage, so a single cross-store transaction is not possible. Stage 14 implements a reversible two-phase handover:

1. Back up only the known legacy local-card-index keys.
2. Keep the old index intact while the new catalogue is downloaded and activated.
3. Require a verified active Stackr catalogue version.
4. Remove only the captured legacy index keys.
5. Keep the backup and migration state for rollback.

Collection summaries, binder settings, listing drafts, recent searches and other user storage keys are not touched. Automated tests cover preparation, activation refusal, successful activation, idempotency, isolation and rollback restoration.

## Provider Classification

| Dependency | Current Stage 14 position | Classification |
| --- | --- | --- |
| Supabase Auth and user-owned binder/collection/trade tables | Still used directly with RLS | Retain |
| Legacy Supabase card/set/price tables | Centralized flag-off compatibility path | Temporary fallback |
| Stackr `/v1` catalogue/search/assets/card pricing | Typed client and domain adapter | Retain as target primary |
| Ximilar recognition | No routine mobile identity call; server emergency path remains | Temporary fallback |
| Ximilar/Cardmatrix grading | Existing server route still called by grading UI | Wrap behind Stackr API before retirement |
| eBay card pricing | Replaced on migrated card screens by provider-neutral Stackr price objects | Replace routine card path |
| eBay sealed/accessory pricing | Existing legacy backend route remains active | Wrap behind canonical product API |
| Pokemon TCG API and TCGdex compatibility transforms | Dormant/quarantined code retained for rollback review | Remove only after gates pass |
| Third-party card image URLs | API path uses asset manifest; flag-off path retains existing references | Replace as rights-approved assets become available |
| PokeAPI character metadata and community location services | Not trading-card identity or pricing providers | Retain outside Stage 14 scope |

## Known Quarantine

The repository intentionally retains dormant compatibility code in `lib/cardSearch.ts`, `lib/pokemonTcg.ts`, `lib/binders.ts` and `app/prices/index.tsx`. A static migration test prevents those markers from spreading into other UI files. The code is not deleted because the provider retirement gates have not passed.

Active unresolved paths remain in product pricing, grading and the older recognition feedback/scan-lab APIs. These are release blockers, not silently accepted exceptions.

The home summary in `lib/collectionSummary.ts` and binder completion logic in `app/(tabs)/binder.tsx` are also explicit temporary exceptions. They may read only the existing Supabase set/card tables, may not call a third-party provider, and are covered by the Stage 14 static migration test. They must not be migrated again until populated-state parity is measured and signed off.

## Rollback

Application rollback:

1. Keep `EXPO_PUBLIC_STACKR_API_ENABLED=false`.
2. Keep `EXPO_PUBLIC_STACKR_RECOGNITION_PRIMARY=false`.
3. Keep the server-side Ximilar emergency fallback available.
4. Redeploy the last known application and gateway versions if a staging canary was enabled.

Cache rollback uses `rollbackLegacyCatalogueCacheMigration`, which restores the exact backed-up legacy index keys without changing user-owned cache keys.

Database rollback uses `supabase/manual/rollback_20260728202949_stackr_application_migration_provider_retirement.sql` only after every applied identity mapping has itself been rolled back. Export audit evidence first.

## Acceptance Position

Local type checking, gateway tests, migration/cache tests and API contract drift checks pass. This establishes implementation safety only. It does not establish catalogue parity, recognition accuracy, production latency, language coverage, user-collection reconciliation or visual UAT.

Production provider retirement remains **NO-GO**. See `provider-retirement-go-no-go.md` for every failed and insufficient gate.
