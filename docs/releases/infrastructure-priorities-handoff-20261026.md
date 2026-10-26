# Infrastructure priorities handoff - 26 October 2026

This continues PR #446 on codex/home-cold-payload-20261026. The original dirty checkout and active R2 work are preserved. This file is release evidence, not authorization to deploy.

## Completed checkpoint

The binder account-cache and restore-security checkpoint is published at dc1d9dbac708c3a6b039c9a8fd15193eff9bef7f (tree 86f6093591e578fdadf88fed754e98c0775bc4bd). All four applicable hosted workflows passed; the separate release-candidate gate was skipped. The earlier c9d245b checkpoint's missing retrieval-parallel fixture dependency was fixed without weakening assertions.

The binder regression reproduces account B seeing A's private edit metadata without a database read before the fix. Scoped leases and account/session invalidation now require B's own read, reject delayed A responses and guard edits. No customer exploitation or installed-phone reproduction is claimed.

Restore verification now compares RLS, policies, grants including empty default ACLs, function settings, role settings, enabled triggers, private/Auth/Storage security metadata and Auth identity digests. Forty-four negative/equality fixture checks and seventeen pinned-function authorization checks passed independent review. This does not establish an actual restore, safe source policy, restored object bytes or working sign-in/MFA.

## Search candidate

The new candidate removes the one-page dead end through stable, revision-bound canonical identity pagination before hydration. Global Search keeps exact variant/printing identity, loads further pages on request, preserves completed rows during optional-source failure and rejects obsolete query/account work. Optional sources cannot hold the first usable cards or continuation behind their own deadline.

Explicit refresh escapes a cached obsolete first-page cursor; normal warm public-cache hits remain. Search alone permits its Cache-Control refresh header on allowed-origin preflight. Private requests retain existing cache bypasses.

Local completeness evidence includes 137 matches over three pages and a larger five-language fixture under server caps17/50/100/500. Independent mobile, gateway and backend/SQL review passed; exact-head hosted qualification remains pending. The complete fixture contains 1,202 exact variants across five languages. These are fixtures, not a measured improvement in Home or phone latency. The exact-name predicate uses existing indexes, while publication membership and matching-identity work can still exceed the page size; full-card hydration is bounded to the page. No claim is made that every membership scan is eliminated.

Filters and sorting operate on loaded rows and say so while continuation remains. Missing legacy pagination capability is labelled first-page-only; null cursor alone is not treated as completeness. Cached canonical rows are a preview; account ownership is fetched separately and never written to that public result cache.

## Database evidence and approval boundary

The existing prepared-valuation proposal is unchanged and unapplied. The isolated PostgreSQL17.6 CI fixture reduced the large cohort median from73.724464 to48.741687ms, with six to three ordered aggregate evaluations and exact payload/revision preservation. That is synthetic database evidence, not a production RPC or screen speed claim. Raw plans and source/run/artifact provenance are saved under evidence/infrastructure-boundaries-20261026/.

Search requires the separately prepared api.catalogue_search_identity_page_v1(jsonb,jsonb,integer,text,jsonb). The function was absent in the read-only hosted precheck; relevant existing service-role schema/table permissions were present. Installation must recheck both conditions and the reviewed checksum immediately before execution. This proposal is not registered among automatic pending migrations and has not been applied. No new index is proposed. The reviewed LF SHA-256 is a84c5dd7f6ee6e5fc1831b37b7ef5319554325e48efb40ed7d3be8baae5f1ed3; rollback SHA-256 is baaf257bdd376a29eb1cabb1fc9129c8c6ec3819fb9af9977f45650406cad7f4.

Keep Profile migration20261025154000 mapped to existing ledger20261026072532. Do not replay it, apply daily-movers or use a blanket migration push.

## Acceptance and live state

- Integration main last attested: b5d643a997041db2a8c42b5b6cb0180e8ddf28e7.
- Last distributed app:1.0.6(61), Team(Expo), source b5d643a; EAS c0acb3f0-8366-48cf-b55c-99b30a2b7469. It does not contain these fixes.
- Backend last attested:7c1acd409680b38d5913d8cae76df560b5d91daa, deployment dfc23b30-9675-4ba0-ad2b-9f1875302747, production Supabase oakdbbzdqwurpjnoqhmu.
- Configured gateway is https://api.stackrtcg.com; active worker revision remains unattested.
- Designated QA configuration remains empty. Actual authenticated Home page cap, priced-printing coverage and cold/warm timings are unverified.
- No physical-device acceptance is available. An export/CI pass or TestFlight availability is not installation.
- No new merge, deployment, native build, migration, scheduler activation, price job or R2 operation has occurred in this unit.

## Operational qualification

The bounded scheduled-run sample contains14 Production API Monitor runs. Observed adjacent creation times were125.6–348.48minutes apart despite a ten-minute declared schedule. The04:54 incident included504s across public catalogue/search/asset endpoints; issue445 opened and later closed at10:42 after recovery. Sparse samples do not establish outage duration or human alert delivery.

Twelve current public spot-check requests succeeded. Workspace Node search repeats hit edge cache at about106–108ms; other public repeated reads were slower. Sample count is three per endpoint, with no server-cache purge. These are public first-observed/repeat samples, not authenticated Home or phone measurements.

The recent scheduled price-refresh sample contains69 cancelled runs and one pending run with no jobs. Separate bulk ledgers show completed work, so these cancellations do not establish that pricing is inactive. Live Railway scheduler ownership and configuration remain unattested. The database connection snapshot is not a capacity test.

Leaked-password protection was reported disabled; enabling it needs current Auth configuration/plan-entitlement verification and a scoped approved configuration change. The database security-patch upgrade requires provider preflight and approval. No paid plan or live setting was changed.

## Controlled rollout preparation

1. Reconcile the exact reviewed source with main and active R2 changes; require current-head CI and separate release review.
2. Establish designated QA access and record matching baseline/candidate conditions. Do not use privileged database access as client authentication.
3. After explicit approval, apply only the reviewed search-function signature via a single-file path, verify service-only grants and representative results, then deploy compatible backend and gateway before distributing the new app. No other proposal is included implicitly.
4. Verify old and new clients, cursor continuation/revision recovery, correct configured backend and legacy/R2 assets before native distribution through the existing production release lane.
5. Distribute the exact new app source, record EAS/build/fingerprint/TestFlight receipts, and run installed-phone acceptance.

Rollback: restore the previously attested backend/gateway/app release first, then drop only the newly installed search-function signature with the reviewed rollback file if its captured prestate was absent. Do not CASCADE or remove Profile migration. Preserve all immutable assets and R2 rollback receipts.

Shortest remaining phone matrix on the new exact build: private binder A -> logout -> B; Home cold/warm/refresh/offline retry; collection/binder edit propagation; search beyond50 with multilingual finishes plus cancellation and refresh; Pokedex ownership/images; honest unavailable/stale prices. Record each result and build, not a blanket pass.

## Prioritised remaining work

1. Complete exact-source hosted qualification and authenticated/phone acceptance, then approved rollout.
2. Measure Home's real critical path and prepared valuation under designated accounts; only then qualify applying its separately reviewed SQL proposal.
3. Rehearse a full isolated database/asset restore with login, RLS and private-media verification; prepare the specific password/patch configuration changes.
4. Confirm one live scheduler owner, retry exhaustion/dead-letter handling and monitor cadence/alert delivery.
5. Define and run bounded capacity/SLO tests using measured traffic and database limits; add no services without evidence.
