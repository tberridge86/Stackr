from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import quote

import imagehash
import requests
from PIL import Image, ImageDraw, ImageFont, ImageOps

OUT = Path('build/tc-logo-probe')
IMG_DIR = OUT / 'images'
OUT.mkdir(parents=True, exist_ok=True)
IMG_DIR.mkdir(parents=True, exist_ok=True)

SESSION = requests.Session()
SESSION.headers.update({
    'User-Agent': 'Stackr-Traditional-Chinese-Logo-Probe/2.0 (+https://github.com/tberridge86/Stackr)',
    'Accept': 'application/json,image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
})

@dataclass(frozen=True)
class Item:
    code: str
    name: str

ITEMS = [
    Item('SV10', 'Destined Rivals'),
    Item('SV9a', '熱風競技場'),
    Item('SV9', '對戰搭檔'),
    Item('SV8a', '太晶慶典ex'),
    Item('SV8', '超電突圍'),
    Item('SV7a', '樂園騰龍'),
    Item('SV7', '星晶奇跡'),
    Item('SV6a', '黑夜漫遊者'),
    Item('SV6', '變幻假面'),
    Item('SV5a', '緋紅薄霧'),
    Item('SV5K', 'Wild Force'),
    Item('SVHK', '未來密勒頓ex'),
    Item('SVHM', '閃色寶藏ex'),
    Item('SV5M', '異度審判'),
    Item('SV4a', '閃色寶藏ex'),
    Item('SV4K', '古代咆哮'),
    Item('SV4M', '未來閃光'),
    Item('SVEL', '骨紋巨聲鱷ex'),
    Item('SVEM', '超夢ex'),
    Item('SV3a', '激狂駭浪'),
    Item('SV3', '黯焰支配者'),
    Item('SVAL', '起始組合ex 呆火鱷&電龍 ex'),
    Item('SVAM', '起始組合ex 新葉喵&路卡利歐 ex'),
    Item('SVAW', '起始組合ex 潤水鴨&謎擬Ｑ ex'),
    Item('SVF', '黯焰支配者'),
    Item('SVD', 'ex初階牌組'),
    Item('SV2a', '寶可夢卡牌151'),
    Item('SVP1', 'ex特別組合'),
    Item('SVC', '皮卡丘特別組合'),
    Item('SV2D', '碟旋暴擊'),
    Item('SV2P', '冰雪險境'),
    Item('SV1a', '三連音爆'),
    Item('SVB', '頂級訓練家收藏箱ex'),
    Item('SV1S', '朱ex'),
    Item('SV1V', '紫ex'),
    Item('S12a', '天地萬物VSTAR'),
    Item('SV-P', '特典卡 朱&紫'),
    Item('S12', '思維激盪'),
    Item('SDL', '噴火龍'),
    Item('SDM', '超夢'),
    Item('SDP', '皮卡丘'),
    Item('SN', '初階牌組100 特別版'),
    Item('S11a', '白熱奧祕'),
    Item('SP6', 'VSTAR特別組合'),
    Item('SPD', 'VSTAR&VMAX 高級牌組 代歐奇希斯'),
    Item('SPZ', 'VSTAR&VMAX 高級牌組 捷拉奧拉'),
    Item('S11', '三連音爆'),
    Item('S10b', 'Pokémon GO'),
    Item('S10a', '黑暗亡靈'),
    Item('S10D', '時間觀察者'),
    Item('S10P', '空間魔術師'),
    Item('S9a', '對戰地區'),
    Item('SLD', '起始組合VSTAR 達克萊伊'),
    Item('SLL', '起始組合VSTAR 路卡利歐'),
    Item('SI', '初階牌組100'),
    Item('S9', '星星誕生'),
    Item('SJ', '藏瑪然特VS無極汰那'),
    Item('SK', '頂級訓練家收藏箱 VSTAR'),
    Item('S8b', 'VMAX Climax'),
    Item('S8a', '25週年收藏款'),
    Item('S8', '匯流藝術'),
    Item('SCD', '強大'),
    Item('SP5', '強大'),
    Item('S7D', '摩天巔峰'),
    Item('S7R', '蒼空烈流'),
    Item('SH', '寶可夢卡牌家庭組合'),
    Item('S6a', '伊布英雄'),
    Item('SCC', 'Evolution'),
    Item('S6H', '銀白戰槍'),
    Item('S6K', '漆黑幽魂'),
    Item('S5a', '雙璧戰士'),
    Item('S5I', '一撃大師'),
    Item('S5R', '連撃大師'),
    Item('SCB', '挑戰'),
    Item('S4a', 'Shiny Star V'),
    Item('SCA', '搭檔'),
    Item('S4', 'Amazing Volt Tackle'),
    Item('SC2a', '無極力量 SET A'),
    Item('SC2b', '無極力量 SET B'),
    Item('SC2D', '無極力量'),
    Item('SC1a', '劍&盾 SET A'),
    Item('SC1b', '劍&盾 SET B'),
    Item('SC1D', '劍&盾'),
]


def get_json(url: str) -> dict[str, Any] | None:
    try:
        r = SESSION.get(url, timeout=30)
        if r.status_code == 200:
            return r.json()
        print(f'JSON {r.status_code}: {url}')
    except Exception as exc:
        print(f'JSON error {url}: {exc}')
    return None


def get_image(url: str) -> tuple[Image.Image, bytes] | None:
    for suffix in ('', '.png', '.webp', '.jpg'):
        full = url if suffix == '' or url.lower().endswith(('.png', '.webp', '.jpg', '.jpeg')) else url + suffix
        try:
            r = SESSION.get(full, timeout=40)
            if r.status_code != 200 or len(r.content) < 200:
                continue
            im = Image.open(io.BytesIO(r.content))
            im.load()
            if im.width < 50 or im.height < 20:
                continue
            return im.convert('RGBA'), r.content
        except Exception:
            continue
    return None


def api_set(lang: str, code: str) -> dict[str, Any] | None:
    return get_json(f'https://api.tcgdex.net/v2/{lang}/sets/{quote(code)}')


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = [
        '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc' if bold else '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    ]
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size=size)
    return ImageFont.load_default()


def fit(im: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = im.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    return copy


def normalize_logo(im: Image.Image) -> Image.Image:
    rgba = im.convert('RGBA')
    bbox = rgba.getchannel('A').getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    return rgba


def p_hash(im: Image.Image) -> str:
    return str(imagehash.phash(im.convert('RGB')))


def official_post_probe(name: str, code: str) -> tuple[str, str]:
    # Only records likely official page/package candidates. No cropping is done in this probe.
    try:
        search_url = 'https://asia.pokemon-card.com/tw/wp-json/wp/v2/search'
        r = SESSION.get(search_url, params={'search': name, 'per_page': 10, 'subtype': 'post'}, timeout=30)
        if r.status_code != 200:
            return '', f'wp-search-{r.status_code}'
        results = r.json()
        if not results:
            return '', 'no-wp-result'
        best = None
        best_score = -1
        for row in results:
            title = re.sub('<[^>]+>', '', str(row.get('title', '')))
            score = 0
            if name.lower() in title.lower(): score += 100
            if code.lower() in title.lower(): score += 40
            if any(k in title for k in ('發售', '資訊更新', '商品')): score += 20
            if score > best_score:
                best_score = score
                best = row
        if not best:
            return '', 'no-wp-best'
        return str(best.get('url', '')), f'wp-score-{best_score}'
    except Exception as exc:
        return '', f'wp-error-{type(exc).__name__}'


def draw_contact(records: list[dict[str, str]]) -> None:
    cols = 4
    cell_w, cell_h = 520, 330
    rows = (len(records) + cols - 1) // cols
    canvas = Image.new('RGB', (cols * cell_w, rows * cell_h), 'white')
    draw = ImageDraw.Draw(canvas)
    f_code = font(26, True)
    f_name = font(25, True)
    f_small = font(17, False)
    for idx, rec in enumerate(records):
        x = (idx % cols) * cell_w
        y = (idx // cols) * cell_h
        draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline=(210, 214, 222), width=2)
        draw.text((x + 16, y + 12), f"{idx+1:02d}  {rec['code']}", font=f_code, fill=(25, 31, 45))
        draw.text((x + 16, y + 50), rec['name'], font=f_name, fill=(25, 31, 45))
        path = rec.get('file', '')
        if path and Path(path).exists():
            im = Image.open(path).convert('RGBA')
            thumb = fit(im, (cell_w - 40, 185))
            canvas.paste(thumb, (x + (cell_w - thumb.width)//2, y + 95 + (185-thumb.height)//2), thumb)
        else:
            draw.text((x + 16, y + 145), 'NO LOGO', font=f_code, fill=(180, 40, 40))
        meta = f"{rec.get('status','')} | {rec.get('series','')}\n{rec.get('same_as_ja','')} {rec.get('same_as_en','')}\n{rec.get('official_page_status','')}"
        draw.multiline_text((x + 16, y + 284), meta, font=f_small, fill=(90, 97, 111), spacing=2)
    canvas.save(OUT / 'tcgdex-zh-tw-logo-contact-sheet.jpg', quality=90)


def main() -> None:
    records: list[dict[str, str]] = []
    for i, item in enumerate(ITEMS, start=1):
        print(f'[{i:02d}/{len(ITEMS)}] {item.code} {item.name}', flush=True)
        zh = api_set('zh-tw', item.code)
        ja = api_set('ja', item.code)
        en = api_set('en', item.code)
        row: dict[str, str] = {
            'order': str(i),
            'code': item.code,
            'name': item.name,
            'status': 'missing',
            'series': '',
            'zh_logo_url': '',
            'ja_logo_url': '',
            'en_logo_url': '',
            'sha256': '',
            'phash': '',
            'same_as_ja': '',
            'same_as_en': '',
            'file': '',
            'official_page': '',
            'official_page_status': '',
        }
        if zh:
            row['series'] = str((zh.get('serie') or {}).get('id', ''))
            row['zh_logo_url'] = str(zh.get('logo') or '')
        if ja:
            row['ja_logo_url'] = str(ja.get('logo') or '')
        if en:
            row['en_logo_url'] = str(en.get('logo') or '')

        zh_im = None
        zh_bytes = b''
        if row['zh_logo_url']:
            got = get_image(row['zh_logo_url'])
            if got:
                zh_im, zh_bytes = got
                zh_im = normalize_logo(zh_im)
                out_path = IMG_DIR / f'{i:02d}_{re.sub(r"[^A-Za-z0-9._-]+", "-", item.code)}.png'
                zh_im.save(out_path, optimize=True)
                row['file'] = str(out_path)
                row['status'] = 'zh-tw-logo'
                row['sha256'] = hashlib.sha256(out_path.read_bytes()).hexdigest()
                row['phash'] = p_hash(zh_im)

        if zh_im is not None:
            if row['ja_logo_url']:
                got = get_image(row['ja_logo_url'])
                if got:
                    ja_im = normalize_logo(got[0])
                    row['same_as_ja'] = 'same-ja' if imagehash.phash(zh_im.convert('RGB')) - imagehash.phash(ja_im.convert('RGB')) <= 2 else 'diff-ja'
            if row['en_logo_url']:
                got = get_image(row['en_logo_url'])
                if got:
                    en_im = normalize_logo(got[0])
                    row['same_as_en'] = 'same-en' if imagehash.phash(zh_im.convert('RGB')) - imagehash.phash(en_im.convert('RGB')) <= 2 else 'diff-en'

        page, page_status = official_post_probe(item.name, item.code)
        row['official_page'] = page
        row['official_page_status'] = page_status
        records.append(row)
        time.sleep(0.08)

    with (OUT / 'probe.csv').open('w', newline='', encoding='utf-8-sig') as fh:
        writer = csv.DictWriter(fh, fieldnames=list(records[0].keys()))
        writer.writeheader()
        writer.writerows(records)
    (OUT / 'probe.json').write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding='utf-8')
    draw_contact(records)
    print(json.dumps({
        'total': len(records),
        'zh_tw_logos': sum(r['status'] == 'zh-tw-logo' for r in records),
        'same_as_ja': sum(r['same_as_ja'] == 'same-ja' for r in records),
        'official_pages': sum(bool(r['official_page']) for r in records),
    }, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
