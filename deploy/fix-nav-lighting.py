# -*- coding: utf-8 -*-
"""
修复 lighting.html / cn/lighting.html 的导航下拉结构（幂等，可重复跑）。

背景（2026-10-09 实测）
───────────────────────
add-nav-dropdown.py 用的是**精确匹配**：

    <a href="/cn/lighting">通用照明</a>

但**产品页**上这一项带选中态 class：

    <a href="/cn/lighting" class="is-active">通用照明</a>

于是 nav 区块里没匹配到 → 第一次 re.sub 顺延匹配到了 **drawer 里的同一个链接**，
把**桌面下拉结构插进了移动抽屉**；drawer 的第二次替换已无匹配可用。
后果两条：

  1. 产品页 nav 里根本没有 .nav__dropdown → 用户在产品页 hover「通用照明」
     没有任何反应，表现为「选中之后就不显示下拉」；
  2. drawer 里塞进了桌面结构（.nav__dropdown / .nav__dropdown-menu），
     移动端展开抽屉会看到版式错乱。

而且脚本当时**打印了 ✔** —— 属于静默假绿：re.sub 找不到匹配不报错。
故本脚本所有替换都带**计数断言**，不匹配即抛错。

本脚本做两件事
──────────────
  ① drawer 区块内：把误插的 nav__dropdown 结构还原成 drawer__sub 列表
  ② nav   区块内：把 <a ... class="is-active">通用照明</a> 升级为 nav__dropdown
     （选中态 class 保留到 trigger 上）

⚠️ 只在 nav / drawer 各自区块内替换，避免再次互相误伤。
⚠️ 写文件显式 newline='\\n'（本机默认会写成 CRLF，导致远端 bash 部署失败）。
"""
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

NAV_ZONE = re.compile(r'(<nav class="nav__links"[^>]*>)(.*?)(</nav>)', re.S)
DRAWER_ZONE = re.compile(
    r'(<div class="drawer"[^>]*>.*?)(<a class="btn btn--primary btn--lg drawer__cta)', re.S)

# drawer 里被误插的桌面下拉结构
BAD_IN_DRAWER = re.compile(
    r'[ \t]*<div class="nav__dropdown">\s*'
    r'<a href="(?P<href>[^"]+)" class="nav__dropdown-trigger">[^<]*</a>\s*'
    r'<div class="nav__dropdown-menu">\s*'
    r'(?:<a href="[^"]*">[^<]*</a>\s*){3}'
    r'</div>\s*</div>', re.S)


def labels(zh):
    if zh:
        return ('通用照明', '家居照明', '商业照明', '户外照明')
    return ('General Lighting', 'Residential', 'Commercial', 'Outdoor')


def drawer_block(href, zh):
    _, a, b, c = labels(zh)
    return ('  <a href="%s">%s</a>\n'
            '  <a href="%s?scene=home" class="drawer__sub">%s</a>\n'
            '  <a href="%s?scene=commercial" class="drawer__sub">%s</a>\n'
            '  <a href="%s?scene=outdoor" class="drawer__sub">%s</a>'
            % (href, labels(zh)[0], href, a, href, b, href, c))


def nav_block(href, zh, extra_class):
    name, a, b, c = labels(zh)
    cls = 'nav__dropdown-trigger' + ((' ' + extra_class) if extra_class else '')
    return ('        <div class="nav__dropdown">\n'
            '          <a href="%s" class="%s">%s</a>\n'
            '          <div class="nav__dropdown-menu">\n'
            '            <a href="%s?scene=home">%s</a>\n'
            '            <a href="%s?scene=commercial">%s</a>\n'
            '            <a href="%s?scene=outdoor">%s</a>\n'
            '          </div>\n'
            '        </div>'
            % (href, cls, name, href, a, href, b, href, c))


def process(path, zh):
    s = io.open(path, encoding='utf-8', newline='').read()
    report = []

    # ── ① drawer 区块：还原误插结构 ──────────────────────────────
    dz = DRAWER_ZONE.search(s)
    if not dz:
        raise SystemExit('✘ %s：定位不到 drawer 区块' % path)
    head, tail = dz.group(1), dz.group(2)
    n_bad = len(BAD_IN_DRAWER.findall(head))
    if n_bad:
        head = BAD_IN_DRAWER.sub(lambda m: drawer_block(m.group('href'), zh), head)
        report.append('drawer 还原 %d 处误插结构' % n_bad)
    if 'drawer__sub' not in head and n_bad == 0:
        raise SystemExit('✘ %s：drawer 里既无 drawer__sub 也无可还原的错误结构' % path)
    s = s[:dz.start()] + head + tail + s[dz.end():]

    # ── ② nav 区块：升级为下拉 ────────────────────────────────
    nz = NAV_ZONE.search(s)
    if not nz:
        raise SystemExit('✘ %s：定位不到 nav 区块' % path)
    inner = nz.group(2)
    if 'nav__dropdown' in inner:
        report.append('nav 已是下拉结构，跳过')
    else:
        pat = (re.compile(r'<a href="/cn/lighting"(\s+class="([^"]*)")?>通用照明</a>') if zh
               else re.compile(r'<a href="/lighting"(\s+class="([^"]*)")?>General Lighting</a>'))
        m = pat.search(inner)
        if not m:
            raise SystemExit('✘ %s：nav 里找不到「通用照明 / General Lighting」链接' % path)
        href = '/cn/lighting' if zh else '/lighting'
        inner = pat.sub(nav_block(href, zh, m.group(2) or ''), inner, count=1)
        report.append('nav 升级为下拉（保留选中态：%s）' % (m.group(2) or '无'))
    s = s[:nz.start()] + nz.group(1) + inner + nz.group(3) + s[nz.end():]

    io.open(path, 'w', encoding='utf-8', newline='\n').write(s)
    print('  ✔ %-22s %s' % (os.path.relpath(path, ROOT), '；'.join(report)))


def main():
    process(os.path.join(ROOT, 'lighting.html'), zh=False)
    process(os.path.join(ROOT, 'cn', 'lighting.html'), zh=True)
    print('\n完成。下一步跑 verify-nav.py 全量断言。')


if __name__ == '__main__':
    main()
