#!/usr/bin/env python3
"""
Retrieve Simplified Chinese Pokémon TCG set logos/reference images and build:
- a six-per-page PDF contact sheet
- a ZIP of retrieved PNGs
- a CSV retrieval report

Primary source: TCGdex Simplified Chinese API/CDN.
Fallback: TCGdex universal set symbol, then a 52Poké wiki page image.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import sys
import textwrap
import time
import unicodedata
import zipfile
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import urlparse

import requests
from PIL import Image, ImageChops, ImageOps, UnidentifiedImageError
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "sets.tsv"
OUTPUT_DIR = ROOT / "output"
IMAGE_DIR = OUTPUT_DIR / "images"
PDF_PATH = OUTPUT_DIR / "simplified_chinese_set_images_6_per_page.pdf"
ZIP_PATH = OUTPUT_DIR / "simplified_chinese_set_images_png.zip"
REPORT_PATH = OUTPUT_DIR / "retrieval_report.csv"
README_PATH = OUTPUT_DIR / "README.txt"

TCGDEX_SETS_URL = "https://api.tcgdex.net/v2/zh-cn/sets"
TCGDEX_ASSET_INDEX_URL = "https://assets.tcgdex.net/datas.json"
TCGDEX_ASSET_ROOT = "https://assets.tcgdex.net"
WIKI_API = "https://wiki.52poke.com/api.php"

HTTP_TIMEOUT = 35
USER_AGENT = (
    "StackR-Simplified-Chinese-Set-Asset-Retriever/1.0 "
    "(personal catalogue asset compilation; contact via repository owner)"
)


@dataclass
class Row:
    order: int
    requested_code: str
    requested_name: str
    resolved_id: str = ""
    resolved_name: str = ""
    series: str = ""
    asset_type: str = ""
    status: str = "missing"
    source_url: str = ""
    local_file: str = ""
    width: int = 0
    height: int = 0
    sha256: str = ""
    notes: str = ""


def build_session() -> requests.Session:
    session = requests.Session()
    retries = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=0.8,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retries, pool_connections=20, pool_maxsize=20)
    session.mount("https://", adapter)
    session.mount("http://", adapter)
    session.headers.update(
        {
            "User-Agent": USER_AGENT,
            "Accept": "application/json,image/avif,image/webp,image/png,image/*,*/*;q=0.8",
        }
    )
    return session


SESSION = build_session()


def load_manifest() -> list[Row]:
    rows: list[Row] = []
    with MANIFEST.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for index, item in enumerate(reader, start=1):
            code = (item.get("code") or "").strip()
            name = (item.get("name") or "").strip()
            if not code or not name:
                continue
            rows.append(Row(order=index, requested_code=code, requested_name=name))
    if not rows:
        raise RuntimeError(f"No rows found in {MANIFEST}")
    return rows


def request_json(url: str, *, params: dict[str, Any] | None = None) -> Any:
    response = SESSION.get(url, params=params, timeout=HTTP_TIMEOUT)
    response.raise_for_status()
    return response.json()


def flatten_list_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("data", "sets", "items", "results"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    return []


def norm_text(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    value = value.replace("＆", "&")
    value = re.sub(r"[·•・:：/／()（）\[\]【】{}<>《》“”\"'’`~～,，.。_-]+", "", value)
    value = re.sub(r"\s+", "", value)
    return value


LEADING_GENERIC_TERMS = (
    "宝可梦卡牌",
    "宝可梦集换式卡牌游戏",
    "补充包",
    "强化包",
    "专题包",
    "特典卡",
)


def compact_product_name(value: str) -> str:
    result = value.strip()
    changed = True
    while changed:
        changed = False
        for prefix in LEADING_GENERIC_TERMS:
            if result.startswith(prefix):
                result = result[len(prefix):].lstrip(" ·:：")
                changed = True
    result = re.sub(r"（\s*5张装\s*）", "", result)
    result = re.sub(r"\(\s*5张装\s*\)", "", result)
    return result.strip()


def name_keys(value: str) -> set[str]:
    compact = compact_product_name(value)
    keys = {norm_text(value), norm_text(compact)}
    return {key for key in keys if key}


def extract_series_from_asset_url(url: str) -> str:
    try:
        parts = [part for part in urlparse(url).path.split("/") if part]
        # /zh-cn/{series}/{set}/logo
        if len(parts) >= 4:
            return parts[-3]
    except Exception:
        pass
    return ""


def build_api_indexes(api_sets: list[dict[str, Any]]) -> tuple[dict[str, dict[str, Any]], dict[str, list[dict[str, Any]]]]:
    by_id: dict[str, dict[str, Any]] = {}
    by_name: dict[str, list[dict[str, Any]]] = {}
    for item in api_sets:
        set_id = str(item.get("id") or "").strip()
        if set_id:
            by_id[set_id.casefold()] = item
        name = str(item.get("name") or "").strip()
        for key in name_keys(name):
            by_name.setdefault(key, []).append(item)
    return by_id, by_name


def build_asset_index(asset_payload: Any) -> dict[str, list[dict[str, Any]]]:
    """Return case-folded set ID -> one or more asset records."""
    result: dict[str, list[dict[str, Any]]] = {}
    if not isinstance(asset_payload, dict):
        return result
    lang_root = asset_payload.get("zh-cn")
    univ_root = asset_payload.get("univ")
    if not isinstance(lang_root, dict):
        lang_root = {}
    if not isinstance(univ_root, dict):
        univ_root = {}

    series_ids = set(lang_root) | set(univ_root)
    for series_id in sorted(series_ids):
        localized_sets = lang_root.get(series_id)
        universal_sets = univ_root.get(series_id)
        if not isinstance(localized_sets, dict):
            localized_sets = {}
        if not isinstance(universal_sets, dict):
            universal_sets = {}

        set_ids = set(localized_sets) | set(universal_sets)
        for set_id in set_ids:
            localized_meta = localized_sets.get(set_id)
            universal_meta = universal_sets.get(set_id)
            if not isinstance(localized_meta, dict):
                localized_meta = {}
            if not isinstance(universal_meta, dict):
                universal_meta = {}
            record = {
                "id": set_id,
                "series": series_id,
                "logo": bool(localized_meta.get("logo")),
                "symbol": bool(universal_meta.get("symbol")),
            }
            result.setdefault(str(set_id).casefold(), []).append(record)
    return result


def resolve_set(
    row: Row,
    api_by_id: dict[str, dict[str, Any]],
    api_by_name: dict[str, list[dict[str, Any]]],
    asset_by_id: dict[str, list[dict[str, Any]]],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None, str]:
    code_key = row.requested_code.casefold()
    api_item = api_by_id.get(code_key)
    asset_items = asset_by_id.get(code_key) or []
    asset_item = asset_items[0] if asset_items else None
    resolution_note = "matched by code"

    if api_item is None:
        candidates: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for key in name_keys(row.requested_name):
            for item in api_by_name.get(key, []):
                item_id = str(item.get("id") or "")
                if item_id and item_id not in seen_ids:
                    candidates.append(item)
                    seen_ids.add(item_id)
        if len(candidates) == 1:
            api_item = candidates[0]
            resolution_note = "code absent; matched uniquely by normalized name"
            matched_id = str(api_item.get("id") or "").casefold()
            matched_assets = asset_by_id.get(matched_id) or []
            if matched_assets:
                asset_item = matched_assets[0]
        elif len(candidates) > 1:
            resolution_note = "code absent; name match was ambiguous"
        else:
            resolution_note = "code and normalized name not found in TCGdex list"

    if api_item and not asset_item:
        matched_id = str(api_item.get("id") or "").casefold()
        matched_assets = asset_by_id.get(matched_id) or []
        if matched_assets:
            asset_item = matched_assets[0]

    return api_item, asset_item, resolution_note


def candidate_asset_urls(api_item: dict[str, Any] | None, asset_item: dict[str, Any] | None) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(asset_type: str, base: str | None) -> None:
        if not base:
            return
        base = str(base).strip()
        base = re.sub(r"\.(?:png|webp|jpe?g)$", "", base, flags=re.I)
        for ext in ("png", "webp", "jpg"):
            url = f"{base}.{ext}"
            if url not in seen:
                candidates.append((asset_type, url))
                seen.add(url)

    if api_item:
        add("logo", api_item.get("logo"))
        add("symbol_fallback", api_item.get("symbol"))

    if asset_item:
        set_id = str(asset_item.get("id") or "")
        series = str(asset_item.get("series") or "")
        if set_id and series and asset_item.get("logo"):
            add("logo", f"{TCGDEX_ASSET_ROOT}/zh-cn/{series}/{set_id}/logo")
        if set_id and series and asset_item.get("symbol"):
            add("symbol_fallback", f"{TCGDEX_ASSET_ROOT}/univ/{series}/{set_id}/symbol")

    return candidates


def safe_filename(order: int, code: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9._-]+", "_", code).strip("._") or f"set_{order}"
    return f"{order:03d}_{clean}.png"


def trim_transparent(img: Image.Image) -> Image.Image:
    rgba = img.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return rgba


def decode_to_png(content: bytes, destination: Path, source_url: str, content_type: str = "") -> tuple[int, int, str]:
    is_svg = (
        "svg" in content_type.casefold()
        or source_url.casefold().split("?", 1)[0].endswith(".svg")
        or content.lstrip().startswith(b"<svg")
        or b"<svg" in content[:500].lower()
    )
    if is_svg:
        try:
            import cairosvg  # type: ignore
        except ImportError as exc:
            raise RuntimeError("SVG source found but CairoSVG is unavailable") from exc
        png_bytes = cairosvg.svg2png(bytestring=content, output_width=1400)
        img = Image.open(io.BytesIO(png_bytes))
    else:
        img = Image.open(io.BytesIO(content))

    img.load()
    img = ImageOps.exif_transpose(img)
    img = trim_transparent(img)

    if img.width < 2 or img.height < 2:
        raise ValueError("decoded image is effectively empty")

    # Prevent enormous source images from making the bundle unnecessarily large.
    max_dimension = 2400
    if max(img.size) > max_dimension:
        scale = max_dimension / max(img.size)
        img = img.resize(
            (max(1, round(img.width * scale)), max(1, round(img.height * scale))),
            Image.Resampling.LANCZOS,
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    img.save(destination, format="PNG", optimize=True)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    return img.width, img.height, digest


def try_download_image(url: str, destination: Path) -> tuple[int, int, str]:
    response = SESSION.get(url, timeout=HTTP_TIMEOUT)
    if response.status_code != 200:
        raise requests.HTTPError(f"HTTP {response.status_code} for {url}")
    if len(response.content) < 100:
        raise ValueError(f"response too small ({len(response.content)} bytes)")
    content_type = response.headers.get("Content-Type", "")
    if "text/html" in content_type.casefold():
        raise ValueError("received HTML instead of an image")
    return decode_to_png(response.content, destination, url, content_type)


def wiki_title_candidates(requested_name: str) -> list[str]:
    variants = [requested_name, compact_product_name(requested_name)]
    expanded: list[str] = []
    for value in variants:
        value = value.strip()
        if not value:
            continue
        expanded.append(value)
        expanded.append(re.sub(r"\s*&\s*", "&", value))
        # Most 52Poké set pages use a title ending in （TCG）.
        if not value.endswith("（TCG）"):
            expanded.append(f"{value}（TCG）")
    result: list[str] = []
    seen: set[str] = set()
    for item in expanded:
        key = item.casefold()
        if key not in seen:
            result.append(item)
            seen.add(key)
    return result


def query_wiki_image(requested_name: str) -> tuple[str, str] | None:
    for title in wiki_title_candidates(requested_name):
        params = {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "redirects": "1",
            "prop": "pageimages",
            "piprop": "thumbnail|original",
            "pithumbsize": "1400",
            "titles": title,
        }
        try:
            payload = request_json(WIKI_API, params=params)
        except Exception:
            continue
        pages = payload.get("query", {}).get("pages", []) if isinstance(payload, dict) else []
        if not isinstance(pages, list):
            continue
        for page in pages:
            if not isinstance(page, dict) or page.get("missing"):
                continue
            thumbnail = page.get("thumbnail")
            original = page.get("original")
            image_url = ""
            if isinstance(thumbnail, dict):
                image_url = str(thumbnail.get("source") or "")
            if not image_url and isinstance(original, dict):
                image_url = str(original.get("source") or "")
            if image_url:
                resolved_title = str(page.get("title") or title)
                return image_url, resolved_title
        time.sleep(0.05)
    return None


def retrieve(rows: list[Row]) -> tuple[list[Row], list[str]]:
    warnings: list[str] = []

    api_sets: list[dict[str, Any]] = []
    try:
        api_sets = flatten_list_payload(request_json(TCGDEX_SETS_URL))
        if not api_sets:
            warnings.append("TCGdex set list returned no usable records.")
    except Exception as exc:
        warnings.append(f"TCGdex set list failed: {exc}")

    asset_payload: Any = {}
    try:
        asset_payload = request_json(TCGDEX_ASSET_INDEX_URL)
    except Exception as exc:
        warnings.append(f"TCGdex asset index failed: {exc}")

    api_by_id, api_by_name = build_api_indexes(api_sets)
    asset_by_id = build_asset_index(asset_payload)

    print(f"Manifest rows: {len(rows)}")
    print(f"TCGdex API sets: {len(api_sets)}")
    print(f"TCGdex asset IDs: {len(asset_by_id)}")

    for row in rows:
        api_item, asset_item, resolution_note = resolve_set(
            row, api_by_id, api_by_name, asset_by_id
        )

        if api_item:
            row.resolved_id = str(api_item.get("id") or "")
            row.resolved_name = str(api_item.get("name") or "")
            row.series = (
                str(api_item.get("serie", {}).get("id") or "")
                if isinstance(api_item.get("serie"), dict)
                else ""
            )
            if not row.series:
                row.series = extract_series_from_asset_url(
                    str(api_item.get("logo") or api_item.get("symbol") or "")
                )
        if asset_item:
            row.resolved_id = row.resolved_id or str(asset_item.get("id") or "")
            row.series = row.series or str(asset_item.get("series") or "")

        destination = IMAGE_DIR / safe_filename(row.order, row.requested_code)
        download_errors: list[str] = []

        for asset_type, url in candidate_asset_urls(api_item, asset_item):
            try:
                width, height, digest = try_download_image(url, destination)
                row.asset_type = asset_type
                row.status = "retrieved"
                row.source_url = url
                row.local_file = str(destination.relative_to(OUTPUT_DIR))
                row.width = width
                row.height = height
                row.sha256 = digest
                row.notes = resolution_note
                break
            except Exception as exc:
                download_errors.append(f"{asset_type}: {type(exc).__name__}")

        if row.status != "retrieved":
            wiki_result = query_wiki_image(row.requested_name)
            if wiki_result:
                wiki_url, wiki_title = wiki_result
                try:
                    width, height, digest = try_download_image(wiki_url, destination)
                    row.asset_type = "wiki_reference_fallback"
                    row.status = "retrieved"
                    row.source_url = wiki_url
                    row.local_file = str(destination.relative_to(OUTPUT_DIR))
                    row.width = width
                    row.height = height
                    row.sha256 = digest
                    row.notes = (
                        f"{resolution_note}; no usable TCGdex logo/symbol; "
                        f"used 52Poké page image from {wiki_title}"
                    )
                except Exception as exc:
                    download_errors.append(f"wiki: {type(exc).__name__}")

        if row.status != "retrieved":
            row.asset_type = "missing"
            row.notes = resolution_note
            if download_errors:
                row.notes += "; attempts=" + ",".join(download_errors[:8])

        print(
            f"[{row.order:03d}/{len(rows):03d}] {row.requested_code:<14} "
            f"{row.status:<9} {row.asset_type}"
        )

    return rows, warnings


def draw_wrapped_text(
    pdf: canvas.Canvas,
    text: str,
    x: float,
    y_top: float,
    max_width: float,
    font_name: str,
    font_size: float,
    max_lines: int,
    leading: float,
) -> int:
    """Draw CJK-safe wrapped text one character at a time."""
    if not text:
        return 0
    lines: list[str] = []
    current = ""
    for char in text:
        trial = current + char
        if current and pdfmetrics.stringWidth(trial, font_name, font_size) > max_width:
            lines.append(current)
            current = char
            if len(lines) >= max_lines:
                break
        else:
            current = trial
    if len(lines) < max_lines and current:
        lines.append(current)

    # Add an ellipsis if the text did not fit.
    consumed = "".join(lines)
    if len(consumed) < len(text) and lines:
        ellipsis = "…"
        last = lines[-1]
        while last and pdfmetrics.stringWidth(last + ellipsis, font_name, font_size) > max_width:
            last = last[:-1]
        lines[-1] = last + ellipsis

    pdf.setFont(font_name, font_size)
    for index, line in enumerate(lines):
        pdf.drawCentredString(x, y_top - index * leading, line)
    return len(lines)


def draw_missing_art(pdf: canvas.Canvas, cx: float, cy: float, width: float, height: float) -> None:
    pdf.saveState()
    pdf.setStrokeColor(colors.HexColor("#CBD0DA"))
    pdf.setFillColor(colors.HexColor("#F1F3F7"))
    pdf.roundRect(cx - width / 2, cy - height / 2, width, height, 8, fill=1, stroke=1)
    pdf.setStrokeColor(colors.HexColor("#ADB4C2"))
    pdf.setLineWidth(1.4)
    pdf.line(cx - 24, cy - 12, cx + 24, cy + 12)
    pdf.line(cx - 24, cy + 12, cx + 24, cy - 12)
    pdf.setFillColor(colors.HexColor("#667085"))
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawCentredString(cx, cy - height / 2 + 14, "NO VERIFIED IMAGE FOUND")
    pdf.restoreState()


def build_pdf(rows: list[Row]) -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))

    page_width, page_height = landscape(A4)
    margin_x = 24
    margin_top = 22
    footer_h = 20
    gap_x = 12
    gap_y = 10
    columns = 2
    rows_per_page = 3
    per_page = columns * rows_per_page

    usable_w = page_width - 2 * margin_x
    usable_h = page_height - margin_top - footer_h - 18
    cell_w = (usable_w - gap_x) / columns
    cell_h = (usable_h - gap_y * (rows_per_page - 1)) / rows_per_page
    total_pages = math.ceil(len(rows) / per_page)

    pdf = canvas.Canvas(str(PDF_PATH), pagesize=(page_width, page_height))
    pdf.setTitle("Simplified Chinese Pokémon TCG Set Images — 6 per page")
    pdf.setAuthor("StackR asset retrieval")

    for page_index in range(total_pages):
        page_rows = rows[page_index * per_page : (page_index + 1) * per_page]

        for slot, item in enumerate(page_rows):
            col = slot % columns
            grid_row = slot // columns
            x = margin_x + col * (cell_w + gap_x)
            y = page_height - margin_top - (grid_row + 1) * cell_h - grid_row * gap_y

            pdf.setFillColor(colors.HexColor("#FAFBFD"))
            pdf.setStrokeColor(colors.HexColor("#D9DEE8"))
            pdf.setLineWidth(0.8)
            pdf.roundRect(x, y, cell_w, cell_h, 8, fill=1, stroke=1)

            status_label = {
                "logo": "TCGdex logo",
                "symbol_fallback": "TCGdex symbol",
                "wiki_reference_fallback": "reference image",
                "missing": "missing",
            }.get(item.asset_type, item.asset_type or "missing")

            # Asset type at top-left; order marker at top-right.
            pdf.setFillColor(
                colors.HexColor("#9A3412")
                if item.asset_type in {"wiki_reference_fallback", "missing"}
                else colors.HexColor("#667085")
            )
            pdf.setFont("Helvetica", 5.5)
            pdf.drawString(x + 8, y + cell_h - 11, status_label)
            pdf.setFillColor(colors.HexColor("#667085"))
            pdf.setFont("Helvetica", 6.5)
            pdf.drawRightString(x + cell_w - 8, y + cell_h - 11, f"{item.order:03d}")

            text_h = 44
            image_pad_x = 18
            image_bottom = y + text_h
            image_top = y + cell_h - 14
            image_box_w = cell_w - 2 * image_pad_x
            image_box_h = image_top - image_bottom
            image_cx = x + cell_w / 2
            image_cy = image_bottom + image_box_h / 2

            if item.local_file:
                image_path = OUTPUT_DIR / item.local_file
                try:
                    with Image.open(image_path) as img:
                        img.load()
                        iw, ih = img.size
                    scale = min(image_box_w / iw, image_box_h / ih)
                    draw_w = iw * scale
                    draw_h = ih * scale
                    pdf.drawImage(
                        ImageReader(str(image_path)),
                        image_cx - draw_w / 2,
                        image_cy - draw_h / 2,
                        width=draw_w,
                        height=draw_h,
                        preserveAspectRatio=True,
                        mask="auto",
                    )
                except Exception:
                    draw_missing_art(pdf, image_cx, image_cy, image_box_w * 0.72, image_box_h * 0.72)
            else:
                draw_missing_art(pdf, image_cx, image_cy, image_box_w * 0.72, image_box_h * 0.72)

            # Code badge.
            code_text = item.requested_code
            badge_w = min(
                cell_w - 20,
                max(52, pdfmetrics.stringWidth(code_text, "Helvetica-Bold", 8) + 18),
            )
            badge_x = x + (cell_w - badge_w) / 2
            badge_y = y + 27
            pdf.setFillColor(colors.HexColor("#E9ECF3"))
            pdf.setStrokeColor(colors.HexColor("#D5DAE5"))
            pdf.roundRect(badge_x, badge_y, badge_w, 14, 7, fill=1, stroke=1)
            pdf.setFillColor(colors.HexColor("#111827"))
            pdf.setFont("Helvetica-Bold", 8)
            pdf.drawCentredString(x + cell_w / 2, badge_y + 4, code_text)

            pdf.setFillColor(colors.HexColor("#1F2937"))
            draw_wrapped_text(
                pdf,
                item.requested_name,
                x + cell_w / 2,
                y + 20,
                cell_w - 20,
                "STSong-Light",
                7.2,
                max_lines=2,
                leading=8.3,
            )

        pdf.setFillColor(colors.HexColor("#667085"))
        pdf.setFont("Helvetica", 7)
        pdf.drawString(
            margin_x,
            10,
            "Simplified Chinese Pokémon TCG set assets • ordered as supplied",
        )
        pdf.drawRightString(
            page_width - margin_x,
            10,
            f"Page {page_index + 1} of {total_pages}",
        )
        pdf.showPage()

    pdf.save()


def write_report(rows: list[Row]) -> None:
    fieldnames = list(asdict(rows[0]).keys())
    with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow(asdict(row))


def write_readme(rows: list[Row], warnings: list[str]) -> None:
    counts: dict[str, int] = {}
    for row in rows:
        counts[row.asset_type or "missing"] = counts.get(row.asset_type or "missing", 0) + 1
    missing = [row.requested_code for row in rows if row.status != "retrieved"]

    lines = [
        "SIMPLIFIED CHINESE POKÉMON TCG SET IMAGE BUNDLE",
        "================================================",
        "",
        f"Requested entries: {len(rows)}",
        f"TCGdex standalone logos: {counts.get('logo', 0)}",
        f"TCGdex symbol fallbacks: {counts.get('symbol_fallback', 0)}",
        f"52Poké reference-image fallbacks: {counts.get('wiki_reference_fallback', 0)}",
        f"No verified image found: {counts.get('missing', 0)}",
        "",
        "The PDF uses six entries per page in the exact order supplied.",
        "The retrieval_report.csv records the resolved set ID, source URL, asset type,",
        "dimensions and SHA-256 digest for every entry.",
        "",
        "Important: symbol and wiki fallbacks are explicitly labelled. They are not",
        "silently presented as standalone set logos.",
    ]
    if missing:
        lines.extend(["", "Missing codes:", textwrap.fill(", ".join(missing), width=100)])
    if warnings:
        lines.extend(["", "Network/source warnings:"])
        lines.extend(f"- {warning}" for warning in warnings)
    README_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_zip(rows: list[Row]) -> None:
    with zipfile.ZipFile(ZIP_PATH, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        for row in rows:
            if row.local_file:
                image_path = OUTPUT_DIR / row.local_file
                if image_path.exists():
                    archive.write(image_path, arcname=row.local_file)
        archive.write(REPORT_PATH, arcname=REPORT_PATH.name)
        archive.write(README_PATH, arcname=README_PATH.name)


def validate_outputs(rows: list[Row]) -> None:
    expected_pages = math.ceil(len(rows) / 6)
    if not PDF_PATH.exists() or PDF_PATH.stat().st_size < 5_000:
        raise RuntimeError("PDF was not created or is implausibly small")
    if not ZIP_PATH.exists() or ZIP_PATH.stat().st_size < 1_000:
        raise RuntimeError("ZIP was not created or is implausibly small")
    if not REPORT_PATH.exists():
        raise RuntimeError("CSV report was not created")

    try:
        from pypdf import PdfReader
        reader = PdfReader(str(PDF_PATH))
        actual_pages = len(reader.pages)
        if actual_pages != expected_pages:
            raise RuntimeError(
                f"PDF page count mismatch: expected {expected_pages}, found {actual_pages}"
            )
    except ImportError:
        warnings = "pypdf unavailable; skipped page-count validation"
        print(warnings, file=sys.stderr)

    with zipfile.ZipFile(ZIP_PATH, "r") as archive:
        names = set(archive.namelist())
        if REPORT_PATH.name not in names or README_PATH.name not in names:
            raise RuntimeError("ZIP is missing its report or README")


def main() -> int:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    rows = load_manifest()
    rows, warnings = retrieve(rows)
    write_report(rows)
    write_readme(rows, warnings)
    build_pdf(rows)
    build_zip(rows)
    validate_outputs(rows)

    counts: dict[str, int] = {}
    for row in rows:
        counts[row.asset_type or "missing"] = counts.get(row.asset_type or "missing", 0) + 1

    summary = {
        "requested": len(rows),
        "pages": math.ceil(len(rows) / 6),
        "counts": counts,
        "pdf": PDF_PATH.name,
        "zip": ZIP_PATH.name,
        "report": REPORT_PATH.name,
        "warnings": warnings,
    }
    (OUTPUT_DIR / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
