# Cardmarket public guide worker

The Cardmarket backup has two dedicated Railway cron services: staging and production. Both use the deployed source commit `3534ea3`; the configured build is successful. That only proves the worker image is available. The first scheduled execution, due at minute 17 UTC, is still pending and must be recorded separately when it completes.

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

The completed 4 October production import used the retained files, scanned all 150 bounded product pages, saved 9,224 reviewed printing mappings and 9,223 Cardmarket estimates, and recorded 65,397 repairs. The price guide is a blended general estimate only: language, condition, finish, and grade are null; `usableForExactVariant` and `usableForHoldingsValuation` are false. It preserves the original EUR guide value and a dated ECB EUR→GBP conversion. It never writes exact finish/condition prices or collection valuation inputs.

Do not expose either cron service through a public domain. The worker rejects a missing/mismatched target, relative cache path, or a mapping/checkpoint outside the mounted volume.