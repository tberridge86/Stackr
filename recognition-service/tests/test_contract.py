from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
from PIL import Image

from app.diagnostics import MemoryDiagnosticSink
from app.main import create_app
from app.model import EmbeddingModel
from app.repositories import InMemoryRepository, ModelRegistryEntry
from app.scoring import CandidateRecord
from app.settings import Settings
from app.storage import LocalStorageClient


def normalised_embedding(dimensions: int = 4) -> list[float]:
    return [1.0] + [0.0] * (dimensions - 1)


def candidate(
    *,
    variant_id: str = "11111111-1111-4111-8111-111111111111",
    image_similarity: float | None = 0.96,
    canonical_card_id: str = "22222222-2222-4222-8222-222222222222",
    variant_code: str = "holo",
) -> CandidateRecord:
    return CandidateRecord(
        canonical_card_id=canonical_card_id,
        variant_id=variant_id,
        set_id="33333333-3333-4333-8333-333333333333",
        set_code="SV2a",
        collector_number="157/165",
        language_code="ja",
        variant_code=variant_code,
        card_name="リザードンex",
        image_similarity=image_similarity,
        perceptual_hash_similarity=0.8,
        source="vector_lookup",
        reasons=["vector_candidate"],
    )


class RecordingRepository(InMemoryRepository):
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.vector_scope: dict[str, str | None] | None = None

    async def vector_lookup(
        self,
        *,
        embedding: list[float],
        model_version: str,
        language: str | None,
        limit: int,
        collector_number: str | None = None,
        set_code: str | None = None,
    ) -> list[CandidateRecord]:
        self.vector_scope = {
            "collector_number": collector_number,
            "set_code": set_code,
        }
        return await super().vector_lookup(
            embedding=embedding,
            model_version=model_version,
            language=language,
            limit=limit,
            collector_number=collector_number,
            set_code=set_code,
        )


class FailingVectorRepository(InMemoryRepository):
    async def vector_lookup(self, **_kwargs) -> list[CandidateRecord]:
        raise RuntimeError("test-only vector failure")


def settings(tmp_path: Path | None = None) -> Settings:
    return Settings(
        model_version="test-model-v1",
        model_embedding_dimensions=4,
        active_index_version="test-index-v1",
        allow_deterministic_test_model=True,
        require_active_index=True,
        metrics_token="metrics-secret",
        gateway_auth_mode="disabled",
        local_storage_root=tmp_path,
        diagnostics_enabled=True,
    )


def make_client(tmp_path: Path | None = None, *, ready: bool = True):
    service_settings = settings(tmp_path)
    repository = InMemoryRepository(
        model=ModelRegistryEntry("test-model-v1", "test-index-v1", 4, ready),
        structured_candidates=[candidate(image_similarity=None)],
        vector_candidates=[candidate()],
        ready_ok=True,
    )
    diagnostics = MemoryDiagnosticSink()
    model = EmbeddingModel(service_settings)
    storage = LocalStorageClient(tmp_path) if tmp_path else None
    app = create_app(
        settings=service_settings,
        repository=repository,
        storage=storage,
        diagnostics=diagnostics,
        model=model,
    )
    return TestClient(app), diagnostics, model


def identify_payload(**overrides):
    payload = {
        "modelVersion": "test-model-v1",
        "embedding": normalised_embedding(),
        "ocrText": "リザードンex SV2a 157/165",
        "possibleCollectorNumber": "157/165",
        "possibleSetCode": "SV2a",
        "possibleCardName": "リザードンex",
        "detectedLanguage": "ja",
        "detectedScript": "japanese",
        "captureQuality": {
            "score": 0.91,
            "focusScore": 0.9,
            "glareScore": 0.8,
            "exposureScore": 0.8,
            "framingScore": 0.9,
            "stabilityScore": 0.88,
            "cardCoverage": 0.86,
            "failureReasons": [],
        },
        "client": {
            "platform": "ios",
            "appVersion": "1.0.0",
        },
    }
    payload.update(overrides)
    return payload


def test_health_ready_and_metrics_are_private(tmp_path):
    client, _, _ = make_client(tmp_path)
    with client:
        health = client.get("/health")
        assert health.status_code == 200
        assert health.json()["service"] == "stackr-recognition-service"

        ready = client.get("/ready")
        assert ready.status_code == 200
        assert ready.json()["components"]["activeIndex"]["ok"] is True

        assert client.get("/metrics").status_code == 401
        metrics = client.get("/metrics", headers={"x-stackr-metrics-key": "metrics-secret"})
        assert metrics.status_code == 200
        assert "stackr_recognition_requests_total" in metrics.text
        assert "stackr_recognition_outcomes_total" in metrics.text
        assert "stackr_recognition_auto_confirm_total" in metrics.text
        assert "stackr_recognition_image_fallback_total" in metrics.text
        assert "stackr_recognition_active_model_index" in metrics.text


def test_fast_path_identify_returns_component_scores_and_no_auto_add(tmp_path):
    client, diagnostics, _ = make_client(tmp_path)
    with client:
        response = client.post("/v1/recognition/identify", json=identify_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["matchStatus"] == "probable"
    assert body["autoAddAllowed"] is False
    assert body["requestedNextAction"] == "confirm_candidate"
    assert body["modelVersion"] == "test-model-v1"
    assert body["indexVersion"] == "test-index-v1"
    assert body["topCandidates"][0]["variantId"] == "11111111-1111-4111-8111-111111111111"
    assert body["topCandidates"][0]["componentScores"]["image"] > 0.9
    assert "confidence_not_calibrated" in body["uncertaintyFlags"]
    assert len(diagnostics.records) == 1
    assert diagnostics.records[0].image_storage_key_hash is None
    assert diagnostics.records[0].ocr_summary["hasText"] is True


def test_identify_pushes_normalised_ocr_scope_into_vector_lookup(tmp_path):
    service_settings = settings(tmp_path)
    repository = RecordingRepository(
        model=ModelRegistryEntry("test-model-v1", "test-index-v1", 4, True),
        structured_candidates=[candidate(image_similarity=None)],
        vector_candidates=[candidate()],
    )
    app = create_app(
        settings=service_settings,
        repository=repository,
        storage=LocalStorageClient(tmp_path),
        diagnostics=MemoryDiagnosticSink(),
        model=EmbeddingModel(service_settings),
    )

    with TestClient(app) as client:
        response = client.post("/v1/recognition/identify", json=identify_payload())

    assert response.status_code == 200
    assert repository.vector_scope == {
        "collector_number": "157/165",
        "set_code": "SV2a",
    }


def test_identify_groups_finish_siblings_and_does_not_claim_an_exact_variant(tmp_path):
    service_settings = settings(tmp_path)
    repository = InMemoryRepository(
        model=ModelRegistryEntry("test-model-v1", "test-index-v1", 4, True),
        structured_candidates=[],
        vector_candidates=[
            candidate(
                variant_id="11111111-1111-4111-8111-111111111111",
                canonical_card_id="pokemon:ja:sv2a:157:normal",
                variant_code="normal",
                image_similarity=0.916,
            ),
            candidate(
                variant_id="44444444-4444-4444-8444-444444444444",
                canonical_card_id="pokemon:ja:sv2a:157:reverse_holo",
                variant_code="reverse_holo",
                image_similarity=0.913,
            ),
        ],
    )
    app = create_app(
        settings=service_settings,
        repository=repository,
        storage=LocalStorageClient(tmp_path),
        diagnostics=MemoryDiagnosticSink(),
        model=EmbeddingModel(service_settings),
    )

    with TestClient(app) as client:
        response = client.post("/v1/recognition/identify", json=identify_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["matchStatus"] == "probable"
    assert body["cardIdentityKey"].startswith("card:ja:")
    assert body["cardIdentityConfidence"] > 0.9
    assert body["variantResolutionStatus"] == "unresolved"
    assert body["variantId"] is None
    assert body["autoAddAllowed"] is False
    assert body["requestedNextAction"] == "confirm_candidate"
    assert body["reasons"] == ["card_identity_resolved_variant_unresolved", "confidence_not_calibrated"]
    assert len(body["topCandidates"]) == 1
    assert body["topCandidates"][0]["variantId"] is None
    assert body["topCandidates"][0]["variantCode"] is None
    assert "variant_unresolved" in body["topCandidates"][0]["uncertaintyFlags"]
    assert {option["variantCode"] for option in body["variantOptions"]} == {"normal", "reverse_holo"}


def test_unhandled_failures_return_a_bounded_staging_error(tmp_path):
    service_settings = settings(tmp_path)
    repository = FailingVectorRepository(
        model=ModelRegistryEntry("test-model-v1", "test-index-v1", 4, True),
        structured_candidates=[],
        vector_candidates=[],
    )
    app = create_app(
        settings=service_settings,
        repository=repository,
        storage=LocalStorageClient(tmp_path),
        diagnostics=MemoryDiagnosticSink(),
        model=EmbeddingModel(service_settings),
    )

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.post("/v1/recognition/identify", json=identify_payload())

    assert response.status_code == 500
    assert response.headers["x-request-id"]
    assert response.json()["error"] == {
        "code": "internal_error",
        "message": "Recognition request failed unexpectedly.",
        "requestId": response.headers["x-request-id"],
        "details": {"exceptionType": "RuntimeError"},
    }


def test_trace_context_continues_without_recording_request_payload(tmp_path):
    client, _, _ = make_client(tmp_path)
    incoming = "00-11111111111111111111111111111111-2222222222222222-01"
    with client:
        response = client.post(
            "/v1/recognition/identify",
            json=identify_payload(),
            headers={"traceparent": incoming},
        )
    assert response.status_code == 200
    assert response.headers["x-trace-id"] == "11111111111111111111111111111111"
    assert response.headers["traceparent"].startswith("00-11111111111111111111111111111111-")
    assert response.headers["traceparent"] != incoming


def test_json_image_payloads_are_rejected(tmp_path):
    client, _, _ = make_client(tmp_path)
    payload = identify_payload(base64Image="data:image/jpeg;base64,AAA=")
    with client:
        response = client.post("/v1/recognition/identify", json=payload)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "image_payload_not_allowed"


def test_unknown_model_version_is_rejected(tmp_path):
    client, _, _ = make_client(tmp_path)
    with client:
        response = client.post("/v1/recognition/identify", json=identify_payload(modelVersion="unknown-model"))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "model_version_unsupported"


def test_capture_quality_failure_returns_rescan(tmp_path):
    client, diagnostics, _ = make_client(tmp_path)
    bad_quality = {
        "score": 0.2,
        "focusScore": 0.1,
        "glareScore": 0.8,
        "exposureScore": 0.7,
        "framingScore": 0.6,
        "stabilityScore": 0.5,
        "cardCoverage": 0.5,
        "failureReasons": ["blur"],
    }
    with client:
        response = client.post("/v1/recognition/identify", json=identify_payload(captureQuality=bad_quality))
    assert response.status_code == 200
    body = response.json()
    assert body["matchStatus"] == "rejected"
    assert body["requestedNextAction"] == "rescan"
    assert body["topCandidates"] == []
    assert diagnostics.records[0].match_status == "rejected"


def test_fallback_path_uses_private_key_and_hashes_key(tmp_path):
    image_dir = tmp_path / "scans"
    image_dir.mkdir()
    image_path = image_dir / "card.jpg"
    Image.new("RGB", (320, 448), color=(180, 40, 30)).save(image_path)
    client, diagnostics, model = make_client(tmp_path)
    payload = identify_payload(embedding=None, privateImageKey="scans/card.jpg")

    with client:
        response = client.post("/v1/recognition/identify", json=payload)
        embed_response = client.post("/v1/recognition/embed", json={
            "modelVersion": "test-model-v1",
            "privateImageKey": "scans/card.jpg",
            "client": {"platform": "android"},
        })

    assert response.status_code == 200
    assert "fallback_image_used" in response.json()["uncertaintyFlags"]
    assert diagnostics.records[0].image_storage_key_hash is not None
    assert diagnostics.records[0].diagnostic_payload["fallbackImageSha256"]
    assert embed_response.status_code == 200
    assert embed_response.json()["embeddingDimensions"] == 4
    assert model.load_count == 1


def test_fallback_path_averages_two_private_frames(tmp_path):
    image_dir = tmp_path / "scans"
    image_dir.mkdir()
    Image.new("RGB", (320, 448), color=(180, 40, 30)).save(image_dir / "card-1.jpg")
    Image.new("RGB", (320, 448), color=(170, 55, 35)).save(image_dir / "card-2.jpg")
    client, diagnostics, model = make_client(tmp_path)
    payload = identify_payload(
        embedding=None,
        privateImageKeys=["scans/card-1.jpg", "scans/card-2.jpg"],
    )

    with client:
        response = client.post("/v1/recognition/identify", json=payload)

    assert response.status_code == 200
    assert "multi_frame_consensus_used" in response.json()["reasons"]
    assert diagnostics.records[0].source_type == "private_image_consensus"
    assert diagnostics.records[0].image_storage_key_hash is not None
    assert diagnostics.records[0].diagnostic_payload["fallbackImageCount"] == 2
    assert model.load_count == 1


def test_private_frame_consensus_rejects_duplicate_or_excessive_keys(tmp_path):
    client, _, _ = make_client(tmp_path)
    duplicate = identify_payload(
        embedding=None,
        privateImageKeys=["scans/card.jpg", "scans/card.jpg"],
    )
    excessive = identify_payload(
        embedding=None,
        privateImageKeys=["scans/1.jpg", "scans/2.jpg", "scans/3.jpg"],
    )

    with client:
        duplicate_response = client.post("/v1/recognition/identify", json=duplicate)
        excessive_response = client.post("/v1/recognition/identify", json=excessive)

    assert duplicate_response.status_code == 422
    assert excessive_response.status_code == 422


def test_feedback_records_minimised_event(tmp_path):
    client, diagnostics, _ = make_client(tmp_path)
    with client:
        identify = client.post("/v1/recognition/identify", json=identify_payload()).json()
        feedback = client.post("/v1/recognition/feedback", json={
            "scanId": identify["scanId"],
            "feedbackAction": "choose_candidate",
            "selectedVariantId": "11111111-1111-4111-8111-111111111111",
            "consent": {"retainImage": False, "useForTraining": False, "imageUploadConsent": False},
            "client": {"platform": "ios"},
        })

    assert feedback.status_code == 200
    assert feedback.json()["feedbackStatus"] == "recorded"
    assert diagnostics.feedback[0]["action"] == "choose_candidate"


def test_ready_fails_when_active_index_is_missing(tmp_path):
    client, _, _ = make_client(tmp_path, ready=False)
    with client:
        ready = client.get("/ready")
        identify = client.post("/v1/recognition/identify", json=identify_payload())
    assert ready.status_code == 503
    assert identify.status_code == 503
    assert identify.json()["error"]["code"] == "recognition_unavailable"
