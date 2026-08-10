from __future__ import annotations

import re
import unicodedata
from difflib import SequenceMatcher


def clean(value: object) -> str | None:
    text = str(value or "").strip()
    return text or None


def normalize_text(value: object) -> str:
    text = unicodedata.normalize("NFKC", str(value or ""))
    text = unicodedata.normalize("NFD", text)
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.lower().replace("pokémon", "pokemon")
    text = re.sub(r"[^a-z0-9\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af/-]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def compact_text(value: object) -> str:
    return normalize_text(value).replace(" ", "")


def normalize_collector_number(value: object) -> str | None:
    raw = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    if not raw:
        return None
    parts = []
    for part in raw.replace(" ", "").split("/"):
        parts.append(re.sub(r"(^|[^0-9])0+(?=\d)", r"\1", part))
    return "/".join(parts)


def collector_matches(left: object, right: object) -> bool:
    candidate = normalize_collector_number(left)
    hint = normalize_collector_number(right)
    if not candidate or not hint:
        return False
    if candidate == hint:
        return True
    if "/" not in hint:
        return candidate.split("/")[0] == hint
    return False


def text_similarity(left: object, right: object) -> float:
    a = compact_text(left)
    b = compact_text(right)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(a=a, b=b).ratio()


def parse_hints(ocr_text: str | None, collector_hint: str | None, set_hint: str | None) -> dict[str, str | None]:
    text = unicodedata.normalize("NFKC", ocr_text or "")
    collector = normalize_collector_number(collector_hint)
    if not collector:
        match = re.search(r"\b([A-Z]?[0-9]{1,4}[a-zA-Z]?/[0-9]{1,4}[a-zA-Z]?)\b", text, re.I)
        collector = normalize_collector_number(match.group(1)) if match else None
    if not collector:
        match = re.search(r"\b([A-Z]?[0-9]{1,4}[a-zA-Z]?)\b", text, re.I)
        collector = normalize_collector_number(match.group(1)) if match else None

    set_code = clean(set_hint)
    if not set_code:
        match = re.search(r"\b([A-Z]{1,4}[0-9][A-Z0-9-]{0,8})\b", text, re.I)
        set_code = match.group(1) if match else None

    return {
        "collector_number": collector,
        "set_code": set_code,
    }
