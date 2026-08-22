from __future__ import annotations

import asyncio

import httpx
import pytest

from app.settings import Settings
from app.storage import StorageError, SupabaseStorageClient


class FailingClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def get(self, url, headers):
        raise httpx.UnsupportedProtocol("bad URL")


def test_storage_transport_errors_are_controlled(monkeypatch):
    settings = Settings(
        supabase_url="https://project.supabase.co",
        supabase_service_role_key="service-role-key",
    )
    client = SupabaseStorageClient(settings)
    monkeypatch.setattr("app.storage.httpx.AsyncClient", FailingClient)

    with pytest.raises(StorageError, match="private storage request failed"):
        asyncio.run(client.read_private_object("private/u/test/scan.jpg"))
