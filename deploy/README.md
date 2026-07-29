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

Railway memory, CPU, replica, and usage limits are account-side settings rather than fields in the checked-in service configuration. Configure and record them for both `backend` and `recognition-service` before a production canary; use measured model memory to select recognition concurrency. A provider screenshot or exported non-secret settings record is required evidence.

Current verdict: deployment tooling is reproducible, but staging and production release are **NO-GO** while the four manifest gates remain false. The workflows are intended to refuse deployment in that state.

## Model And Index Blocker

The recognition image excludes models and training data. The intended production model must be stored in the private `stackr-model-private` bucket, recorded in `ml.model_assets`, checksum-verified, and made available read-only at `STACKR_RECOGNITION_MODEL_PATH` before startup. That download/mount mechanism cannot be finalised until Stage 6 selects the model and artifact format.

`npm run deploy:verify-model -- --require-active` will continue to fail until that work is real. Do not replace it with a placeholder file.

## Worker Blocker

The repository has an idempotent ingestion CLI and durable queue tables, and Stage 13 supplies terms-gated manual/scheduled orchestration. It does not contain queue-draining executors for every requested catalogue, asset, embedding and dead-letter lane. Do not create Railway worker services or enable provider schedules until those Stage 3/4/6 workers exist, have health checks, and have source-licence approval.
