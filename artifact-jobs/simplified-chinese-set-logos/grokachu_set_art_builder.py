#!/usr/bin/env python3
from __future__ import annotations

import csv, io, math, re, hashlib, zipfile
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageOps
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'grokachu-output'; IMG=OUT/'images'
MANIFEST=ROOT/'sets.tsv'
INDEX='https://grokachu.fr/en/collections'
UA='Mozilla/5.0 StackR-set-art-audit/1.0'
S=requests.Session(); S.headers.update({'User-Agent':UA})

def norm(s:str)->str: return re.sub(r'[^a-z0-9]','',s.lower())
def get(url:str):
 r=S.get(url,timeout=25); r.raise_for_status(); return r

def rows():
 with MANIFEST.open(encoding='utf-8-sig') as f:
  return list(csv.DictReader(f,delimiter='\t'))

def image_urls_from_index(html:str):
 found={}
 # Sources may occur in escaped Next.js payloads or ordinary attributes.
 text=html.replace('\\/','/')
 for m in re.finditer(r'(?:https://grokachu\.fr)?(/media/tcg/([^/]+)/images/sets/([^?"\'<>\\ ]+?\.(?:webp|png|jpe?g)))',text,re.I):
  rel,folder,file=m.groups(); url=urljoin(INDEX,rel)
  found.setdefault(folder.lower(),[]).append(url)
 return found

def candidates(code,indexed):
 variants=[]
 def add(x):
  if x and x not in variants: variants.append(x)
 add(code.lower()); add(code.lower().replace('.','')); add(code.lower().replace('-',''))
 # Prefer exact folders discovered on the collections page; then normalized matches.
 for key in indexed:
  if key==code.lower(): add(key)
 for key in indexed:
  if norm(key)==norm(code): add(key)
 urls=[]
 for v in variants:
  for u in indexed.get(v,[]):
   if u not in urls: urls.append(u)
  for ext in ('webp','png','jpg'):
   u=f'https://grokachu.fr/media/tcg/{v}/images/sets/{v}.{ext}'
   if u not in urls: urls.append(u)
 return urls

def save_png(data,dst):
 im=Image.open(io.BytesIO(data)); im.load(); im=ImageOps.exif_transpose(im).convert('RGBA')
 bbox=im.getchannel('A').getbbox()
 if bbox: im=im.crop(bbox)
 if max(im.size)>1000:
  scale=1000/max(im.size); im=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
 dst.parent.mkdir(parents=True,exist_ok=True); im.save(dst,'PNG',optimize=True)
 return im.width,im.height,hashlib.sha256(dst.read_bytes()).hexdigest()

def wrap(pdf,text,maxw,font,size,maxlines=2):
 lines=[]; cur=''
 for ch in text:
  if cur and pdfmetrics.stringWidth(cur+ch,font,size)>maxw:
   lines.append(cur); cur=ch
   if len(lines)>=maxlines: break
  else: cur+=ch
 if len(lines)<maxlines and cur: lines.append(cur)
 if len(''.join(lines))<len(text) and lines:
  while lines[-1] and pdfmetrics.stringWidth(lines[-1]+'…',font,size)>maxw: lines[-1]=lines[-1][:-1]
  lines[-1]+='…'
 return lines

def build_pdf(results):
 pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
 W,H=landscape(A4); mx=24; mt=22; foot=22; gx=12; gy=10
 cw=(W-2*mx-gx)/2; ch=(H-mt-foot-2*gy)/3
 c=canvas.Canvas(str(OUT/'grokachu_set_art_6_per_page.pdf'),pagesize=(W,H))
 for p in range(math.ceil(len(results)/6)):
  for slot,r in enumerate(results[p*6:p*6+6]):
   col,row=slot%2,slot//2; x=mx+col*(cw+gx); y=H-mt-(row+1)*ch-row*gy
   c.setFillColor(colors.HexColor('#FBFCFE')); c.setStrokeColor(colors.HexColor('#D7DCE5')); c.roundRect(x,y,cw,ch,8,fill=1,stroke=1)
   c.setFont('Helvetica',5.5); c.setFillColor(colors.HexColor('#667085'))
   c.drawString(x+8,y+ch-11,'DEDICATED SET ART' if r['status']=='retrieved' else 'NO DEDICATED SET ART FOUND')
   c.drawRightString(x+cw-8,y+ch-11,f"{r['order']:03d}")
   bottom=y+48; top=y+ch-16; bw=cw-36; bh=top-bottom; cx=x+cw/2; cy=bottom+bh/2
   if r['local_file']:
    path=OUT/r['local_file']; im=Image.open(path); iw,ih=im.size; s=min(bw/iw,bh/ih); dw,dh=iw*s,ih*s
    c.drawImage(ImageReader(str(path)),cx-dw/2,cy-dh/2,dw,dh,preserveAspectRatio=True,mask='auto')
   else:
    c.setFillColor(colors.HexColor('#F2F4F7')); c.setStrokeColor(colors.HexColor('#CBD0D8')); c.roundRect(cx-bw*.34,cy-bh*.34,bw*.68,bh*.68,8,fill=1,stroke=1)
    c.setFillColor(colors.HexColor('#667085')); c.setFont('Helvetica-Bold',8); c.drawCentredString(cx,cy,'NO MATCH')
   code=r['code']; badge=max(58,pdfmetrics.stringWidth(code,'Helvetica-Bold',8)+18)
   c.setFillColor(colors.HexColor('#E9EDF4')); c.roundRect(cx-badge/2,y+30,badge,14,7,fill=1,stroke=0)
   c.setFillColor(colors.HexColor('#111827')); c.setFont('Helvetica-Bold',8); c.drawCentredString(cx,y+34,code)
   c.setFont('STSong-Light',7.2)
   for i,line in enumerate(wrap(c,r['name'],cw-20,'STSong-Light',7.2)): c.drawCentredString(cx,y+21-i*8.2,line)
  c.setFillColor(colors.HexColor('#667085')); c.setFont('Helvetica',7); c.drawString(mx,10,'Dedicated catalogue set artwork - exact supplied order - six per page'); c.drawRightString(W-mx,10,f'Page {p+1} of {math.ceil(len(results)/6)}'); c.showPage()
 c.save()

def main():
 OUT.mkdir(exist_ok=True); IMG.mkdir(exist_ok=True)
 manifest=rows(); html=get(INDEX).text; indexed=image_urls_from_index(html)
 results=[]
 for i,item in enumerate(manifest,1):
  code=item['code'].strip(); name=item['name'].strip(); hit=''; dims=(0,0,''); errors=[]
  for url in candidates(code,indexed):
   try:
    r=get(url)
    if not r.content.startswith((b'RIFF',b'\x89PNG',b'\xff\xd8')): continue
    dst=IMG/f'{i:03d}_{re.sub(r"[^A-Za-z0-9._-]","_",code)}.png'; dims=save_png(r.content,dst); hit=url; break
   except Exception as e: errors.append(type(e).__name__)
  results.append({'order':i,'code':code,'name':name,'status':'retrieved' if hit else 'missing','source_url':hit,'local_file':f'images/{dst.name}' if hit else '','width':dims[0],'height':dims[1],'sha256':dims[2],'notes':','.join(errors[:5])})
  print(f'[{i:03d}/{len(manifest):03d}] {code:<14} {results[-1]["status"]}',flush=True)
 with (OUT/'grokachu_set_art_report.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=results[0].keys()); w.writeheader(); w.writerows(results)
 with (OUT/'grokachu_indexed_folders.csv').open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.writer(f); w.writerow(['folder','image_url'])
  for folder,urls in sorted(indexed.items()):
   for u in urls: w.writerow([folder,u])
 build_pdf(results)
 with zipfile.ZipFile(OUT/'grokachu_set_art_images.zip','w',zipfile.ZIP_DEFLATED,compresslevel=8) as z:
  for r in results:
   if r['local_file']: z.write(OUT/r['local_file'],arcname=r['local_file'])
  z.write(OUT/'grokachu_set_art_report.csv',arcname='grokachu_set_art_report.csv')
 print({'requested':len(results),'retrieved':sum(r['status']=='retrieved' for r in results),'missing':sum(r['status']=='missing' for r in results)},flush=True)
if __name__=='__main__': main()
