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

## Service readiness checkpoint — 23 October 2026

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

## Dedicated worker release — 24 October 2026

The compatible reader source is merged. The attempted reader deployment stopped
before build/deployment because the existing Railway account token is invalid.
Verify the actual running reader revision before publishing any migrated pointer.
The dedicated migration service uses these fixed identities:

| Resource | Identity |
| --- | --- |
| Railway project | `d205637b-5376-41aa-9169-1015ba88fec3` |
| Production environment | `b4304736-cac8-4ca9-92a7-93f7f6499c2f` |
| Migration service | `b5410607-a591-420e-a506-fe184ce7455b` |
| Persistent mount | `/data` |

The service has been created with an explicit disabled start command, no source
repository attached, restart policy `NEVER`, and its own volume. Presence of R2
configuration is not evidence that an object or public CDN response has verified.

`.github/workflows/deploy-r2-migration.yml` provisions this worker only. Dispatch
it on `main` with `confirmation=PROVISION R2 MIGRATION WORKER` and the exact
reviewed 40-character `expected_main_sha`. Existing GitHub `production`
environment protections apply. The checkout, dispatch SHA and current remote
`main` must agree before configuration and deployment. It shares the production
release concurrency group and cannot cancel an in-progress release.

The workflow runs the core, CLI, rollback, sequential-runner and provisioning-guard
tests. It checks
the fixed service's settings and attached volume through a read-only Railway
query. Any active deployment, execution start command, automatic restart, cron,
pre-deploy command, config-as-code path, source repository/image, extra replica,
unexpected source directory or explicit runtime UID other than 1000 blocks
provisioning. The only allowed explicit
start override is:

```sh
node -e "console.log('R2 migration disabled; explicit reviewed command required')"
```

The protected environment supplies these existing values:

| Kind | Names |
| --- | --- |
| Secrets | `RAILWAY_API_TOKEN`, `SUPABASE_DB_URL`, `STACKR_R2_ACCESS_KEY_ID`, `STACKR_R2_SECRET_ACCESS_KEY` |
| Variables | `STACKR_SUPABASE_URL`, `STACKR_R2_ENDPOINT`, `STACKR_R2_BUCKET`, `STACKR_R2_PUBLIC_BASE_URL` |

The Railway API token stays in the hosted workflow. The database and R2 runtime
configuration reaches only the fixed migration service through CLI
`variable set KEY --stdin --skip-deploys`; values are neither printed nor put
in source files or command arguments. `STACKR_SUPABASE_URL` maps to
`SUPABASE_URL` and must be `https://oakdbbzdqwurpjnoqhmu.supabase.co`.
The database identity guard also runs without opening a database connection.

The upload contains ten exact Git-tracked worker files archived from that SHA:
the minimal Dockerfile and locked package files, migration CLI, runner, migration
core, object-storage adapter, two PostgreSQL helpers and pinned certificate.
`RAILWAY_DOCKERFILE_PATH=deploy/catalogue-r2-migration/Dockerfile` selects the
image. No `railway.json`, media, app dependencies or credential files are
uploaded. New Railway services cannot opt into the deprecated config-as-code
format, so service settings remain explicit.

A passing `railway up --ci` proves the image build, not runtime success.
Inspect the actual deployment and disabled-command log before proceeding.
Provisioning never runs an inventory, copies objects, changes asset pointers or
rolls back rows. Never rerun it while a runner or rollback is active; stop and
reconcile the prior operation first.

Official command/configuration references:
[Railway variable](https://docs.railway.com/cli/variable),
[CLI deployment](https://docs.railway.com/cli/deploying),
[Dockerfile selection](https://docs.railway.com/builds/dockerfiles),
[service API](https://docs.railway.com/integrations/api/manage-services),
[CLI 5.30.1 schema](https://github.com/railwayapp/cli/blob/v5.30.1/src/gql/schema.json),
and [config-as-code deprecation](https://docs.railway.com/config-as-code).

## Mounted-volume permission gate

The image defaults to UID 1000. A Docker build-time `chown` cannot prepare a
volume that Railway mounts later. Keep the disabled command and `NEVER` restart
policy while testing a create/write/fsync/remove probe inside `/data` as the
actual runtime user. Verify the real `/data` mount, fixed service/environment
identities, and UID 1000. Do this before the first inventory or execution.
A read/write mount flag alone does not prove this user can write.

If that concrete probe fails because the new mount is root-owned, use a reviewed
ownership-only bootstrap on this dedicated service, or have the provider adjust
its ownership. Railway documents the temporary `RAILWAY_RUN_UID=0` override.
Such a bootstrap must validate the fixed service and real mount, change only the
top-level `/data` ownership to UID/GID 1000 and mode 0700, and exit. Do not
recursively change or remove existing evidence. Restore UID 1000 and the disabled
start command, then repeat the write/fsync probe successfully before migration.
Root execution is not configured automatically by the provisioning workflow.
See [Railway volume availability and permissions](https://docs.railway.com/volumes).

## Migration command and safeguards

`node scripts/migrate-catalogue-to-r2.mjs ...` runs the dedicated stored-object copier.
The minimal image has no root application npm scripts; use direct Node commands.
Inventory is the default mode. It reads at most 25 asset records by default,
never more than 50, and writes a metadata-only inventory with a SHA-256 digest.
It downloads no artwork. Each source bucket must still be public.

Required server configuration:

- `SUPABASE_URL` and `SUPABASE_DB_URL`, pinned to the explicit project reference.
- `STACKR_R2_BUCKET` and `STACKR_R2_PUBLIC_BASE_URL`.
- For execution: `STACKR_R2_ENDPOINT` (or account ID), access key and secret key.
- Railway service/environment identity and a mounted persistent volume for the
  fsynced journal. Never place credentials in client configuration or Git.

The separate image and locked worker dependencies are in
`deploy/catalogue-r2-migration/`. The image copies only the required scripts and
certificate, installs the locked `pg` dependency, and runs as UID 1000. Give that
user write access to the journal volume. The default command exits without any
migration; there is no schedule or automatic restart. Configure this one-shot
service's start command for an explicit inventory or execution invocation. Its
production configuration does not replace the running API or pricing services.

Example on the migration service, with real values configured in its environment:

```sh
node scripts/migrate-catalogue-to-r2.mjs --mode=inventory --expected-ref=oakdbbzdqwurpjnoqhmu --inventory=/data/r2/batch-0001.json --limit=25
node scripts/migrate-catalogue-to-r2.mjs --mode=execute --expected-ref=oakdbbzdqwurpjnoqhmu --inventory=/data/r2/batch-0001.json --limit=25 --approved-inventory-sha256=EXACT_REPORTED_SHA256 --journal=/data/r2/batch-0001.events.jsonl
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

## Sequential execution and restart behavior

After the explicit inventory, exact-batch execution and actual API/CDN probes
pass, a reviewed bounded runner command can advance the stored catalogue in
25-asset batches. Its no-argument default only prints a plan:

```sh
node scripts/run-r2-catalogue-migration.mjs
node scripts/run-r2-catalogue-migration.mjs --mode=execute --expected-ref=oakdbbzdqwurpjnoqhmu --run-id=production-20261024 --max-batches=10000
```

Use a fresh run ID. `--max-batches` is an explicit per-invocation bound from 1
through 10,000; a run cannot exceed 10,000 total checkpoints. The batch size stays
25 and the core byte/time limits remain unchanged. Only the fixed production
service/environment and real writable Linux `/data` mount are accepted.
Inventories, digests, before-images, journals, results and chained checkpoints
remain under `/data/r2-catalogue-migration/<run-id>/`.

A successful bounded stop returns `status=bounded` and removes its lock. Resume
that exact run with the same target and bounds plus `--resume=true`. It rechecks
every saved digest, journal, result and checkpoint before advancing:

```sh
node scripts/run-r2-catalogue-migration.mjs --mode=execute --expected-ref=oakdbbzdqwurpjnoqhmu --run-id=production-20261024 --max-batches=10000 --resume=true
```

A crash, timeout, partial batch, ambiguous publication or malformed evidence
leaves `runner.lock` and blocks continuation. There is no force or lock-bypass
flag. Preserve and reconcile the recorded inventory, pending publication,
database row and journal before deciding recovery. Never run forward migration
and rollback concurrently, and never enable an automatic restart or schedule.

An exhausted cursor returns `status=traversal_complete`. It does not prove that
all current eligible source rows have migrated: concurrently inserted or newly
eligible UUIDs can fall below the cursor. Create a fresh inventory with no
`--after-id` and a new filename. Require zero eligible source rows, then
reconcile published counts and delivery evidence before claiming completion.
Do not reuse the first inventory or overwrite prior receipts for this check.

## Guarded pointer rollback

Rollback accepts a fully completed, consistent forward batch. It does not accept
partial or ambiguous journals; reconcile those manually before choosing recovery.
Stop the forward runner first and preserve its inventory, exact digest, complete
journal and published-row receipts. Do not delete a crash lock as a retry step.

```sh
node scripts/migrate-catalogue-to-r2.mjs --mode=rollback --expected-ref=oakdbbzdqwurpjnoqhmu --inventory=/data/r2/batch-0001.json --approved-inventory-sha256=EXACT_INVENTORY_SHA256 --rollback-journal=/data/r2/batch-0001.events.jsonl --approved-journal-sha256=EXACT_FORWARD_JOURNAL_SHA256 --journal=/data/r2/batch-0001.rollback.events.jsonl --limit=25
```

Use the original batch's target, bounds and cursor; include the same
`--after-id` for a later batch. Hash the exact forward journal file and supply
its digest as `--approved-journal-sha256`. The rollback output journal must be
new and remain on the persistent volume. There is no automatic rollback resume.

The database adapter restores only recorded pointer fields and only when the
current row matches the migrated row and original identity/permission guard.
Rows changed since publication block the batch. The original Supabase objects
and copied R2 objects remain intact. Rollback needs the guarded database and
bucket/public-base configuration, but does not require R2 write credentials.

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

The 24 October release preparation is blocked on replacing the invalid Railway
account token in the protected GitHub production secret. A successful offline
suite, merged source or prepared service is not a deployed reader or completed
migration. No production migration command has been run by this preparation.


At the recorded 23 October checkpoint: **0 objects copied, 0 asset rows updated,
0 source objects deleted**. R2/CDN and on-device delivery remain unverified. Offline tests and CI
are implementation evidence only; PR checks carry the tested source revision.

The eleven-suite local architecture command passes, including the new migration
core, operational CLI and fast set-card delivery tests. Targeted lint and workflow
YAML validation pass. Two real production metadata rows also pass the inventory
planner without downloading any images; this is a shape check, not a live copy.
Local Docker is unavailable and the offline package cache lacks one dependency
tarball, so image build verification is assigned to the dedicated hosted CI step.

