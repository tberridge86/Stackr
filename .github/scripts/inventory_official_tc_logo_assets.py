from __future__ import annotations

import concurrent.futures
import io
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

OUT = Path('build/official-tc-logo-inventory')
IMG = OUT / 'images'
OUT.mkdir(parents=True, exist_ok=True)
IMG.mkdir(parents=True, exist_ok=True)

CODES = [
'SV10','SV9a','SV9','SV8a','SV8','SV7a','SV7','SV6a','SV6','SV5a','SV5K','SV5M','SV4a','SV4K','SV4M',
'SV3a','SV3','SV2a','SV2D','SV2P','SV1a','SV1S','SV1V','S12a','S12','S11a','S10b','S10a','S10D','S10P',
'S9a','S9','S8b','S8a','S8','S7D','S7R','S6a','S6H','S6K','S5a','S5I','S5R','S4a','S4',
'SC2a','SC2b','SC1a','SC1b'
]

HEADERS={'User-Agent':'Mozilla/5.0 (compatible; StackrLogoInventory/1.0)','Accept':'text/html,image/*,*/*;q=0.8'}


def urls_for(code:str)->list[str]:
    c=code.lower()
    return [
      f'https://asia.pokemon-card.com/tw/archive/special/card/{c}/',
      f'https://asia.pokemon-card.com/hk/archive/special/card/{c}/',
      f'https://asia.pokemon-card.com/tw/archive/card/scarlet_violet_series/scarlet_violet_{c}.html',
      f'https://asia.pokemon-card.com/hk/archive/card/scarlet_violet_series/scarlet_violet_{c}.html',
      f'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_{c}.html',
      f'https://asia.pokemon-card.com/hk/archive/card/sword_shield_series/sword_shield_{c}.html',
    ]


def fetch(url:str, timeout=18):
    try:
        r=requests.get(url,headers=HEADERS,timeout=timeout,allow_redirects=True)
        if r.status_code==200 and len(r.content)>300:
            return r
    except Exception as e:
        return None
    return None


def extract_refs(base:str,text:str)->list[str]:
    refs=[]
    soup=BeautifulSoup(text,'html.parser')
    for tag in soup.find_all(['img','source','link','script']):
        for a in ('src','data-src','href'):
            v=tag.get(a)
            if v: refs.append(urljoin(base,v))
        for a in ('srcset','data-srcset'):
            v=tag.get(a)
            if v:
                refs += [urljoin(base,p.strip().split()[0]) for p in v.split(',') if p.strip()]
    refs += [urljoin(base,v) for v in re.findall(r'url\(["\']?([^"\')]+)',text,re.I)]
    refs += [urljoin(base,v) for v in re.findall(r'["\']([^"\']+\.(?:png|webp|jpe?g|svg))["\']',text,re.I)]
    return list(dict.fromkeys(refs))


def score(url:str,code:str)->int:
    f=Path(urlparse(url).path).name.lower()
    s=0
    if any(x in f for x in ('main-logo','set-logo','title-logo','hero-logo','logo-main','logo-title')): s+=1000
    elif 'logo' in f and not any(x in f for x in ('header-logo','pokemon-logo','site-logo')): s+=850
    if code.lower() in f: s+=130
    if any(x in f for x in ('hero-head','hero-title','main-title','kv-title')): s+=500
    if any(x in f for x in ('hero-visual','main-visual','top_banner','top-banner','banner-img')): s+=260
    if any(x in f for x in ('product-image','product-img','_pkg','pack')): s+=160
    if any(x in f for x in ('header-logo','menu','footer','icon','button','btn','card','shinka','arrow','sns')): s-=900
    return s


def process(code:str):
    page=None
    html=''
    for u in urls_for(code):
        r=fetch(u)
        if r:
            page=r.url; html=r.text; break
    if not page:
        return {'code':code,'page':'','status':'missing','assets':[]}
    refs=extract_refs(page,html)
    css=[u for u in refs if urlparse(u).path.lower().endswith('.css')]
    for cu in css[:20]:
        cr=fetch(cu,timeout=12)
        if cr: refs += extract_refs(cr.url,cr.text)
    refs=list(dict.fromkeys(refs))
    candidates=[]
    for u in refs:
        p=urlparse(u).path.lower()
        if not p.endswith(('.png','.webp','.jpg','.jpeg')): continue
        sc=score(u,code)
        if sc<100: continue
        candidates.append((sc,u))
    candidates=sorted(candidates,reverse=True)[:12]
    assets=[]
    for rank,(sc,u) in enumerate(candidates,1):
        r=fetch(u,timeout=25)
        if not r: continue
        try:
            im=Image.open(io.BytesIO(r.content)); im.load(); im=im.convert('RGBA')
        except Exception: continue
        name=f'{code}_{rank:02d}_{Path(urlparse(u).path).name}'
        name=re.sub(r'[^A-Za-z0-9._-]','-',name)
        path=IMG/name
        im.save(path,'PNG',optimize=True)
        assets.append({'score':sc,'url':u,'file':str(path),'width':im.width,'height':im.height,'rank':rank})
    return {'code':code,'page':page,'status':'ok','assets':assets}


def font(size,bold=False):
    paths=['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
    for p in paths:
        if Path(p).exists(): return ImageFont.truetype(p,size)
    return ImageFont.load_default()


def contact(rows):
    cols=3; cw=800; ch=500
    canvas=Image.new('RGB',(cols*cw,((len(rows)+cols-1)//cols)*ch),'white')
    d=ImageDraw.Draw(canvas); fc=font(30,True); fs=font(18)
    for i,row in enumerate(rows):
        x=(i%cols)*cw; y=(i//cols)*ch
        d.rectangle((x,y,x+cw-2,y+ch-2),outline=(190,194,204),width=2)
        d.text((x+15,y+12),row['code'],font=fc,fill=(20,25,35))
        d.text((x+120,y+18),row.get('status',''),font=fs,fill=(80,86,98))
        assets=row.get('assets') or []
        for j,a in enumerate(assets[:4]):
            im=Image.open(a['file']).convert('RGBA'); im.thumbnail((360,170),Image.Resampling.LANCZOS)
            ox=x+20+(j%2)*390; oy=y+70+(j//2)*205
            canvas.paste(im,(ox+(360-im.width)//2,oy),im)
            d.text((ox,oy+175),f"{a['rank']} s={a['score']} {a['width']}x{a['height']}",font=fs,fill=(70,76,88))
            d.text((ox,oy+198),Path(urlparse(a['url']).path).name[:42],font=fs,fill=(70,76,88))
    canvas.save(OUT/'contact-sheet.jpg','JPEG',quality=90,optimize=True)

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    rows=list(ex.map(process,CODES))
rows.sort(key=lambda r:CODES.index(r['code']))
(OUT/'inventory.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')
contact(rows)
for r in rows:
    print(r['code'],r['status'],r['page'],[(a['rank'],a['score'],Path(urlparse(a['url']).path).name,a['width'],a['height']) for a in (r.get('assets') or [])[:4]],flush=True)
