"""Bounded public image retrieval, retaining provenance. Never create or redraw a logo."""
from __future__ import annotations
import concurrent.futures as cf, hashlib,io,json,re
from pathlib import Path
from urllib.parse import quote,urljoin,unquote,urlparse
import requests
from PIL import Image
from bs4 import BeautifulSoup
from opencc import OpenCC
OUT=Path('build/tc-published-recovery-v4')
for d in ('images','metadata','pages'):(OUT/d).mkdir(parents=True,exist_ok=True)
H={'User-Agent':'Mozilla/5.0','Referer':'https://wiki.52poke.com/'}
TC=OpenCC('s2t')
NAMES={
'SCA':['搭档'], 'SCB':['挑战'],'SCC':['进化'],'SCD':['强大'],
'SC1D':['V起始牌组_剑&盾','V起始牌组剑&盾','剑&盾_V起始牌组'],
'SC2D':['V起始牌组_无极力量','V起始牌组无极力量','无极力量_V起始牌组'],
'S8a':['25周年收藏版','25周年收藏款','25th_ANNIVERSARY_COLLECTION'],
'SPD':['VSTAR&VMAX高级牌组_代欧奇希斯','VSTAR&VMAX_高级牌组_代欧奇希斯'],
'SPZ':['VSTAR&VMAX高级牌组_捷拉奥拉','VSTAR&VMAX_高级牌组_捷拉奥拉'],
'SN':['初阶牌组100特别版','初阶牌组100_特别版'],
'SK':['顶级训练家收藏箱_VSTAR','顶级训练家收藏箱VSTAR'],
'SVB':['顶级训练家收藏箱ex','頂級訓練家收藏箱ex'],
'SVF':['牌组构筑BOX_黯焰支配者','牌组构筑BOX黯焰支配者'],
'SVP1':['ex特别组合','Ex特别组合','ex_特别组合'],
'SP6':['VSTAR特别组合','VSTAR_特别组合'],
'SDL':['V初阶牌组_喷火龙','V初阶牌组喷火龙','喷火龙'],
'SDM':['V初阶牌组_超梦','V初阶牌组超梦','超梦'],
'SDP':['V初阶牌组_皮卡丘','V初阶牌组皮卡丘','皮卡丘'],
'SP5':['SP5'], 'SV-P':['SV-P特典卡','SV-P_特典卡']}

def get(u):
 try:
  r=requests.get(u,headers=H,timeout=(4,10));r.encoding='utf-8'
  return r if r.status_code==200 else None
 except Exception:return None

def image(code,u,desc,page,kind):
 r=get(u)
 if r is None:return None
 try:
  im=Image.open(io.BytesIO(r.content));im.load()
  if im.width<65 or im.height<15:return None
 except Exception:return None
 h=hashlib.sha256(r.content).hexdigest();ext={'PNG':'png','WEBP':'webp','JPEG':'jpg','GIF':'gif'}.get(im.format,'bin')
 p=f'images/{code}_{h[:12]}.{ext}';(OUT/p).write_bytes(r.content)
 return {'code':code,'url':u,'description':desc,'page_url':page,'kind':kind,'file':p,'width':im.width,'height':im.height,'sha256':h}

def archive(pair):
 code,names=pair;filenames=[]
 for n in names:
  for name in list(dict.fromkeys([n,TC.convert(n)])):
   filenames += [f'{name}_中文logo.png',f'TCG_{name}_中文logo.png',f'TCG_{name}_繁中logo.png',f'TCG_剑&盾_{name}_中文logo.png',f'TCG_朱&紫_{name}_繁中logo.png',f'{name}_繁中logo.png',f'TCG_剑&盾_{name}_繁中logo.png']
 for f in list(dict.fromkeys(filenames))[:35]:
  h=hashlib.md5(f.encode()).hexdigest();u=f'https://s1.52poke.com/wiki/{h[0]}/{h[:2]}/'+quote(f,safe='')
  x=image(code,u,f,'https://wiki.52poke.com/zh-hant/'+quote(names[0]+'（TCG）'),'published_logo_candidate')
  if x:print('FOUND',code,f,flush=True);return x
 print('MISS',code,flush=True)
 return {'code':code,'status':'no_standalone_archive_match','tested_filenames':filenames[:35]}
with cf.ThreadPoolExecutor(max_workers=4) as ex:results=list(ex.map(archive,NAMES.items()))
(OUT/'metadata/archive_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))

PAGES={
'SVB':['https://asia.pokemon-card.com/tw/archives/4686/'],
'SVP1':['https://asia.pokemon-card.com/tw/archives/5371/'],
'S8a':['https://card25th.portal-pokemon.com/tw/card/s8a/'],
'SDL':['https://asia.pokemon-card.com/hk/archives/2937/'],
'SPD':['https://asia.pokemon-card.com/tw/archive/special/card/spd-spz/'],
'SK':['https://asia.pokemon-card.com/tw/archive/special/card/sk/'],
'SN':['https://asia.pokemon-card.com/tw/archive/special/card/sn/']}

def page_assets(pair):
 code,urls=pair;found=[]
 for n,u in enumerate(urls):
  r=get(u)
  if r is None:continue
  soup=BeautifulSoup(r.text,'html.parser');(OUT/'pages'/f'{code}_{n}.html').write_text(r.text)
  main=soup.find('main') or soup
  images=[]
  for tag in main.find_all('img'):
   s=tag.get('src') or tag.get('data-src') or ''
   if not s:continue
   v=urljoin(r.url,s);file=urlparse(v).path.rsplit('/',1)[-1].lower()
   if any(t in file for t in ('logo','main','hero','title','head','pkg','product','banner','package','img_')):
    if not any(t in file for t in ('footer','header-logo','sns','icon','arrow','banner_s')):
     images.append((v,tag.get('alt','')))
  images=list(dict.fromkeys(images))[:12]
  for v,desc in images:
   x=image(code,v,desc,r.url,'official_publication_reference_pending_visual_review')
   if x:found.append(x)
  # Some standalone marks are defined in CSS backgrounds, not HTML image tags.
  cssurls=[urljoin(r.url,t['href']) for t in soup.find_all('link',href=True) if '.css' in t['href'] and not any(z in t['href'] for z in ('fonts.googleapis','common','normalize','reset'))][:3]
  for css in cssurls:
   cr=get(css)
   if cr is None:continue
   for rel in re.findall(r'url\([\s\"\']*([^\)\"\']+)',cr.text):
    if 'logo' not in rel.lower():continue
    v=urljoin(css,rel)
    x=image(code,v,rel,r.url,'official_css_logo_candidate')
    if x:found.append(x)
 return found
with cf.ThreadPoolExecutor(max_workers=4) as ex:
 for found in ex.map(page_assets,PAGES.items()):results.extend(found)
(OUT/'metadata/results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('FINAL',len(results),'records',sum('file' in x for x in results),'images',flush=True)
