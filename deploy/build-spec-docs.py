#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把抓下来的规格书图片转成 PDF，并生成给服务器端入库用的清单。

输入：.crawl/specs.json + .crawl/specimg/<post>_<n>.jpg
输出：.crawl/specpdf/<slug>.pdf      PDF 以 **产品 slug** 命名，便于人工核对与重跑
      .crawl/spec-manifest.json      服务器端 import-specs.js 的输入

页面口径（自行拍板并写在代码里，不留"待确认"）：
  · 按 **A4 宽 210mm @300dpi = 2480px** 等比缩放，高度随图片比例自动延长
    （规格书本身是竖版长图，压进 A4 高度会被截断或挤压）
  · 同一产品若有多张规格书，合并为一个多页 PDF

依赖 Pillow —— 本机用 `C:\\Program Files\\Inkscape\\bin\\python.exe`（自带 Pillow 12）。
"""
import ast
import io
import json
import os
import re
import sys

from PIL import Image

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPECS_JSON = os.path.join(REPO, '.crawl', 'specs.json')
IMGDIR = os.path.join(REPO, '.crawl', 'specimg')
OUTDIR = os.path.join(REPO, '.crawl', 'specpdf')
MANIFEST = os.path.join(REPO, '.crawl', 'spec-manifest.json')
SEED = os.path.join(REPO, 'server', 'src', 'tools', 'seed-products.js')

TARGET_W = 2480   # A4 宽 210mm @300dpi
DPI = 300


def load_slug_map():
    """从 seed-products.js 取 {产品英文名: slug}。

    ⚠️ 数组里带 `// ──` 注释，直接 eval 会报
       `SyntaxError: invalid character '─'`。故先剥注释再用 ast.literal_eval
       （比 eval 安全：只接受字面量，不执行代码）。
    """
    src = io.open(SEED, encoding='utf-8').read()
    block = re.search(r'const PRODUCTS = \[[\s\S]*?\n\];', src).group(0)
    body = block.split('=', 1)[1].strip().rstrip(';')
    body = re.sub(r'//[^\n]*', '', body)
    body = re.sub(r'/\*[\s\S]*?\*/', '', body)
    data = ast.literal_eval(body)
    # ⚠️ 名字里的**空格数量**在三个来源之间不一致：
    #    seed-products.js 写作 `... Selectable  Slim Downlight`（两个空格），
    #    原官网列表页/详情页是单个空格。不做归一化就会漏配（实测漏了 RDX3）。
    return {norm(p[1]): p[0] for p in data}


def norm(s):
    """压缩连续空白并去首尾 —— 用于跨来源的名字比对。"""
    return re.sub(r'\s+', ' ', str(s or '')).strip()


def main():
    if not os.path.exists(SPECS_JSON):
        sys.exit('✘ 缺少 %s' % SPECS_JSON)
    slug_map = load_slug_map()
    rows = json.load(io.open(SPECS_JSON, encoding='utf-8'))
    os.makedirs(OUTDIR, exist_ok=True)

    manifest = []
    no_spec = []
    no_slug = []
    for r in rows:
        specs = [im for im in r.get('images', []) if im.get('is_spec')]
        if not specs:
            no_spec.append(r)
            continue
        slug = slug_map.get(norm(r['name']))
        if not slug:
            no_slug.append(r)
            continue

        pages = []
        for im in specs:
            fp = os.path.join(IMGDIR, im.get('file') or '')
            if not os.path.exists(fp):
                print('  ⚠️ 缺图：%s %s' % (r['post'], im.get('file')))
                continue
            img = Image.open(fp)
            img.load()
            img = img.convert('RGB')
            if img.width != TARGET_W:
                ratio = TARGET_W / img.width
                img = img.resize((TARGET_W, max(1, int(round(img.height * ratio)))),
                                 Image.LANCZOS)
            pages.append(img)
        if not pages:
            continue

        out = os.path.join(OUTDIR, slug + '.pdf')
        pages[0].save(out, 'PDF', resolution=DPI,
                      save_all=True, append_images=pages[1:])
        manifest.append({
            'slug': slug,
            'post': r['post'],
            'title_en': r['name'],
            'original_name': '%s.pdf' % r['name'],
            'pages': len(pages),
            'bytes': os.path.getsize(out),
        })
        print('  ✔ %-42s %d 页  %6.1f KB' % (slug, len(pages), os.path.getsize(out) / 1024))

    json.dump(manifest, io.open(MANIFEST, 'w', encoding='utf-8', newline='\n'),
              ensure_ascii=False, indent=1)

    print('\n生成 PDF：%d 个' % len(manifest))
    print('原站无规格书（详情页正文为空）：%d 个' % len(no_spec))
    for r in no_spec:
        print('   -', r['post'], r['name'])
    if no_slug:
        print('⚠️ 未在 seed-products.js 找到 slug：%d 个' % len(no_slug))
        for r in no_slug:
            print('   -', r['post'], r['name'])
    print('清单：%s' % MANIFEST)


if __name__ == '__main__':
    main()
