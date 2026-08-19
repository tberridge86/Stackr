#!/usr/bin/env python3
"""Build API-shaped StackR snapshots from the TCGdex cards-database repository.

The source repository is substantially faster and more reproducible than making one
HTTP request per card. This script deliberately imports metadata only. Artwork URLs
are retained as metadata but no image bytes are downloaded or published here.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import sys
from collections import defaultdict
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

try:
    import yaml
except ImportError as exc:  # pragma: no cover - workflow installs pinned PyYAML
    raise SystemExit("PyYAML is required: python -m pip install PyYAML==6.0.2") from exc

SUPPORTED_LANGUAGES = ("en", "ja", "zh-tw", "zh-cn", "ko")
LANGUAGE_ALIASES = {
    "en": "en",
    "eng": "en",
    "english": "en",
    "ja": "ja",
    "jp": "ja",
    "jpn": "ja",
    "japanese": "ja",
    "ko": "ko",
    "kr": "ko",
    "kor": "ko",
    "korean": "ko",
    "zh-tw": "zh-tw",
    "zh_tw": "zh-tw",
    "zhtw": "zh-tw",
    "tw": "zh-tw",
    "tc": "zh-tw",
    "traditional-chinese": "zh-tw",
    "traditional_chinese": "zh-tw",
    "zh-cn": "zh-cn",
    "zh_cn": "zh-cn",
    "zhcn": "zh-cn",
    "cn": "zh-cn",
    "sc": "zh-cn",
    "simplified-chinese": "zh-cn",
    "simplified_chinese": "zh-cn",
}
DATA_SUFFIXES = {".json", ".yaml", ".yml"}
SKIPPED_DIRECTORIES = {
    ".git",
    ".github",
    "node_modules",
    "vendor",
    "coverage",
    "dist",
    "build",
    "__pycache__",
}


@dataclass(frozen=True)
class SourceDocument:
    language: str
    path: Path
    payload: dict[str, Any]


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def normalise_language(value: Any) -> str | None:
    raw = clean_text(value)
    if not raw:
        return None
    compact = raw.lower().replace(" ", "-")
    return LANGUAGE_ALIASES.get(compact)


def stable_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def payload_hash(value: Any) -> str:
    return hashlib.sha256(stable_json(value).encode("utf-8")).hexdigest()


def natural_key(value: Any) -> tuple[Any, ...]:
    text = clean_text(value) or ""
    return tuple(int(part) if part.isdigit() else part.casefold() for part in re.split(r"(\d+)", text))


def path_language(path: Path, root: Path) -> str | None:
    try:
        relative = path.relative_to(root)
    except ValueError:
        relative = path
    for part in relative.parts:
        candidates = {
            part,
            part.lower(),
            part.lower().replace("_", "-"),
            part.lower().replace(" ", "-"),
        }
        for candidate in candidates:
            language = LANGUAGE_ALIASES.get(candidate)
            if language:
                return language
    return None


def payload_language(payload: dict[str, Any]) -> str | None:
    candidates = [
        payload.get("language"),
        payload.get("languageCode"),
        payload.get("language_code"),
        payload.get("locale"),
    ]
    for candidate in candidates:
        language = normalise_language(candidate)
        if language:
            return language
    return None


def load_file(path: Path) -> list[Any]:
    text = path.read_text(encoding="utf-8")
    if path.suffix.lower() == ".json":
        return [json.loads(text)]
    return list(yaml.safe_load_all(text))


def top_level_records(value: Any, path: Path) -> Iterable[dict[str, Any]]:
    if isinstance(value, list):
        for item in value:
            if isinstance(item, dict):
                yield item
        return
    if not isinstance(value, dict):
        return

    path_tokens = {part.lower() for part in path.parts}
    collection_keys = ("data", "items", "results", "cards", "sets")
    for key in collection_keys:
        nested = value.get(key)
        if not isinstance(nested, list):
            continue
        # Index/aggregate documents should emit their contained records. A set
        # file containing cards remains a set document and is handled later.
        if key in {"cards", "sets"} and ("sets" in path_tokens or "set" in path_tokens):
            continue
        if all(isinstance(item, dict) for item in nested):
            for item in nested:
                yield item
            return
    yield value


def discover_documents(root: Path, selected_languages: set[str]) -> tuple[list[SourceDocument], list[dict[str, str]]]:
    documents: list[SourceDocument] = []
    errors: list[dict[str, str]] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in DATA_SUFFIXES:
            continue
        relative_parts = set(path.relative_to(root).parts)
        if relative_parts.intersection(SKIPPED_DIRECTORIES):
            continue
        detected_from_path = path_language(path, root)
        try:
            loaded_documents = load_file(path)
        except Exception as exc:  # noqa: BLE001 - preserve source error in manifest
            errors.append({"path": str(path.relative_to(root)), "error": str(exc)[:500]})
            continue
        for loaded in loaded_documents:
            for payload in top_level_records(loaded, path):
                language = payload_language(payload) or detected_from_path
                if language not in selected_languages:
                    continue
                documents.append(SourceDocument(language=language, path=path, payload=payload))
    return documents, errors


def path_kind(path: Path) -> str | None:
    tokens = [part.lower() for part in path.parts]
    if any(token in {"cards", "card"} for token in tokens):
        return "card"
    if any(token in {"sets", "set", "expansions"} for token in tokens):
        return "set"
    if any(token in {"series", "serie"} for token in tokens):
        return "series"
    return None


def looks_like_card(payload: dict[str, Any], path: Path) -> bool:
    if path_kind(path) == "card":
        return True
    has_number = any(clean_text(payload.get(key)) for key in (
        "localId",
        "local_id",
        "number",
        "collectorNumber",
        "collector_number",
        "card_number",
    ))
    has_card_identity = clean_text(payload.get("id")) and clean_text(payload.get("name"))
    has_set_reference = any(payload.get(key) is not None for key in ("set", "setId", "set_id", "expansion"))
    return bool(has_card_identity and has_number and (has_set_reference or path_kind(path) != "set"))


def looks_like_set(payload: dict[str, Any], path: Path) -> bool:
    if path_kind(path) == "set":
        return True
    if looks_like_card(payload, path):
        return False
    return bool(
        clean_text(payload.get("id"))
        and clean_text(payload.get("name"))
        and any(payload.get(key) is not None for key in (
            "cardCount",
            "card_count",
            "printedTotal",
            "printed_total",
            "releaseDate",
            "release_date",
            "serie",
            "series",
            "cards",
        ))
    )


def richness(value: dict[str, Any]) -> int:
    score = 0
    for field_value in value.values():
        if field_value is None or field_value == "" or field_value == [] or field_value == {}:
            continue
        score += 1
        if isinstance(field_value, (dict, list)):
            score += min(len(field_value), 10)
    return score


def merge_values(left: Any, right: Any) -> Any:
    if left in (None, "", [], {}):
        return deepcopy(right)
    if right in (None, "", [], {}):
        return deepcopy(left)
    if isinstance(left, dict) and isinstance(right, dict):
        merged = deepcopy(left)
        for key, value in right.items():
            merged[key] = merge_values(merged.get(key), value) if key in merged else deepcopy(value)
        return merged
    if isinstance(left, list) and isinstance(right, list):
        seen: set[str] = set()
        merged_list: list[Any] = []
        for item in [*left, *right]:
            key = stable_json(item)
            if key in seen:
                continue
            seen.add(key)
            merged_list.append(deepcopy(item))
        return merged_list
    return deepcopy(right if richness({"value": right}) > richness({"value": left}) else left)


def preferred_record(existing: dict[str, Any] | None, candidate: dict[str, Any]) -> dict[str, Any]:
    if existing is None:
        return deepcopy(candidate)
    if richness(candidate) > richness(existing):
        return merge_values(candidate, existing)
    return merge_values(existing, candidate)


def source_set_id(value: Any) -> str | None:
    if isinstance(value, dict):
        return clean_text(value.get("id") or value.get("code") or value.get("slug"))
    return clean_text(value)


def infer_set_id(payload: dict[str, Any], path: Path, set_ids: set[str]) -> str | None:
    explicit = source_set_id(
        payload.get("set")
        or payload.get("setId")
        or payload.get("set_id")
        or payload.get("expansion")
        or payload.get("expansionId")
    )
    if explicit:
        return explicit

    path_parts = [part.casefold() for part in path.parts]
    matches = [set_id for set_id in set_ids if set_id.casefold() in path_parts]
    if matches:
        return max(matches, key=len)

    card_id = clean_text(payload.get("id")) or ""
    prefix_matches = [
        set_id for set_id in set_ids
        if card_id.casefold().startswith(f"{set_id.casefold()}-")
        or card_id.casefold().startswith(f"{set_id.casefold()}_")
        or card_id.casefold().startswith(f"{set_id.casefold()}:")
    ]
    return max(prefix_matches, key=len) if prefix_matches else None


def normalise_card_number(payload: dict[str, Any]) -> str | None:
    return clean_text(
        payload.get("localId")
        or payload.get("local_id")
        or payload.get("number")
        or payload.get("collectorNumber")
        or payload.get("collector_number")
        or payload.get("card_number")
    )


def normalise_set(raw: dict[str, Any]) -> dict[str, Any] | None:
    set_id = clean_text(raw.get("id") or raw.get("code") or raw.get("slug"))
    if not set_id:
        return None
    result = deepcopy(raw)
    result["id"] = set_id
    if not clean_text(result.get("name")):
        result["name"] = clean_text(raw.get("localName") or raw.get("local_name")) or set_id
    if result.get("releaseDate") is None and raw.get("release_date") is not None:
        result["releaseDate"] = raw.get("release_date")
    if result.get("serie") is None and raw.get("series") is not None:
        result["serie"] = raw.get("series")
    if result.get("printedTotal") is None and raw.get("printed_total") is not None:
        result["printedTotal"] = raw.get("printed_total")
    if result.get("cardCount") is None and isinstance(raw.get("card_count"), dict):
        result["cardCount"] = deepcopy(raw["card_count"])
    return result


def normalise_card(
    raw: dict[str, Any],
    path: Path,
    sets: dict[str, dict[str, Any]],
) -> tuple[dict[str, Any] | None, str | None]:
    set_id = infer_set_id(raw, path, set(sets))
    number = normalise_card_number(raw)
    card_id = clean_text(raw.get("id") or raw.get("uuid") or raw.get("slug"))
    if not card_id and set_id and number:
        card_id = f"{set_id}-{number}"
    if not card_id:
        return None, set_id

    result = deepcopy(raw)
    result["id"] = card_id
    if number:
        result["localId"] = number
    if not clean_text(result.get("name")):
        result["name"] = clean_text(raw.get("localName") or raw.get("local_name")) or card_id

    if result.get("image") is None:
        images = raw.get("images") if isinstance(raw.get("images"), dict) else {}
        result["image"] = clean_text(images.get("large") or images.get("small") or raw.get("image_url"))

    if set_id:
        set_payload = sets.get(set_id, {"id": set_id})
        existing_set = result.get("set") if isinstance(result.get("set"), dict) else {}
        result["set"] = merge_values(
            {
                "id": set_id,
                "name": set_payload.get("name"),
                "cardCount": set_payload.get("cardCount"),
                "releaseDate": set_payload.get("releaseDate"),
                "serie": set_payload.get("serie") or set_payload.get("series"),
            },
            existing_set,
        )
    return result, set_id


def card_reference(card: dict[str, Any]) -> dict[str, Any]:
    reference = {
        "id": card.get("id"),
        "localId": card.get("localId") or card.get("number"),
        "name": card.get("name"),
        "image": card.get("image"),
    }
    return {key: value for key, value in reference.items() if value not in (None, "")}


def build_language_snapshot(
    language: str,
    documents: list[SourceDocument],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, Any]]:
    set_records: dict[str, dict[str, Any]] = {}
    card_documents: list[SourceDocument] = []
    unclassified = 0

    for document in documents:
        if document.language != language:
            continue
        if looks_like_set(document.payload, document.path):
            normalised = normalise_set(document.payload)
            if normalised:
                set_id = str(normalised["id"])
                set_records[set_id] = preferred_record(set_records.get(set_id), normalised)
            continue
        if looks_like_card(document.payload, document.path):
            card_documents.append(document)
        else:
            unclassified += 1

    card_records: dict[str, dict[str, Any]] = {}
    card_set_ids: dict[str, str | None] = {}
    orphan_paths: list[str] = []
    for document in card_documents:
        card, set_id = normalise_card(document.payload, document.path, set_records)
        if not card:
            continue
        card_id = str(card["id"])
        card_records[card_id] = preferred_record(card_records.get(card_id), card)
        card_set_ids[card_id] = set_id or card_set_ids.get(card_id)
        if not set_id and len(orphan_paths) < 100:
            orphan_paths.append(str(document.path))

    cards_by_set: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for card_id, card in card_records.items():
        set_id = card_set_ids.get(card_id)
        if set_id:
            cards_by_set[set_id].append(card_reference(card))

    for set_id, set_record in set_records.items():
        references = cards_by_set.get(set_id, [])
        references.sort(key=lambda item: (natural_key(item.get("localId")), natural_key(item.get("id"))))
        if references:
            set_record["cards"] = references
        card_count = set_record.get("cardCount") if isinstance(set_record.get("cardCount"), dict) else {}
        if references and not card_count.get("total"):
            card_count["total"] = len(references)
        printed_total = set_record.get("printedTotal") or set_record.get("printed_total")
        if printed_total is not None and not card_count.get("official"):
            card_count["official"] = printed_total
        if card_count:
            set_record["cardCount"] = card_count

    sets = sorted(set_records.values(), key=lambda item: (natural_key(item.get("releaseDate")), natural_key(item.get("id"))))
    cards = sorted(card_records.values(), key=lambda item: (
        natural_key(source_set_id(item.get("set"))),
        natural_key(item.get("localId") or item.get("number")),
        natural_key(item.get("id")),
    ))

    missing_set = sum(1 for card_id in card_records if not card_set_ids.get(card_id))
    report = {
        "language": language,
        "sets": len(sets),
        "cards": len(cards),
        "orphanCards": missing_set,
        "orphanRatio": round(missing_set / len(cards), 6) if cards else 0,
        "orphanPathSamples": orphan_paths,
        "unclassifiedDocuments": unclassified,
        "missingCardName": sum(1 for card in cards if not clean_text(card.get("name"))),
        "missingCollectorNumber": sum(1 for card in cards if not normalise_card_number(card)),
        "missingSetName": sum(1 for item in sets if not clean_text(item.get("name"))),
        "missingReleaseDate": sum(1 for item in sets if not clean_text(item.get("releaseDate"))),
    }
    return sets, cards, report


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--languages", default=",".join(SUPPORTED_LANGUAGES))
    parser.add_argument("--source-version", default="unknown")
    parser.add_argument("--batch-size", type=int, default=1000)
    parser.add_argument("--minimum-cards", type=int, default=1)
    parser.add_argument("--maximum-orphan-ratio", type=float, default=0.1)
    parser.add_argument("--matrix-output", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    database_root = args.database_root.resolve()
    output_root = args.output_root.resolve()
    if not database_root.is_dir():
        raise SystemExit(f"TCGdex database root does not exist: {database_root}")
    if args.batch_size < 50 or args.batch_size > 10000:
        raise SystemExit("--batch-size must be between 50 and 10000")

    languages = []
    for value in args.languages.split(","):
        language = normalise_language(value)
        if not language or language not in SUPPORTED_LANGUAGES:
            raise SystemExit(f"Unsupported language in --languages: {value}")
        if language not in languages:
            languages.append(language)

    documents, parse_errors = discover_documents(database_root, set(languages))
    if not documents:
        raise SystemExit("No selected-language TCGdex documents were discovered.")

    language_reports: dict[str, Any] = {}
    matrices: list[dict[str, Any]] = []
    failures: list[str] = []

    for language in languages:
        sets, cards, report = build_language_snapshot(language, documents)
        language_root = output_root / language
        write_json(language_root / "sets.json", sets)
        write_json(language_root / "cards.json", cards)
        report["setsSha256"] = payload_hash(sets)
        report["cardsSha256"] = payload_hash(cards)
        language_reports[language] = report

        if len(cards) < args.minimum_cards:
            failures.append(f"{language} has only {len(cards)} cards (minimum {args.minimum_cards})")
        if report["orphanRatio"] > args.maximum_orphan_ratio:
            failures.append(
                f"{language} orphan ratio {report['orphanRatio']:.2%} exceeds {args.maximum_orphan_ratio:.2%}"
            )

        batch_count = max(1, math.ceil(len(cards) / args.batch_size))
        for batch_index in range(batch_count):
            offset = batch_index * args.batch_size
            matrices.append({
                "language": language,
                "batch": batch_index + 1,
                "offset": offset,
                "limit": min(args.batch_size, max(0, len(cards) - offset)),
                "cards": len(cards),
                "sourceVersion": args.source_version,
            })

    manifest = {
        "schemaVersion": 1,
        "source": "tcgdex/cards-database",
        "sourceVersion": args.source_version,
        "languages": language_reports,
        "documentsDiscovered": len(documents),
        "parseErrorCount": len(parse_errors),
        "parseErrors": parse_errors[:250],
        "batchSize": args.batch_size,
        "matrixEntries": len(matrices),
        "manifestSha256": None,
    }
    manifest["manifestSha256"] = payload_hash({key: value for key, value in manifest.items() if key != "manifestSha256"})
    write_json(output_root / "snapshot-manifest.json", manifest)
    matrix = {"include": matrices}
    write_json(output_root / "matrix.json", matrix)
    if args.matrix_output:
        write_json(args.matrix_output, matrix)

    print(json.dumps({
        "ok": not failures,
        "outputRoot": str(output_root),
        "sourceVersion": args.source_version,
        "languages": language_reports,
        "matrixEntries": len(matrices),
        "parseErrors": len(parse_errors),
        "failures": failures,
    }, ensure_ascii=False, indent=2))

    if failures:
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
