#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
反向验证：故意把已知缺陷塞回 js/consent.js，探针必须报错。

不做这一步，上一份"全绿"报告就无法证明任何事 ——
一个恒真的探针会让缺陷版本同样全绿（本项目 v0.13.2 就这样被骗过）。

塞三类缺陷，每一类都对应一次真实翻车：

  A 事件委托的选择器写错  → v0.13.2 原型缺陷：页面看着正常、控制台无报错，
                            但所有按钮静默失效。必须靠真点击才能验出来。
  B 用 rAF 加 is-in        → 今天修的缺陷：无头/后台标签页下渲染帧队被节流，
                            元素存在却 opacity:0，用户实际看不见。
  C 保存时不落库           → 选择不持久化，刷新后又开始弹窗。

跑完自动还原，不留脏兮兮的工作树。
"""

import io
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util

_spec = importlib.util.spec_from_file_location(
    'vcc', os.path.join(os.path.dirname(os.path.abspath(__file__)),
    'verify-cookie-consent.py'))
VCC = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(VCC)

ROOT = VCC.ROOT
TARGET = os.path.join(ROOT, 'js', 'consent.js')

BUGS = [
    # (说明, 原字符串, 缺陷字符串, 是否在 rAF 冻结模式下跑)
    ('A-事件选择器写错（v0.13.2 原型缺陷）',
     "'[data-cc], [data-cookie-settings]'",
     "'[data-cc-typo], [data-cookie-settings-typo]'",
     False),
    # B 必须在「rAF 冻结」模式下才检得出 —— 这正是这一轮存在的意义：
    # 常规环境里 rAF 照跑，把它换回去也全绿、看不出差别；只有冻结帧队，
    # 才能证明「显隐挂定时器而非渲染帧队」这个选择是必要的。
    ('B-显隐挂回 rAF（冻结帧队时 UI 透明）',
     "window.setTimeout(function () { overlay.classList.add('is-in'); }, 16);   // 理由同 showBanner：不用 rAF",
     "window.requestAnimationFrame(function () { overlay.classList.add('is-in'); });",
     True),
    ('C-保存时不写 localStorage（选择不持久化）',
     "    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略：仍会用 Cookie 兜底 */ }",
     "    /* 缺陷注入：故意不写 */",
     False),
    # 与 B 用同一个锚点，但改为「完全不挂」—— 常规模式下就该被 fadedIn 断言抓到，
    # 用来证明 fadedIn 这条断言本身是有效的（而不是恒真走过场）。
    ('D-面板完全不挂 is-in（永远透明）',
     "window.setTimeout(function () { overlay.classList.add('is-in'); }, 16);   // 理由同 showBanner：不用 rAF",
     "    /* 缺陷注入：永远不挂 is-in */",
     False),
]


def main():
    original = io.open(TARGET, 'r', encoding='utf-8', newline='').read().replace('\r\n', '\n')
    print('反向验证：把 %d 类缺陷逐个塞回 consent.js，探针必须报错\n' % len(BUGS))
    bad = 0

    try:
        srv = _srv_start()
        time.sleep(0.2)
        VCC.wait_port(VCC.PORT)

        for idx, (label, from_s, to_s, throttle) in enumerate(BUGS):
            if from_s not in original:
                print('  ✗ %-44s 注入点找不到，锚字符串已漂移' % label)
                bad += 1
                continue

            injected = original.replace(from_s, to_s, 1)
            assert injected != original, '替换无效：%s' % label
            VCC.write(TARGET, injected)

            stamp = 'neg%s%d' % (int(time.time()), idx)
            mode = 'r3' if throttle else 'r1'
            rel = VCC.make_probe_page('index.html', 'en', False, mode,
                                      throttle=throttle)
            dom = VCC.dump_dom('%s/%s' % (VCC.BASE_URL, rel), stamp, wait=12000)
            res = VCC.parse(dom)
            # 每个用例跑完就清理，别留一堆临时页在仓库里。
            # ⚠️ 不要写成 [f for f in TMP if not os.path.exists(f)] ——
            # 那会把"仍存在的文件"从待清理列表里剔除，于是谁也删不掉它们。
            _cleanup_tmp(VCC)

            n_fail = 0
            if res is None:
                n_fail = -1      # 探针完全无输出也算"被检出"
                detail = '探针无输出（卡在等待某个状态）'
            elif '__parse_error' in res:
                n_fail = -2
                detail = '解析失败'
            else:
                fails = [s for s in res.get('steps', []) if s.startswith('FAIL')]
                n_fail = len(fails)
                detail = fails[0][:110] if fails else ''

            if n_fail == 0:
                print('  ✗ %-44s 探针竟然全绿 —— 它根本没在检测！' % label)
                bad += 1
            else:
                print('  ✔ %-44s 已检出（%s）' % (label, detail))

        _cleanup_tmp(VCC)
        print('\n' + '─' * 60)
        if bad:
            print('反向验证失败 %d 项 —— 验收套件不可信，不能据此宣告完成' % bad)
        else:
            print('反向验证全部通过：%d 类缺陷都会被探针抓到 → 验收套件可信' % len(BUGS))
        return 1 if bad else 0
    finally:
        VCC.write(TARGET, original)
        try:
            srv.terminate()
        except Exception:
            pass
        restored = io.open(TARGET, 'r', encoding='utf-8', newline='').read()
        assert restored == original, '✗ consent.js 未成功还原！请手工检查'
        print('consent.js 已还原（%d 字节）' % len(restored))


def _srv_start():
    import subprocess
    return subprocess.Popen(
        [VCC.PYTHON, '-m', 'http.server', str(VCC.PORT), '--bind', VCC.HOST],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def _cleanup_tmp(mod):
    for f in list(mod.TMP):
        if os.path.exists(f):
            os.remove(f)
    mod.TMP[:] = []


if __name__ == '__main__':
    sys.exit(main())
