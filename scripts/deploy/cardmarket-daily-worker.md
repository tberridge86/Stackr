# Cardmarket public guide worker

The Cardmarket backup has two dedicated Railway cron services: staging and production. Both have completed the 4 October retained-feed import and subsequent cached hourly resumes. Their minute-17 UTC schedules were restored at 10:39–10:40Z. Production configuration and its mounted volume were read back on 6 October; its actual minute-17 run completed with the bounded-ledger source described below.

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

The loader binds each saved mapping to one reviewed printing and current catalogue revision. It reads 100 mappings per database page and permits at most 2,500 pages, retaining the 250,000-mapping ceiling. It rejects partial/error pages and writes the ledger atomically only after validating every row and the monotonic product cursor. It is idempotent: unchanged mapping reviews survive restart, retained feed revisions are reused, and the product checkpoint resumes from its saved product ID. Missing, ambiguous, or unusable provider products become explicit repair rows; they are never guessed.

On 6 October, production was pinned to tested source `f6aee12a18a89c28b8fd1b9c234a9d834e8ced4b` on `codex/stackr-bounded-price-worker-writes`. Deployment `c7286876-4d57-4cf9-aaf3-ac1162958684` completed its actual scheduled run at 00:21:40Z with all 9,234 reviewed mappings and unchanged retained price revisions. The one-gigabyte production volume and schedule were preserved. This closes the prior 500-row ledger-read timeout; it does not prove a new provider price dataset or the separate TCGCSV write path.

Prices retain the provider's actual `createdAt`, dated FX and 48-hour expiry. An updated product catalogue, download timestamp or successful cron does not renew an unchanged price guide. At 00:17Z on 6 October the upstream price file still had a 4 October 00:40:55Z source date. Preserve stale saved values and their date if the provider has not advanced; count only positive unexpired values as fresh coverage. See `docs/releases/pricing-cardmarket-repair-and-native-gap-review-20261006.json`.

The completed 4 October production import ran from 10:32:25Z to 10:34:20Z, scanned all 150 bounded product pages, saved 9,224 reviewed printing mappings and 9,223 Cardmarket estimates, and recorded 65,397 repairs. Staging completed the same cohort at 10:34:27Z. The following cached checks completed in about one second with no new estimates. Execution IDs, retained source revisions, and schedule evidence are recorded in `docs/releases/daily-pricing-execution-20261004.json`.

Do not expose either cron service through a public domain. The worker rejects a missing/mismatched target, relative cache path, or a mapping/checkpoint outside the mounted volume.
