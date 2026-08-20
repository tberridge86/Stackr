#!/usr/bin/env python3
"""Build a cross-verified 83-card Japanese ADV5 manifest.

Checklist, Japanese names, artist, type and rarity come from Bulbapedia's Undone
Seal/EX Hidden Legends pages. Exact Japanese scan URLs, logo and symbol come from
a rendered PokéCardex ADV5 catalogue captured by the workflow browser step.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

BULBAPEDIA_SET_URL = "https://bulbapedia.bulbagarden.net/wiki/Undone_Seal_(TCG)"
EXPECTED_NUMBERS = [f"{number:03d}" for number in range(1, 84)]
NUMBER_PATTERN = re.compile(r"^(\d{1,3})/(\d{1,3})$")
POKECARDEX_CARD_PATTERN = re.compile(r"/card/ADV5-(\d{1,3})$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--pokecardex-json", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--page-cache-dir", required=True)
    parser.add_argument("--minimum-delay-ms", type=int, default=700)
    return parser.parse_args()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def clean(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def fetch_page(
    session: requests.Session,
    url: str,
    cache_path: Path,
    *,
    attempts: int = 3,
) -> tuple[str, dict[str, Any]]:
    if cache_path.exists():
        content = cache_path.read_bytes()
        return content.decode("utf-8", errors="replace"), {
            "url": url,
            "cached": True,
            "byte_size": len(content),
            "sha256": hashlib.sha256(content).hexdigest(),
        }

    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            response = session.get(url, timeout=45, allow_redirects=True)
            response.raise_for_status()
            content = response.content
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_bytes(content)
            return content.decode(response.encoding or "utf-8", errors="replace"), {
                "url": url,
                "final_url": response.url,
                "http_status": response.status_code,
                "content_type": response.headers.get("content-type"),
                "cached": False,
                "byte_size": len(content),
                "sha256": hashlib.sha256(content).hexdigest(),
            }
        except (requests.RequestException, TimeoutError) as error:
            last_error = error
            if attempt < attempts:
                time.sleep(attempt * 1.5)
    raise RuntimeError(f"Failed after {attempts} attempts: {url}: {last_error}")


def extract_pokecardex_assets(runtime: dict[str, Any]) -> dict[str, Any]:
    cards: dict[str, dict[str, Any]] = {}
    logo_url = None
    symbol_url = None

    for image in runtime.get("relevant_images") or []:
        src = clean(image.get("src"))
        parent_href = clean(image.get("parent_href"))
        if not src:
            continue
        if "/assets/images/sets/logos/ADV5." in src:
            logo_url = src
        if "/assets/images/sets/symbols/ADV5." in src:
            symbol_url = src
        match = POKECARDEX_CARD_PATTERN.search(parent_href or "")
        if not match:
            continue
        number = f"{int(match.group(1)):03d}"
        require(number not in cards, f"PokéCardex rendered duplicate card number {number}.")
        cards[number] = {
            "collector_number": number,
            "image_url": src,
            "card_detail_url": parent_href,
            "image_alt": clean(image.get("alt")),
            "image_width": image.get("width"),
            "image_height": image.get("height"),
        }

    require(sorted(cards) == EXPECTED_NUMBERS, f"PokéCardex image coverage is not 001–083: {sorted(cards)}")
    require(logo_url is not None, "PokéCardex ADV5 logo URL was not rendered.")
    require(symbol_url is not None, "PokéCardex ADV5 symbol URL was not rendered.")
    return {"cards": cards, "logo_url": logo_url, "symbol_url": symbol_url}


def select_japanese_checklist_table(soup: BeautifulSoup) -> list[dict[str, Any]]:
    candidates: list[list[dict[str, Any]]] = []
    for table_index, table in enumerate(soup.find_all("table")):
        rows: list[dict[str, Any]] = []
        for table_row in table.find_all("tr"):
            cells = table_row.find_all(["td", "th"])
            if len(cells) < 5:
                continue
            number_text = cells[0].get_text(" ", strip=True)
            match = NUMBER_PATTERN.fullmatch(number_text)
            if not match or match.group(2).zfill(3) != "083":
                continue
            number = match.group(1).zfill(3)
            name_link = cells[2].find("a", href=True)
            type_image = cells[3].find("img", alt=True)
            rarity_image = cells[4].find("img", alt=True)
            rows.append(
                {
                    "table_index": table_index,
                    "collector_number": number,
                    "denominator": "083",
                    "english_name": clean(cells[2].get_text(" ", strip=True)),
                    "bulbapedia_card_url": (
                        urljoin(BULBAPEDIA_SET_URL, name_link.get("href"))
                        if name_link
                        else None
                    ),
                    "type_label": (
                        clean(type_image.get("alt"))
                        if type_image
                        else clean(cells[3].get_text(" ", strip=True))
                    ),
                    "rarity_label": (
                        clean(rarity_image.get("alt"))
                        if rarity_image
                        else clean(cells[4].get_text(" ", strip=True))
                    ),
                }
            )
        if len(rows) == 83:
            candidates.append(rows)

    require(len(candidates) == 1, f"Expected one 83-row Japanese checklist table, found {len(candidates)}.")
    rows = candidates[0]
    require([row["collector_number"] for row in rows] == EXPECTED_NUMBERS, "Bulbapedia checklist is not 001–083 in order.")
    require(all(row["english_name"] for row in rows), "Bulbapedia checklist contains a blank English name.")
    require(all(row["bulbapedia_card_url"] for row in rows), "Bulbapedia checklist contains a missing card-page URL.")
    return rows


def extract_native_name(page_text: str, english_name: str) -> str | None:
    patterns = [
        re.compile(rf"{re.escape(english_name)}\s*\(Japanese:\s*([^\s\)]+)"),
        re.compile(r"\(Japanese:\s*([^\s\)]+)"),
    ]
    for pattern in patterns:
        match = pattern.search(page_text)
        if match:
            return clean(match.group(1))
    return None


def extract_artist(lines: list[str]) -> str | None:
    for index, line in enumerate(lines):
        if line.startswith("Illus."):
            inline = clean(line.removeprefix("Illus."))
            if inline:
                return inline
            if index + 1 < len(lines):
                return clean(lines[index + 1])
    return None


def extract_detail_metadata(html: str, checklist_row: dict[str, Any]) -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    lines = [line.strip() for line in soup.get_text("\n").splitlines() if line.strip()]
    page_text = " ".join(lines)
    native_name = extract_native_name(page_text, checklist_row["english_name"])
    artist = extract_artist(lines)

    expected_number = f'{checklist_row["collector_number"]}/083'
    normalized_text = re.sub(r"\s+", "", page_text)
    require(expected_number in normalized_text, f"Card page does not confirm Japanese number {expected_number}.")
    require("UndoneSeal" in normalized_text, f"Card page does not confirm Undone Seal for {expected_number}.")
    require(native_name is not None, f"Japanese name missing for {expected_number} {checklist_row['english_name']}.")
    require(artist is not None, f"Artist missing for {expected_number} {checklist_row['english_name']}.")

    type_label = checklist_row["type_label"] or ""
    supertype = "Trainer" if type_label.lower().startswith("trainer") else "Pokémon"
    return {
        "native_name": native_name,
        "artist": artist,
        "supertype": supertype,
        "page_title": clean(soup.title.get_text(" ", strip=True) if soup.title else None),
    }


def main() -> None:
    args = parse_args()
    require(250 <= args.minimum_delay_ms <= 10_000, "--minimum-delay-ms must be between 250 and 10000.")
    delay_seconds = args.minimum_delay_ms / 1000
    runtime = json.loads(Path(args.pokecardex_json).read_text(encoding="utf-8"))
    assets = extract_pokecardex_assets(runtime)

    cache_dir = Path(args.page_cache_dir)
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": "StackR-Catalogue-Audit/1.0 (+https://stackrtcg.com)",
            "Accept-Language": "en-GB,en;q=0.9,ja;q=0.8",
        }
    )

    set_html, set_evidence = fetch_page(
        session,
        BULBAPEDIA_SET_URL,
        cache_dir / "set-page.html",
    )
    set_soup = BeautifulSoup(set_html, "lxml")
    checklist = select_japanese_checklist_table(set_soup)

    cards: list[dict[str, Any]] = []
    detail_evidence: list[dict[str, Any]] = []
    for index, checklist_row in enumerate(checklist):
        number = checklist_row["collector_number"]
        html, evidence = fetch_page(
            session,
            checklist_row["bulbapedia_card_url"],
            cache_dir / "cards" / f"{number}.html",
        )
        detail = extract_detail_metadata(html, checklist_row)
        image = assets["cards"][number]
        cards.append(
            {
                "language_code": "ja",
                "collector_number": number,
                "denominator": "083",
                "native_name": detail["native_name"],
                "english_name": checklist_row["english_name"],
                "supertype": detail["supertype"],
                "type_label": checklist_row["type_label"],
                "rarity_label": checklist_row["rarity_label"],
                "artist": detail["artist"],
                "bulbapedia_card_url": checklist_row["bulbapedia_card_url"],
                "bulbapedia_page_title": detail["page_title"],
                "pokecardex_card_url": image["card_detail_url"],
                "image_url": image["image_url"],
                "image_alt": image["image_alt"],
                "image_width": image["image_width"],
                "image_height": image["image_height"],
            }
        )
        detail_evidence.append({"collector_number": number, **evidence})
        if index + 1 < len(checklist):
            time.sleep(delay_seconds)

    require([card["collector_number"] for card in cards] == EXPECTED_NUMBERS, "Composite card list is not 001–083.")
    require(len({card["native_name"] for card in cards}) == 83, "Japanese native names are not unique across ADV5.")
    require(len({card["image_url"] for card in cards}) == 83, "Japanese image URLs are not unique across ADV5.")
    require(all(card["rarity_label"] for card in cards), "At least one ADV5 rarity label is missing.")

    output = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "stackr_adv5_composite",
        "language_code": "ja",
        "canonical_set_code": "ADV5",
        "provider_set_code": "ADV5",
        "native_set_name": "とかれた封印",
        "english_set_name": "Undone Seal",
        "release_date": "2004-01-16",
        "printed_total": 83,
        "full_total": 83,
        "logo_url": assets["logo_url"],
        "symbol_url": assets["symbol_url"],
        "rights_status": "approved_by_stackr_owner",
        "read_only": True,
        "database_modified": False,
        "sources": {
            "bulbapedia_set_page": set_evidence,
            "bulbapedia_card_pages": detail_evidence,
            "pokecardex_runtime_page": {
                "url": runtime.get("navigation", {}).get("final_url"),
                "title": runtime.get("navigation", {}).get("title"),
                "rendered_image_count": runtime.get("image_count"),
                "selected_card_images": len(assets["cards"]),
            },
        },
        "cards": cards,
    }
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "cards": len(cards),
                "native_names": len({card["native_name"] for card in cards}),
                "image_urls": len({card["image_url"] for card in cards}),
                "logo_url": output["logo_url"],
                "symbol_url": output["symbol_url"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
