#!/usr/bin/env python3
"""Produce a printing-only import manifest while retaining full source evidence separately.

The existing canonical importer creates one card_printing per collector number. This
normaliser selects the primary numbered official ID for that printing and retains all
additional official IDs in explicit evidence fields for a subsequent provenance link.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    return parser.parse_args()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise SystemExit(message)


def main() -> None:
    args = parse_args()
    source_path = Path(args.input)
    output_path = Path(args.output)
    source: dict[str, Any] = json.loads(source_path.read_text(encoding="utf-8"))

    require(source.get("source") == "pokemon_card_jp_official", "Unexpected source.")
    require(source.get("read_only") is True, "Collector evidence is not read-only.")
    require(source.get("images_downloaded") is False, "Collector downloaded images unexpectedly.")
    require(not source.get("parser_errors"), "Collector evidence contains parser errors.")
    require(not source.get("identity_conflicts"), "Collector evidence contains identity conflicts.")
    require(
        not source.get("unresolved_unnumbered_variants"),
        "Collector evidence contains unresolved unnumbered variants.",
    )
    printings = source.get("printings") or []
    require(printings, "Collector evidence contains no printings.")

    normalised_printings: list[dict[str, Any]] = []
    all_source_ids: list[str] = []
    additional_source_ids: list[str] = []
    for printing in printings:
        numbered_ids = [str(value) for value in printing.get("numbered_official_card_ids") or []]
        all_ids = [str(value) for value in printing.get("official_card_ids") or []]
        require(numbered_ids, f"Printing {printing.get('collector_number')} has no numbered official ID.")
        require(all_ids, f"Printing {printing.get('collector_number')} has no official IDs.")
        primary_id = numbered_ids[0]
        try:
            primary_index = all_ids.index(primary_id)
        except ValueError as error:
            raise SystemExit(
                f"Primary official ID {primary_id} is absent from printing {printing.get('collector_number')}."
            ) from error

        detail_urls = printing.get("detail_urls") or []
        thumbnail_paths = printing.get("thumbnail_paths") or []
        image_urls = printing.get("official_image_urls") or []
        require(primary_index < len(detail_urls), "Primary detail URL is missing.")

        additional_ids = [value for value in all_ids if value != primary_id]
        all_source_ids.extend(all_ids)
        additional_source_ids.extend(additional_ids)
        normalised_printings.append(
            {
                **printing,
                "all_official_card_ids": all_ids,
                "additional_official_card_ids": additional_ids,
                "all_detail_urls": detail_urls,
                "all_thumbnail_paths": thumbnail_paths,
                "all_official_image_urls": image_urls,
                "official_card_ids": [primary_id],
                "detail_urls": [detail_urls[primary_index]],
                "thumbnail_paths": [
                    thumbnail_paths[primary_index]
                    if primary_index < len(thumbnail_paths)
                    else None
                ],
                "official_image_urls": [
                    image_urls[primary_index] if primary_index < len(image_urls) else None
                ],
                "official_variant_count": 1,
            }
        )

    require(
        len(all_source_ids) == int(source.get("api_card_ids_collected") or 0),
        "Full official ID count does not match the API hit count.",
    )
    require(len(set(all_source_ids)) == len(all_source_ids), "Official IDs are not unique.")

    normalised = {
        **source,
        "normalised_for_printing_import": True,
        "source_api_card_ids_collected": source.get("api_card_ids_collected"),
        "source_detail_rows_collected": source.get("detail_rows_collected"),
        "source_duplicate_official_variants": source.get("duplicate_official_variants"),
        "source_additional_official_card_ids": additional_source_ids,
        "api_card_ids_collected": len(normalised_printings),
        "detail_rows_collected": len(normalised_printings),
        "duplicate_official_variants": 0,
        "printings": normalised_printings,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(normalised, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        json.dumps(
            {
                "set_code": normalised.get("set_code_requested"),
                "canonical_printings": len(normalised_printings),
                "source_official_ids": len(all_source_ids),
                "additional_official_ids": len(additional_source_ids),
            },
            ensure_ascii=False,
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
