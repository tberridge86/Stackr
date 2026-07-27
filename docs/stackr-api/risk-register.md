# Stackr API Risk Register

Audit date: 2026-07-27

| ID | Risk | Severity | Evidence | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | Mobile app is directly coupled to Supabase table names and RLS behaviour. | High | 457 direct Supabase call markers across 59 targets. | Introduce API facade in stages, starting with read-only catalogue/pricing. |
| R2 | Authoritative schema cannot be fully reconstructed from committed migrations. | High | App references legacy tables that are not created in visible migrations. | Capture production schema-only dump and generated DB types before Stage 2 changes. |
| R3 | Service/provider credential leakage risk if boundaries remain unclear. | High | Client bundle contains public Supabase config; backend and functions use service/provider secrets. | Keep only public config in app. Move all provider/service-role operations server-side. |
| R4 | Local recognition assets are blocked. | High | Catalogue pack and ONNX model manifests report blocked status, zero approved embeddings and no model binary. | Keep Ximilar/CardSight fallback. Build approved dataset/model before primary-path switch. |
| R5 | Required language coverage is incomplete. | High | Local pack has no Simplified Chinese or Korean rows; TCGdex code lacks Korean support. | Add coverage reporting and provider strategy for `zh-Hans` and `ko`. |
| R6 | Debug/provider routes may expose operational details. | High | Backend includes debug/test/rate-limit routes and verbose provider logs. | Gate debug routes by environment/admin auth or remove before production API launch. |
| R7 | Request IDs and structured logging are inconsistent. | Medium | Mostly ad hoc `console.log`/`console.warn`; no consistent backend request ID middleware found. | Add middleware and log schema in Stage 2 before route expansion. |
| R8 | Pricing may mix market value with asking-price evidence. | Medium | eBay active adapter is enabled by default in Pricing V2; sold provider requires authorised endpoint. | Keep response state distinctions and require evidence labels in UI/API. |
| R9 | Provider licence/rights status is not universally enforced. | Medium | Canonical tables include rights fields, but legacy tables may not. | Centralize provider ingestion and CDN eligibility checks. |
| R10 | Current working tree is dirty. | Medium | Many pre-existing modified, deleted and untracked files were present. | Isolate Stage 1 docs; avoid reverting user-owned changes. |
| R11 | Mobile build baseline is incomplete. | Medium | No root/backend `build` script exists; no mobile CI workflow found. | Add explicit build/CI commands for Stage 2 acceptance. |
| R12 | Generated DB types are missing. | Medium | No committed Supabase generated database types found. | Generate and commit types after schema snapshot. |
| R13 | Recognition feedback data must stay consent-bound. | Medium | Feedback upload supports consent, but future API must preserve deletion/withdrawal. | Keep consent checks, checksums and private buckets; add tests. |
| R14 | Direct third-party calls still exist in mobile screens. | Medium | Pokemon TCG API, Railway provider routes, Nominatim/Overpass/PokeAPI and others are called from app code. | Wrap or cache behind API according to dependency map. |
| R15 | Scanner rewrite risk. | High | Existing scanner has mature crop, OCR, local, remote, feedback and diagnostics logic. | Preserve UI and current flow; migrate service calls behind flags only. |

## Priority Gap List

1. Add request IDs and structured logs to backend/API routes.
2. Produce an authoritative schema snapshot and generated DB types.
3. Create read-only `/v1` API facade for catalogue/search/pricing.
4. Remove direct mobile Pokemon TCG API and provider route calls behind feature flags.
5. Add coverage report by language, set, variant, source and rights status.
6. Keep Ximilar/CardSight fallback until Stackr benchmark passes.
7. Add mobile build/CI baseline.
8. Gate or remove debug/provider test endpoints.

## Go/No-Go

Go for Stage 2 only if it is limited to facade routes, logging, request IDs, schema snapshot and tests.

No-go for replacing scanner recognition, removing fallback providers, claiming multilingual coverage completeness or performing destructive production migrations.
