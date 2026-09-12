from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import quote

import requests

OUT = Path('build/tc-official-probe')
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({'User-Agent':'Mozilla/5.0 (compatible; StackrLogoProbe/2.0)'})

terms = ['熱風競技場', '對戰搭檔', '伊布英雄', '一撃大師']
patterns = [
    'https://asia.pokemon-card.com/tw/?s={q}',
    'https://asia.pokemon-card.com/tw/info/?s={q}',
    'https://asia.pokemon-card.com/tw/wp-json/wp/v2/posts?search={q}&per_page=10',
    'https://asia.pokemon-card.com/wp-json/wp/v2/posts?search={q}&per_page=10',
    'https://asia.pokemon-card.com/tw/wp-json/wp/v2/search?search={q}&per_page=10',
    'https://asia.pokemon-card.com/wp-json/wp/v2/search?search={q}&per_page=10',
]
rows=[]
for term in terms:
    for pattern in patterns:
        url=pattern.format(q=quote(term))
        try:
            r=S.get(url,timeout=30,allow_redirects=True)
            text=r.text
            rows.append({'term':term,'url':url,'final_url':r.url,'status':r.status_code,'content_type':r.headers.get('content-type',''),'length':len(r.content),'snippet':text[:1000]})
            print(term, r.status_code, len(r.content), r.url)
        except Exception as e:
            rows.append({'term':term,'url':url,'error':repr(e)})
            print(term,'ERROR',url,e)

# Known page image extraction test.
known='https://asia.pokemon-card.com/tw/archives/7149/'
r=S.get(known,timeout=30)
(OUT/'known_page.html').write_text(r.text,encoding='utf-8')
rows.append({'known':known,'status':r.status_code,'length':len(r.content),'snippet':r.text[:2000]})
(OUT/'probe.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
