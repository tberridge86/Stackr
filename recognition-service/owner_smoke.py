"""Local artifact/runtime smoke, not a real-device accuracy benchmark."""
import argparse
import json
from pathlib import Path

from app.owner_siglip import OwnerSiglip

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("image", type=Path)
parser.add_argument("--expected-variant-id")
arguments = parser.parse_args()
engine = OwnerSiglip.load()
result = engine.identify(arguments.image.read_bytes())
result["validationScope"] = "local_reference_or_synthetic_runtime_smoke_not_real_device_accuracy"
if arguments.expected_variant_id:
    result["expectedVariantInTop5"] = any(row["variantId"] == arguments.expected_variant_id for row in result["candidates"])
print(json.dumps(result, indent=2))
if arguments.expected_variant_id and not result["expectedVariantInTop5"]:
    raise SystemExit(1)
