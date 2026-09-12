from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path


SOURCE = Path(__file__).with_name("build_traditional_chinese_logo_sheets.py")
spec = importlib.util.spec_from_file_location("tw_logo_builder_ultra", SOURCE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load {SOURCE}")
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)


def prescore(item, url: str, context: str) -> float:
    text = f"{url} {context}".casefold()
    if any(bad in text for bad in builder.COMMON_BAD):
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
        score += 420.0
    if "meta:og:image" in context:
        score += 360.0
    if "wp-content/uploads" in text:
        score += 60.0
    if any(token in text for token in ("card_", "card-", "/cards/", "point_", "point-", "character", "pokemon_")):
        score -= 300.0
    return score


def ultra_choose_asset(item, display_name: str, page_url: str, product_images):
    raw = builder.collect_image_candidates(page_url, product_images)
    ranked = sorted(
        ((prescore(item, url, context), url, context) for url, context in raw),
        key=lambda row: row[0],
        reverse=True,
    )
    candidates = [(url, context) for score, url, context in ranked if score > -500][:6]
    if not candidates:
        candidates = [(url, context) for _, url, context in ranked[:6]]

    scored = []
    audit = []
    for url, context in candidates:
        try:
            image = builder.open_remote_image(url)
            score = builder.candidate_score(item, display_name, url, context, image)
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


builder.choose_asset = ultra_choose_asset
builder.main()
