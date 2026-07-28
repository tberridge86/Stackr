from __future__ import annotations

from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


LanguageCode = Literal["en", "ja", "zh-Hans", "zh-Hant", "ko", "unknown"]
ScriptCode = Literal["latin", "japanese", "korean", "chinese_simplified", "chinese_traditional", "unknown"]
MatchStatus = Literal["exact", "probable", "ambiguous", "no_match", "rejected"]
RequestedNextAction = Literal[
    "auto_confirm_allowed",
    "confirm_candidate",
    "rescan",
    "upload_fallback_image",
    "manual_entry",
    "none",
]


class RecognitionErrorCode(StrEnum):
    validation_error = "validation_error"
    model_version_unsupported = "model_version_unsupported"
    capture_quality_rejected = "capture_quality_rejected"
    image_key_required = "image_key_required"
    model_unavailable = "model_unavailable"
    storage_unavailable = "storage_unavailable"
    recognition_unavailable = "recognition_unavailable"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class CaptureQualityMetrics(StrictModel):
    score: float | None = Field(default=None, ge=0, le=1)
    focusScore: float | None = Field(default=None, ge=0, le=1)
    glareScore: float | None = Field(default=None, ge=0, le=1)
    exposureScore: float | None = Field(default=None, ge=0, le=1)
    framingScore: float | None = Field(default=None, ge=0, le=1)
    stabilityScore: float | None = Field(default=None, ge=0, le=1)
    cardCoverage: float | None = Field(default=None, ge=0, le=1)
    failureReasons: list[str] = Field(default_factory=list, max_length=12)


class ConsentState(StrictModel):
    retainImage: bool = False
    useForTraining: bool = False
    imageUploadConsent: bool = False
    consentVersion: str | None = Field(default=None, max_length=80)


class ImageCorners(StrictModel):
    topLeft: tuple[float, float]
    topRight: tuple[float, float]
    bottomRight: tuple[float, float]
    bottomLeft: tuple[float, float]
    coordinateSpace: Literal["normalized", "pixels"] = "normalized"


class ClientContext(StrictModel):
    appVersion: str | None = Field(default=None, max_length=80)
    platform: Literal["ios", "android", "server", "unknown"] = "unknown"
    deviceClass: str | None = Field(default=None, max_length=120)
    requestId: str | None = Field(default=None, max_length=120)


class IdentifyRequest(StrictModel):
    modelVersion: str = Field(min_length=1, max_length=160)
    embedding: list[float] | None = Field(default=None, min_length=1, max_length=8192)
    ocrText: str | None = Field(default=None, max_length=12000)
    possibleCollectorNumber: str | None = Field(default=None, max_length=80)
    possibleSetCode: str | None = Field(default=None, max_length=80)
    possibleCardName: str | None = Field(default=None, max_length=240)
    detectedLanguage: LanguageCode = "unknown"
    detectedScript: ScriptCode = "unknown"
    captureQuality: CaptureQualityMetrics
    privateImageKey: str | None = Field(default=None, min_length=1, max_length=900)
    imageMimeType: str | None = Field(default=None, max_length=80)
    corners: ImageCorners | None = None
    consent: ConsentState = Field(default_factory=ConsentState)
    client: ClientContext = Field(default_factory=ClientContext)

    @field_validator("embedding")
    @classmethod
    def embedding_must_be_normalised(cls, value: list[float] | None) -> list[float] | None:
        if value is None:
            return None
        squared = sum(float(item) * float(item) for item in value)
        if squared <= 0:
            raise ValueError("embedding must be non-zero")
        norm = squared ** 0.5
        if norm < 0.98 or norm > 1.02:
            raise ValueError("embedding must be L2-normalised")
        return [float(item) for item in value]

    @model_validator(mode="after")
    def either_embedding_or_image_key(self) -> "IdentifyRequest":
        if not self.embedding and not self.privateImageKey:
            raise ValueError("either embedding or privateImageKey is required")
        return self


class EmbedRequest(StrictModel):
    modelVersion: str = Field(min_length=1, max_length=160)
    privateImageKey: str = Field(min_length=1, max_length=900)
    imageMimeType: str | None = Field(default=None, max_length=80)
    corners: ImageCorners | None = None
    consent: ConsentState = Field(default_factory=ConsentState)
    client: ClientContext = Field(default_factory=ClientContext)


class FeedbackRequest(StrictModel):
    scanId: UUID
    feedbackAction: Literal[
        "confirm_result",
        "choose_candidate",
        "manual_correction",
        "variant_correction",
        "missing_card",
        "bad_scan",
    ]
    selectedVariantId: UUID | None = None
    correctedVariantId: UUID | None = None
    notes: str | None = Field(default=None, max_length=500)
    consent: ConsentState = Field(default_factory=ConsentState)
    client: ClientContext = Field(default_factory=ClientContext)


class ComponentScores(StrictModel):
    image: float = Field(ge=0, le=1)
    ocr: float = Field(ge=0, le=1)
    setNumber: float = Field(ge=0, le=1)
    cardName: float = Field(ge=0, le=1)
    language: float = Field(ge=0, le=1)
    rarityVariant: float = Field(ge=0, le=1)
    perceptualHash: float = Field(ge=0, le=1)


class RecognitionCandidateResponse(StrictModel):
    rank: int = Field(ge=1)
    canonicalCardId: str | None = None
    variantId: str | None = None
    setId: str | None = None
    setCode: str | None = None
    collectorNumber: str | None = None
    languageCode: str | None = None
    variantCode: str | None = None
    cardName: str | None = None
    overallConfidence: float = Field(ge=0, le=1)
    imageScore: float = Field(ge=0, le=1)
    ocrScore: float = Field(ge=0, le=1)
    setAndNumberScore: float = Field(ge=0, le=1)
    componentScores: ComponentScores
    reasons: list[str]
    uncertaintyFlags: list[str]


class IdentifyResponse(StrictModel):
    scanId: UUID
    matchStatus: MatchStatus
    topCandidates: list[RecognitionCandidateResponse]
    canonicalCardId: str | None
    variantId: str | None
    overallConfidence: float = Field(ge=0, le=1)
    imageScore: float = Field(ge=0, le=1)
    ocrScore: float = Field(ge=0, le=1)
    setAndNumberScore: float = Field(ge=0, le=1)
    modelVersion: str
    indexVersion: str | None
    scoringConfigVersion: str
    reasons: list[str]
    uncertaintyFlags: list[str]
    requestedNextAction: RequestedNextAction
    autoAddAllowed: bool


class EmbedResponse(StrictModel):
    scanId: UUID
    modelVersion: str
    embedding: list[float]
    embeddingDimensions: int
    imageSha256: str
    preprocessingVersion: str


class FeedbackResponse(StrictModel):
    ok: bool
    scanId: UUID
    feedbackStatus: Literal["recorded", "queued", "disabled"]


class HealthResponse(StrictModel):
    ok: bool
    service: str
    version: str


class ReadyResponse(StrictModel):
    ok: bool
    service: str
    version: str
    components: dict[str, Any]
