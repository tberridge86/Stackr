import hashlib
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
import numpy as np
from PIL import Image

from app import owner_siglip as subject


def png():
    buffer = BytesIO()
    Image.new("RGB", (9, 13), (255, 0, 128)).save(buffer, format="PNG")
    return buffer.getvalue()


def metadata(index, variant=1):
    return {"vector_index": index, "variant_id": f"00000000-0000-0000-0000-{variant:012d}",
            "canonical_key": "pokemon:en:example:1:normal", "reference_asset_id": str(index),
            "set_id": "set", "collector_number": "1", "language_code": "en",
            "card_english_display_name": "Example"}


class Session:
    def run(self, outputs, feeds):
        assert outputs == ["embedding"]
        assert feeds["pixels"].shape == (1, 3, 256, 256)
        result = np.zeros((1, 768), dtype=np.float32)
        result[0, 0] = 2
        return [result]


class OwnerTests(unittest.TestCase):
    def test_invalid_model_output_and_image_rejected(self):
        class BadSession:
            def run(self, outputs, feeds):
                return [np.full((1, 768), np.nan, np.float32)]
        engine = subject.OwnerSiglip(BadSession(), np.zeros((1, 768), np.float32), [metadata(0)])
        with self.assertRaisesRegex(RuntimeError, "embedding"):
            engine.identify(png())
        with patch.object(subject, "MAX_IMAGE_PIXELS", 2):
            with self.assertRaisesRegex(ValueError, "pixel"):
                subject.preprocess(png())

    def test_preprocessing_and_max_reference_per_variant(self):
        tensor = subject.preprocess(png())
        self.assertEqual(tensor.dtype, np.float32)
        np.testing.assert_allclose(tensor[0, :, 0, 0], [1, -1, 128 / 255 * 2 - 1], atol=1e-6)
        vectors = np.zeros((3, 768), np.float32)
        vectors[:, 0] = [.5, .9, .7]
        engine = subject.OwnerSiglip(Session(), vectors, [metadata(0), metadata(1), metadata(2, 2)])
        result = engine.identify(png())
        self.assertEqual(len(result["candidates"]), 2)
        self.assertEqual(result["candidates"][0]["referenceAssetId"], "1")
        self.assertAlmostEqual(result["candidates"][0]["similarity"], .9, places=6)
        self.assertTrue(result["requiresReview"])
        self.assertFalse(result["autoAccept"])
        self.assertFalse(result["autoAdd"])

    def test_http_auth_limits_and_review(self):
        vectors = np.zeros((1, 768), np.float32)
        vectors[0, 0] = 1
        engine = subject.OwnerSiglip(Session(), vectors, [metadata(0)])
        with patch.dict(os.environ, {"OWNER_SIGLIP_SERVICE_TOKEN": "a" * 32}):
            with TestClient(subject.create_app(lambda: engine)) as client:
                self.assertEqual(client.get("/ready").status_code, 200)
                self.assertEqual(client.post("/v1/owner-recognition/identify", content=png()).status_code, 401)
                headers = {"authorization": "Bearer " + "a" * 32, "content-type": "image/png"}
                self.assertEqual(client.post("/v1/owner-recognition/identify", headers=headers, content=b"bad").status_code, 422)
                with patch.object(subject, "MAX_BODY_BYTES", 2):
                    self.assertEqual(client.post("/v1/owner-recognition/identify", headers=headers, content=png()).status_code, 413)
                response = client.post("/v1/owner-recognition/identify", headers=headers, content=png())
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["status"], "review_required")
                headers["content-type"] = "application/json"
                self.assertEqual(client.post("/v1/owner-recognition/identify", headers=headers, content=png()).status_code, 415)

    def test_missing_token_fails_startup(self):
        with patch.dict(os.environ, {"OWNER_SIGLIP_SERVICE_TOKEN": ""}):
            with self.assertRaises(RuntimeError):
                with TestClient(subject.create_app(lambda: None)):
                    pass

    def test_gallery_pins_order_and_normalization(self):
        with tempfile.TemporaryDirectory() as temp:
            directory = Path(temp)
            vectors = np.zeros((2, 768), dtype="<f4")
            vectors[:, 0] = 1
            vector_bytes = vectors.tobytes()
            rows = [metadata(0), metadata(1, 2)]
            vector_hash = hashlib.sha256(vector_bytes).hexdigest()
            def write_metadata_and_summary():
                raw = "".join(json.dumps(row) + "\n" for row in rows).encode()
                digest = hashlib.sha256(raw).hexdigest()
                (directory / "candidate-reference-metadata.jsonl").write_bytes(raw)
                summary = {"modelId": subject.MODEL_VERSION, "modelSha256": subject.MODEL_SHA256,
                           "preprocessingSha256": subject.PREPROCESSING_SHA256,
                           "embeddingDimensions": 768, "referenceCount": 2,
                           "vectorsSha256": vector_hash, "metadataSha256": digest}
                (directory / "candidate-gallery-summary.json").write_text(json.dumps(summary), encoding="utf-8")
                return digest
            (directory / "candidate-reference-vectors.f32").write_bytes(vector_bytes)
            digest = write_metadata_and_summary()
            with patch.object(subject, "COUNT", 2), patch.object(subject, "VECTORS_SHA256", vector_hash):
                with patch.object(subject, "METADATA_SHA256", digest):
                    loaded, loaded_rows = subject.load_gallery(directory)
                    self.assertEqual(loaded.shape, (2, 768))
                    self.assertEqual(loaded_rows, rows)
                    del loaded
                rows[1]["vector_index"] = 0
                digest = write_metadata_and_summary()
                with patch.object(subject, "METADATA_SHA256", digest):
                    with self.assertRaisesRegex(ValueError, "order"):
                        subject.load_gallery(directory)
                with self.assertRaisesRegex(ValueError, "checksum"):
                    subject.verify_file(directory / "candidate-reference-vectors.f32", "0" * 64)


if __name__ == "__main__":
    unittest.main()
