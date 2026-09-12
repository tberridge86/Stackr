from __future__ import annotations

import importlib.util
import sys
import time
from pathlib import Path

import requests

BASE_SCRIPT = Path(__file__).with_name('build_tc_logos_a4.py')
spec = importlib.util.spec_from_file_location('tc_logo_builder', BASE_SCRIPT)
if spec is None or spec.loader is None:
    raise RuntimeError(f'Could not load {BASE_SCRIPT}')
builder = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = builder
spec.loader.exec_module(builder)


def fast_get(url: str, *, timeout: int = 35) -> requests.Response | None:
    """Retry transient network/server failures, but never retry a definite 4xx miss."""
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = builder.SESSION.get(url, timeout=timeout, allow_redirects=True)
            if response.status_code == 200:
                return response
            if 400 <= response.status_code < 500:
                return None
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            print('GET error', url, exc, flush=True)
        if attempt == 0:
            time.sleep(0.75)
    if last_error:
        print('GET abandoned', url, last_error, flush=True)
    return None


builder.get = fast_get
builder.main()
