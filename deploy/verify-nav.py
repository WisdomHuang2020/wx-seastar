# -*- coding: utf-8 -*-
"""
导航下拉结构全量断言（18 个页面：中英文各 9 个）。

为什么单独写它
──────────────
add-nav-dropdown.py 曾在 lighting.html 上**静默失败** —— re.sub 找不到匹配
不报错，脚本照样打印 ✔。结果是产品页 nav 没有下拉、drawer 却被塞进桌面结构，
而所有"绿色输出"看起来一切正常。

本脚本对每个页面**正反两向**断言，任一不满足即非零退出：

  nav 区块   ：必须含 .nav__dropdown      ；且不得含 .drawer__sub
  drawer 区块：必须含 .drawer__sub        ；且不得含 .nav__dropdown
  链接完整性 ：每个页面的 4 个下拉链接（照明页 + 3 个场景）齐备
  选中态     ：lighting 页的 trigger 应带 is-active

用法：python3 deploy/verify-nav.py      # 退出码 0 = 全部通过
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index', 'lighting', 'grow-light', 'odm', 'oem', 'docs', 'about', 'contact', '404']

NAV_ZONE = re.compile(r'<nav class="nav__links"[^>]*>(.*?)</nav>', re.S)
DRAWER_ZONE = re.compile(
    r'<div class="drawer"[^>]*>(.*?)<a class="btn btn--primary btn--lg drawer__cta', re.S)


def check(path, zh):
    rel = os.path.relpath(path, ROOT)
    s = io.open(path, encoding='utf-8', newline='').read()
    errs = []

    nav = NAV_ZONE.search(s)
    dr = DRAWER_ZONE.search(s)
    if not nav:
        errs.append('定位不到 nav 区块')
    if not dr:
        errs.append('定位不到 drawer 区块')
    if errs:
        return rel, errs

    navi, dri = nav.group(1), dr.group(1)
    base = '/cn/lighting' if zh else '/lighting'

    # ── nav ──
    if 'nav__dropdown' not in navi:
        errs.append('nav 缺少 .nav__dropdown')
    if 'drawer__sub' in navi:
        errs.append('nav 里混入了 .drawer__sub')

    # ── drawer ──
    if 'drawer__sub' not in dri:
        errs.append('drawer 缺少 .drawer__sub')
    if 'nav__dropdown' in dri:
        errs.append('drawer 里混入了 .nav__dropdown（误插结构）')

    # ── 链接完整性（4 条：照明页 + 3 个场景）──
    for suffix in ['', '?scene=home', '?scene=commercial', '?scene=outdoor']:
        want = base + suffix
        if ('href="%s"' % want) not in navi and ("href='%s'" % want) not in navi:
            errs.append('nav 缺少链接 %s' % want)

    # ── 选中态：产品页的 trigger 应是 is-active ──
    trig = re.search(r'<a href="%s" class="nav__dropdown-trigger([^"]*)"' % re.escape(base), navi)
    if not trig:
        errs.append('nav 的 trigger 未使用 .nav__dropdown-trigger')
    else:
        has_active = 'is-active' in trig.group(1)
        if path.endswith('lighting.html') and not has_active:
            errs.append('产品页 trigger 丢了 is-active 选中态')
        if not path.endswith('lighting.html') and has_active:
            errs.append('非产品页 trigger 不应带 is-active')

    return rel, errs


def main():
    failed = 0
    print('%-24s %s' % ('页面', '结果'))
    print('-' * 66)
    for d, zh in [('', False), ('cn', True)]:
        for p in PAGES:
            path = os.path.join(ROOT, d, p + '.html') if d else os.path.join(ROOT, p + '.html')
            rel, errs = check(path, zh)
            if errs:
                failed += 1
                print('%-24s ✘ %s' % (rel, '；'.join(errs)))
            else:
                print('%-24s ✔' % rel)
    print('-' * 66)
    if failed:
        print('✘ %d 个页面未通过' % failed)
        return 1
    print('✔ 全部 %d 个页面通过' % (len(PAGES) * 2))
    return 0


if __name__ == '__main__':
    sys.exit(main())
