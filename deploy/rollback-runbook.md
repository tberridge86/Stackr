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

## Catalogue API Or Recognition Service

Use the deployment ID that Railway reports as rollback-eligible:

```powershell
$env:RAILWAY_API_TOKEN = '<set locally; do not paste into chat>'
node scripts/deploy/railway-rollback.mjs --deployment='<deployment-id>'
Remove-Item Env:RAILWAY_API_TOKEN
```

Railway reuses the selected deployment image and configuration. Confirm runtime variables still point at the intended Supabase project and private service credentials.

## Catalogue Version

```powershell
$env:SUPABASE_DB_URL = '<set locally; do not paste into chat>'
$env:STACKR_RELEASE_REQUEST_ID = '<incident-id>'
node scripts/deploy/release-database.mjs catalogue rollback `
  --id='<validated-draft-compensating-catalogue-version-uuid>' `
  --reason='<reason>'
Remove-Item Env:SUPABASE_DB_URL
Remove-Item Env:STACKR_RELEASE_REQUEST_ID
```

Catalogue rollback is forward-only. The UUID must identify a new draft version
whose compensating mobile changes start after the active failed version. Never
pass an old deprecated or rolled-back catalogue version.

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

Rollback the latest update group on its branch/runtime:

```powershell
npx eas-cli@21.4.0 update:rollback '<latest-update-group-id>' `
  --platform all `
  --message '<incident-id>' `
  --non-interactive
```

Because scanner flags are bundled via EAS environment variables, republishing the previous update restores the previous remote configuration. Store no service credentials in those values.

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

Then verify authentication, one catalogue lookup, one structured search, one ambiguous scan, current manifest versions, logs without secret/image payloads, and the incident metric that triggered rollback.
