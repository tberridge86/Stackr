#!/usr/bin/env python3
"""Bounded logo/source evidence only; never grants publication approval."""
import concurrent.futures as cf, hashlib,io,json,re
from pathlib import Path
from urllib.parse import urljoin,urlparse,unquote,parse_qs,quote
import requests
from bs4 import BeautifulSoup
from PIL import Image,ImageOps
OUT=Path('chinese-logo-evidence')
for d in ['images','references','pages']:(OUT/d).mkdir(parents=True,exist_ok=True)
H={'User-Agent':'Mozilla/5.0'}
HOSTS={'mtcg.pl','s3.mtcg.pl','www.pokemon.cn','image.pokemon.com.cn','asia.pokemon-card.com','wiki.52poke.com','s1.52poke.com','card25th.portal-pokemon.com'}
def get(u):
 if urlparse(u).hostname not in HOSTS:return None
 try:
  r=requests.get(u,headers=H,timeout=(4,12))
  return r if r.status_code==200 and urlparse(r.url).hostname in HOSTS else None
 except requests.RequestException:return None

def save(code,u,page,kind,alt):
 r=get(u)
 if r is None or len(r.content)>12000000:return None
 try:
  im=Image.open(io.BytesIO(r.content));im.load()
  if im.width<60 or im.height<20:return None
 except Exception:return None
 digest=hashlib.sha256(r.content).hexdigest();ext={'PNG':'png','JPEG':'jpg','WEBP':'webp'}.get(im.format)
 if not ext:return None
 fn=f'images/{code}_{digest[:12]}.{ext}';(OUT/fn).write_bytes(r.content)
 return {'code':code,'url':u,'page_url':page,'kind':kind,'alt':alt,'file':fn,'width':im.width,'height':im.height,'sha256':digest,'review_status':'pending'}
SC=[('csv10c','chasing-glory-together',20012),('csv9.5c','terastal-gathering',21997),('csv9c','stellar-crystal',21383),('csv8c','brilliant-illusions',20627),('csv7c','blade-awakened',19812),('csv6c','paradox-veil',19640),('csv5c','dark-crystal-blaze',15453),('csv4c','bonus-round',15488),('csv3c','fearless-terastal',15519),('csv2c','miracle-journey',15556),('csv1c','eternal-beginnings',15585),('151c','collect-151',15584)]
def sc_task(row):
 code,slug,aid=row;u='https://mtcg.pl/pokemon-cn/'+slug;r=get(u);result=[]
 if r is not None:
  soup=BeautifulSoup(r.content,'html.parser');(OUT/'pages'/f'{code}_copy.html').write_bytes(r.content)
  for im in soup.find_all('img'):
   alt=im.get('alt','');src=im.get('src') or ''
   if 'logo' not in alt.lower() or not src:continue
   src=urljoin(r.url,src)
   if '/_next/image' in src:
    src=parse_qs(urlparse(src).query).get('url',[src])[0]
    src=urljoin(r.url,src)
   x=save(code,src,r.url,'independently_hosted_logo_candidate',alt)
   if x:result.append(x)
 pub=f'https://www.pokemon.cn/tcg/product/{aid}.html';r=get(pub)
 if r is not None:
  soup=BeautifulSoup(r.content,'html.parser');(OUT/'pages'/f'{code}_publisher.html').write_bytes(r.content)
  main=soup.find('main') or soup.find('article') or soup
  candidates=[]
  for im in main.find_all('img'):
   src=im.get('data-src') or im.get('src') or ''
   if '/wp-content/uploads/' not in src:continue
   if any(z in src for z in ['46b2c1919aa40bca43e31089e4fdb30b','bf144cba479c62cb1c6fd1ff4bce6820']):continue
   if src not in candidates:candidates.append(src)
  for src in candidates[:3]:
   x=save(code,urljoin(pub,src),pub,'publisher_reference_not_logo',soup.title.get_text() if soup.title else '')
   if x:result.append(x)
 print('SC EVIDENCE',code,len(result),flush=True);return result
with cf.ThreadPoolExecutor(max_workers=5) as pool:results=[r for group in pool.map(sc_task,SC) for r in group]
(OUT/'sc-evidence.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))

rows=json.loads(Path('tc-source/metadata/results.json').read_text())
def tc_task(row):
 if 'file' not in row:return []
 code=row['code'];filename=row.get('filename_on_source','');u='https://wiki.52poke.com/wiki/File:'+quote(filename,safe='');r=get(u)
 if r is None:return []
 s=BeautifulSoup(r.content,'html.parser');main=s.select_one('.mw-parser-output') or s
 (OUT/'pages'/f'tc_{code}_file.html').write_bytes(r.content)
 links=list(dict.fromkeys(urljoin(u,a['href']) for a in main.find_all('a',href=True) if urlparse(urljoin(u,a['href'])).hostname in {'asia.pokemon-card.com','www.pokemon.cn','card25th.portal-pokemon.com'}))
 rec={'code':code,'source_file_page':u,'file_page_text':main.get_text(' ',strip=True)[:5000],'publisher_links':links}
 (OUT/'references'/f'{code}.json').write_text(json.dumps(rec,ensure_ascii=False,indent=2))
 return rec
with cf.ThreadPoolExecutor(max_workers=5) as pool:refs=list(pool.map(tc_task,rows))
(OUT/'tc-file-evidence.json').write_text(json.dumps(refs,ensure_ascii=False,indent=2))
print('FINAL',len(results),'SC evidence objects',sum(bool(r) for r in refs),'TC file records',flush=True)
