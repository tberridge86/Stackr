# Rollback Runbook

Rollback is component-specific. Do not restore the whole database merely because one service is unhealthy.

## Automated Entry Point

In GitHub Actions, run **Roll Back Stackr Component**, select `staging` or `production`, choose one component, provide its known-good ID, type `ROLLBACK STACKR`, and enter an incident reason.

```powershell
gh workflow run rollback.yml `
  --ref main `
  -f environment=production `
  -f component=gateway `
  -f target_id='<known-good-version-tag>' `
  -f confirmation='ROLLBACK STACKR' `
  -f reason='<incident-id and reason>'
```

## Gateway

Restore a known-good Cloudflare version tag to 100 percent:

```powershell
Set-Location gateway
npx wrangler versions deploy `
  --env production `
  --version-tag '<known-good-version-tag>@100' `
  --message '<incident-id>' `
  --yes
```

## Backend Or Recognition Service

Use the deployment ID that Railway reports as rollback-eligible:

```powershell
$env:RAILWAY_API_TOKEN = '<set locally; do not paste into chat>'
node scripts/deploy/railway-rollback.mjs `
  --component='<backend-or-recognition>' `
  --deployment='<deployment-id>'
Remove-Item Env:RAILWAY_API_TOKEN
```

Railway reuses the selected deployment image and configuration. Confirm runtime variables still point at the intended Supabase project and private service credentials.

## Catalogue Version

```powershell
$env:SUPABASE_DB_URL = '<set locally; do not paste into chat>'
$env:STACKR_RELEASE_REQUEST_ID = '<incident-id>'
node scripts/deploy/release-database.mjs catalogue rollback `
  --id='<known-good-catalogue-version-uuid>' `
  --reason='<reason>'
Remove-Item Env:SUPABASE_DB_URL
Remove-Item Env:STACKR_RELEASE_REQUEST_ID
```

This changes the active version; it does not delete catalogue history.

## Model And Embedding Index

```powershell
$env:SUPABASE_DB_URL = '<set locally; do not paste into chat>'
$env:STACKR_RELEASE_REQUEST_ID = '<incident-id>'
node scripts/deploy/release-database.mjs index rollback `
  --id='<known-good-index-version-uuid>' `
  --reason='<reason>'
Remove-Item Env:SUPABASE_DB_URL
Remove-Item Env:STACKR_RELEASE_REQUEST_ID
```

The database function atomically reactivates the requested validated index and its model. The corresponding checksum-verified model asset must still be available to the recognition service.

## Mobile Feature Flags And EAS Update

If a percentage rollout is still in progress, choose `mobile-rollout` and revert that rollout group:

```powershell
npx eas-cli@21.4.0 update:revert-update-rollout `
  --group '<rollout-update-group-id>' `
  --message '<incident-id>' `
  --non-interactive
```

To restore a previously published known-good group, choose `mobile-update` and republish it to the affected channel:

```powershell
npx eas-cli@21.4.0 update:republish `
  --group '<known-good-update-group-id>' `
  --destination-channel production `
  --platform all `
  --message '<incident-id>' `
  --non-interactive
```

Use `--destination-channel staging` for staging. Because scanner flags are bundled via EAS environment variables, the known-good group must contain the intended previous configuration. Store no service credentials in those values.

## Database Migration

Prefer forward-compatible corrective migrations. Manual SQL rollback files under `supabase/manual/` are break-glass aids and may be destructive if later code or data depends on the migrated objects. Review dependencies, back up, trial in staging, and obtain explicit approval before running one.

Never use:

```text
supabase db reset --linked
supabase migration repair without a reviewed reconciliation plan
git reset --hard as an operational rollback
```

## Verification

After every rollback, run:

```powershell
npm run deploy:smoke -- `
  --gateway='<gateway-url>' `
  --backend='<backend-url>' `
  --recognition='<recognition-url>' `
  --allow-recognition-not-ready
```

After a backend pricing rollback, also repeat the exact read-only pricing contract checks:

```powershell
$env:BACKEND_ORIGIN_KEY = '<set locally; do not paste into chat>'
node scripts/deploy/production-pricing-smoke.mjs `
  --backend='<backend-url>' `
  --gateway='<gateway-url>' `
  --variant-id='<canonical-variant-uuid>' `
  --expected-backend-commit='<known-good-40-character-git-sha>' `
  --expected-backend-deployment='<known-good-railway-deployment-id>' `
  --backend-origin-key-env=BACKEND_ORIGIN_KEY
Remove-Item Env:BACKEND_ORIGIN_KEY
```

Then verify authentication, one catalogue lookup, one structured search, one ambiguous scan, current manifest versions, logs without secret/image payloads, and the incident metric that triggered rollback.
