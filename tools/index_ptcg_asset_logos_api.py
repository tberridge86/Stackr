#!/usr/bin/env python3
from pathlib import Path
import csv, io, math, os, requests
from PIL import Image, ImageDraw, ImageFont

OWNER='1niceroli'; REPO='ptcg-assets'; REF='main'
out=Path('artifacts/ptcg-logo-index-api'); logos=out/'logos'
logos.mkdir(parents=True,exist_ok=True)
s=requests.Session(); s.headers.update({'User-Agent':'Stackr-logo-index/1.0','Accept':'application/vnd.github+json'})
tree_url=f'https://api.github.com/repos/{OWNER}/{REPO}/git/trees/{REF}?recursive=1'
r=s.get(tree_url,timeout=60); r.raise_for_status(); data=r.json()
paths=[x['path'] for x in data.get('tree',[]) if x.get('type')=='blob' and x.get('path','').lower().endswith(('/logo.png','/logo.webp','/logo.jpg','/logo.jpeg'))]
rows=[]; items=[]
for idx,path in enumerate(sorted(paths),1):
    raw=f'https://raw.githubusercontent.com/{OWNER}/{REPO}/{REF}/{path}'
    try:
        rr=s.get(raw,timeout=45); rr.raise_for_status()
        im=Image.open(io.BytesIO(rr.content)); im.load(); rgba=im.convert('RGBA')
        alpha=rgba.getchannel('A').getextrema()[0] < 255
        key=path.rsplit('/',1)[0].replace('/','__')+'.png'
        dest=logos/key; rgba.save(dest,'PNG',optimize=True)
        rows.append([path,rgba.width,rgba.height,im.mode,alpha,key,raw])
        items.append((path,rgba.copy(),alpha))
        print(idx,'/',len(paths),path,rgba.size,'alpha',alpha,flush=True)
    except Exception as e:
        rows.append([path,'','','',False,'','ERROR '+repr(e)])
        print('FAIL',path,repr(e),flush=True)
with (out/'logo-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f); w.writerow(['source_path','width','height','mode','has_transparency','copied_file','source_url']); w.writerows(rows)
font=ImageFont.load_default(); cols,rrs,cw,ch=4,5,420,260; per=cols*rrs
for page in range(math.ceil(len(items)/per)):
    can=Image.new('RGB',(cols*cw,rrs*ch),'white'); d=ImageDraw.Draw(can)
    for i,(path,im,alpha) in enumerate(items[page*per:(page+1)*per]):
        x=(i%cols)*cw; y=(i//cols)*ch
        bg=Image.new('RGBA',(cw-20,ch-58),(242,242,242,255))
        scale=min((cw-55)/im.width,(ch-92)/im.height,1)
        thumb=im.resize((max(1,int(im.width*scale)),max(1,int(im.height*scale))),Image.Resampling.LANCZOS)
        bg.alpha_composite(thumb,((bg.width-thumb.width)//2,(bg.height-thumb.height)//2))
        can.paste(bg.convert('RGB'),(x+10,y+48))
        d.text((x+10,y+8),path[:60],fill='black',font=font)
        d.text((x+10,y+24),f'{im.width}x{im.height} alpha={alpha}',fill='black',font=font)
    can.save(out/f'contact-sheet-{page+1:02d}.jpg','JPEG',quality=90,optimize=True)
print('Indexed',len(items),'of',len(paths),'logo files',flush=True)
