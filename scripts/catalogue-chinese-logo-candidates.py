#!/usr/bin/env python3
"""Read-only candidate acquisition. No candidate is approved or published here."""
from __future__ import annotations
import concurrent.futures as cf
import csv, hashlib, io, json, re
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlparse
import requests
from PIL import Image
from bs4 import BeautifulSoup

OUT=Path('chinese-logo-candidates')
for d in ('images','pages'):(OUT/d).mkdir(parents=True,exist_ok=True)
HEADERS={'User-Agent':'Mozilla/5.0 StackrCatalogueReview/1.0'}
ALLOWED={'wiki.52poke.com','s1.52poke.com','www.pokemon.cn','image.pokemon.com.cn','asia.pokemon-card.com','card25th.portal-pokemon.com','raw.githubusercontent.com'}

def get(url):
    if urlparse(url).hostname not in ALLOWED:return None
    try:
        r=requests.get(url,headers=HEADERS,timeout=(5,14))
        if r.status_code!=200 or urlparse(r.url).hostname not in ALLOWED:return None
        return r
    except requests.RequestException:return None

def image(code,language,url,page,description,kind):
    r=get(url)
    if r is None or len(r.content)>12000000:return None
    try:
        im=Image.open(io.BytesIO(r.content));im.load()
        if im.width<60 or im.height<15 or im.width*im.height>16000000:return None
        ext={'PNG':'png','WEBP':'webp','JPEG':'jpg'}.get(im.format)
        if not ext:return None
    except Exception:return None
    digest=hashlib.sha256(r.content).hexdigest()
    file=f'images/{language}_{code}_{digest[:12]}.{ext}'
    (OUT/file).write_bytes(r.content)
    return dict(code=code,language=language,url=url,page_url=page,description=description,
                kind=kind,file=file,width=im.width,height=im.height,sha256=digest,
                review_status='pending_visual_and_exact_identity_review')

def page_images(code,language,url):
    r=get(url)
    if r is None:return []
    soup=BeautifulSoup(r.content,'html.parser')
    slug=hashlib.sha256(url.encode()).hexdigest()[:12]
    (OUT/'pages'/f'{language}_{code}_{slug}.html').write_bytes(r.content)
    main=soup.find('main') or soup
    urls=[]
    for tag in main.find_all('img'):
        rel=tag.get('data-src') or tag.get('src') or ''
        u=urljoin(r.url,rel);name=unquote(urlparse(u).path).lower()
        if 'logo' not in name or any(x in name for x in ('header-logo','logo_pokemon','logo-pokemon','common/','footer','logo_main','logo-jp')):continue
        if language=='zh-cn' and any(x in name for x in ('繁中','日文','日版','英文','_en.','_jp.')):continue
        urls.append((u,tag.get('alt','')))
    results=[]
    for u,description in list(dict.fromkeys(urls))[:6]:
        x=image(code,language,u,r.url,description,'publisher_logo_candidate' if urlparse(r.url).hostname!='wiki.52poke.com' else 'archive_logo_candidate')
        if x:results.append(x)
    return results

source='https://raw.githubusercontent.com/tberridge86/Stackr/f8d00ba3e793eea3539b162b2bc5dac025c2f9b9/artifact-jobs/simplified-chinese-set-logos/sets.tsv'
r=get(source)
if r is None:raise RuntimeError('Cannot retrieve fixed requested-set manifest')
sc=list(csv.DictReader(io.StringIO(r.content.decode('utf-8-sig')),delimiter='\t'))
(OUT/'requested-sc.json').write_text(json.dumps(sc,ensure_ascii=False,indent=2),encoding='utf-8')

def simplified(row):
    code=row['code'];name=re.sub(r'^(补充包|强化包|专题包)\s*','',row['name']).strip()
    page='https://wiki.52poke.com/wiki/'+quote(name+'（TCG）',safe='')
    results=page_images(code,'zh-cn',page)
    if results:return results
    # A predictable URL is only a retrieval lead, never identity/approval evidence.
    series='朱&紫' if code.startswith(('csv','cbb')) or code=='151c' else ('太阳&月亮' if code.startswith('csm') and not code.startswith('csmp') else '剑&盾')
    filenames=[f'TCG_{series}_{name}_简中logo.png',f'TCG_{series}_{name}_中文logo.png',f'TCG_{name}_简中logo.png',f'{name}_简中logo.png']
    for filename in filenames:
        h=hashlib.md5(filename.encode()).hexdigest();u=f'https://s1.52poke.com/wiki/{h[0]}/{h[:2]}/'+quote(filename,safe='')
        x=image(code,'zh-cn',u,page,filename,'archive_filename_candidate')
        if x:results.append(x);break
    print('SC',code,len(results),flush=True)
    return results or [dict(code=code,language='zh-cn',name=row['name'],review_status='no_standalone_logo_retrieved')]

with cf.ThreadPoolExecutor(max_workers=6) as pool:sc_results=[x for group in pool.map(simplified,sc) for x in group]
(OUT/'sc-results.json').write_text(json.dumps(sc_results,ensure_ascii=False,indent=2),encoding='utf-8')

TC=['sv10','sv9a','sv9','sv8a','sv8','sv7a','sv7','sv6a','sv6','sv5a','sv5k-sv5m','sv4a','sv4k-sv4m','sv3a','sv3','sv2a','sv2d-sv2p','sv1a','sv1s-sv1v','s12a','s12','s11a','s11','s10b','s10a','s10d-s10p','s9a','s9','s8b','s8','s7d-s7r','s6a','s6h-s6k','s5a','s5i-s5r','s4a','s4','svhk-svhm','svel-svem','svd','sval-svam-svaw','svc','sll-sld','sj','si','sh','sc1','sc2']

def traditional(code):
    for end in ('/index.html','/'):
        u='https://asia.pokemon-card.com/tw/archive/special/card/'+code+end
        rows=page_images(code,'zh-tw',u)
        if rows:print('TC',code,len(rows),flush=True);return rows
    return [dict(code=code,language='zh-tw',review_status='no_publisher_logo_retrieved')]
with cf.ThreadPoolExecutor(max_workers=6) as pool:tc_results=[x for group in pool.map(traditional,TC) for x in group]
(OUT/'tc-publisher-results.json').write_text(json.dumps(tc_results,ensure_ascii=False,indent=2),encoding='utf-8')
print('FINAL',sum('file' in r for r in sc_results),'SC candidates;',sum('file' in r for r in tc_results),'TC publisher candidates',flush=True)
