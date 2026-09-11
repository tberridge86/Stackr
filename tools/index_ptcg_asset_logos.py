#!/usr/bin/env python3
from pathlib import Path
import csv, math, shutil
from PIL import Image, ImageDraw, ImageFont

repo=Path('/tmp/ptcg-assets')
out=Path('artifacts/ptcg-logo-index')
logos=out/'logos'
logos.mkdir(parents=True,exist_ok=True)
rows=[]
for p in sorted(repo.rglob('logo.*')):
    if p.suffix.lower() not in {'.png','.webp','.jpg','.jpeg'}: continue
    rel=p.relative_to(repo)
    try:
        im=Image.open(p); im.load()
        w,h=im.size
        mode=im.mode
        alpha=False
        if 'A' in mode:
            alpha=im.getchannel('A').getextrema()[0] < 255
        dest=logos/(str(rel.parent).replace('/','__')+'.png')
        im.convert('RGBA').save(dest,'PNG',optimize=True)
        rows.append((str(rel),w,h,mode,alpha,str(dest.relative_to(out))))
    except Exception as e:
        rows.append((str(rel),'','','',False,'ERROR '+repr(e)))
with (out/'logo-index.csv').open('w',encoding='utf-8-sig',newline='') as f:
    wr=csv.writer(f); wr.writerow(['source_path','width','height','mode','has_transparency','copied_file']); wr.writerows(rows)

items=[]
for rel,w,h,mode,alpha,copied in rows:
    if not copied.startswith('logos/'): continue
    try: items.append((rel,Image.open(out/copied).convert('RGBA'),w,h,alpha))
    except: pass
font=ImageFont.load_default()
cols,rows_per=4,5
cw,ch=420,260
per=cols*rows_per
for page in range(math.ceil(len(items)/per)):
    can=Image.new('RGB',(cols*cw,rows_per*ch),'white'); d=ImageDraw.Draw(can)
    for i,(rel,im,w,h,alpha) in enumerate(items[page*per:(page+1)*per]):
        x=(i%cols)*cw; y=(i//cols)*ch
        bg=Image.new('RGBA',(cw-20,ch-58),(242,242,242,255))
        s=min((cw-55)/im.width,(ch-92)/im.height,1)
        th=im.resize((max(1,int(im.width*s)),max(1,int(im.height*s))),Image.Resampling.LANCZOS)
        bg.alpha_composite(th,((bg.width-th.width)//2,(bg.height-th.height)//2))
        can.paste(bg.convert('RGB'),(x+10,y+48))
        d.text((x+10,y+8),rel[:58],fill='black',font=font)
        d.text((x+10,y+24),f'{w}x{h} alpha={alpha}',fill='black',font=font)
    can.save(out/f'contact-sheet-{page+1:02d}.jpg','JPEG',quality=90,optimize=True)
print('Indexed',len(items),'logos')
