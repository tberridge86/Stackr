#!/usr/bin/env python3
"""Targeted completion layer for the 2026-09-11 Pokemon logo sheet."""

from __future__ import annotations

import html as html_lib
import re
from html.parser import HTMLParser
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import requests

import build_set_logo_sheet_20260911 as base


DIRECT_LOGOS: dict[str, list[tuple[str, str]]] = {
    "B2a": [
        (
            "https://s3.amazonaws.com/media.pokemon-zone.com/news/original_images/Paldean-wonders-logo.png",
            "Paldean Wonders pack logo published with the B2a release page",
        )
    ],
    "2024sv": [
        (
            "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-dragon-discovery-2024.png",
            "McDonald's Collection 2024 Dragon Discovery logo",
        )
    ],
    "mfb": [
        (
            "https://raw.githubusercontent.com/Axelerate18/pokemon-masterlist-generator/337a5da55d43ea1e927dfc51c867b1683cf1670b/public/icons/My_First_Battle_Logo.png",
            "My First Battle product logo mirrored in an open-source Pokémon master-list project",
        ),
        (
            "https://archives.bulbagarden.net/media/upload/1/1d/My_First_Battle_logo.png",
            "My First Battle product logo",
        ),
    ],
    "ex5.5": [
        (
            "https://archives.bulbagarden.net/media/upload/d/d7/PCCP_set_logo.png",
            "Poké Card Creator Pack set logo",
        )
    ],
}

_original_catalogue_candidates = base.catalogue_candidates
_original_parent_candidates = base.parent_candidates


class _ImageTagParser(HTMLParser):
    def __init__(self, page_url: str, required_alt_terms: tuple[str, ...]) -> None:
        super().__init__(convert_charrefs=True)
        self.page_url = page_url
        self.required_alt_terms = tuple(term.lower() for term in required_alt_terms)
        self.urls: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() not in {"img", "source"}:
            return
        values = {key.lower(): (value or "") for key, value in attrs}
        descriptor = " ".join(
            [values.get("alt", ""), values.get("aria-label", ""), values.get("title", "")]
        ).lower()
        if self.required_alt_terms and not all(term in descriptor for term in self.required_alt_terms):
            return
        for key in ("src", "data-src", "data-lazy-src", "srcset", "data-srcset"):
            raw = html_lib.unescape(values.get(key, "")).replace("\\/", "/").strip()
            if not raw:
                continue
            candidates = [part.strip().split()[0] for part in raw.split(",") if part.strip()]
            for candidate in candidates:
                self._add(candidate)

    def _add(self, candidate: str) -> None:
        absolute = urljoin(self.page_url, candidate)
        parsed = urlparse(absolute)
        query = parse_qs(parsed.query)
        wrapped = query.get("url", [])
        for value in wrapped:
            direct = urljoin(self.page_url, unquote(value))
            if direct not in self.urls:
                self.urls.append(direct)
        if absolute not in self.urls:
            self.urls.append(absolute)


def _logo_candidates_from_page(
    page: str,
    required_alt_terms: tuple[str, ...],
    note: str,
):
    try:
        response = requests.get(
            page,
            timeout=40,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            },
        )
        response.raise_for_status()
        parser = _ImageTagParser(page, required_alt_terms)
        parser.feed(response.text)
        for url in parser.urls:
            yield url, note
    except Exception as exc:
        print(f"WARNING: unable to inspect {page}: {exc}")


def _mcdonalds_2023_candidates():
    """Read the logo path from Pokemon Symbols, then retain bounded guesses."""
    page = "https://pokesymbols.com/tcg/sets/mc-donalds-collection-2023"
    seen: set[str] = set()
    try:
        response = requests.get(
            page,
            timeout=30,
            headers={"User-Agent": "Stackr-set-logo-sheet/1.0"},
        )
        response.raise_for_status()
        html = response.text.replace("\\/", "/")
        for value in re.findall(r"(?:https?:)?//[^\"'<> ]+/images/tcg/sets/logos/[^\"'<> ]+|/images/tcg/sets/logos/[^\"'<> ]+", html):
            url = urljoin(page, value)
            if url not in seen:
                seen.add(url)
                yield url, "McDonald's Collection 2023 logo read from the set page"
    except Exception:
        pass

    guesses = [
        "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-match-battle-2023.png",
        "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-match-battle-2023.png",
        "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-2023-logo.png",
        "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-2023.png",
    ]
    for url in guesses:
        if url not in seen:
            seen.add(url)
            yield url, "McDonald's Collection 2023 logo"


def _creator_pack_candidates():
    seen: set[str] = set()
    pages = [
        (
            "https://www.tcgreliq.com/sets/poke-card-creator-pack/overview",
            ("creator", "logo"),
            "Poké Card Creator Pack set logo read from TCG Reliq",
        ),
        (
            "https://tcgscreener.com/pokemon/poke-card-creator-pack",
            ("creator", "logo"),
            "Poké Card Creator Pack set logo read from TCGscreener",
        ),
    ]
    for page, terms, note in pages:
        for url, candidate_note in _logo_candidates_from_page(page, terms, note):
            if url not in seen:
                seen.add(url)
                yield url, candidate_note


def catalogue_candidates(code: str, name: str, data: base.SourceData):
    for url, note in DIRECT_LOGOS.get(code, []):
        yield "direct", url, note
    if code == "2023sv":
        yield from (("direct", url, note) for url, note in _mcdonalds_2023_candidates())
    if code == "ex5.5":
        yield from (("direct", url, note) for url, note in _creator_pack_candidates())
    yield from _original_catalogue_candidates(code, name, data)


def parent_candidates(code: str, data: base.SourceData):
    if code == "mee":
        # MEE is an energy-only catalogue grouping, not a separately branded
        # expansion. Use the current Mega Evolution parent wordmark and label
        # it as a fallback rather than pretending MEE has its own logo.
        yield (
            "parent",
            "https://assets.tcgdex.net/en/me/me01/logo",
            "Parent logo: Mega Evolution series wordmark for energy-only MEE grouping",
        )
    yield from _original_parent_candidates(code, data)


base.SOURCE_LABELS["direct"] = "Targeted set/product logo source"
base.catalogue_candidates = catalogue_candidates
base.parent_candidates = parent_candidates


if __name__ == "__main__":
    raise SystemExit(base.main())
