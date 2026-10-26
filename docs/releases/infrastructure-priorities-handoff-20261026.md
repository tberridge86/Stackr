# Infrastructure priorities handoff — 26 October 2026

Release source: d76f5099f1cb1811df01b3eace6532d8eaf83a59, tree 97ef784111ff97e16189359821dac55a68706096, PR #446 on codex/home-cold-payload-20261026. The PR test merge 6205020583deb6e19a8b1d76e9b0e1bfb2af80a3 has the identical tree. This documentation-only evidence branch is not an app build source or deployment authorization. Existing dirty checkout changes and active R2 work were preserved.

Final hosted CI: IN PROGRESS. See infrastructure-priorities-ci-20261026.json for completed readback when available. Independent substantive implementation, account-boundary, SQL and fixture reviews passed. The candidate is unmerged and undeployed; authenticated and installed-phone acceptance are blocked.

## Completed work

| Priority | Implementation and evidence | Remaining gate |
| --- | --- | --- |
| Binder account boundary | Reproduced B receiving A's private edit metadata with zero database reads before the fix. Account/session/revision leases now require B's own read, reject late A responses, clear edit state and ownership-check writes. Warm/offline, A/B/A, logout, edits, paging and retry regressions pass. | Exact installed-build acceptance and rollout. No customer exploitation or installed-phone reproduction is claimed. |
| Authenticated and phone acceptance | Prepared measurement tooling, source/deployment receipts, production iOS export and explicit device matrix. | Designated QA configuration is empty. No exact-candidate native build or installed-phone result. |
| Search completeness and cost | Canonical identity pagination precedes bounded hydration. A fixture previously stopped at 50 of 137 matches; all 137 are now reachable over three pages. Larger fixtures cover 1,202 exact variants, five languages and server caps 17/50/100/500. | One new, reviewed SQL function plus compatible backend/gateway/app rollout; authenticated measurements. |
| Restore/security | Verifier compares RLS, policies, function definitions/settings, role settings, enabled triggers, table/column/default grants including empty ACLs, private/Auth/Storage metadata and DB-side Auth identity digests. 44 verifier cases and 17 pinned-function authorization checks pass. | Full isolated restore, restored object bytes, login/MFA, private-media acceptance and approved live security configuration changes. |
| Monitoring/scheduler/capacity | Examined existing scheduled runs, incident handling, public API samples and database connection limits. | Live scheduler ownership, reliable monitor cadence/human alert delivery and representative load tests remain unproved. |

Search keeps exact printing/variant identity; pagination cursors bind query, language/set/limit, translation mapping and revisions. Independent mobile sections do not gate canonical card publication; optional enrichment remains deadline-bounded and cannot erase appended pages. Refresh bypasses an obsolete public cached cursor; account-owned data stays outside public result caches. Cancellation, query/account generations and late-response guards preserve useful rows through retry. Filters, sorting and counts disclose loaded scope while continuation remains. Legacy backend capability is explicitly first-page-only rather than silently complete.

Existing Home improvements remain: reduced fields, warm facts reuse and independent prepared valuation publication with honest partial coverage. This work does not establish faster real Home loading; the earlier large fixture still retrieved roughly 1.08 MB across 11 collection reads.

## Matched database measurements

The exact-source runtime at 8f8d521 was measured in isolated PostgreSQL 17.6 CI. The final d76f509 changes only a static test assertion; SQL and app runtime are identical. Four alternating samples per variant compare the same installed function body with caller JIT on and only the function-local JIT override changed. Each cohort includes 5,000 unrelated printings.

| Cohort | Matching variants | JIT-on first page median | Function-local JIT-off median |
| --- | ---: | ---: | ---: |
| Empty | 0 | 210.539 ms | 17.147 ms |
| Small | 48 | 216.040 ms | 20.481 ms |
| Large | 1,202 | 230.991 ms | 33.670 ms |
| Multilingual | 500 | 224.120 ms | 26.828 ms |

Large continuation measured 231.555 → 34.299 ms. Exact entries/hasMore, stable per-definition revisions, old-revision rejection, caller-setting restoration, service-only grants and rollback passed independent review. Full raw plans, samples and digests are preserved under evidence/search-pagination-20261026/postgres17-exact-head*.json. The prior 6b and original JIT baseline remain separate.

These are synthetic SQL function timings, not production API, cold-network or phone latency. The old incomplete search query is not an equivalent latency baseline. Hydration is bounded to the page, but matching and publication-membership work can still exceed page size. No new index is proposed.

The earlier prepared-valuation proposal remains separate and unapplied. Its isolated PG17 large median was 73.724 → 48.742 ms with six → three ordered aggregate evaluations and unchanged payload/revision. It is excluded from the proposed Search rollout.

## Exact SQL and rollout scope

Proposed signature: api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb).

- Proposal: evidence/search-pagination-20261026/search-identity-page-proposal.sql.
- Canonical LF SHA-256: d8f15108792dd828f4beb979245e66add90aba7b0bc1aaed7d0ce331eefd70b8.
- Rollback SHA-256: baaf257bdd376a29eb1cabb1fc9129c8c6ec3819fb9af9977f45650406cad7f4.
- Target: Supabase oakdbbzdqwurpjnoqhmu. The signature was absent at the hosted precheck; immediately recheck definition, grants and dependencies before any approved application. Ledger absence alone is insufficient.
- The proposal is outside automatic pending migrations. Execute only the reviewed file in its own transaction after new approval; never a broad migration push.
- Do not replay Profile canonical version20261025154000, already recorded as ledger20261026072532. Daily-movers, prepared valuation and unrelated migrations remain excluded.

Exact Railway service/environment, gateway worker and production EAS lane are recorded in evidence/infrastructure-boundaries-20261026/scoped-rollout-preparation.json. Capture current backend/gateway deployments and rollback receipts first. After scoped approval and QA baseline, apply only the function, deploy the compatible backend then gateway, verify old/new clients and legacy/R2 images, then distribute the exact new app.

Rollback restores prior attested backend/gateway/app versions first. Drop only the new function signature with the reviewed no-CASCADE rollback if its captured prestate was absent; otherwise restore the captured definition and ACL. Preserve private-media boundaries, immutable originals and R2 receipts. No jobs, schedules or paid services are part of this rollout.

## Acceptance and deployment status

- Main last rechecked: b5d643a997041db2a8c42b5b6cb0180e8ddf28e7.
- Last attested distributed app: 1.0.6 (61), Team (Expo), source b5d643a; EAS c0acb3f0-8366-48cf-b55c-99b30a2b7469. It does not contain these fixes.
- Last attested backend: source7c1acd409680b38d5913d8cae76df560b5d91daa, deployment dfc23b30-9675-4ba0-ad2b-9f1875302747.
- Gateway: https://api.stackrtcg.com; active worker deployment/version still unattested.
- Database provider version17.6.1.104 was ACTIVE_HEALTHY. No new SQL was applied.
- Production iOS export at app-equivalent source7b04b1f passed the 74-asset content check. The subsequent public-delivery gate failed local DNS before its first live response. An export is not a native build or installed-phone acceptance.
- D:/workspace/stackr-qa.local.json still has no designated email/password. Configure access locally through this approved path or interactive sign-in; never commit or paste credentials. Privileged database access is not client authentication.
- Authenticated Home cap, bytes, cold/warm times, actual price coverage and installed-phone behavior remain unverified. All cases in infrastructure-priorities-device-acceptance-20261026.md are explicitly NOT RUN.

## Operational and security findings

In the bounded scheduled-run sample, 14 Production API Monitor runs had adjacent creation gaps of 125.6–348.48 minutes despite a declared ten-minute schedule. Incident445 opened after 504s across catalogue/search/assets and later closed after recovery. This proves issue automation, not outage duration or human alert delivery.

Twelve public spot-check requests succeeded. Three samples per endpoint were collected without cache purge; Search repeats hit edge cache around106–108 ms. These are public desktop samples, not authenticated Home or phone measurements.

A recent price-workflow sample contained69 cancelled runs and one pending run with no jobs. Separate bulk ledgers showed completed work, so this does not establish that pricing is inactive. One actual Railway scheduler owner remains unattested. The database snapshot (32 sessions against max60, including background/idle sessions) is not a capacity test. Full local Supabase reset/tests are still gated because the pre-repository production schema has not been fully baselined into migrations; passing isolated migration jobs does not establish a reproducible empty-database bootstrap.

The latest security advisor confirms leaked-password protection disabled. Its concrete configuration proposal requires current Auth configuration and plan-entitlement verification plus scoped approval; no setting or paid plan was changed. Eleven authenticated-callable SECURITY DEFINER advisories and33 informational RLS-without-policy entries need per-function/table interpretation; blanket revocation or permissive policies would be unsafe. The latest advisor did not repeat the earlier database patch warning, so a pending upgrade is not established.

Production dependency audit reports contain19 high package rows in the app tree and3 in the backend, with none in gateway. The current CI threshold limits critical findings only. Reports and package-specific triage are preserved. Backend parser/compression patches take priority; redirect reachability is narrower than the advisory label suggests. Advisory boundaries are not compatibility-verified upgrade targets, and neither exploitation nor deployed dependency versions were established.

## Next steps

1. Complete final CI, establish designated QA baseline, obtain scope-specific rollout approval, then verify the exact installed app. Existing PR439/Build61 approval does not authorize this release.
2. Measure Home's actual critical path and prepared valuation under matching authenticated conditions.
3. Rehearse a full isolated database/object restore, sign-in and account/private-media boundaries; qualify the concrete Auth setting and backend dependency patches.
4. Confirm one live scheduler owner, durable claims, retry exhaustion and failed-job handling; repair monitor cadence and prove alert delivery.
5. Run bounded capacity/SLO tests against representative traffic. Add no service without measured need.

Evidence is Git-backed so a handoff can resume from source, receipts and explicit gates rather than reconstructing claims from chat.
