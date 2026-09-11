#!/usr/bin/env python3
"""Build a six-per-page Pokémon set-logo review sheet and import bundle.

The script prefers set logos exposed by TCGdex, then a curated open-source
manual-logo repository, then the Pokémon TCG data catalogue. Subsets without a
standalone logo may use a clearly labelled parent-set logo; unresolved entries
remain explicit and are never replaced by an invented logo.
"""

from __future__ import annotations

import csv
import io
import json
import math
import re
import shutil
import sys
import time
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote

import requests
from PIL import Image
from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


ENTRIES: list[tuple[str, str, str]] = [
    ("me05", "Pitch Black", "canonical identity"),
    ("PBL", "Pitch Black", "duplicate alias of me05"),
    ("B2a", "Paldean Wonders", ""),
    ("B1a", "Crimson Blaze", ""),
    ("mep", "MEP Black Star Promos", ""),
    ("mee", "Mega Evolution Energy", ""),
    ("A3b", "Eevee Grove", ""),
    ("A3a", "Extradimensional Crisis", ""),
    ("2024sv", "McDonald's Collection 2024", ""),
    ("sv05", "Temporal Forces", ""),
    ("mfb", "My First Battle", ""),
    ("2023sv", "McDonald's Collection 2023", ""),
    ("sve", "Scarlet & Violet Energy", ""),
    ("svp", "SVP Black Star Promos", ""),
    ("swsh12.5gg", "Crown Zenith Galarian Gallery", ""),
    ("swsh12tg", "Silver Tempest Trainer Gallery", ""),
    ("swsh11tg", "Lost Origin Trainer Gallery", ""),
    ("2022swsh", "McDonald's Collection 2022", ""),
    ("swsh10tg", "Astral Radiance Trainer Gallery", ""),
    ("swsh9tg", "Brilliant Stars Trainer Gallery", ""),
    ("cel25cc", "Celebrations Classic Collection", ""),
    ("swsh4.5sv", "Shining Fates Shiny Vault", ""),
    ("2021swsh", "McDonald's Collection 2021", ""),
    ("swshp", "SWSH Black Star Promos", ""),
    ("2019sm", "McDonald's Collection 2019", ""),
    ("sma", "Hidden Fates Shiny Vault", ""),
    ("2018sm", "McDonald's Collection 2018", ""),
    ("sm7.5", "Dragon Majesty", ""),
    ("sm3.5", "Shining Legends", ""),
    ("2017sm", "McDonald's Collection 2017", ""),
    ("tk-sm-l", "SM Trainer Kit - Lycanroc", ""),
    ("tk-sm-r", "SM Trainer Kit - Alolan Raichu", ""),
    ("smp", "SM Black Star Promos", ""),
    ("2016xy", "McDonald's Collection 2016", ""),
    ("tk-xy-p", "XY Trainer Kit - Pikachu Libre", ""),
    ("tk-xy-su", "XY Trainer Kit - Suicune", ""),
    ("2015xy", "McDonald's Collection 2015", ""),
    ("tk-xy-latia", "XY Trainer Kit - Latias", ""),
    ("tk-xy-latio", "XY Trainer Kit - Latios", ""),
    ("tk-xy-b", "XY Trainer Kit - Bisharp", ""),
    ("tk-xy-w", "XY Trainer Kit - Wigglytuff", ""),
    ("2014xy", "McDonald's Collection 2014", ""),
    ("tk-xy-n", "XY Trainer Kit - Noivern", ""),
    ("tk-xy-sy", "XY Trainer Kit - Sylveon", ""),
    ("xya", "Yellow A Alternate", ""),
    ("xyp", "XY Black Star Promos", ""),
    ("2012bw", "McDonald's Collection 2012", ""),
    ("tk-bw-e", "BW Trainer Kit - Excadrill", ""),
    ("tk-bw-z", "BW Trainer Kit - Zoroark", ""),
    ("2011bw", "McDonald's Collection 2011", ""),
    ("bwp", "BW Black Star Promos", ""),
    ("tk-hs-g", "HS Trainer Kit - Gyarados", ""),
    ("tk-hs-r", "HS Trainer Kit - Raichu", ""),
    ("hgssp", "HGSS Black Star Promos", ""),
    ("pop9", "POP Series 9", ""),
    ("pop7", "POP Series 7", ""),
    ("pop6", "POP Series 6", ""),
    ("tk-dp-l", "DP Trainer Kit - Lucario", ""),
    ("tk-dp-m", "DP Trainer Kit - Manaphy", ""),
    ("dpp", "DP Black Star Promos", ""),
    ("pop5", "POP Series 5", ""),
    ("pop4", "POP Series 4", ""),
    ("pop3", "POP Series 3", ""),
    ("tk-ex-m", "EX Trainer Kit 2 - Minun", ""),
    ("tk-ex-p", "EX Trainer Kit 2 - Plusle", ""),
    ("exu", "Unseen Forces Unown Collection", ""),
    ("pop2", "POP Series 2", ""),
    ("pop1", "POP Series 1", ""),
    ("ex5.5", "Poké Card Creator Pack", ""),
    ("tk-ex-latia", "EX Trainer Kit - Latias", ""),
    ("tk-ex-latio", "EX Trainer Kit - Latios", ""),
    ("np", "Nintendo Black Star Promos", ""),
    ("bog", "Best of Game", ""),
    ("sp", "Sample", ""),
    ("wp", "W Promotional", ""),
    ("miscp", "Miscellaneous Promos", ""),
]

POKEMONTCG_ID_ALIASES: dict[str, list[str]] = {
    "sv05": ["sv5"],
    "sm7.5": ["sm75"],
    "sm3.5": ["sm35"],
    "sma": ["sm115"],
    "2024sv": ["mcd24"],
    "2023sv": ["mcd23"],
    "2022swsh": ["mcd22"],
    "2021swsh": ["mcd21"],
    "2019sm": ["mcd19"],
    "2018sm": ["mcd18"],
    "2017sm": ["mcd17"],
    "2016xy": ["mcd16"],
    "2015xy": ["mcd15"],
    "2014xy": ["mcd14"],
    "2012bw": ["mcd12"],
    "2011bw": ["mcd11"],
    "bog": ["bp"],
    "tk-ex-latia": ["tk1a"],
    "tk-ex-latio": ["tk1b"],
}

PARENT_FALLBACKS: dict[str, list[str]] = {
    "swsh12.5gg": ["swsh12.5", "swsh12pt5"],
    "swsh12tg": ["swsh12"],
    "swsh11tg": ["swsh11"],
    "swsh10tg": ["swsh10"],
    "swsh9tg": ["swsh9"],
    "cel25cc": ["cel25"],
    "swsh4.5sv": ["swsh4.5", "swsh45"],
    "sma": ["sm11.5", "sm115"],
}

MANUAL_FILENAME_ALIASES: dict[str, list[str]] = {
    "2018sm": ["2018sm-fr"],
    "2019sm": ["2019sm-fr"],
}

SOURCE_LABELS = {
    "tcgdex-id": "TCGdex exact set ID",
    "tcgdex-name": "TCGdex name match",
    "manual": "Curated manual set logo",
    "pokemontcg-id": "Pokémon TCG catalogue ID",
    "pokemontcg-name": "Pokémon TCG catalogue name match",
    "parent": "Parent-set logo fallback",
    "alias": "Canonical duplicate alias",
    "missing": "No verified logo located",
}


@dataclass
class LogoResult:
    sequence: int
    code: str
    name: str
    requested_note: str
    status: str
    source: str
    source_url: str
    logo_file: str
    note: str


class SourceData:
    def __init__(self) -> None:
        self.tcgdex_by_id: dict[str, dict[str, Any]] = {}
        self.tcgdex_by_name: dict[str, list[dict[str, Any]]] = {}
        self.ptcg_by_id: dict[str, dict[str, Any]] = {}
        self.ptcg_by_name: dict[str, list[dict[str, Any]]] = {}
        self.manual: dict[str, str] = {}


def normalise(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(ch for ch in value if not unicodedata.combining(ch))
    value = value.lower().replace("&", "and")
    value = value.replace("pokémon", "pokemon")
    value = re.sub(r"\bthe\b", " ", value)
    return re.sub(r"[^a-z0-9]+", "", value)


def build_session() -> requests.Session:
    session = requests.Session()
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        backoff_factor=0.5,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET", "HEAD"]),
    )
    session.mount("https://", HTTPAdapter(max_retries=retry))
    session.headers.update(
        {
            "User-Agent": "Stackr-set-logo-sheet/1.0 (+https://github.com/tberridge86/Stackr)",
            "Accept": "application/json,image/avif,image/webp,image/png,image/*,*/*;q=0.8",
        }
    )
    return session


def safe_get_json(session: requests.Session, url: str, timeout: int = 45) -> Any:
    response = session.get(url, timeout=timeout)
    response.raise_for_status()
    return response.json()


def load_source_data(session: requests.Session) -> SourceData:
    data = SourceData()
    try:
        rows = safe_get_json(session, "https://api.tcgdex.net/v2/en/sets")
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            set_id = str(row.get("id", "")).strip()
            if set_id:
                data.tcgdex_by_id[set_id.lower()] = row
            key = normalise(str(row.get("name", "")))
            if key:
                data.tcgdex_by_name.setdefault(key, []).append(row)
        print(f"Loaded {len(data.tcgdex_by_id)} TCGdex sets")
    except Exception as exc:
        print(f"WARNING: unable to load TCGdex set list: {exc}", file=sys.stderr)

    try:
        rows = safe_get_json(session, "https://raw.githubusercontent.com/PokemonTCG/pokemon-tcg-data/master/sets/en.json")
        for row in rows if isinstance(rows, list) else []:
            if not isinstance(row, dict):
                continue
            set_id = str(row.get("id", "")).strip()
            if set_id:
                data.ptcg_by_id[set_id.lower()] = row
            key = normalise(str(row.get("name", "")))
            if key:
                data.ptcg_by_name.setdefault(key, []).append(row)
        print(f"Loaded {len(data.ptcg_by_id)} Pokémon TCG catalogue sets")
    except Exception as exc:
        print(f"WARNING: unable to load Pokémon TCG set list: {exc}", file=sys.stderr)

    try:
        payload = safe_get_json(session, "https://raw.githubusercontent.com/liesdjillali/pokecole-questions/main/images/manual_set_logos.json")
        logos = payload.get("logos", {}) if isinstance(payload, dict) else {}
        data.manual = {str(k): str(v) for k, v in logos.items() if k and v}
        print(f"Loaded {len(data.manual)} curated manual logos")
    except Exception as exc:
        print(f"WARNING: unable to load manual logo map: {exc}", file=sys.stderr)
    return data


def candidate_image_urls(url: str) -> list[str]:
    url = url.strip()
    if not url:
        return []
    clean = url.split("#", 1)[0]
    suffix = Path(clean.split("?", 1)[0]).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp"}:
        return [clean]
    return [f"{clean}.png", clean]


def image_from_response(content: bytes) -> Image.Image:
    with Image.open(io.BytesIO(content)) as opened:
        opened.load()
        image = opened.convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def download_logo(session: requests.Session, url: str, destination: Path) -> tuple[bool, str]:
    last_error = ""
    for candidate in candidate_image_urls(url):
        try:
            response = session.get(candidate, timeout=60)
            if response.status_code != 200:
                last_error = f"HTTP {response.status_code}"
                continue
            if len(response.content) < 100:
                last_error = "response too small"
                continue
            image = image_from_response(response.content)
            if image.width < 20 or image.height < 10:
                last_error = f"image too small ({image.width}x{image.height})"
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            image.save(destination, format="PNG", optimize=True)
            return True, candidate
        except Exception as exc:
            last_error = str(exc)
    return False, last_error


def get_logo_url_from_tcgdex(row: dict[str, Any]) -> str:
    return str(row.get("logo") or "").strip()


def get_logo_url_from_ptcg(row: dict[str, Any]) -> str:
    images = row.get("images") if isinstance(row, dict) else None
    return str(images.get("logo") or "").strip() if isinstance(images, dict) else ""


def unique_rows(rows: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    seen: set[str] = set()
    for row in rows:
        key = str(row.get("id", "")).lower()
        if key and key not in seen:
            output.append(row)
            seen.add(key)
    return output


def catalogue_candidates(code: str, name: str, data: SourceData) -> list[tuple[str, str, str]]:
    candidates: list[tuple[str, str, str]] = []
    row = data.tcgdex_by_id.get(code.lower())
    if row and get_logo_url_from_tcgdex(row):
        candidates.append(("tcgdex-id", get_logo_url_from_tcgdex(row), f"TCGdex {row.get('id')} - {row.get('name')}"))
    for row in unique_rows(data.tcgdex_by_name.get(normalise(name), [])):
        if get_logo_url_from_tcgdex(row):
            candidates.append(("tcgdex-name", get_logo_url_from_tcgdex(row), f"TCGdex {row.get('id')} - {row.get('name')}"))

    for manual_key in [code, code.lower(), *MANUAL_FILENAME_ALIASES.get(code, [])]:
        url = data.manual.get(manual_key)
        if url:
            candidates.append(("manual", url, f"Manual logo key {manual_key}"))
        else:
            candidates.append(("manual", f"https://raw.githubusercontent.com/liesdjillali/pokecole-questions/main/images/manual_set_logos/{quote(manual_key)}.png", f"Manual logo filename {manual_key}"))

    for set_id in [code, *POKEMONTCG_ID_ALIASES.get(code, [])]:
        row = data.ptcg_by_id.get(set_id.lower())
        if row and get_logo_url_from_ptcg(row):
            candidates.append(("pokemontcg-id", get_logo_url_from_ptcg(row), f"Pokémon TCG {row.get('id')} - {row.get('name')}"))
    for row in unique_rows(data.ptcg_by_name.get(normalise(name), [])):
        if get_logo_url_from_ptcg(row):
            candidates.append(("pokemontcg-name", get_logo_url_from_ptcg(row), f"Pokémon TCG {row.get('id')} - {row.get('name')}"))

    deduped: list[tuple[str, str, str]] = []
    seen_urls: set[str] = set()
    for source, url, note in candidates:
        if url and url not in seen_urls:
            deduped.append((source, url, note))
            seen_urls.add(url)
    return deduped


def parent_candidates(code: str, data: SourceData) -> list[tuple[str, str, str]]:
    output: list[tuple[str, str, str]] = []
    for parent_id in PARENT_FALLBACKS.get(code, []):
        tcgdex = data.tcgdex_by_id.get(parent_id.lower())
        if tcgdex and get_logo_url_from_tcgdex(tcgdex):
            output.append(("parent", get_logo_url_from_tcgdex(tcgdex), f"Parent logo: TCGdex {tcgdex.get('id')} - {tcgdex.get('name')}"))
        ptcg = data.ptcg_by_id.get(parent_id.lower())
        if ptcg and get_logo_url_from_ptcg(ptcg):
            output.append(("parent", get_logo_url_from_ptcg(ptcg), f"Parent logo: Pokémon TCG {ptcg.get('id')} - {ptcg.get('name')}"))
    return output


def resolve_all(session: requests.Session, data: SourceData, output_dir: Path) -> list[LogoResult]:
    logo_dir = output_dir / "logos"
    logo_dir.mkdir(parents=True, exist_ok=True)
    results: list[LogoResult] = []
    resolved_by_code: dict[str, LogoResult] = {}

    for sequence, (code, name, requested_note) in enumerate(ENTRIES, start=1):
        destination = logo_dir / f"{code.replace('/', '_')}.png"
        if code == "PBL":
            canonical = resolved_by_code.get("me05")
            if canonical and canonical.logo_file and (output_dir / canonical.logo_file).exists():
                shutil.copy2(output_dir / canonical.logo_file, destination)
                result = LogoResult(sequence, code, name, requested_note, "alias", SOURCE_LABELS["alias"], canonical.source_url, str(destination.relative_to(output_dir)), "Duplicate identity deliberately reuses me05; do not create a second canonical set.")
                results.append(result)
                resolved_by_code[code] = result
                print(f"[{sequence:02d}/{len(ENTRIES)}] {code}: alias of me05")
                continue

        selected: LogoResult | None = None
        attempts: list[str] = []
        for source_key, url, detail in catalogue_candidates(code, name, data):
            ok, final = download_logo(session, url, destination)
            if ok:
                selected = LogoResult(sequence, code, name, requested_note, "verified", SOURCE_LABELS[source_key], final, str(destination.relative_to(output_dir)), detail)
                break
            attempts.append(f"{source_key}: {url} ({final})")

        if selected is None:
            for source_key, url, detail in parent_candidates(code, data):
                ok, final = download_logo(session, url, destination)
                if ok:
                    selected = LogoResult(sequence, code, name, requested_note, "parent-fallback", SOURCE_LABELS[source_key], final, str(destination.relative_to(output_dir)), f"{detail}. The subset has no separate verified standalone wordmark in the checked catalogues.")
                    break
                attempts.append(f"{source_key}: {url} ({final})")

        if selected is None:
            selected = LogoResult(sequence, code, name, requested_note, "unresolved", SOURCE_LABELS["missing"], "", "", "No verified standalone logo was returned by TCGdex, the curated manual set, or the Pokémon TCG catalogue.")
            print(f"[{sequence:02d}/{len(ENTRIES)}] {code}: UNRESOLVED")
            if attempts:
                print("  last attempts:", *attempts[-3:], sep="\n    ")
        else:
            print(f"[{sequence:02d}/{len(ENTRIES)}] {code}: {selected.status} via {selected.source}")
        results.append(selected)
        resolved_by_code[code] = selected
        time.sleep(0.03)
    return results


def fit_font_size(text: str, font_name: str, max_size: float, min_size: float, width: float) -> float:
    size = max_size
    while size > min_size and stringWidth(text, font_name, size) > width:
        size -= 0.25
    return max(size, min_size)


def draw_wrapped_text(pdf: canvas.Canvas, text: str, x: float, y: float, max_width: float, font_name: str, font_size: float, leading: float, max_lines: int, color: Color = black) -> float:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        proposed = word if not current else f"{current} {word}"
        if stringWidth(proposed, font_name, font_size) <= max_width:
            current = proposed
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while lines and stringWidth(lines[-1] + "…", font_name, font_size) > max_width:
            lines[-1] = lines[-1][:-1]
        if lines:
            lines[-1] += "…"
    pdf.setFillColor(color)
    pdf.setFont(font_name, font_size)
    for index, line in enumerate(lines):
        pdf.drawString(x, y - index * leading, line)
    return y - len(lines) * leading


def draw_logo_contain(pdf: canvas.Canvas, path: Path, x: float, y: float, width: float, height: float) -> None:
    with Image.open(path) as opened:
        image = opened.convert("RGBA")
        iw, ih = image.size
        ratio = min(width / iw, height / ih)
        dw, dh = iw * ratio, ih * ratio
        pdf.drawImage(ImageReader(image), x + (width - dw) / 2, y + (height - dh) / 2, width=dw, height=dh, mask="auto", preserveAspectRatio=True)


def draw_cell(pdf: canvas.Canvas, result: LogoResult, output_dir: Path, x: float, y: float, width: float, height: float) -> None:
    navy, purple = HexColor("#131A35"), HexColor("#6D4AFF")
    muted, panel, border = HexColor("#5E6375"), HexColor("#F4F4F8"), HexColor("#D8D9E3")
    warning, missing = HexColor("#A35B00"), HexColor("#A02B2B")
    pdf.setFillColor(white); pdf.setStrokeColor(border); pdf.setLineWidth(0.8)
    pdf.roundRect(x, y, width, height, 10, fill=1, stroke=1)
    pad = 12
    code_width = max(43, stringWidth(result.code, "Helvetica-Bold", 8.5) + 15)
    pdf.setFillColor(navy if result.status not in {"unresolved", "parent-fallback"} else warning)
    pdf.roundRect(x + pad, y + height - 29, code_width, 17, 7, fill=1, stroke=0)
    pdf.setFillColor(white); pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawCentredString(x + pad + code_width / 2, y + height - 23.5, result.code)

    badge = {"verified": "VERIFIED", "alias": "ALIAS", "parent-fallback": "PARENT LOGO", "unresolved": "UNRESOLVED"}.get(result.status, result.status.upper())
    badge_color = purple if result.status in {"verified", "alias"} else warning if result.status == "parent-fallback" else missing
    badge_width = stringWidth(badge, "Helvetica-Bold", 7.2) + 14
    pdf.setFillColor(badge_color); pdf.roundRect(x + width - pad - badge_width, y + height - 29, badge_width, 17, 7, fill=1, stroke=0)
    pdf.setFillColor(white); pdf.setFont("Helvetica-Bold", 7.2)
    pdf.drawCentredString(x + width - pad - badge_width / 2, y + height - 23.3, badge)

    logo_y, logo_h = y + 71, height - 108
    pdf.setFillColor(panel); pdf.roundRect(x + pad, logo_y, width - pad * 2, logo_h, 7, fill=1, stroke=0)
    if result.logo_file and (output_dir / result.logo_file).exists():
        try:
            draw_logo_contain(pdf, output_dir / result.logo_file, x + pad + 13, logo_y + 10, width - pad * 2 - 26, logo_h - 20)
        except Exception as exc:
            pdf.setFillColor(missing); pdf.setFont("Helvetica-Bold", 9)
            pdf.drawCentredString(x + width / 2, logo_y + logo_h / 2 + 4, "LOGO RENDER ERROR")
            pdf.setFont("Helvetica", 6.5); pdf.drawCentredString(x + width / 2, logo_y + logo_h / 2 - 7, str(exc)[:55])
    else:
        pdf.setFillColor(missing); pdf.setFont("Helvetica-Bold", 10)
        pdf.drawCentredString(x + width / 2, logo_y + logo_h / 2 + 8, "NO VERIFIED LOGO LOCATED")
        pdf.setFillColor(muted); pdf.setFont("Helvetica", 7.5)
        pdf.drawCentredString(x + width / 2, logo_y + logo_h / 2 - 7, "Kept unresolved rather than fabricating artwork")

    title_size = fit_font_size(result.name, "Helvetica-Bold", 11.0, 8.0, width - pad * 2)
    pdf.setFillColor(navy); pdf.setFont("Helvetica-Bold", title_size); pdf.drawString(x + pad, y + 52, result.name)
    source_line = result.source
    if result.status == "alias": source_line = "Reuses canonical me05 logo"
    elif result.status == "parent-fallback": source_line = "Subset shown with parent-set wordmark"
    elif result.status == "unresolved": source_line = "Requires manual sourcing/identity decision"
    draw_wrapped_text(pdf, source_line, x + pad, y + 36, width - pad * 2, "Helvetica", 7.3, 8.5, 1, muted if result.status != "unresolved" else missing)
    if result.requested_note:
        draw_wrapped_text(pdf, result.requested_note, x + pad, y + 23, width - pad * 2, "Helvetica-Oblique", 6.7, 7.5, 1, warning if "duplicate" in result.requested_note else muted)
    pdf.setFillColor(HexColor("#8A8E9D")); pdf.setFont("Helvetica", 6.3)
    pdf.drawRightString(x + width - pad, y + 11, f"#{result.sequence:02d}")


def build_pdf(results: list[LogoResult], output_dir: Path, output_file: Path) -> None:
    page_width, page_height = A4
    pdf = canvas.Canvas(str(output_file), pagesize=A4, pageCompression=1)
    pdf.setTitle("Pokémon set logos - six per page"); pdf.setAuthor("Stackr")
    margin_x, margin_top, margin_bottom, gap_x, gap_y = 25, 48, 31, 12, 12
    cell_width = (page_width - margin_x * 2 - gap_x) / 2
    cell_height = (page_height - margin_top - margin_bottom - gap_y * 2) / 3
    page_count = math.ceil(len(results) / 6)
    for page_index in range(page_count):
        pdf.setFillColor(HexColor("#131A35")); pdf.setFont("Helvetica-Bold", 15)
        pdf.drawString(margin_x, page_height - 25, "Pokémon Set Logo Review")
        pdf.setFillColor(HexColor("#686D7D")); pdf.setFont("Helvetica", 7.5)
        pdf.drawRightString(page_width - margin_x, page_height - 23, "6 per page | verified sources, explicit fallbacks")
        for slot in range(6):
            index = page_index * 6 + slot
            if index >= len(results): break
            row, col = slot // 2, slot % 2
            x = margin_x + col * (cell_width + gap_x)
            y = page_height - margin_top - (row + 1) * cell_height - row * gap_y
            draw_cell(pdf, results[index], output_dir, x, y, cell_width, cell_height)
        pdf.setFillColor(HexColor("#8A8E9D")); pdf.setFont("Helvetica", 7)
        pdf.drawString(margin_x, 15, "PBL is retained only as an alias for review; me05 is the canonical Pitch Black identity.")
        pdf.drawRightString(page_width - margin_x, 15, f"Page {page_index + 1} of {page_count}")
        pdf.showPage()
    pdf.save()


def write_manifest(results: list[LogoResult], output_dir: Path) -> None:
    with (output_dir / "pokemon-set-logo-manifest.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(asdict(results[0]).keys()))
        writer.writeheader()
        for result in results: writer.writerow(asdict(result))
    (output_dir / "pokemon-set-logo-manifest.json").write_text(json.dumps([asdict(r) for r in results], indent=2, ensure_ascii=False), encoding="utf-8")
    counts: dict[str, int] = {}
    for result in results: counts[result.status] = counts.get(result.status, 0) + 1
    lines = ["Pokémon set logo sourcing summary", "=================================", f"Requested entries: {len(results)}", *[f"{k}: {v}" for k, v in sorted(counts.items())], "", "Identity decision:", "- me05 is canonical Pitch Black.", "- PBL is a duplicate alias and reuses me05 rather than creating a second asset.", "", "Unresolved entries:"]
    unresolved = [r for r in results if r.status == "unresolved"]
    lines.extend((f"- {r.code}: {r.name}" for r in unresolved),)
    if not unresolved: lines.append("- None")
    (output_dir / "README.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_zip(output_dir: Path, output_file: Path) -> None:
    with zipfile.ZipFile(output_file, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(output_dir.rglob("*")):
            if path.is_file() and path != output_file:
                archive.write(path, path.relative_to(output_dir))


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    output_dir = root / "artifacts" / "pokemon-set-logo-sheet-20260911"
    if output_dir.exists(): shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    session = build_session(); data = load_source_data(session)
    results = resolve_all(session, data, output_dir)
    write_manifest(results, output_dir)
    build_pdf(results, output_dir, output_dir / "pokemon-set-logos-6-per-page.pdf")
    build_zip(output_dir, output_dir / "pokemon-set-logo-import-bundle.zip")
    print("\nBuild complete")
    for status in sorted({r.status for r in results}): print(f"{status}: {sum(1 for r in results if r.status == status)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
