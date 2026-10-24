# Prepared Railway catalogue price worker

This config reuses the existing dedicated catalogue price Docker image and
`run-catalogue-price-cron.mjs`. It creates no service and activates no schedule.
The API remains a separate service. Existing Cardmarket workers are unchanged.

Use repository root build context and explicitly select
`deploy/catalogue-price-worker/railway.json` as the service config file. Its start
command selects the guarded wrapper; the Dockerfile's existing CMD is preserved
for services that have not adopted this config. No public domain or HTTP health
check is required. The prepared config has no `cronSchedule` and uses restart
policy `NEVER`, so a disabled invocation reports its state and exits without a
restart loop. Omitting a schedule does not remove one already set on a service.

The accompanying `.env.example` is disabled by default. All of these controls
must be satisfied before the wrapper starts any provider/database work:

- `STACKR_CATALOGUE_PRICE_WORKER_ENABLED=true`.
- `STACKR_CATALOGUE_PRICING_SCHEDULER=railway`.
- `STACKR_CATALOGUE_BULK_PRICING_ENABLED=true`.
- An explicitly named Supabase project, matching HTTPS project URL and a
  server-only database credential.

The existing runner has a 50-minute deadline, then SIGTERM and a five-second
SIGKILL grace. Provider calls are limited to 12 seconds; database requests to
45 seconds. Existing SQL claims provider feed revisions with two-minute leases
and provider groups with 30-minute leases. Failed groups retain checkpoints and
bounded retry delays. Expired completion tokens fail rather than mark a group
complete. These mechanisms are reused, not replaced with an in-memory queue.
Keep one scheduled service/replica until a separate scaling review verifies
the complete write/lease contract under contention.

## Reviewed cutover sequence

1. Identify the existing service and environment, pin the reviewed commit, and
   rehearse with isolated credentials. Do not create a duplicate scheduled worker.
2. Set GitHub repository variable `STACKR_CATALOGUE_PRICING_SCHEDULER=railway` to
   suppress the scheduled bulk-guide lanes in `.github/workflows/price-refresh.yml`.
   Wait for any current GitHub bulk run to drain. This handoff does not disable
   other pricing lanes or manual recovery dispatches.
3. Verify the same scheduler ownership setting on Railway, the separate enable
   flags and target. Approve one bounded run and inspect its actual receipts.
4. Only after that evidence is accepted, configure the agreed cron schedule.
   Check provider revision freshness, durable coverage and failures after the
   actual scheduled run; a successful container build is insufficient.
5. For rollback, disable/drain the Railway worker before restoring GitHub
   scheduler ownership. Preserve existing durable checkpoints and price evidence.

The local activation test mocks the writer and performs no provider or database
requests: `node scripts/test-railway-catalogue-price-worker.mjs`. Existing timeout
tests run with `node scripts/test-catalogue-price-cron.mjs`. Live service config,
scheduler ownership and cost must still be verified during the approved cutover.

The config fields were checked against the current
[Railway JSON schema](https://railway.com/railway.schema.json) on 23 October 2026.
This is a schema review, not evidence that a live service accepted the config.
