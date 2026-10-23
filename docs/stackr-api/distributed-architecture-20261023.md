# Stackr distributed architecture

Owner direction: 23 October 2026. Source baseline: `7e22cee8d94f2904c3c2cfcf2c0e28da74eabdcc`.
This is the implementation and rollout contract; it is not evidence of a live migration.

## Responsibilities

| Platform | Owns | Boundary |
| --- | --- | --- |
| GitHub | Source, infrastructure configuration, migrations, seed schemas, validation and deployment workflows | No credentials or complete media library in new source commits |
| Supabase | PostgreSQL metadata and relationships, Auth, ownership and RLS | Store asset identity, immutable object key and text delivery URL; never image bytes or base64 in rows |
| Cloudflare | DNS, CDN caching, approved public artwork in R2, static web export in Pages | Public catalogue media travels directly from the CDN; private uploads must remain private |
| Railway | API instances, legality/commerce engines, WebSockets, ingestion and price workers | No scraping or asset transformation on the UI read path; shared durable state and job leases required for replicas |
| Local development | Git source, private non-production `.env.local`, at most 50 selected UI mock assets | Never synchronize/download the entire asset library; no production credentials in fixtures |

The native app remains Expo/React Native. Pages hosts its web export; it does not
replace native app distribution. Existing provider reference exceptions retain
their licensing gates until an approved, verified R2 replacement exists.

## Retrieval and identity

New client requests use at most 50 rows per network response. Existing cursor and
offset contracts retain stable order and exact identity. A logical Pokédex window
can span several bounded requests; it must validate duplicates and catalogue
revision/count consistency. Full-set safety limits retain their original row
capacity when page sizes change. Never report a partially fetched set as complete.

The gateway must normalize a request before cache lookup and signed upstream
forwarding. `STACKR_ENFORCE_UI_PAGE_LIMIT=true` enables the strict server boundary
on both gateway and backend. Keep it off until the updated client is released:
older installed binaries use fixed large windows and can otherwise skip records.
New clients comply with the 50-row contract independently of that switch.

This patch bounds the v1 catalogue client and legacy public asset manifest. It
does not finish every historical direct Supabase read: ownership summaries and
the local card index still have 500/1,000-row reads. Those require a separate
aggregate/incremental API change with account-isolation and request-count tests.
Search retains its existing first-results contract, capped at 50; a stable search
continuation cursor is a separate change. Catalogue delta synchronization now
reads 50 rows per page and retains its durable continuation checkpoint.

Continue using `StackrImage` and its existing thumbnail-first selection, stable
frame, rendition cache keys, bounded prefetch, full-resolution inspection and
honest unavailable states. Use the actual uploaded WebP derivatives. Do not invent
AVIF URLs or `/cdn-cgi/image` variants without a configured transform service.
Plain anonymous CDN artwork now uses a web image element with native lazy
loading. High-priority, detail and explicitly prefetched images stay eager;
signed/header sources and special Expo features retain the existing renderer.
The native renderer is unchanged. DOM and retry regressions cover this boundary;
browser network timing and actual device behavior remain separate checks.

Owned-name projections request complete card facts without optional artwork.
They share account cancellation across batches and reject an incomplete refresh
rather than publish an incomplete owned-name set. Display callers continue to
request artwork by default. This removes unnecessary manifests; it does not
replace the remaining bulk ownership reads with an aggregate endpoint.

The supplied example `cards` table is illustrative, not a replacement for
Stackr's canonical printing/variant schema. Preserve language, set, collector
number, edition and physical finish. Keep existing RLS/account-scoped caches.
New B-tree indexes must follow actual equality/order predicates; array membership
uses GIN, and fuzzy-name indexes require `pg_trgm`. Inspect existing indexes and
bounded `EXPLAIN (ANALYZE, BUFFERS)` evidence before proposing an additive migration.
No new schema or index migration is justified solely by the catalogue's row count.

## Public artwork ingestion

1. Railway fetches only the approved, identity-matched source under a bounded job.
2. Validate the bytes and source rights. Retain original bytes under an immutable
   content-addressed key; derive grid/search/detail WebP images separately.
3. Upload with create-only semantics. Verify collisions rather than overwrite an
   immutable object. Preserve the prior asset and rollback receipt.
4. Persist metadata and the real delivery URL only after the upload succeeds.
   Record the provider on original and derivative rows independently.
5. Verify the API and app resolve the expected printing and actual CDN object.
   A downloaded file or staging row is not completed publication.

`deploy/r2.env.example` lists server-only R2 configuration. The public writer must
fail before writing if configuration is incomplete. Readers keep legacy Supabase
URLs for existing Supabase objects; a provider switch must never merely relabel a
key as R2. Unknown or unconfigured providers must not produce fabricated URLs.
Without any R2 location configured, the explicit legacy `STACKR_ASSET_BASE_URL`
proxy retains its existing Supabase/S3 behavior. With R2 configured, only the
configured R2 bucket uses that CDN and legacy Supabase objects keep their provider
URLs. Existing derivative URLs remain explicit publication evidence.
Before deploying this code, supply R2 credentials and bucket/domain settings to
each approved writer environment, including any retained GitHub ingestion or
repair workflow. Missing R2 configuration intentionally stops public writes;
deploying without this prerequisite would pause those jobs.
Existing private scan/feedback storage remains a separate migration, preserving
signed access, consent and retention. It must never use the public catalogue CDN.

## Infrastructure preparation

`deploy/pages/wrangler.toml` describes the static Expo output from `npm run build:web`.
It does not create a Pages project, change DNS or deploy. Reuse the pinned Wrangler
dependency in `gateway/package-lock.json`. Deployment credentials belong only in
a protected GitHub environment, with Pages-edit scope and explicit owner approval.
Existing GitHub price/ingestion schedules remain active under their existing gates
until the Railway worker cutover has been rehearsed; do not run both schedulers.

`deploy/catalogue-price-worker/railway.json` prepares the existing dedicated
worker image with a guarded entry point and restart policy `NEVER`. No schedule
is added. The wrapper exits without work unless separate activation, scheduler,
bulk-write and exact database-target checks pass. Existing Docker CMD behavior
is preserved for services that have not adopted this config. Follow that
directory's cutover instructions; configuring a file is not activating a service.

Railway worker cutover must name the current command, queue/lease key, maximum
concurrency, retry/deadline policy and a controlled stop/drain/start sequence.
WebSocket replicas also need shared presence/pub-sub or explicit routing; multiple
stateless HTTP replicas alone do not make trading state horizontally scalable.

## Owner sign-off before large changes

| Change | Required concrete evidence | Rollback |
| --- | --- | --- |
| Activate strict server page limits | Updated native/web client, no skipped Pokédex/set rows, cached and uncached regressions | Disable the enforcement switch on gateway and backend |
| Publish R2 writer / migrate existing assets | Exact approved identities and counts; original/derivative checksums; bucket-domain binding; API image verification; storage/request cost estimate | Stop new jobs; restore the prior code/config and immutable asset associations |
| Move private binaries | Access-control, signed URL, consent and retention rehearsal; exact inventory | Restore prior private provider pointers; retain old objects |
| Move scheduled workers to Railway | One bounded rehearsal, shared job lease, no overlap, retry behavior, cost and daily coverage evidence | Stop Railway worker before restoring the prior scheduler |
| Pages/DNS cutover | Approved project/domain, export validation, Auth redirects, API/CORS checks | Restore prior DNS/deployment |
| Schema restructuring/index change | Existing schema/index inventory, query plans, migration/rollback and lock impact | Approved reversible migration or index removal |

## Performance evidence

Measure cache-hit response latency, cold database reads, first useful screen
content and image decode separately, with p50/p95, geography, network, sample
count, response bytes and request amplification. Aim for sub-100ms warm public
retrieval where measurable; do not claim it for all networks or image rendering.
R2 egress is free, while storage and request charges still exist. No platform
provides infinite scale: database connections, hot keys, workers and budgets are
bounded. This change contains no live performance measurement or deployment.

Local verification and remaining rollout limits are recorded in
`distributed-architecture-validation-20261023.md`.

Platform CI runs the architecture checks in a dedicated job, independent of the
large legacy unit-test sequence. It checks the exact PR source commit, attempts
each suite after dependency installation even if another suite fails, and
uploads `distributed-architecture-validation.json`. Missing, skipped, cancelled
and failed checks block the report. Passing offline fixtures never grants
deployment approval or labels live delivery/latency as verified.

Official references: [R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/),
[R2 pricing](https://developers.cloudflare.com/r2/pricing/),
[Pages direct upload from CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).
