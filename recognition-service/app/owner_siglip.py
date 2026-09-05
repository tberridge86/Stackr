"""Private, review-only SigLIP baseline. No database, downloads or index activation."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import hashlib
import hmac
from io import BytesIO
import json
import os
from pathlib import Path
import threading
import time
from uuid import UUID
import warnings

from fastapi import FastAPI, HTTPException, Request
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool

MODEL_VERSION = "siglip2_vision_256_768"
INDEX_VERSION = "siglip2-vision-256-768-r3f9f96cb-full-48011-v1"
MODEL_SHA256 = "f01886dd1d66979f44125db8f482639c9c32cf27d4cc3baa6f1b7d55d2d198d7"
VECTORS_SHA256 = "516043eceb7e9d4a86a1026d567f137ac805ffb51847b0e6f2dfabbedadc430b"
METADATA_SHA256 = "8869b8c9da5c370210bb9ab683898c46f6d8b3f4552d3f952d1ee37d6938afe3"
PREPROCESSING_SHA256 = "cb4a8b410a11bf59ebfe0a07949f07d2489b34cd3e11ca2f6cc1feeaf9dfff82"
COUNT = 48011
DIMENSIONS = 768
MAX_BODY_BYTES = 12 * 1024 * 1024
MAX_IMAGE_PIXELS = 25_000_000


def verify_file(path: Path, expected_hash: str, expected_bytes: int | None = None):
    if not path.is_file() or path.is_symlink():
        raise ValueError("artifact must be a regular file")
    if expected_bytes is not None and path.stat().st_size != expected_bytes:
        raise ValueError("artifact byte count mismatch")
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    if digest.hexdigest() != expected_hash:
        raise ValueError("artifact checksum mismatch")


def load_gallery(directory: Path):
    vectors_path = directory / "candidate-reference-vectors.f32"
    metadata_path = directory / "candidate-reference-metadata.jsonl"
    verify_file(vectors_path, VECTORS_SHA256, COUNT * DIMENSIONS * 4)
    verify_file(metadata_path, METADATA_SHA256)
    summary = json.loads((directory / "candidate-gallery-summary.json").read_text("utf-8"))
    for key, expected in {
        "modelId": MODEL_VERSION, "modelSha256": MODEL_SHA256,
        "preprocessingSha256": PREPROCESSING_SHA256, "embeddingDimensions": DIMENSIONS,
        "referenceCount": COUNT, "vectorsSha256": VECTORS_SHA256,
        "metadataSha256": METADATA_SHA256,
    }.items():
        if summary.get(key) != expected:
            raise ValueError("gallery summary contract mismatch: " + key)
    with metadata_path.open(encoding="utf-8") as handle:
        metadata = [json.loads(line) for line in handle]
    if len(metadata) != COUNT:
        raise ValueError("gallery metadata count mismatch")
    for index, row in enumerate(metadata):
        if row.get("vector_index") != index:
            raise ValueError("gallery metadata order mismatch")
        UUID(row["variant_id"])
        for field in ("canonical_key", "reference_asset_id", "set_id", "collector_number", "language_code"):
            if not isinstance(row.get(field), str) or not row[field]:
                raise ValueError("gallery metadata identity missing: " + field)
    vectors = np.memmap(vectors_path, dtype="<f4", mode="r", shape=(COUNT, DIMENSIONS))
    for start in range(0, COUNT, 1024):
        block = vectors[start:start + 1024]
        if not np.isfinite(block).all() or not np.all(np.abs(np.linalg.norm(block, axis=1) - 1) < 0.002):
            raise ValueError("gallery vectors must be finite and L2 normalized")
    return vectors, metadata


def preprocess(data: bytes) -> np.ndarray:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as image:
                if image.format not in ("JPEG", "PNG"):
                    raise ValueError("JPEG or PNG required")
                if image.width * image.height > MAX_IMAGE_PIXELS:
                    raise ValueError("image pixel limit exceeded")
                image = ImageOps.exif_transpose(image).convert("RGB")
                image = image.resize((256, 256), Image.Resampling.BILINEAR)
                pixels = np.asarray(image, dtype=np.float32) / np.float32(255)
                pixels = (pixels - np.float32(0.5)) / np.float32(0.5)
                return np.ascontiguousarray(pixels.transpose(2, 0, 1)[None])
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise ValueError("invalid image") from exc


class OwnerSiglip:
    def __init__(self, session, vectors, metadata):
        self.session = session
        self.vectors = vectors
        self.metadata = metadata

    @classmethod
    def load(cls):
        import onnxruntime as ort
        model_path = Path(os.environ["OWNER_SIGLIP_MODEL_PATH"])
        verify_file(model_path, MODEL_SHA256, 371916604)
        vectors, metadata = load_gallery(Path(os.environ["OWNER_SIGLIP_GALLERY_DIR"]))
        options = ort.SessionOptions()
        options.intra_op_num_threads = max(1, min(8, int(os.environ.get("OWNER_SIGLIP_THREADS", "4"))))
        options.inter_op_num_threads = 1
        session = ort.InferenceSession(str(model_path), sess_options=options, providers=["CPUExecutionProvider"])
        inputs, outputs = session.get_inputs(), session.get_outputs()
        if len(inputs) != 1 or inputs[0].name != "pixels" or inputs[0].type != "tensor(float)" or inputs[0].shape != [1, 3, 256, 256]:
            raise ValueError("model input contract mismatch")
        if len(outputs) != 1 or outputs[0].name != "embedding" or outputs[0].type != "tensor(float)" or outputs[0].shape != [1, 768]:
            raise ValueError("model output contract mismatch")
        return cls(session, vectors, metadata)

    def identify(self, data: bytes):
        started = time.perf_counter()
        pixels = preprocess(data)
        preprocessed = time.perf_counter()
        output = np.asarray(self.session.run(["embedding"], {"pixels": pixels})[0], dtype=np.float32)
        if output.shape != (1, DIMENSIONS) or not np.isfinite(output).all():
            raise RuntimeError("invalid embedding output")
        norm = float(np.linalg.norm(output))
        if norm <= 0:
            raise RuntimeError("invalid embedding norm")
        embedding = output[0] / norm
        inferred = time.perf_counter()
        scores = self.vectors @ embedding
        # Stable ordering makes ties deterministic. Each physical variant appears once,
        # using its maximum reference cosine; scores are not calibrated probabilities.
        ranked = np.argsort(-scores, kind="stable")
        candidates, seen = [], set()
        for index in ranked:
            row = self.metadata[int(index)]
            if row["variant_id"] in seen:
                continue
            seen.add(row["variant_id"])
            candidates.append({
                "rank": len(candidates) + 1, "similarity": max(-1.0, min(1.0, float(scores[index]))),
                "variantId": row["variant_id"], "canonicalKey": row["canonical_key"],
                "name": row.get("card_english_display_name") or row.get("card_native_name") or row["canonical_key"],
                "nativeName": row.get("card_native_name"),
                "language": row["language_code"], "setId": row["set_id"],
                "setCode": row.get("set_code"), "collectorNumber": row["collector_number"],
                "variantCode": row.get("variant_code"), "referenceAssetId": row["reference_asset_id"],
            })
            if len(candidates) == 5:
                break
        finished = time.perf_counter()
        return {
            "status": "review_required", "modelVersion": MODEL_VERSION, "indexVersion": INDEX_VERSION,
            "requiresReview": True, "autoAccept": False, "autoAdd": False,
            "candidates": candidates,
            "timings": {"preprocessingMs": (preprocessed - started) * 1000,
                        "inferenceMs": (inferred - preprocessed) * 1000,
                        "searchMs": (finished - inferred) * 1000,
                        "totalMs": (finished - started) * 1000},
        }


def create_app(engine_factory=OwnerSiglip.load):
    @asynccontextmanager
    async def lifespan(app):
        token = os.environ.get("OWNER_SIGLIP_SERVICE_TOKEN", "")
        if len(token) < 32:
            raise RuntimeError("OWNER_SIGLIP_SERVICE_TOKEN must contain at least 32 characters")
        app.state.token = token
        app.state.engine = await run_in_threadpool(engine_factory)
        yield
        app.state.engine = None

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.engine = None
    gate = threading.Lock()

    @app.get("/health")
    async def health():
        return {"status": "ok"}

    @app.get("/ready")
    async def ready():
        if app.state.engine is None:
            raise HTTPException(503, "not ready")
        return {"status": "ready", "ready": True, "modelVersion": MODEL_VERSION, "indexVersion": INDEX_VERSION}

    @app.post("/v1/owner-recognition/identify")
    async def identify(request: Request):
        authorization = request.headers.get("authorization", "")
        if not hmac.compare_digest(authorization.encode(), ("Bearer " + app.state.token).encode()):
            raise HTTPException(401, "unauthorized")
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() not in ("image/jpeg", "image/png"):
            raise HTTPException(415, "JPEG or PNG required")
        if not gate.acquire(blocking=False):
            raise HTTPException(429, "recognizer busy", headers={"Retry-After": "2"})
        try:
            data = bytearray()
            async def read_body():
                async for chunk in request.stream():
                    if len(data) + len(chunk) > MAX_BODY_BYTES:
                        raise HTTPException(413, "image byte limit exceeded")
                    data.extend(chunk)
            try:
                await asyncio.wait_for(read_body(), timeout=30)
            except asyncio.TimeoutError:
                raise HTTPException(408, "image upload timeout") from None
            try:
                return await run_in_threadpool(app.state.engine.identify, bytes(data))
            except ValueError:
                raise HTTPException(422, "invalid image") from None
            except Exception:
                raise HTTPException(503, "recognition unavailable") from None
        finally:
            gate.release()

    return app


app = create_app()
