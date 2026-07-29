from __future__ import annotations

from .schemas import CaptureQualityMetrics


def quality_score(metrics: CaptureQualityMetrics) -> float:
    if metrics.score is not None:
        return metrics.score
    values = [
        metrics.focusScore,
        metrics.glareScore,
        metrics.exposureScore,
        metrics.framingScore,
        metrics.stabilityScore,
        metrics.cardCoverage,
    ]
    present = [float(value) for value in values if value is not None]
    return sum(present) / len(present) if present else 0.5


def quality_failures(metrics: CaptureQualityMetrics, minimum_score: float) -> list[str]:
    failures = list(metrics.failureReasons)
    score = quality_score(metrics)
    if score < minimum_score:
        failures.append("capture_quality_below_threshold")
    if metrics.focusScore is not None and metrics.focusScore < 0.25:
        failures.append("blur")
    if metrics.glareScore is not None and metrics.glareScore < 0.25:
        failures.append("glare")
    if metrics.framingScore is not None and metrics.framingScore < 0.25:
        failures.append("poor_framing")
    return sorted(set(failures))
