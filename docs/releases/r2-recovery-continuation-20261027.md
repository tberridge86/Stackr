# R2 reviewed continuation — 27 October 2026

Status: implementation reviewed and tested; upload deployment awaits the full
read-only reconciliation result. The transfer remains stopped at the last
database check: 53,001 / 62,098 eligible, with 9,097 source rows remaining.

## Fault and evidence

The original optimized run stopped when a Supabase public source request failed
for the `detail-page` derivative of `d50b4c8c-d641-4ca4-9b5b-3dc20bc253c0`.
Its subsequent launcher always rechecked the older run's historical tail, then
attempted the existing optimized run with resume disabled. The historical row
`62db634c-943e-4570-a606-d1039746a477` now has R2 pointers and no longer equals
the older untouched snapshot. An exact validated successor receipt is required
to explain this change; a provider flag alone does not reconcile it.

Diagnostic deployment `0a4420ff-3df8-4a77-975e-953cbae0ea32` completed at
08:42:10 UTC. Both 53-event streams passed their output checksums. All 1,065
current checkpoints and the incomplete batch were internally validated;
fresh database hashes matched the current tail's 16 published and nine source
rows. The prior tail's 24 published rows also matched. The JSON diagnostic
receipt records the remaining historical mismatch without declaring recovery.

## Exact recovery boundary

Use the existing service `b5410607-a591-420e-a506-fe184ce7455b`, environment
`b4304736-cac8-4ca9-92a7-93f7f6499c2f`, and volume
`3b8283f4-0fa9-4c34-9ac7-4d6c1bfea271` mounted at `/data`.
Preserve the existing image/source snapshot, variables, one replica in
`us-west2`, and `NEVER` restart policy. Change only the reviewed start command.
Use a staged configuration deployment, not replay of the old deployment.

The first-launch-only successor is `production-recovered-20261027a`.
An existing successor directory blocks before parent revalidation. Fresh
read-only reconciliation must pass again inside its launch process, including:

- Both complete historical evidence chains, their pinned manifests, and the
  one exact predecessor/successor receipt relationship.
- 28,349 distinct full database rows in two verified read-only repeatable-read
  transactions, with rollback/close and unchanged 53,001 / 9,097 / 62,098 scope.
- All 64 published current-tail objects, bounded original/derivative samples,
  the historical successor's objects, and the exact failed Supabase source file,
  checked by public GET, MIME, byte count and SHA-256.
- Evidence reinspection before the final database pass.

Before uploads, persist the linked acceptance receipt as
`/data/r2-catalogue-migration/production-recovered-20261027a.acceptance.json`
using exclusive creation, no-follow, mode 0600, file fsync and directory fsync.
Existing receipt or directory means stop; neither is overwritten or removed.
Both parent run directories, their locks, partial batches and journals remain
unchanged. No synthetic checkpoint is created.

The existing pinned runner starts the new run at a null cursor with batch size
25 and concurrency 8. Its source eligibility query excludes published R2 rows;
leftover immutable uploads are revalidated before full-snapshot CAS publication.
The original optimized transport/prefetch code is reused byte-for-byte, with
the existing bounded retries and verification. Capacity and operator-stop
checks remain at batch boundaries. An interrupted successor needs its own
reconciliation; automatic replay is deliberately unavailable.

## Reviewed implementation

| Component | SHA-256 |
| --- | --- |
| Inspector | `28245a96581910afa9c78f25d49e2d1baf19bf80886ba322d3764ce94a65e1cc` |
| Read-only reconciler | `461318e531b339af9349ac0ad836921634f46f0b5366c6427ee8be631b176563` |
| Successor launcher | `0bd097af8c54298984057941a21071bbb9fd5954dddea34a84246192bc499642` |
| Durable receipt store | `9efbfa0165cbeb3da0cf53d7ead18afc79cdfe4f8eb3eae8de55ad560128d89b` |
| Existing optimized runtime | `2d615728ed248e99beae61e761ea310ee63ea5d6a60f4d119959c515f73cade8` |
| Existing final SQL coverage | `a5a8fd084e85a8fecc880ae0c0880f3630e72283f7fe7b41184e0c3f67c8f716` |
| Recovery command builder | `999c6fe747ecd4dc4d9c5f9f509259decddcba41ae0063d8b771dfc93f7f0be1` |
| Proposed production command | `b569aba1b816c874eb8bc3a18a074084864c3bb1f28a4994b993d6eba06b1a5a` |

Independent review found no blocking issues in the inspector, read-only
reconciler, command entries, successor launcher, receipt store and production
composition. Focused suites passed: 12 inspector, 4 diagnostic entry, 11
reconciler, 3 reconciliation entry, 6 launcher, 2 receipt, and 3 recovery entry
tests (41 total). These tests do not replace the production reconciliation.

## Verification and failure behavior

Require the actual runtime source-hash marker, accepted reconciliation receipt,
new-run journal progress and a fresh Supabase count before reporting resumed
uploads. A saved Railway setting or SUCCESS status is insufficient.

On a failed gate, retain the stopped worker and all evidence. Never deploy the
old uploader simply to clear the error. No source objects or D: files are deleted.
The acceptance file records authorization/evidence for starting the continuation;
it is not a final completion certificate.

After traversal, the existing final SQL check verifies eligible original and
derivative pointer coherence. Zero eligible source rows and SQL coverage alone
are not full completion: retain the final run receipt and perform fresh public
retrieval verification before claiming verified eligible-scope completion.
Use the actual final denominator. This does not cover all catalogue images.
