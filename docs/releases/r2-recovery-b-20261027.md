# Second R2 continuation — 27 October 2026

Status: recovery B is deployed and uploads are advancing. At 14:07:28.207662 UTC,
the live read-only database count was 58,759 / 62,098 pushed, with 3,339 eligible
Supabase source rows remaining: 25 additional publications since reconciliation.
The first 25-asset execution completed successfully; the next batch is running.
This is verified resumption, not a final completion certificate.

## Interruption and evidence

`production-recovered-20261027a`, deployment
`cf2d03cf-4d91-42c4-9b30-a27bf225784c`, passed its startup gate and uploaded
5,733 additional assets. It stopped at 12:16:40 UTC. Diagnostic deployment
`580320fe-d0f4-4a10-8ef9-5acc8602901b` verified 229 completed checkpoints plus
eight published rows in batch 230. The remaining 17 tail rows have no publication
record; there is no pending publication or commit without receipt.

The explicit failing transfer was `source_public_read_failed` for the
`search-result` derivative of `efa53563-2d1f-4eeb-8665-efa3a8ed5e4f`.
Expected SHA-256 is `7c83bcee90f015b28de1519aff90b589a3654150a5b438158d65a4a89c95c543`,
3,480 bytes, `image/webp`. The historical HTTP status was not recorded; do not
claim a billing or specific HTTP cause. Other cancelled operations are secondary.

The 53 diagnostic records passed their stream checksum. New-run manifest is
`97f03b3fbaf5fd36c7ef3c209e8ef33d4919a7159b4d41c3e7781adaf79c8c8e`;
checkpoint is `6a1335924d03d03d3bcc181844370c9a2e7bc48d1ad7acfab52f93324e1b7251`.
The preserved acceptance receipt is
`45d5eb8d9e55cd014a0e43f49a4014581bd1936181c8cf44a09bb02b6c366d91`.
See the diagnostic and interruption JSON files beside this document.

## Recovery boundary

The separately named continuation is `production-recovered-20261027b`.
Use only service `b5410607-a591-420e-a506-fe184ce7455b`, production environment
`b4304736-cac8-4ca9-92a7-93f7f6499c2f`, and existing `/data` volume
`3b8283f4-0fa9-4c34-9ac7-4d6c1bfea271`. Preserve the original image/source,
variables, one replica, region and restart policy `NEVER`. Stage only the start
command and review the whole environment patch before applying it.

The new gate inherits the previously accepted 53,001 baseline explicitly;
it does not claim to compare those older rows afresh. It independently rechecks
both immutable parent manifests, the new run's complete journal chain, all 5,750
current-run row snapshots in two read-only transactions, and nine exact historical
supersessions. It fetches all 29 published tail objects, first/last samples and
the precise failed source object with MIME, size and SHA-256 checks. Counts must
remain exactly 58,734 / 3,364 / 62,098 before launch.

The launcher repeats this fresh gate before creating its exclusive durable
acceptance receipt. Existing successor directory or receipt blocks activation.
Parent locks, journals and partial batches are preserved. The same verified
runner starts a new source traversal with concurrency eight and immutable
uploads, R2/CDN verification and full-snapshot CAS publication. No files or
cloud source objects are deleted.

Read-only command SHA:
`2fd3c365e5b2d507f887e7dcc9e9989e80761a849fbd1c636fb187fdf1716a51`.
Read-only deployment: `e0cd0b39-a5cd-4f74-a1b2-3c6938c30aee`.
Activated uploader deployment: `21e9065e-040e-407e-96f7-c3b88b859704`.
Runtime started at 13:56:19 UTC; fresh reconciliation was accepted at 14:06:08 UTC.
Activated uploader command SHA:
`b8de5eeb1d9e4f81718c3746ea8dc13dc3fbb11fe47aeb9c04f730bfa7030ef9`.

Independent reviews found no blockers. Focused suites passed: 13 inspector,
4 diagnostic entry, 11 reconciler, 3 reconciliation entry, 6 launcher,
2 receipt and 3 uploader entry tests (42 total). The certificate log envelope
is 6,451 bytes, below the 8,192-byte limit. Tests do not replace live evidence.

## Verification and rollback

Require a verified live certificate before upload activation, then actual runtime
source hashes, durable acceptance and an advancing Supabase count before claiming
resumed transfers. A failed gate must remain stopped. Returning to the read-only
command is a safe diagnostic state; replaying an interrupted uploader is not a
rollback. An interrupted b-run needs its own reconciliation.

After traversal, verify eligible original/derivative pointer coherence, preserve
the final run receipt and perform fresh public retrieval verification. Zero source
rows alone do not certify completion. This scope does not cover every catalogue image.

## Live resumption evidence

The standalone read-only certificate `330ac01f1ccfb503fc334d2596d91021cb2355384e2fe7a139f9f50b9ab71199`
passed independent review before activation. The deployed worker's source hashes
matched the reviewed command. Its own fresh gate again compared all 5,750 rows
twice, preserved parent evidence, and verified 32 public objects (2,691,669 bytes).

Fresh startup certificate: `11a6eaf278ab4f45e99097a6e40a636a9016cffa1fc024a6a9b04a81eca0bfb2`.
Durable acceptance receipt: `bd06069c8ee2670a0d9c763df80b40f6b42a11f6ce67e16ec3ad7e703a219327`.
First completed execution result: `681580f428d26602f94aca85f22f9ef8a58a7f86d5d274d2b8505ecf92f1651f`.
The first batch published 25 assets with concurrency eight and completed at
2026-10-27T14:07:09.205843925Z. See `r2-recovery-b-resumption-receipt-20261027.json`
for deployment, source hashes, review, runtime receipt and exact SQL count evidence.

No source files or cloud source objects were deleted. The final coverage check,
final run receipt and fresh public retrieval verification are still pending.
The existing progress automation was found paused and was left unchanged.
