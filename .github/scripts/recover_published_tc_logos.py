"""Read-only public-web asset recovery. No app, database, or deployment changes.
Downloaded images are candidates until visually reviewed; this script never creates logos.
"""
from __future__ import annotations
import concurrent.futures as cf
import hashlib, io, json, re, time
from pathlib import Path
from urllib.parse import quote, unquote, urljoin, urlparse
import requests
from bs4 import BeautifulSoup
from PIL import Image

OUT=Path('build/tc-published-recovery')
for d in ('images','pages','metadata'):(OUT/d).mkdir(parents=True,exist_ok=True)
HEAD={'User-Agent':'Mozilla/5.0 (compatible; SetLogoResearch/1.0; personal collection reference)'}
API='https://wiki.52poke.com/api.php'
NAMES={
'SV10':'火箭隊的榮耀','SV9a':'熱風競技場','SV9':'對戰搭檔','SV8a':'太晶慶典ex','SV8':'超電突圍','SV7a':'樂園騰龍','SV7':'星晶奇跡','SV6a':'黑夜漫遊者','SV6':'變幻假面','SV5a':'緋紅薄霧','SV5K':'狂野之力','SVHK':'古代故勒頓ex','SVHM':'未來密勒頓ex','SV5M':'異度審判','SV4a':'閃色寶藏ex','SV4K':'古代咆哮','SV4M':'未來閃光','SVEL':'起始組合 太晶 骨紋巨聲鱷ex','SVEM':'起始組合 太晶 超夢ex','SV3a':'激狂駭浪','SV3':'黯焰支配者','SVAL':'起始組合ex 呆火鱷&電龍ex','SVAM':'起始組合ex 新葉喵&路卡利歐ex','SVAW':'起始組合ex 潤水鴨&謎擬Ｑex','SVF':'牌組構築BOX 黯焰支配者','SVD':'ex初階牌組','SV2a':'寶可夢卡牌151','SVP1':'ex特別組合','SVC':'起始組合ex 皮卡丘ex&巴布土撥','SV2D':'碟旋暴擊','SV2P':'冰雪險境','SV1a':'三連音爆','SVB':'頂級訓練家收藏箱ex','SV1S':'朱ex','SV1V':'紫ex','S12a':'天地萬物VSTAR','SV-P':'SV-P特典卡','S12':'思維激盪','SDL':'V初階牌組 噴火龍','SDM':'V初階牌組 超夢','SDP':'V初階牌組 皮卡丘','SN':'初階牌組100 特別版','S11a':'白熱奧祕','SP6':'VSTAR特別組合','SPD':'VSTAR&VMAX 高級牌組 代歐奇希斯','SPZ':'VSTAR&VMAX 高級牌組 捷拉奧拉','S11':'迷途深淵','S10b':'Pokémon GO','S10a':'黑暗亡靈','S10D':'時間觀察者','S10P':'空間魔術師','S9a':'對戰地區','SLD':'起始組合VSTAR 達克萊伊','SLL':'起始組合VSTAR 路卡利歐','SI':'初階牌組100','S9':'星星誕生','SJ':'特別牌組組合 蒼響・藏瑪然特VS無極汰那','SK':'頂級訓練家收藏箱 VSTAR','S8b':'VMAX絕群壓軸','S8a':'25週年收藏款','S8':'匯流藝術','SCD':'V起始牌組 強大','SP5':'SP5','S7D':'摩天巔峰','S7R':'蒼空烈流','SH':'寶可夢卡牌家庭組合','S6a':'伊布英雄','SCC':'V起始牌組 進化','S6H':'銀白戰槍','S6K':'漆黑幽魂','S5a':'雙璧戰士','S5I':'一撃大師','S5R':'連撃大師','SCB':'V起始牌組 挑戰','S4a':'閃色明星V','SCA':'V起始牌組 搭檔','S4':'驚天伏特攻擊','SC2a':'無極力量','SC2b':'無極力量','SC2D':'V起始牌組 無極力量','SC1a':'劍&盾','SC1b':'劍&盾','SC1D':'V起始牌組 劍&盾'}

def get(url, params=None):
    try:
        r=requests.get(url,params=params,headers=HEAD,timeout=(6,16)); r.encoding='utf-8'
        if r.status_code==200:return r
        print('MISS',r.status_code,r.url,flush=True)
    except Exception as e:print('ERROR',url,str(e)[:120],flush=True)
    return None

def normal(t):
    return re.sub(r'[\s_&＆・·\-「」『』（）()]+','',t).lower().replace('撃','擊').replace('祕','秘').replace('ｑ','q')

def fullimg(url):
    url=urljoin('https://wiki.52poke.com',url)
    if '/thumb/' in url:
        x=url.split('/thumb/',1)
        url=x[0]+'/'+x[1].rsplit('/',1)[0]
    return url

def is_logo(text):
    t=unquote(text).lower()
    return ('logo' in t or '標誌' in t or '图标' in t or '圖標' in t) and not any(x in t for x in ('包裝','卡包','擴充包.png','広告','廣告','广告'))

def is_tc(text):
    t=unquote(text).lower()
    return any(x in t for x in ('繁中','繁體','繁体','中文logo','chinese','zh-tw','zh-hant')) and not any(x in t for x in ('简中','簡中','simplified'))

inventory=[]
for prefix in ('TCG ',):
    cont={}
    for page in range(12):
        r=get(API,{'action':'query','format':'json','list':'allimages','aiprefix':prefix,'ailimit':500,'aiprop':'url|size|sha1',**cont})
        if r is None:break
        try:j=r.json()
        except Exception:break
        batch=j.get('query',{}).get('allimages',[]);inventory.extend(batch)
        print('INVENTORY',page,len(batch),flush=True)
        if not j.get('continue'):break
        cont=j['continue']
(OUT/'metadata/inventory.json').write_text(json.dumps(inventory,ensure_ascii=False,indent=2))
print('TC LOGOS',len([i for i in inventory if is_logo(i['name']) and is_tc(i['name'])]),flush=True)

# Inspect each actual wiki article. Its infobox, not the navigation templates, is the matching scope.
def scrape_article(pair):
    code,name=pair
    url='https://wiki.52poke.com/zh-hant/'+quote(name+'（TCG）')
    r=get(url)
    if r is None:
        r=get('https://wiki.52poke.com/zh-hant/'+quote(code))
    if r is None:return {'code':code,'name':name,'error':'article not retrieved','assets':[],'official_links':[]}
    soup=BeautifulSoup(r.text,'html.parser')
    content=soup.select_one('.mw-parser-output') or soup
    (OUT/'pages'/f'{code}_wiki.html').write_text(str(content),encoding='utf-8')
    # Main info box always appears before the first content heading.
    candidates=[]
    official=[]
    for img in content.find_all('img'):
        # Restrict to the upper infobox, or images whose name explicitly identifies the requested set.
        src=img.get('data-src') or img.get('src') or ''
        desc=unquote(src)+' '+img.get('alt','')
        if not is_logo(desc):continue
        in_nav=bool(img.find_parent(class_=lambda c:c and ('navbox' in str(c) or 'catlinks' in str(c))))
        if in_nav:continue
        cand={'url':fullimg(src),'alt':img.get('alt',''),'language':'zh-Hant' if is_tc(desc) else 'other','page_url':r.url}
        if cand not in candidates:candidates.append(cand)
    for a in content.find_all('a',href=True):
        u=a['href']
        if 'asia.pokemon-card.com/' in u and ('/tw/' in u or '/hk/' in u):
            if u not in official:official.append(u)
    # Record code evidence / title for identity review, without trusting upstream names.
    title=soup.find('h1')
    return {'code':code,'name':name,'page_url':r.url,'article_title':title.get_text(' ',strip=True) if title else '', 'assets':candidates,'official_links':official[:8]}

with cf.ThreadPoolExecutor(max_workers=4) as ex:
    articles=list(ex.map(scrape_article,NAMES.items()))
(OUT/'metadata/articles.json').write_text(json.dumps(articles,ensure_ascii=False,indent=2))

assets=[]
for a in articles:
    own=[x for x in a['assets'] if x['language']=='zh-Hant']
    # Inventory name matching is a discovery aid only; all resulting images require visual review.
    name=a['name']; key=normal(name)
    for i in inventory:
        if is_logo(i['name']) and is_tc(i['name']) and key in normal(i['name']):
            own.append({'url':i['url'],'alt':i['name'],'language':'zh-Hant','page_url':i.get('descriptionurl',''),'discovery':'inventory_name_match'})
    seen=set()
    for x in own:
        if x['url'] in seen:continue
        seen.add(x['url']);assets.append({'code':a['code'],**x})
    print('ARTICLE',a['code'],a.get('article_title'),len(own),'Chinese logo candidates',flush=True)

# Also inspect official standalone-logo image tags and CSS artwork references, including paired sets.
# Do not classify an image as a logo merely because the page is official.
seeds={
'SV8a':['https://asia.pokemon-card.com/tw/archive/special/card/sv8a/'],
'SV1S':['https://asia.pokemon-card.com/tw/archive/special/card/sv1/'],
'SV1V':['https://asia.pokemon-card.com/tw/archive/special/card/sv1/'],
'S12a':['https://asia.pokemon-card.com/tw/archive/special/card/s12a/'],
'S8b':['https://asia.pokemon-card.com/tw/archive/special/card/s8b/']}

def official_scrape(a):
    code=a['code']; urls=list(dict.fromkeys(a.get('official_links',[])+seeds.get(code,[])))[:3]
    found=[]
    for n,url in enumerate(urls):
        r=get(url)
        if r is None:continue
        (OUT/'pages'/f'{code}_official_{n}.html').write_text(r.text,encoding='utf-8')
        soup=BeautifulSoup(r.text,'html.parser')
        for img in soup.find_all('img'):
            src=img.get('data-src') or img.get('src') or ''
            if not src:continue
            u=urljoin(r.url,src);f=unquote(urlparse(u).path).rsplit('/',1)[-1].lower()
            if ('logo' in f or re.search(r'(?:hero|main)[-_](?:head|title)',f)) and not any(x in f for x in ('header','footer','pokemon','sns','menu')):
                found.append({'code':code,'url':u,'alt':img.get('alt',''),'language':'zh-Hant','page_url':r.url,'discovery':'official_candidate'})
    return found
with cf.ThreadPoolExecutor(max_workers=4) as ex:
    for found in ex.map(official_scrape,articles):assets.extend(found)

# Deduplicate URLs per code; download actual bytes, preserve original files and provenance.
unique={}
for x in assets:unique[(x['code'],x['url'])]=x
assets=list(unique.values())
def download_asset(x):
    r=get(x['url'])
    if r is None:return {**x,'error':'image request failed'}
    try:
        im=Image.open(io.BytesIO(r.content));im.load()
        if im.width<70 or im.height<15:raise ValueError('too small')
    except Exception as e:return {**x,'error':str(e)}
    digest=hashlib.sha256(r.content).hexdigest()
    ext={'PNG':'png','JPEG':'jpg','WEBP':'webp','GIF':'gif'}.get(im.format,'bin')
    file=f"images/{x['code']}_{digest[:12]}.{ext}"
    (OUT/file).write_bytes(r.content)
    return {**x,'file':file,'sha256':digest,'width':im.width,'height':im.height,'mode':im.mode}
with cf.ThreadPoolExecutor(max_workers=4) as ex:
    results=list(ex.map(download_asset,assets))
(OUT/'metadata/candidates.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
(OUT/'metadata/requested.json').write_text(json.dumps(NAMES,ensure_ascii=False,indent=2))
print('FINISHED',len(results),'candidates;',sum('file' in x for x in results),'downloaded;',len(set(x['code'] for x in results if 'file' in x)),'codes',flush=True)
