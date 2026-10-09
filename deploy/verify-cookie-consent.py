#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cookie 同意模块的运行时验收套件（正反双向断言）。

为什么必须用真浏览器而不是读源码：
  本项目 v0.13.2 的教训 —— 用「从源码抽表达式执行」验证，全绿；但挂事件的
  选择器没命中真实 DOM，页面上功能全坏。所以这里一律走「真实 .click()」。

为什么必须起 http 服务而不是 file://：
  Chrome 在 file:// 下会屏蔽 document.cookie，偏好 Cookie 那几条断言会假失败。
  那种失败 PRODUCT 没 bug，是环境限制 —— 但不能因此就不验 Cookie，所以起服务。

验证路径：
  第一轮（首次到访）→ 横幅可见 / 真点击偏好 → 面板打开 → 真点开关 + 保存
                    → localStorage + Cookie 落库 → 闸门放行
                    → 撤回授权必须真的收回（反向）
  第二轮（回访）    → 同一 profile 再加载 → 横幅不再出现 → 页脚入口真点击能重开面板
                    → 面板回填上次选择
"""

import io
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROBE_SRC = os.path.join(ROOT, 'deploy', '__cc_probe.js')
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
if not os.path.exists(CHROME):
    CHROME = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"

PYTHON = sys.executable
PORT = 8731
HOST = '127.0.0.1'
BASE_URL = 'http://%s:%d' % (HOST, PORT)

PAGES = [
    ('index.html', 'en'),
    (os.path.join('cn', 'index.html'), 'zh'),
]

TMP = []   # 本轮产生的临时文件，收尾统一清理


def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read().replace('\r\n', '\n')


def write(p, s):
    assert s.count('\r\n') == 0, '拒绝写出 CRLF：%s' % p
    with io.open(p, 'w', encoding='utf-8', newline='\n') as f:
        f.write(s)


def wait_port(port, timeout=12):
    end = time.time() + timeout
    while time.time() < end:
        try:
            s = socket.create_connection((HOST, port), 0.4)
            s.close()
            return True
        except OSError:
            time.sleep(0.25)
    return False


def make_probe_page(page_path, lang, second_load, tag, throttle=False):
    """复制一份受验页面，把 SETTINGS + 探针注入到 </body> 前。"""
    src = read(os.path.join(ROOT, page_path))
    if '</body>' not in src:
        raise SystemExit('✗ %s 找不到 </body>' % page_path)

    dstdir = os.path.dirname(os.path.join(ROOT, page_path)) or ROOT
    name = '__%s_%s.html' % (tag, lang)
    dst = os.path.join(dstdir, name)
    js = os.path.join(dstdir, '__cc_probe_%s.js' % lang)
    TMP.extend([dst, js])

    probe = read(PROBE_SRC)
    write(js, probe)

    settings = {'secondLoad': bool(second_load), 'throttleRAF': bool(throttle)}
    inject = ('<script>window.SETTINGS=%s;</script>\n'
              '<script src="__cc_probe_%s.js"></script>\n'
              % (json.dumps(settings), lang))
    out = src.replace('</body>', inject + '</body>')
    write(dst, out)

    return os.path.join(os.path.dirname(page_path) or '', name).replace(os.sep, '/')


def dump_dom(url, profile_tag, wait=20000):
    # profile 目录必须「每轮唯一」且 Windows 路径形式。
    # 复用同一个目录 = 复用 localStorage —— 第一轮就不再是"首次到访"，
    # 横幅不会创建，断言会卡在等 .cc-banner 上（曾这样白查一轮）。
    profile = 'C:/Users/xuexi/AppData/Local/Temp/wxs_cc_%s' % profile_tag
    cmd = [
        CHROME, '--headless=new', '--no-sandbox',
        '--window-size=1440,2000',
        '--user-data-dir=%s' % profile,          # 必须 Windows 路径形式
        '--virtual-time-budget=%d' % wait,
        '--dump-dom', url,
    ]
    r = subprocess.run(cmd, capture_output=True, timeout=180)
    return r.stdout.decode('utf-8', 'replace')


def parse(dom):
    m = re.search(r'PROBE:(\{.*?\})\s*</pre>', dom, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(1))
    except ValueError as e:
        return {'__parse_error': str(e)}


def check(label, res, verbose=False):
    if res is None:
        print('  ✗ %-34s 探针无输出（页面没跑起来 / 脚本 404）' % label)
        return 1
    if '__parse_error' in res:
        print('  ✗ %-34s 探针输出解析失败：%s' % (label, res['__parse_error']))
        return 1
    bad = 0
    for line in res.get('steps', []):
        if line.startswith('FAIL'):
            bad += 1
            print('      ' + line)
        elif verbose:
            print('      ' + line[:150])
    if bad:
        print('  ✗ %-34s 失败 %d 项 / 共 %d 项'
              % (label, bad, len(res.get('steps', []))))
        # 关键诊断：走到最后一步了吗？没走到说明卡在某个 gate 上
        last = res.get('steps', [])[-1] if res.get('steps') else None
        print('      最后一步：%s' % (last[:120] if last else '（无）'))
    else:
        print('  ✔ %-34s 全部 %d 项通过' % (label, len(res.get('steps', []))))
    return bad


def diagnose(label, dom):
    """探针完全没输出时的兜底诊断：页面到底加载到哪一步了。"""
    print('      —— %s DOM 诊断 ——' % label)
    print('      DOM 长度：%d' % len(dom))
    for k in ['js/consent.js', 'cc-banner', 'cc-overlay', '__probe', 'PROBE:',
              'cc-switch__input', 'data-cookie-settings']:
        print('      含 %-22s : %s' % (k, k in dom))


def main():
    if not os.path.exists(CHROME):
        raise SystemExit('✗ 找不到 Chrome/Edge')

    # ── 起本地 http 服务（文件一定要走 http，否则 cookie 断言是假的）──
    srv = subprocess.Popen(
        [PYTHON, '-m', 'http.server', str(PORT), '--bind', HOST],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    try:
        if not wait_port(PORT):
            raise SystemExit('✗ http 服务起不来（端口 %d）' % PORT)
        print('本地服务已就绪：%s\n' % BASE_URL)

        total = 0
        banner_titles = {}
        stamp = str(int(time.time()))
        profiles = {}     # lang -> 第一轮用过的 profile tag，第二轮必须复用同一个

        # ── 第一轮：首次到访，每个语言各一个全新 profile ──
        for page, lang in PAGES:
            tag = '%s_r1_%s' % (stamp, lang)
            profiles[lang] = tag
            rel = make_probe_page(page, lang, False, 'r1')
            url = '%s/%s' % (BASE_URL, rel)
            dom = dump_dom(url, tag)
            res = parse(dom)
            if res is None:
                diagnose('首次到访 · %s' % lang, dom)
            total += check('首次到访 · %s' % lang, res)
            if res:
                banner_titles[lang] = res.get('bannerText')

        # ── 第二轮：回访，必须复用第一个 profile（localStorage 才在）──
        print()
        for page, lang in PAGES:
            rel = make_probe_page(page, lang, True, 'r2')
            url = '%s/%s' % (BASE_URL, rel)
            res = parse(dump_dom(url, profiles[lang]))
            if res is None:
                print('  ✗ 回访持久化 · %s 探针无输出' % lang)
                total += 1
                continue
            total += check('回访持久化 · %s' % lang, res)
            if res and res.get('footerLabel'):
                print('      页脚入口文案：%s' % res['footerLabel'])

        # ── 第三轮：rAF 被冻结时 UI 必须照样可用 ──
        # 跑的版本会让 rAF 回调永不执行；若产品把显隐挂在 requestAnimationFrame 上，
        # 面板会存在却 opacity:0，用户根本看不见 —— 这里把它钉死。
        print()
        for page, lang in PAGES:
            tag = '%s_r3_%s' % (stamp, lang)
            rel = make_probe_page(page, lang, False, 'r3', throttle=True)
            url = '%s/%s' % (BASE_URL, rel)
            dom = dump_dom(url, tag)
            res = parse(dom)
            if res is None:
                diagnose('rAF 冻结 · %s' % lang, dom)
            else:
                frozen = res.get('rafFrozen')
                if not frozen:
                    print('  ✗ %-34s rAF 覆写没生效 —— 这一轮等于没跑' % ('rAF 冻结 · ' + lang))
                    total += 1
            if res is None:
                total += 1
                continue
            total += check('rAF 冻结下仍可用 · %s' % lang, res)

        # ── 语言独立性：中英两站文案必须真的不一样 ──
        print()
        if banner_titles.get('en') and banner_titles.get('zh'):
            if banner_titles['en'] != banner_titles['zh']:
                print('  ✔ %-34s 英文「%s」/ 中文「%s」'
                      % ('中英文案不同', banner_titles['en'], banner_titles['zh']))
            else:
                print('  ✗ %-34s 两边同为「%s」—— 语言没切换' % ('中英文案不同', banner_titles['en']))
                total += 1
        else:
            print('  ✗ %-34s 拿不到标题，无法比对' % '中英文案不同')
            total += 1

        print('\n' + '─' * 46)
        print('失败项合计：%d' % total)
        return 1 if total else 0
    finally:
        srv.terminate()
        cleaned = 0
        for f in TMP:
            if os.path.exists(f):
                os.remove(f)
                cleaned += 1
        if cleaned:
            print('已清理临时探针文件 %d 个' % cleaned)


if __name__ == '__main__':
    sys.exit(main())
