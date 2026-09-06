# Owner SigLIP runtime

`app.owner_siglip:app` is an independent review-only service. It reads the pinned
FP32 model and 48,011-reference gallery from local read-only artifact paths. It
does not download artifacts, access a database, activate an index or auto-add cards.

Required environment:

- `OWNER_SIGLIP_MODEL_PATH`: pinned `siglip2-base-patch16-256-vision-fp32.onnx`.
- `OWNER_SIGLIP_GALLERY_DIR`: directory containing `candidate-gallery-summary.json`,
  `candidate-reference-vectors.f32`, and `candidate-reference-metadata.jsonl`.
- `OWNER_SIGLIP_SERVICE_TOKEN`: a randomly generated secret of at least 32 characters,
  shared only with the authenticated backend proxy. Never bundle it in the mobile app.
- Optional `OWNER_SIGLIP_THREADS`: CPU inference threads, default 4, bounded 1–8.

Run from this directory with the existing requirements installed:

```sh
uvicorn app.owner_siglip:app --host 0.0.0.0 --port 8080 --workers 1
```

The existing Dockerfile can run this app with a start-command override and mounted
artifacts. Use one worker to avoid multiplying model memory. Startup fails closed
on missing/incorrect artifacts or a missing token. `/health` reports process
liveness; `/ready` reports loaded artifact readiness without paths or credentials.

`POST /v1/owner-recognition/identify` accepts a raw JPEG/PNG body with its image
Content-Type and `Authorization: Bearer <service token>`. The proxy must independently
authenticate the user and enforce the owner allowlist. Body limit is 12 MiB, decoded
pixel limit 25 million, upload timeout 30 seconds. Overlapping requests receive 429.
Supply a rectified full-card image when available. There is no automatic cropping,
OCR filtering, second-model gate or reranking beyond maximum cosine per variant.

Responses contain `status: review_required`, `requiresReview: true`,
`autoAccept: false`, `autoAdd: false`, model/index versions, timings, and up to five
unique variants. `variantId` is the catalogue UUID; `canonicalKey` is a descriptive
catalogue key and must not be passed as the UUID. `similarity` is raw cosine, not a
calibrated probability. Names/set/language/number accompany each candidate.

Narrow validation:

```sh
python -m unittest discover -s tests -p test_owner_siglip.py -v
python owner_smoke.py /path/to/reference.jpg --expected-variant-id UUID
```

The smoke command validates pinned files and performs real CPU inference/search.
Matching a reference image only verifies runtime and identity plumbing; it is not
real-device capture accuracy, latency or memory evidence. Dynamic INT8 was rejected
by existing numeric parity evidence and is not accepted by this service.

## Railway private volume deployment

The owner service uses a dedicated `/models` volume and no public domain. Generate
a fresh, minimal context from the repository root; this verifies every pinned
artifact before packaging and includes the model/provider notices:

```sh
node scripts/deploy/owner-recognition-package.mjs --volume-artifacts --output=/path/to/new-context
```

Create an empty service and volume in the intended project/environment. Configure
the service token through `railway variable set OWNER_SIGLIP_SERVICE_TOKEN --stdin
--skip-deploys`, using explicit project, environment and service selectors. Never
put the token in command arguments. Set `OWNER_SIGLIP_APP_MODULE=app.bootstrap:app`
for the first deployment. The bootstrap app serves only `/health`, allowing a
private artifact transfer before recognition starts.

```sh
railway up /path/to/new-context --path-as-root --project PROJECT_ID --environment ENVIRONMENT_ID --service SERVICE_ID --detach --json
railway volume --project PROJECT_ID --environment ENVIRONMENT_ID --service SERVICE_ID files --volume VOLUME_ID upload /path/to/verified/artifacts /owner-baseline --concurrency 1 --json
```

Volume file transfer requires an active deployment and a registered SSH key.
Use a temporary task key and revoke it after verification. After upload, set these
service variables with `--skip-deploys`:

- `OWNER_SIGLIP_MODEL_PATH=/models/owner-baseline/model.onnx`
- `OWNER_SIGLIP_GALLERY_DIR=/models/owner-baseline/gallery`
- `OWNER_SIGLIP_APP_MODULE=app.owner_siglip:app`
- `PORT=8080` and `WEB_CONCURRENCY=1`

Run `railway redeploy` with the same explicit selectors to apply the staged
variables. `railway restart` retained the old deployment environment in the tested
workflow and did not switch from bootstrap to recognition. Verify `/ready` reports
the exact model/index, an unauthenticated identify request returns 401, and an
authenticated reference smoke remains review-only. Remove its temporary image.
The backend must independently enforce the single owner UUID; never expose the
service token to mobile clients.

The initial 490 MB compressed code upload was rejected with HTTP 413; keeping
artifacts on the private volume avoids that archive limit and preserves them
across deployments. The factual cloud smoke record is
`deploy/evidence/owner-siglip-railway-smoke-2026-09-05.json`.

On 2026-09-05 the public backend owner route was verified against deployment
`7c390364-331c-4a94-bcd6-031cd0e8cebe`, exact source
`b852318c4331d99996088cb2ee8982246890fbff`. An authenticated temporary owner session
received status/identify 200 and the expected review-only reference match; missing
and invalid authentication returned 401. Both temporary verification sessions
were revoked with local scope and their refresh tokens were rejected afterward;
no email was sent. A live nonowner session was unavailable, so production
nonowner rejection remains distinct from the passing local integration coverage.

Five sequential warm requests reused the same one reference: server totals were
111–169 ms (median 145 ms), while public HTTP elapsed times were 602–1892 ms
(median 857 ms). This verifies the connected backend/model path and provides a
small operational latency sample. It does not establish real-device camera
accuracy, mobile release readiness or capacity under load.

For rollback, the preceding backend deployment is
`54b02356-39ab-4993-973b-64b056fb6e4e`. The private lane can be disabled with
`STACKR_OWNER_RECOGNITION_ENABLED=false` followed by an authorized backend
deployment; staged variable changes alone do not update a running deployment.
The original four owner-variable values are retained in a private rollback
snapshot. Do not alter the general recognition flags or delete the pinned volume
as part of disabling this owner lane.
