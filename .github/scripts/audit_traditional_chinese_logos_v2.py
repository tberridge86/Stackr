from __future__ import annotations

import runpy

import requests

_original_get = requests.Session.get


def _utf8_get(self, url, *args, **kwargs):
    response = _original_get(self, url, *args, **kwargs)
    if "asia.pokemon-card.com/tw/" in str(url):
        response.encoding = "utf-8"
    return response


requests.Session.get = _utf8_get
runpy.run_path(".github/scripts/audit_traditional_chinese_logos.py", run_name="__main__")
