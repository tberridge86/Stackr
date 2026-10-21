# Staging migration verifier failure reporting

Source: `3632b7de4a2e1e24e8525359bdefd9ec59c1a2fd`. Measurements: 21 October 2026, production 11:15:23 UTC and staging 11:15:26 UTC. This is a tooling repair and read-only reconciliation, not a schema deployment.

## Verified defect and focused change

The existing staging ledger CLI assigned `remoteState` and `applyRequired` from row count before checking keys and statement hashes. Its nonzero exit already failed closed, but its JSON could still describe a failed check as pending/applied and request an apply.

Failed remote reports now set `remoteState: unverified` and `applyRequired: false`; `remoteCountState` retains the count-derived hint for diagnosis. Validation errors, exit status, and successful pending/applied reports are preserved. No SQL, manifest, migration version, permissions or deployment lane changes.

The actual CLI was run against a local fake Postgres boundary. Before: 6 of 11 failed checks advertised pending/applied state or an apply requirement. After: 0 of 11. Both positive controls retain their existing state and apply requirement. The cases cover key/hash/statement drift, Gate0 hash failure, pending-only mismatch, project/credential failures and connection/query/rollback/cleanup errors. No real database is contacted by this regression.

Run `node scripts/test-staging-ledger-failure-report.mjs`. The regression is included in `npm run test:deployment`. Both modified/new JavaScript files pass `node --check`. The complete deployment suite and database replay were not run in the isolated fixture.

## Fresh ledger comparison

| Inventory | Entries | Exact source version/name matches | Remote-only | Source-only |
| --- | ---: | ---: | ---: | ---: |
| Repository | 189 | — | — | — |
| Production | 191 | 174 | 17 | 15 |
| Staging | 202 | 140 | 62 | 49 |

These are exact keys, not proof of schema drift or a list to apply. The accompanying JSON preserves the differences, ordered metadata digests, cohort hashes and explicit limits. The read-only query returned fewer than its 1000-row cap in both environments.

All five recovered PR168 statements and all six recovered PR188 statements match production's recorded single-statement bytes and SHA-256 after removing exactly the repository-added final LF: 11/11. Their exact versions are absent on staging: 0/11. Equivalent schema effects under other versions were not measured.

All seven recorded pricing production/staging aliases have equal live statement-array hashes: 7/7. Preserve both the source production filenames and recorded staging aliases. Six source files match directly or after removing one final LF; the classified-coverage recorded statement matches the source plus exactly CRLF. This serialization difference is recorded, not rewritten.

## Release and backend handoff

Review and merge the focused reporting fix through normal CI. No application release or database apply is required for this change. Keep PR188 draft and retain its September evidence as historical. This fresh receipt supersedes its counts for current inventory purposes only; it does not discharge its replay or compatibility gaps.

Continue historical recovery in PR188, using the exact remote-only keys in this receipt. Reconcile original statements and staging aliases before any separately authorized migration action. Do not replay source-only entries merely because their version is absent. Full schema/RLS/function compatibility, remaining statement comparisons, duplicate/orphan/storage/slow-query measurements and device outcomes remain unmeasured.
