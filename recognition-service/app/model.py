from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

import numpy as np
from PIL import Image

from .image_processing import image_to_chw_float32
from .settings import Settings


class ModelUnavailable(RuntimeError):
    pass


class ModelDownloadError(RuntimeError):
    def __init__(self, code: str):
        super().__init__(code)
        self.code = code


@dataclass
class ModelStatus:
    loaded: bool
    version: str
    dimensions: int
    provider: str
    load_count: int
    error: str | None = None


class EmbeddingModel:
    def __init__(self, settings: Settings):
        self.settings = settings
        self.version = settings.model_version
        self.dimensions = settings.model_embedding_dimensions
        self._session: Any | None = None
        self._input_name: str | None = None
        self._loaded = False
        self._provider = "unavailable"
        self._error: str | None = None
        self.load_count = 0

    @staticmethod
    def _file_sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    def _download_model(self) -> Path:
        url = self.settings.model_url
        expected_sha256 = (self.settings.model_sha256 or "").lower()
        if not url:
            raise ModelDownloadError("url_not_configured")
        if not expected_sha256:
            raise ModelDownloadError("checksum_not_configured")
        if urlparse(url).scheme != "https":
            raise ModelDownloadError("https_required")

        destination = self.settings.model_path or self.settings.model_cache_path
        if destination.exists() and self._file_sha256(destination) == expected_sha256:
            return destination
        destination.parent.mkdir(parents=True, exist_ok=True)
        partial = destination.with_suffix(f"{destination.suffix}.part")
        digest = hashlib.sha256()
        downloaded = 0
        try:
            request = Request(url, headers={"User-Agent": "Stackr-Recognition/1"})
            with urlopen(request, timeout=self.settings.model_download_timeout_seconds) as response:
                with partial.open("wb") as handle:
                    while True:
                        chunk = response.read(1024 * 1024)
                        if not chunk:
                            break
                        downloaded += len(chunk)
                        if downloaded > self.settings.model_max_download_bytes:
                            raise ModelDownloadError("size_limit_exceeded")
                        digest.update(chunk)
                        handle.write(chunk)
            if digest.hexdigest() != expected_sha256:
                raise ModelDownloadError("checksum_mismatch")
            os.replace(partial, destination)
            return destination
        except ModelDownloadError:
            partial.unlink(missing_ok=True)
            raise
        except Exception as exc:
            partial.unlink(missing_ok=True)
            raise ModelDownloadError("request_failed") from exc

    def load(self) -> None:
        if self._loaded or self._error:
            return
        self.load_count += 1
        if self.settings.allow_deterministic_test_model:
            self._loaded = True
            self._provider = "deterministic_test"
            return
        path = Path(self.settings.model_path) if self.settings.model_path else None
        if (path is None or not path.exists()) and self.settings.model_url:
            try:
                path = self._download_model()
            except ModelDownloadError as exc:
                self._error = f"model_download_failed:{exc.code}"
                return
        if path is None:
            self._error = "model_path_not_configured"
            return
        if not path.exists():
            self._error = "model_path_missing"
            return
        try:
            import onnxruntime as ort  # type: ignore

            self._session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
            self._input_name = self._session.get_inputs()[0].name
            self._loaded = True
            self._provider = "onnxruntime_cpu"
        except Exception as exc:  # pragma: no cover - depends on model/runtime availability
            self._error = f"model_load_failed:{exc.__class__.__name__}"

    @property
    def status(self) -> ModelStatus:
        return ModelStatus(
            loaded=self._loaded,
            version=self.version,
            dimensions=self.dimensions,
            provider=self._provider,
            load_count=self.load_count,
            error=self._error,
        )

    def close(self) -> None:
        self._session = None
        self._input_name = None
        self._loaded = False

    def embed(self, image: Image.Image) -> list[float]:
        if not self._loaded:
            raise ModelUnavailable(self._error or "model_not_loaded")
        if self._provider == "deterministic_test":
            digest = hashlib.sha256(image.tobytes()).digest()
            values = np.array([
                ((digest[index % len(digest)] / 255.0) * 2.0) - 1.0
                for index in range(self.dimensions)
            ], dtype=np.float32)
        else:
            if self._session is None or self._input_name is None:
                raise ModelUnavailable("model_session_not_ready")
            output = self._session.run(None, {self._input_name: image_to_chw_float32(image)})[0]
            values = np.asarray(output, dtype=np.float32).reshape(-1)
        norm = float(np.linalg.norm(values))
        if norm <= 0:
            raise ModelUnavailable("model_returned_zero_embedding")
        return (values / norm).astype(float).tolist()
