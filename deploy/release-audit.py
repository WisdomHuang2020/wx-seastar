#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
发版收尾闸门：版本一致性四方审计。

  用法：  python3 deploy/release-audit.py            # 全量检查
          python3 deploy/release-audit.py --no-api   # 跳过 GitHub Release 检查（离线可用）

比对四个事实来源，任一处对不上就打印 ✘ 并以**退出码 1** 结束：

  ① CHANGELOG.md 的版本条目   （`## [vX.Y.Z] - YYYY-MM-DD`）── 版本节点的权威清单
  ② 仓库根 VERSION 文件        ── 版本号的**唯一来源**（部署脚本读它写线上哨兵）
  ③ 远端 git tag              ── 用远端而非本地：「本地打了没推」是最常见的隐性缺口
  ④ GitHub Release            ── tag 推送**不会**自动建 Release，必须单独核对

**退出码**：
  `0` 四方一致，可视为发完；
  `1` 有缺口（列出具体缺什么）；
  `3` **没能完整审计** —— 例如匿名 API 被限流导致 Release 维度没查成。
      刻意不用 0：把"检查没做成"当成"检查通过"正是假绿的来源。

  需要鉴权时先设 `GITHUB_TOKEN` 环境变量再跑。

【为什么要这个脚本】
  「部署成功」≠「发版完成」。2026-09-30 本仓库首次补标签时，15 个版本节点、
  0 个 tag、0 个 Release —— 而整条推送/部署链路全程没有任何一步会因此报错。
  没有这一步，漏打 tag / 漏建 Release 是**静默**发生的。

【反向验证（证明这个检查真的会失败）】
  只在「全 ✔」时通过是不够的 —— 永远通过的检查等于没有检查。
  构造一个缺口再跑一次，必须报 ✘ 且退出码 1：
      printf '## [v9.9.9] - 2026-01-01\\n\\n人为缺口\\n\\n' > /tmp/gap.md
      cat CHANGELOG.md >> /tmp/gap.md
      python3 deploy/release-audit.py --changelog /tmp/gap.md; echo $?   # 期望 1
"""
import argparse
import json
import os
import re
import subprocess
import sys

CHANGELOG_RE = re.compile(r'^##\s*\[(v\d+\.\d+\.\d+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$', re.M)
VERSION_RE = re.compile(r'^\s*(\d+\.\d+\.\d+)\s*$')


def run(cmd, timeout=30):
    """跑一条 git 命令。**必须带超时** —— 网络一卡，整条审计就会永久挂住。

    ⚠️ 这里用 shell=True 是为了 `$(...)` 之类的写法方便，但在 Windows 上
    shell 是 **cmd.exe**：命令里**不要出现 `|`**（会被当管道截断），
    也**不要用 `printf`**（cmd.exe 没有该内建）。复杂命令请改用列表形式调 subprocess。
    """
    try:
        r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=timeout)
        return r.stdout.strip()
    except subprocess.TimeoutExpired:
        print('   ⚠️  命令超时（%ss）：%s' % (timeout, cmd[:70]))
        return ''


def github_token():
    """GitHub 凭据 —— **只读环境变量**，取不到就匿名。

    ⚠️ 这里**刻意不调 `git credential fill`**，原因是个很隐蔽的坑（2026-09-30 实测）：
      · 本机凭证助手是 GCM，`git credential fill` 会拉起 `git-credential-manager`
        这个**孙进程**并让它继承 stdout 管道；
      · 于是即便给 `subprocess.run(timeout=5)`，超时后 Python 杀掉的是 `git`，
        **GCM 仍占着管道** → Python 在排空管道那一步**永久阻塞**
        （实测 70 秒无响应、整条命令被 SIGTERM 杀死）。
      → 结论：**在脚本里调凭证助手是不可靠的**，尤其非交互环境。
        要鉴权就显式给环境变量，别去猜凭据。

    用法：`GITHUB_TOKEN=xxx python3 deploy/release-audit.py`
    （也认 `GH_TOKEN`。公开仓库的只读检查不设也能跑，只是会被匿名限流 60 次/小时/IP。）
    """
    for name in ('GITHUB_TOKEN', 'GH_TOKEN'):
        v = os.environ.get(name, '').strip()
        if v:
            return v
    return ''


def _api(url, token=None):
    """GET 一个 GitHub API 地址；不可达/无权限时返回 None（不阻断审计）。

    用 **curl** 而不是 urllib：本机实测 urllib 打 api.github.com 会挂住不返回，
    换成 curl 秒级完成（匿名读公开仓库即 200）。且 curl 有 `--max-time` 硬上限。
    """
    cmd = ['curl', '-sS', '--max-time', '30',
           '-H', 'Accept: application/vnd.github+json',
           '-H', 'User-Agent: release-audit']
    if token:
        cmd += ['-H', 'Authorization: Bearer ' + token]
    cmd.append(url)
    try:
        r = subprocess.run(cmd, capture_output=True, text=True,
                           encoding='utf-8', errors='replace', timeout=40)
    except Exception as e:                                   # noqa: BLE001
        print('   ⚠️  API 调用失败：%s' % e)
        return None
    if r.returncode != 0:
        print('   ⚠️  API curl 失败（rc=%s）：%s' % (r.returncode, r.stderr.strip()[:120]))
        return None
    try:
        return json.loads(r.stdout)
    except Exception:                                        # noqa: BLE001
        print('   ⚠️  API 返回不是 JSON：%s' % r.stdout.strip()[:120])
        return None


def keyver(v):
    return tuple(int(x) for x in v.lstrip('v').split('.'))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--changelog', default='CHANGELOG.md')
    ap.add_argument('--version-file', default='VERSION')
    ap.add_argument('--remote', default='origin')
    ap.add_argument('--repo', default=None, help='owner/name，缺省从 remote 推断')
    ap.add_argument('--no-api', action='store_true', help='跳过 GitHub Release 检查')
    a = ap.parse_args()

    print('=' * 68)
    print('版本一致性四方审计')
    print('=' * 68)

    # ── ① CHANGELOG ───────────────────────────────────────────────────
    try:
        chg_raw = open(a.changelog, encoding='utf-8').read()
    except OSError:
        sys.exit('✘ 找不到 %s' % a.changelog)
    chg = CHANGELOG_RE.findall(chg_raw)
    chg_set = [v for v, _ in chg]
    if not chg:
        sys.exit('✘ %s 里没有解析到任何 `## [vX.Y.Z] - YYYY-MM-DD` 条目' % a.changelog)
    print('CHANGELOG 条目      : %d 条，最新 = %s' % (len(chg_set), chg_set[0]))

    # ── ② 单一来源 VERSION ────────────────────────────────────────────
    try:
        ver_raw = open(a.version_file, encoding='utf-8').read()
    except OSError:
        sys.exit('✘ 找不到 %s' % a.version_file)
    m = VERSION_RE.match(ver_raw)
    if not m:
        sys.exit('✘ %s 内容不是合法的 X.Y.Z：%r' % (a.version_file, ver_raw))
    version = 'v' + m.group(1)
    print('单一来源 VERSION    : %s' % version)

    # ── ③ 远端 tag ────────────────────────────────────────────────────
    tag_raw = run('git ls-remote --tags %s' % a.remote)
    tags = sorted({l.split('refs/tags/')[-1].replace('^{}', '')
                   for l in tag_raw.split('\n') if 'refs/tags/' in l},
                  key=keyver)
    print('远端 tag            : %d 个，最高 = %s' % (len(tags), tags[-1] if tags else '—'))

    # ── ④ GitHub Release ─────────────────────────────────────────────
    rel = None
    latest_rel = None
    if not a.no_api:
        repo = a.repo
        if not repo:
            url = run('git remote get-url %s' % a.remote)
            mm = re.search(r'github\.com[:/]([^/]+/[^/.]+)', url)
            repo = mm.group(1) if mm else None
        if not repo:
            print('⚠️  无法从 remote 推断 owner/name，跳过 Release 检查')
        else:
            tok = github_token()
            data = _api('https://api.github.com/repos/%s/releases?per_page=100' % repo, tok)
            if data is None or not isinstance(data, list):
                # 注意：403 限流时 API 返回的是**错误对象**（dict），不是列表。
                # 若按列表迭代会直接 TypeError 崩掉 —— 必须先判类型再当"不可用"处理。
                if isinstance(data, dict):
                    print('   ⚠️  API 返回错误对象：%s'
                          % str(data.get('message', data))[:120])
                print('⚠️  Release 接口不可达或无权限，跳过该检查')
            else:
                rel = {d['tag_name']: d for d in data}
                got = _api('https://api.github.com/repos/%s/releases/latest' % repo, tok)
                if isinstance(got, dict) and got.get('tag_name'):
                    latest_rel = got['tag_name']
                print('GitHub Release      : %d 个，Latest = %s'
                      % (len(rel), latest_rel or '—'))

    # ── 判定 ─────────────────────────────────────────────────────────
    bad = []
    incomplete = []          # 因外部条件（API 限流等）**没能检查**的项，与"检查不通过"区别对待

    def report(title, items, hint):
        if items:
            bad.append(title)
            print('\n✘ %s（%d）: %s' % (title, len(items), ', '.join(items)))
            print('   → %s' % hint)
        else:
            print('✔ %s' % title)

    chg_s, tag_s = set(chg_set), set(tags)
    report('CHANGELOG 里的每个版本都有远端 tag', sorted(chg_s - tag_s, key=keyver),
           '补 tag：GIT_COMMITTER_DATE="$(git show -s --format=%cI <提交>)" '
           'git tag -a vX.Y.Z <提交> -m "<标题>" -m "<正文>"，再 git push origin vX.Y.Z')
    report('每个远端 tag 都有 CHANGELOG 条目', sorted(tag_s - chg_s, key=keyver),
           '补写 CHANGELOG 条目，或删掉误打的 tag')

    if rel is None:
        # 没能拿到 Release 列表：常见原因是**匿名 API 被限流**（60 次/小时/IP）
        # 且本机凭证助手拿不到 token。此时**不能当作检查通过**，也不能报成"缺口"，
        # 要单列为「未完成」，让调用方知道这次审计并没有覆盖全部四个维度。
        incomplete.append('GitHub Release 维度未检查（API 不可用或限流）')
        print('\n⚠️  跳过 GitHub Release 检查 —— 未取到 Release 列表')
        print('   常见原因：匿名 API 限流（60 次/小时/IP）且本机取不到 token')
        print('   补救：设 GITHUB_TOKEN 环境变量后重跑，或稍后再试')
        print('   ⚠️  注意：**本次审计并未覆盖全部四个维度，不能视为"已发完"**')
    else:
        rel_s = set(rel)
        report('每个 tag 都有 GitHub Release', sorted(tag_s - rel_s, key=keyver),
               '建 Release（tag 推送不会自动创建）')
        empty = sorted([t for t, d in rel.items() if not (d.get('body') or '').strip()],
                       key=keyver)
        report('每个 Release 都有正文', empty, 'Release 正文为空说明 tag 消息没带上')
        # Latest 徽标应落在最高版本上。批量补历史 Release 时，
        # created_at 会被 GitHub 回填成 tag 原日期，「谁最后建」不再是判据，
        # 必须对最高版本显式 make_latest=true。
        if latest_rel is None:
            incomplete.append('Release Latest 未能读取（API 限流）')
            print('\n⚠️  跳过 Release Latest 检查 —— 未取到 /releases/latest')
        else:
            report('Release Latest 落在最高版本上',
                   [] if latest_rel == version else [latest_rel + ' != ' + version],
                   '对最高版本单独设 Latest：curl -X PATCH .../releases/<id> '
                   '-d \'{"make_latest":"true"}\'')

    top_chg = chg_set[0]
    if version != top_chg:
        bad.append('顶端不一致')
        print('\n✘ 顶端不一致：CHANGELOG 最新 = %s，而 VERSION = %s' % (top_chg, version))
        print('   → 「改了版本号但发布没走完」，或 CHANGELOG 没更新')
    else:
        print('✔ 顶端一致（CHANGELOG 最新 == VERSION == %s）' % version)

    if tags and tags[-1] != version:
        bad.append('远端最高 tag 与 VERSION 不一致')
        print('\n✘ 远端最高 tag = %s，而 VERSION = %s' % (tags[-1], version))
        print('   → 当前版本还没打 tag；注意「本地打了没推」也是这种表现')
    elif tags:
        print('✔ 远端最高 tag == VERSION == %s' % version)

    print()
    if bad:
        print('=' * 68)
        print('✘ 审计未通过，缺口 %d 类：%s' % (len(bad), '；'.join(bad)))
        if incomplete:
            print('   （另有 %d 项未能检查：%s）' % (len(incomplete), '；'.join(incomplete)))
        print('=' * 68)
        return 1
    if incomplete:
        # 退出码 3 ＝「没能完整审计」：既不是通过，也不是发现缺口。
        # 不返回 0，是为了避免"检查没做成"被当成"检查通过"（那正是假绿的来源）。
        print('=' * 68)
        print('⚠️  仅三方一致，**未完成完整审计**（退出码 3）')
        print('   未能检查：%s' % '；'.join(incomplete))
        print('   已核对：CHANGELOG ↔ VERSION ↔ 远端 tag')
        print('   未核对：GitHub Release')
        print('=' * 68)
        return 3
    print('=' * 68)
    print('✅ 四方一致（CHANGELOG ↔ VERSION ↔ 远端 tag ↔ GitHub Release）')
    print('=' * 68)
    return 0


if __name__ == '__main__':
    sys.exit(main())
