# Backend Pricing V2 Finalise Checklist

Date: 2026-07-26

## What The Backend Is

The Stackr mobile app is already pointing at this live backend:

```text
https://pocketvault-production.up.railway.app
```

This is a Railway-hosted Node/Express API. The backend code lives in:

```text
D:\Stackr-1\backend
```

The backend start command is:

```text
npm start
```

from inside the `backend` folder.

## Current Live Status

Health check works:

```text
https://pocketvault-production.up.railway.app/api/health
```

Pricing V2 is not live yet if this returns `404`:

```text
https://pocketvault-production.up.railway.app/api/pricing/test-card-id
```

A `404` here means Railway has not yet been redeployed with the new backend route.

## Railway Variables To Add

In Railway, open the Stackr backend service and add these variables:

```text
SUPABASE_URL=https://oakdbbzdqwurpjnoqhmu.supabase.co
SUPABASE_SECRET_KEY=<your Supabase secret key>
PRICING_ENGINE_V2_ENABLED=true
PRICING_V2_EBAY_ACTIVE_ENABLED=false
```

Keep `SUPABASE_SECRET_KEY` backend-only. Do not add it to Expo, the mobile app, or `eas.json`.

Optional later:

```text
EBAY_CLIENT_ID=<your eBay client id>
EBAY_CLIENT_SECRET=<your eBay client secret>
EBAY_MARKETPLACE_ID=EBAY_GB
```

Only enable this after the cached V2 rollout is stable:

```text
PRICING_V2_EBAY_ACTIVE_ENABLED=true
```

## Railway Service Settings

The Railway service should use:

```text
Root directory: backend
Start command: npm start
```

If Railway is already serving the health endpoint correctly, these settings are probably already correct.

## Deployment Steps

1. Push the updated Stackr code to GitHub.
2. Open Railway.
3. Open the `pocketvault-production` backend service.
4. Add or confirm the variables above.
5. Trigger a redeploy.
6. Wait for the deploy to finish.
7. Open:

```text
https://pocketvault-production.up.railway.app/api/health
```

8. Then open:

```text
https://pocketvault-production.up.railway.app/api/pricing/test-card-id
```

Expected result after the new code is live:

- Not `404`.
- It may return “insufficient exact market evidence” for a fake card ID, which is fine.

## Mobile App Switch

After the backend is live and the V2 backfill report looks clean, enable the app-side flag:

```text
EXPO_PUBLIC_PRICING_ENGINE_V2_ENABLED=true
```

The app already has:

```text
EXPO_PUBLIC_PRICE_API_URL=https://pocketvault-production.up.railway.app
```

## Backfill

Run this from the local PowerShell window that has your Supabase secret available:

```powershell
npm run pricing-v2:deploy
```

This fills V2 cached prices without exposing the secret to the mobile app.
