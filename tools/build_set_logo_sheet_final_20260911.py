#!/usr/bin/env python3
"""English-only sourcing layer for the Pokémon set-logo review sheet."""

from __future__ import annotations

import json
from pathlib import Path

import build_set_logo_sheet_20260911 as base


AXELERATE_ROOT = (
    "https://raw.githubusercontent.com/Axelerate18/"
    "pokemon-masterlist-generator/337a5da55d43ea1e927dfc51c867b1683cf1670b"
)
AXELERATE_ICONS = f"{AXELERATE_ROOT}/public/icons"
FRANKKIENL_ROOT = (
    "https://raw.githubusercontent.com/frankkienl/PokeTCG_helper/"
    "10d22ae2fe6aa750f77e9e216d4910c2f3e782cf"
)

# Explicitly English artwork. The first version of this pack accepted a
# curated source that contained French/European logos. Those candidates are
# blocked below and replaced here with English catalogue assets.
ENGLISH_URLS = {
    "B2a": "https://s3.amazonaws.com/media.pokemon-zone.com/news/original_images/Paldean-wonders-logo.png",
    "B1a": "https://s3.amazonaws.com/media.pokemon-zone.com/news/original_images/Pokemon_TCG_Pocket_Crimson_Blaze_Logo_EN.png",
    "A3b": (
        f"{FRANKKIENL_ROOT}/composeApp/src/commonMain/composeResources/files/"
        "expansions/A3b/expansion_symbols/A3b_Set_Logo_EN.png"
    ),
    "A3a": (
        f"{FRANKKIENL_ROOT}/expansions/A3a/expansion_symbols/"
        "A3a_Set_Logo_EN.png"
    ),
    "2024sv": "https://pokesymbols.com/images/tcg/sets/logos/mcdonalds-collection-dragon-discovery-2024.png",
    "mfb": f"{AXELERATE_ICONS}/My_First_Battle_Logo.png",
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
    "exu": "https://images.pokemontcg.io/ex10/logo.png",
}

# Some promotional and Trainer Kit groupings have no separate English
# expansion wordmark. Use the official language-neutral stamp/half-deck mark
# instead of a French product title.
NEUTRAL_URLS = {
    "mep": f"{AXELERATE_ROOT}/public/set-symbols/mep.png",
    "wp": "https://raw.githubusercontent.com/liesdjillali/pokecole-questions/main/images/manual_set_logos/wp.png",
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

EXPECTED_UNRESOLVED = {"xya", "sp", "miscp"}
_original_catalogue_candidates = base.catalogue_candidates
_original_parent_candidates = base.parent_candidates


def catalogue_candidates(code: str, name: str, data: base.SourceData):
    if code in ENGLISH_URLS:
        yield "english", ENGLISH_URLS[code], f"Verified English {name} logo"
    if code in NEUTRAL_URLS:
        yield "neutral", NEUTRAL_URLS[code], f"Official language-neutral {name} symbol"
    if code in TRAINER_SYMBOLS:
        yield (
            "neutral",
            f"{AXELERATE_ICONS}/{TRAINER_SYMBOLS[code]}",
            "Official language-neutral Trainer Kit half-deck mark; European wordmark removed",
        )

    # Keep normal English catalogue candidates, but reject the mixed-language
    # curated directory that caused the original error.
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
    manifest_path = output / "pokemon-set-logo-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    offenders: list[str] = []
    for row in manifest:
        if row.get("status") == "unresolved":
            continue
        code = str(row.get("code", "?"))
        text = " ".join(str(row.get(k, "")) for k in ("source", "source_url", "note")).lower()
        # WP is an explicit exception: the file is the language-neutral gold-W
        # stamp, despite residing in the old curated directory.
        if code != "wp" and (
            "manual_set_logos" in text
            or "curated manual" in text
            or "-fr" in text
            or "french" in text
        ):
            offenders.append(code)
    if offenders:
        raise RuntimeError("English-only audit found mixed-language assets: " + ", ".join(offenders))

    unresolved = {str(row["code"]) for row in manifest if row.get("status") == "unresolved"}
    if unresolved != EXPECTED_UNRESOLVED:
        raise RuntimeError(
            "Unexpected unresolved identities. Expected "
            f"{sorted(EXPECTED_UNRESOLVED)}, found {sorted(unresolved)}"
        )

    neutral = [
        str(row["code"])
        for row in manifest
        if row.get("source") == "Official language-neutral symbol"
    ]
    lines = [
        "English-only Pokémon set-logo audit",
        "===================================",
        "French and other European-language wordmark fallbacks: BLOCKED",
        f"Requested entries: {len(manifest)}",
        f"Language-neutral official marks used: {len(neutral)} ({', '.join(neutral)})",
        "Intentionally unresolved: xya, sp, miscp",
        "- xya is an alternate-printing catalogue grouping with no verified standalone English set logo.",
        "- sp is a Sample-stamp grouping, not a conventional expansion logo.",
        "- miscp is a miscellaneous promotional grouping, not one consistent expansion identity.",
        "Identity handling: PBL remains an alias of canonical me05 (Pitch Black).",
    ]
    (output / "ENGLISH_ONLY_AUDIT.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Rebuild after writing the audit so the import ZIP contains it.
    base.build_zip(output, output / "pokemon-set-logo-import-bundle.zip")
    return result


base.SOURCE_LABELS["english"] = "Verified English logo"
base.SOURCE_LABELS["neutral"] = "Official language-neutral symbol"
base.catalogue_candidates = catalogue_candidates
base.parent_candidates = parent_candidates


if __name__ == "__main__":
    raise SystemExit(run())
