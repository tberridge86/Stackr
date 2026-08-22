from __future__ import annotations

from pathlib import Path

import httpx

from .settings import Settings


class StorageError(RuntimeError):
    pass


class StorageClient:
    async def read_private_object(self, key: str, *, bucket: str | None = None) -> bytes:
        raise NotImplementedError


class LocalStorageClient(StorageClient):
    def __init__(self, root: Path):
        self.root = root.resolve()

    async def read_private_object(self, key: str, *, bucket: str | None = None) -> bytes:
        candidate = (self.root / key).resolve()
        if not str(candidate).startswith(str(self.root)):
            raise StorageError("image key escapes local storage root")
        if not candidate.exists() or not candidate.is_file():
            raise StorageError("private image key not found")
        return candidate.read_bytes()


class SupabaseStorageClient(StorageClient):
    def __init__(self, settings: Settings):
        if not settings.supabase_url or not settings.service_role_secret:
            raise StorageError("Supabase storage credentials are not configured")
        self.settings = settings

    async def read_private_object(self, key: str, *, bucket: str | None = None) -> bytes:
        storage_bucket = bucket or self.settings.fallback_storage_bucket
        url = (
            f"{self.settings.supabase_url.rstrip('/')}/storage/v1/object/"
            f"{storage_bucket}/{key.lstrip('/')}"
        )
        headers = {
            "apikey": self.settings.service_role_secret or "",
            "Authorization": f"Bearer {self.settings.service_role_secret or ''}",
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                response = await client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise StorageError("private storage request failed") from exc
        if response.status_code == 404:
            raise StorageError("private image key not found")
        if response.status_code >= 400:
            raise StorageError(f"storage fetch failed:{response.status_code}")
        return response.content


class NullStorageClient(StorageClient):
    async def read_private_object(self, key: str, *, bucket: str | None = None) -> bytes:
        raise StorageError("storage client is not configured")


def build_storage_client(settings: Settings) -> StorageClient:
    if settings.local_storage_root:
        return LocalStorageClient(settings.local_storage_root)
    if settings.supabase_url and settings.service_role_secret:
        return SupabaseStorageClient(settings)
    return NullStorageClient()
