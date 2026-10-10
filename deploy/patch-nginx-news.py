#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
patch-nginx-news.py —— 为 /news/<slug> 与 /cn/news/<slug> 增加干净 URL 规则

背景：
    站点是「多页静态站 + 干净 URL」，对外一律不带 .html。
    根路径的规则是 `location ~ ^/([A-Za-z0-9_-]+)\.html$ { return 301 /$1...; }`，
    但它只匹配**单段**路径，匹配不到 `/news/<slug>.html`。
    而 `/news/` 一旦用 `^~` 前缀，又会夺走正则的优先级 ——
    所以必须**在 `^~` 块内部嵌套一条正则**自己处理，否则同一篇文章会有两个地址
    （`/news/foo` 与 `/news/foo.html` 都返回 200）。

    这套「`^~` 里再嵌正则」的范式，站内 `/cn/` 已经在用，本补丁照抄同一范式。

用法（在服务器上以 root 运行）：
    python3 patch-nginx-news.py            # 打补丁
    python3 patch-nginx-news.py --revert   # 回退（删除本次新增的两段）

幂等：已存在则跳过。改完**不自动 reload**，需人工确认 `nginx -t` 通过后再 reload。
"""

import io
import re
import sys

CONF = "/etc/nginx/sites-available/wx-seastar"

EN_BLOCK = """    # ══ 新闻文章 /news/<slug>（v0.17.0 起）════════════════════════════════
    # 与 /cn/ 同一套范式：`^~` 前缀**优先于**正则 location，会夺走外层
    # `~ ^/([A-Za-z0-9_-]+)\\.html$` 的优先级，故必须在这里**嵌套**一条正则
    # 自己处理 `<slug>.html` → 无后缀，否则同一篇文章会出现两个地址。
    location ^~ /news/ {
        error_page 404 /404.html;

        location ~ ^/news/([A-Za-z0-9_-]+)\\.html$ {
            return 301 /news/$1$is_args$args;
        }

        try_files $uri $uri.html $uri/ =404;
    }

"""

CN_INNER = """
        # 新闻文章（中文站）：同样在 `^~` 内嵌套正则
        # error_page 不在此重声明，继承外层 /cn/ 的 /cn/404.html
        location ^~ /cn/news/ {
            location ~ ^/cn/news/([A-Za-z0-9_-]+)\\.html$ {
                return 301 /cn/news/$1$is_args$args;
            }
            try_files $uri $uri.html $uri/ =404;
        }
"""


def main():
    revert = "--revert" in sys.argv
    src = io.open(CONF, encoding="utf-8").read()

    if revert:
        n = 0
        if "\n        # 新闻文章（中文站）" in src:
            src = re.sub(r"\n        # 新闻文章（中文站）.*?\n        \}\n", "\n", src, flags=re.S)
            n += 1
        if "新闻文章 /news/<slug>" in src:
            src = re.sub(r"    # ══ 新闻文章 /news/<slug>.*?\n    \}\n\n", "", src, flags=re.S)
            n += 1
        io.open(CONF, "w", encoding="utf-8", newline="\n").write(src)
        print("已回退 %d 段" % n)
        return 0

    changed = 0

    # ── 1) 英文站：插到 `location ^~ /cn/ {` 之前 ──
    if "location ^~ /news/ {" not in src:
        anchor = "    location ^~ /cn/ {"
        i = src.find(anchor)
        if i == -1:
            print("✗ 未找到 /cn/ 锚点，放弃", file=sys.stderr)
            return 1
        src = src[:i] + EN_BLOCK + src[i:]
        changed += 1
        print("  ✓ 已插入英文站 /news/ 规则")
    else:
        print("  - 英文站 /news/ 规则已存在，跳过")

    # ── 2) 中文站：嵌进 `location ^~ /cn/ {` 内部，放在 try_files 之前 ──
    if "location ^~ /cn/news/ {" not in src:
        m = re.search(r"(    location \^~ /cn/ \{\n)(.*?)(\n        try_files \$uri \$uri\.html \$uri/ =404;\n    \})",
                      src, re.S)
        if not m:
            print("✗ 未找到 /cn/ 块内部锚点，放弃", file=sys.stderr)
            return 1
        src = src[:m.end(2)] + CN_INNER + src[m.end(2):]
        changed += 1
        print("  ✓ 已插入中文站 /cn/news/ 规则")
    else:
        print("  - 中文站 /cn/news/ 规则已存在，跳过")

    io.open(CONF, "w", encoding="utf-8", newline="\n").write(src)
    print("完成，改动 %d 段。请执行： nginx -t && systemctl reload nginx" % changed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
