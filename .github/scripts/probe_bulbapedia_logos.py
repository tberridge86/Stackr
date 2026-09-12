from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

OUT = Path('build/bulbapedia-logo-probe')
OUT.mkdir(parents=True, exist_ok=True)
URL = 'https://bulbapedia.bulbagarden.net/wiki/List_of_Japanese_TCG_Expansions'
S = requests.Session()
S.headers.update({'User-Agent':'Mozilla/5.0 (compatible; StackrLogoResearch/1.0; contact=none)'})
r = S.get(URL, timeout=60)
print('LIST', r.status_code, len(r.content), r.url)
r.raise_for_status()
(OUT/'page.html').write_text(r.text, encoding='utf-8')
soup = BeautifulSoup(r.text, 'html.parser')
rows=[]
for img in soup.find_all('img'):
    alt=img.get('alt','')
    src=urljoin(r.url, img.get('src',''))
    parent=img.find_parent('a')
    href=urljoin(r.url, parent.get('href','')) if parent and parent.get('href') else ''
    if 'Logo' not in alt and 'logo' not in alt:
        continue
    rows.append({'alt':alt,'src':src,'href':href,'width':img.get('width'),'height':img.get('height')})
    print('IMG', alt, href, src)
(OUT/'images.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
print('TOTAL',len(rows))
