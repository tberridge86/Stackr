from __future__ import annotations

import time

from test_contract import identify_payload, make_client


def test_missing_private_image_key_fails_without_retaining_payload(tmp_path):
    client, diagnostics, _ = make_client(tmp_path)
    with client:
        response = client.post("/v1/recognition/embed", json={
            "modelVersion": "test-model-v1",
            "privateImageKey": "missing/card.jpg",
        })
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "storage_unavailable"
    assert diagnostics.records == []


def test_embedding_must_be_l2_normalised(tmp_path):
    client, _, _ = make_client(tmp_path)
    with client:
        response = client.post("/v1/recognition/identify", json=identify_payload(embedding=[2.0, 0.0, 0.0, 0.0]))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "validation_error"


def test_lightweight_identify_load_profile(tmp_path):
    client, _, _ = make_client(tmp_path)
    started = time.perf_counter()
    with client:
        responses = [
            client.post("/v1/recognition/identify", json=identify_payload())
            for _ in range(30)
        ]
    elapsed = time.perf_counter() - started
    assert all(response.status_code == 200 for response in responses)
    assert elapsed < 6
