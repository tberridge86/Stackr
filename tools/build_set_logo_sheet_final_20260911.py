#!/usr/bin/env python3
"""Targeted completion layer for the 2026-09-11 Pokemon logo sheet."""

from __future__ import annotations

import build_set_logo_sheet_20260911 as base


DIRECT_LOGOS: dict[str, tuple[str, str]] = {
    "B2a": (
        "https://s3.amazonaws.com/media.pokemon-zone.com/news/original_images/Paldean-wonders-logo.png",
        "Paldean Wonders pack logo published with the B2a release page",
    ),
    "2024sv": (
        "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-dragon-discovery-2024.png",
        "McDonald's Collection 2024 Dragon Discovery logo",
    ),
    "mfb": (
        "https://archives.bulbagarden.net/wiki/Special:Redirect/file/My_First_Battle_logo.png",
        "My First Battle product logo",
    ),
    "2023sv": (
        "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-2023.png",
        "McDonald's Collection 2023 logo",
    ),
    "ex5.5": (
        "https://archives.bulbagarden.net/wiki/Special:Redirect/file/PCCP_set_logo.png",
        "Poké Card Creator Pack set logo",
    ),
}

_original_catalogue_candidates = base.catalogue_candidates
_original_parent_candidates = base.parent_candidates


def catalogue_candidates(code: str, name: str, data: base.SourceData):
    direct = DIRECT_LOGOS.get(code)
    if direct:
        yield "direct", direct[0], direct[1]
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
