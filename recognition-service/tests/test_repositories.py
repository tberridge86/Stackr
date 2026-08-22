from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

from app.repositories import (
    ActiveIndexEntry,
    RepositoryError,
    StackrApiRepository,
    _catalogue_language_code,
    _vector_literal,
)
from app.settings import Settings


class FakeCursor:
    def __init__(self, *, rows=None):
        self.rows = list(rows or [])
        self.query = None
        self.params = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def execute(self, query, params=None):
        self.query = query
        self.params = params

    async def fetchall(self):
        return self.rows

    async def fetchone(self):
        return self.rows[0] if self.rows else None


class FakeConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    def cursor(self):
        return self._cursor


class FakePool:
    def __init__(self):
        self.closed = True
        self.open_calls = []
        self.close_calls = []

    async def open(self, *, wait, timeout):
        self.open_calls.append((wait, timeout))
        self.closed = False

    async def close(self, *, timeout):
        self.close_calls.append(timeout)
        self.closed = True


def repository() -> StackrApiRepository:
    return StackrApiRepository(Settings(
        model_version="model-v1",
        model_embedding_dimensions=4,
        active_index_version="index-v1",
        database_url="postgresql://test:test@localhost/test",
        catalogue_api_url="https://catalogue.example.test",
    ))


def test_catalogue_language_mapping_matches_database_codes():
    assert _catalogue_language_code("zh-Hans") == "zh-cn"
    assert _catalogue_language_code("zh-Hant") == "zh-tw"
    assert _catalogue_language_code("ja") == "ja"
    assert _catalogue_language_code("unknown") is None


def test_repository_pool_opens_and_closes_with_service_lifecycle(monkeypatch):
    pool = FakePool()
    pool_options = {}

    def create_pool(**options):
        pool_options.update(options)
        return pool

    monkeypatch.setattr("app.repositories.AsyncConnectionPool", create_pool)
    repo = StackrApiRepository(Settings(
        database_url="postgresql://test:test@localhost/test",
        concurrency_hint=3,
    ))

    asyncio.run(repo.open())
    asyncio.run(repo.close())

    assert pool_options["open"] is False
    assert pool_options["min_size"] == 1
    assert pool_options["max_size"] == 3
    assert pool.open_calls == [(True, 10.0)]
    assert pool.close_calls == [5.0]


def test_vector_literal_rejects_non_finite_values():
    assert _vector_literal([1.0, 0.0]) == "[1,0]"
    with pytest.raises(RepositoryError, match="invalid numeric"):
        _vector_literal([float("nan")])


def test_exact_lookup_maps_detected_chinese_language_to_catalogue_code(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 200

        @staticmethod
        def json():
            return {"data": {"results": []}}

    class FakeClient:
        def __init__(self, **_options):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, traceback):
            return False

        async def get(self, url, *, params, headers):
            captured.update({"url": url, "params": params, "headers": headers})
            return FakeResponse()

    monkeypatch.setattr("app.repositories.httpx.AsyncClient", FakeClient)

    result = asyncio.run(repository().exact_lookup(
        collector_number="035/151",
        set_code="151c",
        card_name=None,
        language="zh-Hans",
        limit=12,
    ))

    assert result == []
    assert captured["params"]["language"] == "zh-cn"


def test_model_stays_inactive_without_explicit_index_selection():
    repo = StackrApiRepository(Settings(
        model_version="model-v1",
        model_embedding_dimensions=4,
        active_index_version=None,
        database_url="postgresql://test:test@localhost/test",
        catalogue_api_url="https://catalogue.example.test",
        require_active_index=True,
    ))

    model = asyncio.run(repo.get_model("model-v1"))

    assert model is not None
    assert model.active is False
    assert model.index_version is None


def test_model_stays_inactive_when_configured_index_is_not_active_in_database(monkeypatch):
    repo = repository()
    cursor = FakeCursor(rows=[{
        "model_id": "model-v1",
        "embedding_dimensions": 4,
        "selection_status": "active",
        "license_status": "production_allowed",
        "index_version": None,
    }])
    monkeypatch.setattr(repo, "_connect", AsyncMock(return_value=FakeConnection(cursor)))

    model = asyncio.run(repo.get_model("model-v1"))

    assert model is not None
    assert model.active is False
    assert model.index_version is None
    assert "status = 'active'" in cursor.query


def test_vector_lookup_uses_active_index_and_maps_card_metadata(monkeypatch):
    repo = repository()
    active_index = ActiveIndexEntry(
        id="11111111-1111-4111-8111-111111111111",
        index_version="index-v1",
        vector_table_name="card_embeddings_model_v1_4",
        embedding_dimensions=4,
        language_code="zh-cn",
    )
    monkeypatch.setattr(repo, "_active_index", AsyncMock(return_value=active_index))
    cursor = FakeCursor(rows=[{
        "canonical_key": "pokemon:zh-cn:set:001:holo",
        "variant_id": "22222222-2222-4222-8222-222222222222",
        "set_id": "33333333-3333-4333-8333-333333333333",
        "set_code": "CSM2a",
        "collector_number": "001/151",
        "language_code": "zh-cn",
        "variant_code": "holo",
        "card_native_name": "Test Card",
        "card_english_display_name": None,
        "cosine_distance": 0.04,
    }])
    monkeypatch.setattr(repo, "_connect", AsyncMock(return_value=FakeConnection(cursor)))

    result = asyncio.run(repo.vector_lookup(
        embedding=[1.0, 0.0, 0.0, 0.0],
        model_version="model-v1",
        language="zh-Hans",
        limit=12,
    ))

    assert len(result) == 1
    assert result[0].canonical_card_id == "pokemon:zh-cn:set:001:holo"
    assert result[0].variant_id == "22222222-2222-4222-8222-222222222222"
    assert result[0].image_similarity == pytest.approx(0.96)
    assert result[0].source == "vector_lookup"
    assert "OPERATOR(extensions.<=>)" in cursor.query.as_string()
    assert "::extensions.vector" in cursor.query.as_string()
    assert "cv.status = 'published'" in cursor.query.as_string()
    assert cursor.params == (
        "[1,0,0,0]",
        "model-v1",
        active_index.id,
        "zh-cn",
        "zh-cn",
        12,
    )


def test_vector_lookup_pushes_verified_set_and_collector_scope_before_ranking(monkeypatch):
    repo = repository()
    active_index = ActiveIndexEntry(
        id="11111111-1111-4111-8111-111111111111",
        index_version="index-v1",
        vector_table_name="card_embeddings_model_v1_4",
        embedding_dimensions=4,
        language_code="zh-cn",
    )
    monkeypatch.setattr(repo, "_active_index", AsyncMock(return_value=active_index))
    cursor = FakeCursor(rows=[])
    monkeypatch.setattr(repo, "_connect", AsyncMock(return_value=FakeConnection(cursor)))

    asyncio.run(repo.vector_lookup(
        embedding=[1.0, 0.0, 0.0, 0.0],
        model_version="model-v1",
        language="zh-Hans",
        set_code="151C",
        collector_number="035/151",
        limit=12,
    ))

    query = cursor.query.as_string()
    assert "with eligible as materialized" in query
    assert "lower(c.set_code) = lower(%s)" in query
    assert "regexp_replace(split_part(lower(c.collector_number)" in query
    assert "cv.status = 'published'" in query
    assert query.index("from eligible") < query.index("order by cosine_distance")
    assert cursor.params == (
        "model-v1",
        active_index.id,
        "zh-cn",
        "zh-cn",
        "151C",
        "151C",
        "035/151",
        "035/151",
        "[1,0,0,0]",
        12,
    )


def test_vector_lookup_returns_no_candidates_without_active_index(monkeypatch):
    repo = repository()
    monkeypatch.setattr(repo, "_active_index", AsyncMock(return_value=None))

    result = asyncio.run(repo.vector_lookup(
        embedding=[1.0, 0.0, 0.0, 0.0],
        model_version="model-v1",
        language="ja",
        limit=10,
    ))

    assert result == []


def test_unknown_language_prefers_the_global_active_index(monkeypatch):
    repo = repository()
    cursor = FakeCursor(rows=[{
        "id": "11111111-1111-4111-8111-111111111111",
        "index_version": "index-v1",
        "vector_table_name": "card_embeddings_model_v1_4",
        "embedding_dimensions": 4,
        "language_code": None,
    }])
    monkeypatch.setattr(repo, "_connect", AsyncMock(return_value=FakeConnection(cursor)))

    result = asyncio.run(repo._active_index(model_version="model-v1", language="unknown"))

    assert result is not None
    assert result.language_code is None
    assert cursor.params == ("model-v1", "index-v1", "index-v1", None, None, None)
    assert "%s::text is null" in cursor.query
    assert "(i.language_code is null) desc" in cursor.query


def test_vector_lookup_rejects_active_index_dimension_mismatch(monkeypatch):
    repo = repository()
    monkeypatch.setattr(repo, "_active_index", AsyncMock(return_value=ActiveIndexEntry(
        id="11111111-1111-4111-8111-111111111111",
        index_version="index-v1",
        vector_table_name="card_embeddings_model_v1_384",
        embedding_dimensions=384,
        language_code=None,
    )))

    with pytest.raises(RepositoryError, match="dimension"):
        asyncio.run(repo.vector_lookup(
            embedding=[1.0, 0.0, 0.0, 0.0],
            model_version="model-v1",
            language="unknown",
            limit=10,
        ))


def test_private_scan_asset_is_resolved_only_for_its_owner(monkeypatch):
    repo = repository()
    asset_id = "11111111-1111-4111-8111-111111111111"
    user_id = "22222222-2222-4222-8222-222222222222"
    cursor = FakeCursor(rows=[{
        "asset_id": asset_id,
        "created_by": user_id,
        "storage_bucket": "stackr-scan-temp",
        "storage_key": "users/owner/card.jpg",
    }])
    monkeypatch.setattr(repo, "_connect", AsyncMock(return_value=FakeConnection(cursor)))

    result = asyncio.run(repo.resolve_private_scan_asset(asset_id=asset_id, user_id=user_id))

    assert result is not None
    assert result.storage_key == "users/owner/card.jpg"
    assert cursor.params == (asset_id, user_id)
    assert "ml.resolve_private_scan_asset" in cursor.query


def test_private_scan_asset_rejects_non_uuid_identifiers():
    repo = repository()

    result = asyncio.run(repo.resolve_private_scan_asset(asset_id="../../other-user/card.jpg", user_id="invalid"))

    assert result is None
