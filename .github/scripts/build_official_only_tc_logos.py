from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import requests
from PIL import Image, ImageDraw, ImageFont

OUT = Path("build/official-only-tc-logos")
INDIVIDUAL = OUT / "individual"
PAGES = OUT / "pages"
for directory in (OUT, INDIVIDUAL, PAGES):
    directory.mkdir(parents=True, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; StackrOfficialLogoBuilder/1.0)",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8,application/json",
})

RAW: list[tuple[str, str]] = [
    ("SV10", "Destined Rivals"), ("SV9a", "熱風競技場"), ("SV9", "對戰搭檔"),
    ("SV8a", "太晶慶典ex"), ("SV8", "超電突圍"), ("SV7a", "樂園騰龍"),
    ("SV7", "星晶奇跡"), ("SV6a", "黑夜漫遊者"), ("SV6", "變幻假面"),
    ("SV5a", "緋紅薄霧"), ("SV5K", "Wild Force"), ("SVHK", "未來密勒頓ex"),
    ("SVHM", "閃色寶藏ex"), ("SV5M", "異度審判"), ("SV4a", "閃色寶藏ex"),
    ("SV4K", "古代咆哮"), ("SV4M", "未來閃光"), ("SVEL", "骨紋巨聲鱷ex"),
    ("SVEM", "超夢ex"), ("SV3a", "激狂駭浪"), ("SV3", "黯焰支配者"),
    ("SVAL", "起始組合ex 呆火鱷&電龍 ex"), ("SVAM", "起始組合ex 新葉喵&路卡利歐 ex"),
    ("SVAW", "起始組合ex 潤水鴨&謎擬Ｑ ex"), ("SVF", "黯焰支配者"),
    ("SVD", "ex初階牌組"), ("SV2a", "寶可夢卡牌151"), ("SVP1", "ex特別組合"),
    ("SVC", "皮卡丘特別組合"), ("SV2D", "碟旋暴擊"), ("SV2P", "冰雪險境"),
    ("SV1a", "三連音爆"), ("SVB", "頂級訓練家收藏箱ex"), ("SV1S", "朱ex"),
    ("SV1V", "紫ex"), ("S12a", "天地萬物VSTAR"), ("SV-P", "特典卡 朱&紫"),
    ("S12", "思維激盪"), ("SDL", "噴火龍"), ("SDM", "超夢"), ("SDP", "皮卡丘"),
    ("SN", "初階牌組100 特別版"), ("S11a", "白熱奧祕"), ("SP6", "VSTAR特別組合"),
    ("SPD", "VSTAR&VMAX 高級牌組 代歐奇希斯"), ("SPZ", "VSTAR&VMAX 高級牌組 捷拉奧拉"),
    ("S11", "三連音爆"), ("S10b", "Pokémon GO"), ("S10a", "黑暗亡靈"),
    ("S10D", "時間觀察者"), ("S10P", "空間魔術師"), ("S9a", "對戰地區"),
    ("SLD", "起始組合VSTAR 達克萊伊"), ("SLL", "起始組合VSTAR 路卡利歐"),
    ("SI", "初階牌組100"), ("S9", "星星誕生"), ("SJ", "藏瑪然特VS無極汰那"),
    ("SK", "頂級訓練家收藏箱 VSTAR"), ("S8b", "VMAX Climax"),
    ("S8a", "25週年收藏款"), ("S8", "匯流藝術"), ("SCD", "強大"),
    ("SP5", "強大"), ("S7D", "摩天巔峰"), ("S7R", "蒼空烈流"),
    ("SH", "寶可夢卡牌家庭組合"), ("S6a", "伊布英雄"), ("SCC", "Evolution"),
    ("S6H", "銀白戰槍"), ("S6K", "漆黑幽魂"), ("S5a", "雙璧戰士"),
    ("S5I", "一撃大師"), ("S5R", "連撃大師"), ("SCB", "挑戰"),
    ("S4a", "Shiny Star V"), ("SCA", "搭檔"), ("S4", "Amazing Volt Tackle"),
    ("SC2a", "無極力量 SET A"), ("SC2b", "無極力量 SET B"),
    ("SC2D", "無極力量"), ("SC1a", "劍&盾 SET A"), ("SC1b", "劍&盾 SET B"),
    ("SC1D", "劍&盾"),
]

# Product/deck codes without a dependable standalone expansion logo use the original
# related expansion, as requested. No text-generated or reconstructed marks are used.
PARENT: dict[str, str] = {
    "SVHK": "SV5M", "SVHM": "SV4a", "SVEL": "SV1S", "SVEM": "SV3", "SVF": "SV3",
    "SVAL": "SV1a", "SVAM": "SV1a", "SVAW": "SV1a", "SVD": "SV1a", "SVP1": "SV1a",
    "SVC": "SV1a", "SVB": "SV1a", "SV-P": "SV1a", "SDL": "S12a", "SDM": "S12a",
    "SDP": "S12a", "SN": "SI", "SP6": "S12a", "SPD": "S12a", "SPZ": "S12a",
    "S11": "SV1a", "SLD": "S9", "SLL": "S9", "SI": "S8b", "SJ": "S8b", "SK": "S9",
    "SCD": "S8", "SP5": "S8", "SH": "S6a", "SCC": "S6a", "SCB": "S5a", "SCA": "S5a",
    "SC2D": "SC2a", "SC1D": "SC1a",
}

# Verified Traditional Chinese standalone logo files published on the official Asian site.
CHINESE_OVERRIDES: dict[str, str] = {
    "S8b": "https://asia.pokemon-card.com/tw/archive/special/card/s8b/assets/images/main-logo.png",
    "SV8a": "https://asia.pokemon-card.com/tw/archive/special/card/sv8a/assets/images/hero-logo-2_sp.png",
}

# The supplied SV10 identity is the English Destined Rivals set, not the Asian SV10 identity.
SPECIAL_URLS: dict[str, str] = {
    "SV10": "https://images.pokemontcg.io/sv10/logo.png",
}

MANIFEST_URL = "https://raw.githubusercontent.com/Nccchan/kaitori-price-website/main/images/manifest.json"
RAW_BASE = "https://raw.githubusercontent.com/Nccchan/kaitori-price-website/main/"


@dataclass
class Resolved:
    requested_code: str
    requested_name: str
    source_code: str
    source_url: str
    source_kind: str
    image: Image.Image


def get_bytes(url: str) -> bytes:
    last: Exception | None = None
    for attempt in range(3):
        try:
            response = SESSION.get(url, timeout=45, allow_redirects=True)
            if response.status_code == 200 and len(response.content) > 200:
                return response.content
            if 400 <= response.status_code < 500:
                raise RuntimeError(f"HTTP {response.status_code}")
        except Exception as exc:  # noqa: BLE001
            last = exc
        if attempt < 2:
            import time
            time.sleep(1.0 + attempt)
    raise RuntimeError(f"Unable to download {url}: {last}")


def open_image(data: bytes, url: str) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        return image.convert("RGBA")
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Unreadable image from {url}: {exc}") from exc


def remove_edge_white(image: Image.Image) -> Image.Image:
    image = image.convert("RGBA")
    px = image.load()
    w, h = image.size
    from collections import deque
    q: deque[tuple[int, int]] = deque()
    seen: set[tuple[int, int]] = set()
    for x in range(w):
        q.append((x, 0)); q.append((x, h - 1))
    for y in range(h):
        q.append((0, y)); q.append((w - 1, y))
    while q:
        x, y = q.popleft()
        if not (0 <= x < w and 0 <= y < h) or (x, y) in seen:
            continue
        seen.add((x, y))
        r, g, b, a = px[x, y]
        if a <= 8 or (r >= 246 and g >= 246 and b >= 246):
            px[x, y] = (r, g, b, 0)
            q.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
    bbox = image.getchannel("A").getbbox()
    return image.crop(bbox) if bbox else image


def trim(image: Image.Image) -> Image.Image:
    image = remove_edge_white(image)
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    return image.crop(bbox) if bbox else image


def load_source_manifest() -> dict[str, str]:
    payload = json.loads(get_bytes(MANIFEST_URL).decode("utf-8"))
    pokemon = payload.get("pokemon", {})
    if not isinstance(pokemon, dict):
        raise RuntimeError("Unexpected source manifest")
    return {str(k): str(v).lstrip("./") for k, v in pokemon.items()}


def source_for(code: str, source_manifest: dict[str, str]) -> tuple[str, str, str]:
    if code in SPECIAL_URLS:
        return code, SPECIAL_URLS[code], "official_english_logo"
    if code in CHINESE_OVERRIDES:
        return code, CHINESE_OVERRIDES[code], "official_traditional_chinese_logo"

    source_code = code
    kind = "official_original_logo"
    if source_code not in source_manifest:
        source_code = PARENT.get(code, code)
        kind = "official_parent_set_logo"
    # A parent can itself be a product mapping.
    seen: set[str] = set()
    while source_code not in source_manifest and source_code in PARENT and source_code not in seen:
        seen.add(source_code)
        source_code = PARENT[source_code]
        kind = "official_parent_set_logo"
    if source_code not in source_manifest:
        raise RuntimeError(f"No verified logo source for {code}; resolved code {source_code}")
    return source_code, RAW_BASE + source_manifest[source_code], kind


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def draw_center(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], text: str, font_obj: ImageFont.ImageFont, fill=(24, 27, 36), max_lines: int = 2) -> None:
    x0, y0, x1, y1 = box
    max_width = x1 - x0
    words = list(text) if any(ord(c) > 127 for c in text) else text.split(" ")
    joiner = "" if any(ord(c) > 127 for c in text) else " "
    lines: list[str] = []
    current = ""
    for token in words:
        candidate = current + (joiner if current else "") + token
        width = draw.textbbox((0, 0), candidate, font=font_obj)[2]
        if width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = token
    if current:
        lines.append(current)
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        while draw.textbbox((0, 0), lines[-1] + "…", font=font_obj)[2] > max_width and lines[-1]:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    heights = [draw.textbbox((0, 0), line, font=font_obj)[3] for line in lines]
    total = sum(heights) + max(0, len(lines) - 1) * 8
    y = y0 + max(0, (y1 - y0 - total) // 2)
    for line, h in zip(lines, heights):
        bbox = draw.textbbox((0, 0), line, font=font_obj)
        x = x0 + (max_width - (bbox[2] - bbox[0])) // 2
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += h + 8


def make_pages(rows: list[dict[str, Any]]) -> list[Path]:
    page_w, page_h = 2480, 3508  # A4 at 300dpi
    margin_x, margin_y = 110, 105
    gap_x, gap_y = 56, 55
    footer_h = 55
    cell_w = (page_w - 2 * margin_x - gap_x) // 2
    cell_h = (page_h - 2 * margin_y - footer_h - 2 * gap_y) // 3
    code_font = font(38, True)
    name_font = font(39, True)
    source_font = font(22, False)
    footer_font = font(22, False)
    pages: list[Path] = []

    for page_start in range(0, len(rows), 6):
        page_no = page_start // 6 + 1
        page = Image.new("RGB", (page_w, page_h), (250, 249, 246))
        draw = ImageDraw.Draw(page)
        for local, row in enumerate(rows[page_start: page_start + 6]):
            r, c = divmod(local, 2)
            x0 = margin_x + c * (cell_w + gap_x)
            y0 = margin_y + r * (cell_h + gap_y)
            x1, y1 = x0 + cell_w, y0 + cell_h
            draw.rounded_rectangle((x0, y0, x1, y1), radius=30, fill="white", outline=(213, 216, 224), width=3)
            draw.text((x0 + 30, y0 + 24), row["code"], font=code_font, fill=(25, 28, 36))

            logo = Image.open(row["path"]).convert("RGBA")
            # Give official logos generous space and never distort them.
            max_logo = (cell_w - 130, 500)
            logo.thumbnail(max_logo, Image.Resampling.LANCZOS)
            logo_x = x0 + (cell_w - logo.width) // 2
            logo_y = y0 + 115 + (510 - logo.height) // 2
            page.paste(logo, (logo_x, logo_y), logo)

            draw_center(draw, (x0 + 45, y0 + 670, x1 - 45, y0 + 810), row["name"], name_font)
            source_label = {
                "official_traditional_chinese_logo": "官方繁體中文標誌",
                "official_original_logo": "官方原版標誌",
                "official_parent_set_logo": f"官方原系列標誌 · {row['source_code']}",
                "official_english_logo": "官方英文標誌",
            }[row["source_kind"]]
            draw_center(draw, (x0 + 45, y0 + 825, x1 - 45, y0 + 900), source_label, source_font, fill=(89, 96, 110), max_lines=1)

        total_pages = math.ceil(len(rows) / 6)
        footer = f"{page_no} / {total_pages}"
        b = draw.textbbox((0, 0), footer, font=footer_font)
        draw.text(((page_w - (b[2] - b[0])) // 2, page_h - 43), footer, font=footer_font, fill=(100, 105, 116))
        path = PAGES / f"official-set-logos-page-{page_no:02d}.png"
        page.save(path, "PNG", optimize=True, dpi=(300, 300))
        pages.append(path)
    return pages


def make_contact_sheet(page_paths: list[Path]) -> Path:
    thumbs: list[Image.Image] = []
    for path in page_paths:
        img = Image.open(path).convert("RGB")
        img.thumbnail((620, 877), Image.Resampling.LANCZOS)
        thumbs.append(img.copy())
    cols = 4
    rows = math.ceil(len(thumbs) / cols)
    sheet = Image.new("RGB", (cols * 620, rows * 877), "white")
    for i, img in enumerate(thumbs):
        sheet.paste(img, ((i % cols) * 620, (i // cols) * 877))
    path = OUT / "official-set-logos-contact-sheet.jpg"
    sheet.save(path, "JPEG", quality=90, optimize=True)
    return path


def main() -> None:
    # Ensure reruns never carry stale generated files.
    if OUT.exists():
        shutil.rmtree(OUT)
    INDIVIDUAL.mkdir(parents=True, exist_ok=True)
    PAGES.mkdir(parents=True, exist_ok=True)

    source_manifest = load_source_manifest()
    rows: list[dict[str, Any]] = []
    failures: list[str] = []
    cache: dict[str, Image.Image] = {}

    for index, (code, name) in enumerate(RAW, start=1):
        try:
            source_code, url, kind = source_for(code, source_manifest)
            if url not in cache:
                cache[url] = trim(open_image(get_bytes(url), url))
            image = cache[url].copy()
            if image.width < 80 or image.height < 25:
                raise RuntimeError(f"Implausibly small logo {image.size}")
            filename = f"{index:02d}_{re.sub(r'[^A-Za-z0-9._-]+', '-', code)}.png"
            path = INDIVIDUAL / filename
            image.save(path, "PNG", optimize=True)
            rows.append({
                "order": index,
                "code": code,
                "name": name,
                "source_code": source_code,
                "source_kind": kind,
                "source_url": url,
                "path": str(path),
                "filename": filename,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            })
            print(f"OK {index:02d}/83 {code} <- {source_code} {kind} {image.size}", flush=True)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{code}: {exc}")
            print(f"FAIL {code}: {exc}", flush=True)

    if failures:
        raise RuntimeError("Unresolved official logos:\n" + "\n".join(failures))
    if len(rows) != 83:
        raise RuntimeError(f"Expected 83 rows, created {len(rows)}")

    page_paths = make_pages(rows)
    pdf_path = OUT / "Official_Pokemon_Set_Logos_6_Per_A4.pdf"
    pdf_images = [Image.open(path).convert("RGB") for path in page_paths]
    pdf_images[0].save(pdf_path, "PDF", save_all=True, append_images=pdf_images[1:], resolution=300.0, quality=95)
    for image in pdf_images:
        image.close()
    make_contact_sheet(page_paths)

    manifest_path = OUT / "official-logo-manifest.csv"
    with manifest_path.open("w", newline="", encoding="utf-8-sig") as handle:
        fields = ["order", "code", "name", "source_code", "source_kind", "source_url", "filename", "sha256"]
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row[field] for field in fields})

    (OUT / "README.txt").write_text(
        "Official-only Pokemon set logo sheets\n"
        "======================================\n\n"
        "- 83 requested entries, six per A4 page.\n"
        "- No generated wordmarks, recreated typography or invented logos.\n"
        "- Verified Traditional Chinese logo files are used where available.\n"
        "- Otherwise the genuine original official logo is used.\n"
        "- Products without a standalone logo use the related original expansion logo.\n"
        "- The CSV manifest records the exact source and substitution for every entry.\n",
        encoding="utf-8",
    )

    inner_zip = OUT / "Official_Pokemon_Set_Logos_6_Per_A4.zip"
    with zipfile.ZipFile(inner_zip, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted(INDIVIDUAL.glob("*.png")):
            archive.write(path, path.relative_to(OUT))
        for path in sorted(PAGES.glob("*.png")):
            archive.write(path, path.relative_to(OUT))
        for path in (pdf_path, manifest_path, OUT / "README.txt", OUT / "official-set-logos-contact-sheet.jpg"):
            archive.write(path, path.relative_to(OUT))

    print(f"Built {len(rows)} entries, {len(page_paths)} pages", flush=True)


if __name__ == "__main__":
    main()
