# Production Runbook

## Authority And Preconditions

Production deployment is a manual GitHub workflow from `main` through the protected `production` environment. It requires a reviewer. Full-platform and gateway releases require a known-good Cloudflare version tag; a `backend_only` release discovers and verifies its current live Railway rollback target before deployment. Do not deploy from a local dirty worktree.

### Backend-only code release

Use `backend_only` for an exact, already-reviewed backend code revision that does not need a database, catalogue, gateway, recognition, or mobile change. This lane is independent of the full-platform model/index and catalogue release gates. It remains fail-closed on the exact `main` SHA, the substantive backend/API test suite, secret scans, a validated Railway rollback target, and production read-only smoke checks.

Before dispatch, record:

- the exact 40-character SHA currently at `origin/main`;
- a canonical production variant UUID for a read-only raw-card pricing probe.

Dispatch with these exact inputs; leave every catalogue, gateway, recognition, migration, and mobile input at its shown empty or false value:

```powershell
gh workflow run deploy-production.yml `
  --ref main `
  -f confirmation='DEPLOY PRODUCTION' `
  -f release_scope=backend_only `
  -f expected_main_sha='<exact-40-character-main-sha>' `
  -f pricing_smoke_variant_id='046ba06b-01c6-44e1-94b5-48e786c3e7a4' `
  -f gateway_bootstrap=false `
  -f apply_migrations=false `
  -f publish_mobile_update=false `
  -f promote_gateway=false
```

The backend-only job installs only the root and backend dependency trees, runs lint, frontend/backend type checks, backend/API/pricing/deployment tests and both current-tree and commit secret scans, then discovers the current live deployment in the configured Railway project, service, and environment. Two direct health responses must attest the same production commit and bind to that exact deployment through Railway HTTP request logs. The deployment must be successful and rollback-eligible; missing or ambiguous evidence stops the release. It uploads only `backend/` to that Railway service. It never invokes Supabase, catalogue promotion, Cloudflare/Wrangler, recognition, or EAS tooling.

After deployment it performs GET-only checks against both the direct backend and public gateway for health, the exact raw-card price, price history, and market movers. The direct backend checks use the protected origin key without logging it. Any deployment or smoke failure automatically attempts to restore the exact discovered rollback deployment; the workflow stays failed for review. The run artifact records only non-secret rollback-target, deployment, and smoke evidence.

For catalogue, gateway, recognition, mobile, and full-platform releases, all of these must be true:

- The exact commit passed `Stackr Platform CI` and staging.
- Supabase production migration history is aligned with the repository and `STACKR_MIGRATION_BASELINE_APPROVED=true` was approved from evidence.
- The release contains only backward-compatible migrations; destructive cleanup is deferred.
- Supabase reports a recent completed physical backup and the workflow can create and verify ephemeral schema/data dumps.
- Object-storage recovery has been restore-tested; `storageBackupVerified=true` is committed and `STACKR_STORAGE_BACKUP_APPROVED=true` was independently approved.
- Stage 6 approved the production model and inactive index; `STACKR_MODEL_INDEX_RELEASE_APPROVED=true` is evidence-backed.
- Owner-attested staging catalogue ingestion is not production approval. Keep `catalogueRightsEvidenceVerified=false` and `STACKR_CATALOGUE_RIGHTS_RELEASE_APPROVED` unset until the complete catalogue rights-evidence pack has been compiled and reviewed.
- A valid inactive catalogue version UUID and embedding index UUID are recorded.
- Railway rolling deployment compatibility has been reviewed.
- The current gateway tag, recognition deployment ID, catalogue version, index version and EAS update group are recorded for rollback.
- Catalogue API recovery is a forward redeploy of the exact commerce-locked merge SHA; rollback to a pre-lock backend deployment is disabled.

Current full-platform status is **NO-GO**: migration alignment and storage backup are verified, but the active-model and active-index gates in `deploy/release-manifest.json` are false. This does not block an exact, code-only `backend_only` release that satisfies the separate controls above.

## Narrow binder artwork-read preparation

The binder artwork repair is not a catalogue promotion. Before releasing a
backend revision that opts into `api.card_image_manifest_for_identities`, use
`prepare-binder-artwork-read.yml` on the exact reviewed `main` revision. This
separate preparation applies only the two pinned 6 September additive index/RPC
migrations. It must not run a broad migration push or reconcile unrelated
staging-only or manually recorded production migrations.

Required evidence is committed in
`deploy/evidence/binder-artwork-read-staging-2026-09-06.json` and
`deploy/evidence/binder-artwork-read-production-baseline-2026-09-06.json`.
The first records non-vacuous four-language full-DTO equivalence, indexed plans,
pagination and access-control checks. The second freezes the observed existing
production ledger without rewriting it. Neither record claims complete artwork
coverage or that production preparation has occurred.

The workflow requires `PREPARE BINDER ARTWORK READ`, the exact reviewed lowercase
40-character `expected_main_sha`, the canonical-LF staging evidence SHA-256 and
an explicit `apply_migrations` choice. Verify-only is the default. A real required
reviewer rule must be configured on the production environment; merely naming
the environment is insufficient. The 6 September read-only inspection found
`protection_rules: []`, so live preparation remains blocked until that
repository setting is corrected by an authorised administrator. The owner
explicitly approved that setting change later on 6 September. A subsequent
API write and independent read confirmed required reviewer `tberridge86`
(user ID `275953861`) on the existing production environment. That configuration
does not approve a particular preparation or deployment run; the specific run
still requires its protected-environment review and exact-SHA checks.

After successful preparation, independently verify the live RPC's permissions,
four-language identity/payload equivalence and bounded image reads. Only then
dispatch the existing `backend_only` workflow for the exact reviewed main SHA.
That second job remains code-only (`apply_migrations=false`): the dependency was
prepared by the separate reviewed workflow, not silently applied by the backend
deployment. Retain both run artifacts. Backend rollback leaves the additive
indexes/function installed; do not remove catalogue data or migration history.

Verify the signed-in VSTAR Universe binder and both Chinese set pickers after
the backend release. A successful local build, staging comparison or deployment
health check does not establish that all historical image/metadata gaps are
closed.

## Full-platform Release Command

Start with a 5 percent canary and no automatic promotion:

```powershell
gh workflow run deploy-production.yml `
  --ref main `
  -f confirmation='DEPLOY PRODUCTION' `
  -f previous_gateway_tag='<known-good-tag>' `
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

If any step after a component change fails, the workflow attempts rollback in reverse order: an in-progress EAS rollout, gateway traffic, index/model activation, catalogue activation, then the recognition deployment. Each rollback is attempted even if an earlier rollback action fails, and the workflow remains failed for incident review. During commerce containment, recover the catalogue API only by redeploying the exact reviewed, commerce-locked merge SHA; never restore an older backend deployment ID.

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
