#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
从原官网 www.wx-seastar.com 抓取**全部**产品图，按产品 slug 命名。

为什么要有这个脚本：
  原始素材的文件名是建站方按顺序生成的（1764299xxx.png 之类），**与型号无关**。
  之前靠"猜文件名"映射，连续两轮都配错了。本次改为：

    ① 从原官网 LED 页 / ODM 页的 HTML 里**按栏目结构**提取
       「产品名 ↔ 图片 URL」的真实对应关系（不是猜的）；
    ② 直接下载，并以 **产品 slug 命名**存到 assets/img/product/<slug>.jpg；
    ③ 于是"图片 ↔ 产品"的对应关系写在文件名里，
       **映射表被彻底取消** —— 这类错配从此不可能再发生。

运行：
  python3 deploy/fetch-product-images.py            # 全部抓取（已存在则跳过）
  python3 deploy/fetch-product-images.py --force    # 强制重下

注意（防盗链）：
  · 必须带 Referer: http://www.wx-seastar.com/
  · 🔴 必须用 **http**（不是 https）：用 https 一律 403
"""
import argparse
import io
import os
import subprocess
import sys

try:
    from PIL import Image
except ImportError:
    print('需要 Pillow：pip install Pillow')
    sys.exit(1)

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO, 'assets', 'img', 'product')

UA = ('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
      '(KHTML, like Gecko) Chrome/128.0 Safari/537.36')
REFERER = 'http://www.wx-seastar.com/'
HOST = 'http://resources.jsmo.xin'     # ← 必须 http
MAX_SIDE = 1200
QUALITY = 88

T = 'templates/upload/15257'

# ── 原官网 LED LIGHTING 栏目（24 个）——
#    来源：archive 的 led.html 中 <li class="item_block"> 的
#    item_img 背景图 URL 与 a.title 文本一一对应。
LED = [
    ('3d-neon-strip',         f'{T}/202606/2832ed8eb57334a42c9895aa2b80ed0c.webp', '3D Neon Strip'),
    ('wrpx3-prismatic',       f'{T}/202512/1766027728319.png',   'WRPX3 Prismatic Wraparound'),
    ('fmx15-slim-surface',    f'{T}/202512/1764810915342.png',   'FMX15 5/7/9/12/15/19/24in Slim Surface Mount'),
    ('cdx11-retrofit-277v',   f'{T}/202512/1764810897344.png',   'CDX11 120-277V Retrofit Commercial Downlight'),
    ('cdx2-mesh-ble',         f'{T}/202512/1764730247497.png',   'CDX2 MESH BLE Wireless Control Commercial Downlight'),
    ('cdx8-flood-module',     f'{T}/202509/1757322031182.jpg',   'CDX8 Flood Module Commercial Downlight'),
    ('vntx2-square-vanity',   f'{T}/202504/174426940218.png',    'VNTX2 Series Square Vanity'),
    ('bpx6-slot-panel',       f'{T}/202409/1726632087354.png',   'BPX6 Slot Panel Light'),
    ('bpx9-prow-panel',       f'{T}/202409/1726632041425.png',   'BPX9 Prow Luxury Panel Light'),
    ('rdx3-5cct-slim',        f'{T}/202409/1726631779117.png',   'RDX3 5CCT & Wattage Selectable Slim Downlight'),
    ('fmx11-pro-surface',     f'{T}/202409/1726629958720.png',   'FMX11 Pro Surface Mount'),
    ('fmx11-regress-surface', f'{T}/202409/1726630439567.png',   'FMX11 Regress Surface Mount'),
    ('cldx3-cylinder',        f'{T}/202409/17266310749.png',     'CLDX3 Cylinder'),
    ('eclx2-ceiling',         f'{T}/202404/1713257229530.png',   'ECLX2 Series LED Ceiling Light'),
    ('eclx3-ceiling',         f'{T}/202404/1713247029292.png',   'ECLX3 Series LED Ceiling Light'),
    ('eclx6-ceiling',         f'{T}/202404/1713246995227.png',   'ECLX6 Series LED Ceiling Light'),
    ('eclx7-ceiling',         f'{T}/202407/1721180709218.png',   'ECLX7 Series LED Ceiling Light'),
    ('ecdx7-recessed',        f'{T}/202404/1713246854630.png',   'ECDX7 Commercial Recessed Downlight'),
    ('ecdx9-recessed',        f'{T}/202404/171324681835.png',    'ECDX9 Commercial Recessed Downlight'),
    ('ecdx11-surface',        f'{T}/202404/1713246732446.png',   'ECDX11 Commercial Surface Downlight'),
    ('dfx2-round',            f'{T}/202404/1713246697707.png',   'DFX2 Round LED Downlight'),
    ('vdlx1-round',           f'{T}/202404/1713246557386.png',   'VDLX1 Round LED Downlight'),
    ('espx2-slim-panel',      f'{T}/202404/1713239653417.png',   'ESPX2 Slim Panel Light'),
    ('espx3-backlight-panel', f'{T}/202404/1713239584272.png',   'ESPX3 Slim Backlight Panel'),
]

# ── 原官网 DRIVER AND CONTROL BOARD 栏目（6 个）——
#    来源：archive 的 odm.html，<img src> 与紧随其后的 <strong> 产品名 一一对应。
ODM = [
    ('drv-triac-120v',        f'{T}/202302/1676450738435.png', '120V TRIAC Driver 8-30W, Single CCT or 5CCT'),
    ('drv-tri-mode',          f'{T}/202302/1676450738831.png', 'Tri-mode, TRIAC & 0-10V, CCT & Wattage Selectable Driver 10-55W'),
    ('drv-0-10v',             f'{T}/202302/1676450777344.jpg', '0-10V, CCT & Wattage Selectable Driver 10-55W'),
    ('drv-sensor-pacb',       f'{T}/202302/1676450804450.png', 'Sensor Control PACB'),
    ('drv-ble-wireless',      f'{T}/202302/1676450939198.png', 'BLE & Wireless Control Driver 20-40W'),
    ('drv-uv-bms',            f'{T}/202302/1676450821962.png', 'UV Sterilizer Li-ion Battery BMS Board'),
]

ALL = LED + ODM


def fetch(url):
    """下载到内存；返回原始字节。curl 比 urllib 更省事（且本机有 curl）。"""
    r = subprocess.run(
        ['curl', '-sS', '--max-time', '60', '-A', UA, '-H', f'Referer: {REFERER}', url],
        capture_output=True)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode('utf-8', 'replace')[:200])
    if len(r.stdout) < 200:
        raise RuntimeError(f'内容过短（{len(r.stdout)} B），疑被拦截: {r.stdout[:80]!r}')
    return r.stdout


def save_jpeg(raw, dst):
    im = Image.open(io.BytesIO(raw))
    src_fmt = im.format
    im = im.convert('RGB')
    w, h = im.size
    if max(w, h) > MAX_SIDE:
        k = MAX_SIDE / float(max(w, h))
        im = im.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
    im.save(dst, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    return src_fmt, (w, h), im.size


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--force', action='store_true', help='已存在也重新下载')
    args = ap.parse_args()

    os.makedirs(OUT_DIR, exist_ok=True)
    ok = skip = fail = 0
    for slug, rel, name in ALL:
        dst = os.path.join(OUT_DIR, slug + '.jpg')
        if os.path.exists(dst) and not args.force:
            print(f'· 跳过 {slug}.jpg（已存在）')
            skip += 1
            continue
        url = f'{HOST}/{rel}'
        try:
            raw = fetch(url)
            fmt, orig, new = save_jpeg(raw, dst)
            print(f'✅ {slug:<22} ← {rel.split("/")[-1]:<42} {fmt} {orig} → {new} '
                  f'({os.path.getsize(dst)//1024} KB)   [{name}]')
            ok += 1
        except Exception as e:
            print(f'❌ {slug:<22} {rel.split("/")[-1]}  失败：{e}')
            fail += 1

    print(f'\n完成：下载 {ok} / 跳过 {skip} / 失败 {fail}')
    print(f'输出目录：{OUT_DIR}')
    if fail:
        sys.exit(1)


if __name__ == '__main__':
    main()
