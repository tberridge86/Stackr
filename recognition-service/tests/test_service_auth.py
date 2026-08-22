from __future__ import annotations

import json
import time
from uuid import uuid4

from fastapi.testclient import TestClient
from PIL import Image

from app.diagnostics import MemoryDiagnosticSink
from app.main import create_app
from app.model import EmbeddingModel
from app.repositories import InMemoryRepository, ModelRegistryEntry, PrivateScanAsset
from app.service_auth import sign_service_request
from app.settings import Settings
from test_contract import candidate, identify_payload


SECRET = "gateway-test-secret-with-sufficient-entropy"
SERVICE_ID = "stackr-public-gateway"
USER_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
DEVICE_ID = "stackr-test-device-0001"


def protected_client(tmp_path, *, private_scan_assets=()):
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
        private_scan_assets=private_scan_assets,
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


def signed_headers(
    path: str,
    body: bytes,
    *,
    nonce: str | None = None,
    timestamp: str | None = None,
    user_id: str = USER_ID,
):
    return sign_service_request(
        SECRET,
        service_id=SERVICE_ID,
        timestamp=timestamp or str(int(time.time())),
        nonce=nonce or str(uuid4()),
        method="POST",
        path=path,
        body=body,
        user_id=user_id,
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


def test_private_fallback_asset_is_bound_to_signed_gateway_user(tmp_path):
    image_dir = tmp_path / "scans"
    image_dir.mkdir()
    Image.new("RGB", (320, 448), color=(180, 40, 30)).save(image_dir / "card.jpg")
    asset_id = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
    asset = PrivateScanAsset(
        asset_id=asset_id,
        user_id=USER_ID,
        storage_bucket="stackr-scan-temp",
        storage_key="scans/card.jpg",
    )
    client = protected_client(tmp_path, private_scan_assets=[asset])
    payload = identify_payload(embedding=None, privateImageKey=asset_id)
    body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    owner_headers = {
        "content-type": "application/json",
        **signed_headers("/v1/recognition/identify", body),
    }
    other_headers = {
        "content-type": "application/json",
        **signed_headers(
            "/v1/recognition/identify",
            body,
            user_id="cccccccc-cccc-4ccc-8ccc-cccccccccccc",
        ),
    }

    with client:
        owner = client.post("/v1/recognition/identify", content=body, headers=owner_headers)
        other = client.post("/v1/recognition/identify", content=body, headers=other_headers)

    assert owner.status_code == 200
    assert "fallback_image_used" in owner.json()["uncertaintyFlags"]
    assert other.status_code == 404
    assert other.json()["error"]["code"] == "private_image_unavailable"
