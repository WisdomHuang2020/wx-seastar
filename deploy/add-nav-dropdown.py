# -*- coding: utf-8 -*-
"""
v0.13.1 —— 在「通用照明 / General Lighting」导航项上加 hover 下拉菜单，
列出家居/商业/户外三个场景入口，并在移动端 drawer 里静态展开。
同时让 /lighting?scene=home 等 URL 能自动激活页内筛选。

⚠️ 写文件显式 newline='\\n'，避免 CRLF 导致远端 bash 部署失败。
"""
import io
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index.html', 'lighting.html', 'grow-light.html', 'odm.html', 'oem.html',
         'docs.html', 'about.html', 'contact.html', '404.html']

EN_DROPDOWN = '''        <div class="nav__dropdown">
          <a href="/lighting" class="nav__dropdown-trigger">General Lighting</a>
          <div class="nav__dropdown-menu">
            <a href="/lighting?scene=home">Residential</a>
            <a href="/lighting?scene=commercial">Commercial</a>
            <a href="/lighting?scene=outdoor">Outdoor</a>
          </div>
        </div>'''

EN_DRAWER = '''  <a href="/lighting">General Lighting</a>
  <a href="/lighting?scene=home" class="drawer__sub">Residential</a>
  <a href="/lighting?scene=commercial" class="drawer__sub">Commercial</a>
  <a href="/lighting?scene=outdoor" class="drawer__sub">Outdoor</a>'''

ZH_DROPDOWN = '''        <div class="nav__dropdown">
          <a href="/cn/lighting" class="nav__dropdown-trigger">通用照明</a>
          <div class="nav__dropdown-menu">
            <a href="/cn/lighting?scene=home">家居照明</a>
            <a href="/cn/lighting?scene=commercial">商业照明</a>
            <a href="/cn/lighting?scene=outdoor">户外照明</a>
          </div>
        </div>'''

ZH_DRAWER = '''  <a href="/cn/lighting">通用照明</a>
  <a href="/cn/lighting?scene=home" class="drawer__sub">家居照明</a>
  <a href="/cn/lighting?scene=commercial" class="drawer__sub">商业照明</a>
  <a href="/cn/lighting?scene=outdoor" class="drawer__sub">户外照明</a>'''


def transform(s, zh=False):
    pat = r'<a href="/lighting">General Lighting</a>' if not zh else r'<a href="/cn/lighting">通用照明</a>'
    # 桌面导航总是先于 drawer 出现，只替换第一次
    s = re.sub(pat, EN_DROPDOWN if not zh else ZH_DROPDOWN, s, count=1)
    # 移动端 drawer 替换剩余的那一次
    s = re.sub(pat, EN_DRAWER if not zh else ZH_DRAWER, s)
    return s


def read(path):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write(path, s):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)


def main():
    bk = os.path.join(ROOT, '.flip-nav')
    if os.path.isdir(bk):
        shutil.rmtree(bk)
    os.makedirs(bk)

    for p in PAGES:
        # 英文根页
        src = os.path.join(ROOT, p)
        dst = os.path.join(ROOT, p)
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(bk, p))
            write(dst, transform(read(src), zh=False))
            print('  ✔ %s (en)' % p)

        # 中文 cn/ 页
        src_cn = os.path.join(ROOT, 'cn', p)
        if os.path.exists(src_cn):
            shutil.copy2(src_cn, os.path.join(bk, 'cn-' + p))
            write(src_cn, transform(read(src_cn), zh=True))
            print('  ✔ cn/%s (zh)' % p)

    print('\n完成。下一步：styles.css + js/site.js。')


if __name__ == '__main__':
    main()
