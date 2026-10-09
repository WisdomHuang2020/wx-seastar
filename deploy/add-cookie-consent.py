#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
把 Cookie 同意模块挂到全站 18 个页面（英文根 / 中文 /cn）。

做两件事，每件事都带「替换计数断言」——
re.sub 匹配不到是不会报错的，只会静默什么都不做然后打印 ✔。
这是本项目 v0.13.2 踩过的坑（脚本全绿、页面全坏），必须防。

1) 在 site.js 之后引入 js/consent.js（中文站自动用 ../ 前缀）
2) 在 footer__bottom 末尾插入「Cookie 设置」按钮（data-cookie-settings）

幂等：已注入过的页面会跳过；重复运行不会产生第二份。
"""

import io
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(ROOT, '.cc-backup')

PAGES = [
    ('index.html', ''), ('lighting.html', ''), ('grow-light.html', ''),
    ('odm.html', ''), ('oem.html', ''), ('docs.html', ''),
    ('about.html', ''), ('contact.html', ''), ('404.html', ''),
    (os.path.join('cn', 'index.html'), '../'),
    (os.path.join('cn', 'lighting.html'), '../'),
    (os.path.join('cn', 'grow-light.html'), '../'),
    (os.path.join('cn', 'odm.html'), '../'),
    (os.path.join('cn', 'oem.html'), '../'),
    (os.path.join('cn', 'docs.html'), '../'),
    (os.path.join('cn', 'about.html'), '../'),
    (os.path.join('cn', 'contact.html'), '../'),
    (os.path.join('cn', '404.html'), '../'),
]

# 按语言决定按钮文案：中文站 / 英文站各自一份，不共用
FOOTER_BUTTON = {
    '':    '        <button type="button" class="footer__cc" data-cookie-settings>Cookie settings</button>',
    '../': '        <button type="button" class="footer__cc" data-cookie-settings>Cookie 设置</button>',
}

FOOTER_RE = re.compile(r'(<div class="footer__bottom">)(.*?)\n(\s*)(</div>)', re.S)


def read(path):
    # newline='' + 手动归一：避免 Windows 默认把 \r\n 写回去
    with io.open(path, 'r', encoding='utf-8', newline='') as f:
        return f.read().replace('\r\n', '\n')


def write(path, text):
    # 硬约束：本站 deploy 下来的文件必须是 LF，CRLF 的 .sh 会让服务器部署整体挂掉
    assert text.count('\r\n') == 0, '文件含 CRLF，拒绝写入：%s' % path
    with io.open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)


def inject_script(text, prefix):
    rel = prefix + 'js/consent.js'

    if rel in text:
        return text, 0, 'script 已存在'

    # 锚点自适应：绝大多数页面有 site.js；404.html 只引了 app.js。
    # consent.js 是自洽模块，谁都不依赖，跟在哪个后面都成立。
    anchors = [
        '<script src="%sjs/site.js" defer></script>' % prefix,
        '<script src="%sjs/app.js"></script>' % prefix,
    ]
    needle = None
    for a in anchors:
        if a in text:
            needle = a
            break
    if needle is None:
        raise SystemExit('✗ 找不到任何脚本锚点（site.js / app.js）')

    new = needle + '\n<script src="%s" defer></script>' % rel
    out, n = re.subn(re.escape(needle), lambda _: new, text, count=1)
    assert n == 1, 'script 替换未生效（n=%d）' % n
    return out, 1, 'script 已注入'


def inject_footer(text, prefix):
    if 'data-cookie-settings' in text:
        return text, 0, '页脚入口已存在'

    m = FOOTER_RE.search(text)
    if not m:
        raise SystemExit('✗ 找不到 footer__bottom 区块，无法插入页脚入口')

    indent = m.group(3)                    # footer__bottom 闭合标签自身的缩进
    button = indent + '  ' + FOOTER_BUTTON[prefix].strip()

    def repl(mm):
        # 按钮插到既有最后一项之后，缩进与同级的 span/a 对齐
        return mm.group(1) + mm.group(2) + '\n' + button + '\n' + mm.group(3) + mm.group(4)

    out, n = FOOTER_RE.subn(repl, text, count=1)
    assert n == 1, '页脚替换未生效（n=%d）' % n
    assert out.count('data-cookie-settings') == 1, '页脚入口数量异常'
    return out, 1, '页脚入口已注入'


def main():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    changed = 0
    skipped = 0

    for rel_path, prefix in PAGES:
        path = os.path.join(ROOT, rel_path)
        if not os.path.isfile(path):
            raise SystemExit('✗ 页面不存在：%s' % rel_path)

        src = read(path)

        # 先备份一份「注入前」的原文，用作反向验证的负样本
        bak = os.path.join(BACKUP_DIR, rel_path.replace(os.sep, '__'))
        if not os.path.exists(bak):
            write(bak, src)

        out = src
        out, n1, msg1 = inject_script(out, prefix)
        out, n2, msg2 = inject_footer(out, prefix)

        # 终态断言：两个标记必须各出现且只出现一次。
        # 不校验 site.js —— 404.html 本就不加载它，硬校验反而会把正常页面判死。
        cs_rel = prefix + 'js/consent.js'
        assert out.count(cs_rel) == 1, '%s → consent.js 数量异常：%d' % (rel_path, out.count(cs_rel))
        assert out.count('data-cookie-settings') == 1, '%s → 页脚入口数量异常' % rel_path

        if n1 + n2 == 0:
            skipped += 1
            print('  = %-22s %s / %s' % (rel_path, msg1, msg2))
            continue

        write(path, out)
        changed += 1
        print('  ✔ %-22s %s / %s' % (rel_path, msg1, msg2))

    print('\n──────────────────────────────')
    print('已更新 %d 个页面，跳过 %d 个（此前已注入）。原稿备份在 %s'
          % (changed, skipped, BACKUP_DIR))
    return 0


if __name__ == '__main__':
    sys.exit(main())
