from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

import requests

BASE_SCRIPT = Path(__file__).with_name('build_tc_logos_a4.py')
spec = importlib.util.spec_from_file_location('tc_logo_builder', BASE_SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Could not load {BASE_SCRIPT}')
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)


def fast_get(url: str, *, timeout: int = 35) -> requests.Response | None:
    """Retry transient failures, but never retry a definite client-side miss."""
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = builder.SESSION.get(url, timeout=timeout, allow_redirects=True)
            if response.status_code == 200:
                return response
            if 400 <= response.status_code < 500:
                return None
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print('GET error', url, exc, flush=True)
        if attempt == 0:
            time.sleep(0.75)
    if last_error:
        print('GET abandoned', url, last_error, flush=True)
    return None


def pre_score(url: str, alt: str, code: str) -> int:
    filename = Path(url.split('?')[0]).name.lower()
    normalized = filename.replace('_', '-').replace(' ', '-')
    text = f'{normalized} {alt}'.lower()

    bad = (
        'header-logo', 'site-logo', 'favicon', 'header-menu', 'footer', 'icon-sns',
        'arrow', 'button', 'btn-', 'deck-shield', 'playmat', 'shinka', '_card',
        '-card-', 'card-img', 'card-head', 'newcard-head', 'csr-head',
        'reprinting-head', 'section-head', 'new-head', 'gallery',
    )
    if any(token in text for token in bad):
        return -10_000

    if any(token in normalized for token in ('main-logo', 'set-logo', 'title-logo', 'product-logo')):
        return 1_200
    if 'logo' in normalized:
        return 1_050
    if any(token in normalized for token in ('hero-visual', 'hero-head', 'main-visual', 'main-kv', 'kv-main')):
        return 900
    if any(token in normalized for token in ('top-banner', 'top-banner', 'banner-img')):
        return 820
    if any(token in normalized for token in ('product-image-1', '-pkg', 'package', 'pack', 'thumb-set', '650x488')):
        return 650
    if code.lower() in text and any(token in normalized for token in ('main', 'title', 'visual', 'banner', 'product')):
        return 450
    return -10_000


def fast_resolve_official(code: str, name: str):
    known = builder.KNOWN_ASSETS.get(code)
    if known:
        image = builder.read_image(known)
        if image:
            return image, known, 'official_chinese_package'

    best = None
    for page_url in builder.special_pages(code) + builder.old_pages(code):
        response = fast_get(page_url)
        if not response or len(response.content) < 1_200:
            continue

        ranked = []
        for url, alt in builder.image_urls(response.url, response.text):
            score = pre_score(url, alt, code)
            if score > 0:
                ranked.append((score, url, alt))
        ranked.sort(reverse=True)

        # A product page can contain hundreds of card images. Only inspect the strongest
        # logo/title/package candidates, never the full card gallery.
        for _, url, alt in ranked[:6]:
            image = builder.read_image(url)
            if not image:
                continue
            score, kind = builder.candidate_score(url, alt, code, name, image)
            if best is None or score > best[0]:
                best = (score, image, url, kind)
            if score >= 900:
                return image, url, kind

    if best and best[0] >= 250:
        _, image, url, kind = best
        return image, url, kind
    return None


builder.get = fast_get
builder.resolve_official = fast_resolve_official
builder.main()
