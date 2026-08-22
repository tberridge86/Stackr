from __future__ import annotations

import asyncio
from dataclasses import replace
from math import sqrt
from typing import Iterable
from uuid import UUID, uuid4

from fastapi import HTTPException, status

from .diagnostics import (
    DiagnosticRecord,
    DiagnosticSink,
    consent_to_dict,
    hash_storage_key,
    redacted_ocr_summary,
)
from .image_processing import ImageProcessingError, normalise_card_image
from .model import EmbeddingModel, ModelUnavailable
from .normalization import parse_hints
from .quality import quality_failures, quality_score
from .repositories import CandidateRepository, ModelRegistryEntry, RepositoryError
from .schemas import (
    ComponentScores,
    EmbedRequest,
    EmbedResponse,
    FeedbackRequest,
    FeedbackResponse,
    IdentifyRequest,
    IdentifyResponse,
    RecognitionCandidateResponse,
)
from .scoring import CandidateRecord, ScoredCandidate, ScoringConfig, choose_match_status, score_candidate
from .settings import Settings
from .storage import StorageClient, StorageError


class RecognitionPipeline:
    def __init__(
        self,
        *,
        settings: Settings,
        scoring_config: ScoringConfig,
        repository: CandidateRepository,
        storage: StorageClient,
        model: EmbeddingModel,
        diagnostics: DiagnosticSink,
    ):
        self.settings = settings
        self.scoring_config = scoring_config
        self.repository = repository
        self.storage = storage
        self.model = model
        self.diagnostics = diagnostics

    async def ready(self) -> dict[str, object]:
        repository_ready = await self.repository.ready()
        model_status = self.model.status
        model_entry = await self.repository.get_model(self.settings.model_version)
        active_index_ok = bool(model_entry and model_entry.active)
        ok = bool(repository_ready.get("ok")) and self.scoring_config.version and (
            active_index_ok or not self.settings.require_active_index
        )
        return {
            "ok": ok,
            "repository": repository_ready,
            "model": model_status.__dict__,
            "activeIndex": {
                "ok": active_index_ok,
                "indexVersion": model_entry.index_version if model_entry else None,
            },
            "scoringConfig": {
                "version": self.scoring_config.version,
                "status": self.scoring_config.status,
                "calibrationReady": self.scoring_config.calibration_ready,
            },
        }

    async def identify(
        self,
        request: IdentifyRequest,
        request_id: str | None,
        actor_user_id: str | None = None,
    ) -> IdentifyResponse:
        scan_id = uuid4()
        model_entry = await self._require_model(request.modelVersion)
        hints = parse_hints(request.ocrText, request.possibleCollectorNumber, request.possibleSetCode)
        collector_hint = hints["collector_number"]
        set_code_hint = hints["set_code"]
        private_image_keys = request.resolved_private_image_keys()
        source_type = "device_embedding" if request.embedding else (
            "private_image_consensus" if len(private_image_keys) > 1 else "private_image_key"
        )
        requested_path = "fast_path" if request.embedding else "fallback_path"

        failures = quality_failures(
            request.captureQuality,
            self.scoring_config.thresholds["minimumCaptureQuality"],
        )
        if failures:
            response = self._empty_response(
                scan_id,
                request,
                model_entry,
                "rejected",
                ["capture_quality_rejected", *failures],
                ["capture_quality_not_accepted"],
                "rescan",
            )
            await self._record_identify_diagnostics(
                request=request,
                response=response,
                request_id=request_id,
                requested_path=requested_path,
                source_type=source_type,
                private_image_key=private_image_keys[0] if private_image_keys else None,
                diagnostic_payload={
                    "qualityFailures": failures,
                    "fallbackImageCount": len(private_image_keys),
                },
            )
            return response

        embedding = request.embedding
        image_hashes: list[str] = []
        if embedding is None:
            images = await asyncio.gather(*(
                self._load_and_normalise_image(
                    key,
                    corners=request.corners,
                    actor_user_id=actor_user_id,
                )
                for key in private_image_keys
            ))
            embeddings: list[list[float]] = []
            try:
                for image, image_hash in images:
                    embeddings.append(self.model.embed(image.image))
                    image_hashes.append(image_hash)
            except ModelUnavailable as exc:
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail={"code": "model_unavailable", "message": str(exc)},
                ) from exc
            embedding = normalise_mean_embedding(embeddings)

        self._validate_embedding_dimensions(embedding, model_entry)
        candidates = await self._collect_candidates(
            request=request,
            embedding=embedding,
            collector_hint=collector_hint,
            set_code_hint=set_code_hint,
            model_entry=model_entry,
        )
        scored = self._score_candidates(
            candidates,
            request=request,
            collector_hint=collector_hint,
            set_code_hint=set_code_hint,
        )
        match_status, reasons, next_action, auto_allowed = choose_match_status(scored, self.scoring_config)
        global_flags: list[str] = []
        if not model_entry.active:
            global_flags.append("active_index_unavailable")
        if request.embedding and not any(candidate.record.source == "vector_lookup" for candidate in scored):
            global_flags.append("vector_index_unavailable")
        if image_hashes:
            global_flags.append("fallback_image_used")
        evidence_reasons = ["multi_frame_consensus_used"] if len(image_hashes) > 1 else []

        response = self._response_from_scored(
            scan_id=scan_id,
            request=request,
            model_entry=model_entry,
            scored=scored,
            match_status=match_status,
            reasons=sorted(set([*reasons, *global_flags, *evidence_reasons])),
            global_flags=global_flags,
            requested_next_action=next_action,
            auto_add_allowed=auto_allowed,
        )
        await self._record_identify_diagnostics(
            request=request,
            response=response,
            request_id=request_id,
            requested_path=requested_path,
            source_type=source_type,
            private_image_key=private_image_keys[0] if private_image_keys else None,
            diagnostic_payload={
                "fallbackImageSha256": image_hashes[0] if image_hashes else None,
                "fallbackImageCount": len(image_hashes),
            },
        )
        return response

    async def embed(self, request: EmbedRequest, actor_user_id: str | None = None) -> EmbedResponse:
        scan_id = uuid4()
        model_entry = await self._require_model(request.modelVersion, require_active=False)
        image, image_hash = await self._load_and_normalise_image(
            request.privateImageKey,
            corners=request.corners,
            actor_user_id=actor_user_id,
        )
        try:
            embedding = self.model.embed(image.image)
        except ModelUnavailable as exc:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "model_unavailable", "message": str(exc)},
            ) from exc
        self._validate_embedding_dimensions(embedding, model_entry)
        return EmbedResponse(
            scanId=scan_id,
            modelVersion=request.modelVersion,
            embedding=embedding,
            embeddingDimensions=len(embedding),
            imageSha256=image_hash,
            preprocessingVersion="stackr-recognition-preprocess-v1.0.0",
        )

    async def feedback(self, request: FeedbackRequest) -> FeedbackResponse:
        payload = {
            "selectedVariantId": str(request.selectedVariantId) if request.selectedVariantId else None,
            "correctedVariantId": str(request.correctedVariantId) if request.correctedVariantId else None,
            "hasNotes": bool(request.notes),
            "consent": consent_to_dict(request.consent),
            "client": request.client.model_dump(),
        }
        await self.diagnostics.record_feedback(request.scanId, request.feedbackAction, payload)
        return FeedbackResponse(ok=True, scanId=request.scanId, feedbackStatus="recorded")

    async def _require_model(self, model_version: str, require_active: bool = True) -> ModelRegistryEntry:
        model_entry = await self.repository.get_model(model_version)
        if model_entry is None:
            raise HTTPException(
                status_code=422,
                detail={"code": "model_version_unsupported", "message": "modelVersion is not registered"},
            )
        if require_active and self.settings.require_active_index and not model_entry.active:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"code": "recognition_unavailable", "message": "no active recognition index is configured"},
            )
        return model_entry

    def _validate_embedding_dimensions(self, embedding: list[float], model_entry: ModelRegistryEntry) -> None:
        if len(embedding) != model_entry.embedding_dimensions:
            raise HTTPException(
                status_code=422,
                detail={
                    "code": "validation_error",
                    "message": "embedding dimension does not match the requested model version",
                    "expectedDimensions": model_entry.embedding_dimensions,
                    "actualDimensions": len(embedding),
                },
            )

    async def _load_and_normalise_image(
        self,
        key: str | None,
        *,
        corners,
        actor_user_id: str | None,
    ):
        if not key:
            raise HTTPException(
                status_code=422,
                detail={"code": "image_key_required", "message": "privateImageKey is required for fallback processing"},
            )
        try:
            storage_key = key
            storage_bucket = None
            if actor_user_id:
                asset = await self.repository.resolve_private_scan_asset(
                    asset_id=key,
                    user_id=actor_user_id,
                )
                if asset is None:
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "code": "private_image_unavailable",
                            "message": "The private scan image is unavailable or does not belong to this user.",
                        },
                    )
                storage_key = asset.storage_key
                storage_bucket = asset.storage_bucket
            data = await self.storage.read_private_object(storage_key, bucket=storage_bucket)
            image = normalise_card_image(
                data,
                max_bytes=self.settings.max_image_bytes,
                target_width=self.settings.model_input_width,
                target_height=self.settings.model_input_height,
                corners=corners,
            )
            return image, image.sha256
        except RepositoryError as exc:
            raise HTTPException(
                status_code=503,
                detail={"code": "scan_asset_lookup_unavailable", "message": str(exc)},
            ) from exc
        except (StorageError, ImageProcessingError) as exc:
            raise HTTPException(
                status_code=422,
                detail={"code": "storage_unavailable", "message": str(exc)},
            ) from exc

    async def _collect_candidates(
        self,
        *,
        request: IdentifyRequest,
        embedding: list[float],
        collector_hint: str | None,
        set_code_hint: str | None,
        model_entry: ModelRegistryEntry,
    ) -> list[CandidateRecord]:
        overfetch = min(
            self.scoring_config.overfetch["maximum"],
            max(self.scoring_config.overfetch["minimum"], self.scoring_config.overfetch["multiplier"] * 10),
        )
        structured = await self.repository.exact_lookup(
            collector_number=collector_hint,
            set_code=set_code_hint,
            card_name=request.possibleCardName,
            language=request.detectedLanguage,
            limit=overfetch,
        )
        vector = await self.repository.vector_lookup(
            embedding=embedding,
            model_version=model_entry.model_version,
            language=request.detectedLanguage,
            limit=overfetch,
            collector_number=collector_hint,
            set_code=set_code_hint,
        ) if model_entry.active else []
        return merge_candidates([*structured, *vector])

    def _score_candidates(
        self,
        candidates: Iterable[CandidateRecord],
        *,
        request: IdentifyRequest,
        collector_hint: str | None,
        set_code_hint: str | None,
    ) -> list[ScoredCandidate]:
        scored = [
            score_candidate(
                candidate,
                self.scoring_config,
                collector_hint=collector_hint,
                set_code_hint=set_code_hint,
                card_name_hint=request.possibleCardName,
                ocr_text=request.ocrText,
                language_hint=request.detectedLanguage,
                capture_quality=request.captureQuality,
            )
            for candidate in candidates
        ]
        scored.sort(key=lambda item: (-item.overall, item.record.variant_id or "", item.record.canonical_card_id or ""))
        return [replace(item, rank=index + 1) for index, item in enumerate(scored[:10])]

    def _response_from_scored(
        self,
        *,
        scan_id: UUID,
        request: IdentifyRequest,
        model_entry: ModelRegistryEntry,
        scored: list[ScoredCandidate],
        match_status: str,
        reasons: list[str],
        global_flags: list[str],
        requested_next_action: str,
        auto_add_allowed: bool,
    ) -> IdentifyResponse:
        candidates = [candidate_response(item, global_flags) for item in scored]
        best = candidates[0] if candidates else None
        return IdentifyResponse(
            scanId=scan_id,
            matchStatus=match_status,
            topCandidates=candidates,
            canonicalCardId=best.canonicalCardId if best else None,
            variantId=best.variantId if best else None,
            overallConfidence=best.overallConfidence if best else 0.0,
            imageScore=best.imageScore if best else 0.0,
            ocrScore=best.ocrScore if best else 0.0,
            setAndNumberScore=best.setAndNumberScore if best else 0.0,
            modelVersion=request.modelVersion,
            indexVersion=model_entry.index_version,
            scoringConfigVersion=self.scoring_config.version,
            reasons=reasons,
            uncertaintyFlags=sorted(set([*global_flags, *(best.uncertaintyFlags if best else [])])),
            requestedNextAction=requested_next_action,
            autoAddAllowed=auto_add_allowed,
        )

    def _empty_response(
        self,
        scan_id: UUID,
        request: IdentifyRequest,
        model_entry: ModelRegistryEntry,
        match_status: str,
        reasons: list[str],
        uncertainty_flags: list[str],
        requested_next_action: str,
    ) -> IdentifyResponse:
        return IdentifyResponse(
            scanId=scan_id,
            matchStatus=match_status,
            topCandidates=[],
            canonicalCardId=None,
            variantId=None,
            overallConfidence=0.0,
            imageScore=0.0,
            ocrScore=0.0,
            setAndNumberScore=0.0,
            modelVersion=request.modelVersion,
            indexVersion=model_entry.index_version,
            scoringConfigVersion=self.scoring_config.version,
            reasons=reasons,
            uncertaintyFlags=uncertainty_flags,
            requestedNextAction=requested_next_action,
            autoAddAllowed=False,
        )

    async def _record_identify_diagnostics(
        self,
        *,
        request: IdentifyRequest,
        response: IdentifyResponse,
        request_id: str | None,
        requested_path: str,
        source_type: str,
        private_image_key: str | None,
        diagnostic_payload: dict,
    ) -> None:
        top = response.topCandidates[0] if response.topCandidates else None
        await self.diagnostics.record_scan(DiagnosticRecord(
            scan_id=response.scanId,
            request_id=request_id,
            route_version=self.settings.service_version,
            model_version=response.modelVersion,
            index_version=response.indexVersion,
            requested_path=requested_path,
            source_type=source_type,
            match_status=response.matchStatus,
            candidate_count=len(response.topCandidates),
            top_variant_id=_uuid_or_none(top.variantId if top else None),
            top_printing_id=_uuid_or_none(top.canonicalCardId if top else None),
            overall_confidence=response.overallConfidence,
            score_summary={
                "image": response.imageScore,
                "ocr": response.ocrScore,
                "setAndNumber": response.setAndNumberScore,
            },
            uncertainty_flags=response.uncertaintyFlags,
            requested_next_action=response.requestedNextAction,
            capture_quality=request.captureQuality.model_dump(),
            ocr_summary=redacted_ocr_summary(
                request.ocrText,
                request.possibleCollectorNumber,
                request.possibleSetCode,
                request.detectedLanguage,
            ),
            image_storage_key_hash=hash_storage_key(private_image_key),
            consent_state=consent_to_dict(request.consent),
            diagnostic_payload=diagnostic_payload,
        ))


def merge_candidates(candidates: list[CandidateRecord]) -> list[CandidateRecord]:
    by_id: dict[str, CandidateRecord] = {}
    for candidate in candidates:
        key = candidate.variant_id or candidate.canonical_card_id
        if not key:
            continue
        current = by_id.get(key)
        if not current:
            by_id[key] = candidate
            continue
        by_id[key] = replace(
            current,
            image_similarity=max(
                current.image_similarity or 0.0,
                candidate.image_similarity or 0.0,
            ) or None,
            reasons=sorted(set([*(current.reasons or []), *(candidate.reasons or [])])),
            source="merged",
        )
    return list(by_id.values())


def normalise_mean_embedding(embeddings: list[list[float]]) -> list[float]:
    if not embeddings:
        raise ModelUnavailable("model_returned_no_embeddings")
    dimensions = len(embeddings[0])
    if dimensions < 1 or any(len(embedding) != dimensions for embedding in embeddings):
        raise ModelUnavailable("model_returned_inconsistent_embeddings")
    mean = [
        sum(embedding[index] for embedding in embeddings) / len(embeddings)
        for index in range(dimensions)
    ]
    norm = sqrt(sum(value * value for value in mean))
    if norm <= 0:
        raise ModelUnavailable("model_returned_zero_consensus_embedding")
    return [value / norm for value in mean]


def candidate_response(item: ScoredCandidate, global_flags: list[str]) -> RecognitionCandidateResponse:
    scores = ComponentScores(
        image=item.image,
        ocr=item.ocr,
        setNumber=item.set_number,
        cardName=item.card_name,
        language=item.language,
        rarityVariant=item.rarity_variant,
        perceptualHash=item.perceptual_hash,
    )
    return RecognitionCandidateResponse(
        rank=item.rank,
        canonicalCardId=item.record.canonical_card_id,
        variantId=item.record.variant_id,
        setId=item.record.set_id,
        setCode=item.record.set_code,
        collectorNumber=item.record.collector_number,
        languageCode=item.record.language_code,
        variantCode=item.record.variant_code,
        cardName=item.record.card_name,
        overallConfidence=item.overall,
        imageScore=item.image,
        ocrScore=item.ocr,
        setAndNumberScore=item.set_number,
        componentScores=scores,
        reasons=item.reasons,
        uncertaintyFlags=sorted(set([*global_flags, *item.uncertainty_flags])),
    )


def _uuid_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return str(UUID(str(value)))
    except ValueError:
        return None
