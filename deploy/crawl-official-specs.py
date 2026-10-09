#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
抓取原官网**产品详情页的规格书图片**（产品列表页里没有，只在 post 详情页）。

背景（2026-10-09 实测）
───────────────────────
原官网 www.wx-seastar.com 有两套图，**不是同一张**：

  ① 产品列表页 item_img  → 产品**照片**（已抓，即 assets/img/product/<slug>.jpg）
  ② 产品详情页 /forum/post/<id>/ 的轮播图 → **规格书**（本脚本的目标）

规格书形态：竖版长图（约 1152x1607），内容含
  标题 + 特性列表 + 认证徽章 + 产品多角度实拍 + Model No./电压/功率/流明/色温规格表。
其 <img> 带 alt，alt 就是原站后台的原始文件名（如 44WPX2_00.jpg）。

约束（与 crawl-official-products.py 相同）
──────────────────────────────────────────
  · 详情页必须用**无头 Chrome** 抓（curl 一律 403，站点有 WAF）
  · 图片用 curl，但必须 **http**（https 403）+ `Referer: http://www.wx-seastar.com/`
  · 下到的是 **WebP**（扩展名伪装成 jpg/png），要用 Pillow 转真 JPEG

用法
────
    python3 deploy/crawl-official-specs.py pages            # 抓全部详情页（缓存）
    python3 deploy/crawl-official-specs.py pages --limit 3  # 只抓前 3 个（验证用）
    python3 deploy/crawl-official-specs.py extract          # 从缓存解析出规格书清单
    python3 deploy/crawl-official-specs.py download         # 下载规格书图片

输出
────
    .crawl/specpages/<post>.html     详情页原始 HTML
    .crawl/specs.json                [{post, name, images:[{alt, src}]}]
    .crawl/specimg/<post>_<n>.jpg    规格书图片（已转真 JPEG）
"""
import concurrent.futures
import hashlib
import io
import json
import os
import re
import subprocess
import sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASE = os.path.join(REPO, '.crawl')
PAGES = os.path.join(BASE, 'specpages')
PROF = os.path.join(BASE, 'specprof')
IMGDIR = os.path.join(BASE, 'specimg')
PRODUCTS_JSON = os.path.join(BASE, 'products.json')
SPECS_JSON = os.path.join(BASE, 'specs.json')

# 按本机调整
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'
UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/128.0 Safari/537.36')
REFERER = 'http://www.wx-seastar.com/'
DETAIL = 'http://www.wx-seastar.com/forum/post/%s/'

# 详情页里要剔除的站点装饰图（导航 logo / 页脚图等）
NOISE_ALT = {'wuxi seastar lighting co.,ltd.'}


def load_products():
    if not os.path.exists(PRODUCTS_JSON):
        sys.exit('✘ 缺少 %s —— 先跑 crawl-official-products.py parse' % PRODUCTS_JSON)
    data = json.load(io.open(PRODUCTS_JSON, encoding='utf-8'))
    return [p for p in data if p.get('post')]


def fetch_one(args):
    post, url = args
    fp = os.path.join(PAGES, post + '.html')
    if os.path.exists(fp) and os.path.getsize(fp) > 2000:
        return post, os.path.getsize(fp), 'cached'
    os.makedirs(PAGES, exist_ok=True)
    os.makedirs(PROF, exist_ok=True)
    # ⚠️ 必须重试：无头 Chrome 偶发返回 0 字节（首轮 83 个里有 11 个），
    #    不重试就会把"抓取失败"误判成"该产品没有规格书"（假阴性）。
    last = 0
    for attempt in range(3):
        prof = os.path.join(PROF, 'p%d' % ((int(post) + attempt) % 4))
        with open(fp, 'wb') as f:
            try:
                subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-sandbox',
                                '--virtual-time-budget=12000',
                                '--user-data-dir=' + prof, '--dump-dom', url],
                               stdout=f, stderr=subprocess.DEVNULL, timeout=120)
            except subprocess.TimeoutExpired:
                pass
        last = os.path.getsize(fp) if os.path.exists(fp) else 0
        if last > 2000:
            return post, last, 'ok' if attempt == 0 else 'retry%d' % attempt
    return post, last, 'fail'


def cmd_pages(limit=None):
    prods = load_products()
    if limit:
        prods = prods[:limit]
    jobs = [(p['post'], DETAIL % p['post']) for p in prods]
    print('抓取 %d 个详情页（并发 3）...' % len(jobs))
    ok = cached = bad = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        for post, size, st in ex.map(fetch_one, jobs):
            if st == 'ok':
                ok += 1
            elif st == 'cached':
                cached += 1
            else:
                bad += 1
                print('  ✘ %s %s' % (post, st))
    print('  完成：新抓 %d / 命中缓存 %d / 失败 %d' % (ok, cached, bad))


def _body_segment(html):
    """切出正文区块。

    ⚠️ 不能直接全文找 <img> —— 导航 logo、页脚图都在页面里，
       会把站点装饰图当成规格书（首轮实测就是这样混进来的）。
    原官网详情页结构：
        <div id="postInfo">…标题…</div>
        <div class="postbody"><div class="richtext"><p><img …></p></div></div>
        <div class="postfooter">…</div>
    故取 richtext（首选）或 postbody，到 postfooter / </body> 为止。
    """
    m = re.search(r'<div class="richtext">(.*?)(?:<div class="postfooter">|</body>)', html, re.S)
    if m:
        return m.group(1)
    m = re.search(r'<div class="postbody">(.*?)(?:<div class="postfooter">|</body>)', html, re.S)
    return m.group(1) if m else ''


def extract_from(html):
    """取出**正文区**里的图。

    正文里可能同时有「产品照片」和「规格书」，靠尺寸区分（见 filter_specs）：
    规格书是竖版长图（约 1152x1607 / 1440x2080），产品照片是横版小图（600x488）。
    """
    seg = _body_segment(html)
    if not seg:
        return []
    out = []
    for m in re.finditer(r'<img([^>]*)>', seg, re.I):
        attrs = m.group(1)
        src = re.search(r'src="([^"]+)"', attrs)
        alt = re.search(r'alt="([^"]*)"', attrs)
        if not src:
            continue
        url = src.group(1).strip()
        if 'resources.jsmo' not in url:
            continue
        a = (alt.group(1).strip() if alt else '')
        if a.lower() in NOISE_ALT:
            continue
        if url.endswith('/logo/logo.png'):
            continue
        out.append({'alt': a, 'src': url})
    # 去重（同一张图可能出现在轮播的多个占位里）
    seen, uniq = set(), []
    for it in out:
        if it['src'] in seen:
            continue
        seen.add(it['src'])
        uniq.append(it)
    return uniq


def cmd_extract():
    prods = {p['post']: p['name'] for p in load_products()}
    rows = []
    for fp in sorted(os.listdir(PAGES)) if os.path.isdir(PAGES) else []:
        if not fp.endswith('.html'):
            continue
        post = fp[:-5]
        html = io.open(os.path.join(PAGES, fp), encoding='utf-8', errors='replace').read()
        imgs = extract_from(html)
        rows.append({'post': post, 'name': prods.get(post, ''), 'images': imgs})
    json.dump(rows, io.open(SPECS_JSON, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    withimg = [r for r in rows if r['images']]
    total = sum(len(r['images']) for r in rows)
    print('详情页 %d 个，其中有规格书图 %d 个，共 %d 张图 -> %s'
          % (len(rows), len(withimg), total, SPECS_JSON))
    print('无图的 %d 个：' % (len(rows) - len(withimg)))
    for r in rows:
        if not r['images']:
            print('   -', r['post'], r['name'])


def cmd_download():
    from PIL import Image
    rows = json.load(io.open(SPECS_JSON, encoding='utf-8'))
    os.makedirs(IMGDIR, exist_ok=True)
    ok = fail = 0
    for r in rows:
        for i, im in enumerate(r['images']):
            url = 'http:' + im['src'] if im['src'].startswith('//') else im['src']
            # ⚠️ 直接下到最终文件名、原地覆盖，**不要**用 .bin 中转再 os.remove()：
            #    本机有 safe-delete 守卫，脚本里连续删文件超过阈值会被整体拦截
            #    （实测第 50 个文件时收到 SAFE_DELETE_BULK_CONFIRM_REQUIRED，任务中断）。
            dst = os.path.join(IMGDIR, '%s_%d.jpg' % (r['post'], i))
            subprocess.run(['curl', '-s', '-L', '--max-time', '60', '-o', dst,
                            '-A', UA, '-H', 'Referer: ' + REFERER, url])
            try:
                img = Image.open(dst)
                img.load()
            except Exception:
                fail += 1
                print('  FAIL', r['post'], i, im['alt'])
                continue
            img.convert('RGB').save(dst, 'JPEG', quality=90, optimize=True)
            # 记录尺寸：规格书=竖版长图（高>宽 且 宽≥900）；产品照片=横版小图（如 600x488）
            w, h = img.size
            im['w'], im['h'] = w, h
            im['file'] = os.path.basename(dst)
            im['is_spec'] = (h > w and w >= 900)
            ok += 1
    json.dump(rows, io.open(SPECS_JSON, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)
    n_spec = sum(1 for r in rows for im in r['images'] if im.get('is_spec'))
    n_photo = sum(1 for r in rows for im in r['images'] if im.get('is_spec') is False)
    print('下载完成：ok=%d fail=%d' % (ok, fail))
    print('  判定为规格书（竖版长图）：%d 张' % n_spec)
    print('  判定为产品照片（横版小图）：%d 张' % n_photo)
    print('  产物目录：%s' % IMGDIR)


if __name__ == '__main__':
    act = sys.argv[1] if len(sys.argv) > 1 else 'pages'
    lim = None
    if '--limit' in sys.argv:
        lim = int(sys.argv[sys.argv.index('--limit') + 1])
    if act == 'pages':
        cmd_pages(lim)
    elif act == 'extract':
        cmd_extract()
    elif act == 'download':
        cmd_download()
    else:
        sys.exit('用法: pages [--limit N] | extract | download')
