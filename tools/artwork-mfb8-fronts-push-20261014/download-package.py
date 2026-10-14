"""Retrieve this byte-frozen English unnumbered My First Battle8 batch release; no artwork-provider requests."""
import argparse
import hashlib
import json
import shutil
import subprocess
import zipfile
from pathlib import Path, PurePosixPath

PLAN_SHA = "1ca4f1f3243629478779473b6ded41d9ef03e0731bb817fa4253406eff0ff362"
METADATA = {"manifest.json", "receipts/preparation-summary.json", "receipts/current-card-bindings.json", "receipts/finite-decision.json"}


def load_plan():
    data = Path(__file__).with_name("plan.json").read_bytes()
    if hashlib.sha256(data).hexdigest() != PLAN_SHA:
        raise ValueError("Frozen plan changed")
    plan = json.loads(data)
    if len(plan["rows"]) != 8 or plan["archive"]["file_count"] != len(expected_objects(plan)) + len(METADATA):
        raise ValueError("Frozen cohort size changed")
    return plan


def expected_objects(plan=None):
    plan = plan if plan is not None else load_plan()
    expected = {}
    for row in plan["rows"]:
        if len(row["objects"]) != 4:
            raise ValueError("Frozen image reference count changed")
        for obj in row["objects"]:
            if obj["file"] in expected and expected[obj["file"]] != obj:
                raise ValueError("Incompatible immutable object path alias")
            expected[obj["file"]] = obj
    return expected


def file_hash(file):
    digest = hashlib.sha256()
    with file.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_entries(entries, expected):
    names = [info.filename for info in entries]
    if len(names) != len(expected) + len(METADATA) or len(set(names)) != len(names) or set(names) != set(expected) | METADATA:
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


def extract(archive, target, plan=None):
    plan = plan if plan is not None else load_plan()
    frozen = plan["archive"]
    if archive.stat().st_size != frozen["byte_size"] or file_hash(archive) != frozen["sha256"]:
        raise ValueError("Frozen archive checksum mismatch")
    expected = expected_objects(plan)
    metadata = {entry["file"]: entry for entry in plan["archive_metadata"]}
    if set(metadata) != METADATA:
        raise ValueError("Frozen metadata scope changed")
    if target.is_symlink():
        raise ValueError("Unsafe extraction directory")
    target.mkdir(parents=True, exist_ok=True)
    resolved_target = target.resolve()
    with zipfile.ZipFile(archive) as bundle:
        entries = bundle.infolist()
        validate_entries(entries, expected)
        for info in entries:
            destination = target / info.filename
            if destination.is_symlink() or not destination.resolve().is_relative_to(resolved_target):
                raise ValueError("Escaped package path")
            # Verify every image before replacing files; memory holds one image.
            data = bundle.read(info)
            if info.filename in expected:
                obj = expected[info.filename]
                if len(data) != obj["byte_size"] or hashlib.sha256(data).hexdigest() != obj["sha256"]:
                    raise ValueError("Frozen image checksum mismatch")
            else:
                pinned = metadata[info.filename]
                if len(data) != pinned["byte_size"] or hashlib.sha256(data).hexdigest() != pinned["sha256"]:
                    raise ValueError("Frozen metadata bytes changed")
        for info in entries:
            destination = target / info.filename
            destination.parent.mkdir(parents=True, exist_ok=True)
            partial = destination.with_name(destination.name + ".partial")
            if partial.is_symlink():
                raise ValueError("Unsafe extraction temporary file")
            with bundle.open(info) as source, partial.open("wb") as output:
                shutil.copyfileobj(source, output, 65536)
            partial.replace(destination)


def download(root, local_archive=None):
    plan = load_plan()
    frozen = plan["archive"]
    if frozen["byte_size"] <= 0 or frozen["byte_size"] > 64000000:
        raise ValueError("Unbounded archive")
    root.mkdir(parents=True, exist_ok=True)
    archive = Path(local_archive) if local_archive else root / f"{frozen['id']}.zip"
    if not archive.exists():
        if local_archive:
            raise ValueError("Local archive missing")
        partial = archive.with_suffix(".partial")
        with partial.open("wb") as output:
            subprocess.run(["gh", "api", f"repos/tberridge86/Stackr/releases/assets/{frozen['id']}", "-H", "Accept: application/octet-stream"], stdout=output, check=True, timeout=180)
        partial.replace(archive)
    extract(archive, root / str(frozen["id"]), plan)
    return {"asset_id": frozen["id"], "sha256": frozen["sha256"], "bytes": frozen["byte_size"], "files": frozen["file_count"], "status": "verified_and_extracted", "provider_requests": 0}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("packages", type=Path)
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args()
    print(json.dumps(download(args.packages, args.archive)))
