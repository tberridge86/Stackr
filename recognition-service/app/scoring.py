from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .normalization import (
    collector_matches,
    normalize_collector_number,
    normalize_text,
    text_similarity,
)
from .schemas import CaptureQualityMetrics


@dataclass(frozen=True)
class ScoringConfig:
    schema_version: str
    version: str
    status: str
    weights: dict[str, float]
    thresholds: dict[str, float]
    overfetch: dict[str, int]
    calibration: dict[str, Any]

    @property
    def calibration_ready(self) -> bool:
        return bool(self.calibration.get("ready"))


def load_scoring_config(path: Path) -> ScoringConfig:
    payload = json.loads(path.read_text(encoding="utf8"))
    weights = {str(key): float(value) for key, value in payload["weights"].items()}
    total = sum(weights.values())
    if not 0.99 <= total <= 1.01:
        raise ValueError(f"scoring weights must sum to 1; got {total}")
    return ScoringConfig(
        schema_version=str(payload["schemaVersion"]),
        version=str(payload["version"]),
        status=str(payload["status"]),
        weights=weights,
        thresholds={str(key): float(value) for key, value in payload["thresholds"].items()},
        overfetch={str(key): int(value) for key, value in payload["overfetch"].items()},
        calibration=dict(payload.get("calibration") or {}),
    )


@dataclass
class CandidateRecord:
    canonical_card_id: str | None
    variant_id: str | None
    set_id: str | None
    set_code: str | None
    collector_number: str | None
    language_code: str | None
    variant_code: str | None
    card_name: str | None
    image_similarity: float | None = None
    perceptual_hash_similarity: float | None = None
    rarity_variant_hint: str | None = None
    source: str = "unknown"
    reasons: list[str] | None = None


@dataclass
class ScoredCandidate:
    record: CandidateRecord
    rank: int
    overall: float
    image: float
    ocr: float
    set_number: float
    card_name: float
    language: float
    rarity_variant: float
    perceptual_hash: float
    reasons: list[str]
    uncertainty_flags: list[str]


@dataclass(frozen=True)
class CardIdentityGroup:
    key: str
    primary: ScoredCandidate
    members: tuple[ScoredCandidate, ...]

    @property
    def has_sibling_variants(self) -> bool:
        variants = {
            (member.record.variant_id or member.record.canonical_card_id or "").strip()
            for member in self.members
        }
        variants.discard("")
        return len(variants) > 1


def clamp01(value: float | None, fallback: float = 0.0) -> float:
    if value is None:
        return fallback
    return max(0.0, min(1.0, float(value)))


def language_score(candidate: str | None, hint: str | None) -> float:
    if not candidate or not hint or hint == "unknown":
        return 0.5
    if candidate == hint:
        return 1.0
    if hint == "zh" and candidate in {"zh-Hans", "zh-Hant", "zh"}:
        return 1.0
    return 0.0


def card_identity_key(candidate: CandidateRecord) -> str:
    """Return a stable printed-card identity without collapsing different printings.

    Finish siblings may have different canonical keys in the catalogue. Language,
    set and collector number identify the printed card family while variant_id and
    variant_code continue to identify the exact finish beneath that family.
    """
    language = normalize_text(candidate.language_code)
    set_identity = normalize_text(candidate.set_id or candidate.set_code)
    collector = normalize_collector_number(candidate.collector_number)
    if language and set_identity and collector:
        return f"card:{language}:{set_identity}:{collector}"

    # Never collapse candidates when the structured identity is incomplete.
    fallback = candidate.variant_id or candidate.canonical_card_id
    return f"variant:{fallback}" if fallback else "variant:unknown"


def group_card_identities(candidates: list[ScoredCandidate]) -> list[CardIdentityGroup]:
    grouped: dict[str, list[ScoredCandidate]] = {}
    order: list[str] = []
    for candidate in candidates:
        key = card_identity_key(candidate.record)
        if key not in grouped:
            grouped[key] = []
            order.append(key)
        grouped[key].append(candidate)

    groups = [
        CardIdentityGroup(key=key, primary=grouped[key][0], members=tuple(grouped[key]))
        for key in order
    ]
    groups.sort(
        key=lambda group: (
            -group.primary.overall,
            group.key,
        )
    )
    return groups


def score_candidate(
    candidate: CandidateRecord,
    config: ScoringConfig,
    *,
    collector_hint: str | None,
    set_code_hint: str | None,
    card_name_hint: str | None,
    ocr_text: str | None,
    language_hint: str | None,
    capture_quality: CaptureQualityMetrics,
) -> ScoredCandidate:
    image = clamp01(candidate.image_similarity, fallback=0.0)
    collector_available = bool(collector_hint and candidate.collector_number)
    collector = 1.0 if collector_available and collector_matches(candidate.collector_number, collector_hint) else 0.0
    set_code_available = bool(set_code_hint and candidate.set_code)
    set_code = 1.0 if set_code_available and normalize_text(candidate.set_code) == normalize_text(set_code_hint) else 0.0
    set_number = max(collector, (collector + set_code) / 2 if collector or set_code else 0.0)
    name_hint = card_name_hint
    name_available = bool(name_hint and candidate.card_name)
    name = text_similarity(candidate.card_name, name_hint)
    language_available = bool(candidate.language_code and language_hint and language_hint != "unknown")
    language = language_score(candidate.language_code, language_hint)
    rarity_variant = 0.5
    phash = clamp01(candidate.perceptual_hash_similarity, fallback=0.5)
    ocr_components = [
        value for value, available in (
            (set_number, collector_available or set_code_available),
            (name, name_available),
            (language, language_available),
        ) if available
    ]
    ocr = max(ocr_components, default=0.0)

    weights = config.weights
    weighted_evidence = [
        (image, weights["image"], candidate.image_similarity is not None),
        (collector, weights["collectorNumber"], collector_available),
        (set_code, weights["setCode"], set_code_available),
        (name, weights["cardName"], name_available),
        (language, weights["language"], language_available),
        (rarity_variant, weights["rarityVariant"], candidate.rarity_variant_hint is not None),
        (phash, weights["perceptualHash"], candidate.perceptual_hash_similarity is not None),
    ]
    available_weight = sum(weight for _, weight, available in weighted_evidence if available)
    overall = (
        sum(value * weight for value, weight, available in weighted_evidence if available) / available_weight
        if available_weight > 0
        else 0.0
    )

    # Exact printed identifiers should break visual ties, while a noisy OCR read must not
    # erase otherwise useful image candidates from the confirmation list.
    if collector_available and not collector:
        overall *= 0.72
    if set_code_available and not set_code:
        overall *= 0.82
    if language_available and language == 0:
        overall *= 0.9

    reasons = list(candidate.reasons or [])
    if image > 0:
        reasons.append("image_similarity")
    if collector:
        reasons.append("collector_number_agreement")
    if set_code:
        reasons.append("set_code_agreement")
    if name >= 0.8:
        reasons.append("card_name_agreement")
    if language >= 1:
        reasons.append("language_agreement")
    if available_weight > 0:
        reasons.append("available_evidence_normalised")

    uncertainty_flags: list[str] = []
    if candidate.image_similarity is None:
        uncertainty_flags.append("image_similarity_missing")
    if collector_hint and not collector:
        uncertainty_flags.append("collector_number_conflict")
    if set_code_hint and not set_code:
        uncertainty_flags.append("set_code_conflict")
    if language == 0:
        uncertainty_flags.append("language_conflict")
    if candidate.image_similarity is not None and image < config.thresholds["minimumImageSimilarity"]:
        uncertainty_flags.append("image_similarity_below_floor")
    if not config.calibration_ready:
        uncertainty_flags.append("confidence_not_calibrated")

    return ScoredCandidate(
        record=candidate,
        rank=0,
        overall=clamp01(overall),
        image=image,
        ocr=clamp01(ocr),
        set_number=clamp01(set_number),
        card_name=clamp01(name),
        language=clamp01(language),
        rarity_variant=clamp01(rarity_variant),
        perceptual_hash=phash,
        reasons=sorted(set(reasons)),
        uncertainty_flags=sorted(set(uncertainty_flags)),
    )


def choose_match_status(candidates: list[ScoredCandidate], config: ScoringConfig) -> tuple[str, list[str], str, bool]:
    if not candidates:
        return "no_match", ["no_candidates"], "manual_entry", False
    best = candidates[0]
    second = candidates[1] if len(candidates) > 1 else None
    reasons: list[str] = []
    auto_threshold = config.thresholds["autoConfirm"]
    probable_threshold = config.thresholds["probable"]
    margin_threshold = config.thresholds["ambiguousMargin"]
    margin = best.overall - second.overall if second else best.overall

    if (
        best.record.image_similarity is not None
        and best.image < config.thresholds["minimumImageSimilarity"]
        and best.set_number < 1.0
        and best.card_name < 0.85
    ):
        return "no_match", ["image_similarity_below_floor"], "rescan", False

    if second and margin < margin_threshold:
        return "ambiguous", ["top_candidates_too_close"], "confirm_candidate", False
    if best.overall >= auto_threshold and not best.uncertainty_flags and config.calibration_ready:
        return "exact", ["above_auto_confirm_threshold"], "auto_confirm_allowed", True
    if best.overall >= probable_threshold:
        if not config.calibration_ready:
            reasons.append("confidence_not_calibrated")
        return "probable", reasons or ["above_probable_threshold"], "confirm_candidate", False
    return "no_match", ["below_probable_threshold"], "rescan", False
