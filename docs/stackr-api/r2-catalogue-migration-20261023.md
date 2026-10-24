# Public catalogue migration to Cloudflare R2

## Verified inventory — 23 October 2026

Production project: `oakdbbzdqwurpjnoqhmu`. Source is the public
`stackr-catalogue-public` Supabase Storage bucket. These are metadata observations,
not proof that every stored object is currently retrievable.

| Scope | Count |
| --- | ---: |
| Active, approved, public stored catalogue assets | 62,098 |
| Card artwork records | 61,097 |
| Set logos | 796 |
| Set symbols | 162 |
| Sealed product images | 43 |
| Original and derivative references | 240,304 |
| Unique referenced source objects | 239,873 |
| Referenced source bytes | 23,309,871,368 |
| Referenced keys missing from Storage metadata | 0 |
| Originals without a recorded hash | 0 |
| Entire public catalogue bucket objects | 241,602 |
| Entire public catalogue bucket bytes | 24,383,280,799 |
| Approved external references requiring upstream ingestion | 4,355 |

The difference between whole-bucket and referenced totals is not permission to
delete objects. Keep every source object during the migration and rollback window.
The 10,364 unavailable asset records are not stored images that a copy job can
recover. Bundled client assets and saved public-artwork URL snapshots are separate
reference surfaces. Private scans, feedback, training/model data, user profiles and
listing photos are excluded from this public catalogue job.

Machine-readable observations: [r2-migration-inventory-20261023.json](r2-migration-inventory-20261023.json).

## Actual service readiness

The authenticated Cloudflare account serving `stackrtcg.com` displays
**Get started with R2**, with an **Add R2 subscription to my account** button.
R2 is not activated in that account. No destination bucket, write credentials or
CDN binding has been verified. Activation accepts usage-based subscription terms.

The page displays 10 GB free monthly storage and $0.015 per additional GB/month
for Standard storage. Referenced source data is about 23.3 GB; all catalogue-bucket
data is about 24.4 GB. These figures are not an invoice or a total-cost guarantee:
operations, retained copies, source transfer and taxes are separate.
[Current Cloudflare pricing](https://developers.cloudflare.com/r2/pricing/).

Railway's connector requires reauthentication. The existing authenticated browser
session allowed read-only service inspection. Production's active deployment was
labelled `7d62e821cb5d57adf0973fb3e96c50accbeb443a`, with another workflow's new
deployment building. This work did not alter, cancel or deploy either release.

## Migration command and safeguards

`npm run asset:migrate-r2 -- ...` runs the dedicated stored-object copier.
Inventory is the default mode. It reads at most 25 asset records by default,
never more than 50, and writes a metadata-only inventory with a SHA-256 digest.
It downloads no artwork. Each source bucket must still be public.

Required server configuration:

- `SUPABASE_URL` and `SUPABASE_DB_URL`, pinned to the explicit project reference.
- `STACKR_R2_BUCKET` and `STACKR_R2_PUBLIC_BASE_URL`.
- For execution: `STACKR_R2_ENDPOINT` (or account ID), access key and secret key.
- Railway service/environment identity and a mounted persistent volume for the
  fsynced journal. Never place credentials in client configuration or Git.

The separate image and Railway configuration are in
`deploy/catalogue-r2-migration/`. The image copies only the required scripts and
certificate, installs the locked `pg` dependency, and runs as UID 1000. Give that
user write access to the journal volume. The default command exits without any
migration; there is no schedule or automatic restart. Configure this one-shot
service's start command for an explicit inventory or execution invocation. Its
production configuration does not replace the running API or pricing services.

Example on the migration service, with real values configured in its environment:

```sh
npm run asset:migrate-r2 -- --mode=inventory --expected-ref=oakdbbzdqwurpjnoqhmu --inventory=/data/r2/batch-0001.json --limit=25
npm run asset:migrate-r2 -- --mode=execute --expected-ref=oakdbbzdqwurpjnoqhmu --inventory=/data/r2/batch-0001.json --limit=25 --approved-inventory-sha256=EXACT_REPORTED_SHA256 --journal=/data/r2/batch-0001.events.jsonl
```

Use the inventory's `nextAfterId` as `--after-id` for later batches, with a new
inventory file and journal each time. Execute with the same bounds and cursor
used to create that inventory. A changed row or inventory digest stops execution.
Do not advance past a failed batch without reconciling its journal.

Copying preserves original and derivative bytes in bounded Railway memory;
nothing stages the media library on the local drive. Objects are immutable,
namespaced by row identity and content hash. A fresh upload and an existing-object
conflict both require an authenticated R2 read-back and a public CDN GET whose
hash, length and MIME type match. Defaults cap each object at 12 MiB and a batch
at 250 MiB of source bytes; that budget does not include verification traffic.

Only after every object for an asset verifies does the database adapter compare
the full inventoried row and publish the new pointer fields transactionally.
It preserves catalogue identity, relationships, provenance and permission fields.
A durable before-image and intent precede publication. Ambiguous commit/journal
outcomes stop for reconciliation, not blind retry. Source objects are not deleted.
The rollback contract rejects identity or permission changes and only restores
recorded pointer fields if the migrated row still matches.

## Reader compatibility and rollout order

1. Activate R2, create the public catalogue destination, configure a production
   custom CDN domain and restricted server-side write access.
2. Deploy the compatible card, manifest and fast set-card readers. Confirm the
   actual running revision before changing any catalogue pointer.
3. Create and inspect a 25-asset inventory, then execute that exact batch on Railway.
4. Verify real card/set responses and their returned CDN URLs, plus Home, Search,
   Binders, Pokédex and Showcase. Measure retrieval; offline tests prove no latency target.
5. Advance bounded batches and reconcile counts, hashes and failures.
6. Separately ingest approved external references and replace exact legacy URL
   snapshots and bundled asset references where needed. Preserve provider source
   URLs used as provenance.
7. Keep Supabase originals until older app versions and rollback requirements
   have been addressed.

Do not set a global legacy asset base URL during a mixed migration: it can
incorrectly rewrite unmigrated Supabase references. Store explicit verified
original and derivative CDN URLs and retain `storage_provider='s3_compatible'`.

## Execution evidence

At this checkpoint: **0 objects copied, 0 asset rows updated, 0 source objects
deleted**. R2/CDN and on-device delivery remain unverified. Offline tests and CI
are implementation evidence only; PR checks carry the tested source revision.

The eleven-suite local architecture command passes, including the new migration
core, operational CLI and fast set-card delivery tests. Targeted lint and workflow
YAML validation pass. Two real production metadata rows also pass the inventory
planner without downloading any images; this is a shape check, not a live copy.
Local Docker is unavailable and the offline package cache lacks one dependency
tarball, so image build verification is assigned to the dedicated hosted CI step.

