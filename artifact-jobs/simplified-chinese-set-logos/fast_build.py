#!/usr/bin/env python3
"""Parallel runner for retrieve_set_images.py.

The matching/rendering logic remains in the audited main module.  This runner only
parallelises independent article fetches and per-product image retrievals so the
artifact can be built within a normal CI window.
"""
from __future__ import annotations

import json
import math
from concurrent.futures import ThreadPoolExecutor, as_completed

import retrieve_set_images as m


def main() -> int:
    m.OUT.mkdir(parents=True, exist_ok=True)
    m.IMAGES.mkdir(parents=True, exist_ok=True)
    requested = m.load_manifest()

    urls = m.discover_article_urls()
    print(f"discovered {len(urls)} official product articles", flush=True)
    articles = []
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {pool.submit(m.parse_article, i, url): (i, url) for i, url in enumerate(urls, 1)}
        for done, future in enumerate(as_completed(futures), 1):
            article = future.result()
            if article and article.nodes:
                articles.append(article)
            if done % 20 == 0:
                print(f"parsed {done}/{len(urls)} articles", flush=True)
    articles.sort(key=lambda article: article.order)
    if not articles:
        raise RuntimeError("No official pokemon.cn product articles could be crawled")
    m.write_article_catalog(articles)

    audit: list[dict] = []
    results = []
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(m.retrieve_one, item, articles, audit): item for item in requested}
        for done, future in enumerate(as_completed(futures), 1):
            item = futures[future]
            result = future.result()
            results.append(result)
            print(
                f"[{done:03d}/{len(requested):03d}] {item.code:<14} "
                f"{result.status:<9} {result.article_title[:55]}",
                flush=True,
            )
    results.sort(key=lambda result: result.order)
    audit.sort(key=lambda row: (int(row.get("order", 0)), int(row.get("rank", 0))))

    m.write_report(results)
    m.write_audit(audit)
    m.write_readme(results, articles)
    m.build_pdf(results)
    m.build_zip(results)
    m.validate(results)

    retrieved = sum(result.status == "retrieved" for result in results)
    unique = len({result.sha256 for result in results if result.sha256})
    summary = {
        "requested": len(results),
        "articles_crawled": len(articles),
        "retrieved": retrieved,
        "missing": len(results) - retrieved,
        "unique_selected_images": unique,
        "pages": math.ceil(len(results) / 6),
        "pdf": m.PDF_PATH.name,
        "zip": m.ZIP_PATH.name,
        "report": m.REPORT_PATH.name,
    }
    m.SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
