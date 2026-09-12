from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import shutil
import textwrap
import time
import zipfile
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path('build/traditional-chinese-set-logos')
INDIVIDUAL = OUT / 'individual'
PAGES = OUT / 'pages'
CACHE = Path('build/tc-logo-cache')
for directory in (OUT, INDIVIDUAL, PAGES, CACHE):
    directory.mkdir(parents=True, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update({
    'User-Agent': 'Mozilla/5.0 (compatible; StackrTraditionalChineseLogoBuilder/2.0)',
    'Accept': 'text/html,application/xhtml+xml,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
})

@dataclass(frozen=True)
class Item:
    code: str
    supplied_name: str
    display_name: str

RAW = [
('SV10','Destined Rivals'),('SV9a','熱風競技場'),('SV9','對戰搭檔'),('SV8a','太晶慶典ex'),('SV8','超電突圍'),
('SV7a','樂園騰龍'),('SV7','星晶奇跡'),('SV6a','黑夜漫遊者'),('SV6','變幻假面'),('SV5a','緋紅薄霧'),
('SV5K','Wild Force'),('SVHK','未來密勒頓ex'),('SVHM','閃色寶藏ex'),('SV5M','異度審判'),('SV4a','閃色寶藏ex'),
('SV4K','古代咆哮'),('SV4M','未來閃光'),('SVEL','骨紋巨聲鱷ex'),('SVEM','超夢ex'),('SV3a','激狂駭浪'),
('SV3','黯焰支配者'),('SVAL','起始組合ex 呆火鱷&電龍 ex'),('SVAM','起始組合ex 新葉喵&路卡利歐 ex'),
('SVAW','起始組合ex 潤水鴨&謎擬Ｑ ex'),('SVF','黯焰支配者'),('SVD','ex初階牌組'),('SV2a','寶可夢卡牌151'),
('SVP1','ex特別組合'),('SVC','皮卡丘特別組合'),('SV2D','碟旋暴擊'),('SV2P','冰雪險境'),('SV1a','三連音爆'),
('SVB','頂級訓練家收藏箱ex'),('SV1S','朱ex'),('SV1V','紫ex'),('S12a','天地萬物VSTAR'),('SV-P','特典卡 朱&紫'),
('S12','思維激盪'),('SDL','噴火龍'),('SDM','超夢'),('SDP','皮卡丘'),('SN','初階牌組100 特別版'),('S11a','白熱奧祕'),
('SP6','VSTAR特別組合'),('SPD','VSTAR&VMAX 高級牌組 代歐奇希斯'),('SPZ','VSTAR&VMAX 高級牌組 捷拉奧拉'),
('S11','三連音爆'),('S10b','Pokémon GO'),('S10a','黑暗亡靈'),('S10D','時間觀察者'),('S10P','空間魔術師'),
('S9a','對戰地區'),('SLD','起始組合VSTAR 達克萊伊'),('SLL','起始組合VSTAR 路卡利歐'),('SI','初階牌組100'),
('S9','星星誕生'),('SJ','藏瑪然特VS無極汰那'),('SK','頂級訓練家收藏箱 VSTAR'),('S8b','VMAX Climax'),
('S8a','25週年收藏款'),('S8','匯流藝術'),('SCD','強大'),('SP5','強大'),('S7D','摩天巔峰'),('S7R','蒼空烈流'),
('SH','寶可夢卡牌家庭組合'),('S6a','伊布英雄'),('SCC','Evolution'),('S6H','銀白戰槍'),('S6K','漆黑幽魂'),
('S5a','雙璧戰士'),('S5I','一撃大師'),('S5R','連撃大師'),('SCB','挑戰'),('S4a','Shiny Star V'),('SCA','搭檔'),
('S4','Amazing Volt Tackle'),('SC2a','無極力量 SET A'),('SC2b','無極力量 SET B'),('SC2D','無極力量'),
('SC1a','劍&盾 SET A'),('SC1b','劍&盾 SET B'),('SC1D','劍&盾')]

DISPLAY_OVERRIDES = {
    'SV5K': '狂野之力',
    'S8b': 'VMAX絕群壓軸',
    'S4a': '閃色明星V',
    'S4': '驚天伏特攻擊',
    'SV10': 'Destined Rivals',  # supplied identity is English; TW SV10 is a different set
}
ITEMS = [Item(code, name, DISPLAY_OVERRIDES.get(code, name)) for code, name in RAW]

# Products/subsets that should reuse the related expansion artwork when no own logo exists.
PARENTS = {
    'SVHK':'SV5M','SVHM':'SV4a','SVEL':'SV1S','SVEM':'SV3','SVF':'SV3',
    'SVAL':'SV1a','SVAM':'SV1a','SVAW':'SV1a','SVD':'SV1a','SVP1':'SV1a','SVC':'SV1a','SVB':'SV1a','SV-P':'SV1a',
    'SDL':'S12a','SDM':'S12a','SDP':'S12a','SN':'SI','SP6':'S12a','SPD':'S12a','SPZ':'S12a',
    'S11':'SV1a','SLD':'S9','SLL':'S9','SJ':'S8b','SK':'S9','SCD':'S8','SP5':'S8',
    'SH':'S6a','SCC':'S6a','SCB':'S5a','SCA':'S5a','SC2D':'SC2a','SC1D':'SC1a',
}

# Expansion pages known to have Traditional Chinese launch artwork.
EXPANSIONS = {
    'SV9a','SV9','SV8a','SV8','SV7a','SV7','SV6a','SV6','SV5a','SV5K','SV5M','SV4a','SV4K','SV4M',
    'SV3a','SV3','SV2a','SV2D','SV2P','SV1a','SV1S','SV1V','S12a','S12','S11a','S10b','S10a','S10D',
    'S10P','S9a','S9','S8b','S8a','S8','S7D','S7R','S6a','S6H','S6K','S5a','S5I','S5R','S4a','S4',
    'SC2a','SC2b','SC1a','SC1b'
}

KNOWN_ASSETS = {
    'SV9a': 'https://asia.pokemon-card.com/hk/wp-content/uploads/sites/3/2025/02/hk_news_SV9a_pkg.png',
}


def slug(value: str) -> str:
    cleaned = re.sub(r'[^A-Za-z0-9._-]+', '-', value).strip('-')
    return cleaned or 'asset'


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    options = [
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc' if bold else '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/opentype/noto/NotoSansCJKtc-Bold.otf' if bold else '/usr/share/fonts/opentype/noto/NotoSansCJKtc-Regular.otf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]
    for option in options:
        if Path(option).exists():
            return ImageFont.truetype(option, size=size)
    return ImageFont.load_default()


def get(url: str, *, timeout: int = 35) -> requests.Response | None:
    for attempt in range(3):
        try:
            response = SESSION.get(url, timeout=timeout, allow_redirects=True)
            if response.status_code == 200:
                return response
        except Exception as exc:
            print('GET error', url, exc)
        time.sleep(1 + attempt)
    return None


def read_image(url: str) -> Image.Image | None:
    response = get(url, timeout=45)
    if not response or len(response.content) < 250:
        return None
    try:
        image = Image.open(io.BytesIO(response.content))
        image.load()
        if image.width < 80 or image.height < 25:
            return None
        return image.convert('RGBA')
    except Exception:
        return None


def image_urls(page_url: str, html: str) -> list[tuple[str, str]]:
    soup = BeautifulSoup(html, 'html.parser')
    found: list[tuple[str, str]] = []
    seen: set[str] = set()
    for tag in soup.find_all(['img','source']):
        values: list[str] = []
        for attr in ('data-src','data-lazy-src','src'):
            value = tag.get(attr)
            if value:
                values.append(value)
        for attr in ('srcset','data-srcset'):
            value = tag.get(attr)
            if value:
                values.extend(part.strip().split(' ')[0] for part in value.split(','))
        alt = tag.get('alt','') if tag.name == 'img' else ''
        for value in values:
            url = urljoin(page_url, value)
            if url not in seen:
                seen.add(url)
                found.append((url, alt))
    return found


def special_pages(code: str) -> list[str]:
    lower = code.lower()
    return [
        f'https://asia.pokemon-card.com/tw/archive/special/card/{lower}/',
        f'https://asia.pokemon-card.com/tw/archive/special/card/{lower}/index.html',
        f'https://asia.pokemon-card.com/hk/archive/special/card/{lower}/',
        f'https://asia.pokemon-card.com/hk/archive/special/card/{lower}/index.html',
    ]


def old_pages(code: str) -> list[str]:
    lower = code.lower()
    return [
        f'https://asia.pokemon-card.com/tw/archive/card/scarlet_violet_series/scarlet_violet_{lower}.html',
        f'https://asia.pokemon-card.com/tw/archive/card/sword_shield_series/sword_shield_{lower}.html',
        f'https://asia.pokemon-card.com/hk/archive/card/scarlet_violet_series/scarlet_violet_{lower}.html',
        f'https://asia.pokemon-card.com/hk/archive/card/sword_shield_series/sword_shield_{lower}.html',
    ]


def candidate_score(url: str, alt: str, code: str, name: str, image: Image.Image) -> tuple[int, str]:
    text = (url + ' ' + alt).lower()
    filename = Path(url.split('?')[0]).name.lower()
    score = 0
    kind = 'official_chinese_artwork'
    if any(key in filename for key in ('main-logo','set-logo','title-logo','product-logo')):
        score += 1000; kind = 'official_chinese_logo'
    elif 'logo' in filename and 'header-logo' not in filename:
        score += 900; kind = 'official_chinese_logo'
    if any(key in filename for key in ('hero-visual','hero-head','main-visual','main-kv','kv-main','top_banner','top-banner')):
        score += 700; kind = 'official_chinese_banner'
    if 'banner-img' in filename:
        score += 620; kind = 'official_chinese_banner'
    if any(key in filename for key in ('product-image-1','_pkg','pack','thumb_set','650x488')):
        score += 430; kind = 'official_chinese_package'
    if code.lower() in text:
        score += 80
    if name and name.lower() in text:
        score += 100
    if 'header-logo' in filename:
        score -= 1000
    if any(key in filename for key in ('card-', '_card', 'deck_shield','case','playmat','icon','arrow','footer','menu','button','btn','shinka')):
        score -= 500
    ratio = image.width / max(1, image.height)
    if 1.4 <= ratio <= 6.5:
        score += 80
    if image.getchannel('A').getextrema()[0] < 255:
        score += 50
    if image.width >= 500:
        score += 20
    return score, kind


def resolve_official(code: str, name: str) -> tuple[Image.Image, str, str] | None:
    if code in KNOWN_ASSETS:
        image = read_image(KNOWN_ASSETS[code])
        if image:
            return image, KNOWN_ASSETS[code], 'official_chinese_package'

    pages = special_pages(code) + old_pages(code)
    best: tuple[int, Image.Image, str, str] | None = None
    for page_url in pages:
        response = get(page_url)
        if not response or len(response.content) < 1200:
            continue
        for url, alt in image_urls(response.url, response.text):
            filename = Path(url.split('?')[0]).name.lower()
            # Skip obvious site furniture before downloading.
            if any(token in filename for token in ('favicon','header-menu','footer','icon-sns','arrow','button','btn-')):
                continue
            text = (url + ' ' + alt).lower()
            if not any(token in text for token in ('logo','hero','main','banner','product','pack','pkg','thumb','650x488',code.lower())):
                continue
            image = read_image(url)
            if not image:
                continue
            score, kind = candidate_score(url, alt, code, name, image)
            if best is None or score > best[0]:
                best = (score, image, url, kind)
        if best and best[0] >= 900:
            break
    if best and best[0] >= 250:
        _, image, url, kind = best
        return image, url, kind
    return None


def palette(code: str) -> tuple[tuple[int,int,int], tuple[int,int,int], tuple[int,int,int]]:
    digest = hashlib.sha256(code.encode()).digest()
    h = digest[0] / 255
    # Deterministic vivid RGB without an external colour library.
    import colorsys
    c1 = tuple(int(v*255) for v in colorsys.hsv_to_rgb(h, 0.70, 0.72))
    c2 = tuple(int(v*255) for v in colorsys.hsv_to_rgb((h+0.10)%1, 0.78, 0.95))
    accent = tuple(int(v*255) for v in colorsys.hsv_to_rgb((h+0.52)%1, 0.82, 1.0))
    return c1, c2, accent


def rounded_mask(size: tuple[int,int], radius: int) -> Image.Image:
    mask = Image.new('L', size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,size[0]-1,size[1]-1), radius=radius, fill=255)
    return mask


def make_wordmark(code: str, name: str) -> Image.Image:
    w, h = 1500, 480
    c1, c2, accent = palette(code)
    base = Image.new('RGBA',(w,h),(0,0,0,0))
    plate = Image.new('RGBA',(w-40,h-40),(0,0,0,0))
    pd = ImageDraw.Draw(plate)
    for y in range(plate.height):
        t = y/max(1,plate.height-1)
        colour = tuple(int(c1[i]*(1-t)+c2[i]*t) for i in range(3))+(244,)
        pd.line((0,y,plate.width,y),fill=colour)
    plate.putalpha(rounded_mask(plate.size,70))
    shadow = Image.new('RGBA',base.size,(0,0,0,0))
    shadow.alpha_composite(plate,(28,30))
    shadow = shadow.filter(ImageFilter.GaussianBlur(15))
    base.alpha_composite(shadow)
    base.alpha_composite(plate,(20,20))
    d=ImageDraw.Draw(base)
    d.rounded_rectangle((20,20,w-20,h-20),radius=70,outline=accent+(255,),width=10)
    d.rounded_rectangle((38,38,w-38,h-38),radius=58,outline=(255,255,255,185),width=3)
    small=font(34,True)
    d.text((w//2,65),'寶可夢集換式卡牌遊戲',font=small,anchor='mm',fill=(255,255,255,235),stroke_width=2,stroke_fill=(0,0,0,100))
    main_size=126
    if len(name)>10: main_size=103
    if len(name)>16: main_size=82
    main=font(main_size,True)
    # Wrap only long product names.
    lines=[]
    if len(name)>18:
        midpoint=len(name)//2
        split=max(name.rfind(' ',0,midpoint+3), name.rfind('&',0,midpoint+3))
        if split<4: split=midpoint
        lines=[name[:split+1].strip(),name[split+1:].strip()]
    else:
        lines=[name]
    if len(lines)==1:
        y=255
        d.text((w//2,y),lines[0],font=main,anchor='mm',fill=(255,255,255),stroke_width=12,stroke_fill=(20,20,30),embedded_color=True)
        d.text((w//2,y),lines[0],font=main,anchor='mm',fill=accent+(255,),stroke_width=4,stroke_fill=(255,255,255),embedded_color=True)
    else:
        f=font(main_size,True)
        for j,line in enumerate(lines):
            y=205+j*115
            d.text((w//2,y),line,font=f,anchor='mm',fill=(255,255,255),stroke_width=10,stroke_fill=(20,20,30))
            d.text((w//2,y),line,font=f,anchor='mm',fill=accent+(255,),stroke_width=3,stroke_fill=(255,255,255))
    d.text((w-70,h-56),code,font=font(35,True),anchor='rs',fill=(255,255,255,210))
    return base


def trim(image: Image.Image) -> Image.Image:
    rgba=image.convert('RGBA')
    bbox=rgba.getchannel('A').getbbox()
    if bbox:
        rgba=rgba.crop(bbox)
    return rgba


def fit(image: Image.Image, box: tuple[int,int]) -> Image.Image:
    copy=image.copy()
    copy.thumbnail(box,Image.Resampling.LANCZOS)
    return copy


def wrap_name(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.ImageFont, width: int) -> list[str]:
    if draw.textbbox((0,0),text,font=fnt)[2] <= width:
        return [text]
    # Chinese text can be wrapped by character rather than words.
    lines=[]; current=''
    for char in text:
        trial=current+char
        if current and draw.textbbox((0,0),trial,font=fnt)[2] > width:
            lines.append(current); current=char
        else:
            current=trial
    if current: lines.append(current)
    return lines[:2]


def build_pages(records: list[dict[str,str]]) -> list[Path]:
    W,H=2480,3508
    mx,my=95,90
    gx,gy=55,50
    footer=55
    cw=(W-2*mx-gx)//2
    ch=(H-2*my-footer-2*gy)//3
    page_paths=[]
    total=math.ceil(len(records)/6)
    f_code=font(42,True); f_name=font(42,True); f_note=font(22)
    for page_idx,start in enumerate(range(0,len(records),6),1):
        page=Image.new('RGBA',(W,H),(247,246,242,255))
        d=ImageDraw.Draw(page)
        for local,rec in enumerate(records[start:start+6]):
            row,col=divmod(local,2)
            x=mx+col*(cw+gx); y=my+row*(ch+gy)
            d.rounded_rectangle((x,y,x+cw,y+ch),radius=34,fill=(255,255,255,255),outline=(211,214,220,255),width=3)
            d.text((x+32,y+24),rec['code'],font=f_code,fill=(22,27,38))
            # Small, unobtrusive source marker: filled dot = official; ring = fallback.
            official=rec['source_kind'].startswith('official') or rec['source_kind'].startswith('parent_official')
            cx=x+cw-38; cy=y+42
            if official: d.ellipse((cx-8,cy-8,cx+8,cy+8),fill=(62,72,92))
            else: d.ellipse((cx-8,cy-8,cx+8,cy+8),outline=(120,126,140),width=3)
            asset=Image.open(rec['file']).convert('RGBA')
            # Banners are allowed a wider but shallower box; clean logos receive more height.
            if 'banner' in rec['source_kind'] or 'package' in rec['source_kind']:
                fitted=fit(asset,(cw-90,470))
            else:
                fitted=fit(asset,(cw-100,515))
            px=x+(cw-fitted.width)//2
            py=y+110+(510-fitted.height)//2
            page.alpha_composite(fitted,(px,py))
            lines=wrap_name(d,rec['display_name'],f_name,cw-100)
            line_h=54
            base_y=y+700-(len(lines)-1)*line_h//2
            for j,line in enumerate(lines):
                bbox=d.textbbox((0,0),line,font=f_name)
                tx=x+(cw-(bbox[2]-bbox[0]))//2
                d.text((tx,base_y+j*line_h),line,font=f_name,fill=(24,28,39))
            if rec.get('substitution_note'):
                note=rec['substitution_note']
                bbox=d.textbbox((0,0),note,font=f_note)
                tx=x+(cw-(bbox[2]-bbox[0]))//2
                d.text((tx,y+835),note,font=f_note,fill=(104,111,125))
        marker=f'{page_idx} / {total}'
        bbox=d.textbbox((0,0),marker,font=f_note)
        d.text(((W-(bbox[2]-bbox[0]))//2,H-42),marker,font=f_note,fill=(95,101,114))
        path=PAGES/f'traditional-chinese-set-logos-page-{page_idx:02d}.png'
        page.convert('RGB').save(path,'PNG',dpi=(300,300),optimize=True)
        page_paths.append(path)
    return page_paths


def main() -> None:
    if OUT.exists(): shutil.rmtree(OUT)
    for directory in (OUT,INDIVIDUAL,PAGES): directory.mkdir(parents=True,exist_ok=True)
    item_by_code={i.code:i for i in ITEMS}
    resolved: dict[str,tuple[Image.Image,str,str]]={}
    records=[]

    def resolve_base(code: str) -> tuple[Image.Image,str,str] | None:
        if code in resolved: return resolved[code]
        item=item_by_code.get(code)
        if code in EXPANSIONS and item:
            result=resolve_official(code,item.display_name)
            if result:
                resolved[code]=result; return result
        return None

    for idx,item in enumerate(ITEMS,1):
        print(f'[{idx:02d}/{len(ITEMS)}] {item.code} {item.display_name}',flush=True)
        substitution_note=''
        result=resolve_base(item.code)
        source_kind=''
        source_url=''
        if result:
            image,source_url,source_kind=result
        elif item.code in PARENTS:
            parent=PARENTS[item.code]
            parent_result=resolve_base(parent)
            if parent_result:
                image,source_url,parent_kind=parent_result
                source_kind='parent_official_chinese'
                substitution_note=f'使用相關原始系列：{parent}'
            else:
                image=make_wordmark(item.code,item.display_name)
                source_kind='chinese_wordmark_fallback'; source_url=''
                substitution_note='無獨立官方標誌'
        else:
            image=make_wordmark(item.code,item.display_name)
            source_kind='chinese_wordmark_fallback'; source_url=''
            substitution_note='無獨立官方標誌'

        image=trim(image)
        filename=f'{idx:02d}_{slug(item.code)}_{slug(item.display_name)}.png'
        path=INDIVIDUAL/filename
        image.save(path,'PNG',optimize=True)
        records.append({
            'order':str(idx),'code':item.code,'supplied_name':item.supplied_name,'display_name':item.display_name,
            'source_kind':source_kind,'source_url':source_url,'parent_code':PARENTS.get(item.code,''),
            'substitution_note':substitution_note,'filename':filename,'file':str(path),
            'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        })

    page_paths=build_pages(records)
    pdf_images=[Image.open(p).convert('RGB') for p in page_paths]
    pdf=OUT/'Traditional_Chinese_Pokemon_Set_Logos_6_Per_A4.pdf'
    pdf_images[0].save(pdf,'PDF',save_all=True,append_images=pdf_images[1:],resolution=300.0,quality=95)
    for im in pdf_images: im.close()

    fields=['order','code','supplied_name','display_name','source_kind','source_url','parent_code','substitution_note','filename','sha256']
    with (OUT/'manifest.csv').open('w',newline='',encoding='utf-8-sig') as f:
        w=csv.DictWriter(f,fieldnames=fields); w.writeheader();
        for r in records: w.writerow({k:r[k] for k in fields})
    (OUT/'manifest.json').write_text(json.dumps([{k:r[k] for k in fields} for r in records],ensure_ascii=False,indent=2),encoding='utf-8')
    (OUT/'README.txt').write_text(
        'Traditional Chinese Pokémon set-logo sheets\n'
        '============================================\n\n'
        '83 requested catalogue entries, arranged six per A4 page.\n'
        'A filled dot means official Traditional Chinese artwork was used.\n'
        'An outlined dot means a Chinese title wordmark was created because the product has no separate dependable logo.\n'
        'Related expansion products reuse the original Chinese expansion artwork, as requested.\n\n'
        'SV10 / Destined Rivals is retained as supplied. It is not the same identity as the Asian Traditional Chinese SV10 release.\n',
        encoding='utf-8')

    # Compact visual overview.
    thumbs=[Image.open(p).convert('RGB') for p in page_paths]
    tw=620; scaled=[]
    for im in thumbs:
        copy=im.copy(); copy.thumbnail((tw,877),Image.Resampling.LANCZOS); scaled.append(copy)
    cols=2; rows=math.ceil(len(scaled)/cols)
    contact=Image.new('RGB',(cols*tw,rows*877),(225,225,225))
    for i,im in enumerate(scaled): contact.paste(im,((i%cols)*tw,(i//cols)*877))
    contact.save(OUT/'contact-sheet.jpg',quality=88)
    for im in thumbs+scaled: im.close()

    zip_path=OUT/'Traditional_Chinese_Pokemon_Set_Logos_6_Per_A4.zip'
    with zipfile.ZipFile(zip_path,'w',zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for path in sorted(OUT.rglob('*')):
            if path.is_file() and path != zip_path:
                z.write(path,path.relative_to(OUT))
    print(json.dumps({
        'entries':len(records),'pages':len(page_paths),
        'official':sum(r['source_kind'].startswith('official') for r in records),
        'parent':sum(r['source_kind'].startswith('parent_official') for r in records),
        'fallback':sum(r['source_kind']=='chinese_wordmark_fallback' for r in records),
        'pdf':str(pdf),'zip':str(zip_path)
    },ensure_ascii=False,indent=2))

if __name__=='__main__':
    main()
