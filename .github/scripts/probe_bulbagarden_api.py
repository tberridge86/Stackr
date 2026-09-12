from __future__ import annotations

import json
from pathlib import Path

import requests

OUT = Path('build/bulbagarden-api-probe')
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({
    'User-Agent': 'StackrLogoResearch/1.0 (Pokemon set-logo verification)',
    'Accept': 'application/json,text/plain,*/*',
})

prefixes = ['SV9a', 'SV9', 'SV8a', 'SV8', 'S12a', 'S8b', 'S3', 'S1W', 'S1H']
results = {}
for prefix in prefixes:
    params = {
        'action': 'query',
        'list': 'allimages',
        'aiprefix': prefix,
        'ailimit': '50',
        'aiprop': 'url|size|mime',
        'format': 'json',
        'formatversion': '2',
        'origin': '*',
    }
    for host in ('https://archives.bulbagarden.net/w/api.php', 'https://archives.bulbagarden.net/api.php'):
        try:
            r = S.get(host, params=params, timeout=30)
            print(prefix, r.status_code, len(r.content), r.url)
            print(r.text[:500])
            results.setdefault(prefix, []).append({
                'host': host,
                'status': r.status_code,
                'url': r.url,
                'text': r.text[:20000],
            })
        except Exception as exc:
            print(prefix, host, 'ERROR', repr(exc))
            results.setdefault(prefix, []).append({'host': host, 'error': repr(exc)})

(OUT / 'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
