"""Public image retrieval only. No generated artwork or production changes."""
from __future__ import annotations
import concurrent.futures as cf
import hashlib,io,json,re
from pathlib import Path
from urllib.parse import quote,urljoin,unquote
import requests
from PIL import Image
from bs4 import BeautifulSoup
OUT=Path('build/tc-published-recovery')
for d in ('images','metadata','pages'):(OUT/d).mkdir(parents=True,exist_ok=True)
HEAD={'User-Agent':'Mozilla/5.0','Referer':'https://wiki.52poke.com/'}
RAW='''SV10|火箭隊的榮耀
SV9a|熱風競技場
SV9|對戰搭檔
SV8a|太晶慶典ex
SV8|超電突圍
SV7a|樂園騰龍
SV7|星晶奇跡
SV6a|黑夜漫遊者
SV6|變幻假面
SV5a|緋紅薄霧
SV5K|狂野之力
SVHK|起始組合 古代故勒頓ex
SVHM|起始組合 未來密勒頓ex
SV5M|異度審判
SV4a|閃色寶藏ex
SV4K|古代咆哮
SV4M|未來閃光
SVEL|起始組合 太晶 骨紋巨聲鱷ex
SVEM|起始組合 太晶 超夢ex
SV3a|激狂駭浪
SV3|黯焰支配者
SVAL|起始組合ex 呆火鱷&電龍ex
SVAM|起始組合ex 新葉喵&路卡利歐ex
SVAW|起始組合ex 潤水鴨&謎擬Ｑex
SVF|牌組構築BOX 黯焰支配者
SVD|ex初階牌組
SV2a|寶可夢卡牌151
SVP1|ex特別組合
SVC|起始組合ex 皮卡丘ex&巴布土撥
SV2D|碟旋暴擊
SV2P|冰雪險境
SV1a|三連音爆
SVB|頂級訓練家收藏箱ex
SV1S|朱ex
SV1V|紫ex
S12a|天地萬物VSTAR
SV-P|SV-P特典卡
S12|思維激盪
SDL|V初階牌組 噴火龍
SDM|V初階牌組 超夢
SDP|V初階牌組 皮卡丘
SN|初階牌組100 特別版
S11a|白熱奧祕
SP6|VSTAR特別組合
SPD|VSTAR&VMAX 高級牌組 代歐奇希斯
SPZ|VSTAR&VMAX 高級牌組 捷拉奧拉
S11|迷途深淵
S10b|Pokémon GO
S10a|黑暗亡靈
S10D|時間觀察者
S10P|空間魔術師
S9a|對戰地區
SLD|起始組合VSTAR 達克萊伊
SLL|起始組合VSTAR 路卡利歐
SI|初階牌組100
S9|星星誕生
SJ|特別牌組組合 蒼響・藏瑪然特VS無極汰那
SK|頂級訓練家收藏箱 VSTAR
S8b|VMAX絕群壓軸
S8a|25週年收藏款
S8|匯流藝術
SCD|V起始牌組 強大
SP5|SP5
S7D|摩天巔峰
S7R|蒼空烈流
SH|寶可夢卡牌家庭組合
S6a|伊布英雄
SCC|V起始牌組 進化
S6H|銀白戰槍
S6K|漆黑幽魂
S5a|雙璧戰士
S5I|一撃大師
S5R|連撃大師
SCB|V起始牌組 挑戰
S4a|閃色明星V
SCA|V起始牌組 搭檔
S4|驚天伏特攻擊
SC2a|無極力量
SC2b|無極力量
SC2D|V起始牌組 無極力量
SC1a|劍&盾
SC1b|劍&盾
SC1D|V起始牌組 劍&盾'''
NAMES=dict(line.split('|',1) for line in RAW.splitlines())

def get(url):
 try:
  r=requests.get(url,headers=HEAD,timeout=(6,12));r.encoding='utf-8'
  return r if r.status_code==200 else None
 except Exception:return None

def save_image(code,url,description,source_page,kind):
 r=get(url)
 if r is None:return None
 try:
  im=Image.open(io.BytesIO(r.content));im.load()
  if im.width<70 or im.height<15:return None
 except Exception:return None
 digest=hashlib.sha256(r.content).hexdigest();ext={'PNG':'png','WEBP':'webp','JPEG':'jpg','GIF':'gif'}.get(im.format,'bin')
 file=f'images/{code}_{digest[:12]}.{ext}';(OUT/file).write_bytes(r.content)
 return {'code':code,'name':NAMES.get(code,''),'url':url,'description':description,'page_url':source_page,'kind':kind,'file':file,'width':im.width,'height':im.height,'sha256':digest}

def cdn_url(filename):
 name=filename.replace(' ','_');h=hashlib.md5(name.encode()).hexdigest()
 return f'https://s1.52poke.com/wiki/{h[0]}/{h[:2]}/'+quote(name,safe='')

def find_cdn(pair):
 code,name=pair;era='朱&紫' if code.startswith('SV') else '劍&盾'
 names=list(dict.fromkeys([name,name.replace(' ','').replace('撃','擊'),name.replace('祕','秘'),name.replace('Ｑ','Q')]))
 filenames=[f'TCG_{era}_{n}_繁中logo.png' for n in names]
 # Two earlier releases use a simple Chinese logo naming convention.
 if code.startswith('SC1') or code.startswith('SC2'):
  filenames.extend([f'TCG_{n}_繁中logo.png' for n in names])
 for filename in filenames:
  url=cdn_url(filename)
  x=save_image(code,url,filename,'https://wiki.52poke.com/zh-hant/'+quote(name+'（TCG）'),'published_tc_logo_cdn_candidate')
  if x:
   print('CDN FOUND',code,filename,x['width'],x['height'],flush=True);return [x]
 print('CDN MISS',code,flush=True);return []
results=[]
with cf.ThreadPoolExecutor(max_workers=4) as ex:
 for found in ex.map(find_cdn,NAMES.items()):results.extend(found)
(OUT/'metadata/cdn_results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))

# Official paired-set landing pages must use their actual joint URL (not sv5k or sv1s).
PAGES={
'SV10':'sv10','SV9':'sv9','SV8a':'sv8a','SV8':'sv8','SV7':'sv7','SV6':'sv6','SV5K':'sv5','SV5M':'sv5','SV4a':'sv4a','SV4K':'sv4','SV4M':'sv4','SV3':'sv3','SV2a':'sv2a','SV2D':'sv2','SV2P':'sv2','SV1S':'sv1','SV1V':'sv1','S12a':'s12a','S12':'s12','S11':'s11','S10b':'s10b','S10D':'s10','S10P':'s10','S9':'s9','S8b':'s8b','S8':'s8','S7D':'s7','S7R':'s7','S6a':'s6a','S6H':'s6','S6K':'s6','S5I':'s5','S5R':'s5','S4a':'s4a','S4':'s4'}

def official(pair):
 code,short=pair;url=f'https://asia.pokemon-card.com/tw/archive/special/card/{short}/';r=get(url)
 if r is None:return []
 (OUT/'pages'/f'{code}_official.html').write_text(r.text,encoding='utf-8')
 soup=BeautifulSoup(r.text,'html.parser');found=[]
 for img in soup.find_all('img'):
  src=img.get('src') or '';fn=src.rsplit('/',1)[-1].lower()
  # Banner/hero assets retained only as identity verification references, never auto-accepted logos.
  if any(w in fn for w in ('logo','hero-head','main-title','hero-visual','main-visual')) and not any(w in fn for w in ('header','footer','icon')):
   u=urljoin(r.url,src)
   x=save_image(code,u,img.get('alt',''),r.url,'official_publication_for_visual_review')
   if x:found.append(x)
 return found
with cf.ThreadPoolExecutor(max_workers=4) as ex:
 for found in ex.map(official,PAGES.items()):results.extend(found)
(OUT/'metadata/candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
(OUT/'metadata/requested.json').write_text(json.dumps(NAMES,ensure_ascii=False,indent=2))
print('FINISHED',len(results),'downloaded files',len(set(x['code'] for x in results)),'codes',flush=True)
