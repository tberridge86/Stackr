from __future__ import annotations

import ast
import csv
import hashlib
import io
import json
import math
import re
import shutil
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path("build/traditional-chinese-logo-sheets-v2")
ASSET_DIR = ROOT / "individual-assets"
PAGE_DIR = ROOT / "a4-pages"
CACHE_DIR = Path("build/traditional-chinese-logo-cache-v2")
SOURCE_SCRIPT = Path(".github/scripts/audit_traditional_chinese_logos.py")
PRODUCT_INDEX = "https://asia.pokemon-card.com/tw/products/"

for path in (ASSET_DIR, PAGE_DIR, CACHE_DIR):
    path.mkdir(parents=True, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 (compatible; Stackr-Traditional-Chinese-logo-sheet/2.0)",
        "Accept": "text/html,application/xhtml+xml,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.5",
    }
)


@dataclass(frozen=True)
class Item:
    code: str
    supplied_name: str


@dataclass
class ProductLink:
    title: str
    href: str
    images: list[str]


OFFICIAL_NAME_OVERRIDES = {
    "SV10": "火箭隊的榮耀",
    "SV5K": "狂野之力",
    "S11": "迷途深淵",
    "S8b": "VMAX絕群壓軸",
    "S4a": "閃色明星V",
    "S4": "驚天伏特攻擊",
    "SCC": "進化",
    "SCA": "搭檔",
    "SCB": "挑戰",
}

QUERY_OVERRIDES = {
    "SV10": ["火箭隊的榮耀"],
    "SVP1": ["ex特別組合"],
    "SVC": ["起始組合ex 皮卡丘ex&巴布土撥"],
    "SV-P": ["特典卡 朱&紫"],
    "SDL": ["V初階牌組 噴火龍"],
    "SDM": ["V初階牌組 超夢"],
    "SDP": ["V初階牌組 皮卡丘"],
    "SN": ["初階牌組100 特別版"],
    "S11": ["迷途深淵"],
    "SI": ["初階牌組100"],
    "S8a": ["25週年收藏款"],
    "SCD": ["V起始牌組 強大"],
    "SP5": ["V起始牌組 強大"],
    "SCC": ["V起始牌組 進化"],
    "SCA": ["V起始牌組 搭檔"],
    "SCB": ["V起始牌組 挑戰"],
    "SJ": ["特別牌組組合 蒼響 藏瑪然特VS無極汰那"],
}

URL_OVERRIDES = {
    "SVP1": "https://asia.pokemon-card.com/tw/archives/3986/",
    "SVD": "https://asia.pokemon-card.com/tw/archive/special/card/svd/index.html",
    "S11": "https://asia.pokemon-card.com/tw/archive/special/card/s11/",
    "S8a": "https://asia.pokemon-card.com/tw/archive/special/card/s8a/index.html",
    "SDL": "https://asia.pokemon-card.com/tw/archives/3892/",
    "SDM": "https://asia.pokemon-card.com/tw/archives/3892/",
    "SDP": "https://asia.pokemon-card.com/tw/archives/3892/",
    "SCC": "https://asia.pokemon-card.com/tw/archive/special/card/scc/index.html",
    "SCA": "https://asia.pokemon-card.com/tw/archive/special/card/sca/index.html",
    "SCB": "https://asia.pokemon-card.com/tw/archive/special/card/scb/index.html",
    "SCD": "https://asia.pokemon-card.com/tw/archive/special/card/scd/index.html",
    "SP5": "https://asia.pokemon-card.com/tw/archive/special/card/scd/index.html",
    "SI": "https://asia.pokemon-card.com/tw/archive/special/card/si/index.html",
}

# These catalogue identities either duplicate another official Taiwan product or have no
# dependable standalone regional mark. Reuse the official Traditional Chinese parent artwork.
PARENT_FALLBACKS = {
    "SVHM": "SV4a",
    "SVF": "SV3",
    "SV-P": "SV1S",
    "SP5": "SCD",
    "SC2D": "SC2a",
    "SC1D": "SC1a",
}

# When one official page contains several variants, filenames and alt text are not always
# consistent. These terms make the intended variant win without introducing non-Taiwan assets.
VARIANT_TERMS = {
    "SV5K": ["sv5k", "wild", "狂野", "k"],
    "SV5M": ["sv5m", "cyber", "異度", "m"],
    "SV4K": ["sv4k", "ancient", "古代", "k"],
    "SV4M": ["sv4m", "future", "未來", "m"],
    "SV2D": ["sv2d", "clay", "碟旋", "d"],
    "SV2P": ["sv2p", "snow", "冰雪", "p"],
    "SV1S": ["sv1s", "scarlet", "朱", "s"],
    "SV1V": ["sv1v", "violet", "紫", "v"],
    "S10D": ["s10d", "time", "時間", "d"],
    "S10P": ["s10p", "space", "空間", "p"],
    "S7D": ["s7d", "tower", "摩天", "d"],
    "S7R": ["s7r", "sky", "蒼空", "r"],
    "S6H": ["s6h", "silver", "銀白", "h"],
    "S6K": ["s6k", "jet", "漆黑", "k"],
    "S5I": ["s5i", "single", "一撃", "i"],
    "S5R": ["s5r", "rapid", "連撃", "r"],
    "SVAL": ["sval", "呆火鱷", "電龍"],
    "SVAM": ["svam", "新葉喵", "路卡利歐"],
    "SVAW": ["svaw", "潤水鴨", "謎擬"],
    "SVEL": ["svel", "骨紋", "skeledirge"],
    "SVEM": ["svem", "超夢", "mewtwo"],
    "SVHK": ["svhk", "密勒頓", "miraidon"],
    "SDL": ["sdl", "噴火龍", "charizard"],
    "SDM": ["sdm", "超夢", "mewtwo"],
    "SDP": ["sdp", "皮卡丘", "pikachu"],
    "SPD": ["spd", "代歐奇希斯", "deoxys"],
    "SPZ": ["spz", "捷拉奧拉", "zeraora"],
}


COMMON_BAD = (
    "header",
    "footer",
    "menu",
    "nav_",
    "icon_",
    "sns",
    "facebook",
    "twitter",
    "youtube",
    "line.png",
    "arrow",
    "search",
    "loading",
    "favicon",
    "common/logo",
    "card-img",
    "/card/",
    "cardlist",
    "card_list",
    "btn_",
    "close",
    "modal",
    "rule_",
)


KEYWORD_SCORES = {
    "logo": 360,
    "title": 320,
    "ttl": 300,
    "headline": 280,
    "top_banner": 260,
    "banner": 220,
    "mainvisual": 210,
    "main_visual": 210,
    "keyvisual": 210,
    "key_visual": 210,
    "kv": 170,
    "carousel": 120,
    "product": 95,
    "package": 90,
    "pkg": 90,
    "box": 40,
}


def load_items() -> list[Item]:
    module = ast.parse(SOURCE_SCRIPT.read_text(encoding="utf-8"))
    for node in module.body:
        if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "ITEMS" for t in node.targets):
            raw = ast.literal_eval(node.value)
            return [Item(code=row["code"], supplied_name=row["name"]) for row in raw]
    raise RuntimeError("ITEMS list not found")


def normalise(text: str) -> str:
    text = (text or "").replace("＆", "&").replace("・", "").replace("･", "")
    text = text.replace("「", "").replace("」", "").replace("『", "").replace("』", "")
    text = text.replace("寶可夢集換式卡牌遊戲", "").replace("商品資訊", "")
    text = re.sub(r"[\s　:：,，。\-_/()（）]+", "", text)
    return text.casefold()


def safe_filename(text: str) -> str:
    text = re.sub(r"[^A-Za-z0-9._-]+", "-", text.strip())
    return text.strip("-") or "asset"


def get(url: str, timeout: int = 45) -> requests.Response:
    last: Exception | None = None
    for attempt in range(3):
        try:
            response = SESSION.get(url, timeout=timeout)
            response.raise_for_status()
            if "asia.pokemon-card.com/tw/" in url:
                response.encoding = "utf-8"
            return response
        except Exception as exc:  # noqa: BLE001
            last = exc
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(f"GET failed for {url}: {last}")


def get_json(url: str) -> dict:
    try:
        return get(url, 30).json()
    except Exception:
        return {}


def extract_url(value: str, base: str) -> str:
    value = (value or "").strip().split()[0]
    return urljoin(base, value)


def parse_product_index() -> list[ProductLink]:
    response = get(PRODUCT_INDEX)
    soup = BeautifulSoup(response.text, "html.parser")
    products: list[ProductLink] = []
    seen: set[tuple[str, str]] = set()
    for anchor in soup.find_all("a", href=True):
        href = urljoin(PRODUCT_INDEX, anchor["href"])
        if "asia.pokemon-card.com/tw/" not in href:
            continue
        node = anchor
        selected_text = ""
        selected_images: list[str] = []
        for _ in range(7):
            if node is None:
                break
            text = re.sub(r"\s+", " ", " ".join(node.stripped_strings)).strip()
            images: list[str] = []
            for image in node.find_all("img"):
                for attr in ("src", "data-src", "data-lazy-src", "data-original"):
                    if image.get(attr):
                        images.append(extract_url(image.get(attr, ""), PRODUCT_INDEX))
            if text and len(text) <= 220:
                selected_text = text
                selected_images = images
            if any(token in text for token in ("擴充包", "牌組", "組合", "收藏箱", "家庭", "SET A", "SET B", "特典卡")) and images:
                break
            node = node.parent
        if not selected_text or len(selected_text) > 220:
            continue
        key = (href, selected_text)
        if key in seen:
            continue
        seen.add(key)
        products.append(ProductLink(selected_text, href, list(dict.fromkeys(selected_images))))
    return products


def official_name(item: Item) -> str:
    if item.code in OFFICIAL_NAME_OVERRIDES:
        return OFFICIAL_NAME_OVERRIDES[item.code]
    data = get_json(f"https://api.tcgdex.net/v2/zh-tw/sets/{item.code}")
    return str(data.get("name") or item.supplied_name)


def query_terms(item: Item, display_name: str) -> list[str]:
    values = [display_name, item.supplied_name]
    values.extend(QUERY_OVERRIDES.get(item.code, []))
    return list(dict.fromkeys(v for v in values if v))


def match_product(item: Item, display_name: str, products: list[ProductLink]) -> ProductLink | None:
    if item.code in URL_OVERRIDES:
        return ProductLink(display_name, URL_OVERRIDES[item.code], [])

    terms = query_terms(item, display_name)
    best: tuple[float, int, ProductLink] | None = None
    for product in products:
        product_norm = normalise(product.title)
        for term in terms:
            query_norm = normalise(term)
            if not query_norm:
                continue
            if product_norm == query_norm:
                score = 1000.0
            elif query_norm in product_norm:
                # Prefer the shortest title containing the requested identity. This prevents
                # "ex特別組合" from matching a later, longer unrelated product first.
                score = 900.0 - max(0, len(product_norm) - len(query_norm))
            elif product_norm in query_norm:
                score = 820.0 - max(0, len(query_norm) - len(product_norm))
            else:
                from difflib import SequenceMatcher

                score = SequenceMatcher(None, query_norm, product_norm).ratio() * 500.0
            candidate = (score, -len(product_norm), product)
            if best is None or candidate[:2] > best[:2]:
                best = candidate
    return best[2] if best and best[0] >= 250 else None


def collect_image_candidates(page_url: str, product_images: Iterable[str]) -> list[tuple[str, str]]:
    candidates: list[tuple[str, str]] = []
    for url in product_images:
        candidates.append((url, "product-index"))
    try:
        response = get(page_url)
    except Exception as exc:
        print(f"PAGE MISS {page_url}: {exc}")
        return candidates
    soup = BeautifulSoup(response.text, "html.parser")

    for meta in soup.find_all("meta"):
        prop = (meta.get("property") or meta.get("name") or "").casefold()
        content = meta.get("content") or ""
        if content and prop in {"og:image", "twitter:image", "twitter:image:src"}:
            candidates.append((urljoin(page_url, content), f"meta:{prop}"))

    for image in soup.find_all("img"):
        context = " ".join(
            str(value or "")
            for value in (
                image.get("alt"),
                image.get("title"),
                image.get("class"),
                image.get("id"),
            )
        )
        for attr in ("src", "data-src", "data-lazy-src", "data-original"):
            value = image.get(attr)
            if value:
                candidates.append((extract_url(value, page_url), context))
        for attr in ("srcset", "data-srcset"):
            value = image.get(attr)
            if value:
                for piece in value.split(","):
                    candidates.append((extract_url(piece.strip(), page_url), context))

    for source in soup.find_all("source"):
        context = " ".join(str(value or "") for value in (source.get("media"), source.get("type"), source.get("class")))
        for attr in ("src", "srcset", "data-srcset"):
            value = source.get(attr)
            if value:
                for piece in value.split(","):
                    candidates.append((extract_url(piece.strip(), page_url), context))

    for match in re.finditer(r"(?:url\(|['\"])(https?://[^'\"\)\s]+|/[^'\"\)\s]+\.(?:png|jpe?g|webp))(?:['\"\)]?)", response.text, re.I):
        candidates.append((urljoin(page_url, match.group(1)), "html/css"))

    deduped: list[tuple[str, str]] = []
    seen: set[str] = set()
    for url, context in candidates:
        url = url.replace("&amp;", "&")
        if url in seen:
            continue
        seen.add(url)
        lower = url.casefold()
        if not lower.startswith("http"):
            continue
        if not any(ext in lower.split("?")[0] for ext in (".png", ".jpg", ".jpeg", ".webp")):
            continue
        deduped.append((url, context))
    return deduped


def open_remote_image(url: str) -> Image.Image:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
        suffix = ".img"
    cache = CACHE_DIR / f"{key}{suffix}"
    if not cache.exists():
        response = get(url, 60)
        if len(response.content) < 400:
            raise ValueError("image response too small")
        cache.write_bytes(response.content)
    image = Image.open(cache)
    image.load()
    return image.convert("RGBA")


def trim_image(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return rgba


def candidate_score(item: Item, display_name: str, url: str, context: str, image: Image.Image) -> float:
    text = f"{url} {context}".casefold()
    score = 0.0
    for bad in COMMON_BAD:
        if bad in text:
            score -= 500.0

    code_forms = {
        item.code.casefold(),
        re.sub(r"[^a-z0-9]", "", item.code.casefold()),
        item.code.casefold().replace("-", "_"),
    }
    compact_text = re.sub(r"[^a-z0-9]", "", text)
    for code_form in code_forms:
        if code_form and code_form in text:
            score += 460.0
        compact = re.sub(r"[^a-z0-9]", "", code_form)
        if len(compact) >= 3 and compact in compact_text:
            score += 260.0

    for term in VARIANT_TERMS.get(item.code, []):
        norm = normalise(term)
        if norm and (norm in normalise(text) or norm in compact_text):
            score += 150.0 if len(norm) >= 3 else 20.0

    for keyword, value in KEYWORD_SCORES.items():
        if keyword in text:
            score += value

    name_norm = normalise(display_name)
    context_norm = normalise(context)
    if name_norm and name_norm in context_norm:
        score += 420.0

    width, height = image.size
    if width < 120 or height < 45:
        return -9999
    ratio = width / max(1, height)
    if 1.4 <= ratio <= 7.5:
        score += 180.0
    elif 0.8 <= ratio < 1.4:
        score += 80.0
    elif ratio < 0.55:
        score -= 100.0
    if width >= 500:
        score += 60.0
    if width >= 900:
        score += 35.0
    if height >= 100:
        score += 20.0
    if height > width * 1.7:
        score -= 90.0

    alpha = image.getchannel("A")
    extrema = alpha.getextrema()
    if extrema[0] < 245:
        score += 85.0

    # Large hero screenshots are acceptable but lose to isolated titles/logos.
    if width >= 1400 and height >= 900 and 0.9 <= ratio <= 1.9:
        score -= 60.0
    return score


def choose_asset(item: Item, display_name: str, page_url: str, product_images: Iterable[str]) -> tuple[Image.Image, str, str, list[dict[str, str]]]:
    scored: list[tuple[float, str, str, Image.Image]] = []
    audit_rows: list[dict[str, str]] = []
    for url, context in collect_image_candidates(page_url, product_images):
        try:
            image = open_remote_image(url)
            score = candidate_score(item, display_name, url, context, image)
            audit_rows.append(
                {
                    "code": item.code,
                    "url": url,
                    "context": context,
                    "width": str(image.width),
                    "height": str(image.height),
                    "score": f"{score:.1f}",
                }
            )
            if score > -1000:
                scored.append((score, url, context, image))
        except Exception as exc:  # noqa: BLE001
            audit_rows.append({"code": item.code, "url": url, "context": context, "width": "", "height": "", "score": f"ERROR {exc}"})
    if not scored:
        raise RuntimeError(f"No usable official Taiwan image found for {item.code} at {page_url}")
    score, url, context, image = max(scored, key=lambda row: row[0])
    return trim_image(image), url, context, audit_rows


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSansCJKtc-Bold.otf" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJKtc-Regular.otf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for candidate in candidates:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size=size)
    return ImageFont.load_default()


def text_lines(draw: ImageDraw.ImageDraw, text: str, font_obj: ImageFont.ImageFont, max_width: int) -> list[str]:
    if not text:
        return []
    lines: list[str] = []
    current = ""
    for char in text:
        trial = current + char
        if current and draw.textbbox((0, 0), trial, font=font_obj)[2] > max_width:
            lines.append(current)
            current = char
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


def draw_centered_lines(draw: ImageDraw.ImageDraw, center_x: int, top_y: int, text: str, font_obj: ImageFont.ImageFont, fill: tuple[int, int, int, int], max_width: int, spacing: int = 6) -> int:
    lines = text_lines(draw, text, font_obj, max_width)
    y = top_y
    for line in lines:
        box = draw.textbbox((0, 0), line, font=font_obj)
        draw.text((center_x - (box[2] - box[0]) // 2, y), line, font=font_obj, fill=fill)
        y += box[3] - box[1] + spacing
    return y


def rounded_contain(image: Image.Image, box: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(box, Image.Resampling.LANCZOS)
    return copy


def build_pages(records: list[dict[str, str]]) -> list[Path]:
    page_w, page_h = 2480, 3508
    margin_x, margin_y = 95, 90
    gap_x, gap_y = 55, 48
    footer_h = 62
    cell_w = (page_w - 2 * margin_x - gap_x) // 2
    cell_h = (page_h - 2 * margin_y - footer_h - 2 * gap_y) // 3

    colours = {
        "background": (246, 247, 249, 255),
        "card": (255, 255, 255, 255),
        "border": (213, 218, 227, 255),
        "text": (18, 25, 40, 255),
        "muted": (86, 96, 115, 255),
        "tag": (235, 239, 247, 255),
        "tag_text": (46, 60, 91, 255),
        "correction": (255, 244, 214, 255),
    }
    code_font = font(38, True)
    name_font = font(43, True)
    meta_font = font(24, False)
    badge_font = font(23, True)
    page_font = font(22, False)

    pages: list[Path] = []
    total_pages = math.ceil(len(records) / 6)
    for page_number in range(total_pages):
        page = Image.new("RGBA", (page_w, page_h), colours["background"])
        draw = ImageDraw.Draw(page)
        subset = records[page_number * 6 : (page_number + 1) * 6]
        for slot, record in enumerate(subset):
            row, col = divmod(slot, 2)
            x0 = margin_x + col * (cell_w + gap_x)
            y0 = margin_y + row * (cell_h + gap_y)
            x1, y1 = x0 + cell_w, y0 + cell_h
            draw.rounded_rectangle((x0, y0, x1, y1), radius=30, fill=colours["card"], outline=colours["border"], width=3)
            draw.text((x0 + 30, y0 + 24), record["code"], font=code_font, fill=colours["text"])

            badge = record["badge"]
            badge_box = draw.textbbox((0, 0), badge, font=badge_font)
            badge_w = badge_box[2] - badge_box[0] + 28
            badge_h = badge_box[3] - badge_box[1] + 17
            badge_x = x1 - 28 - badge_w
            badge_y = y0 + 26
            draw.rounded_rectangle((badge_x, badge_y, badge_x + badge_w, badge_y + badge_h), radius=badge_h // 2, fill=colours["tag"])
            draw.text((badge_x + 14, badge_y + 5), badge, font=badge_font, fill=colours["tag_text"])

            asset = Image.open(record["file"]).convert("RGBA")
            image_box = (cell_w - 100, 510)
            fitted = rounded_contain(asset, image_box)
            image_x = x0 + (cell_w - fitted.width) // 2
            image_y = y0 + 115 + (510 - fitted.height) // 2
            # A pale checker-free stage ensures transparent logos and wide banners remain legible.
            stage_x0, stage_y0 = x0 + 35, y0 + 104
            stage_x1, stage_y1 = x1 - 35, y0 + 635
            draw.rounded_rectangle((stage_x0, stage_y0, stage_x1, stage_y1), radius=22, fill=(250, 250, 251, 255))
            page.alpha_composite(fitted, (image_x, image_y))

            text_y = y0 + 660
            text_y = draw_centered_lines(draw, x0 + cell_w // 2, text_y, record["display_name"], name_font, colours["text"], cell_w - 90, spacing=4)
            if record["correction_note"]:
                note = record["correction_note"]
                note_lines = text_lines(draw, note, meta_font, cell_w - 110)
                note_height = sum(draw.textbbox((0, 0), line, font=meta_font)[3] + 3 for line in note_lines) + 14
                note_y = min(text_y + 8, y1 - note_height - 52)
                draw.rounded_rectangle((x0 + 45, note_y, x1 - 45, note_y + note_height), radius=15, fill=colours["correction"])
                yy = note_y + 7
                for line in note_lines:
                    box = draw.textbbox((0, 0), line, font=meta_font)
                    draw.text((x0 + cell_w // 2 - (box[2] - box[0]) // 2, yy), line, font=meta_font, fill=colours["muted"])
                    yy += box[3] - box[1] + 3
            elif record["fallback_note"]:
                draw_centered_lines(draw, x0 + cell_w // 2, text_y + 9, record["fallback_note"], meta_font, colours["muted"], cell_w - 100, spacing=3)

        marker = f"官方台灣繁體中文素材 · {page_number + 1} / {total_pages}"
        box = draw.textbbox((0, 0), marker, font=page_font)
        draw.text(((page_w - (box[2] - box[0])) // 2, page_h - 48), marker, font=page_font, fill=colours["muted"])
        path = PAGE_DIR / f"traditional-chinese-set-logos-page-{page_number + 1:02d}.png"
        page.convert("RGB").save(path, "PNG", optimize=True, dpi=(300, 300))
        pages.append(path)
    return pages


def build_contact_sheet(pages: list[Path]) -> Path:
    previews: list[Image.Image] = []
    for page in pages:
        image = Image.open(page).convert("RGB")
        image.thumbnail((620, 877), Image.Resampling.LANCZOS)
        previews.append(image.copy())
        image.close()
    cols = 4
    rows = math.ceil(len(previews) / cols)
    canvas = Image.new("RGB", (cols * 640, rows * 897), "white")
    for index, image in enumerate(previews):
        x = (index % cols) * 640 + 10
        y = (index // cols) * 897 + 10
        canvas.paste(image, (x, y))
    path = ROOT / "traditional-chinese-logo-contact-sheet.jpg"
    canvas.save(path, "JPEG", quality=88, optimize=True)
    return path


def main() -> None:
    if ROOT.exists():
        shutil.rmtree(ROOT)
    ASSET_DIR.mkdir(parents=True, exist_ok=True)
    PAGE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_DIR.mkdir(parents=True, exist_ok=True)

    items = load_items()
    if len(items) != 83:
        raise RuntimeError(f"Expected 83 rows, found {len(items)}")
    products = parse_product_index()
    print(f"Parsed {len(products)} official Taiwan product links")

    item_by_code = {item.code: item for item in items}
    resolved: dict[str, dict[str, str]] = {}
    candidate_audit: list[dict[str, str]] = []

    def resolve(code: str) -> dict[str, str]:
        if code in resolved:
            return resolved[code]
        item = item_by_code[code]
        display_name = official_name(item)
        if code in PARENT_FALLBACKS:
            parent_code = PARENT_FALLBACKS[code]
            parent = resolve(parent_code)
            result = {
                "code": code,
                "supplied_name": item.supplied_name,
                "display_name": display_name,
                "source_code": parent_code,
                "page_url": parent["page_url"],
                "source_url": parent["source_url"],
                "source_context": parent["source_context"],
                "file": parent["file"],
                "filename": parent["filename"],
                "badge": "沿用官方繁中母系列",
                "fallback_note": f"未有獨立標誌，沿用 {parent_code} 官方繁中素材",
                "correction_note": "",
                "sha256": parent["sha256"],
            }
            resolved[code] = result
            return result

        product = match_product(item, display_name, products)
        if product is None:
            raise RuntimeError(f"No official Taiwan product page match for {code} {display_name}")
        print(f"\nRESOLVE {code} {display_name} -> {product.title} | {product.href}")
        image, source_url, source_context, audit = choose_asset(item, display_name, product.href, product.images)
        candidate_audit.extend(audit)
        filename = f"{len(resolved) + 1:02d}_{safe_filename(code)}_{safe_filename(display_name)}.png"
        path = ASSET_DIR / filename
        # Keep source quality while limiting pathological hero images.
        if image.width > 1800 or image.height > 1200:
            image.thumbnail((1800, 1200), Image.Resampling.LANCZOS)
        image.save(path, "PNG", optimize=True)
        digest = hashlib.sha256(path.read_bytes()).hexdigest()

        correction_note = ""
        supplied_norm = normalise(item.supplied_name)
        display_norm = normalise(display_name)
        if supplied_norm != display_norm and code in OFFICIAL_NAME_OVERRIDES:
            correction_note = f"原清單名稱「{item.supplied_name}」與繁中代碼不符；已更正為「{display_name}」"

        source_text = f"{source_url} {source_context}".casefold()
        if any(word in source_text for word in ("logo", "title", "ttl", "headline")):
            badge = "官方繁中標誌／標題圖"
        elif any(word in source_text for word in ("banner", "mainvisual", "keyvisual", "top_banner", "kv")):
            badge = "官方繁中主視覺"
        else:
            badge = "官方繁中商品圖"

        result = {
            "code": code,
            "supplied_name": item.supplied_name,
            "display_name": display_name,
            "source_code": code,
            "page_url": product.href,
            "source_url": source_url,
            "source_context": source_context,
            "file": str(path),
            "filename": filename,
            "badge": badge,
            "fallback_note": "",
            "correction_note": correction_note,
            "sha256": digest,
        }
        resolved[code] = result
        return result

    records = [resolve(item.code) for item in items]
    if len(records) != 83:
        raise RuntimeError(f"Expected 83 resolved records, found {len(records)}")

    manifest_columns = [
        "code",
        "supplied_name",
        "display_name",
        "source_code",
        "badge",
        "fallback_note",
        "correction_note",
        "page_url",
        "source_url",
        "source_context",
        "filename",
        "sha256",
    ]
    manifest_csv = ROOT / "traditional-chinese-logo-manifest.csv"
    with manifest_csv.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=manifest_columns)
        writer.writeheader()
        for record in records:
            writer.writerow({key: record[key] for key in manifest_columns})

    manifest_json = ROOT / "traditional-chinese-logo-manifest.json"
    manifest_json.write_text(
        json.dumps([{key: record[key] for key in manifest_columns} for record in records], ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    audit_csv = ROOT / "candidate-audit.csv"
    with audit_csv.open("w", encoding="utf-8-sig", newline="") as handle:
        fields = ["code", "url", "context", "width", "height", "score"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(candidate_audit)

    pages = build_pages(records)
    pdf_path = ROOT / "Traditional_Chinese_Pokemon_Set_Logos_6_Per_A4.pdf"
    pdf_images = [Image.open(path).convert("RGB") for path in pages]
    pdf_images[0].save(pdf_path, "PDF", save_all=True, append_images=pdf_images[1:], resolution=300.0, quality=92)
    for image in pdf_images:
        image.close()
    contact_sheet = build_contact_sheet(pages)

    readme = ROOT / "README.txt"
    corrected = [record for record in records if record["correction_note"]]
    fallbacks = [record for record in records if record["fallback_note"]]
    readme.write_text(
        "Traditional Chinese Pokemon set branding sheets\n"
        "==============================================\n\n"
        "- 83 requested catalogue entries\n"
        "- 14 A4 pages, exactly 6 entries per page except the final page\n"
        "- Static 300-dpi PDF and page PNGs\n"
        "- All displayed artwork comes from the official Pokemon Card Taiwan website\n"
        "- No Japanese or English expansion artwork is silently substituted\n"
        "- Some official Taiwan names and logos legitimately retain Latin text such as ex, VSTAR, VMAX or Pokemon GO\n"
        f"- {len(corrected)} supplied names corrected where the code identified a different Traditional Chinese product\n"
        f"- {len(fallbacks)} entries use a clearly labelled official Traditional Chinese parent-series asset because no independent mark exists\n\n"
        "The CSV/JSON manifest records every source page, selected source image and substitution.\n",
        encoding="utf-8",
    )

    bundle = ROOT / "Traditional_Chinese_Pokemon_Set_Logos_6_Per_A4.zip"
    with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(ASSET_DIR.glob("*.png")):
            archive.write(path, path.relative_to(ROOT))
        for path in sorted(PAGE_DIR.glob("*.png")):
            archive.write(path, path.relative_to(ROOT))
        for path in (pdf_path, manifest_csv, manifest_json, audit_csv, readme, contact_sheet):
            archive.write(path, path.relative_to(ROOT))

    print(f"\nDONE: {len(records)} entries, {len(pages)} pages")
    print(f"PDF: {pdf_path}")
    print(f"ZIP: {bundle}")


if __name__ == "__main__":
    main()
