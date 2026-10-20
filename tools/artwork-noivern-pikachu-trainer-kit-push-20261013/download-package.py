"""Retrieve one frozen Noivern/Pikachu release using accepted archive guards."""
import argparse
import hashlib
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

PLAN_SHA = "f352c01af18d9f11695ec40f5f62db4d391f321d769508d5dd95de9e96dd8ac5"
sys.dont_write_bytecode = True  # Imported accepted helpers remain read-only.
shared_path = Path(__file__).resolve().parent.parent / "artwork-latios-trainer-kit-push-20261013" / "download-package.py"
spec = importlib.util.spec_from_file_location("stackr_guarded_artwork_archive", shared_path)
shared = importlib.util.module_from_spec(spec)
spec.loader.exec_module(shared)
METADATA = shared.METADATA
validate_entries = shared.validate_entries
file_hash = shared.file_hash


def load_plan():
    data = Path(__file__).with_name("plan.json").read_bytes()
    if hashlib.sha256(data).hexdigest() != PLAN_SHA:
        raise ValueError("Frozen Noivern/Pikachu plan changed")
    plan = json.loads(data)
    if not 0 < len(plan["rows"]) <= 53 or plan["archive"]["file_count"] != len(shared.expected_objects(plan)) + len(METADATA):
        raise ValueError("Frozen cohort size changed")
    return plan


def expected_objects(plan=None):
    return shared.expected_objects(plan if plan is not None else load_plan())


def extract(archive, target, plan=None):
    return shared.extract(archive, target, plan if plan is not None else load_plan())


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
