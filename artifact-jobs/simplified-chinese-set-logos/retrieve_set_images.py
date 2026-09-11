#!/usr/bin/env python3
"""Build a six-per-page reference sheet for the supplied Simplified Chinese sets.

The mainland-China catalogue contains a mixture of true expansions, decks, promo
series and boxed-product components.  TCGdex currently exposes the metadata but
not the zh-CN logos for these records, so this job retrieves the closest official
product/reference image from pokemon.cn and labels it honestly.  It never invents
or silently substitutes a different-language logo.
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import math
import re
import time
import unicodedata
import zipfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Iterable
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
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "sets.tsv"
OUT = ROOT / "output"
IMAGES = OUT / "images"
PDF_PATH = OUT / "simplified_chinese_set_images_6_per_page.pdf"
ZIP_PATH = OUT / "simplified_chinese_set_images_png.zip"
REPORT_PATH = OUT / "retrieval_report.csv"
CANDIDATE_PATH = OUT / "candidate_audit.csv"
ARTICLE_PATH = OUT / "official_article_catalog.csv"
README_PATH = OUT / "README.txt"
SUMMARY_PATH = OUT / "summary.json"

BASE = "https://www.pokemon.cn"
INDEX = f"{BASE}/tcg/product"
TIMEOUT = 35
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "Chrome/152.0 Safari/537.36 StackR-asset-reference/1.0"
)


def session() -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=4,
        connect=4,
        read=4,
        status=4,
        backoff_factor=0.75,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset({"GET"}),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=12, pool_maxsize=12)
    s.mount("https://", adapter)
    s.headers.update({"User-Agent": UA, "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.6"})
    return s


HTTP = session()


@dataclass
class Requested:
    order: int
    code: str
    name: str


@dataclass
class Node:
    pos: int
    kind: str
    text: str = ""
    url: str = ""
    alt: str = ""


@dataclass
class Article:
    order: int
    url: str
    title: str
    date: str
    text: str
    nodes: list[Node]


@dataclass
class Result:
    order: int
    requested_code: str
    requested_name: str
    status: str = "missing"
    asset_type: str = "missing"
    article_title: str = ""
    article_url: str = ""
    image_url: str = ""
    local_file: str = ""
    width: int = 0
    height: int = 0
    sha256: str = ""
    article_score: float = 0.0
    image_score: float = 0.0
    matched_query: str = ""
    nearby_text: str = ""
    notes: str = ""


def get(url: str, *, referer: str = "") -> requests.Response:
    headers = {"Referer": referer} if referer else None
    r = HTTP.get(url, timeout=TIMEOUT, headers=headers)
    r.raise_for_status()
    return r


def norm(value: str) -> str:
    value = unicodedata.normalize("NFKC", value or "").casefold()
    value = value.replace("＆", "&").replace("vol.", "vol")
    value = re.sub(r"[\s\u3000]+", "", value)
    value = re.sub(r"[·•・:：/／()（）\[\]【】{}<>《》〖〗“”\"'’`~～,，.。_—–-]+", "", value)
    return value


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def stable_image_url(url: str) -> str:
    """Strip expiring CDN query only for deduplication/report display."""
    parsed = urlparse(url)
    return urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))


def load_manifest() -> list[Requested]:
    rows: list[Requested] = []
    with MANIFEST.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle, delimiter="\t")
        for i, item in enumerate(reader, 1):
            code = clean_text(item.get("code", ""))
            name = clean_text(item.get("name", ""))
            if code and name:
                rows.append(Requested(i, code, name))
    if not rows:
        raise RuntimeError("sets.tsv contained no usable records")
    return rows


GENERIC_PREFIXES = (
    "宝可梦集换式卡牌游戏",
    "宝可梦卡牌",
    "大师战略卡组构筑套装",
    "卡组构筑进阶礼盒",
    "卡组构筑礼盒",
    "强化包",
    "补充包",
    "专题包",
    "起始卡组",
    "改造包",
    "特典卡·",
    "特典卡",
)

ALIAS_BY_CODE: dict[str, list[str]] = {
    "cbb1c": ["宝石包 第一弹", "宝石包第1弹", "宝石包第一弹"],
    "cbb2c": ["宝石包 第二弹", "宝石包第2弹", "宝石包第二弹"],
    "cbb3c": ["宝石包 第三弹", "宝石包第3弹", "宝石包第三弹"],
    "cbb4c": ["宝石包 第四弹", "宝石包第4弹", "宝石包第四弹"],
    "cbb5c": ["宝石包 第五弹", "宝石包第5弹", "宝石包第五弹"],
    "promo-30th-p": ["30周年庆典", "30周年纪念"],
    "promo-sv-p": ["朱&紫 特典卡", "朱&紫系列 特典卡", "朱&紫 促销卡"],
    "promo-s-p": ["剑&盾 特典卡", "剑&盾系列 特典卡", "剑&盾 促销卡"],
    "promo-sm-p": ["太阳&月亮 特典卡", "太阳&月亮系列 特典卡", "太阳&月亮 促销卡"],
    "151c": ["收集啦151 旅", "收集啦151"],
    "csvnc": ["北上乡专题包", "北上乡 专题包"],
}


def query_variants(item: Requested) -> list[str]:
    candidates = [item.name]
    candidates.extend(ALIAS_BY_CODE.get(item.code.casefold(), []))
    name = item.name
    candidates.extend(
        [
            name.replace("嗨皮卡组", "嗨皮组合"),
            name.replace("嗨皮组合", "嗨皮卡组"),
            name.replace("&", "＆"),
            re.sub(r"（\s*5张装\s*）", "", name),
            re.sub(r"Vol\.\s*1", "第一弹", name, flags=re.I),
            re.sub(r"Vol\.\s*2", "第二弹", name, flags=re.I),
            re.sub(r"Vol\.\s*3", "第三弹", name, flags=re.I),
        ]
    )
    stripped = name
    changed = True
    while changed:
        changed = False
        for prefix in GENERIC_PREFIXES:
            if stripped.startswith(prefix):
                stripped = stripped[len(prefix) :].lstrip(" ：:·")
                changed = True
    candidates.append(stripped)

    result: list[str] = []
    seen: set[str] = set()
    for value in candidates:
        value = clean_text(value)
        key = norm(value)
        if len(key) >= 2 and key not in seen:
            result.append(value)
            seen.add(key)
    return result


FOCUS_TERMS = (
    "改造包",
    "奖赏包",
    "嗨皮包",
    "起始卡组",
    "卡组构筑",
    "进阶礼盒",
    "专属礼盒",
    "收藏礼盒",
    "展示套礼盒",
    "训练家收藏礼盒",
    "对战学院",
    "专题包",
    "强化包",
    "补充包",
    "特典卡",
)


def focus_terms(item: Requested) -> list[str]:
    found = [term for term in FOCUS_TERMS if term in item.name]
    # Product names after a long generic prefix are often the most useful anchor.
    if "大师战略卡组构筑套装" in item.name:
        found.append(item.name.split("大师战略卡组构筑套装", 1)[1].strip())
    if "对战派对组合" in item.name:
        found.append(item.name.rsplit(" ", 1)[-1])
    return [term for term in found if term]


def discover_article_urls() -> list[str]:
    urls: list[str] = []
    seen: set[str] = set()
    empty_pages = 0
    for page in range(1, 21):
        url = INDEX if page == 1 else f"{INDEX}/p/{page}"
        try:
            soup = BeautifulSoup(get(url).text, "html.parser")
        except Exception as exc:
            print(f"index {page}: {type(exc).__name__}: {exc}")
            empty_pages += 1
            if empty_pages >= 2:
                break
            continue
        added = 0
        for anchor in soup.find_all("a", href=True):
            absolute = urljoin(url, str(anchor.get("href")))
            parsed = urlparse(absolute)
            if parsed.scheme not in {"http", "https"}:
                continue
            if "pokemon.com.cn" not in parsed.netloc and "pokemon.cn" not in parsed.netloc:
                continue
            if not re.search(r"/tcg/product/(?:[^/?#]+\.html)$", parsed.path, re.I):
                continue
            clean = urlunparse((parsed.scheme, parsed.netloc, parsed.path, "", "", ""))
            if clean not in seen:
                seen.add(clean)
                urls.append(clean)
                added += 1
        print(f"index {page}: {added} new article links")
        empty_pages = empty_pages + 1 if added == 0 else 0
        if page > 1 and empty_pages >= 2:
            break
        time.sleep(0.08)
    return urls


def image_url_from_tag(tag: Tag, page_url: str) -> str:
    for attr in ("data-src", "data-original", "data-lazy-src", "data-url", "src"):
        value = tag.get(attr)
        if isinstance(value, str) and value.strip() and not value.startswith("data:"):
            return urljoin(page_url, value.strip())
    srcset = tag.get("srcset")
    if isinstance(srcset, str) and srcset.strip():
        options = [part.strip().split()[0] for part in srcset.split(",") if part.strip()]
        if options:
            return urljoin(page_url, options[-1])
    return ""


def parse_article(order: int, url: str) -> Article | None:
    try:
        response = get(url)
    except Exception as exc:
        print(f"article failed {url}: {type(exc).__name__}: {exc}")
        return None
    soup = BeautifulSoup(response.text, "html.parser")
    for tag in soup.find_all(["script", "style", "noscript", "svg", "nav", "footer"]):
        tag.decompose()
    title = clean_text(
        (soup.find("h1").get_text(" ", strip=True) if soup.find("h1") else "")
        or (soup.title.get_text(" ", strip=True) if soup.title else "")
    )
    date_match = re.search(r"20\d{2}[-年/.]\d{1,2}[-月/.]\d{1,2}", soup.get_text(" ", strip=True))
    date = date_match.group(0) if date_match else ""
    root = soup.find("main") or soup.find("article") or soup.body or soup

    nodes: list[Node] = []
    seen_images: set[str] = set()
    selected_tags = root.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "td", "th", "li", "figcaption", "img"])
    for tag in selected_tags:
        if tag.name == "img":
            image_url = image_url_from_tag(tag, url)
            if not image_url:
                continue
            parsed = urlparse(image_url)
            path = parsed.path.casefold()
            if not re.search(r"\.(?:png|jpe?g|webp|gif)(?:$|\?)", image_url, re.I):
                continue
            if any(piece in path for piece in ("loading", "placeholder", "avatar", "qrcode", "icon-")):
                continue
            stable = stable_image_url(image_url)
            if stable in seen_images:
                continue
            seen_images.add(stable)
            alt = clean_text(str(tag.get("alt") or tag.get("title") or ""))
            nodes.append(Node(len(nodes), "image", url=image_url, alt=alt))
        else:
            # Avoid repeating a whole list item/table cell if it only wraps block tags.
            if tag.find(["h1", "h2", "h3", "h4", "h5", "h6", "p", "td", "th", "li"], recursive=False):
                continue
            text = clean_text(tag.get_text(" ", strip=True))
            if text:
                nodes.append(Node(len(nodes), tag.name or "text", text=text))

    # Some article templates expose a useful hero only through OpenGraph metadata.
    for meta in soup.find_all("meta"):
        prop = str(meta.get("property") or meta.get("name") or "").casefold()
        content = str(meta.get("content") or "").strip()
        if prop in {"og:image", "twitter:image", "twitter:image:src"} and content:
            absolute = urljoin(url, content)
            stable = stable_image_url(absolute)
            if stable not in seen_images:
                seen_images.add(stable)
                nodes.append(Node(len(nodes), "image", url=absolute, alt="OpenGraph image"))

    text = "\n".join(node.text for node in nodes if node.kind != "image")
    if not title and text:
        title = text.splitlines()[0][:180]
    return Article(order, url, title, date, text, nodes)


def crawl_articles() -> list[Article]:
    urls = discover_article_urls()
    print(f"discovered {len(urls)} official product articles")
    articles: list[Article] = []
    for index, url in enumerate(urls, 1):
        article = parse_article(index, url)
        if article and article.nodes:
            articles.append(article)
        if index % 20 == 0:
            print(f"parsed {index}/{len(urls)} articles")
        time.sleep(0.05)
    return articles


def article_match(item: Requested, article: Article) -> tuple[float, str]:
    body = norm(article.text)
    title = norm(article.title)
    best = 0.0
    best_query = ""
    for query in query_variants(item):
        q = norm(query)
        if not q:
            continue
        score = 0.0
        if q in body:
            score += 900 + min(len(q), 30) * 7
            score += min(body.count(q), 5) * 18
        if q in title:
            score += 700 + min(len(q), 30) * 8
        for node in article.nodes:
            if node.kind == "image":
                continue
            nt = norm(node.text)
            if q in nt:
                score += 80
                if node.kind.startswith("h"):
                    score += 240
                if "商品名" in node.text or "商品名称" in node.text:
                    score += 420
        if score > best:
            best, best_query = score, query

    # Allow a dedicated article to win for variant components whose complete
    # catalogue label is not written as one phrase on the page.
    terms = focus_terms(item)
    for term in terms:
        if norm(term) in body:
            best += 90
        if norm(term) in title:
            best += 80

    # Newer catalogue pages are crawled first.  This tiny tie-breaker must never
    # outweigh an actual textual match.
    best += max(0, 20 - article.order / 20)
    return best, best_query


def choose_article(item: Requested, articles: list[Article]) -> tuple[Article | None, float, str]:
    ranked: list[tuple[float, Article, str]] = []
    for article in articles:
        score, query = article_match(item, article)
        if score > 0:
            ranked.append((score, article, query))
    if not ranked:
        return None, 0.0, ""
    ranked.sort(key=lambda value: value[0], reverse=True)
    score, article, query = ranked[0]
    return article, score, query


def occurrence_weights(item: Requested, article: Article) -> list[tuple[int, float, str]]:
    variants = query_variants(item)
    fterms = focus_terms(item)
    occurrences: list[tuple[int, float, str]] = []
    for node in article.nodes:
        if node.kind == "image":
            continue
        nt = norm(node.text)
        weight = 0.0
        reason = ""
        for query in variants:
            q = norm(query)
            if q and q in nt:
                value = 700 + min(len(q), 32) * 12
                if value > weight:
                    weight, reason = value, query
        for term in fterms:
            t = norm(term)
            if t and t in nt:
                value = 520 + min(len(t), 14) * 8
                if value > weight:
                    weight, reason = value, term
        if weight:
            if node.kind.startswith("h"):
                weight += 220
            if "商品名" in node.text or "商品名称" in node.text:
                weight += 520
            if "商品规格" in node.text:
                weight += 120
            occurrences.append((node.pos, weight, reason))
    if not occurrences:
        # Last resort: treat the article title as the anchor and prefer its hero.
        occurrences.append((0, 150, article.title))
    return occurrences


def context_for(article: Article, image_pos: int, radius: int = 4) -> str:
    texts = [
        node.text
        for node in article.nodes
        if node.kind != "image" and abs(node.pos - image_pos) <= radius
    ]
    return clean_text(" | ".join(texts))[:520]


def rank_images(item: Requested, article: Article) -> list[dict[str, Any]]:
    occurrences = occurrence_weights(item, article)
    ranked: list[dict[str, Any]] = []
    for node in article.nodes:
        if node.kind != "image" or not node.url:
            continue
        score = 0.0
        best_reason = ""
        for pos, weight, reason in occurrences:
            delta = node.pos - pos
            if delta >= 0:
                proximity = 520 / (1 + delta)
                direction = 90 if delta <= 3 else 0
            else:
                proximity = 280 / (1 + abs(delta))
                direction = 0
            value = weight + proximity + direction
            if value > score:
                score, best_reason = value, reason
        alt_n = norm(node.alt)
        for query in query_variants(item):
            q = norm(query)
            if q and q in alt_n:
                score += 450
        nearby = context_for(article, node.pos)
        for term in focus_terms(item):
            if norm(term) in norm(nearby):
                score += 110
        ranked.append(
            {
                "url": node.url,
                "stable_url": stable_image_url(node.url),
                "score": score,
                "reason": best_reason,
                "nearby": nearby,
                "pos": node.pos,
            }
        )
    ranked.sort(key=lambda value: value["score"], reverse=True)
    return ranked


def safe_filename(item: Requested) -> str:
    clean = re.sub(r"[^A-Za-z0-9._-]+", "_", item.code).strip("._") or f"set_{item.order}"
    return f"{item.order:03d}_{clean}.png"


def decode_image(content: bytes, destination: Path) -> tuple[int, int, str, float]:
    image = Image.open(io.BytesIO(content))
    image.load()
    image = ImageOps.exif_transpose(image).convert("RGBA")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        image = image.crop(bbox)
    if image.width < 2 or image.height < 2:
        raise ValueError("empty image")
    max_dim = 2400
    if max(image.size) > max_dim:
        ratio = max_dim / max(image.size)
        image = image.resize(
            (max(1, round(image.width * ratio)), max(1, round(image.height * ratio))),
            Image.Resampling.LANCZOS,
        )
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "PNG", optimize=True)
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    area = image.width * image.height
    quality = min(240.0, math.log10(max(area, 1)) * 32)
    if min(image.size) < 100:
        quality -= 180
    elif min(image.size) < 180:
        quality -= 80
    return image.width, image.height, digest, quality


def download_candidate(candidate: dict[str, Any], article_url: str, destination: Path) -> tuple[int, int, str, float]:
    response = get(candidate["url"], referer=article_url)
    content_type = response.headers.get("content-type", "").casefold()
    if "text/html" in content_type or len(response.content) < 250:
        raise ValueError("not a usable image response")
    return decode_image(response.content, destination)


def retrieve_one(item: Requested, articles: list[Article], audit: list[dict[str, Any]]) -> Result:
    result = Result(item.order, item.code, item.name)
    article, article_score, matched_query = choose_article(item, articles)
    if not article or article_score < 500:
        result.notes = "No sufficiently specific official product article match"
        return result

    result.article_title = article.title
    result.article_url = article.url
    result.article_score = round(article_score, 2)
    result.matched_query = matched_query
    candidates = rank_images(item, article)
    destination = IMAGES / safe_filename(item)
    successes: list[tuple[float, dict[str, Any], tuple[int, int, str, float], Path]] = []

    # Try enough candidates to survive decorative/thumbnail images, while keeping
    # the official site load bounded.
    for rank, candidate in enumerate(candidates[:10], 1):
        temp = destination.with_suffix(f".candidate{rank}.png")
        audit_row = {
            "order": item.order,
            "code": item.code,
            "name": item.name,
            "article_url": article.url,
            "article_title": article.title,
            "rank": rank,
            "candidate_score": round(candidate["score"], 2),
            "image_url": candidate["stable_url"],
            "nearby_text": candidate["nearby"],
            "outcome": "",
            "width": "",
            "height": "",
        }
        try:
            decoded = download_candidate(candidate, article.url, temp)
            width, height, digest, visual_quality = decoded
            final_score = candidate["score"] + visual_quality
            # Very small square assets are usually UI ornaments, not products.
            if width < 160 and height < 160:
                final_score -= 300
            successes.append((final_score, candidate, decoded, temp))
            audit_row.update(
                {
                    "outcome": "downloaded",
                    "width": width,
                    "height": height,
                    "final_score": round(final_score, 2),
                }
            )
        except (requests.RequestException, UnidentifiedImageError, OSError, ValueError) as exc:
            audit_row["outcome"] = f"failed:{type(exc).__name__}"
        audit.append(audit_row)

    if not successes:
        result.notes = "Official article matched, but no candidate image downloaded"
        return result

    successes.sort(key=lambda value: value[0], reverse=True)
    final_score, candidate, decoded, selected_temp = successes[0]
    for _, _, _, temp in successes[1:]:
        temp.unlink(missing_ok=True)
    destination.unlink(missing_ok=True)
    selected_temp.replace(destination)
    width, height, digest, _ = decoded

    result.status = "retrieved"
    result.asset_type = "official_product_or_article_image"
    result.image_url = candidate["stable_url"]
    result.local_file = str(destination.relative_to(OUT))
    result.width = width
    result.height = height
    result.sha256 = digest
    result.image_score = round(final_score, 2)
    result.nearby_text = candidate["nearby"]
    result.notes = "Official pokemon.cn image selected by nearest matching product text"
    return result


def write_article_catalog(articles: list[Article]) -> None:
    with ARTICLE_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=("order", "date", "title", "url", "image_count", "text_excerpt"),
        )
        writer.writeheader()
        for article in articles:
            writer.writerow(
                {
                    "order": article.order,
                    "date": article.date,
                    "title": article.title,
                    "url": article.url,
                    "image_count": sum(1 for node in article.nodes if node.kind == "image"),
                    "text_excerpt": clean_text(article.text)[:700],
                }
            )


def write_report(results: list[Result]) -> None:
    fields = list(asdict(results[0]).keys())
    with REPORT_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        for result in results:
            writer.writerow(asdict(result))


def write_audit(rows: list[dict[str, Any]]) -> None:
    fields = (
        "order",
        "code",
        "name",
        "article_url",
        "article_title",
        "rank",
        "candidate_score",
        "final_score",
        "image_url",
        "nearby_text",
        "outcome",
        "width",
        "height",
    )
    with CANDIDATE_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow(row)


def cjk_wrap(pdf: canvas.Canvas, text: str, max_width: float, font: str, size: float, max_lines: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for char in text:
        trial = current + char
        if current and pdfmetrics.stringWidth(trial, font, size) > max_width:
            lines.append(current)
            current = char
            if len(lines) >= max_lines:
                break
        else:
            current = trial
    if len(lines) < max_lines and current:
        lines.append(current)
    if len("".join(lines)) < len(text) and lines:
        while lines[-1] and pdfmetrics.stringWidth(lines[-1] + "…", font, size) > max_width:
            lines[-1] = lines[-1][:-1]
        lines[-1] += "…"
    return lines


def draw_missing(pdf: canvas.Canvas, cx: float, cy: float, width: float, height: float) -> None:
    pdf.saveState()
    pdf.setFillColor(colors.HexColor("#F2F4F7"))
    pdf.setStrokeColor(colors.HexColor("#C8CED8"))
    pdf.roundRect(cx - width / 2, cy - height / 2, width, height, 8, fill=1, stroke=1)
    pdf.setStrokeColor(colors.HexColor("#98A2B3"))
    pdf.line(cx - 25, cy - 14, cx + 25, cy + 14)
    pdf.line(cx - 25, cy + 14, cx + 25, cy - 14)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.setFillColor(colors.HexColor("#667085"))
    pdf.drawCentredString(cx, cy - height / 2 + 13, "NO VERIFIED OFFICIAL IMAGE")
    pdf.restoreState()


def build_pdf(results: list[Result]) -> None:
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    page_w, page_h = landscape(A4)
    margin_x, margin_top, footer = 24, 22, 22
    gap_x, gap_y = 12, 10
    cols, grid_rows = 2, 3
    cell_w = (page_w - margin_x * 2 - gap_x) / cols
    cell_h = (page_h - margin_top - footer - gap_y * 2) / grid_rows
    pages = math.ceil(len(results) / 6)

    pdf = canvas.Canvas(str(PDF_PATH), pagesize=(page_w, page_h))
    pdf.setTitle("Simplified Chinese Pokémon TCG set and product reference images")
    pdf.setAuthor("StackR official-source retrieval")

    for page in range(pages):
        for slot, result in enumerate(results[page * 6 : page * 6 + 6]):
            col, row = slot % 2, slot // 2
            x = margin_x + col * (cell_w + gap_x)
            y = page_h - margin_top - (row + 1) * cell_h - row * gap_y
            pdf.setFillColor(colors.HexColor("#FBFCFE"))
            pdf.setStrokeColor(colors.HexColor("#D7DCE5"))
            pdf.roundRect(x, y, cell_w, cell_h, 8, fill=1, stroke=1)

            pdf.setFont("Helvetica", 5.5)
            pdf.setFillColor(colors.HexColor("#667085"))
            label = "OFFICIAL PRODUCT/ARTICLE IMAGE" if result.status == "retrieved" else "MISSING"
            pdf.drawString(x + 8, y + cell_h - 11, label)
            pdf.drawRightString(x + cell_w - 8, y + cell_h - 11, f"{result.order:03d}")

            text_h = 48
            image_left = x + 18
            image_bottom = y + text_h
            image_top = y + cell_h - 16
            box_w = cell_w - 36
            box_h = image_top - image_bottom
            cx, cy = x + cell_w / 2, image_bottom + box_h / 2
            if result.local_file and (OUT / result.local_file).exists():
                try:
                    with Image.open(OUT / result.local_file) as image:
                        iw, ih = image.size
                    scale = min(box_w / iw, box_h / ih)
                    dw, dh = iw * scale, ih * scale
                    pdf.drawImage(
                        ImageReader(str(OUT / result.local_file)),
                        cx - dw / 2,
                        cy - dh / 2,
                        width=dw,
                        height=dh,
                        preserveAspectRatio=True,
                        mask="auto",
                    )
                except Exception:
                    draw_missing(pdf, cx, cy, box_w * 0.72, box_h * 0.72)
            else:
                draw_missing(pdf, cx, cy, box_w * 0.72, box_h * 0.72)

            badge_w = min(cell_w - 20, max(58, pdfmetrics.stringWidth(result.requested_code, "Helvetica-Bold", 8) + 18))
            badge_x, badge_y = x + (cell_w - badge_w) / 2, y + 30
            pdf.setFillColor(colors.HexColor("#E9EDF4"))
            pdf.setStrokeColor(colors.HexColor("#D3D9E4"))
            pdf.roundRect(badge_x, badge_y, badge_w, 14, 7, fill=1, stroke=1)
            pdf.setFillColor(colors.HexColor("#111827"))
            pdf.setFont("Helvetica-Bold", 8)
            pdf.drawCentredString(cx, badge_y + 4, result.requested_code)

            pdf.setFillColor(colors.HexColor("#1F2937"))
            pdf.setFont("STSong-Light", 7.2)
            lines = cjk_wrap(pdf, result.requested_name, cell_w - 20, "STSong-Light", 7.2, 2)
            for i, line in enumerate(lines):
                pdf.drawCentredString(cx, y + 21 - i * 8.2, line)

        pdf.setFillColor(colors.HexColor("#667085"))
        pdf.setFont("Helvetica", 7)
        pdf.drawString(margin_x, 10, "Official pokemon.cn reference imagery • exact supplied order • six per page")
        pdf.drawRightString(page_w - margin_x, 10, f"Page {page + 1} of {pages}")
        pdf.showPage()
    pdf.save()


def write_readme(results: list[Result], articles: list[Article]) -> None:
    retrieved = [r for r in results if r.status == "retrieved"]
    missing = [r for r in results if r.status != "retrieved"]
    duplicate_groups: dict[str, list[str]] = {}
    for result in retrieved:
        duplicate_groups.setdefault(result.sha256, []).append(result.requested_code)
    repeated = [codes for codes in duplicate_groups.values() if len(codes) > 1]
    lines = [
        "SIMPLIFIED CHINESE POKÉMON TCG SET / PRODUCT IMAGE BUNDLE",
        "========================================================",
        "",
        f"Requested entries: {len(results)}",
        f"Official product articles crawled: {len(articles)}",
        f"Official images retrieved: {len(retrieved)}",
        f"No verified official image selected: {len(missing)}",
        f"Repeated selected-image groups: {len(repeated)}",
        "",
        "The input is not solely a set-logo list. It also contains decks, promo series,",
        "gift boxes and individual sub-packs such as 改造包 / 奖赏包 / 嗨皮包.",
        "Accordingly, this bundle uses the nearest matching official pokemon.cn product",
        "or article image. It does not falsely label product photography as a standalone",
        "transparent set logo.",
        "",
        "retrieval_report.csv gives the selected official article, stable image URL,",
        "dimensions, SHA-256 and nearby page text for every entry.",
        "candidate_audit.csv records the alternative image candidates considered.",
    ]
    if missing:
        lines.extend(["", "Missing codes:", ", ".join(r.requested_code for r in missing)])
    if repeated:
        lines.extend(["", "Repeated-image groups (often legitimate shared product art):"])
        lines.extend("- " + ", ".join(codes) for codes in repeated)
    README_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_zip(results: list[Result]) -> None:
    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED, compresslevel=7) as archive:
        for result in results:
            if result.local_file and (OUT / result.local_file).exists():
                archive.write(OUT / result.local_file, arcname=result.local_file)
        for path in (REPORT_PATH, CANDIDATE_PATH, ARTICLE_PATH, README_PATH):
            archive.write(path, arcname=path.name)


def validate(results: list[Result]) -> None:
    from pypdf import PdfReader

    expected_pages = math.ceil(len(results) / 6)
    actual_pages = len(PdfReader(str(PDF_PATH)).pages)
    if actual_pages != expected_pages:
        raise RuntimeError(f"PDF pages: expected {expected_pages}, found {actual_pages}")
    if PDF_PATH.stat().st_size < 10_000:
        raise RuntimeError("PDF is implausibly small")
    with zipfile.ZipFile(ZIP_PATH) as archive:
        archive.testzip()
        names = set(archive.namelist())
        if REPORT_PATH.name not in names or README_PATH.name not in names:
            raise RuntimeError("ZIP lacks its report or README")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    IMAGES.mkdir(parents=True, exist_ok=True)
    requested = load_manifest()
    articles = crawl_articles()
    if not articles:
        raise RuntimeError("No official pokemon.cn product articles could be crawled")
    write_article_catalog(articles)

    results: list[Result] = []
    audit: list[dict[str, Any]] = []
    for item in requested:
        result = retrieve_one(item, articles, audit)
        results.append(result)
        print(
            f"[{item.order:03d}/{len(requested):03d}] {item.code:<14} "
            f"{result.status:<9} {result.article_title[:55]}"
        )

    write_report(results)
    write_audit(audit)
    write_readme(results, articles)
    build_pdf(results)
    build_zip(results)
    validate(results)

    retrieved = sum(result.status == "retrieved" for result in results)
    unique = len({result.sha256 for result in results if result.sha256})
    summary = {
        "requested": len(results),
        "articles_crawled": len(articles),
        "retrieved": retrieved,
        "missing": len(results) - retrieved,
        "unique_selected_images": unique,
        "pages": math.ceil(len(results) / 6),
        "pdf": PDF_PATH.name,
        "zip": ZIP_PATH.name,
        "report": REPORT_PATH.name,
    }
    SUMMARY_PATH.write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
