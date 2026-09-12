#!/usr/bin/env python3
"""English-only sourcing layer for the Pokémon set-logo review sheet."""

from __future__ import annotations

import json
from pathlib import Path

import build_set_logo_sheet_20260911 as base


AXELERATE = (
    "https://raw.githubusercontent.com/Axelerate18/"
    "pokemon-masterlist-generator/337a5da55d43ea1e927dfc51c867b1683cf1670b/"
    "public/icons"
)

# Explicit English wordmarks resolved through the Bulbagarden MediaWiki API.
BULBA_ENGLISH = {
    "B2a": "B2a Set Logo EN.png",
    "B1a": "B1a Set Logo EN.png",
    "A3b": "A3b Set Logo EN.png",
    "A3a": "A3a Set Logo EN.png",
    "exu": "EX10 Logo EN.png",
}

# English catalogue/product artwork. These were selected specifically to
# replace the French manual assets used by the first pass.
ENGLISH_URLS = {
    "2024sv": "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-dragon-discovery-2024.png",
    "mfb": f"{AXELERATE}/My_First_Battle_Logo.png",
    "2023sv": "https://pokesymbols.com/images/tcg/sets/logos/mcdonald_s-match-battle-2023.avif",
    "svp": "https://images.pokemontcg.io/svp/logo.png",
    "2022swsh": "https://images.pokemontcg.io/mcd22/logo.png",
    "2021swsh": "https://images.pokemontcg.io/mcd21/logo.png",
    "2019sm": "https://images.pokemontcg.io/mcd19/logo.png",
    "sma": "https://images.pokemontcg.io/sma/logo.png",
    "2018sm": "https://images.pokemontcg.io/mcd18/logo.png",
    "2017sm": "https://images.pokemontcg.io/mcd17/logo.png",
    "2016xy": "https://images.pokemontcg.io/mcd16/logo.png",
    "2015xy": "https://images.pokemontcg.io/mcd15/logo.png",
    "2014xy": "https://images.pokemontcg.io/mcd14/logo.png",
    "2012bw": "https://images.pokemontcg.io/mcd12/logo.png",
    "2011bw": "https://images.pokemontcg.io/mcd11/logo.png",
    "ex5.5": "https://images.scrydex.com/pokemon/wb1-logo/logo",
}

# These products do not consistently have an English expansion wordmark.
# Use their official language-neutral symbol/stamp rather than a French logo.
NEUTRAL_BULBA = {
    "mep": "SetSymbolMEP Black Star Promos.png",
    "wp": "Gold W.png",
}
NEUTRAL_URLS = {
    "xya": "https://images.pokemontcg.io/xya/symbol.png",
}
TRAINER_SYMBOLS = {
    "tk-sm-l": "Lycanroc_Half_Deck.png",
    "tk-sm-r": "Alolan_Raichu_Half_Deck.png",
    "tk-xy-p": "Pikachu_Libre_Half_Deck.png",
    "tk-xy-su": "Suicune_Half_Deck.png",
    "tk-xy-latia": "Latias_XY_Half_Deck.png",
    "tk-xy-latio": "Latios_XY_Half_Deck.png",
    "tk-xy-b": "Bisharp_Half_Deck.png",
    "tk-xy-w": "Wigglytuff_Half_Deck.png",
    "tk-xy-n": "Noivern_Half_Deck.png",
    "tk-xy-sy": "Sylveon_Half_Deck.png",
    "tk-bw-e": "Excadrill_Half_Deck.png",
    "tk-bw-z": "Zoroark_Half_Deck.png",
    "tk-hs-g": "Gyarados_Half_Deck.png",
    "tk-hs-r": "Raichu_Half_Deck.png",
    "tk-dp-l": "Lucario_Half_Deck.png",
    "tk-dp-m": "Manaphy_Half_Deck.png",
    "tk-ex-m": "Minun_Half_Deck.png",
    "tk-ex-p": "Plusle_Half_Deck.png",
    "tk-ex-latia": "Latias_EX_Half_Deck.png",
    "tk-ex-latio": "Latios_EX_Half_Deck.png",
}

_original_catalogue_candidates = base.catalogue_candidates
_original_parent_candidates = base.parent_candidates
_original_download_logo = base.download_logo


def _bulba_url(session, filename: str) -> tuple[str | None, str]:
    """Resolve a named Bulbagarden file without relying on redirect guessing."""
    try:
        response = session.get(
            "https://archives.bulbagarden.net/w/api.php",
            params={
                "action": "query",
                "format": "json",
                "formatversion": "2",
                "prop": "imageinfo",
                "iiprop": "url",
                "titles": f"File:{filename}",
            },
            timeout=45,
        )
        response.raise_for_status()
        for page in response.json().get("query", {}).get("pages", []):
            info = page.get("imageinfo") or []
            if info and info[0].get("url"):
                return str(info[0]["url"]), ""
        return None, f"Bulbagarden file not found: {filename}"
    except Exception as exc:
        return None, f"Bulbagarden API error: {exc}"


def download_logo(session, url: str, destination: Path) -> tuple[bool, str]:
    if not url.startswith("bulba-file:"):
        return _original_download_logo(session, url, destination)
    resolved, error = _bulba_url(session, url.removeprefix("bulba-file:"))
    if not resolved:
        return False, error
    return _original_download_logo(session, resolved, destination)


def catalogue_candidates(code: str, name: str, data: base.SourceData):
    if code in BULBA_ENGLISH:
        yield "english", f"bulba-file:{BULBA_ENGLISH[code]}", f"Official English {name} logo"
    if code in ENGLISH_URLS:
        yield "english", ENGLISH_URLS[code], f"English {name} logo"
    if code in NEUTRAL_BULBA:
        yield "neutral", f"bulba-file:{NEUTRAL_BULBA[code]}", f"Official language-neutral {name} symbol"
    if code in NEUTRAL_URLS:
        yield "neutral", NEUTRAL_URLS[code], f"Official language-neutral {name} symbol"
    if code in TRAINER_SYMBOLS:
        yield (
            "neutral",
            f"{AXELERATE}/{TRAINER_SYMBOLS[code]}",
            "Official language-neutral Trainer Kit half-deck symbol; French wordmark removed",
        )

    # Keep TCGdex and PokémonTCG English-catalogue candidates, but reject every
    # manual candidate because that mixed French/European artwork into the pack.
    for source, url, note in _original_catalogue_candidates(code, name, data):
        combined = f"{source} {url} {note}".lower()
        if source == "manual" or "manual_set_logos" in combined or "-fr" in combined:
            continue
        yield source, url, note


def parent_candidates(code: str, data: base.SourceData):
    if code == "mee":
        yield (
            "parent",
            "https://assets.tcgdex.net/en/me/me01/logo",
            "English Mega Evolution parent wordmark for the energy-only MEE grouping",
        )
    yield from _original_parent_candidates(code, data)


def run() -> int:
    result = base.main()
    root = Path(__file__).resolve().parents[1]
    output = root / "artifacts" / "pokemon-set-logo-sheet-20260911"
    manifest = json.loads((output / "pokemon-set-logo-manifest.json").read_text(encoding="utf-8"))

    offenders = []
    for row in manifest:
        text = " ".join(str(row.get(k, "")) for k in ("source", "source_url", "note")).lower()
        if "manual_set_logos" in text or "curated manual" in text or "-fr" in text:
            offenders.append(str(row.get("code", "?")))
    if offenders:
        raise RuntimeError("English-only audit failed: " + ", ".join(offenders))

    unresolved = [str(row["code"]) for row in manifest if row.get("status") == "unresolved"]
    neutral = [str(row["code"]) for row in manifest if row.get("source") == "Official language-neutral symbol"]
    lines = [
        "English-only Pokémon set-logo audit",
        "===================================",
        "French and other European-language manual fallbacks: BLOCKED",
        f"Requested entries: {len(manifest)}",
        f"Language-neutral symbols used: {len(neutral)} ({', '.join(neutral)})",
        f"Unresolved: {len(unresolved)} ({', '.join(unresolved) if unresolved else 'none'})",
    ]
    (output / "ENGLISH_ONLY_AUDIT.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return result


base.SOURCE_LABELS["english"] = "Verified English logo"
base.SOURCE_LABELS["neutral"] = "Official language-neutral symbol"
base.catalogue_candidates = catalogue_candidates
base.parent_candidates = parent_candidates
base.download_logo = download_logo


if __name__ == "__main__":
    raise SystemExit(run())
