#!/usr/bin/env python3
"""Materialize the reviewed English set-logo cohort from exact pinned sources.

The manifest is the authority. Downloads are accepted only when the decoded RGBA
pixels, dimensions and deterministic PNG encoding match the reviewed hashes.
This prevents upstream substitutions and keeps shared marks stored exactly once.
The offline ``--check`` path intentionally uses only the Python standard library
so it can run inside the normal Node-focused platform CI job.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "catalogue" / "official-english-set-logos.json"
REMOVED_DUPLICATE_CODES = {"pbl"}
EXPECTED_ASSET_COUNT = 15


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def pixel_sha256(image: Any) -> str:
    rgba = image.convert("RGBA")
    payload = rgba.width.to_bytes(4, "big") + rgba.height.to_bytes(4, "big") + rgba.tobytes()
    return sha256_bytes(payload)


def normalize_image(content: bytes) -> Any:
    # Pillow is needed only when intentionally materializing from the network.
    from PIL import Image

    with Image.open(io.BytesIO(content)) as opened:
        opened.load()
        image = opened.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def load_manifest() -> list[dict[str, Any]]:
    rows = json.loads(MANIFEST.read_text(encoding="utf-8"))
    if not isinstance(rows, list) or len(rows) != EXPECTED_ASSET_COUNT:
        raise ValueError(f"Expected {EXPECTED_ASSET_COUNT} canonical logo assets, found {len(rows) if isinstance(rows, list) else 'invalid'}")

    canonical_ids: set[str] = set()
    image_files: set[str] = set()
    codes: dict[str, str] = {}
    hashes: set[str] = set()
    pitch_black_rows = 0

    for row in rows:
        canonical = str(row.get("canonical_asset_id", "")).strip()
        image_file = str(row.get("image_file", "")).strip()
        file_hash = str(row.get("sha256", "")).lower().strip()
        source = str(row.get("retrieval_source_url", "")).strip()
        title = str(row.get("title", "")).strip()
        if not canonical or canonical in canonical_ids:
            raise ValueError(f"Duplicate or missing canonical_asset_id: {canonical!r}")
        if not image_file or image_file in image_files:
            raise ValueError(f"Duplicate or missing image_file for {canonical}: {image_file!r}")
        if len(file_hash) != 64 or any(ch not in "0123456789abcdef" for ch in file_hash):
            raise ValueError(f"Invalid SHA-256 for {canonical}")
        if file_hash in hashes:
            raise ValueError(f"Binary duplicate must map to one canonical asset: {canonical}")
        if not source.startswith("https://"):
            raise ValueError(f"Only HTTPS reviewed sources are allowed: {canonical}")
        if str(row.get("language", "")).lower() != "en":
            raise ValueError(f"Non-English asset in English manifest: {canonical}")
        if row.get("official_artwork_verified") is not True:
            raise ValueError(f"Asset not marked reviewed official artwork: {canonical}")
        if row.get("display_scope") != "in_app_set_identification":
            raise ValueError(f"Invalid display scope for {canonical}")
        if row.get("rights_status") != "owner_approved_controlled_display":
            raise ValueError(f"Missing owner controlled-display decision for {canonical}")
        if row.get("asset_type") not in {"official_logo", "official_shared_logo"}:
            raise ValueError(f"Unsupported asset type for {canonical}")
        if not row.get("codes") or not row.get("names"):
            raise ValueError(f"Missing identity aliases for {canonical}")
        if title == "Pitch Black":
            pitch_black_rows += 1
            if canonical != "me5":
                raise ValueError("Pitch Black must use the existing Stackr canonical identity me5")
        for raw_code in row.get("codes", []):
            code = str(raw_code).strip().lower()
            if not code or code in REMOVED_DUPLICATE_CODES:
                raise ValueError(f"Removed or invalid code present: {raw_code!r}")
            owner = codes.get(code)
            if owner and owner != canonical:
                raise ValueError(f"Code {raw_code!r} maps to both {owner} and {canonical}")
            codes[code] = canonical
        canonical_ids.add(canonical)
        image_files.add(image_file)
        hashes.add(file_hash)

    if pitch_black_rows != 1:
        raise ValueError(f"Expected one Pitch Black canonical asset, found {pitch_black_rows}")
    return rows


def encode_png(image: Any) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()


def build_network_session() -> Any:
    # Requests is also optional for the offline verifier.
    import requests

    session = requests.Session()
    session.headers.update({
        "User-Agent": "Stackr-official-English-set-logo-materializer/1.0",
        "Accept": "image/avif,image/webp,image/png,image/*,*/*;q=0.8",
    })
    return session


def materialize(rows: list[dict[str, Any]], *, check: bool) -> None:
    session = None if check else build_network_session()
    failures: list[str] = []

    for row in rows:
        canonical = row["canonical_asset_id"]
        destination = ROOT / row["image_file"]
        expected_file_hash = row["sha256"].lower()
        expected_pixel_hash = row["pixel_sha256"].lower()
        expected_size = (int(row["width"]), int(row["height"]))

        if destination.exists():
            existing = destination.read_bytes()
            if sha256_bytes(existing) == expected_file_hash:
                print(f"ok existing {canonical}: {destination.relative_to(ROOT)}")
                continue
            if check:
                failures.append(f"{canonical}: existing file hash mismatch")
                continue

        if check:
            failures.append(f"{canonical}: missing {destination.relative_to(ROOT)}")
            continue

        try:
            assert session is not None
            response = session.get(row["retrieval_source_url"], timeout=60)
            response.raise_for_status()
            image = normalize_image(response.content)
            if image.size != expected_size:
                raise ValueError(f"dimensions {image.size} != {expected_size}")
            actual_pixel_hash = pixel_sha256(image)
            if actual_pixel_hash != expected_pixel_hash:
                raise ValueError(f"pixel SHA-256 {actual_pixel_hash} != {expected_pixel_hash}")
            encoded = encode_png(image)
            actual_file_hash = sha256_bytes(encoded)
            if actual_file_hash != expected_file_hash:
                raise ValueError(f"PNG SHA-256 {actual_file_hash} != {expected_file_hash}")
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(encoded)
            print(f"materialized {canonical}: {destination.relative_to(ROOT)}")
        except Exception as exc:  # keep complete evidence for the bounded cohort
            failures.append(f"{canonical}: {exc}")

    if failures:
        raise RuntimeError("Official English set-logo materialization failed:\n- " + "\n- ".join(failures))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Validate committed assets without network access or third-party Python packages")
    args = parser.parse_args()
    rows = load_manifest()
    materialize(rows, check=args.check)
    print(f"Validated {len(rows)} canonical official English logo assets")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
