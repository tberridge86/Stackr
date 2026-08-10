from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import httpx

from .normalization import collector_matches, normalize_text
from .scoring import CandidateRecord
from .settings import Settings
from .tracing import trace_span, traceparent


class RepositoryError(RuntimeError):
    pass


@dataclass(frozen=True)
class ModelRegistryEntry:
    model_version: str
    index_version: str | None
    embedding_dimensions: int
    active: bool


class CandidateRepository:
    async def ready(self) -> dict[str, object]:
        return {"ok": True}

    async def get_model(self, model_version: str) -> ModelRegistryEntry | None:
        raise NotImplementedError

    async def exact_lookup(
        self,
        *,
        collector_number: str | None,
        set_code: str | None,
        card_name: str | None,
        language: str | None,
        limit: int,
    ) -> list[CandidateRecord]:
        raise NotImplementedError

    async def vector_lookup(
        self,
        *,
        embedding: list[float],
        model_version: str,
        language: str | None,
        limit: int,
    ) -> list[CandidateRecord]:
        raise NotImplementedError


def _candidate_from_stackr_result(result: dict[str, object], source: str, image_similarity: float | None = None) -> CandidateRecord:
    return CandidateRecord(
        canonical_card_id=result.get("canonicalId") and str(result.get("canonicalId")),
        variant_id=result.get("variantId") and str(result.get("variantId")),
        set_id=result.get("setId") and str(result.get("setId")),
        set_code=result.get("setCode") and str(result.get("setCode")),
        collector_number=result.get("collectorNumber") and str(result.get("collectorNumber")),
        language_code=result.get("languageCode") and str(result.get("languageCode")),
        variant_code=result.get("variantCode") and str(result.get("variantCode")),
        card_name=(result.get("nativeName") or result.get("englishDisplayName")) and str(result.get("nativeName") or result.get("englishDisplayName")),
        image_similarity=image_similarity,
        source=source,
        reasons=[str(result.get("reason") or source)],
    )


class StackrApiRepository(CandidateRepository):
    def __init__(self, settings: Settings):
        self.settings = settings

    async def ready(self) -> dict[str, object]:
        if not self.settings.catalogue_api_url:
            return {"ok": False, "reason": "catalogue_api_url_not_configured"}
        try:
            with trace_span("stackr-recognition", "catalogue_ready"):
                async with httpx.AsyncClient(timeout=self.settings.catalogue_timeout_seconds) as client:
                    response = await client.get(
                        f"{self.settings.catalogue_api_url.rstrip('/')}/v1/ready",
                        headers={"traceparent": traceparent() or ""},
                    )
            return {"ok": 200 <= response.status_code < 300, "status": response.status_code}
        except httpx.HTTPError as exc:
            return {"ok": False, "reason": exc.__class__.__name__}

    async def get_model(self, model_version: str) -> ModelRegistryEntry | None:
        if model_version != self.settings.model_version:
            return None
        if self.settings.require_active_index and not self.settings.active_index_version:
            return ModelRegistryEntry(model_version, None, self.settings.model_embedding_dimensions, False)
        return ModelRegistryEntry(
            model_version,
            self.settings.active_index_version,
            self.settings.model_embedding_dimensions,
            True,
        )

    async def exact_lookup(
        self,
        *,
        collector_number: str | None,
        set_code: str | None,
        card_name: str | None,
        language: str | None,
        limit: int,
    ) -> list[CandidateRecord]:
        if not self.settings.catalogue_api_url:
            return []
        query_parts = [part for part in [set_code, collector_number] if part]
        if not query_parts and card_name:
            query_parts.append(card_name)
        if not query_parts:
            return []
        params = {
            "q": " ".join(query_parts),
            "limit": str(limit),
        }
        if language and language != "unknown":
            params["language"] = language
        headers = {}
        if self.settings.catalogue_api_secret:
            headers["Authorization"] = f"Bearer {self.settings.catalogue_api_secret}"
        with trace_span("stackr-recognition", "catalogue_search"):
            active_traceparent = traceparent()
            if active_traceparent:
                headers["traceparent"] = active_traceparent
            async with httpx.AsyncClient(timeout=self.settings.catalogue_timeout_seconds) as client:
                response = await client.get(
                    f"{self.settings.catalogue_api_url.rstrip('/')}/v1/search",
                    params=params,
                    headers=headers,
                )
        if response.status_code >= 400:
            raise RepositoryError(f"catalogue search failed:{response.status_code}")
        payload = response.json()
        results = payload.get("data", {}).get("results", [])
        return [
            _candidate_from_stackr_result(result, "structured_lookup")
            for result in results
            if isinstance(result, dict) and result.get("type") == "card"
        ][:limit]

    async def vector_lookup(
        self,
        *,
        embedding: list[float],
        model_version: str,
        language: str | None,
        limit: int,
    ) -> list[CandidateRecord]:
        return []


class InMemoryRepository(CandidateRepository):
    def __init__(
        self,
        *,
        model: ModelRegistryEntry,
        structured_candidates: Iterable[CandidateRecord] = (),
        vector_candidates: Iterable[CandidateRecord] = (),
        ready_ok: bool = True,
    ):
        self.model = model
        self.structured_candidates = list(structured_candidates)
        self.vector_candidates = list(vector_candidates)
        self.ready_ok = ready_ok

    async def ready(self) -> dict[str, object]:
        return {"ok": self.ready_ok}

    async def get_model(self, model_version: str) -> ModelRegistryEntry | None:
        return self.model if model_version == self.model.model_version else None

    async def exact_lookup(
        self,
        *,
        collector_number: str | None,
        set_code: str | None,
        card_name: str | None,
        language: str | None,
        limit: int,
    ) -> list[CandidateRecord]:
        matches: list[CandidateRecord] = []
        for candidate in self.structured_candidates:
            if language and language != "unknown" and candidate.language_code != language:
                continue
            number_ok = collector_matches(candidate.collector_number, collector_number)
            set_ok = normalize_text(candidate.set_code) == normalize_text(set_code) if set_code else False
            name_ok = normalize_text(candidate.card_name) == normalize_text(card_name) if card_name else False
            if number_ok or set_ok or name_ok:
                matches.append(candidate)
        return matches[:limit]

    async def vector_lookup(
        self,
        *,
        embedding: list[float],
        model_version: str,
        language: str | None,
        limit: int,
    ) -> list[CandidateRecord]:
        return [
            candidate for candidate in self.vector_candidates
            if not language or language == "unknown" or candidate.language_code == language
        ][:limit]
