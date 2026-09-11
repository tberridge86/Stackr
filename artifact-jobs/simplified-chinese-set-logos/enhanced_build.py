#!/usr/bin/env python3
"""Enhanced official-source runner for the supplied Simplified Chinese list.

The general matcher intentionally refuses weak matches. This layer adds known
official product pages for families where the catalogue splits one article into
several component codes (deck, modification pack, prize pack, etc.). It improves
coverage without pretending that boxed-product imagery is a transparent set logo.
"""
from __future__ import annotations

import retrieve_set_images as m

# Extra names used on official pages.  They are additive; the original requested
# labels remain the primary labels in the PDF and CSV.
m.ALIAS_BY_CODE.update(
    {
        "csvh5ac": ["嗨皮组合 快龙&超梦&喷火驼&来悲粗茶", "改造包"],
        "csvh5ec": ["嗨皮组合 快龙&超梦&喷火驼&来悲粗茶", "嗨皮包"],
        "csvh5pc": ["嗨皮组合 快龙&超梦&喷火驼&来悲粗茶", "奖赏包"],
        "csvh4ac": ["嗨皮组合 狙射树枭&美录梅塔&故勒顿&密勒顿", "改造包"],
        "csvh4ec": ["嗨皮组合 狙射树枭&美录梅塔&故勒顿&密勒顿", "嗨皮包"],
        "csvh4pc": ["嗨皮组合 狙射树枭&美录梅塔&故勒顿&密勒顿", "奖赏包"],
        "csvh3ac": ["嗨皮组合 七夕青鸟&拉帝欧斯&烈焰猴&一家鼠", "改造包"],
        "csvh3pc": ["嗨皮组合 七夕青鸟&拉帝欧斯&烈焰猴&一家鼠", "奖赏包"],
        "csvh2ac": ["嗨皮组合 路卡利欧&甲贺忍蛙&藏玛然特&獒教父", "改造包"],
        "csvh2pc": ["嗨皮组合 路卡利欧&甲贺忍蛙&藏玛然特&獒教父", "奖赏包"],
        "csvh1ac": ["嗨皮组合 皮卡丘&皮皮&草苗龟&索财灵", "改造包"],
        "csvh1pc": ["嗨皮组合 皮卡丘&皮皮&草苗龟&索财灵", "奖赏包"],
        "csvl2c": ["游历专题包"],
        "csve2pc": ["对战派对 耀梦", "奖赏包"],
        "csve1pc": ["对战派对 共梦", "奖赏包"],
        "csyc": ["精灵球/等级球礼盒：宝可梦艺术插画庆典 聚", "宝可梦艺术插画庆典 聚"],
        "csjc": ["精灵球/高级球礼盒：宝可梦艺术插画庆典 景", "宝可梦艺术插画庆典 景"],
        "cs4.1c": ["辉耀能量专题包第一弹", "辉耀能量 第一弹"],
        "cs5.1c": ["辉耀能量专题包第二弹", "辉耀能量 第二弹"],
        "csdc": ["精灵球礼盒：皮卡丘传奇庆典", "超级球礼盒：皮卡丘传奇庆典"],
        "cs2.1c": ["喵喵小妙招"],
        "csm2.1c": ["辉金能量礼盒", "辉金能量进阶礼盒", "辉金能量专题包"],
        "csm2bc": ["交相辉映 魁"],
        "csm2cc": ["交相辉映 唤"],
        "csm1bc": ["横空出世 苍"],
        "csm1cc": ["横空出世 泽"],
        "promo-sv-p": ["朱&紫系列商品", "朱&紫 特典卡"],
        "promo-s-p": ["剑&盾系列商品", "剑&盾 特典卡"],
        "promo-sm-p": ["太阳&月亮系列商品", "太阳&月亮 特典卡"],
    }
)

# Official mainland-China pages that are either outside /tcg/product pagination
# or contain several separately coded product components.
FORCED_URLS = {
    # Scarlet & Violet Hippy product families
    "csvh5c": "https://www.pokemon.cn/tcg/product/22630.html",
    "csvh5ac": "https://www.pokemon.cn/tcg/product/22630.html",
    "csvh5ec": "https://www.pokemon.cn/tcg/product/22630.html",
    "csvh5pc": "https://www.pokemon.cn/tcg/product/22630.html",
    "csvh4c": "https://www.pokemon.cn/tcg/product/21022.html",
    "csvh4ac": "https://www.pokemon.cn/tcg/product/21022.html",
    "csvh4ec": "https://www.pokemon.cn/tcg/product/21022.html",
    "csvh4pc": "https://www.pokemon.cn/tcg/product/21022.html",
    "csvh3c": "https://www.pokemon.cn/tcg/product/15447.html",
    "csvh3ac": "https://www.pokemon.cn/tcg/product/15447.html",
    "csvh3pc": "https://www.pokemon.cn/tcg/product/15447.html",
    "csvh2c": "https://www.pokemon.cn/tcg/product/15514.html",
    "csvh2ac": "https://www.pokemon.cn/tcg/product/15514.html",
    "csvh2pc": "https://www.pokemon.cn/tcg/product/15514.html",
    "csvh1c": "https://www.pokemon.cn/tcg/product/15585.html",
    "csvh1ac": "https://www.pokemon.cn/tcg/product/15585.html",
    "csvh1pc": "https://www.pokemon.cn/tcg/product/15585.html",
    # Main sets and specialist packs
    "csv6c": "https://www.pokemon.cn/tcg/17555.html",
    "csvl2c": "https://www.pokemon.cn/tcg/17590.html",
    "csve2c": "https://www.pokemon.cn/tcg/product/15463.html",
    "csve2pc": "https://www.pokemon.cn/tcg/product/15463.html",
    "csve1c": "https://www.pokemon.cn/tcg/product/15512.html",
    "csve1pc": "https://www.pokemon.cn/tcg/product/15512.html",
    "promo-sv-p": "https://www.pokemon.cn/tcg/product/15585.html",
    # Sword & Shield boxes/special packs
    "cs0lc": "https://www.pokemon.cn/tcg/product/15625.html",
    "csyc": "https://www.pokemon.cn/tcg/product/15625.html",
    "csjc": "https://www.pokemon.cn/tcg/product/15840.html",
    "cs4.1c": "https://www.pokemon.cn/tcg/product/15928.html",
    "cs5.1c": "https://www.pokemon.cn/tcg/product/15806.html",
    "csdc": "https://www.pokemon.cn/tcg/product/16031.html",
    "cs2.1c": "https://www.pokemon.cn/tcg/event/16053.html",
    "csm2.1c": "https://www.pokemon.cn/tcg/product/16139.html",
    "cs2dac": "https://www.pokemon.cn/tcg/product/16063.html",
    # Original and modified Battle Party component codes share a product family.
    "csmpac": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpbc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpcc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpdc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpec": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpfc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpgc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmphc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpic": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpjc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpkc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmplc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpmc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpnc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpoc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmppc": "https://www.pokemon.cn/tcg/product/16282.html",
    "csmpqc": "https://www.pokemon.cn/tcg/product/16282.html",
    # First mainland SM/SWSH release families
    "csm1ac": "https://www.pokemon.cn/tcg/product/16368.html",
    "csm1bc": "https://www.pokemon.cn/tcg/product/16368.html",
    "csm1cc": "https://www.pokemon.cn/tcg/product/16368.html",
    "csm1dc": "https://www.pokemon.cn/tcg/product/16368.html",
    "promo-sm-p": "https://www.pokemon.cn/tcg/product/16368.html",
    "csm2ac": "https://www.pokemon.cn/tcg/product/16336.html",
    "csm2bc": "https://www.pokemon.cn/tcg/product/16336.html",
    "csm2cc": "https://www.pokemon.cn/tcg/product/16336.html",
    "csm2dc": "https://www.pokemon.cn/tcg/product/16336.html",
    "cs1ac": "https://www.pokemon.cn/tcg/product/16268.html",
    "cs1bc": "https://www.pokemon.cn/tcg/product/16268.html",
    "cs1dc": "https://www.pokemon.cn/tcg/product/16268.html",
    "csac": "https://www.pokemon.cn/tcg/product/16268.html",
    "promo-s-p": "https://www.pokemon.cn/tcg/product/16268.html",
}

_original_discover = m.discover_article_urls


def discover_with_known_pages() -> list[str]:
    urls = _original_discover()
    for url in FORCED_URLS.values():
        if url not in urls:
            urls.append(url)
    return urls


m.discover_article_urls = discover_with_known_pages
_original_choose = m.choose_article


def choose_with_verified_family(item: m.Requested, articles: list[m.Article]):
    forced = FORCED_URLS.get(item.code.casefold())
    if forced:
        article = next((entry for entry in articles if entry.url == forced), None)
        if article is not None:
            score, query = m.article_match(item, article)
            # The page itself is manually verified; image selection still uses the
            # requested component terms and nearest-text scoring.
            return article, max(score, 5000.0), query or item.name
    return _original_choose(item, articles)


m.choose_article = choose_with_verified_family

import fast_build  # noqa: E402

raise SystemExit(fast_build.main())
