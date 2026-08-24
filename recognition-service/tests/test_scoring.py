from __future__ import annotations

import pytest

from app.schemas import CaptureQualityMetrics
from app.scoring import (
    CandidateRecord,
    ScoringConfig,
    card_identity_key,
    choose_match_status,
    group_card_identities,
    score_candidate,
)


def config() -> ScoringConfig:
    return ScoringConfig(
        schema_version="test",
        version="test",
        status="confirmation_only",
        weights={
            "image": 0.34,
            "collectorNumber": 0.18,
            "setCode": 0.14,
            "cardName": 0.12,
            "language": 0.08,
            "rarityVariant": 0.07,
            "perceptualHash": 0.07,
        },
        thresholds={
            "autoConfirm": 0.94,
            "probable": 0.74,
            "ambiguousMargin": 0.06,
            "minimumCaptureQuality": 0.45,
            "minimumImageSimilarity": 0.35,
        },
        overfetch={"multiplier": 5, "minimum": 25, "maximum": 200},
        calibration={"ready": False},
    )


def quality() -> CaptureQualityMetrics:
    return CaptureQualityMetrics(score=0.9)


def test_visual_only_confidence_is_not_penalised_for_missing_ocr():
    candidate = CandidateRecord(
        canonical_card_id="card-a",
        variant_id="variant-a",
        set_id="set-a",
        set_code="SET",
        collector_number="001/100",
        language_code="en",
        variant_code="normal",
        card_name="Pikachu",
        image_similarity=0.91,
    )

    scored = score_candidate(
        candidate,
        config(),
        collector_hint=None,
        set_code_hint=None,
        card_name_hint=None,
        ocr_text=None,
        language_hint="unknown",
        capture_quality=quality(),
    )
    status, _, action, auto_add = choose_match_status([scored], config())

    assert scored.overall == pytest.approx(0.91)
    assert status == "probable"
    assert action == "confirm_candidate"
    assert auto_add is False


def test_collector_number_breaks_a_close_visual_tie():
    matching = CandidateRecord(
        canonical_card_id="card-a",
        variant_id="variant-a",
        set_id="set-a",
        set_code="SET",
        collector_number="001/100",
        language_code="en",
        variant_code="normal",
        card_name="Pikachu",
        image_similarity=0.88,
    )
    visual_decoy = CandidateRecord(
        canonical_card_id="card-b",
        variant_id="variant-b",
        set_id="set-a",
        set_code="SET",
        collector_number="002/100",
        language_code="en",
        variant_code="normal",
        card_name="Raichu",
        image_similarity=0.92,
    )
    kwargs = {
        "config": config(),
        "collector_hint": "001/100",
        "set_code_hint": "SET",
        "card_name_hint": None,
        "ocr_text": "001/100",
        "language_hint": "en",
        "capture_quality": quality(),
    }

    correct = score_candidate(matching, **kwargs)
    decoy = score_candidate(visual_decoy, **kwargs)

    assert correct.overall > decoy.overall
    assert "collector_number_conflict" in decoy.uncertainty_flags


def test_finish_siblings_share_one_card_identity_but_other_numbers_do_not():
    common = {
        "set_id": "set-s10a",
        "set_code": "S10a",
        "collector_number": "038",
        "language_code": "ja",
        "card_name": "グライガー",
    }
    normal = CandidateRecord(
        canonical_card_id="pokemon:ja:set-s10a:038:normal",
        variant_id="variant-normal",
        variant_code="normal",
        image_similarity=0.916,
        **common,
    )
    reverse = CandidateRecord(
        canonical_card_id="pokemon:ja:set-s10a:038:reverse_holo",
        variant_id="variant-reverse",
        variant_code="reverse_holo",
        image_similarity=0.913,
        **common,
    )
    different_card = CandidateRecord(
        canonical_card_id="pokemon:ja:set-s10a:039:normal",
        variant_id="variant-other",
        set_id="set-s10a",
        set_code="S10a",
        collector_number="039",
        language_code="ja",
        variant_code="normal",
        card_name="別のカード",
        image_similarity=0.90,
    )
    kwargs = {
        "config": config(),
        "collector_hint": "038",
        "set_code_hint": "S10a",
        "card_name_hint": None,
        "ocr_text": "S10a 038",
        "language_hint": "ja",
        "capture_quality": quality(),
    }
    scored = sorted(
        [score_candidate(item, **kwargs) for item in (normal, reverse, different_card)],
        key=lambda item: -item.overall,
    )
    groups = group_card_identities(scored)

    assert card_identity_key(normal) == card_identity_key(reverse)
    assert card_identity_key(normal) != card_identity_key(different_card)
    assert len(groups) == 2
    assert groups[0].has_sibling_variants is True
    assert {member.record.variant_code for member in groups[0].members} == {"normal", "reverse_holo"}


def test_identity_status_ignores_finish_sibling_margin_but_keeps_true_identity_margin():
    base = {
        "set_id": "set-s10a",
        "set_code": "S10a",
        "collector_number": "038",
        "language_code": "ja",
        "card_name": "グライガー",
    }
    candidates = [
        CandidateRecord(
            canonical_card_id="pokemon:ja:set-s10a:038:normal",
            variant_id="variant-normal",
            variant_code="normal",
            image_similarity=0.916,
            **base,
        ),
        CandidateRecord(
            canonical_card_id="pokemon:ja:set-s10a:038:reverse_holo",
            variant_id="variant-reverse",
            variant_code="reverse_holo",
            image_similarity=0.913,
            **base,
        ),
    ]
    kwargs = {
        "config": config(),
        "collector_hint": "038",
        "set_code_hint": "S10a",
        "card_name_hint": "グライガー",
        "ocr_text": "グライガー S10a 038",
        "language_hint": "ja",
        "capture_quality": quality(),
    }
    scored = sorted([score_candidate(item, **kwargs) for item in candidates], key=lambda item: -item.overall)

    variant_status, _, _, _ = choose_match_status(scored, config())
    groups = group_card_identities(scored)
    identity_status, _, action, auto_add = choose_match_status([group.primary for group in groups], config())

    assert variant_status == "ambiguous"
    assert identity_status == "probable"
    assert action == "confirm_candidate"
    assert auto_add is False
