from __future__ import annotations

import json
import time
from uuid import uuid4

from fastapi.testclient import TestClient

from app.diagnostics import MemoryDiagnosticSink
from app.main import create_app
from app.model import EmbeddingModel
from app.repositories import InMemoryRepository, ModelRegistryEntry
from app.service_auth import sign_service_request
from app.settings import Settings
from test_contract import candidate, identify_payload


SECRET = "gateway-test-secret-with-sufficient-entropy"
SERVICE_ID = "stackr-public-gateway"
USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DEVICE_ID = "stackr-test-device-0001"


def protected_client(tmp_path):
    settings = Settings(
        model_version="test-model-v1",
        model_embedding_dimensions=4,
        active_index_version="test-index-v1",
        allow_deterministic_test_model=True,
        require_active_index=True,
        gateway_auth_mode="required",
        gateway_service_id=SERVICE_ID,
        gateway_service_secret=SECRET,
        local_storage_root=tmp_path,
    )
    repository = InMemoryRepository(
        model=ModelRegistryEntry("test-model-v1", "test-index-v1", 4, True),
        structured_candidates=[candidate(image_similarity=None)],
        vector_candidates=[candidate()],
        ready_ok=True,
    )
    model = EmbeddingModel(settings)
    app = create_app(
        settings=settings,
        repository=repository,
        diagnostics=MemoryDiagnosticSink(),
        model=model,
    )
    return TestClient(app)


def signed_headers(path: str, body: bytes, *, nonce: str | None = None, timestamp: str | None = None):
    return sign_service_request(
        SECRET,
        service_id=SERVICE_ID,
        timestamp=timestamp or str(int(time.time())),
        nonce=nonce or str(uuid4()),
        method="POST",
        path=path,
        body=body,
        user_id=USER_ID,
        device_id=DEVICE_ID,
    )


def test_recognition_routes_require_gateway_signature(tmp_path):
    client = protected_client(tmp_path)
    with client:
        response = client.post("/v1/recognition/identify", json=identify_payload())
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "service_auth_invalid"


def test_signed_gateway_request_is_accepted_and_bound_to_body(tmp_path):
    client = protected_client(tmp_path)
    payload = identify_payload()
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {"content-type": "application/json", **signed_headers("/v1/recognition/identify", body)}
    with client:
        accepted = client.post("/v1/recognition/identify", content=body, headers=headers)
        tampered = client.post(
            "/v1/recognition/identify",
            content=json.dumps({**payload, "possibleSetCode": "OTHER"}, separators=(",", ":")).encode("utf-8"),
            headers={"content-type": "application/json", **signed_headers("/v1/recognition/identify", body)},
        )
    assert accepted.status_code == 200
    assert tampered.status_code == 401
    assert tampered.json()["error"]["code"] == "service_body_mismatch"


def test_gateway_nonce_replay_and_expired_signatures_are_rejected(tmp_path):
    client = protected_client(tmp_path)
    body = json.dumps(identify_payload(), separators=(",", ":")).encode("utf-8")
    nonce = str(uuid4())
    headers = {"content-type": "application/json", **signed_headers("/v1/recognition/identify", body, nonce=nonce)}
    expired = {
        "content-type": "application/json",
        **signed_headers("/v1/recognition/identify", body, timestamp=str(int(time.time()) - 600)),
    }
    with client:
        first = client.post("/v1/recognition/identify", content=body, headers=headers)
        replay = client.post("/v1/recognition/identify", content=body, headers=headers)
        old = client.post("/v1/recognition/identify", content=body, headers=expired)
    assert first.status_code == 200
    assert replay.status_code == 409
    assert replay.json()["error"]["code"] == "service_replay_detected"
    assert old.status_code == 401
    assert old.json()["error"]["code"] == "service_signature_expired"
