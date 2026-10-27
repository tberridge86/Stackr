# R2 interrupted-run diagnostic — 27 October 2026

Status at preparation: source reviewed and tested; diagnostic not yet deployed.
No recovery, database mutation or source-object deletion has been performed.

## Observed failure

The existing optimized worker stopped on 26 October at 21:33 UTC after 1,065
complete batches and 16 publications in the next batch. The last completed
checkpoint SHA-256 is
`d1728f7eec12c65b31a5fe442c1ecb63362ba7bcb54812f8a28106b60d1f077f`.
The logged incomplete execution-result SHA-256 is
`d42fc2911ee451fa5b342ec29ffbeddbe60ab2d700ad975a36e2fbc1d26aa212`.
These log identities still need comparison against the actual files.

A read-only production count at **2026-10-27 08:06:46.960480 UTC** found
**53,001 pushed / 62,098 eligible**, with **9,097 source rows remaining**,
unchanged from 07:47:33 UTC. Eligibility is limited to the approved, public,
active, non-deleted and non-deprecated rows in `stackr-catalogue-public`, with
provider `supabase_storage` or `s3_compatible`; pushed rows additionally have
the `https://assets.stackrtcg.com/` URL prefix. This is not all catalogue images.

The restart at 08:06:15 UTC failed with `cutover_database_tail_drift`. The deployed
launcher always validates `production-resumed-20261026a` against its historical
tail, then uses `--resume=false` for `production-optimised-20261026b`. The old
tail contained 24 published rows and one untouched row; later legitimate
migration of that row can invalidate this original cutover check. This finding
does not prove which row caused the mismatch or certify the current partial batch.
Removing the check or toggling resume alone is not a safe recovery.

## Exact diagnostic scope

| Item | Pinned target |
| --- | --- |
| Railway project | `d205637b-5376-41aa-9169-1015ba88fec3` |
| Production environment | `b4304736-cac8-4ca9-92a7-93f7f6499c2f` |
| Worker service | `b5410607-a591-420e-a506-fe184ce7455b` (`stackr-r2-migration`) |
| Existing deployment/build | `5440dddf-d4d2-49e0-b9a6-19bec5f07d0e` |
| Source-file baseline | `6dfe188166df76b41d44801ab66970b0a3881ae5` |
| Existing volume | `3b8283f4-0fa9-4c34-9ac7-4d6c1bfea271`, mounted at `/data` |
| Region and replicas | `us-west2`, one replica |
| Restart policy | `NEVER` |
| Permitted run directories | `production-optimised-20261026b`, `production-resumed-20261026a` |

The proposed replacement start command reads the existing volume through a
diagnostic with no database or network operations. It verifies source-file
pins, host identity, file bounds, snapshot stability and the journal/checkpoint
chain. It reports a hashed manifest, the final checkpoint and tail file hashes,
historical row snapshot hashes, validated public object identities and sanitized
failure codes. It does not emit raw rows, journals, credentials or arbitrary
error text. A complete event-stream footer is required; truncated or failed
output cannot be treated as a successful inspection.

The wrapper limits the complete invocation to 180 seconds, 400 output records
and 8 KiB per JSON record. This uses the existing worker and volume; it creates
no paid resource, object-storage request or new schedule. Existing worker
compute usage still applies during the short diagnostic.

## Proposed execution and rollback

The monitoring instruction explicitly prohibits restarting or redeploying this
worker. This diagnostic belongs to the separate recovery work requested by the
owner on 27 October ("troubleshoot this fix and tell me what i need to do").
It must not be launched by the observer. The scope is evidence collection in the
existing crashed worker; recovery still requires reconciliation and review.

For the scoped diagnostic deployment:

1. Re-read the exact service, deployment and staged changes. Require the existing
   worker to be stopped, no competing recovery and no unrelated staged change.
   Preserve the complete current configuration privately before modification.
   Its observed start-command SHA-256 is
   `b9df66ebc86493728553fb826becdf3208750b27e7767056bb60b204bf2fa790`.
2. Generate the proposed command from the exact reviewed diagnostic source:
   `node scripts/build-r2-tail-diagnostic-command-20261027.mjs`.
   Record its source and command SHA-256 values. Change only this worker's start
   command; retain its image, variables, mount, region, replica and restart policy.
3. Read back the configuration and redeploy the existing pinned deployment's
   build. Do not attach another repository/image or deploy application main.
4. Retrieve the diagnostic deployment's logs, require both per-run completion
   footers and the final two-run completion event, and validate their hashes and
   event counts. Observe its platform status and exit separately. This is evidence
   collection, not a resumed transfer or a production completion certificate.
5. Restore the preserved start-command configuration without launching it. If
   diagnostic execution fails, retain its failure evidence and the existing
   volume; do not clear locks or retry uploads. No data rollback should be needed
   because the diagnostic has no write operation.

## Recovery remains gated on the resulting evidence

Compare current-run checkpoint `001065` and tail `001066` to the logged hashes.
Classify each tail row using fresh database reads and its original/derivative
receipts: published, unchanged source, commit without a final receipt, or
unexplained drift. Use the same recursively sorted JSON canonicalization as
the diagnostic; PostgreSQL `jsonb::text` alone is not an equivalent hash input.
Reconcile the prior run's untouched tail against the current run rather than
rewriting its historical evidence. Object receipt hashes describe the recorded
checks; fresh public retrieval is a separate verification step.

Only then can an independently reviewed recovery action be chosen. Do not
change the baseline, fabricate a checkpoint, remove the lock, skip the tail,
start another run, or relabel database pointers merely to make startup pass.
Final completion additionally requires zero eligible source rows, full eligible
original/derivative pointer coherence, a final receipt and public retrieval proof.

## Validation

Run the focused Node suites:

```sh
node --test scripts/test-r2-optimised-tail-20261027.mjs scripts/test-r2-tail-diagnostic-command-20261027.mjs
```

Offline fixture tests and independent source review are preparation evidence.
They cannot establish the current contents of Railway's volume or database.

Independent review passed with no blocking findings; 12/12 focused tests passed
against the exact production-pinned pure core. Reviewed inspector SHA-256:
`3a1f6d97d7e31fd7fe0fae5c2678c66a5518fe97712cee5537bf1b0f31869899`.
Reviewed command-builder SHA-256:
`2b86d8567b90fef4d5179bdce451a74b4d0f3c2522e51dbbc47b7153dad44efc`.
