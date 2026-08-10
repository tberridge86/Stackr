# Stackr Quality, Performance And Observability

## Current State

Stage 12 adds a claim-safe evaluation contract, private observability storage, W3C request tracing, protected operational dashboards and release-gate tests. It does not deploy infrastructure, populate a gold test set or assert production accuracy.

The repository already contained scanner calibration utilities, a pilot recognition dataset builder, private recognition diagnostics and basic recognition request counters. Those components did not provide one leakage-controlled evidence manifest, immutable release gates, nine protected operational views or end-to-end trace propagation.

The checked-in gold-set template is intentionally empty. Its generated report is `blocked`, with zero physical cards, variants, images and capture sessions. All seven initial gates report `insufficient_data`.

## Evidence Contract

`data/quality/gold-test-set.template.json` records one row per authorised evaluation image. A populated manifest must identify the physical card and capture session, then assign the entire physical card and session to one of `model_selection`, `final_test` or `no_match_test`.

Required strata cover the five supported languages, modern and vintage cards, raw cards, sleeves, binders, slabs, glare, blur, perspective distortion, partial crops, duplicate artwork, normal and parallel finishes, common cards and high-value cards. Synthetic transformations are counted separately and cannot satisfy real-world release evidence.

Every report states the number of physical cards, variants, images and capture sessions. Duplicate case/image IDs, unknown observations, physical-card leakage and capture-session leakage are rejected or reported. A release claim also requires a locked manifest and an independently approved minimum denominator for every gate.

Run the local evaluator with:

```powershell
npx tsx scripts/evaluate-stackr-quality.ts `
  --manifest data/quality/gold-test-set.template.json `
  --observations data/quality/quality-observations.template.json `
  --output outputs/quality/stackr-quality-report.json `
  --fail-on-gate
```

The command prints the manifest SHA-256. Aggregate reports can be submitted only through the protected admin API. Raw image paths, image payloads, OCR text, user IDs, device IDs and tokens are rejected.

## Release Gates

These are immutable targets in `stackr-release-gates-v1.0.0`, not measured results.

| Gate | Target |
| --- | ---: |
| Cached catalogue p95 | no greater than 150 ms |
| Structured search p95 | no greater than 300 ms |
| Recognition lookup with supplied embedding p95 | no greater than 350 ms |
| Warm image fallback p95 | no greater than 1.2 seconds |
| Auto-confirm precision | at least 99.5% |
| Real-world top-5 accuracy | at least 98% |
| Automatic confirmation below calibrated threshold | zero |

A measured miss is `fail`, even when the sample is too small for a claim. A measured pass without an approved denominator is `insufficient_data`. Targets are never weakened automatically.

The evaluator also reports top-1, top-3 and top-5 accuracy; ambiguous results; false accepts; no-match accuracy; variant and finish accuracy; manual corrections; Ximilar fallback; scans resolved without upload; and p50, p95 and p99 scan latency. Language, capture type and capture-condition top-5 breakdowns retain their denominators.

## Protected Dashboards

`GET /v1/admin/observability/dashboard` and `POST /v1/admin/observability/refresh` require a signed-in Supabase administrator at the gateway and the backend admin credential on the private hop.

| Dashboard | Authoritative source |
| --- | --- |
| API health | Minimized gateway events |
| Ingestion health | Source health, import runs and durable queues |
| Catalogue coverage | Canonical catalogue quality view |
| Scanner funnel | Scanner learning events and recognition diagnostics |
| Recognition quality | Latest leakage-controlled evaluation and gate results |
| Pricing freshness | Provider-neutral market estimates and sample counts |
| Cost per 1,000 scans | Attributed provider cost observations, grouped by currency |
| Provider dependency | Provider registry, licence state and source health |
| Model and index versions | Embedding index registry and completeness counts |

Missing or expired evidence is `unavailable`, not zero. Cost observations retain whether they are estimated or invoiced. The scanner dashboard explicitly reports Ximilar fallback as unavailable until the feature-flag outcome is emitted as a minimized aggregate event.

## Tracing And Privacy

The gateway accepts or creates a W3C `traceparent`, creates its own span, forwards the trace to Railway and recognition, and returns `Traceparent` plus `X-Trace-Id`. Railway creates child spans for Supabase REST calls. Recognition creates child spans for catalogue calls and Postgres diagnostics.

Normal trace logs contain service, operation, status and duration only. They do not contain request bodies, query strings, OCR text, card images, storage keys, user IDs, device IDs, access tokens or provider payloads. Operational events expire after 30 days and trace spans after 14 days; the service-only retention function removes expired rows.

The Supabase changelog was checked on 2026-07-28. The Management API log endpoint is moving to a ClickHouse-backed replacement by 2026-09-23, so Stackr does not depend on that endpoint for these dashboards.

## Migration And Rollback

Migration:

`supabase/migrations/20260728182743_stackr_quality_performance_observability.sql`

It creates the private `audit` tables and service-role-only `api` functions. `anon` and `authenticated` receive no table or function access. Apply it first to local Supabase, then staging, populate only aggregate evidence, verify all protected routes, and only then consider production.

Rollback:

`supabase/manual/rollback_20260728182743_stackr_quality_performance_observability.sql`

Disable `STACKR_OBSERVABILITY_EVENTS_ENABLED`, remove the admin dashboard route from navigation, run the rollback SQL in a controlled maintenance window, and redeploy the previous gateway/backend versions. The rollback deletes Stage 12 audit data, so export any required aggregate reports first.

## Current Recommendation

Production release is **NO-GO**. The implementation can proceed to isolated local and staging validation, but accuracy and latency claims remain blocked until real, consented, leakage-safe captures meet approved sample denominators and every release gate passes without changing its target.

The exact next stage is a controlled staging rollout and gold-set evidence collection, under a separately approved Stage 13 prompt. No production migration or deployment is part of Stage 12.
