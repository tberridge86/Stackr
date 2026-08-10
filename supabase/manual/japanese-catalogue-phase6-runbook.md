# Japanese Catalogue Phase 6 Runbook

This phase proves the Japanese catalogue pipeline is working before any "complete" claim is made.

## 1. Apply the migration

In Supabase SQL Editor, run:

```text
supabase/migrations/20260717143000_japanese_catalogue_canonical_schema.sql
```

The migration creates canonical catalogue tables, the `japanese_catalogue_health` view, and compatibility columns for current product search.

## 2. Configure Railway backend variables

Set these on the Railway backend service:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
STACKR_ADMIN_API_KEY
TCGDEX_API_BASE_URL=https://api.tcgdex.net/v2
```

`TCGDEX_API_BASE_URL` is optional if the default is acceptable.

## 3. Smoke sync one Japanese set

From the backend endpoint:

```powershell
$env:STACKR_ADMIN_API_KEY="your-admin-key"
$body = @{ setId = "SV3"; allCards = $true } | ConvertTo-Json
Invoke-RestMethod `
  -Method Post `
  -Uri "https://pocketvault-production.up.railway.app/admin/catalogue/jp/sync" `
  -Headers @{ Authorization = "Bearer $env:STACKR_ADMIN_API_KEY" } `
  -ContentType "application/json" `
  -Body $body
```

Or from a local environment that has `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`:

```powershell
npm run sync-japanese-catalogue -- --set=SV3 --all-cards
```

## 4. Check health

```powershell
$env:STACKR_ADMIN_API_KEY="your-admin-key"
npm run health-japanese-catalogue
```

In the app, open:

```text
/admin/japanese-catalogue
```

## 5. Only then run a wider sync

After `SV3` shows sensible stored-card, image and missing-data totals:

```powershell
npm run sync-japanese-catalogue -- --all-cards
```

Do not call the catalogue complete until the health report confirms coverage and missing fields are visible.
