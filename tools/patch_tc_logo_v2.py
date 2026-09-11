from pathlib import Path

p = Path('tools/build_tc_set_logo_sheet_20260911.py')
s = p.read_text(encoding='utf-8')

s = s.replace(
    'Priority:\n1. Traditional Chinese TCGdex wordmark for the exact set code.\n2. Exact official product-page logo/artwork.\n3. A deliberate duplicate/original-set fallback explicitly declared below.\n4. The official Pokémon Asia set mark for the exact code.\n5. Unresolved placeholder (never fabricate a logo).',
    'Priority:\n1. Traditional Chinese TCGdex wordmark for the exact set code.\n2. Japanese original-set TCGdex wordmark for the exact set code.\n3. Exact official product-page logo/artwork.\n4. A deliberate duplicate/original-set fallback explicitly declared below.\n5. The official Pokémon Asia set mark for the exact code.\n6. Unresolved placeholder (never fabricate a logo).',
)

s = s.replace(
    '        self.tcgdex_by_id: dict[str, dict[str, Any]] = {}\n'
    '        self.tcgdex_by_name: dict[str, list[dict[str, Any]]] = {}',
    '        self.tcgdex_by_id: dict[str, dict[str, Any]] = {}\n'
    '        self.tcgdex_by_name: dict[str, list[dict[str, Any]]] = {}\n'
    '        self.tcgdex_ja_by_id: dict[str, dict[str, Any]] = {}\n'
    '        self.tcgdex_ja_by_name: dict[str, list[dict[str, Any]]] = {}',
)

start = s.index('def load_tcgdex(')
end = s.index('\n\ndef load_official_product_index', start)
s = s[:start] + '''def load_tcgdex_language(
    session: requests.Session,
    language: str,
    by_id: dict[str, dict[str, Any]],
    by_name: dict[str, list[dict[str, Any]]],
) -> None:
    url = f"https://api.tcgdex.net/v2/{language}/sets"
    rows = safe_json(session, url)
    if not isinstance(rows, list):
        raise RuntimeError(f"Unexpected TCGdex response at {url}")
    logo_count = 0
    for row in rows:
        if not isinstance(row, dict):
            continue
        set_id = str(row.get("id") or "").strip()
        if set_id:
            by_id[set_id.lower()] = row
        name_key = normalise(str(row.get("name") or ""))
        if name_key:
            by_name.setdefault(name_key, []).append(row)
        if row.get("logo"):
            logo_count += 1
    print(f"Loaded {len(by_id)} TCGdex {language} sets ({logo_count} with logos)")


def load_tcgdex(session: requests.Session, sources: Sources) -> None:
    load_tcgdex_language(session, TCGDEX_LANG, sources.tcgdex_by_id, sources.tcgdex_by_name)
    load_tcgdex_language(session, "ja", sources.tcgdex_ja_by_id, sources.tcgdex_ja_by_name)''' + s[end:]

s = s.replace(
    'def get_full_tcgdex_row(session: requests.Session, set_id: str) -> dict[str, Any] | None:\n'
    '    url = f"https://api.tcgdex.net/v2/{TCGDEX_LANG}/sets/{quote(set_id, safe=\'-\')}"',
    'def get_full_tcgdex_row(session: requests.Session, language: str, set_id: str) -> dict[str, Any] | None:\n'
    '    url = f"https://api.tcgdex.net/v2/{language}/sets/{quote(set_id, safe=\'-\')}"',
)

start = s.index('def tcgdex_candidates(')
end = s.index('\n\ndef manual_candidates', start)
s = s[:start] + '''def tcgdex_candidates(session: requests.Session, sources: Sources, entry: Entry) -> list[tuple[str, str, str]]:
    output: list[tuple[str, str, str]] = []

    def collect(
        language: str,
        by_id: dict[str, dict[str, Any]],
        by_name: dict[str, list[dict[str, Any]]],
        label: str,
    ) -> None:
        rows: list[dict[str, Any]] = []
        seen_ids: set[str] = set()
        for set_id in (entry.code, *ID_ALIASES.get(entry.code, ())):
            row = by_id.get(set_id.lower())
            if row and str(row.get("id") or "").lower() not in seen_ids:
                rows.append(row)
                seen_ids.add(str(row.get("id") or "").lower())
        for name in (entry.display_name, entry.requested_name):
            for row in by_name.get(normalise(name), []):
                row_id = str(row.get("id") or "").lower()
                if row_id and row_id not in seen_ids:
                    rows.append(row)
                    seen_ids.add(row_id)

        for row in rows:
            row_id = str(row.get("id") or entry.code)
            logo = str(row.get("logo") or "").strip()
            if logo:
                output.append((label, logo, f"TCGdex {language} {row_id}: {row.get('name', '')}"))
            full = get_full_tcgdex_row(session, language, row_id)
            if full:
                logo = str(full.get("logo") or "").strip()
                if logo:
                    output.append((label, logo, f"TCGdex full {language} set {row_id}: {full.get('name', '')}"))
                serie = full.get("serie")
                serie_id = str(serie.get("id") if isinstance(serie, dict) else serie or "").strip()
                if serie_id:
                    output.append((label, f"https://assets.tcgdex.net/{language}/{serie_id}/{row_id}/logo", f"Constructed TCGdex {language} asset path for {row_id}"))

    collect(TCGDEX_LANG, sources.tcgdex_by_id, sources.tcgdex_by_name, "TCGdex Traditional Chinese wordmark")
    collect("ja", sources.tcgdex_ja_by_id, sources.tcgdex_ja_by_name, "TCGdex Japanese original-set wordmark")
    return dedupe_candidates(output)''' + s[end:]

s = s.replace(
    '                result = Result(sequence, code, entry.requested_name, entry.display_name, "verified-wordmark", source, final_url, str(destination.relative_to(output_dir)), "", f"{detail}; {dimensions}. {entry.note}".strip())',
    '                exact_status = "original-japanese-logo" if "Japanese" in source else "verified-wordmark"\n'
    '                result = Result(sequence, code, entry.requested_name, entry.display_name, exact_status, source, final_url, str(destination.relative_to(output_dir)), "", f"{detail}; {dimensions}. {entry.note}".strip())',
)

s = s.replace(
    '        "verified-wordmark": "WORDMARK",\n        "official-product-logo": "OFFICIAL LOGO",',
    '        "verified-wordmark": "TC WORDMARK",\n        "original-japanese-logo": "ORIGINAL JP",\n        "official-product-logo": "OFFICIAL LOGO",',
)
s = s.replace(
    '    status_color = green if result.status in {"verified-wordmark", "official-product-logo"} else purple if result.status == "parent-fallback"',
    '    status_color = green if result.status in {"verified-wordmark", "original-japanese-logo", "official-product-logo"} else purple if result.status == "parent-fallback"',
)

p.write_text(s, encoding='utf-8')
compile(s, str(p), 'exec')
print('Applied v2 Japanese-original logo fallback patch')
