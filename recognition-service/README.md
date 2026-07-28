# Stackr Private Recognition Service

Stage 7 adds a private FastAPI service for Stackr card recognition. It is designed to sit behind `api.stackr.app` or another private edge gateway, not to be called directly from public clients.

## Endpoints

- `GET /health`
- `GET /ready`
- `GET /metrics`
- `POST /v1/recognition/identify`
- `POST /v1/recognition/embed`
- `POST /v1/recognition/feedback`

`/metrics` is private. Set `STACKR_RECOGNITION_METRICS_TOKEN` and send it as `X-Stackr-Metrics-Key`.

## Paths

Fast path:

- mobile sends `modelVersion`;
- L2-normalised image `embedding`;
- OCR text and parsed hints;
- detected language/script;
- capture-quality metrics.

Fallback path:

- mobile sends a private uploaded-image key;
- the service fetches the object from private storage;
- the service rectifies/crops when corners are provided;
- the model runner embeds the normalised crop.

The service rejects JSON bodies containing `base64`, `data:image` or `imageBytes`. Large image bytes must not be placed in JSON.

## Configuration

Environment variables use the `STACKR_RECOGNITION_` prefix.

Important variables:

- `STACKR_RECOGNITION_MODEL_VERSION`
- `STACKR_RECOGNITION_MODEL_PATH`
- `STACKR_RECOGNITION_MODEL_EMBEDDING_DIMENSIONS`
- `STACKR_RECOGNITION_ACTIVE_INDEX_VERSION`
- `STACKR_RECOGNITION_DATABASE_URL`
- `STACKR_RECOGNITION_SUPABASE_URL`
- `STACKR_RECOGNITION_SUPABASE_SERVICE_ROLE_KEY`
- `STACKR_RECOGNITION_FALLBACK_STORAGE_BUCKET`
- `STACKR_RECOGNITION_CATALOGUE_API_URL`
- `STACKR_RECOGNITION_METRICS_TOKEN`
- `STACKR_RECOGNITION_REQUIRE_ACTIVE_INDEX`

Do not expose database URLs, service-role keys or metrics tokens in the Expo app.

## Scoring

Weights and thresholds live in:

`app/configs/scoring.v1.json`

The initial config is intentionally marked blocked because Stage 6 has not selected a calibrated production embedding model. The service returns candidates for user confirmation and does not auto-add cards while confidence is uncalibrated.

## Diagnostics

Diagnostics are written to `ml.recognition_scan_diagnostics` when `STACKR_RECOGNITION_DATABASE_URL` is configured.

The diagnostics table stores:

- scan ID;
- request ID;
- model/index version;
- match status;
- candidate count;
- component score summary;
- uncertainty flags;
- redacted OCR summary;
- capture-quality metrics;
- SHA-256 hash of the private image key.

It does not store image bytes, base64 payloads, raw private storage keys or raw OCR text.

## Local Test

From the repository root:

```powershell
python -m venv .tmp\recognition-service-venv
.\.tmp\recognition-service-venv\Scripts\python.exe -m pip install --requirement recognition-service\requirements-dev.txt
.\.tmp\recognition-service-venv\Scripts\python.exe -m pytest recognition-service\tests
```

## Docker

Build:

```bash
docker build -t stackr-recognition-service ./recognition-service
```

Run:

```bash
docker run --rm -p 8080:8080 \
  -e STACKR_RECOGNITION_MODEL_VERSION=... \
  -e STACKR_RECOGNITION_MODEL_PATH=/models/model.onnx \
  -e STACKR_RECOGNITION_ACTIVE_INDEX_VERSION=... \
  -e STACKR_RECOGNITION_METRICS_TOKEN=... \
  stackr-recognition-service
```

Set `WEB_CONCURRENCY` only after measuring memory usage for the selected model. The default is one worker so the model is loaded once per container process.
