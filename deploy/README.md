# Stackr Deployment

Stage 13 defines reproducible workflows; it does not authorise a live release. No command in this directory should be run against production until the release gates below are green and the `production` GitHub environment has a required reviewer.

## Provider Map

| Component | Existing provider | Repository source |
| --- | --- | --- |
| Mobile | Expo/EAS | repository root, `app.config.js`, `app.json`, `eas.json` |
| Public gateway | Cloudflare Workers | `gateway/` |
| Catalogue API | Railway | `backend/` |
| Recognition API | Railway | `recognition-service/` |
| Postgres, Auth, Storage | Supabase | `supabase/` |
| CI and release control | GitHub Actions | `.github/workflows/` |
| Scheduled price work | GitHub Actions | `.github/workflows/price-refresh.yml` |
| Catalogue ingestion | GitHub Actions, disabled by default | `.github/workflows/ingestion-workers.yml` |

No second hosting provider is introduced.

## Current Release Gates

`deploy/release-manifest.json` is deliberately fail-closed:

- `migrationHistoryAligned=false`: the linked production project reports no remote migration history, while this repository has many migrations and no baseline for the older live `public` schema.
- `activeModelSelected=false`: no benchmark-approved model, checksum, ONNX export or production licence decision exists.
- `activeIndexValidated=false`: no complete inactive index is available for activation.
- `storageBackupVerified=false`: a fresh production backup has not been verified by these workflows.

These checked-in booleans are authoritative. Protected GitHub variables are a second human approval, not an override: release preflight fails when either the evidence gate is false or its matching approval variable is not `true`.

The live Supabase project is healthy, but its migration history is empty and its existing security advisor reports public `SECURITY DEFINER` views/functions, broad storage listing policies, and RLS tables without policies. Those are pre-existing production findings and require a separate reviewed security migration after the baseline is established.

The isolated Supabase staging project is `lmwfhvexfcoyeuoyrlco`; production is `oakdbbzdqwurpjnoqhmu`. The staging security rehearsal was completed and its temporary records were removed. No Stage 13 migration has been applied to production.

The latest non-secret readiness snapshot is `deploy/evidence/staging-readiness-2026-07-30.json`. It records 78 local migration files, 20 isolated staging/rehearsal history entries, zero production migration entries, 11 completed staging physical backups, 8 completed production physical backups, and an empty staging Storage inventory. GitHub Actions run `30551243946` restored the current staging logical backup into branch project `krjttpmthxkfsbqksxci` and verified 34 tables, all 20 migration-history records, selected extensions and table data fingerprints. The private Storage fixture also restored with a matching checksum, denied anonymous access and verified cleanup. The production backup gate remains closed because this evidence is staging-only.

`deploy/evidence/staging-migration-reconciliation-2026-07-30.json` records the hash and schema-inventory comparison. Three repository migrations are accounted for on current staging, 17 entries are staging-only support/rehearsal changes, and 75 repository migrations remain unverified there. The missing production-era schema baseline was captured read-only, checksum-pinned, and replayed through the then-current migration chain on an isolated branch. GitHub Actions run `30551864110` produced a historical candidate with exactly 76 repository migration entries and 179 tables. The repository now contains 78 migrations, so that candidate is two migrations stale and must not be promoted. Current staging was not mutated and production was not mutated.

The historical candidate is not promotable. It is two migrations behind the current chain, and Supabase advisors reported 57 security findings on that production-like candidate, including 7 errors and 33 warnings, while the catalogue-only staging project has zero current security findings. Replacing staging now would be a security regression and would discard an authorised 120-printing catalogue/provenance dataset unless it is migrated deliberately. `scripts/deploy/verify-staging-migration-reconciliation.mjs --require-aligned` and `scripts/deploy/verify-staging-readiness-evidence.mjs --require-release-ready` therefore continue to fail closed.

The manual `capture-production-schema-baseline.yml` workflow reads `SUPABASE_PRODUCTION_DB_URL` only from the protected `migration-baseline` GitHub environment. It creates a schema-only dump plus migration-history metadata, scans those files for secrets, uploads a private artifact with one-day retention, and deletes the runner copy. Run `30545148545` produced the verified private artifact used by the two successful isolated replays. The workflow has no migration, restore, data-export or deployment command and must remain manually dispatched.

`deploy/evidence/stage6-capture-readiness-2026-07-30.json` records the real-capture inventory. No reviewed Scan Lab export exists, both staging benchmark tables are empty, and the legacy production training table has zero rows. Ten objects exist in the legacy public `card-scans` bucket, but they have no explicit training-consent, verified-label or physical-card-session linkage and were not downloaded or used.

Do not flip manifest values to make a workflow pass. Resolve the underlying evidence, commit the evidence-backed state change for review, and independently set the matching protected GitHub variable.

## Local Verification

Use Node 22. Docker is required for the local Supabase database and the recognition image.

```powershell
npm ci
npm ci --prefix backend
npm ci --prefix gateway
npm run lint
npm run typecheck
npm run typecheck:backend
npm run check:api-contract
npm run test:database-migrations
npm run test:deployment
node scripts/deploy/verify-staging-migration-reconciliation.mjs
node scripts/deploy/verify-staging-readiness-evidence.mjs
npm test --prefix gateway
docker build --pull -t stackr-recognition:local recognition-service
```

Once the legacy database baseline has been committed and approved:

```powershell
npx supabase@2.110.0 start
npx supabase@2.110.0 db reset --local
npx supabase@2.110.0 test db --local supabase/tests
```

Do not run that reset against a linked project.

## GitHub Environments

Create protected `staging`, `production`, and `ingestion` environments. Require manual approval for production.

Environment secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_URL
RAILWAY_TOKEN
RAILWAY_API_TOKEN
CLOUDFLARE_API_TOKEN
EXPO_TOKEN
```

Runtime/API credentials such as Supabase service-role keys, origin keys and provider tokens belong in Railway, Cloudflare or the protected `ingestion` environment, never in the mobile bundle.

Environment variables:

```text
SUPABASE_PROJECT_REF
RAILWAY_PROJECT_ID
RAILWAY_ENVIRONMENT_ID
RAILWAY_BACKEND_SERVICE_ID
RAILWAY_RECOGNITION_SERVICE_ID
CLOUDFLARE_ACCOUNT_ID
STACKR_BACKEND_URL
STACKR_RECOGNITION_URL
STACKR_GATEWAY_URL
STACKR_MIGRATION_BASELINE_APPROVED
STACKR_MODEL_INDEX_RELEASE_APPROVED
STACKR_STORAGE_BACKUP_APPROVED
```

The three approval variables must remain `false` until their corresponding evidence is reviewed. `SUPABASE_PROJECT_REF` must be `lmwfhvexfcoyeuoyrlco` in staging and `oakdbbzdqwurpjnoqhmu` in production; preflight rejects a crossed environment.

## Workflow Responsibilities

- `platform-ci.yml`: lint, type checks, unit/integration tests, migration contracts, OpenAPI drift, image build, dependency and secret scans, and benchmark smoke tests.
- `capture-production-schema-baseline.yml`: manual read-only capture of the missing production-era schema baseline using a separately protected environment and a one-day private artifact.
- `deploy-staging.yml`: verifies backup, dry-runs migrations, deploys both Railway services, requires model/index readiness, deploys the staging gateway, and optionally publishes an EAS update.
- `deploy-production.yml`: reruns release checks, verifies backup, applies compatible migrations, deploys rolling services, activates catalogue/index versions, starts a Cloudflare and optional EAS canary, monitors, and optionally promotes.
- `rollback.yml`: restores one known-good gateway, Railway deployment, catalogue version, index/model combination, reverts an in-progress EAS rollout, or republishes a known-good EAS update group.
- `ingestion-workers.yml`: manual provider scopes plus a schedule that remains disabled until both terms-approval variables are true.

Supabase logical backups are written only to the ephemeral GitHub runner and removed in an `always()` step. They are never uploaded as public workflow artifacts.

## Release Order

1. Verify CI and approvals.
2. Verify a recent Supabase physical backup and make ephemeral logical dumps.
3. Dry-run and apply backward-compatible migrations.
4. Deploy rolling Railway services while the existing gateway remains available.
5. Verify approved model assets and the complete inactive index.
6. Run private readiness and smoke tests.
7. Atomically activate catalogue and index versions.
8. Upload the gateway and start a small traffic canary.
9. Optionally publish the matching EAS canary.
10. Observe quality, errors and latency; promote only after gates pass.

Railway currently has no separate inactive production recognition service recorded in the repository. Its deployment is therefore rolling, not a blue/green service swap. This is an explicit limitation and requires backward-compatible service contracts.

## Provider Setup Still Required

The workflows need protected values for every name listed above. In particular, the Railway recognition service ID, staging/production Railway environment IDs, Cloudflare account/token, three service URLs, Supabase database URLs/access tokens, and Expo token are not derivable from source control. Add them in the matching GitHub environment without posting their values in an issue, log, or client configuration.

The immediate staging recovery blocker is the protected source and restore database URLs plus backend-only Storage credentials. The local Supabase CLI state is linked to production, so backup commands must use the explicit staging database URL and must never use `--linked`. Provider PITR restores operate on the selected project and are not an acceptable staging restore rehearsal because they would overwrite the source project.

The temporary isolated restore target is `kynqqwyctohrjqloyedh` (`Stackr staging restore drill 2026-07-30`, `eu-west-1`). Supabase quoted it at USD 10 monthly. Delete it after the verified drill so it does not continue billing. The manual `staging-recovery-drill.yml` workflow creates current ephemeral database dumps, restores them into that target, compares schema/data/migration fingerprints, then creates and checksum-verifies a private Storage fixture. It never targets production.

Railway memory, CPU, replica, and usage limits are account-side settings rather than fields in the checked-in service configuration. Configure and record them for both `backend` and `recognition-service` before a production canary; use measured model memory to select recognition concurrency. A provider screenshot or exported non-secret settings record is required evidence.

Current verdict: deployment tooling is reproducible, but staging and production release are **NO-GO** while the four manifest gates remain false. The workflows are intended to refuse deployment in that state.

## Model And Index Blocker

The recognition image excludes models and training data. The intended production model must be stored in the private `stackr-model-private` bucket, recorded in `ml.model_assets`, checksum-verified, and made available read-only at `STACKR_RECOGNITION_MODEL_PATH` before startup. That download/mount mechanism cannot be finalised until Stage 6 selects the model and artifact format.

`npm run deploy:verify-model -- --require-active` will continue to fail until that work is real. Do not replace it with a placeholder file.

## Worker Blocker

The repository has an idempotent ingestion CLI and durable queue tables, and Stage 13 supplies terms-gated manual/scheduled orchestration. It does not contain queue-draining executors for every requested catalogue, asset, embedding and dead-letter lane. Do not create Railway worker services or enable provider schedules until those Stage 3/4/6 workers exist, have health checks, and have source-licence approval.
