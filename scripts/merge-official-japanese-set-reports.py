#!/usr/bin/env python3
"""Merge several official Japanese search filters into one canonical set manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", action="append", required=True)
    parser.add_argument("--canonical-set-code", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> None:
    args = parse_args()
    input_paths = [Path(value) for value in args.input]
    reports: list[dict[str, Any]] = []
    source_reports: list[dict[str, Any]] = []

    for input_path in input_paths:
        raw = input_path.read_bytes()
        report = json.loads(raw)
        require(report.get("source") == "pokemon_card_jp_official", f"Unexpected source in {input_path}.")
        require(report.get("read_only") is True, f"{input_path} is not read-only evidence.")
        require(report.get("images_downloaded") is False, f"{input_path} downloaded images unexpectedly.")
        require(not report.get("parser_errors"), f"{input_path} contains parser errors.")
        require(not report.get("identity_conflicts"), f"{input_path} contains identity conflicts.")
        require(not report.get("unresolved_unnumbered_variants"), f"{input_path} contains unresolved unnumbered entries.")
        require(int(report.get("api_card_ids_collected") or 0) > 0, f"{input_path} contains no official IDs.")
        require(
            int(report.get("api_card_ids_collected") or 0) == int(report.get("unique_printings") or 0),
            f"{input_path} is not one official ID per printing.",
        )
        reports.append(report)
        source_reports.append(
            {
                "input": str(input_path),
                "sha256": hashlib.sha256(raw).hexdigest(),
                "set_code_requested": report.get("set_code_requested"),
                "official_set_codes": report.get("official_set_codes"),
                "official_card_ids": report.get("api_card_ids_collected"),
                "unique_printings": report.get("unique_printings"),
                "denominators": report.get("denominators"),
                "generated_at": report.get("generated_at"),
            }
        )

    all_printings: list[dict[str, Any]] = []
    official_ids: set[str] = set()
    collector_numbers: set[str] = set()
    official_set_codes: set[str] = set()
    denominators: set[str] = set()

    for report in reports:
        official_set_codes.update(str(value) for value in report.get("official_set_codes") or [])
        denominators.update(str(value) for value in report.get("denominators") or [])
        for printing in report.get("printings") or []:
            collector_number = str(printing.get("collector_number") or "").strip()
            ids = [str(value) for value in printing.get("official_card_ids") or []]
            require(collector_number, "A source printing has no collector number.")
            require(len(ids) == 1, f"Printing {collector_number} does not have exactly one official ID.")
            require(collector_number not in collector_numbers, f"Collector number {collector_number} appears in multiple source filters.")
            require(ids[0] not in official_ids, f"Official ID {ids[0]} appears in multiple source filters.")
            collector_numbers.add(collector_number)
            official_ids.add(ids[0])
            all_printings.append(printing)

    require(len(denominators) == 1, f"Merged filters disagree on printed denominator: {sorted(denominators)}")
    all_printings.sort(
        key=lambda printing: (
            int(str(printing["collector_number"]))
            if str(printing["collector_number"]).isdigit()
            else 10**9,
            str(printing["collector_number"]),
        )
    )

    merged = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "source": "pokemon_card_jp_official",
        "collector_version": 2,
        "merged_source_reports": source_reports,
        "set_code_requested": args.canonical_set_code,
        "official_set_codes": sorted(official_set_codes),
        "api_hit_count": sum(int(report.get("api_hit_count") or 0) for report in reports),
        "api_max_page": sum(int(report.get("api_max_page") or 0) for report in reports),
        "api_card_ids_collected": len(official_ids),
        "detail_rows_collected": len(official_ids),
        "unique_printings": len(all_printings),
        "denominators": sorted(denominators),
        "duplicate_official_variants": 0,
        "numbered_detail_rows": len(all_printings),
        "unnumbered_detail_rows": 0,
        "additional_official_variants": [],
        "unresolved_unnumbered_variants": [],
        "parser_errors": [],
        "identity_conflicts": [],
        "read_only": True,
        "images_downloaded": False,
        "rarity_populated": False,
        "finish_populated": False,
        "printings": all_printings,
    }

    require(merged["api_card_ids_collected"] == merged["unique_printings"], "Merged identity count is inconsistent.")
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "canonical_set_code": args.canonical_set_code,
                "official_set_codes": merged["official_set_codes"],
                "official_card_ids": merged["api_card_ids_collected"],
                "unique_printings": merged["unique_printings"],
                "denominators": merged["denominators"],
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
