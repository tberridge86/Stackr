from __future__ import annotations

import importlib.util
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path


BASE_SCRIPT = Path(__file__).with_name("build_requested_set_logos.py")
spec = importlib.util.spec_from_file_location("set_logo_builder", BASE_SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f"Could not load {BASE_SCRIPT}")
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)


class ImageCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.images: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() != "img":
            return
        values = {key.lower(): (value or "") for key, value in attrs}
        if values.get("src"):
            self.images.append(values)


def resolve_paldean_wonders() -> tuple[object, str, str, str]:
    page_url = "https://www.serebii.net/tcgpocket/paldeanwonders/"
    request = urllib.request.Request(
        page_url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; Stackr-set-logo-pack/1.0)",
            "Accept": "text/html,application/xhtml+xml",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        html = response.read().decode("utf-8", errors="replace")

    parser = ImageCollector()
    parser.feed(html)
    ranked: list[tuple[int, str]] = []
    for image in parser.images:
        src = urllib.parse.urljoin(page_url, image.get("src", ""))
        alt = image.get("alt", "").lower()
        title = image.get("title", "").lower()
        text = f"{src} {alt} {title}".lower()
        score = 0
        if alt.strip() == "logo":
            score += 200
        if "paldean" in text or "b2a" in text:
            score += 160
        if "tcgpocket" in src.lower():
            score += 60
        if "logo" in text:
            score += 40
        if src.lower().endswith((".png", ".webp", ".jpg", ".jpeg")):
            score += 10
        if score:
            ranked.append((score, src))

    errors: list[str] = []
    for score, src in sorted(ranked, reverse=True):
        try:
            data = builder.request_bytes(src, attempts=2)
            image = builder.trim_logo(builder.open_logo(data, src))
            ratio = image.width / max(1, image.height)
            if image.width < 180 or ratio < 1.35:
                raise ValueError(f"Not logo-shaped after trim: {image.size}")
            print(f"PALDEAN PAGE ASSET score={score} source={src} size={image.size}")
            return image, src, "B2a", "Resolved from the published Paldean Wonders set page."
        except Exception as exc:  # noqa: BLE001
            errors.append(f"{src}: {exc}")

    raise RuntimeError("No usable Paldean Wonders logo found on published set page: " + " | ".join(errors))


_original_resolve_logo = builder.resolve_logo


def resolve_logo(item: object):
    if getattr(item, "code", None) == "B2a":
        return resolve_paldean_wonders()
    return _original_resolve_logo(item)


builder.resolve_logo = resolve_logo
builder.main()
