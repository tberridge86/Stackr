"""Retrieve and safely extract the fixed release archive; no artwork-provider calls."""
import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

ASSET_ID = 637933079
ARCHIVE_BYTES = 5828179
ARCHIVE_SHA = "de494b5c6a98b462db09738034df10c7deef226f552283354008dd9cf1056fd7"
PLAN_SHA = "0a0417e1afbfb0176ef8ac55b184247efd3b255711e2f3e2497cd22a15313b6a"
METADATA = {"manifest.json", "receipts/preparation-summary.json", "receipts/current-card-bindings.json"}


def expected_objects():
    data = Path(__file__).with_name("plan.json").read_bytes()
    if hashlib.sha256(data).hexdigest() != PLAN_SHA:
        raise ValueError("Frozen plan changed")
    plan = json.loads(data)
    return {o["file"]: o for row in plan["rows"] for o in row["objects"]}


def validate_entries(entries, expected):
    names = [info.filename for info in entries]
    if len(names) != 43 or len(set(names)) != 43 or set(names) != set(expected) | METADATA:
        raise ValueError("Unexpected or duplicate archive entries")
    if sum(info.file_size for info in entries) > 64000000:
        raise ValueError("Oversized expanded archive")
    for info in entries:
        name = info.filename
        parts = PurePosixPath(name).parts
        mode = (info.external_attr >> 16) & 0o170000
        if not parts or PurePosixPath(name).is_absolute() or ".." in parts or "\\" in name or ":" in name or info.is_dir() or mode not in (0, 0o100000) or info.flag_bits & 1:
            raise ValueError("Unsafe archive entry")
        if info.file_size <= 0 or info.file_size >= 12000000:
            raise ValueError("Oversized archive member")
        if name in expected and info.file_size != expected[name]["byte_size"]:
            raise ValueError("Member size changed")


def extract(archive, target):
    if archive.stat().st_size != ARCHIVE_BYTES or hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA:
        raise ValueError("Frozen archive checksum mismatch")
    expected = expected_objects()
    if target.is_symlink():
        raise ValueError("Unsafe extraction directory")
    target.mkdir(parents=True, exist_ok=True)
    resolved_target = target.resolve()
    with zipfile.ZipFile(archive) as z:
        entries = z.infolist()
        validate_entries(entries, expected)
        for info in entries:
            destination = target / info.filename
            if destination.is_symlink() or not destination.resolve().is_relative_to(resolved_target):
                raise ValueError("Escaped package path")
            # At most one bounded image is buffered; validate all frozen file
            # checksums before replacing any extracted files.
            data = z.read(info)
            if info.filename in expected:
                obj = expected[info.filename]
                if len(data) != obj["byte_size"] or hashlib.sha256(data).hexdigest() != obj["sha256"]:
                    raise ValueError("Frozen image checksum mismatch")
        for info in entries:
            destination = target / info.filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            partial = destination.with_name(destination.name + ".partial")
            if partial.is_symlink():
                raise ValueError("Unsafe extraction temporary file")
            with z.open(info) as source, partial.open("wb") as output:
                shutil.copyfileobj(source, output, 65536)
            partial.replace(destination)


def download(root, local_archive=None):
    root.mkdir(parents=True, exist_ok=True)
    archive = Path(local_archive) if local_archive else root / f"{ASSET_ID}.zip"
    if not archive.exists():
        if local_archive:
            raise ValueError("Local archive missing")
        partial = archive.with_suffix(".partial")
        with partial.open("wb") as output:
            subprocess.run(["gh", "api", f"repos/tberridge86/Stackr/releases/assets/{ASSET_ID}", "-H", "Accept: application/octet-stream"], stdout=output, check=True, timeout=180)
        partial.replace(archive)
    extract(archive, root / str(ASSET_ID))
    return {"asset_id": ASSET_ID, "sha256": ARCHIVE_SHA, "bytes": ARCHIVE_BYTES, "files": 43, "status": "verified_and_extracted", "provider_requests": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("packages", type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    print(json.dumps(download(args.packages, args.archive)))
