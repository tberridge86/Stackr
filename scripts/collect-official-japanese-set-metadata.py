#!/usr/bin/env python3
"""Collect a complete Japanese Pokémon set checklist from the official card database.

The collector is deliberately read-only. It retains official card IDs, detail URLs and
image URLs as provenance but does not download images or write to StackR databases.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urljoin
from urllib.request import Request, urlopen

from bs4 import BeautifulSoup

BASE_URL = "https://www.pokemon-card.com"
API_URL = f"{BASE_URL}/card-search/resultAPI.php"
SET_CODE_PATTERN = re.compile(r"^[A-Za-z0-9+._:-]+$")
PRINTED_NUMBER_PATTERN = re.compile(r"^([0-9A-Za-z+._-]+)\s*/\s*([0-9A-Za-z+._-]+)$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--set-code", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--max-results", type=int, default=600)
    parser.add_argument("--minimum-delay-ms", type=int, default=650)
    return parser.parse_args()


def request_bytes(
    url: str,
    *,
    accept: str,
    ajax: bool = False,
    attempts: int = 3,
) -> bytes:
    headers = {
        "User-Agent": "StackR-Catalogue-Audit/1.0 (+https://stackrtcg.com)",
        "Accept-Language": "ja,en-GB;q=0.8,en;q=0.7",
        "Referer": f"{BASE_URL}/card-search/",
        "Accept": accept,
    }
    if ajax:
        headers["X-Requested-With"] = "XMLHttpRequest"

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = Request(url, headers=headers)
            with urlopen(request, timeout=40) as response:
                return response.read()
        except (HTTPError, URLError, TimeoutError) as error:
            last_error = error
            if attempt < attempts:
                time.sleep(attempt * 1.5)

    raise RuntimeError(f"Failed after {attempts} attempts: {url}: {last_error}")


def fetch_api_page(set_code: str, page: int) -> dict[str, Any]:
    params = {
        "keyword": "",
        "se_ta": "",
        "regulation_sidebar_form": "all",
        "illust": "",
        "sm_and_keyword": "true",
        "pg": set_code,
        "page": str(page),
    }
    url = f"{API_URL}?{urlencode(params)}"
    raw = request_bytes(
        url,
        accept="application/json, text/javascript, */*; q=0.01",
        ajax=True,
    )
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise RuntimeError(f"Official API returned a non-object payload for page {page}.")
    return payload


def parse_detail(card_id: str, api_card: dict[str, Any]) -> dict[str, Any]:
    detail_url = f"{BASE_URL}/card-search/details.php/card/{card_id}/regu/all"
    html = request_bytes(detail_url, accept="text/html,application/xhtml+xml").decode(
        "utf-8", errors="replace"
    )
    soup = BeautifulSoup(html, "html.parser")
    text_lines = [line.strip() for line in soup.get_text("\n").splitlines() if line.strip()]

    title_node = soup.select_one("section.Section h1.Heading1.mt20") or soup.find("h1")
    native_name = (
        title_node.get_text(" ", strip=True)
        if title_node
        else str(api_card.get("cardNameAltText") or "").strip()
    )

    printed_number_line = next(
        (
            line.replace("\u00a0", " ")
            for line in text_lines
            if PRINTED_NUMBER_PATTERN.fullmatch(line.replace("\u00a0", " "))
        ),
        None,
    )
    printed_number_match = (
        PRINTED_NUMBER_PATTERN.fullmatch(printed_number_line)
        if printed_number_line
        else None
    )
    collector_number = printed_number_match.group(1) if printed_number_match else None
    denominator = printed_number_match.group(2) if printed_number_match else None

    regulation_image = soup.select_one("img.img-regulation")
    official_set_code = (
        (regulation_image.get("alt") or "").strip() if regulation_image else None
    )

    artist = None
    for index, line in enumerate(text_lines):
        if line == "イラストレーター" and index + 1 < len(text_lines):
            artist = text_lines[index + 1]
            break

    thumbnail_path = str(api_card.get("cardThumbFile") or "").strip() or None
    marker_match = (
        re.search(r"_[PTE]_", thumbnail_path.rsplit("/", 1)[-1])
        if thumbnail_path
        else None
    )
    type_marker = marker_match.group(0).strip("_") if marker_match else None
    supertype = {"P": "Pokémon", "T": "Trainer", "E": "Energy"}.get(type_marker)

    return {
        "card_id": card_id,
        "detail_url": detail_url,
        "native_name": native_name or None,
        "official_set_code": official_set_code or None,
        "collector_number": collector_number,
        "denominator": denominator,
        "artist": artist,
        "type_marker": type_marker,
        "supertype": supertype,
        "thumbnail_path": thumbnail_path,
        "official_image_url": urljoin(BASE_URL, thumbnail_path) if thumbnail_path else None,
    }


def collector_sort_key(value: str) -> tuple[int, int | str, str]:
    if value.isdigit():
        return (0, int(value), value)
    match = re.match(r"^([A-Za-z._+-]*)(\d+)(.*)$", value)
    if match:
        return (1, int(match.group(2)), value)
    return (2, value, value)


def main() -> int:
    args = parse_args()
    set_code = args.set_code.strip()
    if not SET_CODE_PATTERN.fullmatch(set_code):
        raise SystemExit(f"Invalid set code: {set_code}")
    if not 1 <= args.max_results <= 1000:
        raise SystemExit("--max-results must be between 1 and 1000.")
    if not 250 <= args.minimum_delay_ms <= 10000:
        raise SystemExit("--minimum-delay-ms must be between 250 and 10000.")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    delay_seconds = args.minimum_delay_ms / 1000

    first_page = fetch_api_page(set_code, 1)
    hit_count = int(first_page.get("hitCnt") or 0)
    max_page = int(first_page.get("maxPage") or 0)
    if hit_count <= 0 or max_page <= 0:
        raise SystemExit(f"Official API returned no cards for {set_code}.")
    if hit_count > args.max_results:
        raise SystemExit(
            f"Official API returned {hit_count} cards, exceeding hard ceiling "
            f"{args.max_results}."
        )

    api_cards: list[dict[str, Any]] = []
    for page in range(1, max_page + 1):
        payload = first_page if page == 1 else fetch_api_page(set_code, page)
        page_cards = payload.get("cardList") or []
        api_cards.extend(card for card in page_cards if isinstance(card, dict))
        if page < max_page:
            time.sleep(delay_seconds)

    unique_api_cards: dict[str, dict[str, Any]] = {}
    for card in api_cards:
        card_id = str(card.get("cardID") or "").strip()
        if card_id:
            unique_api_cards[card_id] = card
    if len(unique_api_cards) != hit_count:
        raise SystemExit(
            f"API identity mismatch: hitCnt={hit_count}, "
            f"unique card IDs={len(unique_api_cards)}."
        )

    detail_rows: list[dict[str, Any]] = []
    parser_errors: list[dict[str, Any]] = []
    for position, (card_id, api_card) in enumerate(unique_api_cards.items(), 1):
        try:
            row = parse_detail(card_id, api_card)
            missing_fields = [
                field
                for field in (
                    "native_name",
                    "official_set_code",
                    "collector_number",
                    "denominator",
                    "supertype",
                )
                if not row.get(field)
            ]
            if missing_fields:
                parser_errors.append(
                    {
                        "card_id": card_id,
                        "detail_url": row["detail_url"],
                        "missing_fields": missing_fields,
                    }
                )
            detail_rows.append(row)
        except Exception as error:  # Evidence must retain any single-page failure.
            parser_errors.append(
                {
                    "card_id": card_id,
                    "detail_url": f"{BASE_URL}/card-search/details.php/card/{card_id}/regu/all",
                    "error": f"{type(error).__name__}: {error}",
                }
            )
        if position < len(unique_api_cards):
            time.sleep(delay_seconds)

    grouped: defaultdict[tuple[str | None, str], list[dict[str, Any]]] = defaultdict(list)
    for row in detail_rows:
        if row.get("collector_number"):
            grouped[(row.get("official_set_code"), row["collector_number"])].append(row)

    printings: list[dict[str, Any]] = []
    identity_conflicts: list[dict[str, Any]] = []
    for (official_set_code, collector_number), variants in sorted(
        grouped.items(),
        key=lambda item: (
            item[0][0] or "",
            collector_sort_key(item[0][1]),
        ),
    ):
        names = sorted({item["native_name"] for item in variants if item.get("native_name")})
        denominators = sorted(
            {item["denominator"] for item in variants if item.get("denominator")}
        )
        supertypes = sorted(
            {item["supertype"] for item in variants if item.get("supertype")}
        )
        artists = sorted({item["artist"] for item in variants if item.get("artist")})
        if len(names) != 1 or len(denominators) != 1 or len(supertypes) != 1:
            identity_conflicts.append(
                {
                    "official_set_code": official_set_code,
                    "collector_number": collector_number,
                    "names": names,
                    "denominators": denominators,
                    "supertypes": supertypes,
                    "artists": artists,
                    "official_card_ids": [item["card_id"] for item in variants],
                }
            )
            continue

        printings.append(
            {
                "language_code": "ja",
                "official_set_code": official_set_code,
                "collector_number": collector_number,
                "denominator": denominators[0],
                "native_name": names[0],
                "supertype": supertypes[0],
                "artist": artists[0] if len(artists) == 1 else None,
                "artist_candidates": artists,
                "rarity_code": None,
                "finish_status": "pending_review",
                "official_variant_count": len(variants),
                "official_card_ids": [item["card_id"] for item in variants],
                "detail_urls": [item["detail_url"] for item in variants],
                "thumbnail_paths": [item["thumbnail_path"] for item in variants],
                "official_image_urls": [item["official_image_url"] for item in variants],
            }
        )

    denominators = sorted(
        {item["denominator"] for item in printings if item.get("denominator")},
        key=collector_sort_key,
    )
    official_set_codes = sorted(
        {item["official_set_code"] for item in printings if item.get("official_set_code")}
    )
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "pokemon_card_jp_official",
        "set_code_requested": set_code,
        "official_set_codes": official_set_codes,
        "api_hit_count": hit_count,
        "api_max_page": max_page,
        "api_card_ids_collected": len(unique_api_cards),
        "detail_rows_collected": len(detail_rows),
        "unique_printings": len(printings),
        "denominators": denominators,
        "duplicate_official_variants": len(detail_rows) - len(printings),
        "parser_errors": parser_errors,
        "identity_conflicts": identity_conflicts,
        "read_only": True,
        "images_downloaded": False,
        "rarity_populated": False,
        "finish_populated": False,
        "printings": printings,
    }
    output_path.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    summary = {
        key: value for key, value in report.items() if key != "printings"
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))

    if parser_errors or identity_conflicts:
        return 2
    if not printings:
        return 3
    return 0


if __name__ == "__main__":
    sys.exit(main())
