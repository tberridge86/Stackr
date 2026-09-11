#!/usr/bin/env python3
from __future__ import annotations

import os
import time

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

import official_candidate_audit as audit

ARTICLE_ID = os.environ["ARTICLE_ID"]
ARTICLE_TITLE = os.environ["ARTICLE_TITLE"]
ARTICLE_URL = os.environ["ARTICLE_URL"]
TARGET_CODES = os.environ["TARGET_CODES"]

out_root = audit.ROOT / "single-candidate-audits" / ARTICLE_ID
out_root.mkdir(parents=True, exist_ok=True)
audit.OUT = out_root
audit.IMG = out_root / "images"
audit.ARTICLES = {
    ARTICLE_ID: (ARTICLE_TITLE, ARTICLE_URL, TARGET_CODES),
}

retry = Retry(
    total=4,
    connect=4,
    read=4,
    status=4,
    backoff_factor=1.0,
    status_forcelist=(429, 500, 502, 503, 504),
    allowed_methods=frozenset({"GET"}),
    raise_on_status=False,
)
adapter = HTTPAdapter(max_retries=retry, pool_connections=6, pool_maxsize=6)
audit.S.mount("https://", adapter)
audit.S.mount("http://", adapter)

_original_get = audit.get


def resilient_get(url: str, referer: str = ""):
    last = None
    for attempt in range(3):
        try:
            return _original_get(url, referer)
        except requests.RequestException as exc:
            last = exc
            time.sleep(1.5 * (attempt + 1))
    assert last is not None
    raise last


audit.get = resilient_get

if __name__ == "__main__":
    raise SystemExit(audit.main())
