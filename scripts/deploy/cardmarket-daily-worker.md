# Cardmarket public guide worker

The Cardmarket backup has two dedicated Railway cron services: staging and production. Both have completed the 4 October retained-feed import and a subsequent cached hourly resume. Their minute-17 UTC schedules were restored at 10:39–10:40Z; final service-configuration readback remains pending.

Each service has its own 1 GB Railway volume mounted at `/var/lib/cardmarket`. Set:

```text
STACKR_CARDMARKET_CACHE_DIR=/var/lib/cardmarket
STACKR_CARDMARKET_DAILY_WORKER_ENABLED=true
```

The hourly minute-17 UTC check reads and verifies the durable manifest, products JSON, price-guide JSON, reviewed mapping ledger, and restart checkpoint on that volume. A valid pair already retained on the same UTC day is SHA-256-verified and reused. The public files are checked no more than once per daily revision boundary; restarts resume the same retained revisions rather than starting another provider sweep.

To enable the reviewed guide loader, retain these service-only settings:

```text
STACKR_CARDMARKET_PUBLIC_GUIDE_ENABLED=true
STACKR_CARDMARKET_MAPPING_LEDGER_PATH=/var/lib/cardmarket/reviewed/mappings.json
STACKR_CARDMARKET_CHECKPOINT_PATH=/var/lib/cardmarket/checkpoints/daily.json
STACKR_EXPECTED_SUPABASE_PROJECT_REF=<permitted project ref>
SUPABASE_URL=https://<permitted project ref>.supabase.co
SUPABASE_SECRET_KEY=<service-only secret>
```

The loader binds each saved mapping to one reviewed printing and current catalogue revision. It is idempotent: unchanged mapping reviews survive restart, retained feed revisions are reused, and the product checkpoint resumes from its saved product ID. Missing, ambiguous, or unusable provider products become explicit repair rows; they are never guessed.

The completed 4 October production import ran from 10:32:25Z to 10:34:20Z, scanned all 150 bounded product pages, saved 9,224 reviewed printing mappings and 9,223 Cardmarket estimates, and recorded 65,397 repairs. Staging completed the same cohort at 10:34:27Z. The following cached checks completed in about one second with no new estimates. Execution IDs, retained source revisions, and schedule evidence are recorded in `docs/releases/daily-pricing-execution-20261004.json`.

Do not expose either cron service through a public domain. The worker rejects a missing/mismatched target, relative cache path, or a mapping/checkpoint outside the mounted volume.
