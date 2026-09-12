from __future__ import annotations

import hashlib
import importlib.util
import re
import sys
import time
from pathlib import Path
from urllib.parse import urlparse

from PIL import Image


SOURCE = Path(__file__).with_name("build_traditional_chinese_logo_sheets.py")
spec = importlib.util.spec_from_file_location("tw_logo_builder_ultra", SOURCE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load {SOURCE}")
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)

# SVP1's historical numeric URL has moved; let the live official Taiwan catalogue provide it.
builder.URL_OVERRIDES.pop("SVP1", None)

# These are distinct official Taiwan products, not generic parent-set fallbacks.
builder.PARENT_FALLBACKS.pop("SC2D", None)
builder.PARENT_FALLBACKS.pop("SC1D", None)

# The 25th Anniversary expansion lives on the official regional anniversary microsite.
builder.URL_OVERRIDES["S8a"] = "https://card25th.portal-pokemon.com/tw/card/s8a/"
S8A_OFFICIAL_IMAGES = [
    "https://card25th.portal-pokemon.com/assets/img/card/s8a/tw/img_mv.png",
    "https://card25th.portal-pokemon.com/assets/img/card/s8a/tw/img_pack.png",
]

# These older official Taiwan pages often expose a generic social preview before their real
# Traditional Chinese product artwork. Pin the actual banner/package asset so it cannot be
# replaced by a generic Pokemon wordmark or an individual card scan.
EXPLICIT_OFFICIAL_IMAGES: dict[str, list[str]] = {
    "SDL": ["https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2022/10/TW_news_starter_after.png"],
    "SDM": ["https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2022/10/TW_news_starter_after.png"],
    "SDP": ["https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2022/10/TW_news_starter_after.png"],
    "S8": ["https://asia.pokemon-card.com/tw/archive/special/card/s8/img/banner-img.png"],
    "SCD": ["https://asia.pokemon-card.com/tw/archive/special/card/scd/img/banner-img.png"],
    "S7D": ["https://asia.pokemon-card.com/tw/archive/special/card/s7/img/banner-img.png"],
    "S7R": ["https://asia.pokemon-card.com/tw/archive/special/card/s7/img/banner-img.png"],
    "SH": ["https://asia.pokemon-card.com/tw/archive/special/card/family_game/img/product-img-1.png"],
    "S6a": ["https://asia.pokemon-card.com/tw/archive/special/card/s6a/images/banner-img_0507_sp.jpg"],
    "SCC": ["https://asia.pokemon-card.com/tw/archive/special/card/scc/img/banner-img.png"],
    "S6H": ["https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2021/09/73-thumb-240x240-16019.jpg"],
    "S6K": ["https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2021/09/72-thumb-240x240-16019.jpg"],
    "S5a": ["https://asia.pokemon-card.com/tw/wp-content/uploads/sites/2/2021/09/71-thumb-240x240-16019.jpg"],
    "S5I": ["https://asia.pokemon-card.com/tw/archive/special/card/s5/img/banner-img.png"],
    "S5R": ["https://asia.pokemon-card.com/tw/archive/special/card/s5/img/banner-img.png"],
    "SCB": ["https://asia.pokemon-card.com/tw/archive/special/card/scb/images/banner-img.jpg"],
    "S4a": ["https://asia.pokemon-card.com/tw/archive/special/card/s4a/img/banner-img.png"],
    "SCA": ["https://asia.pokemon-card.com/tw/archive/special/card/sca/img/banner-img.png"],
    "SC2a": ["https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/07/thumb_setA-thumb-650x488-14937.png"],
    "SC2b": ["https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/07/thumb_setB-thumb-650x488-14935.png"],
    "SC2D": ["https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/07/thumb_deck-thumb-650x488-14938.png"],
    "SC1a": ["https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/06/dddae742ba1840663de5b1b3457019cb9b336358-thumb-650x488-14550.png"],
    "SC1b": ["https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/06/c5f87626cb140e6e2dec49dd0f19f7d578d6512b-thumb-650x488-14544.png"],
    "SC1D": ["https://asia.pokemon-card.com/tw/archive/common/assets_c/2020/06/333e4237e6b9a9615ef8ac59a521cbbc24914d8c-thumb-650x488-14556.png"],
}


def verified_official_name(item) -> str:
    return builder.OFFICIAL_NAME_OVERRIDES.get(item.code, item.supplied_name)


def fast_get(url: str, timeout: int = 45):
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = builder.SESSION.get(url, timeout=min(timeout, 18))
            response.raise_for_status()
            if "asia.pokemon-card.com/tw/" in url:
                response.encoding = "utf-8"
            return response
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            if attempt == 0:
                time.sleep(0.8)
    raise RuntimeError(f"GET failed for {url}: {last_error}")


builder.official_name = verified_official_name
builder.get = fast_get


def is_s8a_official_asset(item, text: str) -> bool:
    return item.code == "S8a" and "card25th.portal-pokemon.com/assets/img/card/s8a/tw/" in text.casefold()


def is_card_image(text: str, image) -> bool:
    lower = text.casefold()
    portrait = image.height > image.width * 1.15
    filename = Path(lower.split("?", 1)[0]).name
    numbered_card = bool(re.search(r"(?:rr|sr|sar|ar|ur|hr|r|u|c)[_-]?\d{2,4}", filename))
    numbered_tail = bool(re.search(r"[_-]\d{3,4}(?:[_-]|\.)", filename))
    card_word = any(token in lower for token in ("/card/", "card_", "card-", "cards/", "pokemon_"))
    return portrait and (numbered_card or numbered_tail or card_word)


def prescore(item, url: str, context: str) -> float:
    text = f"{url} {context}".casefold()
    if any(bad in text for bad in builder.COMMON_BAD) and not is_s8a_official_asset(item, text):
        return -10000.0
    compact = re.sub(r"[^a-z0-9]", "", text)
    code = item.code.casefold()
    compact_code = re.sub(r"[^a-z0-9]", "", code)
    score = 0.0
    if code in text:
        score += 1200.0
    if len(compact_code) >= 3 and compact_code in compact:
        score += 800.0
    for term in builder.VARIANT_TERMS.get(item.code, []):
        norm = builder.normalise(term)
        if norm and (norm in builder.normalise(text) or (len(norm) >= 3 and norm in compact)):
            score += 330.0
    for keyword, value in builder.KEYWORD_SCORES.items():
        if keyword in text:
            score += float(value)
    if "product-index" in context:
        score += 650.0
    if "meta:og:image" in context:
        score += 420.0
    if "wp-content/uploads" in text:
        score += 60.0
    if any(token in text for token in ("product_thumbnail", "product-thumbnail", "package", "pkg", "setimg", "set_img", "box", "hero", "mainvisual", "main_visual", "banner", "img_mv")):
        score += 480.0
    if is_s8a_official_asset(item, text):
        score += 900.0
    if "marker" in text:
        score -= 1100.0
    if re.search(r"(?:rr|sr|sar|ar|ur|hr)[_-]?\d{2,4}", text):
        score -= 1000.0
    if any(token in text for token in ("card_", "card-", "/cards/", "point_", "point-", "character", "pokemon_")):
        score -= 500.0
    return score


def adjusted_score(item, display_name: str, url: str, context: str, image) -> float:
    score = builder.candidate_score(item, display_name, url, context, image)
    text = f"{url} {context}".casefold()
    if image.width < 300 or image.height < 130:
        score -= 1200.0
    if "marker" in text:
        score -= 1200.0
    if is_card_image(text, image) and not is_s8a_official_asset(item, text):
        score -= 1150.0
    if "product-index" in context:
        score += 600.0
    if "meta:og:image" in context:
        score += 300.0
    if any(token in text for token in ("product_thumbnail", "product-thumbnail", "package", "pkg", "setimg", "set_img", "box", "hero", "mainvisual", "main_visual", "banner", "img_mv")):
        score += 450.0
    if any(token in text for token in ("logo", "title", "ttl", "headline")):
        score += 350.0
    if is_s8a_official_asset(item, text):
        score += 1000.0
    return score


def fast_open_remote_image(url: str) -> Image.Image:
    key = hashlib.sha256(url.encode("utf-8")).hexdigest()[:24]
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix not in {".png", ".jpg", ".jpeg", ".webp"}:
        suffix = ".img"
    cache = builder.CACHE_DIR / f"{key}{suffix}"
    if not cache.exists():
        response = fast_get(url, 14)
        if len(response.content) < 400:
            raise ValueError("image response too small")
        cache.write_bytes(response.content)
    image = Image.open(cache)
    image.load()
    return image.convert("RGBA")


def ultra_choose_asset(item, display_name: str, page_url: str, product_images):
    if item.code in EXPLICIT_OFFICIAL_IMAGES:
        errors: list[str] = []
        for url in EXPLICIT_OFFICIAL_IMAGES[item.code]:
            try:
                image = fast_open_remote_image(url)
                print(f"PINNED {item.code}: {image.size} {url}")
                return builder.trim_image(image), url, "explicit-official-taiwan-product-artwork", [
                    {
                        "code": item.code,
                        "url": url,
                        "context": "explicit-official-taiwan-product-artwork",
                        "width": str(image.width),
                        "height": str(image.height),
                        "score": "PINNED",
                    }
                ]
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{url}: {exc}")
        raise RuntimeError(f"Pinned official Taiwan artwork failed for {item.code}: {' | '.join(errors)}")

    supplied_images = list(product_images)
    if item.code == "S8a":
        supplied_images = S8A_OFFICIAL_IMAGES + supplied_images
    raw = builder.collect_image_candidates(page_url, supplied_images)
    ranked = sorted(
        ((prescore(item, url, context), url, context) for url, context in raw),
        key=lambda row: row[0],
        reverse=True,
    )
    candidates = [(url, context) for score, url, context in ranked if score > -500][:7]
    if not candidates:
        candidates = [(url, context) for _, url, context in ranked[:7]]

    scored = []
    audit = []
    for url, context in candidates:
        try:
            image = fast_open_remote_image(url)
            score = adjusted_score(item, display_name, url, context, image)
            audit.append({
                "code": item.code,
                "url": url,
                "context": context,
                "width": str(image.width),
                "height": str(image.height),
                "score": f"{score:.1f}",
            })
            if score > -1000:
                scored.append((score, url, context, image))
        except Exception as exc:  # noqa: BLE001
            audit.append({
                "code": item.code,
                "url": url,
                "context": context,
                "width": "",
                "height": "",
                "score": f"ERROR {exc}",
            })
    if not scored:
        raise RuntimeError(f"No usable official Taiwan image found for {item.code} at {page_url}")
    score, url, context, image = max(scored, key=lambda row: row[0])
    print(f"SELECT {item.code}: score={score:.1f} {image.size} {url}")
    return builder.trim_image(image), url, context, audit


builder.open_remote_image = fast_open_remote_image
builder.choose_asset = ultra_choose_asset
builder.main()
