from __future__ import annotations

import csv
import json
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

ITEMS = [{"code":"SV10","name":"Destined Rivals"},{"code":"SV9a","name":"熱風競技場"},{"code":"SV9","name":"對戰搭檔"},{"code":"SV8a","name":"太晶慶典ex"},{"code":"SV8","name":"超電突圍"},{"code":"SV7a","name":"樂園騰龍"},{"code":"SV7","name":"星晶奇跡"},{"code":"SV6a","name":"黑夜漫遊者"},{"code":"SV6","name":"變幻假面"},{"code":"SV5a","name":"緋紅薄霧"},{"code":"SV5K","name":"Wild Force"},{"code":"SVHK","name":"未來密勒頓ex"},{"code":"SVHM","name":"閃色寶藏ex"},{"code":"SV5M","name":"異度審判"},{"code":"SV4a","name":"閃色寶藏ex"},{"code":"SV4K","name":"古代咆哮"},{"code":"SV4M","name":"未來閃光"},{"code":"SVEL","name":"骨紋巨聲鱷ex"},{"code":"SVEM","name":"超夢ex"},{"code":"SV3a","name":"激狂駭浪"},{"code":"SV3","name":"黯焰支配者"},{"code":"SVAL","name":"起始組合ex 呆火鱷&電龍 ex"},{"code":"SVAM","name":"起始組合ex 新葉喵&路卡利歐 ex"},{"code":"SVAW","name":"起始組合ex 潤水鴨&謎擬Ｑ ex"},{"code":"SVF","name":"黯焰支配者"},{"code":"SVD","name":"ex初階牌組"},{"code":"SV2a","name":"寶可夢卡牌151"},{"code":"SVP1","name":"ex特別組合"},{"code":"SVC","name":"皮卡丘特別組合"},{"code":"SV2D","name":"碟旋暴擊"},{"code":"SV2P","name":"冰雪險境"},{"code":"SV1a","name":"三連音爆"},{"code":"SVB","name":"頂級訓練家收藏箱ex"},{"code":"SV1S","name":"朱ex"},{"code":"SV1V","name":"紫ex"},{"code":"S12a","name":"天地萬物VSTAR"},{"code":"SV-P","name":"特典卡 朱&紫"},{"code":"S12","name":"思維激盪"},{"code":"SDL","name":"噴火龍"},{"code":"SDM","name":"超夢"},{"code":"SDP","name":"皮卡丘"},{"code":"SN","name":"初階牌組100 特別版"},{"code":"S11a","name":"白熱奧祕"},{"code":"SP6","name":"VSTAR特別組合"},{"code":"SPD","name":"VSTAR&VMAX 高級牌組 代歐奇希斯"},{"code":"SPZ","name":"VSTAR&VMAX 高級牌組 捷拉奧拉"},{"code":"S11","name":"三連音爆"},{"code":"S10b","name":"Pokémon GO"},{"code":"S10a","name":"黑暗亡靈"},{"code":"S10D","name":"時間觀察者"},{"code":"S10P","name":"空間魔術師"},{"code":"S9a","name":"對戰地區"},{"code":"SLD","name":"起始組合VSTAR 達克萊伊"},{"code":"SLL","name":"起始組合VSTAR 路卡利歐"},{"code":"SI","name":"初階牌組100"},{"code":"S9","name":"星星誕生"},{"code":"SJ","name":"藏瑪然特VS無極汰那"},{"code":"SK","name":"頂級訓練家收藏箱 VSTAR"},{"code":"S8b","name":"VMAX Climax"},{"code":"S8a","name":"25週年收藏款"},{"code":"S8","name":"匯流藝術"},{"code":"SCD","name":"強大"},{"code":"SP5","name":"強大"},{"code":"S7D","name":"摩天巔峰"},{"code":"S7R","name":"蒼空烈流"},{"code":"SH","name":"寶可夢卡牌家庭組合"},{"code":"S6a","name":"伊布英雄"},{"code":"SCC","name":"Evolution"},{"code":"S6H","name":"銀白戰槍"},{"code":"S6K","name":"漆黑幽魂"},{"code":"S5a","name":"雙璧戰士"},{"code":"S5I","name":"一撃大師"},{"code":"S5R","name":"連撃大師"},{"code":"SCB","name":"挑戰"},{"code":"S4a","name":"Shiny Star V"},{"code":"SCA","name":"搭檔"},{"code":"S4","name":"Amazing Volt Tackle"},{"code":"SC2a","name":"無極力量 SET A"},{"code":"SC2b","name":"無極力量 SET B"},{"code":"SC2D","name":"無極力量"},{"code":"SC1a","name":"劍&盾 SET A"},{"code":"SC1b","name":"劍&盾 SET B"},{"code":"SC1D","name":"劍&盾"}]

OUT = Path("build/tw-logo-audit")
OUT.mkdir(parents=True, exist_ok=True)
SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "Mozilla/5.0 (compatible; Stackr-logo-audit/2.0)"})


def clean(text: str) -> str:
    text = re.sub(r"\s+", "", text or "")
    text = text.replace("「", "").replace("」", "").replace("『", "").replace("』", "")
    text = text.replace("寶可夢集換式卡牌遊戲", "").replace("商品資訊", "")
    return text.lower()


def fetch_json(url: str):
    try:
        r = SESSION.get(url, timeout=30)
        return r.status_code, r.json() if r.ok else None
    except Exception as exc:
        return 0, {"error": str(exc)}


def extract_product_links() -> list[dict[str, str]]:
    url = "https://asia.pokemon-card.com/tw/products/"
    r = SESSION.get(url, timeout=45)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    rows: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for a in soup.find_all("a", href=True):
        href = urljoin(url, a["href"])
        if "asia.pokemon-card.com/tw/" not in href:
            continue
        node = a
        chosen = ""
        for _ in range(5):
            if node is None:
                break
            text = " ".join(node.stripped_strings)
            if len(text) > len(chosen):
                chosen = text
            if any(token in text for token in ("擴充包", "牌組", "組合", "收藏箱", "家庭", "SET A", "SET B")):
                chosen = text
                break
            node = node.parent
        chosen = re.sub(r"\s+", " ", chosen).strip()
        if not chosen or len(chosen) > 180:
            continue
        key = (href, chosen)
        if key in seen:
            continue
        seen.add(key)
        rows.append({"title": chosen, "href": href, "norm": clean(chosen)})
    return rows


def similarity(a: str, b: str) -> float:
    from difflib import SequenceMatcher
    a2, b2 = clean(a), clean(b)
    if not a2 or not b2:
        return 0.0
    if a2 in b2 or b2 in a2:
        return 1.0
    return SequenceMatcher(None, a2, b2).ratio()


products = extract_product_links()
with (OUT / "official_product_links.csv").open("w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=["title", "href", "norm"])
    w.writeheader(); w.writerows(products)

rows = []
for item in ITEMS:
    code, supplied_name = item["code"], item["name"]
    status, data = fetch_json(f"https://api.tcgdex.net/v2/zh-tw/sets/{code}")
    regional_name = data.get("name", "") if isinstance(data, dict) else ""
    logo = data.get("logo", "") if isinstance(data, dict) else ""
    queries = [supplied_name, regional_name]
    corrections = {
        "SV10": ["火箭隊的榮耀"],
        "SV5K": ["狂野之力"],
        "S11": ["迷途深淵"],
        "S8b": ["VMAX絕群壓軸"],
        "S4a": ["閃色明星V"],
        "S4": ["驚天伏特攻擊"],
        "SCC": ["進化"],
        "SJ": ["蒼響藏瑪然特VS無極汰那", "藏瑪然特VS無極汰那"],
        "SVHK": ["未來密勒頓ex"],
        "SVEL": ["骨紋巨聲鱷ex"],
        "SVEM": ["超夢ex"],
        "SVD": ["ex初階牌組"],
        "SVC": ["皮卡丘ex巴布土撥", "皮卡丘特別組合"],
        "SN": ["初階牌組100特別版"],
    }
    queries.extend(corrections.get(code, []))
    best = (0.0, "", "")
    for product in products:
        for query in queries:
            score = similarity(query, product["title"])
            if score > best[0]:
                best = (score, product["title"], product["href"])
    rows.append({
        "code": code,
        "supplied_name": supplied_name,
        "tcgdex_status": status,
        "tcgdex_name": regional_name,
        "tcgdex_logo": logo,
        "best_product_score": f"{best[0]:.3f}",
        "best_product_title": best[1],
        "best_product_url": best[2],
    })
    print(json.dumps(rows[-1], ensure_ascii=False))

with (OUT / "audit.csv").open("w", encoding="utf-8", newline="") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0]))
    w.writeheader(); w.writerows(rows)

(OUT / "audit.json").write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"Wrote {len(rows)} rows and {len(products)} product links")
