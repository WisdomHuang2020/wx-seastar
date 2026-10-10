#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
patch-nginx-creator.py —— 为 /Creator 增加反向代理规则

背景：
    Creator 设计者模式（/Creator/）与 /admin/ 一样，由 Node 后端托管，
    **不进公开 web 根**。但 nginx 里原本只代理了 `/api/` 与 `/admin`，
    `/Creator` 会落到静态目录 → 404（Node 直连 :3000/Creator/ 其实是 200）。
    所以必须补一条 location。

⚠️ 为什么必须用 `^~`：
    nginx 的匹配顺序是「精确 `=` → `^~` 前缀 → 正则」。
    本站的「干净 URL」规则是**正则**（`location ~ ^/(name)\.html$`），
    若这里不加 `^~`，`/Creator/` 会被那条正则抢走，导致 404/301 错乱。
    这与 `/api/`、`/admin` 的处理保持一致。

⚠️ 本文件不在仓库的部署白名单里 —— nginx 配置**不随 git 分发**，
    改完必须手工在服务器上跑本脚本。别指望 auto-deploy 会带上它。

用法（在服务器上以 root 运行）：
    python3 patch-nginx-creator.py            # 打补丁
    python3 patch-nginx-creator.py --revert   # 回退
    python3 patch-nginx-creator.py --check    # 只看有没有

幂等：已存在则跳过。改完**不自动 reload**，需人工确认 `nginx -t` 通过后再 reload。
"""
import io
import sys

CONF = "/etc/nginx/sites-available/wx-seastar"
MARK = "location ^~ /Creator"

BLOCK = """    # ══ Creator 设计者模式 /Creator（2026-10-10 起）═══════════════════════
    # 与 /admin 同样由 Node 托管、不进公开 web 根 —— 否则会被 auto-deploy 的
    # `git reset --hard` + 覆盖发布冲掉，编辑器自己的文件也活不过 2 分钟。
    # `^~` 的原因见本脚本头部说明。
    location ^~ /Creator {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 96m;
    }

"""


def main():
    conf = io.open(CONF, encoding="utf-8").read()
    exists = MARK in conf

    if "--check" in sys.argv:
        print("  已打补丁 ✓" if exists else "  未打补丁 ✗")
        return 0

    if "--revert" in sys.argv:
        if not exists:
            print("  未打补丁，无需回退")
            return 0
        i = conf.find("    # ══ Creator 设计者模式")
        if i < 0:
            print("  ✗ 找不到补丁块起点，请手工处理")
            return 1
        j = conf.find("\n\n", conf.find("}", conf.find("location ^~ /Creator", i)))
        io.open(CONF, "w", encoding="utf-8", newline="\n").write(conf[:i] + conf[j + 2:])
        print("  ✓ 已回退（请 nginx -t 后 reload）")
        return 0

    if exists:
        print("  已存在，跳过")
        return 0

    # 插到 /admin 块之后，保持同类规则挨在一起
    anchor = "    location ^~ /admin {"
    k = conf.find(anchor)
    if k < 0:
        print("  ✗ 找不到 /admin 锚点，请手工处理")
        return 1
    end = conf.find("\n    }\n", k)
    if end < 0:
        print("  ✗ 找不到 /admin 块结尾")
        return 1
    end += len("\n    }\n")
    io.open(CONF, "w", encoding="utf-8", newline="\n").write(conf[:end] + "\n" + BLOCK + conf[end:])
    print("  ✓ 已插入 %s 规则" % MARK)
    print("    ⚠️ 未自动 reload —— 请先 nginx -t，通过后再 systemctl reload nginx")
    return 0


if __name__ == "__main__":
    sys.exit(main())
