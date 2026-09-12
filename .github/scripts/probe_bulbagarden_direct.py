from __future__ import annotations

import hashlib
from pathlib import Path

import requests

OUT = Path('build/bulbagarden-direct-probe')
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({'User-Agent': 'Mozilla/5.0 (compatible; StackrLogoResearch/1.0)'})
files = [
    'SV9a_Hot_Wind_Arena_Logo.png',
    'SV8a_Terastal_Fest_ex_Logo.png',
    'S12a_VSTAR_Universe_Logo.png',
    'S8b_VMAX_Climax_Logo.png',
]
for filename in files:
    digest = hashlib.md5(filename.encode('utf-8')).hexdigest()
    url = f'https://archives.bulbagarden.net/media/upload/{digest[0]}/{digest[:2]}/{filename}'
    r = S.get(url, timeout=40, allow_redirects=True)
    print(filename, r.status_code, r.headers.get('content-type'), len(r.content), r.url)
    if r.status_code == 200:
        (OUT / filename).write_bytes(r.content)
