#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps

OUT = Path(__file__).resolve().parent / "exact-official-products"
OUT.mkdir(parents=True, exist_ok=True)

TARGETS = [
    {
        "code": "cs4dac",
        "page": "https://www.pokemon.cn/tcg/product/15882.html",
        "basename": "a4d266a0e01902ef67c2fe01987f1d856b8f52fc.png",
        "label": "起始卡组100",
    },
    {
        "code": "cs3dc",
        "page": "https://www.pokemon.cn/tcg/product/16063.html",
        "basename": "4f6acc8171b8de5ea576b392c1830ad61b920a67-scaled.png",
        "label": "起始卡组 洪荒演武V",
    },
    {
        "code": "cs5dc",
        "page": "https://www.pokemon.cn/tcg/product/15831.html",
        "basename": "a8c799a1df09f464872b1f73934192e2ea6c8d3c-scaled.png",
        "label": "勇魅群星 V起始卡组",
    },
    {
        "code": "csnc",
        "page": "https://www.pokemon.cn/tcg/product/15831.html",
        "basename": "20251125172659178.png",
        "label": "勇魅群星 卡组构筑礼盒",
    },
]

SESSION = requests.Session()
SESSION.headers.update(
    {
        "User-Agent": "Mozilla/5.0 StackR-official-product-retriever/1.0",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
    }
)


def image_sources(page_url: str) -> list[str]:
    response = SESSION.get(page_url, timeout=40)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    sources: list[str] = []
    for tag in soup.find_all("img"):
        for attr in ("data-src", "data-original", "data-lazy-src", "src"):
            value = tag.get(attr)
            if isinstance(value, str) and value.strip() and not value.startswith("data:"):
                sources.append(urljoin(page_url, value.strip()))
        srcset = tag.get("srcset")
        if isinstance(srcset, str):
            sources.extend(urljoin(page_url, part.strip().split()[0]) for part in srcset.split(",") if part.strip())
    # Some URLs are embedded in JSON/script payloads.
    for match in re.findall(r"https?://[^\"'<>\\ ]+", response.text.replace("\\/", "/")):
        if "image.pokemon.com.cn" in match:
            sources.append(match.replace("&amp;", "&"))
    result: list[str] = []
    seen: set[str] = set()
    for source in sources:
        if source not in seen:
            result.append(source)
            seen.add(source)
    return result


def save_png(content: bytes, path: Path) -> tuple[int, int]:
    from io import BytesIO

    image = Image.open(BytesIO(content))
    image.load()
    image = ImageOps.exif_transpose(image).convert("RGBA")
    bbox = image.getchannel("A").getbbox()
    if bbox:
        image = image.crop(bbox)
    if max(image.size) > 1800:
        ratio = 1800 / max(image.size)
        image = image.resize(
            (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
            Image.Resampling.LANCZOS,
        )
    image.save(path, "PNG", optimize=True)
    return image.size


def main() -> int:
    page_cache: dict[str, list[str]] = {}
    report: list[dict[str, object]] = []
    for target in TARGETS:
        page = str(target["page"])
        if page not in page_cache:
            page_cache[page] = image_sources(page)
        matches = [url for url in page_cache[page] if str(target["basename"]) in url]
        if not matches:
            raise RuntimeError(f"Exact image {target['basename']} was not found on {page}")
        image_url = matches[0]
        response = SESSION.get(image_url, headers={"Referer": page}, timeout=40)
        response.raise_for_status()
        path = OUT / f"{target['code']}.png"
        width, height = save_png(response.content, path)
        report.append(
            {
                **target,
                "image_url": image_url,
                "file": path.name,
                "width": width,
                "height": height,
            }
        )
        print(f"{target['code']}: {width}x{height}", flush=True)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
