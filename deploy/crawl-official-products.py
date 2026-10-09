#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从原官网 www.wx-seastar.com **完整**爬取产品清单与产品图。

为什么需要它（2026-10-09 血泪教训）：
    此前只抓了 LED 栏目的**第 1 页**（24 个产品），就当成"全部"，
    结果漏了 59 个 —— 整整几个产品线（Wallpack / High Bay / Flood / 灯带…）都没进来。
    原官网的 URL 结构是分层的，**必须按栏目+分页全量遍历**：

        /forum/id/15448/                 LED LIGHTING 主栏目（共 4 页）
        /forum/id/15448/cid/15449/       └ EUROPE        （市场分区）
        /forum/id/15448/cid/15450/       └ NORTH AMERICA
        /forum/id/15448/cid/15451/       └ ASIA
        /forum/id/15448/cid/15452/       └ SOUTH AMERICA（空）
        /forum/id/15448/page/N/          主栏目第 N 页
        /page/28684/                      DRIVER AND CONTROL BOARD (ODM/OEM)
        /forum/post/<id>/                 产品详情页（正文通常是空的，只有标题）

🔴 两条实测约束（缺一不可）：
    1. **页面必须用真浏览器抓** —— curl / requests 一律 **403**（站点有 WAF，
       加全套 Sec-Fetch / Referer 头也没用，疑似 TLS 指纹校验）。
       故本脚本用无头 Chrome `--dump-dom`，并行抓取。
    2. **图片可以用 curl** —— 图片源 resources.jsmo.xin 不拦 curl，但必须：
         · 用 **http**（https 一律 403）
         · 带 `Referer: http://www.wx-seastar.com/`
       下载到的是 **WebP**（扩展名伪装成 png/jpg），要用 Pillow 转真 JPEG。

依赖：
    · Chrome（路径见下方 CHROME，按本机调整）
    · Pillow —— 本机可用 `C:\\Program Files\\Inkscape\\bin\\python.exe`（自带 Pillow 12）
      或自行 pip install Pillow

用法：
    python crawl-official-products.py fetch     # 只抓页面（缓存到 .crawl/pages）
    python crawl-official-products.py parse     # 解析出产品清单 .crawl/products.json
    python crawl-official-products.py imgs      # 下载并转换产品图
    python crawl-official-products.py all       # 三步全做

输出：
    .crawl/products.json    [{post, name, img, src[]}]
    .crawl/pages/*.html     原始页面（按 URL 的 md5 命名，可重复使用）
    assets/img/product/<slug>.jpg   产品图（slug 需另行映射，见下）

⚠️ slug 映射不在此脚本内：产品 slug 属于**业务命名**，需人工确认后再定，
    定稿后写进 server/src/tools/seed-products.js。
"""
import os
import re
import sys
import json
import hashlib
import subprocess
import concurrent.futures

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(REPO, '.crawl')
PAGES = os.path.join(BASE, 'pages')
PROF = os.path.join(BASE, 'prof')
IMGDIR = os.path.join(BASE, 'img')

# 按本机调整
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/128.0 Safari/537.36')
REFERER = 'http://www.wx-seastar.com/'

# 栏目地图（2026-10-09 实测）
LED_ID = '15448'
CIDS = {'15449': 'EUROPE', '15450': 'NORTH AMERICA', '15451': 'ASIA', '15452': 'SOUTH AMERICA'}
ODM_PAGE = 'http://www.wx-seastar.com/page/28684/'


def page_path(url):
    return os.path.join(PAGES, hashlib.md5(url.encode()).hexdigest()[:12] + '.html')


def fetch_one(args):
    i, url = args
    fp = page_path(url)
    if os.path.exists(fp) and os.path.getsize(fp) > 2000:
        return url, os.path.getsize(fp), 'cached'
    os.makedirs(PAGES, exist_ok=True)
    os.makedirs(PROF, exist_ok=True)
    with open(fp, 'wb') as f:
        try:
            subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-sandbox',
                            '--virtual-time-budget=15000',
                            '--user-data-dir=' + os.path.join(PROF, 'p%d' % i),
                            '--dump-dom', url],
                           stdout=f, stderr=subprocess.DEVNULL, timeout=120)
        except subprocess.TimeoutExpired:
            return url, 0, 'timeout'
    return url, os.path.getsize(fp), 'ok'


def cmd_fetch():
    """抓主栏目 4 页 + 4 个分区 + ODM 页。并发别开太高（>3 会偶发返回空）。"""
    urls = []
    for n in range(1, 7):
        urls.append('http://www.wx-seastar.com/forum/id/%s/page/%d/' % (LED_ID, n))
    for cid in CIDS:
        for n in range(1, 5):
            urls.append('http://www.wx-seastar.com/forum/id/%s/cid/%s/page/%d/' % (LED_ID, cid, n))
    urls.append(ODM_PAGE)
    urls = list(dict.fromkeys(urls))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        for url, sz, st in ex.map(fetch_one, enumerate(urls)):
            if sz:
                print('  %-9s %8d  %s' % (st, sz, url))


def parse_blocks(t):
    """从列表页取真正带图的 item_block（页脚块没有 background-image，会被自动排除）"""
    out = []
    for b in re.findall(r'<li[^>]*class="[^"]*item_block[^"]*"[\s\S]*?</li>', t, re.I):
        m = re.search(r'background-image\s*:\s*url\(([^)]+)\)', b)
        if not m:
            continue
        a = re.search(r'<a[^>]*class="[^"]*title[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]{0,160}?)</a>', b)
        if not a:
            continue
        post = re.search(r'/forum/post/(\d+)/', a.group(1))
        name = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', a.group(2))).strip()
        out.append({'post': post.group(1) if post else '',
                    'name': name.replace('&amp;', '&'),
                    'img': m.group(1).strip('\'"')})
    return out


def cmd_parse():
    agg = {}
    sources = [('ALL', 'http://www.wx-seastar.com/forum/id/%s/page/%%d/' % LED_ID)]
    for cid, tag in CIDS.items():
        sources.append((tag, 'http://www.wx-seastar.com/forum/id/%s/cid/%s/page/%%d/' % (LED_ID, cid)))
    for tag, tpl in sources:
        for n in range(1, 7):
            fp = page_path(tpl % n)
            if not os.path.exists(fp) or os.path.getsize(fp) < 2000:
                continue
            rows = parse_blocks(open(fp, encoding='utf-8', errors='replace').read())
            if not rows:
                continue
            print('  %-14s page%d : %d 个' % (tag, n, len(rows)))
            for r in rows:
                k = r['post'] or r['name']
                if k not in agg:
                    r['src'] = set()
                    agg[k] = r
                agg[k]['src'].add('%s-p%d' % (tag, n))
    data = [{'post': v['post'], 'name': v['name'], 'img': v['img'], 'src': sorted(v['src'])}
            for v in agg.values()]
    os.makedirs(BASE, exist_ok=True)
    with open(os.path.join(BASE, 'products.json'), 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print('\n  去重后产品总数: %d  ->  .crawl/products.json' % len(data))


def cmd_imgs():
    """下载图片并按现有 slug 命名（slug 从 products.json 的 name 反查 seed-products.js）"""
    from PIL import Image
    os.makedirs(IMGDIR, exist_ok=True)
    seed = open(os.path.join(REPO, 'server', 'src', 'tools', 'seed-products.js'), encoding='utf-8').read()
    block = re.search(r'const PRODUCTS = \[[\s\S]*?\n\];', seed).group(0)
    prods = {p[1]: p[0] for p in eval(block.split('=', 1)[1].strip().rstrip(';'), {}, {})}  # noqa
    data = json.load(open(os.path.join(BASE, 'products.json'), encoding='utf-8'))
    out = os.path.join(REPO, 'assets', 'img', 'product')
    num = {'png': 'PNG', 'jpg': 'JPEG', 'jpeg': 'JPEG', 'webp': 'WEBP'}
    ok = miss = fail = 0
    for p in data:
        slug = prods.get(p['name'])
        if not slug:
            miss += 1
            continue
        dst = os.path.join(out, slug + '.jpg')
        if os.path.exists(dst) and os.path.getsize(dst) > 5000:
            ok += 1
            continue
        url = 'http:' + p['img'] if p['img'].startswith('//') else p['img']
        tmp = os.path.join(IMGDIR, slug + '.' + num.get(url.rsplit('.', 1)[-1], 'webp'))
        subprocess.run(['curl', '-s', '-L', '--max-time', '40', '-o', tmp,
                        '-A', UA, '-H', 'Referer: ' + REFERER, url])
        try:
            im = Image.open(tmp)
            im.load()
        except Exception:
            fail += 1
            print('  FAIL', slug)
            continue
        rgb = im.convert('RGB')
        if max(rgb.size) > 1200:
            rgb.thumbnail((1200, 1200), Image.LANCZOS)
        rgb.save(dst, 'JPEG', quality=88, optimize=True)
        ok += 1
    print('\n  图片: ok=%d  未在 seed 中登记=%d  fail=%d' % (ok, miss, fail))


if __name__ == '__main__':
    act = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if act in ('fetch', 'all'):
        cmd_fetch()
    if act in ('parse', 'all'):
        cmd_parse()
    if act in ('imgs', 'all'):
        cmd_imgs()
