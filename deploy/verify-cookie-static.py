#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
静态检查：18 个页面的 Cookie 模块挂载是否齐全。

与 add-cookie-consent.py 分离是有意的 ——
注入脚本自己证明自己对，等于没有第三方核对（v0.13.2 的假绿就是这么来的）。
这里用一个独立的检查器重扫一遍；并且它的 json 圆柱形反向能力要用
.cc-backup/ 里的「注入前原文」验证：喂进去必须报错，否则检查器是摆设。

用法：
    python deploy/verify-cookie-static.py            # 正式检查
    python deploy/verify-cookie-static.py --self-test # 反向自检
"""

import io
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKUP_DIR = os.path.join(ROOT, '.cc-backup')

ROOT_PAGES = [
    'index.html', 'lighting.html', 'grow-light.html', 'odm.html', 'oem.html',
    'docs.html', 'about.html', 'contact.html', '404.html',
]

FOOTER_LABEL = {
    'root': 'Cookie settings',
    'cn': 'Cookie 设置',
}


def read(p):
    with io.open(p, 'r', encoding='utf-8', newline='') as f:
        return f.read().replace('\r\n', '\n')


def errors_for(text, prefix, expect_label):
    """返回该文件所有不合格的地方；空列表 = 合格。"""
    errs = []
    rel = prefix + 'js/consent.js'

    n = text.count(rel)
    if n == 0:
        errs.append('未引入 %s' % rel)
    elif n > 1:
        errs.append('重复引入 %s（%d 次）' % (rel, n))

    if rel not in text and 'js/site.js' in text:
        errs.append('改了 site.js 却漏了 consent.js')

    b = text.count('data-cookie-settings')
    if b == 0:
        errs.append('缺少页脚 Cookie 设置入口')
    elif b > 1:
        errs.append('页脚入口重复（%d 个）' % b)

    if expect_label and b == 1:
        if ('data-cookie-settings>%s<' % expect_label) not in text:
            errs.append('页脚入口文案不是「%s」' % expect_label)

    # 路径前缀必须跟语言站一致：中文站漏了 ../ 会让脚本 404
    if prefix == '../':
        if '<script src="js/consent.js"' in text:
            errs.append('中文站用了根相对路径（应为 ../js/consent.js）')
    else:
        if '<script src="../js/consent.js"' in text:
            errs.append('英文站多了 ../ 前缀')

    # 页脚按钮必须是 button，不能是 a（无 JS 时不该导航到不存在的地方）
    if '<a' in text and 'data-cookie-settings' in text:
        seg = text[text.find('data-cookie-settings') - 120:text.find('data-cookie-settings')]
        if seg.rfind('<a') > seg.rfind('<button'):
            errs.append('页脚入口应写成 <button>，不是 <a>')

    return errs


def git_original(relpath):
    """从 git 历史里取「本次改动前」的原文作为负样本。

    比留一个 .cc-backup/ 备份目录更好：那是 ×18 份 HTML 全文，
    内容与 git 里已有的上一版完全重复，纯属冗余。
    用 HEAD 版本则永远可用，换台机器、clone 下来照样跑得动反向自检。"""
    import subprocess
    r = subprocess.run(['git', 'show', 'HEAD:%s' % relpath.replace(os.sep, '/')],
                       cwd=ROOT, capture_output=True)
    if r.returncode != 0:
        return None
    return r.stdout.decode('utf-8', 'replace').replace('\r\n', '\n')


def collect(src_dir_map):
    total = 0
    for kind, d in src_dir_map.items():
        prefix = '../' if kind == 'cn' else ''
        label = FOOTER_LABEL[kind]
        for name in ROOT_PAGES:
            p = os.path.join(d, name)
            if not os.path.isfile(p):
                print('  ✗ %-20s 文件不存在' % ('%s/%s' % (kind, name)))
                total += 1
                continue
            errs = errors_for(read(p), prefix, label)
            if errs:
                total += 1
                print('  ✗ %-20s %s' % ('%s/%s' % (kind, name), '；'.join(errs)))
    return total


def main():
    self_test = '--self-test' in sys.argv

    if self_test:
        print('反向自检：向检查器喂「改动前」的原文（取自 git HEAD），它必须报错\n')
        ok_n = 0
        need = 0
        for kind, pfx in (('root', ''), ('cn', 'cn' + os.sep)):
            for name in ROOT_PAGES:
                rel = pfx + name
                need += 1
                src = git_original(rel)
                if src is None:
                    print('  ✗ 取不到 git 原文：%s' % rel)
                    continue
                errs = errors_for(src, '../' if kind == 'cn' else '', None)
                if errs:
                    print('  ✔ %-22s 已检出：%s' % (rel, errs[0]))
                    ok_n += 1
                else:
                    print('  ✗ %-22s 检查器判它合格 —— 检查器无效！' % rel)
        print('\n' + '─' * 56)
        if ok_n == need:
            print('反向自检通过：%d 个「未注入」样本全部被判不合格 → 检查器有效' % need)
            return 0
        print('反向自检失败：仅 %d/%d 被检出' % (ok_n, need))
        return 1

    print('静态检查：全站 18 个页面的 Cookie 模块挂载\n')
    bad = collect({
        'root': ROOT,
        'cn': os.path.join(ROOT, 'cn'),
    })
    print('\n' + '─' * 56)
    if bad:
        print('不合格 %d 处' % bad)
        print('提示：跑 python deploy/verify-cookie-static.py --self-test 可验证检查器本身是否靠谱')
        return 1
    print('18 个页面全部合格（含中英文站各自的脚本路径与按钮文案）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
