from __future__ import annotations

import argparse
import importlib.util
import json
import math
import statistics
import time
from collections import Counter
from pathlib import Path
from typing import Any
from uuid import UUID


PREPARED_SCHEMA = "stackr-ebay-recognition-reference-preparation-v1.0.0"
REPORT_SCHEMA = "stackr-ebay-heldout-recognition-benchmark-v1.0.0"


def load_core() -> Any:
    path = Path(__file__).with_name("build-incremental-recognition-index-staging.py")
    spec = importlib.util.spec_from_file_location("stackr_incremental_recognition_core", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("incremental recognition core could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def load_manifest(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(value, dict):
        raise RuntimeError(f"manifest is not an object: {path}")
    return value


def select_heldout_cases(
    core: Any,
    prepared: dict[str, Any],
    approved: dict[str, Any],
    images_dir: Path,
) -> list[dict[str, Any]]:
    prepared_by_variant = {
        str(UUID(str(item["variantId"]))): item
        for item in prepared.get("candidates", [])
    }
    output: list[dict[str, Any]] = []
    for promotion in sorted(approved.get("promotions", []), key=lambda item: str(item["variantId"])):
        variant_id = str(UUID(str(promotion["variantId"])))
        prepared_candidate = prepared_by_variant.get(variant_id)
        if prepared_candidate is None:
            raise RuntimeError(f"approved variant is absent from its preparation manifest: {variant_id}")
        selected = promotion["selectedCandidate"]
        consensus = promotion["consensus"]
        if consensus.get("status") != "accepted" or consensus.get("independentListingImages") is not True:
            raise RuntimeError(f"approved variant lacks independent visual consensus: {variant_id}")
        consensus_items = {str(value) for value in consensus.get("sourceItemIds", [])}
        consensus_hashes = {str(value) for value in consensus.get("sourceImageSha256s", [])}
        alternatives = [
            image
            for image in prepared_candidate.get("images", [])
            if image.get("sourceItemId") != selected.get("sourceItemId")
            and image.get("sourceItemId") in consensus_items
            and image.get("sourceImageSha256") in consensus_hashes
            and image.get("rectifiedSha256") != selected.get("rectifiedSha256")
        ]
        alternatives.sort(key=lambda image: (
            str(image.get("sourceItemId") or ""),
            str(image.get("rectifiedSha256") or ""),
        ))
        if not alternatives:
            raise RuntimeError(f"approved variant has no independent held-out listing image: {variant_id}")
        heldout = alternatives[0]
        image_path = images_dir / Path(str(heldout["imagePath"])).name
        if not image_path.is_file():
            raise RuntimeError(f"held-out image is missing from the immutable artifact: {image_path.name}")
        image_bytes = image_path.read_bytes()
        if core.sha256_bytes(image_bytes) != heldout["rectifiedSha256"]:
            raise RuntimeError(f"held-out image checksum mismatch: {variant_id}")
        if heldout["sourceItemId"] == selected["sourceItemId"]:
            raise RuntimeError(f"held-out image reused the indexed listing identity: {variant_id}")
        output.append({
            "variant_id": variant_id,
            "reference_asset_id": variant_id,
            "source_image_id": f"heldout:{heldout['sourceItemId']}",
            "language_code": str(promotion["fingerprint"]["languageCode"]),
            "source_image_checksum_sha256": str(heldout["rectifiedSha256"]),
            "image_bytes": image_bytes,
            "indexedSourceItemId": str(selected["sourceItemId"]),
            "heldoutSourceItemId": str(heldout["sourceItemId"]),
            "heldoutSourceListingUrl": heldout.get("sourceListingUrl"),
            "heldoutSourceImageUrl": heldout.get("sourceImageUrl"),
            "heldoutSourceImageSha256": heldout.get("sourceImageSha256"),
            "heldoutRectifiedSha256": heldout.get("rectifiedSha256"),
            "approvalConsensusSimilarity": consensus.get("similarity"),
            "setCode": promotion["fingerprint"].get("setCode"),
            "collectorNumber": promotion["fingerprint"].get("collectorNumber"),
            "nativeName": promotion["fingerprint"].get("nativeName"),
        })
    if len({case["variant_id"] for case in output}) != len(output):
        raise RuntimeError("held-out benchmark selection contains duplicate variants")
    return output


def retrieval_summary(rows: Any, expected_variant_id: str, latency_ms: float) -> dict[str, Any]:
    if not isinstance(rows, list) or not rows or any(not isinstance(row, dict) for row in rows):
        raise RuntimeError("candidate search returned an invalid result set")
    expected_index = next(
        (index for index, row in enumerate(rows) if str(row.get("variant_id")) == expected_variant_id),
        None,
    )
    rank = expected_index + 1 if expected_index is not None else None
    expected_similarity = (
        float(rows[expected_index]["cosine_similarity"])
        if expected_index is not None and rows[expected_index].get("cosine_similarity") is not None
        else None
    )
    top = rows[0]
    return {
        "rank": rank,
        "foundWithinLimit": rank is not None,
        "top1Correct": rank == 1,
        "top3Correct": rank is not None and rank <= 3,
        "top5Correct": rank is not None and rank <= 5,
        "expectedSimilarity": expected_similarity,
        "top1VariantId": str(top.get("variant_id")),
        "top1Similarity": float(top["cosine_similarity"]),
        "top1SetCode": top.get("set_code"),
        "top1CollectorNumber": top.get("collector_number"),
        "latencyMs": round(latency_ms, 3),
    }


def metric_summary(results: list[dict[str, Any]], key: str) -> dict[str, Any]:
    rows = [result[key] for result in results]
    count = len(rows)
    ranks = [row["rank"] for row in rows if row["rank"] is not None]
    expected_similarities = [row["expectedSimilarity"] for row in rows if row["expectedSimilarity"] is not None]
    latencies = [row["latencyMs"] for row in rows]
    return {
        "queryCount": count,
        "top1": sum(bool(row["top1Correct"]) for row in rows) / count,
        "top3": sum(bool(row["top3Correct"]) for row in rows) / count,
        "top5": sum(bool(row["top5Correct"]) for row in rows) / count,
        "meanReciprocalRankAt50": sum(1.0 / rank for rank in ranks) / count,
        "meanExpectedSimilarity": statistics.fmean(expected_similarities) if expected_similarities else None,
        "minimumExpectedSimilarity": min(expected_similarities) if expected_similarities else None,
        "medianLatencyMs": statistics.median(latencies),
        "p95LatencyMs": sorted(latencies)[max(0, math.ceil(0.95 * count) - 1)],
        "missCountAt50": count - len(ranks),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark a validated inactive Stackr index with independent eBay images.")
    parser.add_argument("--prepared", required=True, type=Path)
    parser.add_argument("--approved", required=True, type=Path)
    parser.add_argument("--images-dir", required=True, type=Path)
    parser.add_argument("--candidate-index-id", required=True)
    parser.add_argument("--torch-hub-repo", required=True, type=Path)
    parser.add_argument("--model-checkpoint", required=True, type=Path)
    parser.add_argument("--model-sha256", required=True)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="cpu")
    parser.add_argument("--batch-size", type=int, default=24)
    parser.add_argument("--search-limit", type=int, default=50)
    parser.add_argument("--rpc-timeout", type=float, default=120.0)
    parser.add_argument("--retries", type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.batch_size <= 50 or not 5 <= args.search_limit <= 50:
        raise RuntimeError("benchmark batch size or search limit is outside controlled bounds")

    core = load_core()
    prepared = load_manifest(args.prepared.resolve())
    approved = load_manifest(args.approved.resolve())
    core.verify_manifest(prepared, PREPARED_SCHEMA)
    core.verify_manifest(approved, core.APPROVED_SCHEMA)
    if approved.get("status") != "validated_inactive" or approved.get("commitEligible") is not True:
        raise RuntimeError("approval manifest is not a validated promotion source")

    candidate_index_id = str(UUID(args.candidate_index_id))
    client = core.SupabaseClient(
        core.required_environment("SUPABASE_URL"),
        core.required_environment("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
        args.rpc_timeout,
        args.retries,
    )
    candidate = core.index_row(client, candidate_index_id)
    scope = candidate.get("completeness_report", {}).get("scope", {})
    if (
        candidate.get("status") != "validated"
        or candidate.get("activated_at") is not None
        or candidate.get("model_id") != core.MODEL_ID
        or int(candidate.get("embedding_dimensions") or 0) != core.MODEL_DIMENSIONS
        or scope.get("modelSha256") != args.model_sha256
        or scope.get("preprocessingSha256") != core.PREPROCESSING_SHA256
        or scope.get("productionModified") is not False
    ):
        raise RuntimeError("candidate index is not the expected validated inactive DINOv2 index")

    cases = select_heldout_cases(core, prepared, approved, args.images_dir.resolve())
    embedder = core.Dinov2Embedder(
        args.torch_hub_repo.resolve(),
        args.model_checkpoint.resolve(),
        args.model_sha256,
        args.device,
    )
    embedded = embedder.embed(cases, args.batch_size)
    if len(embedded) != len(cases):
        raise RuntimeError("held-out embedding generation did not reconcile")

    results: list[dict[str, Any]] = []
    for case, embedding in zip(cases, embedded, strict=True):
        searches: dict[str, dict[str, Any]] = {}
        for label, language in (("global", None), ("languageFiltered", case["language_code"])):
            started = time.perf_counter()
            rows = client.rpc("search_recognition_candidate_index", {
                "p_index_version_id": candidate_index_id,
                "p_embedding": embedding["embedding"],
                "p_language_code": language,
                "p_limit": args.search_limit,
            })
            searches[label] = retrieval_summary(
                rows,
                case["variant_id"],
                (time.perf_counter() - started) * 1000.0,
            )
        results.append({
            "variantId": case["variant_id"],
            "languageCode": case["language_code"],
            "setCode": case["setCode"],
            "collectorNumber": case["collectorNumber"],
            "nativeName": case["nativeName"],
            "indexedSourceItemId": case["indexedSourceItemId"],
            "heldoutSourceItemId": case["heldoutSourceItemId"],
            "heldoutSourceListingUrl": case["heldoutSourceListingUrl"],
            "heldoutSourceImageUrl": case["heldoutSourceImageUrl"],
            "heldoutSourceImageSha256": case["heldoutSourceImageSha256"],
            "heldoutRectifiedSha256": case["heldoutRectifiedSha256"],
            "approvalConsensusSimilarity": case["approvalConsensusSimilarity"],
            "global": searches["global"],
            "languageFiltered": searches["languageFiltered"],
        })
    client.close()

    global_metrics = metric_summary(results, "global")
    language_metrics = metric_summary(results, "languageFiltered")
    language_counts = dict(sorted(Counter(result["languageCode"] for result in results).items()))
    gate_passed = (
        len(results) == int(approved.get("approvedVariantCount") or 0)
        and global_metrics["top1"] >= 0.90
        and global_metrics["top3"] == 1.0
        and language_metrics["top1"] >= 0.90
        and language_metrics["top3"] == 1.0
        and global_metrics["missCountAt50"] == 0
        and language_metrics["missCountAt50"] == 0
    )
    body = {
        "schemaVersion": REPORT_SCHEMA,
        "generatedAt": core.utc_now(),
        "projectRef": core.STAGING_PROJECT_REF,
        "status": "passed_no_photo_gate" if gate_passed else "measured_failed_no_photo_gate",
        "candidateIndex": {
            "id": candidate_index_id,
            "version": candidate["index_version"],
            "status": candidate["status"],
            "activated": False,
            "embeddingCount": candidate["reference_embedding_count"],
            "checksumSha256": candidate["checksum_sha256"],
        },
        "evaluationIsolation": {
            "queryImagesAreExcludedFromIndexedReferences": True,
            "independentListingIdentityRequired": True,
            "queryImageCount": len(results),
            "indexedImageCountUsedAsQueries": 0,
            "preparedManifestSha256": prepared["manifestSha256"],
            "approvalManifestSha256": approved["manifestSha256"],
        },
        "model": {
            "modelId": core.MODEL_ID,
            "embeddingDimensions": core.MODEL_DIMENSIONS,
            "checkpointSha256": args.model_sha256,
            "preprocessingSha256": core.PREPROCESSING_SHA256,
            "device": str(embedder.device),
        },
        "coverage": {
            "languageCounts": language_counts,
            "sourceType": "independent_ebay_listing_rectified_card",
            "variantCount": len(results),
        },
        "metrics": {
            "global": global_metrics,
            "languageFiltered": language_metrics,
        },
        "acceptanceGate": {
            "passed": gate_passed,
            "minimumGlobalTop1": 0.90,
            "requiredGlobalTop3": 1.0,
            "minimumLanguageFilteredTop1": 0.90,
            "requiredLanguageFilteredTop3": 1.0,
            "requiredMissCountAt50": 0,
            "activationEligible": False,
        },
        "results": results,
        "limitations": [
            "Coverage is limited to the newly approved Japanese variants with two independent listing images.",
            "Marketplace listing imagery does not reproduce mobile camera, sleeve, glare, motion, or device-latency conditions.",
            "This interim benchmark cannot authorize index activation or production deployment.",
        ],
        "databaseModified": False,
        "productionModified": False,
    }
    report = {**body, "manifestSha256": core.sha256_bytes(core.canonical_json(body))}
    args.output = args.output.resolve()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("x", encoding="utf-8") as handle:
        json.dump(report, handle, allow_nan=False, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({
        "ok": True,
        "status": report["status"],
        "candidateIndexId": candidate_index_id,
        "queryImageCount": len(results),
        "globalTop1": global_metrics["top1"],
        "globalTop3": global_metrics["top3"],
        "languageFilteredTop1": language_metrics["top1"],
        "gatePassed": gate_passed,
        "databaseModified": False,
        "productionModified": False,
        "output": str(args.output),
    }, indent=2))


if __name__ == "__main__":
    main()
