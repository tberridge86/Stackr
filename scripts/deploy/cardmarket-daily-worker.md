# Cardmarket daily Railway cron worker

Create a separate Railway service from this repository. Its start command is:

```
node scripts/cardmarket-daily-worker.mjs
```

Attach a dedicated persistent volume at `/var/lib/cardmarket`, then set `STACKR_CARDMARKET_CACHE_DIR=/var/lib/cardmarket`. The worker stores the verified raw `products` and `priceGuide` JSON files, manifest, reviewed mapping ledger, and restart checkpoint below that mount. It is designed for the Railway cron schedule `17 3 * * *` (UTC), after the retained guide’s reported 02:40 CEST source timestamp. Railway skips overlapping cron executions, so this must remain a short-lived service with no public domain.

Set `STACKR_CARDMARKET_DAILY_WORKER_ENABLED=true` to retain the conditional daily files. This mode makes no database writes. The retention function verifies each retained file SHA-256 and uses the manifest ETag after the 24-hour lease, so repeat invocations do not re-download the files.

After a reviewed mapping ledger has been placed at `/var/lib/cardmarket/reviewed/mappings.json`, set these values to enable the separately reviewed general-price update:

```
STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED=true
STACKR_CARDMARKET_MAPPING_LEDGER_PATH=/var/lib/cardmarket/reviewed/mappings.json
STACKR_CARDMARKET_CHECKPOINT_PATH=/var/lib/cardmarket/checkpoints/daily.json
STACKR_EXPECTED_SUPABASE_PROJECT_REF=<the one permitted project ref>
SUPABASE_URL=https://<the one permitted project ref>.supabase.co
SUPABASE_SECRET_KEY=<service-only secret>
```

The ledger and checkpoint must remain inside the mounted cache directory. The worker refuses a missing or mismatched target, a non-absolute cache path, or a ledger/checkpoint outside the volume. It calls the existing review-only mapping RPC and writes only printing-scoped blended general estimates; it never writes exact finish or condition prices.
