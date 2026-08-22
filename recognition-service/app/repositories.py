from __future__ import annotations

from dataclasses import dataclass
import math
import re
from typing import Iterable
from uuid import UUID

import httpx
import psycopg
from psycopg import sql
from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool, PoolTimeout

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


@dataclass(frozen=True)
class ActiveIndexEntry:
    id: str
    index_version: str
    vector_table_name: str
    embedding_dimensions: int
    language_code: str | None


@dataclass(frozen=True)
class PrivateScanAsset:
    asset_id: str
    user_id: str
    storage_bucket: str
    storage_key: str


_VECTOR_TABLE_NAME = re.compile(r"^[a-z][a-z0-9_]{0,62}$")
_CATALOGUE_LANGUAGE_CODES = {
    "zh-Hans": "zh-cn",
    "zh-Hant": "zh-tw",
}


def _catalogue_language_code(language: str | None) -> str | None:
    if not language or language == "unknown":
        return None
    return _CATALOGUE_LANGUAGE_CODES.get(language, language)


def _vector_literal(embedding: list[float]) -> str:
    if not embedding or any(not math.isfinite(float(value)) for value in embedding):
        raise RepositoryError("embedding contains invalid numeric values")
    return "[" + ",".join(format(float(value), ".17g") for value in embedding) + "]"


class CandidateRepository:
    async def open(self) -> None:
        pass

    async def close(self) -> None:
        pass

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
        collector_number: str | None = None,
        set_code: str | None = None,
    ) -> list[CandidateRecord]:
        raise NotImplementedError

    async def resolve_private_scan_asset(
        self,
        *,
        asset_id: str,
        user_id: str,
    ) -> PrivateScanAsset | None:
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
        database_url = self.settings.database_url_secret
        self._pool = AsyncConnectionPool(
            conninfo=database_url,
            kwargs={"row_factory": dict_row},
            min_size=1,
            max_size=max(1, min(self.settings.concurrency_hint, 8)),
            open=False,
            timeout=5.0,
            name="stackr-recognition",
        ) if database_url else None

    async def open(self) -> None:
        if self._pool is None:
            return
        try:
            await self._pool.open(wait=True, timeout=10.0)
        except (psycopg.Error, PoolTimeout) as exc:
            raise RepositoryError("recognition database pool failed to open") from exc

    async def close(self) -> None:
        if self._pool is not None:
            await self._pool.close(timeout=5.0)

    async def _connect(self):
        if self._pool is None or self._pool.closed:
            raise RepositoryError("recognition database pool is not open")
        return self._pool.connection(timeout=5.0)

    async def _database_ready(self) -> dict[str, object]:
        if not self.settings.database_url_secret:
            return {
                "ok": not self.settings.require_active_index,
                "reason": "database_url_not_configured",
            }
        try:
            async with await self._connect() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        "select to_regclass('ml.embedding_models') is not null as registry_ready"
                    )
                    row = await cursor.fetchone()
            return {
                "ok": bool(row and row["registry_ready"]),
                "reason": None if row and row["registry_ready"] else "embedding_registry_missing",
            }
        except (psycopg.Error, PoolTimeout, RepositoryError):
            return {"ok": False, "reason": "recognition_database_unavailable"}

    async def ready(self) -> dict[str, object]:
        if not self.settings.catalogue_api_url:
            return {"ok": False, "reason": "catalogue_api_url_not_configured"}
        try:
            with trace_span("stackr-recognition", "catalogue_ready"):
                async with httpx.AsyncClient(timeout=self.settings.catalogue_timeout_seconds) as client:
                    response = await client.get(
                        f"{self.settings.catalogue_api_url.rstrip('/')}/v1/health",
                        headers={"traceparent": traceparent() or ""},
                    )
            catalogue = {"ok": 200 <= response.status_code < 300, "status": response.status_code}
        except httpx.HTTPError as exc:
            catalogue = {"ok": False, "reason": exc.__class__.__name__}
        database = await self._database_ready()
        return {
            "ok": bool(catalogue.get("ok")) and bool(database.get("ok")),
            "catalogue": catalogue,
            "database": database,
        }

    async def get_model(self, model_version: str) -> ModelRegistryEntry | None:
        if model_version != self.settings.model_version:
            return None
        if self.settings.require_active_index and not self.settings.active_index_version:
            return ModelRegistryEntry(model_version, None, self.settings.model_embedding_dimensions, False)
        if not self.settings.database_url_secret:
            if not self.settings.require_active_index:
                return ModelRegistryEntry(
                    model_version,
                    self.settings.active_index_version,
                    self.settings.model_embedding_dimensions,
                    True,
                )
            return ModelRegistryEntry(model_version, None, self.settings.model_embedding_dimensions, False)
        try:
            async with await self._connect() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        select
                          m.model_id,
                          m.embedding_dimensions,
                          m.selection_status,
                          m.license_status,
                          i.index_version
                        from ml.embedding_models m
                        left join lateral (
                          select index_version
                          from ml.embedding_index_versions
                          where model_id = m.model_id
                            and status = 'active'
                            and (%s::text is null or index_version = %s)
                          order by language_code nulls first, activated_at desc
                          limit 1
                        ) i on true
                        where m.model_id = %s
                          and m.deprecated_at is null
                        """,
                        (
                            self.settings.active_index_version,
                            self.settings.active_index_version,
                            model_version,
                        ),
                    )
                    row = await cursor.fetchone()
        except (psycopg.Error, PoolTimeout, RepositoryError):
            return ModelRegistryEntry(model_version, None, self.settings.model_embedding_dimensions, False)

        if not row or not row["embedding_dimensions"]:
            return None
        index_version = row["index_version"] and str(row["index_version"])
        active = (
            row["selection_status"] == "active"
            and row["license_status"] == "production_allowed"
            and index_version is not None
        )
        return ModelRegistryEntry(
            model_version=str(row["model_id"]),
            index_version=index_version,
            embedding_dimensions=int(row["embedding_dimensions"]),
            active=active,
        )

    async def resolve_private_scan_asset(
        self,
        *,
        asset_id: str,
        user_id: str,
    ) -> PrivateScanAsset | None:
        if not self.settings.database_url_secret:
            return None
        try:
            normalised_asset_id = str(UUID(asset_id))
            normalised_user_id = str(UUID(user_id))
        except (ValueError, TypeError, AttributeError):
            return None

        try:
            async with await self._connect() as connection:
                async with connection.cursor() as cursor:
                    await cursor.execute(
                        """
                        select asset_id, created_by, storage_bucket, storage_key
                        from ml.resolve_private_scan_asset(%s, %s::uuid)
                        """,
                        (
                            normalised_asset_id,
                            normalised_user_id,
                        ),
                    )
                    row = await cursor.fetchone()
        except (psycopg.Error, PoolTimeout) as exc:
            raise RepositoryError("private scan asset lookup failed") from exc

        if not row:
            return None
        return PrivateScanAsset(
            asset_id=str(row["asset_id"]),
            user_id=str(row["created_by"]),
            storage_bucket=str(row["storage_bucket"]),
            storage_key=str(row["storage_key"]),
        )

    async def _active_index(
        self,
        *,
        model_version: str,
        language: str | None,
    ) -> ActiveIndexEntry | None:
        language_code = _catalogue_language_code(language)
        async with await self._connect() as connection:
            async with connection.cursor() as cursor:
                await cursor.execute(
                    """
                    select
                      i.id,
                      i.index_version,
                      i.vector_table_name,
                      i.embedding_dimensions,
                      i.language_code
                    from ml.embedding_index_versions i
                    join ml.embedding_models m on m.model_id = i.model_id
                    where i.model_id = %s
                      and i.status = 'active'
                      and m.selection_status = 'active'
                      and m.license_status = 'production_allowed'
                      and m.deprecated_at is null
                      and (%s::text is null or i.index_version = %s)
                      and (
                        %s::text is null
                        or i.language_code = %s
                        or i.language_code is null
                      )
                    order by
                      (i.language_code = %s) desc nulls last,
                      (i.language_code is null) desc,
                      i.activated_at desc
                    limit 1
                    """,
                    (
                        model_version,
                        self.settings.active_index_version,
                        self.settings.active_index_version,
                        language_code,
                        language_code,
                        language_code,
                    ),
                )
                row = await cursor.fetchone()
        if not row or not row["vector_table_name"]:
            return None
        table_name = str(row["vector_table_name"])
        if not _VECTOR_TABLE_NAME.fullmatch(table_name):
            raise RepositoryError("active index has an invalid vector table name")
        return ActiveIndexEntry(
            id=str(row["id"]),
            index_version=str(row["index_version"]),
            vector_table_name=table_name,
            embedding_dimensions=int(row["embedding_dimensions"]),
            language_code=row["language_code"] and str(row["language_code"]),
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
        collector_number: str | None = None,
        set_code: str | None = None,
    ) -> list[CandidateRecord]:
        if not self.settings.database_url_secret:
            return []
        vector = _vector_literal(embedding)
        language_code = _catalogue_language_code(language)
        try:
            active_index = await self._active_index(
                model_version=model_version,
                language=language,
            )
            if active_index is None:
                return []
            if len(embedding) != active_index.embedding_dimensions:
                raise RepositoryError("embedding dimension does not match the active index")

            has_structured_scope = bool(
                (collector_number and collector_number.strip())
                or (set_code and set_code.strip())
            )
            if has_structured_scope:
                # When OCR has supplied a set or collector number, rank only the
                # matching catalogue slice. Searching the global HNSW graph first
                # lets visually similar reprints from other sets displace the
                # correct identity before evidence fusion can use the OCR hint.
                query = sql.SQL(
                    """
                    with eligible as materialized (
                      select
                        e.variant_id,
                        e.embedding,
                        c.canonical_key,
                        c.set_id,
                        c.set_code,
                        c.collector_number,
                        c.language_code,
                        c.variant_code,
                        c.card_native_name,
                        c.card_english_display_name
                      from ml.{table_name} e
                      join api.catalogue_cards c on c.variant_id = e.variant_id
                      where e.model_id = %s
                        and e.index_version_id = %s::uuid
                        and e.deprecated_at is null
                        and exists (
                          select 1
                          from catalog.catalogue_version_variants cvv
                          join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
                          where cvv.variant_id = e.variant_id
                            and cv.status = 'published'
                            and cv.deprecated_at is null
                        )
                        and (%s::text is null or e.language_code = %s)
                        and (%s::text is null or lower(c.set_code) = lower(%s))
                        and (
                          %s::text is null
                          or regexp_replace(split_part(lower(c.collector_number), '/', 1), '^0+', '')
                            = regexp_replace(split_part(lower(%s), '/', 1), '^0+', '')
                        )
                    )
                    select
                      canonical_key,
                      variant_id,
                      set_id,
                      set_code,
                      collector_number,
                      language_code,
                      variant_code,
                      card_native_name,
                      card_english_display_name,
                      (embedding OPERATOR(extensions.<=>) %s::extensions.vector) as cosine_distance
                    from eligible
                    order by cosine_distance asc, variant_id asc
                    limit %s
                    """
                ).format(table_name=sql.Identifier(active_index.vector_table_name))
                query_params = (
                    model_version,
                    active_index.id,
                    language_code,
                    language_code,
                    set_code,
                    set_code,
                    collector_number,
                    collector_number,
                    vector,
                    max(1, limit),
                )
            else:
                query = sql.SQL(
                    """
                    select
                      c.canonical_key,
                      c.variant_id,
                      c.set_id,
                      c.set_code,
                      c.collector_number,
                      c.language_code,
                      c.variant_code,
                      c.card_native_name,
                      c.card_english_display_name,
                      (e.embedding OPERATOR(extensions.<=>) %s::extensions.vector) as cosine_distance
                    from ml.{table_name} e
                    join api.catalogue_cards c on c.variant_id = e.variant_id
                    where e.model_id = %s
                      and e.index_version_id = %s::uuid
                      and e.deprecated_at is null
                      and exists (
                        select 1
                        from catalog.catalogue_version_variants cvv
                        join catalog.catalogue_versions cv on cv.id = cvv.catalogue_version_id
                        where cvv.variant_id = e.variant_id
                          and cv.status = 'published'
                          and cv.deprecated_at is null
                      )
                      and (%s::text is null or e.language_code = %s)
                    order by cosine_distance asc, e.variant_id asc
                    limit %s
                    """
                ).format(table_name=sql.Identifier(active_index.vector_table_name))
                query_params = (
                    vector,
                    model_version,
                    active_index.id,
                    language_code,
                    language_code,
                    max(1, limit),
                )
            async with await self._connect() as connection:
                async with connection.cursor() as cursor:
                    if not has_structured_scope:
                        await cursor.execute("select set_config('hnsw.iterative_scan', 'strict_order', true)")
                        await cursor.execute("select set_config('hnsw.ef_search', '200', true)")
                    await cursor.execute(query, query_params)
                    rows = await cursor.fetchall()
        except RepositoryError:
            raise
        except (psycopg.Error, PoolTimeout) as exc:
            raise RepositoryError("vector candidate lookup failed") from exc

        candidates: list[CandidateRecord] = []
        for row in rows:
            distance = float(row["cosine_distance"])
            candidates.append(CandidateRecord(
                canonical_card_id=str(row["canonical_key"]),
                variant_id=str(row["variant_id"]),
                set_id=str(row["set_id"]),
                set_code=row["set_code"] and str(row["set_code"]),
                collector_number=str(row["collector_number"]),
                language_code=str(row["language_code"]),
                variant_code=str(row["variant_code"]),
                card_name=str(row["card_native_name"] or row["card_english_display_name"]),
                image_similarity=max(0.0, min(1.0, 1.0 - distance)),
                source="vector_lookup",
                reasons=["vector_candidate", f"index:{active_index.index_version}"],
            ))
        return candidates


class InMemoryRepository(CandidateRepository):
    def __init__(
        self,
        *,
        model: ModelRegistryEntry,
        structured_candidates: Iterable[CandidateRecord] = (),
        vector_candidates: Iterable[CandidateRecord] = (),
        private_scan_assets: Iterable[PrivateScanAsset] = (),
        ready_ok: bool = True,
    ):
        self.model = model
        self.structured_candidates = list(structured_candidates)
        self.vector_candidates = list(vector_candidates)
        self.private_scan_assets = list(private_scan_assets)
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
        collector_number: str | None = None,
        set_code: str | None = None,
    ) -> list[CandidateRecord]:
        return [
            candidate for candidate in self.vector_candidates
            if not language or language == "unknown" or candidate.language_code == language
        ][:limit]

    async def resolve_private_scan_asset(
        self,
        *,
        asset_id: str,
        user_id: str,
    ) -> PrivateScanAsset | None:
        return next((
            asset for asset in self.private_scan_assets
            if asset.asset_id == asset_id and asset.user_id == user_id
        ), None)
