from __future__ import annotations

import importlib.util
import re
import sys
from pathlib import Path


SOURCE = Path(__file__).with_name("build_traditional_chinese_logo_sheets.py")
spec = importlib.util.spec_from_file_location("tw_logo_builder", SOURCE)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Unable to load {SOURCE}")
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)


def url_prescore(item, display_name: str, url: str, context: str) -> float:
    text = f"{url} {context}".casefold()
    if any(bad in text for bad in builder.COMMON_BAD):
        return -10000.0
    score = 0.0
    compact = re.sub(r"[^a-z0-9]", "", text)
    code = item.code.casefold()
    compact_code = re.sub(r"[^a-z0-9]", "", code)
    if code in text:
        score += 800.0
    if len(compact_code) >= 3 and compact_code in compact:
        score += 500.0
    for term in builder.VARIANT_TERMS.get(item.code, []):
        normal = builder.normalise(term)
        if normal and (normal in builder.normalise(text) or (len(normal) >= 3 and normal in compact)):
            score += 220.0
    for keyword, value in builder.KEYWORD_SCORES.items():
        if keyword in text:
            score += float(value)
    if "product-index" in context:
        score += 260.0
    if "wp-content/uploads" in text:
        score += 40.0
    if any(token in text for token in ("card_", "card-", "/cards/", "point_", "point-", "character", "pokemon_")):
        score -= 170.0
    return score


def fast_choose_asset(item, display_name: str, page_url: str, product_images):
    raw = builder.collect_image_candidates(page_url, product_images)
    ranked = sorted(
        ((url_prescore(item, display_name, url, context), url, context) for url, context in raw),
        key=lambda row: row[0],
        reverse=True,
    )
    # Inspect a bounded set. Always retain index thumbnails plus the highest-scoring page assets.
    chosen = [(url, context) for score, url, context in ranked if score > -500][:28]
    if not chosen:
        chosen = [(url, context) for _, url, context in ranked[:12]]

    scored = []
    audit_rows = []
    for url, context in chosen:
        try:
            image = builder.open_remote_image(url)
            score = builder.candidate_score(item, display_name, url, context, image)
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
            audit_rows.append(
                {
                    "code": item.code,
                    "url": url,
                    "context": context,
                    "width": "",
                    "height": "",
                    "score": f"ERROR {exc}",
                }
            )
    if not scored:
        raise RuntimeError(f"No usable official Taiwan image found for {item.code} at {page_url}")
    score, url, context, image = max(scored, key=lambda row: row[0])
    print(f"SELECT {item.code}: score={score:.1f} {image.size} {url}")
    return builder.trim_image(image), url, context, audit_rows


builder.choose_asset = fast_choose_asset
builder.main()
