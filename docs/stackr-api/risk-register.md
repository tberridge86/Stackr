# Stackr API Risk Register

Audit date: 2026-07-27

## Risk Table

| ID | Risk | Severity | Evidence | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Supabase live migration history does not match repository migrations. | Critical | Live migration list returned no recorded migrations; repo has 63 migration files and live tables already exist. | Reconcile schema history before Stage 2 production migration. Create a non-destructive baseline strategy. |
| R2 | Live/local Supabase function drift can break scanner and insight paths. | High | Live function list showed `scan-card`; local functions are `minty-insight` and `stackr-card-recognition`. | Bring deployed function source under version control or retire it. Deploy missing functions only through reviewed migration/deploy flow. |
| R3 | Live/local private storage drift can break feedback and scan lab. | High | Live buckets: `card-scans`, `profile-backgrounds`, `trade-listings`; local migrations expect private `recognition-feedback` and `scan-lab-training`. | Create storage migration plan and RLS/policy tests before enabling upload flags. |
| R4 | Public Supabase exposure and RLS advisor findings create security risk. | High | Advisor reported RLS-enabled tables with no policy, security-definer views, public executable functions and public buckets allowing listing. | Remediate before exposing new public projections; prefer private schemas and `security_invoker` views. |
| R5 | Mobile app is directly coupled to Supabase table names and RLS behavior. | High | 457 direct Supabase call markers across 59 targets. | Introduce Stackr API facade in staged, feature-flagged slices. |
| R6 | Required language coverage is incomplete. | High | Live aggregate checks found English and Japanese coverage, but no Simplified Chinese, Traditional Chinese or Korean production coverage. | Add coverage reports and provider strategy for `zh-Hans`, `zh-Hant` and `ko`. |
| R7 | Local recognition assets are blocked. | High | Card-identity catalogue pack and ONNX manifest are blocked; zero approved embeddings and no approved production model. | Keep Ximilar/CardSight/current fallbacks. Do not make local recognition primary until benchmark passes. |
| R8 | Current recognition fallback deployment is not proven. | High | App invokes `stackr-card-recognition`, but live Supabase function listing did not include it. | Reconcile scanner fallback routing before any scanner cutover. |
| R9 | Provider licensing/provenance is not uniformly enforced. | High | Canonical tables have provenance fields, but legacy provider data and images may not consistently carry rights status. | Centralize provider ingestion, raw IDs, retrieval timestamps and rights checks. |
| R10 | Public buckets are listable and have no observed size/MIME limits. | High | Live buckets `card-scans`, `profile-backgrounds`, `trade-listings` are public with no observed limits. | Add explicit storage policies, limits and API-mediated upload paths. |
| R11 | General CI gate is missing before Railway production deployment. | High | Only price-refresh workflow found; no PR lint/type-check/test/build workflow. Railway has been connected to GitHub. | Add CI and enable Railway Wait for CI before production auto-deploy. |
| R12 | Request IDs and structured logging are inconsistent. | Medium | Backend uses mostly ad hoc console logging. | Add middleware/log schema before expanding API routes. |
| R13 | Pricing V2 evidence capture is not populated live. | Medium | `price_observations` and `pricing_review_queue` had 0 live rows; sold eBay source disabled. | Keep active listing and market-value states separate; populate observations through workers/tests. |
| R14 | Performance advisor found unindexed FKs and policy/index inefficiencies. | Medium | Advisor themes included unindexed FKs, duplicate indexes and multiple permissive policies. | Add tested indexes and policy consolidation as part of migration hardening. |
| R15 | Generated Supabase database types are missing. | Medium | No committed generated DB types found. | Generate after authoritative schema baseline is selected. |
| R16 | Direct third-party calls remain in mobile code. | Medium | Pokemon TCG API, provider image URLs, PokeAPI sprites and Railway provider routes are called from app paths. | Wrap/cached API migration by dependency map priority. |
| R17 | Scanner rewrite risk. | High | Existing scanner has crop, OCR, quality, localisation, local/remote recognition, diagnostics and feedback behavior. | Preserve UI/flow; wrap service calls only. |
| R18 | Live views may bypass expected RLS behavior. | High | Security advisor flagged public security-definer views for catalogue/admin projections. | Recreate public projections with security-invoker behavior or move behind API/private schemas. |

## Prioritised Gap List

1. Reconcile live Supabase migration history with the 63 committed migrations.
2. Capture a schema-only live baseline and generate Supabase TypeScript database types.
3. Resolve Supabase Edge Function drift: `scan-card` live vs local `minty-insight` and `stackr-card-recognition`.
4. Resolve private storage bucket drift for recognition feedback and scan lab.
5. Remediate or explicitly track Supabase advisor findings for RLS, views, functions and public buckets.
6. Add general GitHub CI for lint, type-check, relevant tests and build/export before Railway deploys.
7. Build Stage 2 canonical catalogue migrations in a local/isolated Supabase environment first.
8. Add automated migration tests for duplicate collector numbers, conflicting external IDs, aliases and shared-artwork variants.
9. Add request IDs and structured logging before introducing public API routes.
10. Add required-language coverage reports for `en`, `ja`, `zh-Hans`, `zh-Hant` and `ko`.
11. Keep Ximilar/CardSight/current recognition fallback until Stackr benchmark passes.
12. Move direct mobile catalogue/search/pricing/provider calls behind feature-flagged API clients.

## Security Notes

- `EXPO_PUBLIC_*` values are client-visible and must never hold privileged secrets.
- Supabase service-role/secret keys must remain only in backend, CI or Edge Function environments.
- Provider credentials for eBay, Ximilar, OpenAI, Anthropic, Shippo, Stripe secret, PokeTrace and other providers must remain server-only.
- Public-safe API projections must exclude raw payloads, private notes, provider secrets and licensing-review internals.

## Go/No-Go

No-go for production Stage 2 database migration until R1 through R4 are resolved.

Limited go for local-only Stage 2 design and migration tests, provided no production migration is pushed, no provider sync is run, no fallback is removed and no app UI is changed.
