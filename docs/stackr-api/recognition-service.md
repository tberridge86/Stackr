# Stage 7: Stackr Recognition Service

Stage status: implemented as a private service shell with production gates. Not activated for automatic card adds.

## Current State Found

- Existing scanner and recognition code remains in place.
- The Ximilar-backed Supabase Edge Function still exists as a fallback path.
- The Node API already exposes catalogue v1 search and scanner-pack routes.
- Stage 6 did not select an active embedding model or validated HNSW index.
- Stage 7 therefore adds the recognition service and its guardrails, but does not claim production recognition accuracy.

## Service Location

`recognition-service/`

The service is a FastAPI application packaged by:

`recognition-service/Dockerfile`

It is intended to run as a private backend service behind the Stackr API edge gateway. It should not be exposed directly to public mobile clients.

## Endpoints

- `GET /health`
- `GET /ready`
- `GET /metrics`
- `POST /v1/recognition/identify`
- `POST /v1/recognition/embed`
- `POST /v1/recognition/feedback`

`/metrics` requires `X-Stackr-Metrics-Key` and `STACKR_RECOGNITION_METRICS_TOKEN`.

## Fast Path

The mobile app sends:

- `modelVersion`
- L2-normalised embedding
- OCR text and parsed hints
- possible collector number
- possible set code
- detected script/language
- capture-quality metrics

The service validates the model version, capture quality and embedding shape before any candidate scoring.

## Fallback Path

The mobile app sends a private uploaded-image key, not base64.

The service:

1. fetches the object from private storage;
2. checks file signature, size and dimensions;
3. applies EXIF orientation;
4. crops from corners when supplied;
5. normalises to the model input size;
6. embeds through the singleton model runner.

JSON bodies containing `base64`, `data:image` or `imageBytes` are rejected.

## Recognition Pipeline

Implemented pipeline:

1. validate request and model version;
2. validate capture quality;
3. rectify/crop when an image key is provided;
4. normalise the card crop;
5. accept device OCR;
6. parse collector number, set code and language hints;
7. run exact structured lookup;
8. run vector candidate retrieval when an active index exists;
9. over-fetch candidates according to versioned config;
10. apply language and metadata constraints;
11. return independently visible component scores;
12. calibrate through the versioned scoring config;
13. return `exact`, `probable`, `ambiguous`, `no_match` or `rejected`.

The initial scoring config is:

`recognition-service/app/configs/scoring.v1.json`

It is marked blocked until the Stage 6 benchmark produces a selected model and calibrated thresholds.

## Candidate Scores

Each returned candidate includes:

- overall confidence;
- image score;
- OCR score;
- set and collector-number score;
- card-name score;
- language score;
- rarity/variant score;
- perceptual-hash score;
- reasons;
- uncertainty flags.

The endpoint does not auto-add cards. It only returns `autoAddAllowed: true` when the calibrated config is ready, the auto-confirm threshold is met and no uncertainty flags remain.

## Diagnostics

Migration:

`supabase/migrations/20260728152412_recognition_service_scan_diagnostics.sql`

Private table:

`ml.recognition_scan_diagnostics`

Stored diagnostics are minimised:

- scan ID;
- request ID;
- model and index version;
- match status;
- candidate count;
- component score summary;
- uncertainty flags;
- requested next action;
- capture-quality metrics;
- redacted OCR summary;
- SHA-256 hash of the private image key.

Not stored:

- base64 image payloads;
- original image bytes;
- raw private object keys;
- raw OCR text;
- public user-identifying image paths.

## Configuration

Environment variables use the `STACKR_RECOGNITION_` prefix.

Important service-only secrets:

- `STACKR_RECOGNITION_DATABASE_URL`
- `STACKR_RECOGNITION_SUPABASE_SERVICE_ROLE_KEY`
- `STACKR_RECOGNITION_METRICS_TOKEN`

These must never be placed in Expo `EXPO_PUBLIC_*` variables.

## Tests

Stage 7 tests live in:

`recognition-service/tests/`

Coverage includes:

- endpoint contracts;
- protected metrics;
- fast-path identify;
- fallback private-image-key identify;
- embed endpoint;
- feedback endpoint;
- unsupported model failure;
- unnormalised embedding failure;
- capture-quality rejection;
- no-base64 JSON enforcement;
- missing-image fallback failure;
- lightweight repeated-request load profile;
- private diagnostics migration structure.

## Go/No-Go

Go for deploying the service privately in a disabled or shadow mode.

No-go for automatic card addition or replacing Ximilar until Stage 6 selects, validates and activates a production model/index, and Stage 7 confidence calibration is trained against the benchmark set.

## Rollback

Rollback the code by reverting the Stage 7 commit.

If the diagnostics migration has been applied, run:

`supabase/manual/rollback_20260728152412_recognition_service_scan_diagnostics.sql`

This removes only the private recognition scan diagnostics table.
