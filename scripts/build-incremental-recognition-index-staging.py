from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import time
import urllib.parse
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID


STAGING_PROJECT_REF = "lmwfhvexfcoyeuoyrlco"
PRODUCTION_PROJECT_REF = "oakdbbzdqwurpjnoqhmu"
MODEL_ID = "dinov2_vits14"
MODEL_DIMENSIONS = 384
APPROVED_SCHEMA = "stackr-ebay-recognition-reference-approval-v1.0.0"
COMMITTED_SCHEMA = "stackr-ebay-recognition-reference-commit-v1.0.0"
EVIDENCE_SCHEMA = "stackr-ebay-incremental-recognition-index-v1.0.0"
LAUNCH_LANGUAGES = ("en", "ja", "zh-cn", "zh-tw")
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


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        raise RuntimeError(f"manifest SHA-256 verification failed for {schema}")
    if value.get("projectRef") != STAGING_PROJECT_REF or value.get("productionModified") is not False:
        raise RuntimeError("manifest is not restricted to Stackr staging")


def required_environment(*names: str) -> str:
    for name in names:
        value = os.environ.get(name, "").replace("\ufeff", "").strip()
        if value:
            return value
    raise RuntimeError(f"one of {', '.join(names)} is required")


def retry_delay(attempt: int) -> float:
    return min(8.0, 0.5 * (2**attempt))


class SupabaseClient:
    def __init__(self, base_url: str, secret_key: str, timeout: float, retries: int):
        import httpx

        parsed = urllib.parse.urlparse(base_url)
        expected_hostname = f"{STAGING_PROJECT_REF}.supabase.co"
        if (
            parsed.scheme != "https"
            or parsed.hostname != expected_hostname
            or parsed.username
            or parsed.password
            or parsed.path not in ("", "/")
            or parsed.query
            or parsed.fragment
            or PRODUCTION_PROJECT_REF in base_url
        ):
            raise RuntimeError(f"SUPABASE_URL must be exactly https://{expected_hostname}")
        self.base_url = f"https://{expected_hostname}"
        self.secret_key = secret_key
        self.timeout = timeout
        self.retries = retries
        self.http = httpx.Client(
            headers={"User-Agent": "Stackr-eBay-Incremental-Recognition-Index/1"},
            limits=httpx.Limits(max_connections=24),
        )

    def close(self) -> None:
        self.http.close()

    def request(
        self,
        method: str,
        path: str,
        *,
        schema: str,
        body: Any = None,
        params: list[tuple[str, str]] | None = None,
    ) -> Any:
        import httpx

        encoded = canonical_json(body) if body is not None else None
        for attempt in range(self.retries + 1):
            try:
                response = self.http.request(
                    method,
                    f"{self.base_url}{path}",
                    content=encoded,
                    params=params,
                    timeout=self.timeout,
                    headers={
                        "Accept": "application/json",
                        "Accept-Profile": schema,
                        "Authorization": f"Bearer {self.secret_key}",
                        "Content-Profile": schema,
                        "Content-Type": "application/json",
                        "apikey": self.secret_key,
                    },
                )
                if not 200 <= response.status_code < 300:
                    raise httpx.HTTPStatusError(
                        f"HTTP {response.status_code}", request=response.request, response=response
                    )
                return response.json() if response.content else None
            except httpx.HTTPStatusError as error:
                if error.response.status_code not in (408, 425, 429, 500, 502, 503, 504) or attempt == self.retries:
                    raise RuntimeError(
                        f"staging request {method} {path} returned HTTP {error.response.status_code}: "
                        f"{error.response.text[:2000]}"
                    ) from error
            except httpx.TransportError as error:
                if attempt == self.retries:
                    raise RuntimeError(f"staging request {method} {path} failed: {error}") from error
            time.sleep(retry_delay(attempt))
        raise AssertionError("unreachable")

    def get(self, table: str, *, schema: str, params: list[tuple[str, str]]) -> Any:
        return self.request("GET", f"/rest/v1/{table}", schema=schema, params=params)

    def rpc(self, name: str, payload: dict[str, Any]) -> Any:
        return self.request("POST", f"/rest/v1/rpc/{name}", schema="api", body=payload)


def one_row(payload: Any, label: str) -> dict[str, Any]:
    if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
        raise RuntimeError(f"{label} did not return exactly one row")
    return dict(payload[0])


def index_row(client: SupabaseClient, index_id: str) -> dict[str, Any]:
    return one_row(
        client.get(
            "embedding_index_versions",
            schema="ml",
            params=[
                ("select", "id,model_id,index_version,embedding_dimensions,status,checksum_sha256,reference_embedding_count,missing_embedding_count,completeness_report,health_report"),
                ("id", f"eq.{index_id}"),
                ("limit", "1"),
            ],
        ),
        "embedding index lookup",
    )


def active_index_snapshot(client: SupabaseClient) -> list[dict[str, Any]]:
    payload = client.get(
        "embedding_index_manifest",
        schema="api",
        params=[("select", "*"), ("status", "eq.active"), ("order", "index_version_id.asc")],
    )
    if not isinstance(payload, list):
        raise RuntimeError("active embedding index manifest returned an invalid payload")
    return [dict(item) for item in payload]


def source_embedding_rows(client: SupabaseClient, source_index_id: str, page_size: int) -> list[dict[str, Any]]:
    fields = (
        "variant_id,reference_asset_id,source_image_id,language_code,source_image_checksum_sha256,"
        "preprocessing_checksum_sha256,embedding_norm"
    )
    rows: list[dict[str, Any]] = []
    after: str | None = None
    while True:
        params = [
            ("select", fields),
            ("index_version_id", f"eq.{source_index_id}"),
            ("deprecated_at", "is.null"),
            ("order", "variant_id.asc,reference_asset_id.asc"),
            ("limit", str(page_size)),
        ]
        if after:
            params.append(("variant_id", f"gt.{after}"))
        payload = client.get("card_embeddings_dinov2_vits14_384", schema="ml", params=params)
        if not isinstance(payload, list):
            raise RuntimeError("source embedding listing returned an invalid payload")
        page = [dict(item) for item in payload]
        if not page:
            break
        for row in page:
            variant_id = str(UUID(str(row.get("variant_id"))))
            if after is not None and UUID(variant_id).int <= UUID(after).int:
                raise RuntimeError("source embedding pagination is not strictly increasing")
            rows.append(row)
            after = variant_id
        if len(page) < page_size:
            break
    if not rows:
        raise RuntimeError("source index contains no reusable embeddings")
    return rows


def eligible_variant_ids(client: SupabaseClient, page_size: int) -> set[str]:
    variants: set[str] = set()
    after: str | None = None
    while True:
        payload = client.rpc(
            "list_recognition_reference_assets",
            {"p_after_asset_id": after, "p_limit": page_size, "p_stored_only": True},
        )
        if not isinstance(payload, list):
            raise RuntimeError("controlled reference listing returned an invalid payload")
        page = [dict(item) for item in payload]
        for row in page:
            asset_id = str(UUID(str(row.get("reference_asset_id"))))
            if after is not None and UUID(asset_id).int <= UUID(after).int:
                raise RuntimeError("reference asset pagination is not strictly increasing")
            language = str(row.get("language_code") or "")
            if language not in LAUNCH_LANGUAGES:
                raise RuntimeError(f"non-launch language entered recognition eligibility: {language}")
            variants.add(str(UUID(str(row.get("variant_id")))))
            after = asset_id
        if len(page) < page_size:
            break
    return variants


def manifest_sha256(rows: list[dict[str, Any]]) -> str:
    ordered = sorted(
        rows,
        key=lambda row: (
            UUID(str(row["variant_id"])).int,
            UUID(str(row["reference_asset_id"])).int,
        ),
    )
    joined = "\x1e".join(
        "\x1f".join(
            (
                str(UUID(str(row["variant_id"]))),
                str(UUID(str(row["reference_asset_id"]))),
                str(row["source_image_id"]),
                str(row["language_code"]),
                str(row["source_image_checksum_sha256"]),
            )
        )
        for row in ordered
    )
    return sha256_bytes(joined.encode("utf-8"))


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

    def embed(self, promotions: list[dict[str, Any]], batch_size: int) -> list[dict[str, Any]]:
        import numpy as np
        from PIL import Image, ImageOps

        output: list[dict[str, Any]] = []
        for offset in range(0, len(promotions), batch_size):
            batch = promotions[offset : offset + batch_size]
            arrays = []
            for promotion in batch:
                image_path = Path(promotion["image_path"])
                if sha256_file(image_path) != promotion["source_image_checksum_sha256"]:
                    raise RuntimeError(f"promoted image checksum changed: {image_path}")
                with Image.open(image_path) as opened:
                    fitted = ImageOps.fit(
                        ImageOps.exif_transpose(opened).convert("RGB"),
                        (224, 224),
                        method=Image.Resampling.BICUBIC,
                    )
                    arrays.append(np.transpose(np.asarray(fitted, dtype=np.float32) / 255.0, (2, 0, 1)))
            pixels = self.torch.from_numpy(np.stack(arrays)).to(self.device)
            pixels = (pixels - self.mean) / self.std
            with self.torch.inference_mode():
                vectors = self.model(pixels)
                vectors = self.torch.nn.functional.normalize(vectors.float(), p=2, dim=1)
            for promotion, vector in zip(batch, vectors.cpu().numpy().astype(np.float32), strict=True):
                norm = float(np.linalg.norm(vector))
                if vector.size != MODEL_DIMENSIONS or not np.all(np.isfinite(vector)) or not 0.999 <= norm <= 1.001:
                    raise RuntimeError(f"DINOv2 returned an invalid vector for {promotion['variant_id']}")
                output.append({
                    "variantId": promotion["variant_id"],
                    "referenceAssetId": promotion["reference_asset_id"],
                    "sourceImageId": promotion["source_image_id"],
                    "languageCode": promotion["language_code"],
                    "embedding": [float(format(float(value), ".9g")) for value in vector],
                    "embeddingNorm": norm,
                    "preprocessingSha256": PREPROCESSING_SHA256,
                    "sourceImageSha256": promotion["source_image_checksum_sha256"],
                })
        return output


def build(args: argparse.Namespace) -> dict[str, Any]:
    approved = json.loads(args.approved.read_text(encoding="utf-8"))
    committed = json.loads(args.committed.read_text(encoding="utf-8"))
    verify_manifest(approved, APPROVED_SCHEMA)
    verify_manifest(committed, COMMITTED_SCHEMA)
    if committed.get("approvalManifestSha256") != approved.get("manifestSha256"):
        raise RuntimeError("committed assets do not match the approved promotion manifest")
    if approved.get("status") != "validated_inactive" or approved.get("commitEligible") is not True:
        raise RuntimeError("approved promotion manifest is not commit eligible")

    approved_by_variant = {str(item["variantId"]): item for item in approved.get("promotions", [])}
    new_assets = [
        item for item in committed.get("assets", [])
        if item.get("status") in ("committed", "reused_committed")
    ]
    if not new_assets:
        raise RuntimeError("no newly committed or idempotently reusable recognition assets were supplied")
    if any(item.get("status") == "already_eligible" for item in committed.get("assets", [])):
        raise RuntimeError("an approved variant changed eligibility during the controlled run")

    model_sha256 = sha256_file(args.model_checkpoint)
    if model_sha256 != args.model_sha256:
        raise RuntimeError("model checkpoint SHA-256 does not match the operator value")
    client = SupabaseClient(
        required_environment("SUPABASE_URL"),
        required_environment("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
        args.rpc_timeout,
        args.retries,
    )
    active_before = active_index_snapshot(client)
    if not active_before:
        raise RuntimeError("staging has no active recognition index to protect")
    source_index = index_row(client, args.source_index_id)
    source_scope = source_index.get("completeness_report", {}).get("scope", {})
    if (
        source_index.get("model_id") != MODEL_ID
        or int(source_index.get("embedding_dimensions") or 0) != MODEL_DIMENSIONS
        or source_index.get("status") != "validated"
        or source_scope.get("preprocessingSha256") != PREPROCESSING_SHA256
        or not source_index.get("checksum_sha256")
    ):
        raise RuntimeError("source index is not the compatible validated DINOv2 index")

    source_rows = source_embedding_rows(client, args.source_index_id, args.page_size)
    source_variants = {str(UUID(str(row["variant_id"]))) for row in source_rows}
    if len(source_variants) != len(source_rows):
        raise RuntimeError("source index does not contain exactly one embedding per variant")
    if int(source_index.get("reference_embedding_count") or -1) != len(source_rows):
        raise RuntimeError("source index row count does not match its validated manifest")

    incremental: list[dict[str, Any]] = []
    for asset in new_assets:
        variant_id = str(UUID(str(asset["variantId"])))
        approval = approved_by_variant.get(variant_id)
        if approval is None:
            raise RuntimeError(f"committed asset was not approved: {variant_id}")
        selected = approval["selectedCandidate"]
        checksum = str(asset.get("content_sha256") or "")
        if checksum != selected.get("rectifiedSha256"):
            raise RuntimeError(f"stored and approved image checksums disagree: {variant_id}")
        if variant_id in source_variants:
            raise RuntimeError(f"new reference duplicates a source-index variant: {variant_id}")
        language = str(approval["fingerprint"]["languageCode"])
        if language not in LAUNCH_LANGUAGES:
            raise RuntimeError(f"new reference has a non-launch language: {language}")
        incremental.append({
            "variant_id": variant_id,
            "reference_asset_id": str(UUID(str(asset["id"]))),
            "source_image_id": str(asset["asset_id"]),
            "language_code": language,
            "source_image_checksum_sha256": checksum,
            "image_path": selected["imagePath"],
        })
    if len({item["variant_id"] for item in incremental}) != len(incremental):
        raise RuntimeError("committed manifest contains duplicate variants")

    frozen_rows = [
        {
            "variant_id": str(row["variant_id"]),
            "reference_asset_id": str(row["reference_asset_id"]),
            "source_image_id": str(row["source_image_id"]),
            "language_code": str(row["language_code"]),
            "source_image_checksum_sha256": str(row["source_image_checksum_sha256"]),
        }
        for row in source_rows
    ] + [
        {key: item[key] for key in (
            "variant_id", "reference_asset_id", "source_image_id", "language_code", "source_image_checksum_sha256"
        )}
        for item in incremental
    ]
    expected_variants = {item["variant_id"] for item in frozen_rows}
    current_eligible_variants = eligible_variant_ids(client, args.page_size)
    if current_eligible_variants != expected_variants:
        missing = sorted(current_eligible_variants - expected_variants)[:20]
        extra = sorted(expected_variants - current_eligible_variants)[:20]
        raise RuntimeError(f"frozen manifest does not reconcile to current eligibility; missing={missing}, extra={extra}")

    frozen_manifest_sha256 = manifest_sha256(frozen_rows)
    language_counts = dict(sorted(Counter(item["language_code"] for item in frozen_rows).items()))
    if tuple(language_counts) != LAUNCH_LANGUAGES:
        raise RuntimeError(f"frozen manifest does not contain all launch languages: {language_counts}")
    scope = {
        "sourceIndexVersionId": args.source_index_id,
        "sourceIndexVersion": source_index["index_version"],
        "languages": language_counts,
        "launchLanguages": list(LAUNCH_LANGUAGES),
        "modelSha256": model_sha256,
        "preprocessingSha256": PREPROCESSING_SHA256,
        "promotionApprovalManifestSha256": approved["manifestSha256"],
        "promotionCommitManifestSha256": committed["manifestSha256"],
        "reusedEmbeddingCount": len(source_rows),
        "newlyGeneratedEmbeddingCount": len(incremental),
        "productionModified": False,
    }
    index_version_id = str(UUID(str(client.rpc(
        "prepare_recognition_embedding_index",
        {
            "p_model_id": MODEL_ID,
            "p_index_version": args.index_version,
            "p_embedding_dimensions": MODEL_DIMENSIONS,
            "p_manifest_sha256": frozen_manifest_sha256,
            "p_expected_count": len(frozen_rows),
            "p_scope": scope,
        },
    ))))

    after_variant_id: str | None = None
    reused = 0
    while True:
        response = client.rpc(
            "copy_recognition_embedding_public_subset_batch",
            {
                "p_source_index_version_id": args.source_index_id,
                "p_target_index_version_id": index_version_id,
                "p_after_variant_id": after_variant_id,
                "p_limit": args.copy_batch_size,
            },
        )
        if not isinstance(response, dict):
            raise RuntimeError("controlled embedding copy returned an invalid payload")
        batch_count = int(response.get("batchCount") or 0)
        inserted_count = int(response.get("insertedCount") or 0)
        if batch_count != inserted_count:
            raise RuntimeError("controlled embedding copy did not insert its complete batch")
        reused += inserted_count
        after_variant_id = response.get("lastVariantId")
        if batch_count == 0:
            break
        if not after_variant_id:
            raise RuntimeError("controlled embedding copy lost its pagination cursor")
    if reused != len(source_rows):
        raise RuntimeError(f"reused embedding count mismatch: {reused} != {len(source_rows)}")

    embedder = Dinov2Embedder(args.torch_hub_repo, args.model_checkpoint, args.model_sha256, args.device)
    new_embedding_rows = embedder.embed(incremental, args.embedding_batch_size)
    inserted_new = 0
    for offset in range(0, len(new_embedding_rows), 50):
        batch = new_embedding_rows[offset : offset + 50]
        affected = int(client.rpc(
            "upsert_recognition_embedding_batch",
            {"p_index_version_id": index_version_id, "p_rows": batch},
        ))
        if affected != len(batch):
            raise RuntimeError("controlled embedding upsert did not accept the complete batch")
        inserted_new += affected
    if inserted_new != len(incremental):
        raise RuntimeError("new embedding count does not reconcile")

    verified = client.rpc("verify_recognition_embedding_manifest", {"p_index_version_id": index_version_id})
    if not isinstance(verified, dict) or verified.get("manifestVerified") is not True:
        raise RuntimeError("candidate index manifest verification failed")
    finalization = client.rpc(
        "finalize_published_recognition_embedding_index",
        {"p_index_version_id": index_version_id, "p_source_index_version_id": args.source_index_id},
    )
    if not isinstance(finalization, dict) or finalization.get("status") != "validated" or finalization.get("activated") is not False:
        raise RuntimeError("candidate index did not finalize as validated and inactive")

    candidate = index_row(client, index_version_id)
    active_after = active_index_snapshot(client)
    if canonical_json(active_after) != canonical_json(active_before):
        raise RuntimeError("the existing active recognition index changed during the inactive build")
    health = candidate.get("health_report") or {}
    if (
        candidate.get("status") != "validated"
        or int(candidate.get("reference_embedding_count") or -1) != len(frozen_rows)
        or int(candidate.get("missing_embedding_count") or -1) != 0
        or int(health.get("invalidReferenceCount") or 0) != 0
        or int(health.get("duplicateVariantCount") or 0) != 0
    ):
        raise RuntimeError("validated candidate index failed its final acceptance checks")

    body = {
        "schemaVersion": EVIDENCE_SCHEMA,
        "generatedAt": utc_now(),
        "status": "validated_inactive",
        "projectRef": STAGING_PROJECT_REF,
        "before": {
            "sourceIndexId": args.source_index_id,
            "sourceIndexVersion": source_index["index_version"],
            "sourceEmbeddingCount": len(source_rows),
            "activeIndexes": active_before,
            "approvedPromotionCount": int(approved["approvedVariantCount"]),
        },
        "change": {
            "committedReferenceCount": len(incremental),
            "reusedEmbeddingCount": reused,
            "newlyGeneratedEmbeddingCount": inserted_new,
            "boundedCopyBatchSize": args.copy_batch_size,
            "boundedEmbeddingBatchSize": args.embedding_batch_size,
        },
        "after": {
            "candidateIndexId": index_version_id,
            "candidateIndexVersion": args.index_version,
            "status": candidate["status"],
            "activated": False,
            "finalEmbeddingCount": len(frozen_rows),
            "missingCount": 0,
            "duplicateVariantEmbeddingCount": 0,
            "orphanedEmbeddingCount": 0,
            "deprecatedAssetEmbeddingCount": 0,
            "invalidReferenceCount": 0,
            "invalidDimensionCount": 0,
            "nonFiniteVectorCount": 0,
            "invalidNormCount": 0,
            "sourceChecksumMismatchCount": 0,
            "languageCounts": language_counts,
            "languageTotalsReconciled": True,
            "manifestVerified": True,
            "activeIndexes": active_after,
            "activeIndexUnchanged": True,
            "indexChecksumSha256": candidate["checksum_sha256"],
        },
        "model": {
            "modelId": MODEL_ID,
            "embeddingDimensions": MODEL_DIMENSIONS,
            "checkpointSha256": model_sha256,
            "preprocessing": PREPROCESSING_SPEC,
            "preprocessingSha256": PREPROCESSING_SHA256,
            "device": str(embedder.device),
        },
        "integrity": {
            "frozenManifestSha256": frozen_manifest_sha256,
            "approvalManifestSha256": approved["manifestSha256"],
            "commitManifestSha256": committed["manifestSha256"],
            "approvalFileSha256": sha256_file(args.approved),
            "commitFileSha256": sha256_file(args.committed),
        },
        "remainingGap": {
            "unapprovedEvidenceVariantCount": int(approved["preparedVariantCount"]) - int(approved["approvedVariantCount"]),
            "exclusions": approved.get("exclusions", []),
        },
        "productionModified": False,
        "stagingModified": True,
    }
    result = {**body, "manifestSha256": sha256_bytes(canonical_json(body))}
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    with args.evidence.open("x", encoding="utf-8") as handle:
        json.dump(result, handle, allow_nan=False, ensure_ascii=False, indent=2)
        handle.write("\n")
    client.close()
    return result


def preflight(args: argparse.Namespace) -> dict[str, Any]:
    client = SupabaseClient(
        required_environment("SUPABASE_URL"),
        required_environment("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
        args.rpc_timeout,
        args.retries,
    )
    active_indexes = active_index_snapshot(client)
    source_index = index_row(client, args.source_index_id)
    source_rows = source_embedding_rows(client, args.source_index_id, args.page_size)
    source_variants = {str(UUID(str(row["variant_id"]))) for row in source_rows}
    eligible_variants = eligible_variant_ids(client, args.page_size)
    source_scope = source_index.get("completeness_report", {}).get("scope", {})
    if not active_indexes:
        raise RuntimeError("staging has no active recognition index to protect")
    if (
        source_index.get("model_id") != MODEL_ID
        or int(source_index.get("embedding_dimensions") or 0) != MODEL_DIMENSIONS
        or source_index.get("status") != "validated"
        or source_scope.get("preprocessingSha256") != PREPROCESSING_SHA256
        or int(source_index.get("reference_embedding_count") or -1) != len(source_rows)
        or len(source_variants) != len(source_rows)
    ):
        raise RuntimeError("source recognition index failed the incremental-build preflight")
    if source_variants != eligible_variants:
        raise RuntimeError("source recognition index no longer reconciles to staging recognition eligibility")
    body = {
        "schemaVersion": "stackr-ebay-incremental-recognition-index-preflight-v1.0.0",
        "generatedAt": utc_now(),
        "projectRef": STAGING_PROJECT_REF,
        "status": "passed_read_only",
        "sourceIndexId": args.source_index_id,
        "sourceIndexVersion": source_index["index_version"],
        "sourceEmbeddingCount": len(source_rows),
        "eligibleVariantCount": len(eligible_variants),
        "activeIndexes": active_indexes,
        "preprocessingSha256": PREPROCESSING_SHA256,
        "stagingModified": False,
        "productionModified": False,
    }
    result = {**body, "manifestSha256": sha256_bytes(canonical_json(body))}
    args.evidence.parent.mkdir(parents=True, exist_ok=True)
    with args.evidence.open("x", encoding="utf-8") as handle:
        json.dump(result, handle, allow_nan=False, ensure_ascii=False, indent=2)
        handle.write("\n")
    client.close()
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a validated inactive incremental Stackr recognition index in staging.")
    parser.add_argument("--phase", required=True, choices=("preflight", "build"))
    parser.add_argument("--approved", type=Path)
    parser.add_argument("--committed", type=Path)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument("--source-index-id", required=True)
    parser.add_argument("--index-version")
    parser.add_argument("--torch-hub-repo", type=Path)
    parser.add_argument("--model-checkpoint", type=Path)
    parser.add_argument("--model-sha256")
    parser.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    parser.add_argument("--page-size", type=int, default=1000)
    parser.add_argument("--copy-batch-size", type=int, default=2000)
    parser.add_argument("--embedding-batch-size", type=int, default=24)
    parser.add_argument("--rpc-timeout", type=float, default=120.0)
    parser.add_argument("--retries", type=int, default=4)
    args = parser.parse_args()
    args.evidence = args.evidence.resolve()
    args.source_index_id = str(UUID(args.source_index_id))
    if not 1 <= args.page_size <= 1000:
        raise RuntimeError("--page-size must be between 1 and 1000")
    if not 1 <= args.copy_batch_size <= 2000:
        raise RuntimeError("--copy-batch-size must be between 1 and 2000")
    if not 1 <= args.embedding_batch_size <= 50:
        raise RuntimeError("--embedding-batch-size must be between 1 and 50")
    if args.phase == "preflight":
        evidence = preflight(args)
        print(json.dumps({
            "ok": True,
            "status": evidence["status"],
            "sourceIndexId": evidence["sourceIndexId"],
            "sourceEmbeddingCount": evidence["sourceEmbeddingCount"],
            "eligibleVariantCount": evidence["eligibleVariantCount"],
            "stagingModified": False,
            "productionModified": False,
            "evidence": str(args.evidence),
        }, indent=2))
        return
    missing = [
        name for name in ("approved", "committed", "index_version", "torch_hub_repo", "model_checkpoint", "model_sha256")
        if getattr(args, name) in (None, "")
    ]
    if missing:
        raise RuntimeError(f"build phase is missing required arguments: {', '.join(missing)}")
    args.approved = args.approved.resolve()
    args.committed = args.committed.resolve()
    args.torch_hub_repo = args.torch_hub_repo.resolve()
    args.model_checkpoint = args.model_checkpoint.resolve()
    evidence = build(args)
    print(json.dumps({
        "ok": True,
        "status": evidence["status"],
        "candidateIndexId": evidence["after"]["candidateIndexId"],
        "finalEmbeddingCount": evidence["after"]["finalEmbeddingCount"],
        "reusedEmbeddingCount": evidence["change"]["reusedEmbeddingCount"],
        "newlyGeneratedEmbeddingCount": evidence["change"]["newlyGeneratedEmbeddingCount"],
        "missingCount": evidence["after"]["missingCount"],
        "activated": evidence["after"]["activated"],
        "productionModified": False,
        "evidence": str(args.evidence),
    }, indent=2))


if __name__ == "__main__":
    main()
