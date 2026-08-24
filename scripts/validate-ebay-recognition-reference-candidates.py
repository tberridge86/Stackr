from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import Counter
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MODEL_ID = "dinov2_vits14"
MODEL_DIMENSIONS = 384
STAGING_PROJECT_REF = "lmwfhvexfcoyeuoyrlco"
PREPARED_SCHEMA = "stackr-ebay-recognition-reference-preparation-v1.0.0"
APPROVED_SCHEMA = "stackr-ebay-recognition-reference-approval-v1.0.0"
PREPROCESSING_SPEC = {
    "colorMode": "RGB",
    "embeddingNormalisation": "l2",
    "exifTranspose": True,
    "fit": "ImageOps.fit",
    "height": 224,
    "imageNetMean": [0.485, 0.456, 0.406],
    "imageNetStd": [0.229, 0.224, 0.225],
    "layout": "NCHW",
    "pixelNormalisation": "uint8_to_float32_div_255_then_imagenet_zscore",
    "resampling": "bicubic",
    "width": 224,
}
PREPROCESSING_SHA256 = hashlib.sha256(
    json.dumps(PREPROCESSING_SPEC, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
).hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_manifest(value: dict[str, Any], schema: str) -> None:
    if value.get("schemaVersion") != schema:
        raise RuntimeError(f"expected manifest schema {schema}")
    claimed = str(value.get("manifestSha256") or "")
    body = {key: item for key, item in value.items() if key != "manifestSha256"}
    if sha256_bytes(canonical_json(body)) != claimed:
        raise RuntimeError("prepared manifest SHA-256 verification failed")
    if value.get("projectRef") != STAGING_PROJECT_REF or value.get("productionModified") is not False:
        raise RuntimeError("prepared manifest is not restricted to Stackr staging")


def hamming_hex(left: str, right: str) -> int | None:
    if not left or len(left) != len(right):
        return None
    try:
        return (int(left, 16) ^ int(right, 16)).bit_count()
    except ValueError:
        return None


@dataclass(frozen=True)
class EmbeddedCandidate:
    payload: dict[str, Any]
    vector: Any


class Dinov2Embedder:
    def __init__(self, hub_repo: Path, checkpoint: Path, expected_sha256: str, device: str):
        import torch

        if sha256_file(checkpoint) != expected_sha256:
            raise RuntimeError("DINOv2 checkpoint SHA-256 does not match the approved value")
        requested = device
        if requested == "auto":
            requested = "cuda" if torch.cuda.is_available() else "cpu"
        if requested == "cuda" and not torch.cuda.is_available():
            raise RuntimeError("CUDA was requested but is unavailable")
        self.torch = torch
        self.device = torch.device(requested)
        model = torch.hub.load(str(hub_repo), MODEL_ID, source="local", pretrained=False)
        state = torch.load(checkpoint, map_location="cpu", weights_only=True)
        result = model.load_state_dict(state, strict=True)
        if result.missing_keys or result.unexpected_keys:
            raise RuntimeError("DINOv2 checkpoint does not match the pinned model architecture")
        torch.manual_seed(12012)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(12012)
        torch.backends.cudnn.benchmark = False
        torch.backends.cudnn.deterministic = True
        self.model = model.eval().to(self.device)
        self.mean = torch.tensor(PREPROCESSING_SPEC["imageNetMean"], dtype=torch.float32).view(1, 3, 1, 1).to(self.device)
        self.std = torch.tensor(PREPROCESSING_SPEC["imageNetStd"], dtype=torch.float32).view(1, 3, 1, 1).to(self.device)

    def embed(self, candidates: list[dict[str, Any]], batch_size: int) -> list[EmbeddedCandidate]:
        import numpy as np
        from PIL import Image, ImageOps

        output: list[EmbeddedCandidate] = []
        for offset in range(0, len(candidates), batch_size):
            batch = candidates[offset : offset + batch_size]
            arrays = []
            for candidate in batch:
                image_path = Path(candidate["imagePath"])
                if sha256_file(image_path) != candidate["rectifiedSha256"]:
                    raise RuntimeError(f"candidate image checksum changed: {image_path}")
                with Image.open(image_path) as opened:
                    image = ImageOps.exif_transpose(opened).convert("RGB")
                    fitted = ImageOps.fit(image, (224, 224), method=Image.Resampling.BICUBIC)
                    arrays.append(np.transpose(np.asarray(fitted, dtype=np.float32) / 255.0, (2, 0, 1)))
            pixels = self.torch.from_numpy(np.stack(arrays)).to(self.device)
            pixels = (pixels - self.mean) / self.std
            with self.torch.inference_mode():
                vectors = self.model(pixels)
                vectors = self.torch.nn.functional.normalize(vectors.float(), p=2, dim=1)
            vectors_np = vectors.cpu().numpy().astype(np.float32)
            for candidate, vector in zip(batch, vectors_np, strict=True):
                norm = float(np.linalg.norm(vector))
                if vector.size != MODEL_DIMENSIONS or not np.all(np.isfinite(vector)):
                    raise RuntimeError("DINOv2 returned an invalid candidate vector")
                if not 0.999 <= norm <= 1.001:
                    raise RuntimeError(f"DINOv2 returned an invalid norm: {norm}")
                output.append(EmbeddedCandidate(candidate, vector))
        return output


def cosine(left: Any, right: Any) -> float:
    import numpy as np

    value = float(np.dot(left, right))
    if not math.isfinite(value):
        raise RuntimeError("non-finite DINOv2 consensus similarity")
    return value


def independent_pair(left: dict[str, Any], right: dict[str, Any], perceptual_floor: int) -> bool:
    if left["sourceItemId"] == right["sourceItemId"]:
        return False
    if left["sourceImageSha256"] == right["sourceImageSha256"]:
        return False
    if left["rectifiedSha256"] == right["rectifiedSha256"]:
        return False
    distance = hamming_hex(left.get("rectifiedPerceptualHash", ""), right.get("rectifiedPerceptualHash", ""))
    return distance is None or distance >= perceptual_floor


def choose_consensus(
    candidates: list[EmbeddedCandidate],
    similarity_threshold: float,
    perceptual_floor: int,
) -> tuple[dict[str, Any] | None, dict[str, Any]]:
    pairs: list[tuple[float, EmbeddedCandidate, EmbeddedCandidate, int | None]] = []
    for left_index, left in enumerate(candidates):
        for right in candidates[left_index + 1 :]:
            if not independent_pair(left.payload, right.payload, perceptual_floor):
                continue
            distance = hamming_hex(
                left.payload.get("rectifiedPerceptualHash", ""),
                right.payload.get("rectifiedPerceptualHash", ""),
            )
            pairs.append((cosine(left.vector, right.vector), left, right, distance))
    pairs.sort(
        key=lambda item: (
            -item[0],
            item[1].payload["sourceItemId"],
            item[2].payload["sourceItemId"],
        )
    )
    if not pairs:
        return None, {"status": "rejected", "reason": "independent_visual_pair_missing", "pairCount": 0}
    best_similarity, left, right, perceptual_distance = pairs[0]
    consensus = {
        "status": "accepted" if best_similarity >= similarity_threshold else "rejected",
        "reason": None if best_similarity >= similarity_threshold else "visual_consensus_below_threshold",
        "similarity": round(best_similarity, 6),
        "threshold": similarity_threshold,
        "pairCount": len(pairs),
        "sourceItemIds": [left.payload["sourceItemId"], right.payload["sourceItemId"]],
        "sourceImageSha256s": [left.payload["sourceImageSha256"], right.payload["sourceImageSha256"]],
        "perceptualHashDistance": perceptual_distance,
        "independentListingImages": True,
    }
    if best_similarity < similarity_threshold:
        return None, consensus
    selected = sorted(
        (left.payload, right.payload),
        key=lambda item: (-float(item["localisation"]["confidence"]["score"]), item["rectifiedSha256"]),
    )[0]
    return selected, consensus


def quantiles(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"min": None, "p25": None, "median": None, "p75": None, "max": None}
    ordered = sorted(values)

    def at(ratio: float) -> float:
        index = round((len(ordered) - 1) * ratio)
        return round(ordered[index], 6)

    return {"min": at(0), "p25": at(0.25), "median": at(0.5), "p75": at(0.75), "max": at(1)}


def validate(args: argparse.Namespace) -> dict[str, Any]:
    prepared_path = args.prepared.resolve()
    prepared = json.loads(prepared_path.read_text(encoding="utf-8"))
    verify_manifest(prepared, PREPARED_SCHEMA)
    candidate_groups = prepared.get("candidates")
    if not isinstance(candidate_groups, list) or not candidate_groups:
        raise RuntimeError("prepared manifest contains no candidate groups")
    all_candidates = [image for group in candidate_groups for image in group.get("images", [])]
    if not all_candidates:
        raise RuntimeError("prepared manifest contains no candidate images")
    embedder = Dinov2Embedder(args.torch_hub_repo.resolve(), args.model_checkpoint.resolve(), args.model_sha256, args.device)
    embedded = embedder.embed(all_candidates, args.batch_size)
    by_sha = {item.payload["rectifiedSha256"]: item for item in embedded}
    promotions = []
    exclusions = []
    best_similarities = []
    selected_hashes: dict[str, str] = {}
    for group in candidate_groups:
        group_embedded = [by_sha[item["rectifiedSha256"]] for item in group.get("images", [])]
        selected, consensus = choose_consensus(group_embedded, args.similarity_threshold, args.perceptual_hash_distance_floor)
        if consensus.get("similarity") is not None:
            best_similarities.append(float(consensus["similarity"]))
        if selected is None:
            exclusions.append({"variantId": group["variantId"], **consensus})
            continue
        duplicate_variant = selected_hashes.get(selected["rectifiedSha256"])
        if duplicate_variant and duplicate_variant != group["variantId"]:
            exclusions.append({
                "variantId": group["variantId"],
                "status": "rejected",
                "reason": "cross_variant_duplicate_rectified_image",
                "otherVariantId": duplicate_variant,
            })
            continue
        selected_hashes[selected["rectifiedSha256"]] = group["variantId"]
        promotions.append({
            "variantId": group["variantId"],
            "fingerprint": group["fingerprint"],
            "selectedCandidate": selected,
            "consensus": consensus,
        })
    language_counts = dict(sorted(Counter(item["fingerprint"]["languageCode"] for item in promotions).items()))
    body = {
        "schemaVersion": APPROVED_SCHEMA,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "projectRef": STAGING_PROJECT_REF,
        "productionModified": False,
        "status": "validated_inactive",
        "commitEligible": len(promotions) > 0,
        "preparedManifestPath": str(prepared_path),
        "preparedManifestSha256": prepared["manifestSha256"],
        "model": {
            "modelId": MODEL_ID,
            "embeddingDimensions": MODEL_DIMENSIONS,
            "checkpointSha256": args.model_sha256,
            "preprocessingSha256": PREPROCESSING_SHA256,
            "device": str(embedder.device),
        },
        "validationRules": {
            "minimumIndependentListings": 2,
            "visualConsensusSimilarityThreshold": args.similarity_threshold,
            "perceptualHashDistanceFloor": args.perceptual_hash_distance_floor,
            "crossVariantDuplicateImagesRejected": True,
        },
        "preparedVariantCount": len(candidate_groups),
        "preparedImageCount": len(all_candidates),
        "approvedVariantCount": len(promotions),
        "languageCounts": language_counts,
        "bestSimilarityDistribution": quantiles(best_similarities),
        "promotions": promotions,
        "exclusions": exclusions,
    }
    manifest = {**body, "manifestSha256": sha256_bytes(canonical_json(body))}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(manifest, handle, allow_nan=False, ensure_ascii=False, indent=2)
        handle.write("\n")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate independent eBay card images with DINOv2 visual consensus.")
    parser.add_argument("--prepared", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--torch-hub-repo", required=True, type=Path)
    parser.add_argument("--model-checkpoint", required=True, type=Path)
    parser.add_argument("--model-sha256", required=True)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--similarity-threshold", type=float, default=0.90)
    parser.add_argument("--perceptual-hash-distance-floor", type=int, default=4)
    args = parser.parse_args()
    if args.batch_size < 1 or args.batch_size > 64:
        raise RuntimeError("--batch-size must be between 1 and 64")
    if not 0.5 <= args.similarity_threshold <= 0.999:
        raise RuntimeError("--similarity-threshold must be between 0.5 and 0.999")
    if args.perceptual_hash_distance_floor < 1 or args.perceptual_hash_distance_floor > 32:
        raise RuntimeError("--perceptual-hash-distance-floor must be between 1 and 32")
    manifest = validate(args)
    print(json.dumps({
        "ok": True,
        "status": manifest["status"],
        "commitEligible": manifest["commitEligible"],
        "approvedVariantCount": manifest["approvedVariantCount"],
        "languageCounts": manifest["languageCounts"],
        "bestSimilarityDistribution": manifest["bestSimilarityDistribution"],
        "manifestSha256": manifest["manifestSha256"],
        "output": str(args.output.resolve()),
        "productionModified": False,
    }, indent=2))


if __name__ == "__main__":
    main()
