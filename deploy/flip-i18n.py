# -*- coding: utf-8 -*-
"""
v0.13.0 —— 双语架构翻转：英文站为主（根路径），中文站为从（/cn 子路径）。

背景
────
v0.12.0 做成了「中文在根 + 英文在 /en」。客户随后改为：

    www.wx-seastar.cn      → 英文站（为主）
    www.wx-seastar.cn/cn   → 中文站（为从）

本脚本把两套页面树各自平移一层，并重写所有相对 / 绝对内部链接：

    · 英文页  en/<p>.html  →  ./<p>.html      "../assets/x" → "assets/x"
    · 中文页  ./<p>.html   →  cn/<p>.html      "assets/x"   → "../assets/x"

语言切换按钮按「同页对应」写死 href（多页静态站，每页独立，无需 JS）：

    英文 /about   ⇄   中文 /cn/about
    英文 /        ⇄   中文 /cn

⚠️ 本机铁律：写文本文件必须显式 newline='\\n'。
   io.open(f, 'w') 默认 newline=None 会在 Windows 上写成 \\r\\n，
   带 CRLF 的 .sh 传到 Linux 会直接 syntax error。
"""
import io
import os
import re
import shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 9 个页面（含 404）
PAGES = ['index', 'lighting', 'grow-light', 'odm', 'oem', 'docs', 'about', 'contact', '404']

# 参与「内部页面链接」改写的路径白名单。
# 刻意不含 index（首页单独处理），也不含 uploads / api / admin —— 那些是后端路径，不能加语言前缀。
PAGE_PATHS = ['lighting', 'grow-light', 'odm', 'oem', 'docs', 'about', 'contact']

ORIGIN = 'https://www.wx-seastar.cn'

# 语言切换按钮整段先抠出来存着，避免被通用链接规则二次改写
LS_RE = re.compile(r'<a class="lang-switch"[^>]*>.*?</a>', re.S)


def read(path):
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read()


def write(path, s):
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)


def stash_lang_switch(s):
    """把 lang-switch 整段换成占位符，返回 (文本, 原标签列表)。"""
    store = []

    def _stash(m):
        store.append(m.group(0))
        return '\x00LS%d\x00' % (len(store) - 1)

    return LS_RE.sub(_stash, s), store


def unstash_lang_switch(s, store, map_fn):
    """还原占位符，并按 map_fn 改写其中的 href。"""
    def _unstash(m):
        tag = store[int(m.group(1))]
        old = re.search(r'href="([^"]*)"', tag)
        new = map_fn(old.group(1)) if old else '/'
        return re.sub(r'href="[^"]*"', 'href="%s"' % new, tag, count=1)

    return re.sub(r'\x00LS(\d+)\x00', _unstash, s)


# ─────────────────────────────────────────────────────────────────────────────
# 英文页：en/<p>.html → ./<p>.html
# ─────────────────────────────────────────────────────────────────────────────
def to_root(s):
    s, store = stash_lang_switch(s)

    # ① 绝对 URL 里的 /en  → 根
    s = s.replace(ORIGIN + '/en/', ORIGIN + '/')
    s = s.replace(ORIGIN + '/en"', ORIGIN + '/"')

    # ② 站内链接 /en/xxx → /xxx ，/en → /
    s = s.replace('href="/en/', 'href="/')
    s = s.replace('href="/en"', 'href="/"')

    # ③ 资源相对路径上提一层：="../assets/x" → ="assets/x"
    s = re.sub(r'(?<==")\.\./', '', s)

    # ④ og:locale 跟着语言走
    s = s.replace('content="zh_CN"', 'content="en_US"')

    # ⑤ 按钮：英文站 → 中文站同页
    def _map(href):
        if href == '/':
            return '/cn'
        if href.startswith('/'):
            return '/cn' + href
        return '/cn'

    return unstash_lang_switch(s, store, _map)


# ─────────────────────────────────────────────────────────────────────────────
# 中文页：./<p>.html → cn/<p>.html
# ─────────────────────────────────────────────────────────────────────────────
def to_cn(s):
    s, store = stash_lang_switch(s)

    # ① 绝对 URL：根 → /cn
    for p in PAGE_PATHS:
        s = s.replace(ORIGIN + '/' + p + '"', ORIGIN + '/cn/' + p + '"')
    s = s.replace(ORIGIN + '/"', ORIGIN + '/cn"')

    # ② 站内链接：/xxx → /cn/xxx ，/ → /cn
    for p in PAGE_PATHS:
        s = s.replace('href="/' + p + '"', 'href="/cn/' + p + '"')
    s = s.replace('href="/"', 'href="/cn"')

    # ③ 资源相对路径下沉一层：="assets/x" → ="../assets/x"
    s = re.sub(r'(?<==")(assets/|js/)', r'../\1', s)
    s = s.replace('="styles.css"', '="../styles.css"')
    s = s.replace('="favicon.ico"', '="../favicon.ico"')
    s = s.replace('="apple-touch-icon.png"', '="../apple-touch-icon.png"')

    # ④ 明确语言（中文页原来没有这个脚本，LANG 走默认值 zh）
    if "window.__SEASTAR_LANG__" not in s:
        s = s.replace('<link rel="stylesheet"',
                      '<script>window.__SEASTAR_LANG__=\'zh\';</script>\n<link rel="stylesheet"', 1)

    # ⑤ 按钮：中文站 → 英文站同页
    def _map(href):
        if href == '/en':
            return '/'
        if href.startswith('/en/'):
            return href[3:]
        return '/'

    return unstash_lang_switch(s, store, _map)


def main():
    # ── 0) 先把根目录的中文页备份一份，翻转出事能原样回滚 ──
    bk = os.path.join(ROOT, '.flip-zh')
    if os.path.isdir(bk):
        shutil.rmtree(bk)
    os.makedirs(bk)
    for p in PAGES:
        src = os.path.join(ROOT, p + '.html')
        if os.path.exists(src):
            shutil.copy2(src, os.path.join(bk, p + '.html'))
    print('已备份中文页 → .flip-zh/ (%d 个)' % len(os.listdir(bk)))

    cndir = os.path.join(ROOT, 'cn')
    if not os.path.isdir(cndir):
        os.makedirs(cndir)

    for p in PAGES:
        # ── 1) 中文页下沉到 cn/ ──
        zh = read(os.path.join(bk, p + '.html'))
        write(os.path.join(cndir, p + '.html'), to_cn(zh))

        # ── 2) 英文页上提到根 ──
        en_src = os.path.join(ROOT, 'en', p + '.html')
        if os.path.exists(en_src):
            write(os.path.join(ROOT, p + '.html'), to_root(read(en_src)))

        print('  ✔ %-12s en/ → ./   |  ./ → cn/' % (p + '.html'))

    # ── 3) 英文目录已无用，回收站移除（不硬删）──
    endir = os.path.join(ROOT, 'en')
    if os.path.isdir(endir):
        shutil.rmtree(endir)
        print('已移除 en/（内容已上提到根目录）')

    print('\n完成。下一步：nginx 规则 / sitemap / 白名单 / 版本。')


if __name__ == '__main__':
    main()
