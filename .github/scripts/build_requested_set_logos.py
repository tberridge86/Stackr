from __future__ import annotations

import csv
import hashlib
import io
import os
import re
import shutil
import sys
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw, ImageFont, ImageOps


OUT = Path("build/set-logo-pack")
LOGO_DIR = OUT / "individual-logos"
PAGE_DIR = OUT / "page-pngs"
CACHE = Path("build/set-logo-cache")

RAW_ASSET = "https://raw.githubusercontent.com/1niceroli/ptcg-assets/main/{set_id}/logo.png"
PTCG_ASSET = "https://images.pokemontcg.io/{set_id}/logo.png"
TCGDEX_POCKET = "https://assets.tcgdex.net/en/tcgp/{set_id}/logo.{ext}"

POCKET_ARCHIVES = {
    "A3a": "https://github.com/user-attachments/files/23511204/missing_images.zip",
    "A3b": "https://github.com/user-attachments/files/23511204/missing_images.zip",
    "B1a": "https://github.com/user-attachments/files/24303328/crimson_blaze_missing_images.zip",
}


@dataclass(frozen=True)
class RequestedLogo:
    code: str
    name: str
    exact_id: str | None = None
    parent_id: str | None = None
    pocket_id: str | None = None
    force_parent: bool = False
    note: str = ""


ITEMS: list[RequestedLogo] = [
    RequestedLogo("me05", "Pitch Black", exact_id="me5", note="Canonical asset ID is me5."),
    RequestedLogo("PBL", "Pitch Black", exact_id="me5", note="Duplicate identity resolved to the canonical Pitch Black logo."),
    RequestedLogo("B2a", "Paldean Wonders", pocket_id="B2a"),
    RequestedLogo("B1a", "Crimson Blaze", pocket_id="B1a"),
    RequestedLogo("mep", "MEP Black Star Promos", exact_id="mep", parent_id="me1"),
    RequestedLogo("mee", "Mega Evolution Energy", exact_id="mee", parent_id="me1"),
    RequestedLogo("A3b", "Eevee Grove", pocket_id="A3b"),
    RequestedLogo("A3a", "Extradimensional Crisis", pocket_id="A3a"),
    RequestedLogo("2024sv", "McDonald's Collection 2024", exact_id="2024sv", parent_id="sv1"),
    RequestedLogo("sv05", "Temporal Forces", exact_id="sv5"),
    RequestedLogo("mfb", "My First Battle", exact_id="mfb", parent_id="sv1"),
    RequestedLogo("2023sv", "McDonald's Collection 2023", exact_id="2023sv", parent_id="sv1"),
    RequestedLogo("sve", "Scarlet & Violet Energy", exact_id="sve", parent_id="sv1"),
    RequestedLogo("svp", "SVP Black Star Promos", exact_id="svp", parent_id="sv1"),
    RequestedLogo("swsh12.5gg", "Crown Zenith Galarian Gallery", parent_id="swsh12pt5", force_parent=True, note="Uses the Crown Zenith parent-set logo."),
    RequestedLogo("swsh12tg", "Silver Tempest Trainer Gallery", parent_id="swsh12", force_parent=True, note="Uses the Silver Tempest parent-set logo."),
    RequestedLogo("swsh11tg", "Lost Origin Trainer Gallery", parent_id="swsh11", force_parent=True, note="Uses the Lost Origin parent-set logo."),
    RequestedLogo("2022swsh", "McDonald's Collection 2022", exact_id="2022swsh", parent_id="swsh1"),
    RequestedLogo("swsh10tg", "Astral Radiance Trainer Gallery", parent_id="swsh10", force_parent=True, note="Uses the Astral Radiance parent-set logo."),
    RequestedLogo("swsh9tg", "Brilliant Stars Trainer Gallery", parent_id="swsh9", force_parent=True, note="Uses the Brilliant Stars parent-set logo."),
    RequestedLogo("cel25cc", "Celebrations Classic Collection", parent_id="cel25", force_parent=True, note="Uses the Celebrations parent-set logo."),
    RequestedLogo("swsh4.5sv", "Shining Fates Shiny Vault", parent_id="swsh45", force_parent=True, note="Uses the Shining Fates parent-set logo."),
    RequestedLogo("2021swsh", "McDonald's Collection 2021", exact_id="2021swsh", parent_id="swsh1"),
    RequestedLogo("swshp", "SWSH Black Star Promos", exact_id="swshp", parent_id="swsh1"),
    RequestedLogo("2019sm", "McDonald's Collection 2019", exact_id="2019sm", parent_id="sm1"),
    RequestedLogo("sma", "Hidden Fates Shiny Vault", parent_id="sm115", force_parent=True, note="Uses the Hidden Fates parent-set logo."),
    RequestedLogo("2018sm", "McDonald's Collection 2018", exact_id="2018sm", parent_id="sm1"),
    RequestedLogo("sm7.5", "Dragon Majesty", exact_id="sm75"),
    RequestedLogo("sm3.5", "Shining Legends", exact_id="sm35"),
    RequestedLogo("2017sm", "McDonald's Collection 2017", exact_id="2017sm", parent_id="sm1"),
    RequestedLogo("tk-sm-l", "SM Trainer Kit - Lycanroc", exact_id="tk-sm-l", parent_id="sm1"),
    RequestedLogo("tk-sm-r", "SM Trainer Kit - Alolan Raichu", exact_id="tk-sm-r", parent_id="sm1"),
    RequestedLogo("smp", "SM Black Star Promos", exact_id="smp", parent_id="sm1"),
    RequestedLogo("2016xy", "McDonald's Collection 2016", exact_id="2016xy", parent_id="xy1"),
    RequestedLogo("tk-xy-p", "XY Trainer Kit - Pikachu Libre", exact_id="tk-xy-p", parent_id="xy1"),
    RequestedLogo("tk-xy-su", "XY Trainer Kit - Suicune", exact_id="tk-xy-su", parent_id="xy1"),
    RequestedLogo("2015xy", "McDonald's Collection 2015", exact_id="2015xy", parent_id="xy1"),
    RequestedLogo("tk-xy-latia", "XY Trainer Kit - Latias", exact_id="tk-xy-latia", parent_id="xy1"),
    RequestedLogo("tk-xy-latio", "XY Trainer Kit - Latios", exact_id="tk-xy-latio", parent_id="xy1"),
    RequestedLogo("tk-xy-b", "XY Trainer Kit - Bisharp", exact_id="tk-xy-b", parent_id="xy1"),
    RequestedLogo("tk-xy-w", "XY Trainer Kit - Wigglytuff", exact_id="tk-xy-w", parent_id="xy1"),
    RequestedLogo("2014xy", "McDonald's Collection 2014", exact_id="2014xy", parent_id="xy1"),
]


def request_bytes(url: str, attempts: int = 3) -> bytes:
    last: Exception | None = None
    for attempt in range(attempts):
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Stackr-set-logo-pack/1.0",
                "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=45) as response:
                data = response.read()
                if len(data) < 100:
                    raise ValueError(f"Response too small ({len(data)} bytes)")
                return data
        except Exception as exc:  # noqa: BLE001 - report the final network failure clearly
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Could not download {url}: {last}")


def open_logo(data: bytes, origin: str) -> Image.Image:
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception as exc:  # noqa: BLE001
        raise ValueError(f"Not a readable image from {origin}: {exc}") from exc
    if image.width < 80 or image.height < 25:
        raise ValueError(f"Image from {origin} is implausibly small: {image.size}")
    return image.convert("RGBA")


def trim_logo(image: Image.Image) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)

    # Some catalogue logos are delivered on a flat white canvas rather than alpha.
    # Only remove edge-connected near-white pixels, preserving white detail inside the mark.
    if rgba.getextrema()[3] == (255, 255):
        px = rgba.load()
        w, h = rgba.size
        from collections import deque

        queue: deque[tuple[int, int]] = deque()
        seen: set[tuple[int, int]] = set()
        for x in range(w):
            queue.append((x, 0))
            queue.append((x, h - 1))
        for y in range(h):
            queue.append((0, y))
            queue.append((w - 1, y))
        while queue:
            x, y = queue.popleft()
            if (x, y) in seen or not (0 <= x < w and 0 <= y < h):
                continue
            seen.add((x, y))
            r, g, b, a = px[x, y]
            if a == 0 or (r >= 248 and g >= 248 and b >= 248):
                px[x, y] = (r, g, b, 0)
                queue.extend(((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)))
        bbox = rgba.getchannel("A").getbbox()
        if bbox:
            rgba = rgba.crop(bbox)
    return rgba


def physical_candidates(set_id: str) -> list[str]:
    return [RAW_ASSET.format(set_id=set_id), PTCG_ASSET.format(set_id=set_id)]


def pocket_candidates(set_id: str) -> list[str]:
    return [TCGDEX_POCKET.format(set_id=set_id, ext=ext) for ext in ("png", "webp", "jpg")]


def safe_slug(value: str) -> str:
    value = re.sub(r"[^A-Za-z0-9._-]+", "-", value.strip())
    return value.strip("-") or "logo"


def archive_for_pocket(set_id: str) -> Path | None:
    url = POCKET_ARCHIVES.get(set_id)
    if not url:
        return None
    CACHE.mkdir(parents=True, exist_ok=True)
    archive_path = CACHE / f"{set_id}-fallback.zip"
    if not archive_path.exists():
        archive_path.write_bytes(request_bytes(url))
    return archive_path


def logo_from_archive(set_id: str) -> tuple[Image.Image, str] | None:
    archive = archive_for_pocket(set_id)
    if archive is None:
        return None
    candidates: list[tuple[int, str, Image.Image]] = []
    with zipfile.ZipFile(archive) as zf:
        for member in zf.namelist():
            if member.endswith("/"):
                continue
            lower = member.lower()
            if not lower.endswith((".png", ".webp", ".jpg", ".jpeg")):
                continue
            try:
                image = open_logo(zf.read(member), f"{archive.name}:{member}")
            except Exception:
                continue
            score = 0
            compact = re.sub(r"[^a-z0-9]", "", lower)
            code_compact = re.sub(r"[^a-z0-9]", "", set_id.lower())
            if code_compact in compact:
                score += 100
            if "logo" in lower:
                score += 70
            if image.width > image.height * 1.4:
                score += 25
            if image.width >= 300:
                score += 10
            candidates.append((score, member, image))
    if not candidates:
        return None
    score, member, image = max(candidates, key=lambda row: row[0])
    if score < 70:
        return None
    return trim_logo(image), f"{archive.as_posix()}::{member}"


def try_urls(urls: Iterable[str]) -> tuple[Image.Image, str] | None:
    for url in urls:
        try:
            data = request_bytes(url, attempts=2)
            return trim_logo(open_logo(data, url)), url
        except Exception as exc:  # noqa: BLE001
            print(f"MISS {url}: {exc}")
    return None


def resolve_logo(item: RequestedLogo) -> tuple[Image.Image, str, str, str]:
    if item.pocket_id:
        result = try_urls(pocket_candidates(item.pocket_id))
        if result is None:
            archived = logo_from_archive(item.pocket_id)
            if archived is not None:
                image, source = archived
                return image, source, item.pocket_id, item.note
        else:
            image, source = result
            return image, source, item.pocket_id, item.note
        raise RuntimeError(f"No official Pocket logo resolved for {item.code} {item.name}")

    ids: list[tuple[str, bool]] = []
    if item.force_parent:
        if item.parent_id:
            ids.append((item.parent_id, True))
    else:
        if item.exact_id:
            ids.append((item.exact_id, False))
        if item.parent_id and item.parent_id != item.exact_id:
            ids.append((item.parent_id, True))

    for set_id, used_parent in ids:
        result = try_urls(physical_candidates(set_id))
        if result is None:
            continue
        image, source = result
        note = item.note
        if used_parent and not note:
            note = f"No distinct logo located; uses parent-set asset {set_id}."
        return image, source, set_id, note
    raise RuntimeError(f"No official logo resolved for {item.code} {item.name}")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf",
    ]
    for path in paths:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def fit_image(image: Image.Image, box: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(box, Image.Resampling.LANCZOS)
    return copy


def draw_centered_multiline(draw: ImageDraw.ImageDraw, xy: tuple[int, int], text: str, font_obj: ImageFont.ImageFont, fill: tuple[int, int, int], max_width: int, spacing: int = 8) -> None:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        trial = f"{current} {word}".strip()
        if draw.textbbox((0, 0), trial, font=font_obj)[2] <= max_width or not current:
            current = trial
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    line_height = draw.textbbox((0, 0), "Ag", font=font_obj)[3]
    total_h = len(lines) * line_height + max(0, len(lines) - 1) * spacing
    y = xy[1] - total_h // 2
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font_obj)
        x = xy[0] - (bbox[2] - bbox[0]) // 2
        draw.text((x, y), line, font=font_obj, fill=fill)
        y += line_height + spacing


def build_pages(records: list[dict[str, str]]) -> list[Path]:
    page_w, page_h = 2480, 3508
    margin_x, margin_y = 105, 100
    gutter_x, gutter_y = 60, 55
    cell_w = (page_w - 2 * margin_x - gutter_x) // 2
    footer_h = 70
    cell_h = (page_h - 2 * margin_y - footer_h - 2 * gutter_y) // 3
    bg = (248, 247, 244, 255)
    border = (213, 214, 218, 255)
    text = (23, 27, 38, 255)
    muted = (91, 98, 112, 255)
    code_font = font(42, bold=True)
    name_font = font(44, bold=True)
    note_font = font(25, bold=False)
    page_font = font(25, bold=False)

    pages: list[Path] = []
    for page_index in range(0, len(records), 6):
        page_records = records[page_index : page_index + 6]
        page = Image.new("RGBA", (page_w, page_h), bg)
        draw = ImageDraw.Draw(page)
        for local_index, rec in enumerate(page_records):
            row, col = divmod(local_index, 2)
            x0 = margin_x + col * (cell_w + gutter_x)
            y0 = margin_y + row * (cell_h + gutter_y)
            x1 = x0 + cell_w
            y1 = y0 + cell_h
            draw.rounded_rectangle((x0, y0, x1, y1), radius=34, fill=(255, 255, 255, 255), outline=border, width=3)
            draw.text((x0 + 34, y0 + 28), rec["code"], font=code_font, fill=text)

            logo = Image.open(rec["file"]).convert("RGBA")
            fitted = fit_image(logo, (cell_w - 120, 455))
            logo_x = x0 + (cell_w - fitted.width) // 2
            logo_y = y0 + 130 + (500 - fitted.height) // 2
            page.alpha_composite(fitted, (logo_x, logo_y))

            draw_centered_multiline(draw, (x0 + cell_w // 2, y0 + 725), rec["name"], name_font, text, cell_w - 90)
            if rec["note"]:
                draw_centered_multiline(draw, (x0 + cell_w // 2, y0 + 860), rec["note"], note_font, muted, cell_w - 90, spacing=5)

        page_no = page_index // 6 + 1
        total_pages = (len(records) + 5) // 6
        marker = f"{page_no} / {total_pages}"
        bbox = draw.textbbox((0, 0), marker, font=page_font)
        draw.text(((page_w - (bbox[2] - bbox[0])) // 2, page_h - 55), marker, font=page_font, fill=muted)
        path = PAGE_DIR / f"pokemon-set-logos-page-{page_no:02d}.png"
        page.convert("RGB").save(path, "PNG", optimize=True, dpi=(300, 300))
        pages.append(path)
    return pages


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    LOGO_DIR.mkdir(parents=True, exist_ok=True)
    PAGE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)

    records: list[dict[str, str]] = []
    failures: list[str] = []
    for index, item in enumerate(ITEMS, start=1):
        print(f"\n[{index:02d}/{len(ITEMS)}] {item.code} - {item.name}")
        try:
            image, source_url, resolved_id, note = resolve_logo(item)
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{item.code}: {exc}")
            print(f"FAIL {item.code}: {exc}")
            continue
        output_name = f"{index:02d}_{safe_slug(item.code)}_{safe_slug(item.name)}.png"
        output_path = LOGO_DIR / output_name
        image.save(output_path, "PNG", optimize=True)
        digest = hashlib.sha256(output_path.read_bytes()).hexdigest()
        records.append(
            {
                "order": str(index),
                "code": item.code,
                "name": item.name,
                "resolved_asset_id": resolved_id,
                "source_url": source_url,
                "note": note,
                "sha256": digest,
                "file": str(output_path),
                "filename": output_name,
            }
        )
        print(f"OK {item.code}: {source_url} -> {output_path} {image.size}")

    if failures:
        print("\nUnresolved assets:", file=sys.stderr)
        print("\n".join(failures), file=sys.stderr)
        raise SystemExit(2)
    if len(records) != 42:
        raise SystemExit(f"Expected 42 logos, resolved {len(records)}")

    manifest_path = OUT / "set-logo-manifest.csv"
    with manifest_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["order", "code", "name", "resolved_asset_id", "source_url", "note", "sha256", "filename"])
        writer.writeheader()
        for rec in records:
            writer.writerow({key: rec[key] for key in writer.fieldnames})

    pages = build_pages(records)
    pdf_pages = [Image.open(path).convert("RGB") for path in pages]
    pdf_path = OUT / "pokemon-set-logos-6-per-page.pdf"
    pdf_pages[0].save(pdf_path, "PDF", save_all=True, append_images=pdf_pages[1:], resolution=300.0, quality=95)
    for image in pdf_pages:
        image.close()

    readme = OUT / "README.txt"
    readme.write_text(
        "Pokemon set logo pack\n"
        "=====================\n\n"
        "Contents:\n"
        "- 42 transparent individual PNG logos in the supplied order\n"
        "- 7 A4 page PNGs, 6 logos per page\n"
        "- One combined 7-page PDF\n"
        "- CSV manifest with source asset ID, source URL, substitutions and SHA-256\n\n"
        "Parent-set branding is used only where the requested gallery, vault, energy or related subset has no distinct dependable logo.\n",
        encoding="utf-8",
    )

    inner_zip = OUT / "pokemon-set-logos-files.zip"
    with zipfile.ZipFile(inner_zip, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zf:
        for path in sorted(LOGO_DIR.glob("*.png")):
            zf.write(path, path.relative_to(OUT))
        for path in sorted(PAGE_DIR.glob("*.png")):
            zf.write(path, path.relative_to(OUT))
        zf.write(pdf_path, pdf_path.name)
        zf.write(manifest_path, manifest_path.name)
        zf.write(readme, readme.name)

    print(f"\nBuilt {len(records)} logos, {len(pages)} pages and {pdf_path}")


if __name__ == "__main__":
    main()
