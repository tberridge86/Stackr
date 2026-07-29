# Production Runbook

## Authority And Preconditions

Production deployment is a manual GitHub workflow from `main` through the protected `production` environment. It requires a reviewer and a known-good Cloudflare version tag. Do not deploy from a local dirty worktree.

All of these must be true:

- The exact commit passed `Stackr Platform CI` and staging.
- Supabase production migration history is aligned with the repository and `STACKR_MIGRATION_BASELINE_APPROVED=true` was approved from evidence.
- The release contains only backward-compatible migrations; destructive cleanup is deferred.
- Supabase reports a recent completed physical backup and the workflow can create and verify ephemeral schema/data dumps.
- Stage 6 approved the production model and inactive index; `STACKR_MODEL_INDEX_RELEASE_APPROVED=true` is evidence-backed.
- A valid inactive catalogue version UUID and embedding index UUID are recorded.
- Railway rolling deployment compatibility has been reviewed.
- The current gateway tag, Railway deployment IDs, catalogue version, index version and EAS update group are recorded for rollback.

## Release Command

Start with a 5 percent canary and no automatic promotion:

```powershell
gh workflow run deploy-production.yml `
  --ref main `
  -f confirmation='DEPLOY PRODUCTION' `
  -f previous_gateway_tag='<known-good-tag>' `
  -f previous_backend_deployment_id='<known-good-backend-deployment-id>' `
  -f previous_recognition_deployment_id='<known-good-recognition-deployment-id>' `
  -f previous_catalogue_version_id='<known-good-catalogue-uuid>' `
  -f previous_index_version_id='<known-good-index-uuid>' `
  -f catalogue_version_id='<validated-catalogue-uuid>' `
  -f index_version_id='<validated-index-uuid>' `
  -f canary_percent=5 `
  -f monitor_minutes=15 `
  -f apply_migrations=true `
  -f publish_mobile_update=false `
  -f promote_gateway=false
```

The workflow performs the deployment in this order:

1. Re-run release-critical tests and fail-closed preflight.
2. Verify the latest physical backup and create logical schema/data dumps on the ephemeral runner.
3. Dry-run, then optionally apply migrations.
4. Deploy the Railway catalogue API and recognition service with overlap/draining configuration.
5. Run readiness tests before changing public traffic.
6. Atomically activate the validated catalogue and index versions with an audited request ID.
7. Upload a new Cloudflare Worker version without traffic.
8. Split traffic between the known-good gateway tag and new tag.
9. Optionally publish a matching EAS rollout.
10. Wait for the observation window and repeat smoke tests.
11. Promote only when the dispatch explicitly requested it.

If any step after a component change fails, the workflow attempts rollback in reverse order: EAS update, gateway traffic, index/model activation, catalogue activation, recognition deployment, then catalogue API deployment. Each rollback is attempted even if an earlier rollback action fails, and the workflow remains failed for incident review.

## Monitoring Gate

During and after the canary, inspect the protected API health, scanner funnel, recognition quality, catalogue coverage, error rate and latency dashboards. The repository contains the observability APIs and metrics, but provider dashboards and alert routing must be configured in the live accounts.

Fail and roll back when any release gate is missed, including:

```text
cached catalogue p95 > 150 ms
structured search p95 > 300 ms
embedding recognition lookup p95 > 350 ms
warm image fallback p95 > 1.2 s
auto-confirm precision < 99.5 percent
real-world top-5 < 98 percent
unexpected authentication, CORS or rate-limit errors
catalogue/index/model version disagreement
elevated manual correction or Ximilar fallback rate
```

These are targets, not current measured results.

## Promotion

After a successful canary, rerun the workflow against the same commit and inputs with `promote_gateway=true`, or promote the exact uploaded tag manually:

```powershell
Set-Location gateway
npx wrangler versions deploy `
  --env production `
  --version-tag '<new-release-tag>@100' `
  --yes
```

Do not publish a second mobile update merely to promote a gateway. Manage an existing EAS rollout in the EAS dashboard/CLI and retain its update-group ID.

## Closeout

Record the Git commit, workflow run URL, migration versions, Railway deployment IDs, Cloudflare tags/traffic split, catalogue version, model/index version, EAS update group, smoke results, observed metrics and approving operator. Confirm ephemeral logical dumps were removed.
