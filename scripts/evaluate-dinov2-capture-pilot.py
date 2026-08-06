from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import statistics
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image, ImageOps


MODEL_ID = "dinov2_vits14"
MODEL_REPOSITORY = "facebookresearch/dinov2"
INPUT_SIZE = 224
IMAGE_NET_MEAN = (0.485, 0.456, 0.406)
IMAGE_NET_STD = (0.229, 0.224, 0.225)


class Dinov2Embedding(torch.nn.Module):
    def __init__(self, backbone: torch.nn.Module):
        super().__init__()
        self.backbone = backbone
        self.register_buffer("mean", torch.tensor(IMAGE_NET_MEAN).view(1, 3, 1, 1))
        self.register_buffer("std", torch.tensor(IMAGE_NET_STD).view(1, 3, 1, 1))

    def forward(self, pixels: torch.Tensor) -> torch.Tensor:
        features = self.backbone((pixels - self.mean) / self.std)
        return torch.nn.functional.normalize(features, p=2, dim=1)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") not in {
        "stackr-reviewed-capture-evaluation-manifest-v1.0.0",
        "stackr-reviewed-capture-evaluation-manifest-v1.1.0",
    }:
        raise ValueError("Unsupported reviewed-capture manifest.")
    if manifest.get("privacyScope") not in {
        "private_model_evaluation_and_training",
        "public_catalogue_model_evaluation_training_and_production",
    }:
        raise ValueError("Manifest is not approved for model evaluation.")
    if not isinstance(manifest.get("productionPublicationApproved"), bool):
        raise ValueError("Manifest publication approval must be explicit.")
    if not manifest.get("images"):
        raise ValueError("Manifest has no images.")
    return manifest


def image_tensor(path: Path) -> torch.Tensor:
    with Image.open(path) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        image = ImageOps.fit(image, (INPUT_SIZE, INPUT_SIZE), method=Image.Resampling.BICUBIC)
        pixels = np.asarray(image, dtype=np.float32) / 255.0
    return torch.from_numpy(np.transpose(pixels, (2, 0, 1))).contiguous()


def checkpoint_path() -> Path | None:
    checkpoints = Path(torch.hub.get_dir()) / "checkpoints"
    candidates = sorted(checkpoints.glob("dinov2_vits14_pretrain*.pth"))
    return candidates[-1] if candidates else None


def load_images(manifest: dict[str, Any], root: Path) -> tuple[list[dict[str, Any]], torch.Tensor]:
    entries: list[dict[str, Any]] = []
    tensors: list[torch.Tensor] = []
    resolved_root = root.resolve()
    for entry in manifest["images"]:
        image_path = (resolved_root / entry["relativePath"]).resolve()
        if resolved_root != image_path and resolved_root not in image_path.parents:
            raise ValueError(f"Image path escapes the approved root: {entry['relativePath']}")
        if sha256_file(image_path) != entry["sha256"]:
            raise ValueError(f"Image hash mismatch: {entry['relativePath']}")
        entries.append(entry)
        tensors.append(image_tensor(image_path))
    return entries, torch.stack(tensors)


def embed_batches(model: torch.nn.Module, tensors: torch.Tensor, batch_size: int) -> np.ndarray:
    outputs: list[np.ndarray] = []
    with torch.inference_mode():
        for offset in range(0, len(tensors), batch_size):
            output = model(tensors[offset:offset + batch_size]).cpu().numpy().astype(np.float32)
            outputs.append(output)
    return np.concatenate(outputs, axis=0)


def evaluate_retrieval(entries: list[dict[str, Any]], embeddings: np.ndarray) -> dict[str, Any]:
    by_identity: dict[str, list[int]] = defaultdict(list)
    for index, entry in enumerate(entries):
        by_identity[entry["identityKey"]].append(index)
    reference_indices = [indices[0] for _, indices in sorted(by_identity.items())]
    query_indices = [index for indices in by_identity.values() for index in indices[1:]]
    if not query_indices:
        raise ValueError("Each pilot identity needs at least two unique images.")
    references = embeddings[reference_indices]
    reference_labels = [entries[index]["identityKey"] for index in reference_indices]
    ranks: list[int] = []
    per_identity: dict[str, list[int]] = defaultdict(list)
    for query_index in query_indices:
        scores = references @ embeddings[query_index]
        order = np.argsort(-scores)
        expected = entries[query_index]["identityKey"]
        rank = next(position + 1 for position, candidate in enumerate(order) if reference_labels[candidate] == expected)
        ranks.append(rank)
        per_identity[expected].append(rank)
    count = len(ranks)
    return {
        "referenceImages": len(reference_indices),
        "queryImages": count,
        "queryImagesExcludedFromReferences": not bool(set(reference_indices) & set(query_indices)),
        "top1": sum(rank <= 1 for rank in ranks) / count,
        "top3": sum(rank <= 3 for rank in ranks) / count,
        "top5": sum(rank <= 5 for rank in ranks) / count,
        "meanReciprocalRank": sum(1.0 / rank for rank in ranks) / count,
        "perIdentity": [
            {
                "identityKey": identity,
                "cardName": entries[by_identity[identity][0]]["cardName"],
                "queries": len(identity_ranks),
                "top1": sum(rank <= 1 for rank in identity_ranks) / len(identity_ranks),
                "meanRank": sum(identity_ranks) / len(identity_ranks),
            }
            for identity, identity_ranks in sorted(per_identity.items())
        ],
    }


def measure_latency(model: torch.nn.Module, tensor: torch.Tensor, samples: int) -> dict[str, Any]:
    with torch.inference_mode():
        for _ in range(3):
            model(tensor[:1])
        durations = []
        for _ in range(samples):
            started = time.perf_counter()
            model(tensor[:1])
            durations.append((time.perf_counter() - started) * 1000.0)
    ordered = sorted(durations)
    p95_index = min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1)
    return {
        "samples": samples,
        "medianMs": statistics.median(durations),
        "p95Ms": ordered[p95_index],
        "meanMs": statistics.mean(durations),
    }


def export_onnx(model: torch.nn.Module, output_dir: Path, example: torch.Tensor) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "dinov2-vits14-stackr-pilot.onnx"
    started = time.perf_counter()
    try:
        torch.onnx.export(
            model,
            (example[:1],),
            output_path,
            input_names=["pixels"],
            output_names=["embedding"],
            opset_version=18,
            dynamo=False,
        )
        import onnxruntime as ort

        session = ort.InferenceSession(str(output_path), providers=["CPUExecutionProvider"])
        ort_output = session.run(None, {"pixels": example[:1].numpy().astype(np.float32)})[0]
        with torch.inference_mode():
            torch_output = model(example[:1]).numpy()
        maximum_difference = float(np.max(np.abs(torch_output - ort_output)))
        cosine = float(np.sum(torch_output * ort_output) / (np.linalg.norm(torch_output) * np.linalg.norm(ort_output)))
        return {
            "status": "compatible" if maximum_difference <= 1e-4 and cosine >= 0.9999 else "parity_failed",
            "path": str(output_path),
            "sha256": sha256_file(output_path),
            "bytes": output_path.stat().st_size,
            "exportSeconds": time.perf_counter() - started,
            "maximumEmbeddingDifference": maximum_difference,
            "cosineSimilarity": cosine,
            "inputName": session.get_inputs()[0].name,
            "inputShape": session.get_inputs()[0].shape,
            "outputShape": session.get_outputs()[0].shape,
        }
    except Exception as error:
        if output_path.exists():
            output_path.unlink()
        return {
            "status": "failed",
            "error": f"{error.__class__.__name__}: {error}",
            "exportSeconds": time.perf_counter() - started,
        }


def onnx_embeddings(model_path: Path, tensors: torch.Tensor) -> tuple[np.ndarray, Any]:
    import onnxruntime as ort

    session = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
    input_name = session.get_inputs()[0].name
    outputs = [
        session.run(None, {input_name: tensor.numpy()[None, ...].astype(np.float32)})[0].reshape(-1)
        for tensor in tensors
    ]
    embeddings = np.stack(outputs).astype(np.float32)
    embeddings /= np.linalg.norm(embeddings, axis=1, keepdims=True)
    return embeddings, session


def measure_onnx_latency(session: Any, tensor: torch.Tensor, samples: int) -> dict[str, Any]:
    input_name = session.get_inputs()[0].name
    pixels = tensor[:1].numpy().astype(np.float32)
    for _ in range(3):
        session.run(None, {input_name: pixels})
    durations = []
    for _ in range(samples):
        started = time.perf_counter()
        session.run(None, {input_name: pixels})
        durations.append((time.perf_counter() - started) * 1000.0)
    ordered = sorted(durations)
    p95_index = min(len(ordered) - 1, math.ceil(len(ordered) * 0.95) - 1)
    return {
        "samples": samples,
        "medianMs": statistics.median(durations),
        "p95Ms": ordered[p95_index],
        "meanMs": statistics.mean(durations),
    }


def quantize_onnx(
    source: Path,
    entries: list[dict[str, Any]],
    tensors: torch.Tensor,
    output_dir: Path,
    fp32_top1: float,
    latency_samples: int,
) -> dict[str, Any]:
    from onnxruntime.quantization import QuantType, quantize_dynamic

    output_path = output_dir / "dinov2-vits14-stackr-pilot-int8.onnx"
    started = time.perf_counter()
    try:
        quantize_dynamic(
            source,
            output_path,
            op_types_to_quantize=["MatMul", "Gemm"],
            per_channel=True,
            weight_type=QuantType.QInt8,
        )
        embeddings, session = onnx_embeddings(output_path, tensors)
        retrieval = evaluate_retrieval(entries, embeddings)
        top1_delta = retrieval["top1"] - fp32_top1
        accepted = top1_delta >= -0.03
        return {
            "status": "accepted" if accepted else "quality_rejected",
            "path": str(output_path),
            "sha256": sha256_file(output_path),
            "bytes": output_path.stat().st_size,
            "sizeReduction": 1.0 - (output_path.stat().st_size / source.stat().st_size),
            "quantizationSeconds": time.perf_counter() - started,
            "realCameraTop1": retrieval["top1"],
            "realCameraTop3": retrieval["top3"],
            "realCameraTop5": retrieval["top5"],
            "top1Delta": top1_delta,
            "acceptanceThreshold": -0.03,
            "serverCpuLatency": measure_onnx_latency(session, tensors, latency_samples),
        }
    except Exception as error:
        if output_path.exists():
            output_path.unlink()
        return {
            "status": "failed",
            "error": f"{error.__class__.__name__}: {error}",
            "quantizationSeconds": time.perf_counter() - started,
        }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--artifact-dir", type=Path)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--latency-samples", type=int, default=20)
    parser.add_argument("--export-onnx", action="store_true")
    parser.add_argument("--quantize-int8", action="store_true")
    args = parser.parse_args()

    torch.manual_seed(12012)
    manifest = read_manifest(args.manifest)
    privacy_scope = manifest["privacyScope"]
    production_publication_approved = bool(manifest["productionPublicationApproved"])
    entries, tensors = load_images(manifest, args.root)
    backbone = torch.hub.load(MODEL_REPOSITORY, MODEL_ID, pretrained=True, trust_repo=True)
    model = Dinov2Embedding(backbone.eval()).eval()
    embeddings = embed_batches(model, tensors, args.batch_size)
    retrieval = evaluate_retrieval(entries, embeddings)
    checkpoint = checkpoint_path()
    onnx_result = {"status": "not_requested"}
    if args.export_onnx:
        if not args.artifact_dir:
            raise ValueError("--artifact-dir is required with --export-onnx.")
        onnx_result = export_onnx(model, args.artifact_dir, tensors)
    quantization_result = {"status": "not_requested"}
    if args.quantize_int8:
        if onnx_result.get("status") != "compatible" or not args.artifact_dir:
            raise ValueError("A compatible --export-onnx result is required with --quantize-int8.")
        quantization_result = quantize_onnx(
            Path(onnx_result["path"]),
            entries,
            tensors,
            args.artifact_dir,
            retrieval["top1"],
            args.latency_samples,
        )

    protected = bool(manifest["summary"]["protectedTestEligible"])
    report = {
        "schemaVersion": "stackr-dinov2-capture-pilot-v1.0.0",
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "status": "development_pilot_complete",
        "productionAccepted": False,
        "model": {
            "modelId": MODEL_ID,
            "repository": MODEL_REPOSITORY,
            "embeddingDimensions": int(embeddings.shape[1]),
            "license": "Apache-2.0",
            "checkpointPath": str(checkpoint) if checkpoint else None,
            "checkpointSha256": sha256_file(checkpoint) if checkpoint else None,
            "checkpointBytes": checkpoint.stat().st_size if checkpoint else None,
        },
        "dataset": {
            "manifestSha256": sha256_file(args.manifest),
            "uniqueImages": len(entries),
            "identityClasses": manifest["summary"]["identityClasses"],
            "physicalCardSessions": manifest["summary"]["physicalCardSessions"],
            "languageDistribution": {"zh-Hans": len(entries)},
            "publicationConsent": {
                "privacyScope": privacy_scope,
                "productionPublicationApproved": production_publication_approved,
            },
        },
        "evaluationIsolation": {
            "queryImagesAreExcludedFromIndexedReferences": retrieval["queryImagesExcludedFromReferences"],
            "modelSelectionAndProtectedTestSeparated": protected,
            "physicalCardSessionLeakageExists": not protected,
        },
        "measurements": {
            "realCameraTop1": retrieval["top1"],
            "realCameraTop3": retrieval["top3"],
            "realCameraTop5": retrieval["top5"],
            "foreignLanguageTop1": retrieval["top1"],
            "meanReciprocalRank": retrieval["meanReciprocalRank"],
            "serverCpuLatency": measure_latency(model, tensors, args.latency_samples),
        },
        "retrieval": retrieval,
        "onnx": onnx_result,
        "quantization": quantization_result,
        "runtime": {
            "python": platform.python_version(),
            "operatingSystem": platform.platform(),
            "torch": torch.__version__,
            "numpy": np.__version__,
            "device": "cpu",
        },
        "blockers": [
            "model_selection_and_protected_test_not_separated",
            "one_physical_card_session_per_identity",
            "six_identity_classes_only",
            "single_language_only",
            "variant_and_finish_hard_negatives_missing",
            "mobile_latency_not_measured",
            "quantisation_not_validated",
            "active_database_index_not_built",
        ],
        "limitations": [
            (
                "This development retrieval pilot has owner-approved public publication consent, "
                "but it is not model production acceptance evidence."
                if production_publication_approved
                else "This is a private development retrieval pilot, not production acceptance evidence."
            ),
            "Reference and query images are different files, but they show the same physical card session for each identity.",
            "Top-5 is weak evidence with only six identity classes.",
        ],
    }
    if protected:
        report["blockers"].remove("model_selection_and_protected_test_not_separated")
        report["blockers"].remove("one_physical_card_session_per_identity")
    if onnx_result.get("status") == "compatible":
        report["blockers"].append("onnx_development_export_not_release_approved")
    else:
        report["blockers"].append("onnx_export_not_compatible")
    if quantization_result.get("status") == "accepted":
        report["blockers"].remove("quantisation_not_validated")
        report["blockers"].append("int8_development_export_not_release_approved")

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "ok": True,
        "status": report["status"],
        "productionAccepted": False,
        "measurements": report["measurements"],
        "onnx": onnx_result,
        "quantization": quantization_result,
        "blockers": report["blockers"],
        "report": str(args.out.resolve()),
    }, indent=2))


if __name__ == "__main__":
    main()
