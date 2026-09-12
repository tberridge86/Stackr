from __future__ import annotations

from pathlib import Path

import requests

OUT = Path('build/tcgdex-logo-path-probe')
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({'User-Agent':'StackrLogoResearch/1.0','Accept':'image/*,application/json'})

cases = {
    'SV9a': ['sv'],
    'SV8a': ['sv'],
    'S12a': ['swsh','s'],
    'S8b': ['swsh','s'],
    'S7D': ['swsh','s'],
}
langs = ['zh-tw','ja','en','univ']
exts = ['png','webp','jpg']
for code, series_list in cases.items():
    for lang in langs:
        for series in series_list:
            for setid in [code, code.lower()]:
                for ext in exts:
                    url=f'https://assets.tcgdex.net/{lang}/{series}/{setid}/logo.{ext}'
                    try:
                        r=S.get(url,timeout=25,allow_redirects=True)
                        if r.status_code == 200 and len(r.content)>200:
                            print('HIT', code, r.status_code, r.headers.get('content-type'), len(r.content), url)
                            safe=f'{code}_{lang}_{series}_{setid}_logo.{ext}'.replace('/','-')
                            (OUT/safe).write_bytes(r.content)
                        elif r.status_code not in (404,403):
                            print('MISS', code, r.status_code, len(r.content), url)
                    except Exception as exc:
                        print('ERROR', code, url, repr(exc))
