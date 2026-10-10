#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""补齐 wx-seastar 仓库的 GitHub Release，并把 Latest 指向最高版本。

为什么需要它：发布收尾闸门 deploy/release-audit.py 会校验
「每个 tag 都有 GitHub Release」「Release Latest 落在最高版本上」，
但本仓库的远端走 SSH（git@github.com:），**SSH 无法创建 Release** ——
Release 只能走 REST API，因此需要一个有 repo 权限的凭据。

用法：
    python release-create.py --dry-run          # 只打印计划（无需凭据）
    GITHUB_TOKEN=xxx python release-create.py --apply   # 真正执行

凭据：classic PAT 的 repo 权限，或 fine-grained PAT 的
      「Contents: Read and write」+「Metadata: Read」。

⚠️ 本仓库是公开仓库 —— 凭据**只从环境变量读**，绝不要写进任何入库文件。
   （这是本文件的纪律，也是整个项目「公开仓库」硬约束的一部分。）
"""
import argparse
import io
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

API = 'https://api.github.com'
REPO = os.environ.get('GITHUB_REPOSITORY', 'WisdomHuang2020/wx-seastar')


def repo_root():
    """用 git 定位仓库根 —— 这样本脚本放在 deploy/ 或任何子目录都能跑。"""
    try:
        out = subprocess.run(['git', 'rev-parse', '--show-toplevel'],
                             capture_output=True, text=True)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    except Exception:  # noqa: BLE001
        pass
    return os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))


CHANGELOG = os.path.join(repo_root(), 'CHANGELOG.md')


def api(path, method='GET', token=None, payload=None):
    url = API + path
    data = json.dumps(payload).encode('utf-8') if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header('Accept', 'application/vnd.github+json')
    r.add_header('X-GitHub-Api-Version', '2022-11-28')
    r.add_header('User-Agent', 'wx-seastar-release-tool')
    if data is not None:
        r.add_header('Content-Type', 'application/json')
    if token:
        r.add_header('Authorization', 'Bearer ' + token)
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            raw = resp.read().decode('utf-8')
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8', 'replace')
    except Exception as e:  # noqa: BLE001
        return 0, str(e)


def parse_changelog():
    """→ {version: {'title':…, 'body':…}}（CHANGELOG 为『最新在上』）。"""
    text = io.open(CHANGELOG, encoding='utf-8').read()
    parts = re.split(r'^## \[(v[0-9.]+)\][^\n]*\n', text, flags=re.M)
    out = {}
    for i in range(1, len(parts) - 1, 2):
        ver, body = parts[i], parts[i + 1]
        body = re.split(r'\n---\s*\n', body)[0].strip('\n')
        m = re.search(r'^###\s+(.*)$', body, re.M)
        title = m.group(1).strip() if m else ver.lstrip('v')
        if m:
            body = (body[:m.start()] + body[m.end():]).strip('\n')
        out[ver] = {'title': title, 'body': body}
    return out


def list_tags():
    out = subprocess.run(['git', 'ls-remote', '--tags', 'origin'],
                         capture_output=True, text=True).stdout
    tags = set()
    for line in out.splitlines():
        m = re.search(r'refs/tags/(v[0-9.]+)$', line)
        if m:
            tags.add(m.group(1))
    return tags


def list_releases():
    """公开仓库的 Release 列表可**免鉴权**读取 → dry-run 无需凭据。"""
    rel, page = {}, 1
    while True:
        st, data = api('/repos/%s/releases?per_page=100&page=%d' % (REPO, page))
        if st != 200 or not isinstance(data, list) or not data:
            break
        for r in data:
            rel[r['tag_name']] = r
        if len(data) < 100:
            break
        page += 1
    return rel


def vkey(v):
    return tuple(int(x) for x in v.lstrip('v').split('.'))


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group()
    g.add_argument('--apply', action='store_true', help='真正执行（默认只打印计划）')
    g.add_argument('--dry-run', action='store_true', help='只打印计划（默认行为）')
    g.add_argument('--check', action='store_true', help='只校验凭据与权限，不创建任何东西')
    a = ap.parse_args()

    token = os.environ.get('GITHUB_TOKEN') or os.environ.get('GH_TOKEN')

    # --check：用最小代价先验证"钥匙对不对、权限够不够"，再决定要不要开门
    if a.check:
        if not token:
            print('✘ 未检测到 GITHUB_TOKEN', file=sys.stderr)
            return 2
        # 1) 身份 —— 信息性即可。
        #    ⚠️ Actions 内置的 GITHUB_TOKEN 是**安装令牌**，调 GET /user 可能返回 403
        #    （Resource not accessible by integration），这**不代表凭据无效**，不能据此判失败。
        st, me = api('/user', token=token)
        if st == 200 and isinstance(me, dict):
            print('✓ 凭据有效，身份 : %s' % me.get('login'))
        else:
            print('ℹ️ GET /user → HTTP %s（Actions 内置 token 属正常，继续）' % st)
        # 2) 仓库可达性
        st, repo = api('/repos/%s' % REPO, token=token)
        if st != 200 or not isinstance(repo, dict):
            print('✘ 读不到仓库 %s（HTTP %s）：%s' % (REPO, st, str(repo)[:200]), file=sys.stderr)
            return 2
        print('✓ 可访问仓库     : %s' % repo.get('full_name'))
        # 3) 写能力探针
        st, body = api('/repos/%s/releases' % REPO, 'POST', token, {
            'tag_name': 'invalid ref with spaces', 'name': 'permission probe'})
        print('  写能力探针       : HTTP %s' % st)
        if st == 422:
            print('✓ 写权限正常     : 可以创建 Release')
            return 0
        if st in (200, 201):
            rid = (body or {}).get('id')
            api('/repos/%s/releases/%s' % (REPO, rid), 'DELETE', token)
            print('⚠️ 探针意外成功，已自动删除（id=%s）' % rid)
            return 0
        print('✘ 写权限不足（HTTP %s）：%s' % (st, str(body)[:300]), file=sys.stderr)
        print('  · 若在 Actions 里：确认本工作流声明了 permissions: contents: write；\n'
              '    并检查仓库 Settings → Actions → General → Workflow permissions。', file=sys.stderr)
        return 2

    cl = parse_changelog()
    tags = list_tags()
    rel = list_releases()
    if not tags:
        print('✘ 读不到远端 tag（git ls-remote 失败？）', file=sys.stderr)
        return 1

    missing = sorted([t for t in tags if t not in rel], key=vkey)
    highest = max(tags, key=vkey)

    print('仓库          : %s' % REPO)
    print('远端 tag      : %d 个，最高 %s' % (len(tags), highest))
    print('已有 Release  : %d 个' % len(rel))
    print('待建 Release  : %d 个' % len(missing))
    for t in missing:
        info = cl.get(t)
        print('   - %-8s %s' % (t, info['title'] if info else '⚠️ CHANGELOG 无此版本'))
    print('Latest 将指向 : %s' % highest)
    print('其中 CHANGELOG 缺条目的: %s' % ([t for t in missing if t not in cl] or '无'))

    if not a.apply:
        print('\n[dry-run] 未做任何写操作。加 --apply 执行。')
        return 0

    if not token:
        print('\n✘ 缺少凭据：请设置 GITHUB_TOKEN（需 repo 写权限）。', file=sys.stderr)
        return 2

    created, failed = 0, []
    for t in missing:
        info = cl.get(t, {})
        st, body = api('/repos/%s/releases' % REPO, 'POST', token, {
            'tag_name': t,
            'name': ('%s %s' % (t, info.get('title', ''))).strip(),
            'body': info.get('body') or '详见 CHANGELOG.md',
            'draft': False,
            'prerelease': False,
        })
        if st in (200, 201):
            created += 1
            print('  ✓ %s' % t)
        else:
            failed.append(t)
            print('  ✘ %s → HTTP %s %s' % (t, st, str(body)[:200]))

    rel2 = list_releases()
    rid = (rel2.get(highest) or {}).get('id')
    if rid:
        st, body = api('/repos/%s/releases/%s' % (REPO, rid), 'PATCH', token,
                       {'make_latest': 'true'})
        print('  %s Latest → %s' % ('✓' if st == 200 else '✘', highest))

    print('\n完成：新建 %d 个%s。' % (created, ('，失败 %s' % failed) if failed else ''))
    return 0 if not failed else 3


if __name__ == '__main__':
    sys.exit(main())
