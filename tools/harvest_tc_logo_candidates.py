#!/usr/bin/env python3
from __future__ import annotations

import csv
import io
import math
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

OUT = Path('artifacts/tc-logo-candidate-harvest')
OUT.mkdir(parents=True, exist_ok=True)
RAW = OUT / 'candidates'
RAW.mkdir(exist_ok=True)

PAGES = {
'SV10':'https://asia.pokemon-card.com/tw/archive/special/card/sv10/',
'SV9a':'https://asia.pokemon-card.com/tw/archives/9823/',
'SV9':'https://asia.pokemon-card.com/tw/archive/special/card/sv9/',
'SV8a':'https://asia.pokemon-card.com/tw/archive/special/card/sv8a/',
'SV8':'https://asia.pokemon-card.com/tw/archive/special/card/sv8/',
'SV7a':'https://asia.pokemon-card.com/tw/archives/8502/',
'SV7':'https://asia.pokemon-card.com/tw/archive/special/card/sv7/',
'SV6a':'https://asia.pokemon-card.com/tw/archives/7855/',
'SV6':'https://asia.pokemon-card.com/tw/archive/special/card/sv6/',
'SV5a':'https://asia.pokemon-card.com/tw/archives/7445/',
'SV5':'https://asia.pokemon-card.com/tw/archive/special/card/sv5/',
'SVHK':'https://asia.pokemon-card.com/tw/archives/6930/',
'SV4a':'https://asia.pokemon-card.com/tw/archive/special/card/sv4a/',
'SV4':'https://asia.pokemon-card.com/tw/archive/special/card/sv4/',
'SVEL':'https://asia.pokemon-card.com/tw/archives/5950/',
'SV3a':'https://asia.pokemon-card.com/tw/archives/5943/',
'SV3':'https://asia.pokemon-card.com/tw/archive/special/card/sv3/',
'SVA':'https://asia.pokemon-card.com/tw/archive/special/card/sva/',
'SVD':'https://asia.pokemon-card.com/tw/archive/special/card/svd/',
'SV2a':'https://asia.pokemon-card.com/tw/archive/special/card/sv2a/',
'SVP1':'https://asia.pokemon-card.com/tw/archives/5371/',
'SVC':'https://asia.pokemon-card.com/tw/archive/special/card/svc/index.html',
'SV2':'https://asia.pokemon-card.com/tw/archives/5065/',
'SV1a':'https://asia.pokemon-card.com/tw/archives/4771/',
'SVB':'https://asia.pokemon-card.com/tw/archives/4686/',
'SV1':'https://asia.pokemon-card.com/tw/archive/special/card/sv1/',
'S12a':'https://asia.pokemon-card.com/tw/archive/special/card/s12a/',
'S12':'https://asia.pokemon-card.com/tw/archive/special/card/s12/',
'SD':'https://asia.pokemon-card.com/tw/archives/3892/',
'S11a':'https://asia.pokemon-card.com/tw/archives/3611/',
'SP6':'https://asia.pokemon-card.com/tw/archives/3096/',
'SPDZ':'https://asia.pokemon-card.com/tw/archives/3088/',
'S11':'https://asia.pokemon-card.com/tw/archive/special/card/s11/',
'S10b':'https://asia.pokemon-card.com/tw/archive/special/card/s10b/',
'S10a':'https://asia.pokemon-card.com/tw/archives/2356/',
'S10':'https://asia.pokemon-card.com/tw/archive/special/card/s10/',
'S9a':'https://asia.pokemon-card.com/tw/archives/1645/',
'SLD':'https://asia.pokemon-card.com/tw/archives/1706/',
'SI':'https://asia.pokemon-card.com/tw/archive/special/card/si/',
'S9':'https://asia.pokemon-card.com/tw/archive/special/card/s9/',
'SJ':'https://asia.pokemon-card.com/tw/archives/1305/',
'SK':'https://asia.pokemon-card.com/tw/archives/1289/',
'S8b':'https://asia.pokemon-card.com/tw/archive/special/card/s8b/',
'S8a':'https://card25th.portal-pokemon.com/tw/card/s8a/',
'S8':'https://asia.pokemon-card.com/tw/archive/special/card/s8/index.html',
'SCD':'https://asia.pokemon-card.com/tw/archive/special/card/scd/index.html',
'S7':'https://asia.pokemon-card.com/tw/archive/special/card/s7/index.html',
'SH':'https://asia.pokemon-card.com/tw/archive/special/card/family_game/index.html',
'S6a':'https://asia.pokemon-card.com/tw/archive/special/card/s6a/index.html',
'SCC':'https://asia.pokemon-card.com/tw/archive/special/card/scc/index.html',
'S6':'https://asia.pokemon-card.com/tw/archive/special/card/s6/index.html',
'S5a':'https://asia.pokemon-card.com/tw/archive/special/card/s5af/index.html',
'S5':'https://asia.pokemon-card.com/tw/archive/special/card/s5/index.html',
'SCB':'https://asia.pokemon-card.com/tw/archive/special/card/scb/index.html',
'S4a':'https://asia.pokemon-card.com/tw/archive/special/card/s4a/index.html',
'SCA':'https://asia.pokemon-card.com/tw/archive/special/card/sca/index.html',
'S4':'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_s4.html',
'SC2a':'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_sc2a.html',
'SC2b':'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_sc2b.html',
'SC2D':'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_sc2d.html',
'SC1a':'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_sc1a.html',
'SC1b':'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_sc1b.html',
'SC1D':'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_sc1d.html',
}

session = requests.Session()
session.headers.update({'User-Agent':'Mozilla/5.0 Stackr logo asset audit'})

def score(url: str, context: str, code: str) -> int:
    low=(url+' '+context).lower(); path=urlparse(url).path.lower(); s=0
    if any(x in low for x in ('logo_pokemon','pokemon-card-logo','pokemon_card_logo','footer','sns','facebook','youtube','instagram','line-logo','menu','nav','loading','favicon','icon-')): return -9999
    if re.search(r'(?:^|[/_.-])(main|hero)[_.-]?logo(?:[/_.-]|$)',path): s+=700
    if re.search(r'(?:^|[/_.-])logo[_.-]?(main|hero|title|ttl)(?:[/_.-]|$)',path): s+=680
    if 'product-logo' in path or 'set-logo' in path: s+=650
    if 'title-logo' in path or 'title_logo' in path or 'ttl-logo' in path: s+=620
    if 'logo' in path: s+=400
    if 'title' in path or re.search(r'(?:^|[/_.-])ttl(?:[/_.-]|$)',path): s+=280
    if 'main' in path or 'hero' in path or '/mv' in path: s+=80
    if code.lower().replace('-','') in re.sub('[^a-z0-9]','',path): s+=90
    if any(x in path for x in ('head-h2','section-head','card-head','pokemon-head','news-head','about-head','product-head','campaign-head','trainers-head')): s-=300
    if any(x in path for x in ('banner','bnr','package','pack','box','kv','visual')): s-=220
    if url.startswith('data:'): s-=1000
    if Path(path).suffix.lower() in ('.png','.webp'): s+=20
    return s

def urls_from_css(css_url: str, text: str):
    for raw in re.findall(r'url\(\s*["\']?([^"\')]+)', text, flags=re.I):
        yield urljoin(css_url, raw.strip())

def collect(page: str, code: str):
    r=session.get(page,timeout=30); r.raise_for_status(); final=r.url
    soup=BeautifulSoup(r.text,'html.parser')
    rows=[]
    def add(raw,ctx):
        if not raw or raw.startswith('#'): return
        u=urljoin(final,raw)
        if u.startswith('data:'): return
        if re.search(r'\.(png|webp|jpe?g)(?:[?#].*)?$',u,re.I): rows.append((score(u,ctx,code),u,ctx))
    for tag in soup.find_all(['img','source']):
        ctx=' '.join(str(tag.get(k) or '') for k in ('alt','class','id'))
        for k in ('src','data-src','data-lazy-src'):
            add(tag.get(k),ctx)
        for k in ('srcset','data-srcset'):
            for piece in (tag.get(k) or '').split(','): add(piece.strip().split(' ')[0],ctx)
    for tag in soup.find_all(style=True):
        for u in urls_from_css(final,tag.get('style') or ''): add(u,'inline style')
    styles=[]
    for link in soup.find_all('link',href=True):
        rel=' '.join(link.get('rel') or []).lower(); href=urljoin(final,link['href'])
        if 'stylesheet' in rel or href.lower().endswith('.css'): styles.append(href)
    for css in list(dict.fromkeys(styles))[:30]:
        try:
            cr=session.get(css,timeout=20); cr.raise_for_status()
            for u in urls_from_css(css,cr.text): add(u,'stylesheet '+css)
        except Exception as e: print('CSS FAIL',code,css,e)
    best={}
    for sc,u,ctx in sorted(rows,reverse=True): best.setdefault(u,(sc,u,ctx))
    return list(best.values())[:12]

def get_image(url):
    r=session.get(url,timeout=30); r.raise_for_status()
    im=Image.open(io.BytesIO(r.content)); im.load(); return im.convert('RGBA')

manifest=[]; previews=[]
for code,page in PAGES.items():
    print('\n',code,page)
    try: candidates=collect(page,code)
    except Exception as e:
        print('PAGE FAIL',code,repr(e)); manifest.append([code,page,'','','','','',repr(e)]); continue
    rank=0
    for sc,u,ctx in candidates:
        try:
            im=get_image(u)
            if im.width<80 or im.height<25: continue
            rank+=1
            ext='.png'; path=RAW/f'{code}_{rank:02d}.png'; im.save(path,'PNG',optimize=True)
            alpha=im.getchannel('A'); amin,amax=alpha.getextrema(); transparent=amin<250
            manifest.append([code,page,rank,sc,u,im.width,im.height,transparent,ctx])
            previews.append((code,rank,sc,u,path,im.copy()))
            print(rank,sc,im.size,transparent,u)
            if rank>=6: break
        except Exception as e: print('IMAGE FAIL',code,u,repr(e))

with (OUT/'candidate-manifest.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f); w.writerow(['group','page','rank','score','url','width','height','has_transparency','context']); w.writerows(manifest)

cellw,cellh=520,260; cols=3; rows=4; per=cols*rows
font=ImageFont.load_default()
for pi in range(math.ceil(len(previews)/per)):
    canvas=Image.new('RGB',(cellw*cols,cellh*rows),'white'); d=ImageDraw.Draw(canvas)
    for slot,item in enumerate(previews[pi*per:(pi+1)*per]):
        code,rank,sc,u,path,im=item; x=(slot%cols)*cellw; y=(slot//cols)*cellh
        check=Image.new('RGBA',(cellw-24,cellh-64),(245,245,245,255))
        maxw,maxh=cellw-54,cellh-94; scale=min(maxw/im.width,maxh/im.height,1.0)
        thumb=im.resize((max(1,int(im.width*scale)),max(1,int(im.height*scale))),Image.Resampling.LANCZOS)
        check.alpha_composite(thumb,((check.width-thumb.width)//2,(check.height-thumb.height)//2))
        canvas.paste(check.convert('RGB'),(x+12,y+38))
        d.text((x+12,y+8),f'{code}  candidate {rank}  score {sc}',fill='black',font=font)
        d.text((x+12,y+23),Path(urlparse(u).path).name[:75],fill='black',font=font)
    canvas.save(OUT/f'candidate-contact-sheet-{pi+1:02d}.jpg','JPEG',quality=88,optimize=True)
print('DONE',len(manifest),'manifest rows',len(previews),'previews')
