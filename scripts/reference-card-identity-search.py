#!/usr/bin/env python3
import json
import math
import sys


LANGUAGES = ["en", "ja", "ko", "zh-Hans", "zh-Hant"]
ERAS = ["wotc", "ex", "dp", "bw", "xy", "sm", "swsh", "sv"]


def l2_normalize(values):
    norm = math.sqrt(sum(value * value for value in values))
    if norm <= 0:
        raise ValueError("Embedding norm must be greater than zero.")
    return [value / norm for value in values]


def record_embedding(card_index, dimensions):
    return l2_normalize(
        [
            math.sin((card_index + 1) * (dimension + 3) * 0.017)
            + math.cos((card_index + 11) * (dimension + 1) * 0.013) * 0.5
            for dimension in range(dimensions)
        ]
    )


def as_set(value):
    if value is None:
        return None
    values = value if isinstance(value, list) else [value]
    values = [str(entry).strip() for entry in values if str(entry).strip()]
    return set(values) if values else None


def matches(actual, allowed):
    if allowed is None:
        return True
    return actual in allowed


def main():
    request = json.load(sys.stdin)
    count = int(request.get("count", 0))
    dimensions = int(request.get("dimensions", 128))
    query_index = int(request.get("queryIndex", 0))
    top_k = max(1, min(int(request.get("topK", 10)), 100))
    filters = request.get("filters") or {}
    language = as_set(filters.get("language"))
    set_id = as_set(filters.get("setId"))
    collector_number = as_set(filters.get("collectorNumber"))
    era = as_set(filters.get("era"))

    query = record_embedding(query_index, dimensions)
    candidates = []
    searched_count = 0

    for card_index in range(count):
        record = {
            "canonicalCardId": f"synthetic-card-{card_index:06d}",
            "language": LANGUAGES[card_index % len(LANGUAGES)],
            "setId": f"set-{card_index % 37:02d}",
            "collectorNumber": f"{(card_index % 230) + 1:03d}",
            "era": ERAS[card_index % len(ERAS)],
        }
        if not matches(record["language"], language):
            continue
        if not matches(record["setId"], set_id):
            continue
        if not matches(record["collectorNumber"], collector_number):
            continue
        if not matches(record["era"], era):
            continue

        embedding = record_embedding(card_index, dimensions)
        searched_count += 1
        candidates.append(
            {
                **record,
                "similarity": sum(left * right for left, right in zip(query, embedding)),
            }
        )

    candidates.sort(key=lambda item: (-item["similarity"], item["canonicalCardId"]))
    ranked = [
        {**candidate, "rank": index + 1}
        for index, candidate in enumerate(candidates[:top_k])
    ]
    json.dump(
        {
            "status": "success" if ranked else "empty",
            "searchedCount": searched_count,
            "candidateCount": len(ranked),
            "candidates": ranked,
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
