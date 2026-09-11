#!/usr/bin/env python3
from __future__ import annotations

import csv, io, math, re, zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup, Tag
from PIL import Image, ImageOps, UnidentifiedImageError
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfgen import canvas

ROOT=Path(__file__).resolve().parent
OUT=ROOT/'official-candidate-audit'; IMG=OUT/'images'
ARTICLES={
 '20828': ('Master decks 2026', 'https://www.pokemon.cn/tcg/product/20828.html', 'csvm2ac,csvm2bc,csvm2cc'),
 '19759': ('Master decks 2025', 'https://www.pokemon.cn/tcg/product/19759.html', 'csvm1ac,csvm1bc,csvm1cc'),
 '15463': ('Battle Party Yaomeng', 'https://www.pokemon.cn/tcg/product/15463.html', 'csve2c,csve2pc'),
 '15512': ('Battle Party Gongmeng', 'https://www.pokemon.cn/tcg/product/15512.html', 'csve1c,csve1pc'),
 '21608': ('30th anniversary promos', 'https://www.pokemon.cn/tcg/product/21608.html', 'promo-30th-p'),
 '15585': ('Scarlet Violet launch promos', 'https://www.pokemon.cn/tcg/product/15585.html', 'promo-sv-p'),
 '15831': ('Brave Stars deck box', 'https://www.pokemon.cn/tcg/product/15831.html', 'csnc'),
 '15872': ('Starter deck 100', 'https://www.pokemon.cn/tcg/product/15872.html', 'cs4dac'),
 '16282': ('Battle Party combinations', 'https://www.pokemon.cn/tcg/product/16282.html', 'csmpjc,csmpkc,csmplc,csmpmc,csmpnc,csmpoc,csmppc,csmpqc,csmpac,csmpbc,csmpcc,csmpdc,csmpec,csmpfc,csmpgc,csmphc,csmpic'),
 '16070': ('Sword Shield starter decks', 'https://www.pokemon.cn/tcg/product/16070.html', 'cs3dc'),
 '16268': ('Sword Shield promo series', 'https://www.pokemon.cn/tcg/product/16268.html', 'promo-s-p'),
 '16348': ('Eevee GX gift box', 'https://www.pokemon.cn/tcg/product/16348.html', 'csmyc'),
 '16363': ('Lillie gift box', 'https://www.pokemon.cn/tcg/product/16363.html', 'csmlc'),
 '16368': ('Sun Moon launch promos', 'https://www.pokemon.cn/tcg/product/16368.html', 'promo-sm-p'),
}
S=requests.Session(); S.headers.update({'User-Agent':'Mozilla/5.0 StackR-official-product-audit/1.0','Accept-Language':'zh-CN,zh;q=0.9,en;q=0.5'})

def get(url,referer=''):
 r=S.get(url,timeout=35,headers={'Referer':referer} if referer else None); r.raise_for_status(); return r

def clean(s): return re.sub(r'\s+',' ',s or '').strip()
def stable(url):
 p=urlparse(url); return urlunparse((p.scheme,p.netloc,p.path,'','',''))

def image_url(tag:Tag,page:str):
 for attr in ('data-src','data-original','data-lazy-src','data-url','src'):
  v=tag.get(attr)
  if isinstance(v,str) and v.strip() and not v.startswith('data:'): return urljoin(page,v.strip())
 srcset=tag.get('srcset')
 if isinstance(srcset,str) and srcset.strip(): return urljoin(page,srcset.split(',')[-1].strip().split()[0])
 return ''

def parse_page(article_id,title,url,codes):
 r=get(url); soup=BeautifulSoup(r.text,'html.parser')
 for tag in soup.find_all(['script','style','noscript','svg','nav','footer']): tag.decompose()
 root=soup.find('main') or soup.find('article') or soup.body or soup
 nodes=[]
 selected=root.find_all(['h1','h2','h3','h4','h5','h6','p','td','th','li','figcaption','img'])
 for tag in selected:
  if tag.name=='img':
   u=image_url(tag,url)
   if u and re.search(r'\.(?:png|jpe?g|webp|gif)(?:$|\?)',u,re.I): nodes.append(('image',u,clean(str(tag.get('alt') or tag.get('title') or ''))))
  else:
   if tag.find(['h1','h2','h3','h4','h5','h6','p','td','th','li'],recursive=False): continue
   text=clean(tag.get_text(' ',strip=True))
   if text: nodes.append(('text',text,''))
 # Add OG hero if absent
 for meta in soup.find_all('meta'):
  prop=str(meta.get('property') or meta.get('name') or '').lower(); v=str(meta.get('content') or '').strip()
  if prop in {'og:image','twitter:image','twitter:image:src'} and v: nodes.append(('image',urljoin(url,v),'OpenGraph'))
 # de-duplicate while preserving DOM order
 out=[]; seen=set()
 for pos,(kind,value,alt) in enumerate(nodes):
  if kind!='image': continue
  key=stable(value)
  if key in seen: continue
  seen.add(key)
  before=[nodes[j][1] for j in range(max(0,pos-4),pos) if nodes[j][0]=='text']
  after=[nodes[j][1] for j in range(pos+1,min(len(nodes),pos+5)) if nodes[j][0]=='text']
  out.append({'article_id':article_id,'article_title':title,'article_url':url,'target_codes':codes,'dom_index':pos,'image_url':value,'alt':alt,'near_before':' | '.join(before)[-500:],'near_after':' | '.join(after)[:500]})
 return out

def save(data,path):
 im=Image.open(io.BytesIO(data)); im.load(); im=ImageOps.exif_transpose(im).convert('RGBA')
 bbox=im.getchannel('A').getbbox()
 if bbox: im=im.crop(bbox)
 if max(im.size)>1200:
  s=1200/max(im.size); im=im.resize((max(1,round(im.width*s)),max(1,round(im.height*s))),Image.Resampling.LANCZOS)
 path.parent.mkdir(parents=True,exist_ok=True); im.save(path,'PNG',optimize=True)
 return im.width,im.height

def cjk_lines(pdf,text,maxw,size,maxlines):
 lines=[]; cur=''
 for ch in text:
  if cur and pdfmetrics.stringWidth(cur+ch,'STSong-Light',size)>maxw:
   lines.append(cur); cur=ch
   if len(lines)>=maxlines: break
  else: cur+=ch
 if len(lines)<maxlines and cur: lines.append(cur)
 if len(''.join(lines))<len(text) and lines: lines[-1]+='…'
 return lines

def pdf(rows):
 pdfmetrics.registerFont(UnicodeCIDFont('STSong-Light'))
 W,H=landscape(A4); mx=24; mt=24; footer=20; gx=10; gy=10; cols=3; gr=2; per=6
 cw=(W-2*mx-gx*(cols-1))/cols; ch=(H-mt-footer-gy)/gr
 c=canvas.Canvas(str(OUT/'official_candidate_contact_sheet.pdf'),pagesize=(W,H)); c.setTitle('Official product candidate audit')
 for p in range(math.ceil(len(rows)/per)):
  page=rows[p*per:p*per+per]
  for slot,r in enumerate(page):
   col,row=slot%cols,slot//cols; x=mx+col*(cw+gx); y=H-mt-(row+1)*ch-row*gy
   c.setFillColor(colors.HexColor('#FBFCFE')); c.setStrokeColor(colors.HexColor('#D7DCE5')); c.roundRect(x,y,cw,ch,7,fill=1,stroke=1)
   c.setFont('Helvetica-Bold',7); c.setFillColor(colors.HexColor('#111827')); c.drawString(x+7,y+ch-12,f"{r['article_id']}-{int(r['candidate_no']):02d}")
   c.setFont('Helvetica',5.3); c.setFillColor(colors.HexColor('#667085')); c.drawRightString(x+cw-7,y+ch-12,f"{r['width']} x {r['height']}")
   ib=x+10; iy=y+55; iw=cw-20; ih=ch-75
   path=OUT/r['local_file']; im=Image.open(path); sw,sh=im.size; s=min(iw/sw,ih/sh); dw,dh=sw*s,sh*s
   c.drawImage(ImageReader(str(path)),x+cw/2-dw/2,iy+(ih-dh)/2,dw,dh,preserveAspectRatio=True,mask='auto')
   c.setFont('Helvetica',5.2); c.setFillColor(colors.HexColor('#475467')); c.drawCentredString(x+cw/2,y+45,r['target_codes'][:58])
   context=clean((r['near_before']+' | '+r['near_after']).strip(' |'))
   c.setFont('STSong-Light',5.4); c.setFillColor(colors.HexColor('#344054'))
   for i,line in enumerate(cjk_lines(c,context,cw-14,5.4,4)): c.drawString(x+7,y+34-i*6.2,line)
  c.setFont('Helvetica',6); c.setFillColor(colors.HexColor('#667085')); c.drawString(mx,9,'Official pokemon.cn image candidates - labels are article ID and candidate number'); c.drawRightString(W-mx,9,f'Page {p+1} of {math.ceil(len(rows)/per)}'); c.showPage()
 c.save()

def main():
 OUT.mkdir(exist_ok=True); IMG.mkdir(exist_ok=True); rows=[]
 for aid,(title,url,codes) in ARTICLES.items():
  candidates=parse_page(aid,title,url,codes); kept=0
  for idx,cand in enumerate(candidates,1):
   try:
    response=get(cand['image_url'],url)
    if 'text/html' in response.headers.get('content-type','').lower() or len(response.content)<250: continue
    path=IMG/f'{aid}_{idx:02d}.png'; w,h=save(response.content,path)
    if max(w,h)<180:
     path.unlink(missing_ok=True); continue
    kept+=1; cand.update({'candidate_no':idx,'width':w,'height':h,'local_file':f'images/{path.name}'})
    rows.append(cand)
   except (requests.RequestException,UnidentifiedImageError,OSError,ValueError): pass
  print(f'{aid}: {kept} candidates',flush=True)
 with (OUT/'official_candidate_report.csv').open('w',encoding='utf-8-sig',newline='') as f:
  fields=['article_id','candidate_no','article_title','article_url','target_codes','dom_index','image_url','width','height','alt','near_before','near_after','local_file']
  w=csv.DictWriter(f,fieldnames=fields,extrasaction='ignore'); w.writeheader(); w.writerows(rows)
 pdf(rows)
 with zipfile.ZipFile(OUT/'official_candidate_images.zip','w',zipfile.ZIP_DEFLATED,compresslevel=8) as z:
  for r in rows: z.write(OUT/r['local_file'],arcname=r['local_file'])
  z.write(OUT/'official_candidate_report.csv',arcname='official_candidate_report.csv')
 print({'articles':len(ARTICLES),'candidates':len(rows),'pages':math.ceil(len(rows)/6)},flush=True)
if __name__=='__main__': main()
