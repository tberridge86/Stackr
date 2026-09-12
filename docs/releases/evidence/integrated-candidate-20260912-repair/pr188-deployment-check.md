# PR188 deployment-check receipt — 2026-09-12

## Upstream CI failure identified

- Pull request: #188, head `b08ae5855e99ce3e9028a79654d4ee98d1a5f09e`
- Failed GitHub Actions check: `benchmark-smoke-tests`
- Workflow run: `34691154533`; job: `103546515760`
- The benchmark commands passed. The later `npm run test:deployment` invocation
  failed in `scripts/test-deployment-tooling.mjs:265`.
- Exact stale assertion: `assert.equal(reconciliation.localMigrationFileCount,
  reconciliation.stagingMigrationHistoryCount + 25)`.
- Frozen reconciliation evidence reported staging history `105`, so that fixture
  expected `130`; PR188's source recovery contained `136` migrations.

The integration candidate retains its existing derived-count assertion instead
of that stale arithmetic. It enumerates local migration files, compares that
result to the verifier's reported local count, and retains the fail-closed
reconciliation errors.

## Narrow local verification

`node scripts/deploy/verify-staging-migration-reconciliation.mjs` reported:

```json
{
  "ok": false,
  "localMigrationFileCount": 137,
  "stagingMigrationHistoryCount": 105,
  "errors": [
    "local_migration_count_drift",
    "staging_migration_count_drift",
    "ordered_migration_key_hash_drift",
    "repository_migration_content_hash_drift",
    "baseline_migration_history_restore_not_verified",
    "isolated_candidate_delta_replay_not_verified"
  ]
}
```

This is the expected fail-closed outcome. The candidate already includes the
separate PR180 migration, so restoring PR188's six historical source files
produces 137 local migrations rather than PR188's base-relative 136.

## Deployment-tooling sparse-checkout blocker

No persistent local command log was written; the final observed command output
was from `node scripts/test-deployment-tooling.mjs` in this worktree.

The test passed its readiness-evidence phase after 17 exact tracked HEAD paths
were materialized individually from the sparse checkout:

- `ml/reports/embedding-index-regeneration-plan.json`
- `ml/reports/model-benchmark-v1.json`
- `ml/models/embedding-model-registry-v1.json`
- `.claude/settings.local.json`
- nine individually named `.idea/*` files
- `.vscode/extensions.json`
- `.vscode/settings.json`
- `catalogue/chinese-set-translation-draft-native-name-source.json`
- `catalogue/japanese-set-display-drafts-source.json`

It then stopped in the default repository-wide secret scan at
`scripts/test-deployment-tooling.mjs:490-491`; `scripts/deploy/secret-scan.mjs:87`
attempted `lstat` on the next sparse-excluded tracked path:

`catalogue/provider-resolution-evidence-contract.2026-08-14.json`

The scanner enumerates tracked files and assumes a full materialized checkout.
Materializing the remaining large catalogue one file at a time would exceed the
narrow validation scope. No secret-scan, deployment-control, or migration
source was changed for this blocker.
