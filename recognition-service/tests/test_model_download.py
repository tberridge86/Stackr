from __future__ import annotations

import hashlib

from app.model import EmbeddingModel
from app.settings import Settings


class FakeResponse:
    def __init__(self, body: bytes):
        self.body = body
        self.offset = 0

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def read(self, size: int) -> bytes:
        chunk = self.body[self.offset:self.offset + size]
        self.offset += len(chunk)
        return chunk


def test_model_download_is_checksum_verified_and_cached(tmp_path, monkeypatch):
    model_bytes = b"stackr-onnx-fixture"
    expected = hashlib.sha256(model_bytes).hexdigest()
    requests = []

    def fake_urlopen(request, timeout):
        requests.append((request.full_url, timeout))
        return FakeResponse(model_bytes)

    monkeypatch.setattr("app.model.urlopen", fake_urlopen)
    destination = tmp_path / "model.onnx"
    model = EmbeddingModel(Settings(
        model_url="https://example.invalid/model.onnx",
        model_sha256=expected,
        model_cache_path=destination,
    ))
    assert model._download_model() == destination
    assert destination.read_bytes() == model_bytes
    assert requests == [("https://example.invalid/model.onnx", 60.0)]

    monkeypatch.setattr("app.model.urlopen", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("cache miss")))
    assert model._download_model() == destination


def test_model_download_fails_closed_on_checksum_mismatch(tmp_path, monkeypatch):
    monkeypatch.setattr("app.model.urlopen", lambda *_args, **_kwargs: FakeResponse(b"tampered"))
    model = EmbeddingModel(Settings(
        model_url="https://example.invalid/model.onnx",
        model_sha256="0" * 64,
        model_cache_path=tmp_path / "model.onnx",
    ))
    model.load()
    assert model.status.loaded is False
    assert model.status.error == "model_download_failed:checksum_mismatch"
    assert not (tmp_path / "model.onnx").exists()


def test_model_download_rejects_non_https_url(tmp_path):
    model = EmbeddingModel(Settings(
        model_url="http://example.invalid/model.onnx",
        model_sha256="0" * 64,
        model_cache_path=tmp_path / "model.onnx",
    ))
    model.load()
    assert model.status.error == "model_download_failed:https_required"
