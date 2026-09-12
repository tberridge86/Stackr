from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import quote, urljoin

import requests
from bs4 import BeautifulSoup

OUT = Path('build/tc-official-probe')
OUT.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({'User-Agent':'Mozilla/5.0 (compatible; StackrLogoProbe/2.1)'})

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
            rows.append({'term':term,'url':url,'final_url':r.url,'status':r.status_code,'content_type':r.headers.get('content-type',''),'length':len(r.content),'contains_term':term in text,'snippet':text[:1000]})
            print(term, r.status_code, len(r.content), 'contains=', term in text, r.url)
        except Exception as e:
            rows.append({'term':term,'url':url,'error':repr(e)})
            print(term,'ERROR',url,e)

# Full Taiwan information index: search the rendered archive listing for article links.
index_url='https://asia.pokemon-card.com/tw/info/'
r=S.get(index_url,timeout=45)
(OUT/'tw_info.html').write_text(r.text,encoding='utf-8')
soup=BeautifulSoup(r.text,'html.parser')
index_matches={}
for term in terms:
    matches=[]
    for tag in soup.find_all(string=lambda value: isinstance(value,str) and term in value):
        a=tag.find_parent('a')
        if a and a.get('href'):
            matches.append({'text':' '.join(a.get_text(' ',strip=True).split()),'href':urljoin(index_url,a.get('href'))})
        else:
            parent=tag.parent
            matches.append({'text':' '.join(parent.get_text(' ',strip=True).split()) if parent else str(tag).strip(),'href':''})
    dedup=[]
    seen=set()
    for m in matches:
        key=(m['text'],m['href'])
        if key not in seen:
            seen.add(key); dedup.append(m)
    index_matches[term]=dedup[:20]
    print('INDEX',term,len(dedup),dedup[:3])

# Known Hong Kong page image extraction test (Traditional Chinese product artwork).
known='https://asia.pokemon-card.com/hk/archives/7149/'
r=S.get(known,timeout=45)
(OUT/'known_page.html').write_text(r.text,encoding='utf-8')
ksoup=BeautifulSoup(r.text,'html.parser')
images=[]
for img in ksoup.find_all('img'):
    src=img.get('data-src') or img.get('data-lazy-src') or img.get('src') or ''
    if not src: continue
    images.append({'src':urljoin(known,src),'alt':img.get('alt',''),'class':' '.join(img.get('class',[]))})
print('KNOWN',r.status_code,len(r.content),'images',len(images))
for img in images:
    if 'sv9a' in (img['src']+' '+img['alt']).lower():
        print('IMAGE',img)

(OUT/'probe.json').write_text(json.dumps({'requests':rows,'index_matches':index_matches,'known':{'url':known,'status':r.status_code,'length':len(r.content),'images':images}},ensure_ascii=False,indent=2),encoding='utf-8')
