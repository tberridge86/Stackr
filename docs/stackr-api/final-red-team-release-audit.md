# Final Stackr API Red-Team and Release Audit

Audit date: 2026-07-28
Auditor posture: sceptical principal engineer, independent of implementation
Repository: `D:\Stackr-1`
Branch: `chore/api-gateway-v1`
Audited commit: `87daaa94508fc931b54454505872765567932eef` plus 117 uncommitted paths
Live Supabase project: `oakdbbzdqwurpjnoqhmu`
Live Railway backend: `https://pocketvault-production.up.railway.app`
Intended gateway: `https://api.stackr.app`

## Decision

**NO-GO.**

Stackr's own API is not ready for staging promotion or production release. The audit found an active production service-role credential in Git history, exploitable production RLS and storage failures, no deployed public v1 gateway, no live canonical schemas or migration history, and no selected recognition model or vector index. These are release blockers, not backlog items.

Local tests passing does not change the decision. The tests predominantly validate mocks, fixture search, and SQL text. They do not disprove the live failures below.

## Immediate Incident Actions

1. Rotate the Supabase JWT secret or otherwise revoke and replace every legacy `service_role` key for project `oakdbbzdqwurpjnoqhmu`. A historical key was still accepted by the production REST API during this audit.
2. Rotate the committed Ximilar, CardSight, eBay, Pokemon TCG, and Stripe credentials. Treat every historical value as compromised, whether or not it is currently configured.
3. Disable direct public access to `card-scans`; preserve evidence and investigate object access before deleting anything.
4. Remove public profile PII access and block users from updating `profiles.role` before relying on any `is_admin()` policy or security-definer function.
5. Remove the permissive authenticated read policy on `market_price_snapshots` and investigate access to user-specific rows.
6. Restrict or temporarily disable the public legacy Railway routes that trigger provider calls, scans, notifications, catalogue sync, or database writes.
7. Review Supabase, Railway, provider, Stripe, and GitHub audit logs for use of the exposed credentials. Do not put raw credentials into tickets or chat.
8. Rewrite Git history only after credential rotation. History rewriting does not revoke a credential.

## Critical Blockers

### CR-01: Active production and provider secrets are committed in Git history

**Evidence**

- `.env` and `backend/.env` exist in commits reachable from `origin/main`.
- Commits `1ae9bd9701cc` and `1ec53a82cb7f` contain the same 219-character JWT under `SUPABASE_SERVICE_ROLE_KEY` and `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY`.
- The decoded, non-secret claims identify role `service_role` and project `oakdbbzdqwurpjnoqhmu`.
- A read-only production REST request authenticated with that historical key returned HTTP `200` on 2026-07-28. The key is therefore still usable.
- Commit history also contains live-looking values named `XIMILAR_API_TOKEN`, `CARDSIGHTAI_API_KEY`, `EBAY_CLIENT_SECRET`, `POKEMON_TCG_API_KEY`, and `STRIPE_SECRET_KEY`.
- The current tree scanner passed 2,631 files because `scripts/deploy/secret-scan.mjs` scans the working tree, not Git history.
- The freshly generated current web bundle contained zero JWT-like strings and zero service-role variable names. Historical EAS/mobile bundles were not available, so past bundle exposure remains unverified.

**Reproduction**

1. Run `git log --all --name-only --pretty=format: -- '*.env' '.env*'`.
2. For each returned commit, parse only assignment names and value lengths from `git show <commit>:<path>`; do not print values.
3. Decode only the JWT payload locally and confirm `role` and `ref`; do not transmit or log the JWT.
4. A security owner can perform a read-only authenticated request to the project's own REST API and record only the HTTP status. The audit observed `200`.

**Required fix**

Rotate credentials, invalidate active sessions where appropriate, inspect access logs, remove secrets from current CI/deployment stores, replace them with newly scoped values, add history-aware secret scanning, and then purge repository history. Audit any release built while `EXPO_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` existed.

**Release gate affected:** secrets, service-role exposure, mobile bundle safety, source-control security.
**Status:** failed.

### CR-02: Public profile PII and authenticated role escalation

**Evidence**

- Live policy `Public profiles are viewable` grants public `SELECT` with `using (true)`.
- `anon` and `authenticated` have column-level `SELECT` grants for all profile columns, including `email`, `expo_push_token`, `stripe_account_id`, and `role`.
- A safe role-simulation count showed `anon` can see all 12 live profile rows. No row contents were downloaded.
- Policy `users can update own profile` has `using (auth.uid() = id)` and no role-column restriction. A signed-in user can update their own `role` to `admin` while retaining the same `id`.
- `is_admin()` and `admin_binder_directory()` trust `profiles.role`; the latter is security-definer and returns binder-owner identity information.

**Reproduction**

```sql
select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'profiles';

select grantee, privilege_type, column_name
from information_schema.column_privileges
where table_schema = 'public' and table_name = 'profiles'
  and grantee in ('anon', 'authenticated');
```

Validate role escalation only in an isolated branch with a disposable user and roll the transaction back.

**Required fix**

Make public profiles a column-safe view, revoke sensitive column grants, add an explicit update-column allowlist, prevent user updates to `role`, move admin authority to trusted JWT `app_metadata` or a private role table, and re-audit every policy/function that calls `is_admin()`.

**Release gate affected:** RLS, authentication, IDOR, admin authorization, personal-data protection.
**Status:** failed.

### CR-03: Private card scans are public and uploads are insufficiently constrained

**Evidence**

- Live `storage.buckets.card-scans` has `public = true`.
- It has no `file_size_limit` and no `allowed_mime_types`.
- Public policy `Allow public read access to card scans` permits `SELECT` for every object in the bucket.
- Authenticated insert policy checks only `bucket_id = 'card-scans'`; it does not constrain owner or path.
- The bucket currently contains 10 objects. Object names and contents were not enumerated or downloaded.
- Supabase's security advisor reports `Public Bucket Allows Listing`.

**Reproduction**

```sql
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'card-scans';

select policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual ilike '%card-scans%' or with_check ilike '%card-scans%');
```

**Required fix**

Make the bucket private, set strict byte and MIME limits, bind insert/read/delete paths to `auth.uid()`, use short-lived signed upload/download grants, validate uploaded bytes after upload, quarantine malformed files, and define deletion and consent retention jobs.

**Release gate affected:** private scans, malformed uploads, excessive payloads, training consent.
**Status:** failed.

### CR-04: Authenticated users can read other users' market snapshots

**Evidence**

- Live policy `Allow authenticated users to read market snapshots` uses `true`.
- A second policy attempts `(user_id is null) or (auth.uid() = user_id)`, but RLS policies are permissive by default, so the `true` policy wins.
- The live table contains 331,354 rows, including 70,942 user-specific rows across eight users.
- A safe arbitrary authenticated-role simulation could see all 331,354 rows, including all 70,942 user-specific rows.

**Reproduction**

```sql
select policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'market_price_snapshots';

select count(*) as total,
       count(*) filter (where user_id is not null) as user_specific
from public.market_price_snapshots;
```

Use a disposable user in an isolated environment to verify cross-user denial after remediation.

**Required fix**

Remove the unconditional authenticated policy, separate public aggregate prices from user-specific observations, expose only column-safe public projections, and add negative RLS tests using two distinct users.

**Release gate affected:** RLS, cache/user-data isolation, IDOR, private pricing.
**Status:** failed.

### CR-05: The v1 gateway is absent and production exposes the legacy backend directly

**Evidence**

- `api.stackr.app` has no DNS record. `/v1/health`, `/v1/ready`, and `/v1/catalog/manifest` cannot be reached.
- All EAS environments set `EXPO_PUBLIC_PRICE_API_URL` to `https://pocketvault-production.up.railway.app`; development and preview also target production.
- Direct Railway `/health` returns `200`, `Access-Control-Allow-Origin: *`, `X-Powered-By: Express`, and no Stackr request ID.
- Direct Railway `/v1/health` returns `404`.
- Public `/debug-env` returns credential-presence and marketplace metadata.
- `backend/server.js:78-79` enables open CORS and a global 25 MB JSON body limit.
- Public legacy routes include provider diagnostics, scan/grading endpoints, notification endpoints, `/api/sync/set`, catalogue sync/repair endpoints, and provider-backed search/price routes.
- `/debug-serpapi` forces `no_cache=1`, allowing unauthenticated callers to consume provider quota.
- `backend/lib/gatewayOriginAuth.js:26-31` defaults origin authentication to `disabled`, so a missing production variable fails open.

**Reproduction**

```text
Resolve-DnsName api.stackr.app
GET https://pocketvault-production.up.railway.app/health
GET https://pocketvault-production.up.railway.app/v1/health
GET https://pocketvault-production.up.railway.app/debug-env
```

Do not call cost-incurring debug, scan, sync, notification, or provider routes during verification.

**Required fix**

Rotate exposed provider credentials first, disable public debug/admin/provider mutation routes, require origin authentication by default, deploy and smoke-test the gateway, point mobile staging at staging, and only then route production mobile traffic through `EXPO_PUBLIC_STACKR_API_URL`.

**Release gate affected:** API authentication, abuse protection, payload limits, provider cost, environment isolation, request IDs.
**Status:** failed.

### CR-06: The database release cannot be reproduced or rolled back

**Evidence**

- Supabase reports zero remote migration-history entries.
- The working tree contains 74 migration files and `deploy:preflight` warns `migration_history_not_aligned`.
- Live schemas do not contain the requested `catalog`, `api`, `ingest`, `market`, `ml`, or `audit` implementation.
- Supabase has one default/main branch and no isolated staging branch.
- The audited work is 12 commits ahead of `origin/main`, the branch is not on the remote, and 117 working-tree paths are dirty.
- The deployment workflow therefore cannot reproduce the exact code and schema audited here.

**Reproduction**

```text
git status --short
git rev-list --left-right --count origin/main...HEAD
Supabase: list migrations and branches
Postgres: list non-system schemas
```

**Required fix**

Freeze and review the actual release branch, align remote migration history in an isolated clone/branch, prove a backup restore, run every migration against a production-like copy, and record immutable release identifiers. Do not repair or push migration history directly against production without a reviewed runbook.

**Release gate affected:** database backup, migration, rollback, release provenance.
**Status:** failed.

### CR-07: Stackr recognition has no production model, index, vector lookup, or evidence

**Evidence**

- `deploy:verify-model -- --require-active` fails with six blockers, including no selected model, no embedding dimension, incomplete benchmark, and no requested index activation.
- `recognition-service/app/repositories.py:146-154` implements `vector_lookup` as `return []`.
- Model/index readiness is inferred from environment values rather than a validated registry/checksum/completeness query.
- The checked-in gold set is an empty template with zero physical cards, variants, images, and capture sessions.
- The model benchmark and provider retirement reports are explicitly blocked/`NO_GO`.
- The mobile/client remains on legacy provider paths.

**Reproduction**

```text
npm run deploy:verify-model -- --require-active
npm run report:provider-retirement
Inspect recognition-service/app/repositories.py vector_lookup
Inspect data/quality/gold-test-set.template.json
```

**Required fix**

Complete the leakage-safe benchmark with real captures, select and license a model, create and verify a complete versioned index, implement real over-fetched vector retrieval, calibrate thresholds, atomically activate model/index versions, and pass the stated quality and latency gates.

**Release gate affected:** recognition correctness, model/index compatibility, benchmark validity, provider retirement.
**Status:** failed.

## High Risks

| ID | Finding and evidence | Reproduction | Required fix | Gate |
|---|---|---|---|---|
| HR-01 | Recognition scan IDOR: gateway authentication stores `gateway_actor` at `main.py:193`, but identify/embed do not pass it to the pipeline. `privateImageKey` is caller-controlled, and `storage.py:34-53` uses service-role credentials to download that key. | With two disposable users in isolated storage, submit user B's known key through a signed request for user A. Current code has no ownership rejection. | Bind upload records and keys to actor user/device; perform an ownership lookup before service-role download; use opaque one-use grants. | IDOR, private scans |
| HR-02 | Decompression and memory exhaustion: storage reads `response.content` fully before applying the byte cap; Pillow opens, transposes, and converts before a pixel/dimension cap. Direct signed uploads bypass backend byte/signature validation. | Use a generated high-expansion image in isolation and measure RSS; do not send it to production. | Stream with a hard cap, validate dimensions/pixels before decode, set Pillow bomb limits, reject warnings/errors, and constrain bucket uploads. | malformed image, memory, concurrency |
| HR-03 | Catalogue identity collisions: `card_printings` has `unique (id, game_code, language_code, set_id, collector_number)`, which is redundant because `id` is already unique. Unknown languages silently become English in several normalizers. Collector matching strips leading zeros. | Insert two printings with different IDs but identical game/language/set/number in a local DB; test unknown `fr`/typo languages; compare `001` and `1`. Existing structural tests do not reject all cases. | Add the intended natural-key constraint or explicit printing discriminator, reject unknown languages, preserve exact collector identity, and add adversarial migration tests. | identity, language, collector parsing |
| HR-04 | Delta sync can go stale: `catalog.catalogue_change_log` is created and read, but repository search found no trigger or application writer for normal catalogue mutations. | Mutate a local catalogue row, request delta from the previous sequence, and observe no corresponding change record. | Add transactional change-log triggers/writers, deprecation entries, sequence monotonicity tests, and interrupted-sync tests. | catalogue delta |
| HR-05 | Legacy pricing can cache active listings as an eBay average: Browse active listings are labelled `soldDataSource: 'browse'` and `saveCachedEbayCardPrice` stores the summary in `ebay_average`. Public legacy routes remain the mobile path. | Use fixtures only: force sold-provider failure, return Browse listings, then inspect the cached snapshot. | Disable the legacy cache write, preserve observation type end to end, expose asking indications separately, and require authorised sold evidence for sold estimates. | price provenance, unsupported estimates |
| HR-06 | Queue durability is schema-only: the new `ingest.work_queue` is not live, and no general consumer was found for catalogue, asset, embedding, and conflict-review queues. Dead-letter recovery is not exercised end to end. | Enqueue each job type in an isolated database and wait for lease/completion/dead-letter/replay. No deployed worker is available. | Implement workers, leases, heartbeats, idempotent side effects, retry caps, dead-letter replay, backlog alarms, and outage drills. | duplicate ingestion, outage, backlog |
| HR-07 | There is no full staging environment or smoke test. No staging URLs are configured, Supabase has no staging branch, and Railway CLI credentials are unavailable. The smoke script only checks health/readiness/manifest. | `npm run deploy:smoke` returns `No deployment smoke-test URLs were supplied`; gateway smoke fails DNS. | Provision isolated staging, seed representative data, test authenticated catalogue/search/scan/feedback/pricing flows, and prove every rollback path. | integration, staging, rollback |
| HR-08 | Production dependencies have known high-severity advisories: root `npm audit --omit=dev` reports 21 high and backend reports 6 high. Backend direct dependencies without an available npm fix include `@huggingface/transformers` and `sharp`; `sharp <0.35.0` reports GHSA-f88m-g3jw-g9cj. | Run the same audit commands against locked dependencies. | Triage reachability, upgrade or isolate vulnerable processors, add SBOM/scanning gates, and document accepted residual risk. | dependency security, image handling |
| HR-09 | The only load test is 30 serial in-process TestClient requests against mocks; it completes in about 0.09 s and does not load a model, query a vector index, perform OCR, download an image, or exercise network concurrency. | Inspect `recognition-service/tests/test_failure_and_load.py:28-38`. | Run staged concurrent load, cold-start, soak, large-image, queue, and provider-outage tests while measuring p50/p95/p99, RSS, CPU, and cost. | latency, cold start, memory, cost |
| HR-10 | Arbitrary image URLs are accepted by public `/scan` and forwarded to Ximilar without scheme/host validation. This permits provider-side URL fetching, quota abuse, and potentially unsafe URL targets depending on provider behavior. | Submit only controlled public test URLs in staging; test rejection of loopback, link-local, private, non-HTTPS, redirect, and DNS-rebinding cases. | Remove the legacy route; accept owned private keys only. For any retained fetcher, resolve and validate every hop against an allowlist. | SSRF, provider abuse |
| HR-11 | Staging deployment does not run the release-critical test suite before deploying backend and recognition. Production tests omit recognition pytest/load, the web build, dependency audit, and live RLS/storage assertions. | Inspect `.github/workflows/deploy-staging.yml` and `deploy-production.yml`. | Make immutable CI artifacts mandatory, run all release checks before deploy, and block on live post-migration security assertions. | CI/CD, reproducibility |

## Medium Risks

| ID | Finding | Required fix | Gate |
|---|---|---|---|
| MR-01 | Recognition replay protection is process-local memory (`service_auth.py:35-47`). Restarts and multiple workers do not share nonce state. Gateway Durable Object idempotency is stronger but is not deployed. | Store nonce/replay state durably or rely on a deployed gateway with short signatures and durable idempotency; test cross-worker replay. | replayed mutations |
| MR-02 | Supabase advisors report security-definer views/functions callable by broad roles, mutable search paths, and leaked-password protection disabled. Role escalation makes these more dangerous. | Remove unnecessary definer execution, set safe search paths, restrict execute grants, and enable leaked-password protection. | database/auth hardening |
| MR-03 | Asset rights enforcement exists only in undeployed code. There is no live `catalog.assets` rights ledger or release evidence proving every mirrored asset is approved. This audit found no proof that a specific asset is unlicensed, but the gate is unverifiable. | Deploy provenance schema after review, block mirroring unless permission is approved, and run an asset-rights completeness report. | asset licensing |
| MR-04 | Current Supabase logs for API/auth/storage/Postgres contained no JWT, bearer, Supabase-secret, or query-credential patterns in the last 24 hours. Railway/provider logs and historical logs were unavailable. | Add redaction tests and central scans across all services; verify retention and incident access. | log secrecy |
| MR-05 | Python dependency audit reports six advisories against the build environment's `pip 25.0.1`; the production image could carry the venv's pip tooling unnecessarily. | Upgrade build tooling and strip pip/setuptools from the runtime image when not required. | supply chain |

## Low Risks

| ID | Finding | Required fix | Gate |
|---|---|---|---|
| LR-01 | Lint passes with 16 warnings, including unreachable code in `app/prices/index.tsx`. | Resolve warnings or enforce an approved warning budget. | maintainability |
| LR-02 | The live backend discloses `X-Powered-By: Express` and credential-presence flags. | Disable framework disclosure and remove public diagnostics. | information disclosure |

## Controls That Passed Locally

- Current-tree secret scan: 2,631 files, no configured pattern match.
- Current web bundle scan: zero JWT-like values and zero service-role variable names.
- Supabase log pattern scan: no secret-like matches in the available last-24-hour API/auth/storage/Postgres logs.
- Mobile and backend TypeScript checks passed.
- Gateway dry-run build passed.
- Expo web export passed with 92 static routes.
- OpenAPI generated-client drift check passed.
- API v1 fixture integration tests passed.
- Gateway tests passed 16/16, including explicit CORS, JWT verification, route validation, versioned public cache behavior, idempotency, route limits, and service signing.
- Canonical migration and ingestion structural tests passed.
- Asset pipeline and Pricing V2 fixture tests passed.
- Scanner migration, feedback, and shadow-mode fixture tests passed.
- Recognition pytest passed 16/16 with one Starlette deprecation warning.
- Local scoring blocks automatic confirmation when calibration is not ready.
- Recognition Dockerfile pins the base-image digest and Python dependencies, runs as UID 10001, uses a read-only `/models` directory, and has health/graceful-shutdown configuration.
- No obvious SQL injection sink was found in the new API/recognition path; Supabase builders and psycopg parameters are used. This is not a substitute for live DAST.

These controls are not deployed end to end and do not offset the critical findings.

## Commands and Results

| Command/check | Result |
|---|---|
| `npm run lint` | Passed, 0 errors and 16 warnings |
| `npm run typecheck` | Passed |
| `npm run typecheck:backend` | Passed |
| `npm run build:web` | Passed, 92 static routes |
| `npm run build --prefix gateway` | Passed dry run |
| `npm run check:api-contract` | Passed |
| `npm run test:stackr-api-v1` | Passed |
| `npm test --prefix gateway` | Passed 16/16 |
| `npm run test:database-migrations` | Passed structural tests |
| `npm run test:asset-pipeline` | Passed fixtures |
| `npm run test:pricing-v2` | Passed fixtures |
| Scanner/application migration tests | Passed fixtures |
| Recognition `pytest -q` | Passed 16/16, one warning |
| Recognition load test | Passed its threshold, but only 30 serial mocked requests |
| `npm run test:benchmark-smoke` | Passed guardrail tests; benchmark remains blocked |
| `npm run report:provider-retirement` | `NO_GO` |
| `npm run ci:secret-scan` | Passed current tree; failed to cover historical active secrets |
| Git-history redacted scan | Failed: multiple production/provider secrets found |
| Historical Supabase key validity check | Failed: production returned HTTP 200 |
| Root npm production audit | 1 low, 17 moderate, 21 high |
| Backend npm production audit | 4 moderate, 6 high |
| Gateway npm production audit | 0 vulnerabilities |
| Recognition pip audit | 6 advisories in build `pip` |
| `npm run deploy:verify-model -- --require-active` | Failed with six blockers |
| `npm run deploy:preflight -- --release` | Failed migration/model approvals and missing local release credentials |
| `npm run deploy:smoke` | Failed: no staging URLs |
| Direct Railway smoke | `/health` 200 but request-ID propagation failed; `/v1/health` 404 |
| `api.stackr.app` smoke | Failed: DNS name does not exist |
| Docker build/layer scan | Not run: Docker unavailable on audit host |
| Full staging smoke | Not run: no staging endpoints/branch and no Railway credentials |

## Coverage and Performance Gate Status

| Gate | Required | Evidence | Result |
|---|---:|---|---|
| Cached catalogue p95 | <= 150 ms | No deployed gateway | Failed/unmeasured |
| Structured search p95 | <= 300 ms | 12 fixture cases only | Failed/unmeasured |
| Embedding lookup p95 | <= 350 ms | Vector lookup returns no candidates | Failed |
| Warm image fallback p95 | <= 1.2 s | No staged model/image path | Failed/unmeasured |
| Auto-confirm precision | >= 99.5% | Zero real evaluation cases | Failed/insufficient data |
| Real-world top-5 | >= 98% | Zero real evaluation cases | Failed/insufficient data |
| No confirmation below threshold | Required | Passes in local scoring tests | Local pass only |
| Catalogue language coverage | Five languages | Live canonical schemas absent; provider retirement `NO_GO` | Failed |
| Price provenance | Required | Legacy active-listing cache remains live path | Failed |
| Rollback proof | Required | No staging drill; live migration history empty | Failed |

## Supabase Advisor References

- Security-definer views: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
- Public bucket listing: https://supabase.com/docs/guides/database/database-linter?lint=0025_public_bucket_allows_listing
- Anonymous security-definer execution: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- Authenticated security-definer execution: https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- Leaked-password protection: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Rollback Position

No production mutation, deployment, migration, object download, or secret rotation was performed during this audit. Read-only database queries, advisor/log inspection, DNS/HTTP health checks, local builds, and local tests were used.

There is no proven application rollback path today because the v1 system is not deployed, remote migration history is empty, and no staging rollback drill exists. The safest immediate containment is credential rotation and access restriction, not application rollback.

## Required Re-Audit Gates

A new release audit may begin only after:

1. Every historical secret has been rotated and access logs reviewed.
2. Profile, scan-storage, and market-snapshot isolation tests pass against staging and production-safe assertions.
3. The exact release branch is committed, pushed, reviewed, and reproducible.
4. Remote migration history is reconciled and restore/rollback is demonstrated in staging.
5. `api.stackr.app` resolves and the mobile staging build uses it exclusively.
6. Direct Railway origin access fails without gateway credentials.
7. The recognition service has a selected licensed model, complete index, real vector lookup, and calibrated benchmark evidence.
8. Real concurrent load, cold-start, malformed-image, decompression-bomb, provider-outage, and cost tests pass.
9. Queue workers and dead-letter recovery pass an end-to-end outage drill.
10. Provider retirement, catalogue coverage, pricing provenance, and asset-rights gates all report GO from measured evidence.

## Final Recommendation

**NO-GO for Stage 2 production migration, provider retirement, public v1 release, recognition activation, mobile publication, and production deployment.**

The exact next stage is an incident-remediation and release-baseline stage: rotate credentials, close the three live data-exposure paths, disable legacy public mutation/provider routes, establish an isolated staging environment, and reconcile migration history. Only then should this red-team audit be rerun from a committed release candidate.
