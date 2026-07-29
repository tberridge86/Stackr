from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from .schemas import ConsentState
from .settings import Settings
from .tracing import trace_span


def hash_storage_key(key: str | None) -> str | None:
    if not key:
        return None
    return hashlib.sha256(key.encode("utf8")).hexdigest()


def redacted_ocr_summary(ocr_text: str | None, collector_number: str | None, set_code: str | None, language: str | None) -> dict[str, Any]:
    return {
        "hasText": bool(ocr_text),
        "textLength": len(ocr_text or ""),
        "collectorNumberPresent": bool(collector_number),
        "setCodePresent": bool(set_code),
        "language": language or "unknown",
    }


@dataclass
class DiagnosticRecord:
    scan_id: UUID
    request_id: str | None
    route_version: str
    model_version: str | None
    index_version: str | None
    requested_path: str
    source_type: str
    match_status: str
    candidate_count: int
    top_variant_id: str | None
    top_printing_id: str | None
    overall_confidence: float | None
    score_summary: dict[str, Any]
    uncertainty_flags: list[str]
    requested_next_action: str
    capture_quality: dict[str, Any]
    ocr_summary: dict[str, Any]
    image_storage_key_hash: str | None
    consent_state: dict[str, Any]
    diagnostic_payload: dict[str, Any] = field(default_factory=dict)


class DiagnosticSink:
    async def record_scan(self, record: DiagnosticRecord) -> None:
        raise NotImplementedError

    async def record_feedback(self, scan_id: UUID, action: str, payload: dict[str, Any]) -> None:
        raise NotImplementedError


class MemoryDiagnosticSink(DiagnosticSink):
    def __init__(self) -> None:
        self.records: list[DiagnosticRecord] = []
        self.feedback: list[dict[str, Any]] = []

    async def record_scan(self, record: DiagnosticRecord) -> None:
        self.records.append(record)

    async def record_feedback(self, scan_id: UUID, action: str, payload: dict[str, Any]) -> None:
        self.feedback.append({"scanId": str(scan_id), "action": action, "payload": payload})


class NullDiagnosticSink(DiagnosticSink):
    async def record_scan(self, record: DiagnosticRecord) -> None:
        return None

    async def record_feedback(self, scan_id: UUID, action: str, payload: dict[str, Any]) -> None:
        return None


class PostgresDiagnosticSink(DiagnosticSink):
    def __init__(self, settings: Settings):
        if not settings.database_url_secret:
            raise RuntimeError("database_url is not configured")
        self.settings = settings

    async def record_scan(self, record: DiagnosticRecord) -> None:
        import psycopg

        expires_at = datetime.now(UTC) + timedelta(hours=self.settings.diagnostic_retention_hours)
        row = {
            "scan_id": str(record.scan_id),
            "request_id": record.request_id,
            "route_version": record.route_version,
            "model_version": record.model_version,
            "index_version": record.index_version,
            "requested_path": record.requested_path,
            "source_type": record.source_type,
            "match_status": record.match_status,
            "candidate_count": record.candidate_count,
            "top_variant_id": record.top_variant_id,
            "top_printing_id": record.top_printing_id,
            "overall_confidence": record.overall_confidence,
            "score_summary": json.dumps(record.score_summary),
            "uncertainty_flags": record.uncertainty_flags,
            "requested_next_action": record.requested_next_action,
            "capture_quality": json.dumps(record.capture_quality),
            "ocr_summary": json.dumps(record.ocr_summary),
            "image_storage_key_hash": record.image_storage_key_hash,
            "consent_state": json.dumps(record.consent_state),
            "diagnostic_payload": json.dumps(record.diagnostic_payload),
            "image_retention_status": _image_retention_status(record.consent_state),
            "expires_at": expires_at,
        }
        columns = ", ".join(row)
        placeholders = ", ".join(f"%({key})s" for key in row)
        updates = ", ".join(f"{key}=excluded.{key}" for key in row if key != "scan_id")
        sql = f"""
            insert into ml.recognition_scan_diagnostics ({columns})
            values ({placeholders})
            on conflict (scan_id) do update set {updates}, updated_at = now()
        """
        with trace_span("supabase-postgres", "record_recognition_diagnostic"):
            with psycopg.connect(self.settings.database_url_secret) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql, row)

    async def record_feedback(self, scan_id: UUID, action: str, payload: dict[str, Any]) -> None:
        import psycopg

        sql = """
            insert into audit.catalogue_events (
              request_id, actor_role, event_type, event_payload
            )
            values (%(request_id)s, 'service_role', 'recognition.feedback', %(payload)s)
        """
        with trace_span("supabase-postgres", "record_recognition_feedback"):
            with psycopg.connect(self.settings.database_url_secret) as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql, {
                        "request_id": str(scan_id),
                        "payload": json.dumps({"scanId": str(scan_id), "action": action, **payload}),
                    })


def _image_retention_status(consent: dict[str, Any]) -> str:
    if consent.get("retainImage") and consent.get("imageUploadConsent"):
        return "consented_feedback"
    return "temporary_fallback" if consent.get("imageUploadConsent") else "none"


def build_diagnostic_sink(settings: Settings) -> DiagnosticSink:
    if not settings.diagnostics_enabled:
        return NullDiagnosticSink()
    if settings.database_url_secret:
        return PostgresDiagnosticSink(settings)
    return NullDiagnosticSink()


def consent_to_dict(consent: ConsentState) -> dict[str, Any]:
    return {
        "retainImage": consent.retainImage,
        "useForTraining": consent.useForTraining,
        "imageUploadConsent": consent.imageUploadConsent,
        "consentVersion": consent.consentVersion,
    }
