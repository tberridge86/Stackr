from __future__ import annotations

import hashlib
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image

from .image_processing import image_to_chw_float32
from .settings import Settings


class ModelUnavailable(RuntimeError):
    pass


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

    def load(self) -> None:
        if self._loaded or self._error:
            return
        self.load_count += 1
        if self.settings.allow_deterministic_test_model:
            self._loaded = True
            self._provider = "deterministic_test"
            return
        if not self.settings.model_path:
            self._error = "model_path_not_configured"
            return
        path = Path(self.settings.model_path)
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
