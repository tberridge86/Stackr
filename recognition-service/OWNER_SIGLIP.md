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
