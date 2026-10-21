# Performance probe identity and failure accounting — 21 October 2026

## Scope and source

Base: `129b57da73f00c1a3ab34b1d074928cff8410faa` (current main rechecked).
Environment: isolated Linux test fixture, Node v24.19.0; local verification completed
2026-10-21 09:20 UTC. Candidate source is the commit containing this receipt.
No matching open performance/probe PR was present in the 19 open PRs inspected.
Existing draft work is preserved.

The active search path is `app/(tabs)/search.tsx` →
`searchLocalPokemonCards` in `lib/cardSearch.ts` →
`searchStackrCards` in `lib/stackrDomainAdapter.ts`.
The adapter filters on and maps nested `result.card`; `stackrCardToLegacyCard`
uses its `defaultVariantId`. The backend's `toSearchResult` hydrates that
nested card with `toCardSummary([row])`. Flat summary correctness alone is
therefore insufficient. Exact set/number cases require top-one identity under
the performance brief.

## Measured regression and repair

The current-main validator incorrectly accepted **10/10** deliberately invalid
search fixtures: expected printing at rank two or six; absent nested card;
wrong nested printing, language, set, number, or variants; jointly wrong outer
and nested set; wrong default variant. The revised validator rejects **10/10**.
It freezes the verified set ID, requires the expected printing first, and
checks the nested identity/default variant the adapter actually consumes.

The existing benchmark now retains each attempted warmup/sample, full-body
duration, HTTP status, exposed cache header, and failure type. Failed samples
remain counted and excluded from successful-only nearest-rank p50/p95.
Zero successful samples yields null statistics. Requested, attempted and
skipped counts remain explicit, including partial success before failure.
The first request is recorded without claiming a cold shared cache.
Existing routes, request budgets, timeouts and latency thresholds are unchanged.

Validation:

- Three `node --check` checks pass.
- `node scripts/test-public-api-benchmark-contract.mjs` passes.
- Seven spawned CLI outcome cases pass: success, HTTP failure, API error,
  malformed JSON, invalid identity response, transport failure, stalled body.
  Success attempts 24/24 requests; each sample-failure fixture attempts 21/24,
  retaining 1 successful search sample, 1 failed sample, 1 successful warmup
  and 3 skipped search samples. A separate assets-warmup failure retains
  19 attempted requests and null assets percentiles.
- Baseline negative control run independently confirms 10/10 false accepts;
  fixed source rejects all ten.
- Independent reviewer reran the regression and approved the corrected
  three-file change with no remaining actionable findings. Review first
  identified the default-variant gap, which is now covered.

`npm run test:deployment` already includes this regression and is invoked by
Platform CI. Full hosted CI is pending at preparation; no skipped or unrun
gate is claimed passed. No runtime application code or migration changes.

## Fresh bounded live evidence

Read-only `api.catalogue_cards` queries filtered to printing
`ba65f365-abcb-40dd-9486-ba24014f33d5`, ordered by variant ID with limit 10,
returned **2 rows in staging and 2 rows in production**:

| Field | Verified value |
| --- | --- |
| Language / set / number | ja / SV2a / 157 |
| Set ID | e42556b8-3e82-44bb-8c52-c06b893ee4a3 |
| Native name | 安全ゴーグル |
| Normal variant | 53bca9cb-46c8-42bc-beed-267409740edd |
| Reverse-holo variant | c40bb2bf-39b1-4091-b4b5-188ecc335cf0 |
| Staging project / observation | lmwfhvexfcoyeuoyrlco / 2026-10-21 09:16:49.179252 UTC |
| Production project / observation | oakdbbzdqwurpjnoqhmu / 2026-10-21 09:16:50.367532 UTC |

This is one printing with two legitimate variants, not a catalogue denominator
or evidence that public API delivery passed.

One unauthenticated production request to
`https://api.stackrtcg.com/v1/search?q=SV2a%20157&language=ja&limit=5`
returned HTTP 403 / error code 1010 in 4638.34 ms, around 09:12 UTC (exact
request timestamp not retained). One staging health request to
`https://stackr-api-gateway-staging.berridge14.workers.dev/v1/health`
at 09:16:44.412839 UTC returned the same error in 3583.37 ms.
The staging hostname is a repository evidence lead, not a newly attested runtime.
No retry, access bypass or full production benchmark followed.
These are failed access observations from this executor, not successful API
latency, empty catalogue evidence, or proof of a general outage.

| Query language | Attempted queries | Identity evaluated | Verified correct | Cold/warm p50/p95 |
| --- | ---: | ---: | ---: | --- |
| en | 0 | 0 | 0 | unmeasured |
| ja | 1 | 0 | 0 | unmeasured |
| zh-cn | 0 | 0 | 0 | unmeasured |
| zh-tw | 0 | 0 | 0 | unmeasured |
| ko | 0 | 0 | 0 | unmeasured |

The ja request is an access failure, not a measured wrong-identity result.
No API success denominator exists for timing statistics. Storage/CDN image
decode, provider calls, optional image/set/price enrichment timings,
authenticated binders/prices, app cold/warm rendering and physical-device
outcomes are all unmeasured. No optimization of those paths is claimed.

Railway read access was rechecked for project
`d205637b-5376-41aa-9169-1015ba88fec3`, production environment
`b4304736-cac8-4ca9-92a7-93f7f6499c2f`. Latest successful primary API deployment
returned `26eac14f-2c3a-498d-80a9-f4f73aca39e3`; this lookup did not attest its
source SHA. Performance canary returned successful deployment
`1bb1134c-46c0-4132-9245-0524e17f1e35`. Deployment success is not journey proof.
No service, staged patch, worker cadence, provider gate, data or deployment was
changed. Supabase migration compatibility and EAS/native/OTA identity were not
re-measured because this change only affects probe tooling.

## Release handoff

Release owner: review the exact candidate and applicable hosted checks before
merging. This source change needs no application deployment, migration,
provider activation or native/OTA publication. Rollback is a normal source
revert; do not loosen correctness gates to make a live run pass.

From the existing authorised staging execution lane, first verify endpoint and
served revision. Then run the existing bounded probe with
`--samples=5 --warmups=1` (at most 24 requests across four existing routes),
retain the receipt and distinguish first/repeat cache state. Do not dispatch a
competing release or bypass an access wall. Extend the existing verified cohort
with catalogue-owned expected IDs for en/ja/zh-cn/zh-tw/ko before reporting
five-language cold/warm retrieval statistics. Attribute optional enrichment
using existing traces only once requests can be observed; coordinate price
eligibility with pricing and traced query/index work with backend.
Device/image-render acceptance remains a separate task.

