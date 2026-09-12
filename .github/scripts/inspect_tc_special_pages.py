from __future__ import annotations

import csv
import io
import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont

OUT = Path('build/tc-special-page-inspection')
IMG = OUT / 'images'
OUT.mkdir(parents=True, exist_ok=True)
IMG.mkdir(parents=True, exist_ok=True)
S = requests.Session()
S.headers.update({'User-Agent':'Mozilla/5.0 (compatible; StackrLogoInspector/2.0)'})

PAGES = {
    'SV9a': ['https://asia.pokemon-card.com/tw/archive/special/card/sv9a/', 'https://asia.pokemon-card.com/tw/archive/special/card/sv9a/index.html'],
    'SV8': ['https://asia.pokemon-card.com/tw/archive/special/card/sv8/', 'https://asia.pokemon-card.com/tw/archive/special/card/sv8/index.html'],
    'SV4a': ['https://asia.pokemon-card.com/tw/archive/special/card/sv4a/', 'https://asia.pokemon-card.com/tw/archive/special/card/sv4a/index.html'],
    'SV2a': ['https://asia.pokemon-card.com/tw/archive/special/card/sv2a/', 'https://asia.pokemon-card.com/tw/archive/special/card/sv2a/index.html'],
    'S12a': ['https://asia.pokemon-card.com/tw/archive/special/card/s12a/', 'https://asia.pokemon-card.com/tw/archive/special/card/s12a/index.html'],
    'S8b': ['https://asia.pokemon-card.com/tw/archive/special/card/s8b/', 'https://asia.pokemon-card.com/tw/archive/special/card/s8b/index.html'],
    'S6a': ['https://asia.pokemon-card.com/tw/archive/special/card/s6a/', 'https://asia.pokemon-card.com/tw/archive/special/card/s6a/index.html'],
    'S5I': ['https://asia.pokemon-card.com/tw/archive/special/card/s5i/', 'https://asia.pokemon-card.com/tw/archive/special/card/s5i/index.html'],
}


def font(size: int, bold: bool = False):
    for p in [
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc' if bold else '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def download_image(url: str):
    try:
        r=S.get(url,timeout=35)
        if r.status_code != 200 or len(r.content)<200: return None
        im=Image.open(io.BytesIO(r.content)); im.load()
        return im.convert('RGBA'), r.content
    except Exception:
        return None

rows=[]
thumbs=[]
for code, urls in PAGES.items():
    page_url=''
    html=''
    status=''
    for url in urls:
        try:
            r=S.get(url,timeout=40)
            print(code,r.status_code,len(r.content),url)
            if r.status_code==200 and len(r.content)>1000:
                page_url=r.url; html=r.text; status=str(r.status_code); break
        except Exception as e:
            print(code,'ERR',url,e)
    if not html:
        rows.append({'code':code,'page':'','status':'missing','src':'','alt':'','width':'','height':'','mode':'','score':''})
        continue
    (OUT/f'{code}_page.html').write_text(html,encoding='utf-8')
    soup=BeautifulSoup(html,'html.parser')
    seen=set()
    candidates=[]
    for tag in soup.find_all(['img','source']):
        vals=[]
        for attr in ('data-src','data-lazy-src','src'):
            if tag.get(attr): vals.append(tag.get(attr))
        for attr in ('srcset','data-srcset'):
            if tag.get(attr):
                vals.extend(part.strip().split(' ')[0] for part in tag.get(attr).split(','))
        for raw in vals:
            src=urljoin(page_url,raw)
            if src in seen: continue
            seen.add(src)
            alt=tag.get('alt','') if tag.name=='img' else ''
            text=(src+' '+alt).lower()
            score=0
            if 'logo' in text: score+=150
            if 'title' in text: score+=100
            if 'headline' in text or 'head' in text: score+=60
            if 'main' in text or 'mv_' in text or '/mv' in text: score+=50
            if code.lower() in text: score+=35
            if any(x in text for x in ('card-img','_card','deck_shield','case','playmat','shinka','icon','arrow','btn','footer','header_logo')): score-=100
            candidates.append((score,src,alt))
    candidates.sort(reverse=True)
    for rank,(score,src,alt) in enumerate(candidates[:28],1):
        got=download_image(src)
        if not got: continue
        im,data=got
        ext='.png' if data[:8]==b'\x89PNG\r\n\x1a\n' else '.jpg'
        path=IMG/f'{code}_{rank:02d}_{re.sub(r"[^a-zA-Z0-9._-]+","-",Path(src.split("?")[0]).stem)[:60]}{ext}'
        path.write_bytes(data)
        alpha='yes' if im.getchannel('A').getextrema()[0] < 255 else 'no'
        row={'code':code,'page':page_url,'status':status,'rank':rank,'src':src,'alt':alt,'width':im.width,'height':im.height,'mode':im.mode,'alpha':alpha,'score':score,'file':str(path)}
        rows.append(row)
        if rank<=14:
            thumbs.append(row)

with (OUT/'assets.csv').open('w',newline='',encoding='utf-8-sig') as f:
    fields=sorted({k for r in rows for k in r.keys()})
    w=csv.DictWriter(f,fieldnames=fields); w.writeheader(); w.writerows(rows)
(OUT/'assets.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding='utf-8')

# labelled contact sheet
cols=4; cw=620; ch=420
canvas=Image.new('RGB',(cols*cw,((len(thumbs)+cols-1)//cols)*ch),'white')
d=ImageDraw.Draw(canvas); fc=font(24,True); fs=font(16)
for i,row in enumerate(thumbs):
    x=(i%cols)*cw; y=(i//cols)*ch
    d.rectangle((x,y,x+cw-1,y+ch-1),outline=(200,205,214),width=2)
    label=f"{row['code']} r{row['rank']} s{row['score']} {row['width']}x{row['height']} a:{row['alpha']}"
    d.text((x+10,y+8),label,font=fc,fill=(20,25,35))
    p=Path(row['file'])
    im=Image.open(p).convert('RGBA'); im.thumbnail((cw-30,300),Image.Resampling.LANCZOS)
    canvas.paste(im,(x+(cw-im.width)//2,y+50+(300-im.height)//2),im)
    name=Path(row['src'].split('?')[0]).name
    d.text((x+10,y+365),name[:68],font=fs,fill=(60,66,80))
canvas.save(OUT/'contact-sheet.jpg',quality=90)
print('pages',len(PAGES),'rows',len(rows),'thumbs',len(thumbs))
