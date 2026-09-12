from __future__ import annotations

import csv
import hashlib
import time
from pathlib import Path

import requests
from PIL import Image


OUT = Path("build/tw-logo-patches")
OUT.mkdir(parents=True, exist_ok=True)

URLS: dict[str, str] = {
    "SDL": "https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2022/10/TW_news_starter_after.png",
    "SDM": "https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2022/10/TW_news_starter_after.png",
    "SDP": "https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2022/10/TW_news_starter_after.png",
    "S8": "https://asia.pokemon-card.com/tw/archive/special/card/s8/img/banner-img.png",
    "SCD": "https://asia.pokemon-card.com/tw/archive/special/card/scd/img/banner-img.png",
    "S7D": "https://asia.pokemon-card.com/tw/archive/special/card/s7/img/banner-img.png",
    "S7R": "https://asia.pokemon-card.com/tw/archive/special/card/s7/img/banner-img.png",
    "SH": "https://asia.pokemon-card.com/tw/archive/special/card/family_game/img/product-img-1.png",
    "S6a": "https://asia.pokemon-card.com/tw/archive/special/card/s6a/images/banner-img_0507_sp.jpg",
    "SCC": "https://asia.pokemon-card.com/tw/archive/special/card/scc/img/banner-img.png",
    "S6H": "https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2021/09/73-thumb-240x240-16019.jpg",
    "S6K": "https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2021/09/72-thumb-240x240-16019.jpg",
    "S5a": "https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2021/09/71-thumb-240x240-16019.jpg",
    "S5I": "https://asia.pokemon-card.com/tw/archive/special/card/s5/img/banner-img.png",
    "S5R": "https://asia.pokemon-card.com/tw/archive/special/card/s5/img/banner-img.png",
    "SCB": "https://asia.pokemon-card.com/tw/archive/special/card/scb/images/banner-img.jpg",
    "S4a": "https://asia.pokemon-card.com/tw/archive/special/card/s4a/img/banner-img.png",
    "SCA": "https://asia.pokemon-card.com/tw/archive/special/card/sca/img/banner-img.png",
    "SC2a": "https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/07/thumb_setA-thumb-650x488-14937.png",
    "SC2b": "https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/07/thumb_setB-thumb-650x488-14935.png",
    "SC2D": "https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/07/thumb_deck-thumb-650x488-14938.png",
    "SC1a": "https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/06/dddae742ba1840663de5b1b3457019cb9b336358-thumb-650x488-14550.png",
    "SC1b": "https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/06/c5f87626cb140e6e2dec49dd0f19f7d578d6512b-thumb-650x488-14544.png",
    "SC1D": "https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/06/333e4237e6b9a9615ef8ac59a521cbbc24914d8c-thumb-650x488-14556.png",
}

session = requests.Session()
session.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; Stackr-Taiwan-logo-patch/1.0)",
    "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    "Referer": "https://asia.pokemon-card.com/tw/",
})

rows: list[dict[str, str]] = []
for code, url in URLS.items():
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            response = session.get(url, timeout=30)
            response.raise_for_status()
            if len(response.content) < 500:
                raise ValueError(f"response too small: {len(response.content)}")
            suffix = Path(url.split("?", 1)[0]).suffix.lower()
            if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
                suffix = ".png"
            path = OUT / f"{code}{suffix}"
            path.write_bytes(response.content)
            image = Image.open(path)
            image.load()
            if image.width < 180 or image.height < 100:
                raise ValueError(f"implausible image size: {image.size}")
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            rows.append({
                "code": code,
                "url": url,
                "filename": path.name,
                "width": str(image.width),
                "height": str(image.height),
                "sha256": digest,
            })
            print(f"OK {code}: {image.size} {url}")
            break
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(attempt + 1)
    else:
        raise RuntimeError(f"FAILED {code}: {url}: {last_error}")

with (OUT / "patch-manifest.csv").open("w", encoding="utf-8-sig", newline="") as handle:
    writer = csv.DictWriter(handle, fieldnames=["code", "url", "filename", "width", "height", "sha256"])
    writer.writeheader()
    writer.writerows(rows)

print(f"Downloaded {len(rows)} corrected official Taiwan assets")
