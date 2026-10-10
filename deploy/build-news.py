#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build-news.py —— 由结构化数据生成新闻板块页面（幂等）

产出：
    news.html                   英文列表页
    news/<slug>.html            英文详情页 × N
    cn/news.html                中文列表页
    cn/news/<slug>.html         中文详情页 × N

数据源（v0.28.0 起新闻已入库，**优先读数据库**）：
    SQLite  news 表              —— 后台 /admin/ 维护的就是这张表
    兜底    deploy/news-data.json + deploy/cn-translations.json
            （数据库不可用时回落到 JSON，保证老流程仍能跑）

    ⚠️ 两种来源必须产出**逐字节相同**的页面；改动任一渲染逻辑后，
       都要用 `--check` 在两种来源下各跑一次。

内容纪律：
    正文全部来自原官网 www.wx-seastar.com 的 NEWS CENTER（实测抓取）。
    **不添加原文没有的信息**；翻译保持段落一一对应。
    对纯图集文章（原文无正文）如实只呈现图片，不补写文字。

用法：
    python3 deploy/build-news.py [--check]

⚠️ 本机 Windows 写文件必须显式 newline='\n'。
"""

import argparse
import io
import json
import os
import re
import sqlite3
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = "https://www.wx-seastar.cn"
OG_IMAGE = SITE + "/assets/seastar-og.jpg"

NAV_EN = [
    ("/lighting", "General Lighting", True),   # True = 带下拉菜单
    ("/grow-light", "Horticulture", False),
    ("/odm", "ODM", False),
    ("/oem", "OEM", False),
    ("/facilities", "Facilities", False),
    ("/docs", "Documents", False),
    ("/news", "News", False),
    ("/about", "About Us", False),
    ("/contact", "Contact Us", False),
]
NAV_CN = [
    ("/cn/lighting", "通用照明", True),
    ("/cn/grow-light", "植物灯具", False),
    ("/cn/odm", "ODM", False),
    ("/cn/oem", "OEM", False),
    ("/cn/facilities", "研发与设施", False),
    ("/cn/docs", "资料中心", False),
    ("/cn/news", "新闻中心", False),
    ("/cn/about", "关于我们", False),
    ("/cn/contact", "联系我们", False),
]


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def head(lang, title, desc, canonical, up, active):
    """up: 相对站点根的资源前缀（'' / '../' / '../../'）"""
    nav = NAV_EN if lang == "en" else NAV_CN
    items = []
    for href, label, is_dropdown in nav:
        cls = ' class="is-active"' if label in active else ""
        if is_dropdown:
            # 「通用照明 / General Lighting」是下拉项，必须与站点其它页面结构一致
            sub = [("?scene=home", "Residential", "家居照明"),
                   ("?scene=commercial", "Commercial", "商业照明"),
                   ("?scene=outdoor", "Outdoor", "户外照明")]
            subhtml = "\n".join(
                '          <a href="%s%s">%s</a>' % (href, q, (en if lang == "en" else cn))
                for q, en, cn in sub)
            trig_cls = ' class="nav__dropdown-trigger is-active"' if label in active \
                else ' class="nav__dropdown-trigger"'
            items.append(
                '      <div class="nav__dropdown">\n'
                '        <a href="%s"%s>%s</a>\n'
                '        <div class="nav__dropdown-menu">\n%s\n        </div>\n'
                '      </div>' % (href, trig_cls, label, subhtml))
        else:
            items.append('      <a href="%s"%s>%s</a>' % (href, cls, label))
    nav_html = "\n".join(items)
    lang_attr = "en" if lang == "en" else "zh-CN"
    locale = "en_US" if lang == "en" else "zh_CN"
    # 语言切换：EN ↔ CN 的对应地址
    if lang == "en":
        alt_href = canonical.replace(SITE + "/", SITE + "/cn/")
        switch = '<a class="lang-switch" href="%s" title="中文版">中文</a>' % alt_href
    else:
        alt_href = canonical.replace(SITE + "/cn/", SITE + "/")
        switch = '<a class="lang-switch" href="%s" title="English">EN</a>' % alt_href
    home = "/" if lang == "en" else "/cn/"
    logo_href = home
    cta = "Get a quote" if lang == "en" else "获取报价"
    cta_href = "/contact" if lang == "en" else "/cn/contact"
    burger = "打开菜单" if lang == "en" else "打开菜单"
    return f"""<!DOCTYPE html>
<html lang="{lang_attr}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{canonical}">
<meta name="theme-color" content="var(--ink-900)">
<meta property="og:type" content="article">
<meta property="og:site_name" content="SEA☆STAR 实益达">
<meta property="og:locale" content="{locale}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{canonical}">
<meta property="og:image" content="{OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="{up}favicon.ico" sizes="any">
<link rel="apple-touch-icon" href="{up}apple-touch-icon.png">
<script>window.__SEASTAR_LANG__='{"en" if lang == "en" else "zh"}'</script>
<link rel="stylesheet" href="{up}styles.css">
<noscript><style>.reveal{{opacity:1;transform:none}}</style></noscript>
</head>
<body>

<header class="nav nav--transparent" id="nav" data-nav-transparent="false" style="color:var(--text-primary);">
  <div class="nav__inner">
    <a class="nav__logo" href="{logo_href}">
      <span class="brand-swap"><img src="{up}assets/seastar-logo-light.png" alt="SEA☆STAR 实益达" class="brand-img brand-img--nav brand-img--on-dark" width="128" height="34" decoding="async"><img src="{up}assets/seastar-logo-conv.png" alt="" aria-hidden="true" class="brand-img brand-img--nav brand-img--on-light" width="128" height="34" decoding="async"></span>
    </a>
    <nav class="nav__links" aria-label="{'Main navigation' if lang == 'en' else '主导航'}">
{nav_html}
    </nav>
    <div class="nav__right">
      {switch}
      <a class="btn btn--primary btn--sm" href="{cta_href}">{cta}</a>
      <button class="nav__burger" aria-label="{burger}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
    </div>
  </div>
</header>
"""


def footer(lang, up):
    if lang == "en":
        return f"""<footer class="footer section-tight">
  <div class="container">
    <div class="footer__grid">
      <div>
        <div class="footer__logo">
          <img src="{up}assets/seastar-logo-light.png" alt="SEA☆STAR 实益达" class="brand-img brand-img--footer" width="160" height="43" decoding="async">
        </div>
        <p class="small mt-md" style="color:var(--text-on-dark-muted);max-width:36ch;">A complete lighting solutions provider. General lighting · ODM · OEM.</p>
      </div>
      <div class="footer__col">
        <h4>Business lines</h4>
        <a href="/lighting">General Lighting</a>
        <a href="/lighting?scene=home" class="drawer__sub">Residential</a>
        <a href="/lighting?scene=commercial" class="drawer__sub">Commercial</a>
        <a href="/lighting?scene=outdoor" class="drawer__sub">Outdoor</a>
        <a href="/grow-light">Horticulture Lighting</a>
        <a href="/odm">ODM Drivers &amp; Control Boards</a>
        <a href="/oem">OEM Electronics Manufacturing</a>
      </div>
      <div class="footer__col">
        <h4>Company</h4>
        <a href="/about">About Us</a>
        <a href="/about#history">Milestones</a>
        <a href="/facilities">Facilities</a>
        <a href="/about#factory">Factory &amp; Capacity</a>
        <a href="/news">News</a>
        <a href="/contact">Contact Us</a>
      </div>
      <div class="footer__col">
        <h4>Contact</h4>
        <a href="mailto:edison_liu@wx-seastar.com">edison_liu@wx-seastar.com</a>
        <a href="tel:+8651068506661">0510-68506661</a>
        <a href="/contact">West of Jing 11th Rd, North of Jing 13th Rd, South of the planned canal, Hongshan Sub-district, Xinwu District, Wuxi, Jiangsu, PRC</a>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© 2026 Wuxi Seastar Lighting Co., Ltd. All rights reserved.</span>
      <span class="mono">SEA☆STAR</span>
      <button type="button" class="footer__cc" data-cookie-settings>Cookie settings</button>
    </div>
  </div>
</footer>

<script src="{up}js/app.js"></script>
<script src="{up}js/site.js" defer></script>
<script src="{up}js/consent.js" defer></script>
</body>
</html>
"""
    return f"""<footer class="footer section-tight">
  <div class="container">
    <div class="footer__grid">
      <div>
        <div class="footer__logo">
          <img src="{up}assets/seastar-logo-light.png" alt="SEA☆STAR 实益达" class="brand-img brand-img--footer" width="160" height="43" decoding="async">
        </div>
        <p class="small mt-md" style="color:var(--text-on-dark-muted);max-width:36ch;">照明整体解决方案提供商。通用照明 · ODM · OEM。</p>
      </div>
      <div class="footer__col">
        <h4>业务线</h4>
        <a href="/cn/lighting">通用照明灯具</a>
        <a href="/cn/grow-light">植物照明灯具</a>
        <a href="/cn/odm">ODM 驱动与控制板</a>
        <a href="/cn/oem">OEM 电子制造服务</a>
      </div>
      <div class="footer__col">
        <h4>公司</h4>
        <a href="/cn/about">关于我们</a>
        <a href="/about#history">发展历程</a>
        <a href="/cn/facilities">研发与设施</a>
        <a href="/about#factory">工厂与产能</a>
        <a href="/cn/news">新闻中心</a>
        <a href="/cn/contact">联系我们</a>
      </div>
      <div class="footer__col">
        <h4>联系</h4>
        <a href="mailto:edison_liu@wx-seastar.com">edison_liu@wx-seastar.com</a>
        <a href="tel:+8651068506661">0510-68506661</a>
        <a href="/cn/contact">江苏省无锡市新吴区鸿山街道经十一路以西、经十三路以北、规划河道以南</a>
      </div>
    </div>
    <div class="footer__bottom">
      <span>© 2026 无锡市益明光电有限公司 保留所有权利。</span>
      <span class="mono">SEA☆STAR 实益达</span>
      <button type="button" class="footer__cc" data-cookie-settings>Cookie 设置</button>
    </div>
  </div>
</footer>

<script src="{up}js/app.js"></script>
<script src="{up}js/site.js" defer></script>
<script src="{up}js/consent.js" defer></script>
</body>
</html>
"""


def write(path, html):
    with io.open(path, "w", encoding="utf-8", newline="\n") as f:
        f.write(html)


def list_page(lang, arts, up, tr=None):
    if lang == "en":
        title = "News &amp; Events · SEA☆STAR"
        desc = "Company news, exhibitions and milestones from SEA☆STAR."
        h1 = "News &amp; Events"
        overline = "NEWSROOM"
        intro = "Company news, exhibition reports and milestones. Newest first."
        crumb_home, crumb_here = "Home", "News"
        cta = ('<a class="btn btn--primary btn--lg" href="/contact">Contact us</a>')
        canonical = SITE + "/news"
        card_href = lambda s: "/news/%s" % s
    else:
        title = "新闻中心 · SEA☆STAR 实益达"
        desc = "SEA☆STAR 实益达公司新闻、展会动态与里程碑。"
        h1 = "新闻中心"
        overline = "新闻动态"
        intro = "公司新闻、展会报道与里程碑，最新在前、最早在后。"
        crumb_home, crumb_here = "首页", "新闻中心"
        cta = ('<a class="btn btn--primary btn--lg" href="/cn/contact">联系我们</a>')
        canonical = SITE + "/cn/news"
        card_href = lambda s: "/cn/news/%s" % s

    cards = []
    for i, a in enumerate(arts):
        t = (tr or {}).get(a["id"], {})
        title_txt = t.get("title") or a["title"]
        # 摘要：中文页优先取译文 summary，缺则回落英文原文
        sm = (t.get("summary") or a.get("summary") or "").strip()
        sm_html = ('\n          <p class="news-card__summary small text-secondary">%s</p>' % esc(sm)) if sm else ""
        thumb = up + a["thumb"]
        delay = "" if i % 3 == 0 else " reveal-d%d" % (i % 3)
        media = ('<a class="news-card__media" href="%s" aria-hidden="true" tabindex="-1"><img src="%s" alt="" loading="lazy" decoding="async"></a>'
                 % (card_href(a["slug"]), thumb)) if a.get("thumb") else ""
        cards.append(f"""      <article class="news-card reveal{delay}">
        {media}
        <div class="news-card__body">
          <div class="news-card__date">{a['date']}</div>
          <h2 class="news-card__title h4"><a href="{card_href(a['slug'])}">{esc(title_txt)}</a></h2>{sm_html}
        </div>
      </article>""")

    body = "\n".join(cards)
    return (head(lang, title, desc, canonical, up, {"News" if lang == "en" else "新闻中心"})
            + f"""
<main>

<section class="hero-split hero-light hero-light--sub">
  <div class="container relative">
    <nav class="hero-breadcrumb" aria-label="面包屑">
      <a href="{'/' if lang == 'en' else '/cn/'}">{crumb_home}</a><span>/</span><span>{crumb_here}</span>
    </nav>
    <div class="reveal" style="max-width:820px;">
      <span class="overline">{overline}</span>
      <h1 class="display mt-md">{h1}</h1>
      <p class="body-l mt-lg text-secondary measure">{intro}</p>
      <div class="flex gap-md mt-2xl" style="flex-wrap:wrap;">{cta}</div>
    </div>
  </div>
</section>

<section class="section-tight">
  <div class="container">
    <div class="grid grid-3 mt-3xl">
{body}
    </div>
  </div>
</section>

</main>

""" + footer(lang, up))


def article_page(lang, a, prev_a, next_a, up, tr=None):
    t = (tr or {}).get(a["id"], {})
    title_txt = t.get("title") or a["title"]
    paras = t.get("paras") or [] if lang == "cn" else a["paras"]
    imgs = a.get("images") or []
    if lang == "en":
        canonical = "%s/news/%s" % (SITE, a["slug"])
        meta_date_label = a["date"]
        back = "All news"
        prev_l, next_l = "Previous", "Next"
        no_text = "This entry is a photo report; no body text was provided."
        crumb_home = "Home"
        canonical_prefix = "/news/"
    else:
        canonical = "%s/cn/news/%s" % (SITE, a["slug"])
        meta_date_label = a["date"]
        back = "返回新闻中心"
        prev_l, next_l = "上一篇", "下一篇"
        no_text = "本篇为图片报道，未附文字说明。"
        crumb_home = "首页"
        canonical_prefix = "/cn/news/"

    figs, lead = [], ""
    for i, src in enumerate(imgs):
        u = up + src
        if i == 0:
            lead = f"""      <figure class="article__figure reveal">
        <img src="{u}" alt="{esc(title_txt)}" loading="eager" decoding="async">
      </figure>"""
        else:
            figs.append(f"""      <figure class="article__figure reveal reveal-d{(i % 4) + 1}">
        <img src="{u}" alt="{esc(title_txt)}" loading="lazy" decoding="async">
      </figure>""")

    if paras:
        body_html = "\n".join("      <p>%s</p>" % esc(p) for p in paras)
    else:
        body_html = '      <p class="text-secondary">%s</p>' % esc(no_text)

    nav_links = []
    if prev_a:
        nav_links.append('<a href="%s%s">&larr; %s<br><span class="small text-secondary">%s</span></a>'
                         % (canonical_prefix, prev_a["slug"], prev_l, esc((( tr or {}).get(prev_a["id"], {}).get("title") or prev_a["title"])[:60])))
    else:
        nav_links.append("<span></span>")
    if next_a:
        nav_links.append('<a href="%s%s" style="text-align:right">%s &rarr;<br><span class="small text-secondary">%s</span></a>'
                         % (canonical_prefix, next_a["slug"], next_l, esc(((tr or {}).get(next_a["id"], {}).get("title") or next_a["title"])[:60])))
    else:
        nav_links.append("<span></span>")

    if lang == "en":
        back_link = '<a class="btn btn--secondary btn--sm" href="/news">← %s</a>' % back
    else:
        back_link = '<a class="btn btn--secondary btn--sm" href="/cn/news">← %s</a>' % back

    desc = (paras[0][:150] if paras else title_txt)[:155]
    # 详情页导语：老站新闻列表的摘要文案（原文为口号式短句）
    sm = ((tr or {}).get(a["id"], {}).get("summary") or a.get("summary") or "").strip()
    summ_html = ('      <p class="body-l lead-quote">%s</p>\n' % esc(sm)) if sm else ""
    return (head(lang, "%s · SEA☆STAR" % esc(title_txt), desc, canonical, up,
                 {"News" if lang == "en" else "新闻中心"})
            + f"""
<main>

<article class="section-tight">
  <div class="container">
    <nav class="hero-breadcrumb" aria-label="面包屑" style="margin-bottom:var(--space-lg);">
      <a href="{'/' if lang == 'en' else '/cn/'}">{crumb_home}</a><span>/</span><a href="{'/news' if lang == 'en' else '/cn/news'}">{'News' if lang == 'en' else '新闻中心'}</a><span>/</span><span>{esc(title_txt)[:40]}</span>
    </nav>

    <div class="article">
      <div class="article__meta">
        <time datetime="{a['date']}">{meta_date_label}</time>
        <span>·</span>
        <span>SEA☆STAR</span>
      </div>
      <h1 class="h2">{esc(title_txt)}</h1>

{summ_html}
{lead}

      <div class="article__body reveal">
{body_html}
      </div>

      <div class="article__body">
{chr(10).join(figs) if figs else ''}
      </div>

      <div class="article-nav">
        {nav_links[0]}
        {nav_links[1]}
      </div>

      <p class="mt-2xl">{back_link}</p>
    </div>
  </div>
</article>

</main>

""" + footer(lang, up))


DB_PATH = os.environ.get("WX_DB", "/var/lib/wx-seastar/data.db")


def load_from_db():
    """从 SQLite 的 news 表读出 (data, tr)，字段语义与 JSON 来源完全一致。

    ⚠️ 返回的 `tr` 结构必须与 cn-translations.json 一致：
       { src_id: {"title":…, "summary":…, "paras":[…] } }
       下面的渲染函数直接沿用，模板一行都不用改 —— 这是"零回归"的前提。
    """
    con = sqlite3.connect("file:%s?mode=ro" % DB_PATH, uri=True)
    con.row_factory = sqlite3.Row
    try:
        rows = con.execute(
            "SELECT * FROM news WHERE published = 1 "
            "ORDER BY sort_order ASC, date DESC, id ASC").fetchall()
    finally:
        con.close()

    data, tr = [], {}
    for r in rows:
        data.append({
            "id": r["src_id"],
            "slug": r["slug"],
            "date": r["date"],
            "title": r["title"],
            "summary": r["summary"] or "",
            "thumb": r["thumb"],
            "images": json.loads(r["images"] or "[]"),
            "paras": json.loads(r["paras"] or "[]"),
        })
        # 只要该条有任何中文内容，就建译文项（与 JSON 里"存在该键"等价）
        paras_zh = json.loads(r["paras_zh"] or "[]")
        if r["title_zh"] is not None or r["summary_zh"] is not None or paras_zh:
            tr[r["src_id"]] = {
                "title": r["title_zh"],
                "summary": r["summary_zh"],
                "paras": paras_zh,
            }
    return data, tr


def load_from_json():
    data = json.load(io.open(os.path.join(REPO, "deploy", "news-data.json"), encoding="utf-8"))
    trpath = os.path.join(REPO, "deploy", "cn-translations.json")
    tr = json.load(io.open(trpath, encoding="utf-8")) if os.path.exists(trpath) else {}
    return data, tr


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--from-json", action="store_true",
                    help="强制用 JSON 兜底来源（默认：数据库可用则用数据库）")
    args = ap.parse_args()

    use_db = (not args.from_json) and os.path.exists(DB_PATH)
    if use_db:
        data, tr = load_from_db()
        print("数据源：数据库 %s（%d 条）" % (DB_PATH, len(data)))
    else:
        data, tr = load_from_json()
        print("数据源：JSON（%d 条）%s" % (len(data), "" if args.from_json else " —— 未找到数据库，已回落"))

    data.sort(key=lambda a: a["date"], reverse=True)
    os.makedirs(os.path.join(REPO, "news"), exist_ok=True)
    os.makedirs(os.path.join(REPO, "cn", "news"), exist_ok=True)

    n = 0
    write(os.path.join(REPO, "news.html"), list_page("en", data, "", None)); n += 1
    write(os.path.join(REPO, "cn", "news.html"), list_page("cn", data, "../", tr)); n += 1
    for i, a in enumerate(data):
        prev_a = data[i - 1] if i > 0 else None
        next_a = data[i + 1] if i < len(data) - 1 else None
        write(os.path.join(REPO, "news", a["slug"] + ".html"),
              article_page("en", a, prev_a, next_a, "../", None)); n += 1
        write(os.path.join(REPO, "cn", "news", a["slug"] + ".html"),
              article_page("cn", a, prev_a, next_a, "../../", tr)); n += 1
    print("生成 %d 个页面（列表 2 + 详情 %d）" % (n, 2 * len(data)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
