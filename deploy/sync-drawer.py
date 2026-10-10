# -*- coding: utf-8 -*-
"""从每个页面自己的 `.nav__links` 生成/同步「移动端抽屉」菜单。

为什么需要它
------------
抽屉菜单此前只有 18 个页面有，另外 **60 个前台页面只有汉堡按钮、没有抽屉** ——
`js/app.js` 里 `if (burger && drawer)` 会在缺抽屉时静默不生效，**手机上点菜单没反应**；
而已有的抽屉也比桌面导航少两项（研发与设施 / 新闻中心）。

做法
----
以**该页自己的导航项**为唯一来源生成抽屉，因此不会出现两侧不一致：
`trigger` + `?scene=` 子项（带 `drawer__sub`）+ 其余项（**保留 `is-active`**，
使无 JS 时也能高亮当前栏目）+ 末尾报价 CTA（取自导航里的 `btn--primary`）。

用法
----
  python deploy/sync-drawer.py            # 干跑，只报告不写盘
  python deploy/sync-drawer.py --apply    # 实际写入
"""
import glob
import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
A_TAG = re.compile(r'<a\s+([^>]*?)>(.*?)</a>', re.S)
NAV = re.compile(r'<nav class="nav__links".*?</nav>', re.S)
DRAWER = re.compile(r'<div class="drawer".*?</div>', re.S)


def attr(tag, name):
    m = re.search(r'\b%s="([^"]*)"' % name, tag)
    return m.group(1) if m else ''


def esc(s):
    return s.replace('&', '&amp;')


def nav_items(html):
    seg = NAV.search(html)
    if not seg:
        return None
    out = []
    for m in A_TAG.finditer(seg.group(0)):
        tag, txt = m.group(1), m.group(2)
        href = attr(tag, 'href')
        if not href.startswith('/'):
            continue
        cls = attr(tag, 'class')
        kind = 'sub' if 'scene=' in href else ('trigger' if 'nav__dropdown-trigger' in cls else 'plain')
        out.append({'href': href, 'label': re.sub(r'\s+', ' ', txt).strip(),
                    'kind': kind, 'active': 'is-active' in cls})
    return out


def nav_cta(html):
    seg = NAV.search(html)
    if not seg:
        return None
    for m in A_TAG.finditer(seg.group(0)):
        tag, txt = m.group(1), m.group(2)
        if 'btn--primary' in attr(tag, 'class'):
            return attr(tag, 'href'), re.sub(r'\s+', ' ', txt).strip()
    return None


def build_drawer(items, cta, cn):
    L = ['<div class="drawer" aria-hidden="true">',
         '  <button class="drawer__close" aria-label="%s">' % ('关闭菜单' if cn else 'Close menu'),
         '    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"'
         ' stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
         '  </button>']
    for it in items:
        cls = []
        if it['kind'] == 'sub':
            cls.append('drawer__sub')
        if it['active']:
            cls.append('is-active')
        c = (' class="%s"' % ' '.join(cls)) if cls else ''
        L.append('  <a href="%s"%s>%s</a>' % (it['href'], c, esc(it['label'])))
    if cta:
        L.append('  <a class="btn btn--primary btn--lg drawer__cta" href="%s"'
                 ' style="display:inline-flex;width:fit-content;">%s</a>' % (cta[0], esc(cta[1])))
    L.append('</div>')
    return '\n'.join(L)


def targets():
    files = glob.glob(os.path.join(ROOT, '*.html'))
    files += glob.glob(os.path.join(ROOT, 'cn', '*.html'))
    files += glob.glob(os.path.join(ROOT, 'cn', 'news', '*.html'))
    files += glob.glob(os.path.join(ROOT, 'news', '*.html'))
    return sorted(os.path.relpath(f, ROOT).replace('\\', '/') for f in files)


def main():
    apply = '--apply' in sys.argv
    added = updated = skipped = 0
    for rel in targets():
        p = os.path.join(ROOT, rel)
        t = io.open(p, encoding='utf-8').read()
        items = nav_items(t)
        if not items:
            print('  ⚠️ 跳过（无 nav__links）：%s' % rel)
            skipped += 1
            continue
        cta = nav_cta(t)
        cn = any('\u4e00' <= ch <= '\u9fff' for ch in (items[-1]['label'] or ''))
        had = '<div class="drawer"' in t
        # 移除旧抽屉 + 其前置注释
        if had:
            t2 = DRAWER.sub('', t, count=1)
            t2 = re.sub(r'\n[ \t]*<!--\s*移动端抽屉\s*-->\n', '\n', t2, count=1)
            t2 = re.sub(r'\n{3,}', '\n\n', t2)
        else:
            t2 = t
        assert t2.count('</header>') == 1, '%s 的 </header> 数量异常' % rel
        block = build_drawer(items, cta, cn)
        t3 = t2.replace('</header>', '</header>\n\n<!-- 移动端抽屉 -->\n' + block, 1)
        assert '\r\n' not in t3
        # 自检：抽屉链接集合必须与导航链接集合逐一相等
        d = DRAWER.search(t3).group(0)
        d_hrefs = [attr(m.group(1), 'href') for m in A_TAG.finditer(d)
                   if attr(m.group(1), 'href').startswith('/')]
        n_hrefs = [i['href'] for i in items]
        assert d_hrefs == n_hrefs, '%s 抽屉与导航不一致：%d vs %d' % (rel, len(d_hrefs), len(n_hrefs))
        if apply:
            io.open(p, 'w', encoding='utf-8', newline='\n').write(t3)
        if had:
            updated += 1
        else:
            added += 1
    print('%s：新增抽屉 %d 个，更新已有抽屉 %d 个，跳过 %d 个'
          % ('已写入' if apply else '干跑', added, updated, skipped))
    return 0


if __name__ == '__main__':
    sys.exit(main())
