# Staging Runbook

## Purpose

Prove the exact release on isolated staging resources before production. Staging must have its own Railway environment/services, Cloudflare Worker environment, Supabase project, URLs, and EAS channel. The approved Supabase staging ref is `lmwfhvexfcoyeuoyrlco`; never substitute the production ref `oakdbbzdqwurpjnoqhmu`.

## One-Time Setup

1. Create the protected GitHub environment `staging`.
2. Add the secrets and variables listed in `deploy/README.md` with staging values.
3. Configure Railway runtime variables for the backend and recognition service. Keep Supabase secret/service-role keys and `STACKR_GATEWAY_ORIGIN_KEY` server-only.
4. Configure Cloudflare secrets with `wrangler secret put --env staging`; do not commit values.
5. Configure EAS `preview` environment values and keep only `EXPO_PUBLIC_*` public values in the update bundle.
6. Leave `STACKR_MIGRATION_BASELINE_APPROVED=false` until a local reset from migration zero passes against the correct baseline.
7. Leave `STACKR_MODEL_INDEX_RELEASE_APPROVED=false` until Stage 6 has approved and checksum-verified the model and inactive index.
8. Leave `STACKR_STORAGE_BACKUP_APPROVED=false` until the bucket inventory, retention policy, backup/export mechanism, and an isolated restore have been verified.

The same four facts must be `true` in `deploy/release-manifest.json`. GitHub variables cannot override false manifest gates.

Required Cloudflare secret commands:

```powershell
Set-Location gateway
npx wrangler secret put BACKEND_ORIGIN_KEY --env staging
npx wrangler secret put BACKEND_ADMIN_KEY --env staging
npx wrangler secret put RECOGNITION_SERVICE_SECRET --env staging
```

## Preflight

Run from a clean checkout of the release commit:

```powershell
npm ci
npm ci --prefix backend
npm ci --prefix gateway
npm run deploy:preflight
npm run deploy:verify-model
node scripts/deploy/verify-staging-readiness-evidence.mjs --require-release-ready
```

Review the reported warnings. The release manifest currently blocks migration, model, index, and storage gates, so a release-mode preflight must fail today. That failure is expected and prevents any provider mutation.

The 2026-07-30 rehearsal proved the Stage 6 registry migration and rollback against staging, including RLS, private grants, activation guards and fixed function search paths. The `vector` extension was then enabled on staging only and verified at version `0.8.2`; no vector column or active index was created. Migration history is only partially reconciled: 3 repository migrations are accounted for, 17 entries are staging-only, and 73 repository migrations remain unverified. Do not stamp or push those migrations merely to align the counters.

Supabase reports 11 completed staging physical backups, but the latest (`1245215485`, `2026-07-30T03:47:35.742Z`) predates the vector and catalogue reconciliation changes. Staging Storage is empty. A current logical Postgres dump and an isolated Postgres/Storage restore test still require the protected staging database URL and a separate restore target. The evidence is recorded in `deploy/evidence/staging-recovery-2026-07-30.json`.

The approved temporary restore target is `kynqqwyctohrjqloyedh`. Before dispatching **Stackr Staging Recovery Drill**, configure these protected `staging` environment secrets:

```text
SUPABASE_ACCESS_TOKEN
SUPABASE_DB_URL
SUPABASE_RESTORE_DB_URL
SUPABASE_STAGING_SECRET_KEY
SUPABASE_RESTORE_SECRET_KEY
```

Configure these environment variables:

```text
SUPABASE_PROJECT_REF=lmwfhvexfcoyeuoyrlco
SUPABASE_RESTORE_PROJECT_REF=kynqqwyctohrjqloyedh
```

Use each project's Session pooler connection string for the database URL. Obtain or reset each database password inside its Supabase dashboard, then save the complete URL directly as the GitHub secret. Use backend-only secret API keys for the Storage drill. Never put either key or database URL in source, logs, Expo configuration, or chat.

Dispatch the recovery workflow only after those protected values exist:

```powershell
gh workflow run staging-recovery-drill.yml `
  --ref chore/api-gateway-v1 `
  -f confirmation='RESTORE STAGING BACKUP'
```

The workflow deletes raw dump and object bytes at completion. Review its non-secret job summary, update the checked-in recovery evidence only from a successful run, then delete the temporary restore project to stop its quoted USD 10 monthly charge.

## Dispatch

From GitHub Actions, choose **Deploy Stackr Staging**, type `DEPLOY STAGING`, and initially leave both optional toggles off.

Equivalent GitHub CLI command:

```powershell
gh workflow run deploy-staging.yml `
  --ref main `
  -f confirmation='DEPLOY STAGING' `
  -f apply_migrations=false `
  -f publish_mobile_update=false
```

Once all gates are evidence-backed, the workflow must complete the physical-backup check, logical backup verification, migration dry run, both Railway deployments, private readiness, gateway activation, and public smoke tests. Logical dumps are deleted even on failure.

Before dispatch, confirm the `staging` GitHub environment contains every secret and variable listed in `deploy/README.md`. The presently unverified account-side items are the Railway recognition service and service IDs, Railway resource/usage limits, Cloudflare credentials/domain, provider URLs, Supabase database URL/access token, Expo token, and a restorable object-storage plan. Do not create placeholders for any of them.

## Migration Trial

Only after the remote migration history is fully reconciled and staging has a verified rollback point, rerun with:

```powershell
gh workflow run deploy-staging.yml `
  --ref main `
  -f confirmation='DEPLOY STAGING' `
  -f apply_migrations=true `
  -f publish_mobile_update=false
```

Verify:

```text
/health returns 200 from the backend
/ready returns 200 from recognition
/v1/health returns 200 through the gateway
/v1/ready returns 200 through the gateway
/v1/catalog/manifest returns 200 and an ETag
request IDs are returned unchanged
private recognition metrics remain inaccessible without service credentials
```

Do not use the local linked project for the backup or migration trial: its `.temp/project-ref` may identify production. Supply the protected staging `SUPABASE_DB_URL` explicitly. Do not run `backups restore` against staging as a rehearsal; that overwrites the source project. Restore the logical dump into an isolated target, verify schema and row-count/checksum evidence, then delete or retain that target according to the approved recovery plan.

## Mobile Trial

Publish to the `staging` EAS channel only after API smoke tests pass. Test a real development build on iOS and Android for authentication, catalogue bootstrap, exact offline recognition, ambiguous recognition, image fallback, and Ximilar emergency fallback disabled/enabled by the intended flags.

There is no automated real-device mobile end-to-end suite in the repository. That is a release blocker for claiming step 9 of the requested production sequence is automated.

## Exit Criteria

- All CI jobs green on the exact commit.
- Staging migrations reset and pgTAP tests pass from migration zero.
- Catalogue and index versions are complete but inactive before activation.
- Model checksum, licence, preprocessing and ONNX compatibility are verified.
- Service and public smoke tests pass.
- Mobile real-device checks are recorded with app/runtime versions.
- Rollback workflow is exercised against staging and returns to a known-good version.
