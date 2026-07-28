from __future__ import annotations

from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "20260728152412_recognition_service_scan_diagnostics.sql"


def test_diagnostics_migration_is_private_and_minimised():
    sql = MIGRATION.read_text(encoding="utf8")
    assert "create table if not exists ml.recognition_scan_diagnostics" in sql
    assert "alter table ml.recognition_scan_diagnostics enable row level security" in sql
    assert "to service_role" in sql
    assert "from anon, authenticated" in sql
    assert "image_storage_key_hash" in sql
    assert "raw OCR text" in sql
    assert "base64" in sql
    assert "grant select, insert, update, delete on table ml.recognition_scan_diagnostics to authenticated" not in sql
