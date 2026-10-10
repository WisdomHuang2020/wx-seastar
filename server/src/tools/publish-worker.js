#!/usr/bin/env node
'use strict';
/**
 * Creator 发布服务 —— 把发布队列里的任务变成**真实的分支提交**。
 *
 * ── 它为什么存在 ──────────────────────────────────────────────────────
 *   Node Web 进程**不持有仓库写权限**。Cookie 泄露、依赖漏洞、任意一个 Web 层
 *   的洞，都拿不到能写仓库的凭证。Web 侧只往 publish_queue 写一行任务；
 *   真正的 git 操作全部由本服务（以 root 运行、持有专用写权限密钥）执行。
 *   这是本设计里**最重要的一条安全边界**。
 *
 * ── 发布模型（用户 2026-10-10 定）──────────────────────────────────────
 *   所有后台更新都推到**一个固定的 `creator` 分支**，人工审核后合并进 main。
 *   **不是**每次一个新分支。
 *
 *   ⚠️ 关键：`creator` 每次都被**重建为「origin/main + 全部待审改动」**。
 *      为什么必须这样：长命分支若只是不断叠加提交，会逐渐落后于 main，
 *      此时开 PR 会把 main 上的新提交显示成"被回退掉" —— 一合并就把别人的工作抹了。
 *      重建之后，`creator` 相对 main 的差异**永远只有待审的内容改动**。
 *
 *      重建不丢东西：待审改动**不在分支里，而在数据库里**（page_blocks）。
 *      分支只是数据库当前状态的一个投影。所以每次重建都从 DB 重新渲染一遍。
 *
 *   ⚠️ 因为要重建，推送是 `--force`。但会先检查 `creator` 上有没有
 *      **不是本服务提交的** commit —— 有就拒绝，避免把人工改动冲掉。
 *
 * ── 铁律 ──────────────────────────────────────────────────────────────
 *   ① **绝不推 main** —— 只推 `creator`
 *   ② **基线校验** —— 目标页在 base_sha..origin/main 之间被开发改过，
 *      说明库里的积木已过期 → **拒绝发布**，绝不覆盖别人的提交
 *   ③ **发布前必过闸门** —— 行尾 / 引用完整性 / 渲染确定性 / 变更范围
 *   ④ **变更范围只准是已纳管的页面** —— 多改一个文件就中止
 *   ⑤ **发布成功后回写 base_sha** —— 否则下次发布会把**自己上次的提交**
 *      误判成"他人改动"，导致每个页面只能成功发布一次
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const db = require('../lib/db');
const { renderPage } = require('../lib/render-page');
const N = require('../lib/news');

db.migrate();

const REPO = process.env.WX_REPO_DIR || '/opt/wx-seastar/repo';
/** 推送用**有写权限**的别名；仓库里的 origin 是只读别名，不能用来推 */
const PUSH_URL = process.env.WX_PUSH_URL
  || 'git@github-wxseastar-publish:WisdomHuang2020/wx-seastar.git';
/** 固定的待审分支（用户 2026-10-10 定：都推这里，审完合 main） */
const BRANCH = process.env.WX_PUBLISH_BRANCH || 'creator';
/**
 * ⚠️ 绝不要再建 `creator/<xxx>` 形式的分支。
 *    git 的 ref 是**目录树**：`refs/heads/creator` 与 `refs/heads/creator/xxx`
 *    不能共存 —— 建后者会让前者报
 *    `cannot lock ref ... 'refs/heads/creator/xxx' exists`。
 *    （v0.23~v0.26 的旧命名就是 `creator/<slug>-<时间戳>`，实测踩到过。）
 */
/** 本服务提交时用的作者，用于识别"这个分支上的提交是不是我们自己的" */
const BOT_NAME = 'wx-seastar-publish';
const BOT_EMAIL = 'publish@wx-seastar.local';

const DRY = process.argv.includes('--dry-run');

function sh(args, opts = {}) {
  return execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8', timeout: 120000, ...opts,
  }).trim();
}

function log(msg) { console.log('  ' + msg); }

/**
 * 取「工作区里改动的文件路径」。
 *
 * ⚠️ 这里**不能用 sh()** —— 它内部对整段输出做了 `.trim()`，
 *    而 porcelain 的**第一行以空格开头**（" M cn/news.html"），
 *    那个空格会被 trim 吃掉，第一行就变成 "M cn/news.html"，
 *    再按固定位数切前缀就会切出 "n/news.html" 这种**截错的文件名**
 *    （实测踩到：闸门报"暂存了不该提交的文件 cn/news.html"，
 *     因为允许列表里存的是 n/news.html）。
 *    → 用 `-z`（NUL 分隔）且**不做任何 trim**，既避免首行被吃，也避免路径被引号包住。
 */
function changedPaths(paths) {
  const out = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '-z', '--', ...paths],
    { encoding: 'utf8', timeout: 60000 });
  return out.split('\0').filter(Boolean).map(e => e.slice(3).trim());
}

function setQueue(id, status, extra = '') {
  const logTxt = String(extra || '').slice(0, 4000);
  db.run(
    `UPDATE publish_queue SET status = ?, log = ?, finished_at = datetime('now','localtime')
      WHERE id = ?`, [status, logTxt, id]);
  console.log('[queue#' + id + '] → ' + status + (logTxt ? '  ' + logTxt.split('\n')[0] : ''));
}

/* ───────────────  闸门  ─────────────── */

/** ① 行尾必须是 LF（CRLF 会毒化 .sh / 部署） */
function gateLF(file) {
  // ⚠️ 不能写 `buf.filter ? 0 : ...` —— Buffer 是 TypedArray，**也有 .filter**，
  //    那样写判据恒为 0，闸门形同虚设。直接按字节数。
  const buf = fs.readFileSync(file);
  let crlf = 0;
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0x0d && buf[i + 1] === 0x0a) crlf++;
  }
  if (crlf) throw new Error(`闸门/行尾：${path.basename(file)} 含 ${crlf} 处 CRLF`);
}

/** ② 页内本地引用必须能解析（防止发布出死链）*/
function gateRefs(file) {
  const html = fs.readFileSync(file, 'utf8');
  const refs = new Set();
  const re = /(?:src|href)="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[1];
    if (/^(https?:|mailto:|tel:|#|javascript:|\/\/|\/)/.test(u)) continue;
    refs.add(u.split('#')[0].split('?')[0]);
  }
  const dir = path.dirname(file);
  const bad = [];
  for (const r of refs) {
    if (!r) continue;
    const p = path.resolve(dir, r);
    if (!fs.existsSync(p) && !fs.existsSync(p + '.html') && !fs.existsSync(path.join(p, 'index.html'))) {
      bad.push(r);
    }
  }
  if (bad.length) throw new Error('闸门/死链：' + bad.slice(0, 5).join(', ') + (bad.length > 5 ? ` 等 ${bad.length} 处` : ''));
}

/** ③ 渲染必须确定（两次渲染结果一致，否则说明有随机性/时间戳） */
function gateDeterministic(pageId, expected) {
  const again = renderPage(pageId);
  if (again !== expected) throw new Error('闸门/不确定性：同一份积木两次渲染结果不同');
}

/**
 * ④ 变更范围只准是已纳管的页面文件
 *
 * ⚠️ 不能看 `git status --porcelain` —— 部署副本里**随时可能有与本次无关的
 *    未跟踪文件**（运维手工放的脚本、上一次部署的残留等），
 *    那样每个发布都会被自己的闸门挡死。所以先 add 再看**暂存区差异**。
 */
function gateScope(allowedFiles) {
  const allow = new Set(allowedFiles);
  sh(['add', '-A', '--', '.']);
  const staged = sh(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const extra = staged.filter(f => !allow.has(f));
  if (extra.length) {
    sh(['reset', '--quiet']);
    throw new Error('闸门/越界：本次暂存了不该提交的文件 ' + extra.slice(0, 5).join(', '));
  }
  return { files: staged };
}

/* ───────────────  主流程  ─────────────── */

function processOne(task) {
  const id = task.id;
  const isNews = task.kind === 'news';
  const page = isNews ? null : db.get('SELECT * FROM pages WHERE id = ?', [task.page_id]);
  if (!isNews && !page) throw new Error('页面不存在（page_id=' + task.page_id + '）');
  // 新闻与页面**走同一条主流程**：都是"重建 creator = main + 全部待审改动"，
  // 只是新闻任务没有单一目标页，跳过页面的漂移校验。

  // ⚠️ 新闻任务没有目标页，这些只能在判过 isNews 之后再取 —— 顺序反了会
  //    在 `page.slug` 上抛 "Cannot read properties of null"（实测踩到）。
  const relFile = isNews ? null : page.slug + '.html';
  const absFile = relFile ? path.join(REPO, relFile) : null;
  log(`任务 #${id} · ${isNews ? '新闻' : page.slug} · 待审分支 ${BRANCH}`);

  if (!fs.existsSync(REPO)) throw new Error('找不到仓库目录 ' + REPO);
  if (!isNews && !fs.existsSync(absFile)) throw new Error('仓库里找不到目标文件 ' + relFile);

  // ── 取最新 main 与待审分支 ──
  // ⚠️ 必须**连待审分支一起 fetch**：否则本地看不到它上面的旧提交，
  //    「分支收敛回 main」那一步会误判成"没有过期提交"而不执行（实测踩到）。
  sh(['fetch', '--quiet', 'origin', 'main']);
  try { sh(['fetch', '--quiet', 'origin', BRANCH]); } catch { /* 首次发布时分支还不存在 */ }
  const mainSha = sh(['rev-parse', 'origin/main']);
  log(`origin/main = ${mainSha.slice(0, 8)}`);

  // ── ① 目标页的基线校验（**本次任务的页面**：漂移了就拒绝）──
  const base = isNews ? null : (page.base_sha || task.base_sha);
  if (isNews) {
    log('新闻任务：跳过单页漂移校验（新闻的漂移在生成阶段单独判）');
  } else if (!base) {
    log('⚠️ 未记录基线（pages.base_sha 为空），跳过漂移检测');
  } else if (base !== mainSha) {
    // main 前进了不要紧，**只有当目标文件本身被改过才拦** ——
    // 否则任何一个无关提交都会阻塞发布。
    let drifted = [];
    try {
      drifted = sh(['log', '--oneline', `${base}..origin/main`, '--', relFile])
        .split('\n').filter(Boolean);
    } catch {
      drifted = ['(基线 ' + base.slice(0, 7) + ' 不在当前历史中，可能 rebase 过 → 保守视为冲突)'];
    }
    if (drifted.length) {
      throw Object.assign(new Error(
        '基线冲突：库里的积木已过期 —— ' + relFile + ' 在本页拆解之后被改动过：\n    '
        + drifted.slice(0, 5).join('\n    ')
        + '\n  处理办法：重新拆页（node src/tools/seed-pages.js --reset '
        + page.slug + '），把开发者的改动并入积木后重发。'
        + '\n  **本次拒绝发布，不会覆盖它。**'), { conflict: true });
    }
    log('main 已前进但目标文件未变，可安全发布');
  }

  // ── ② 保护：creator 上有没有**不是本服务提交的** commit ──
  let hasRemoteBranch = false;
  try { sh(['rev-parse', '--verify', '--quiet', `origin/${BRANCH}`]); hasRemoteBranch = true; } catch { }
  if (hasRemoteBranch) {
    const foreign = sh(['log', '--format=%an\t%h\t%s', `${mainSha}..origin/${BRANCH}`])
      .split('\n').filter(Boolean)
      .filter(l => !l.startsWith(BOT_NAME + '\t'));
    if (foreign.length) {
      throw Object.assign(new Error(
        `待审分支 ${BRANCH} 上有 **不是发布服务提交的** 内容，重建会把它冲掉：\n    `
        + foreign.slice(0, 5).join('\n    ')
        + `\n  处理办法：先把这些提交合并进 main（或移走），再重新发布。`
        + `\n  **本次拒绝发布。**`), { conflict: true });
    }
  }

  // ── ③ 重建待审分支 = origin/main + 全部待审改动 ──
  //    ⚠️ 待审改动**不在分支里、在数据库里**，所以每次从 DB 重新渲染。
  //       这样分支相对 main 的差异永远只有内容改动，不会让 main 的新提交"被回退"。
  if (!DRY) sh(['checkout', '--quiet', '-B', BRANCH, 'origin/main']);

  // ── 新闻：先重新生成（**生成 + 同步抽屉必须一起跑**，见 lib/news.js 头注释）──
  const newsChanged = [];
  let newsSkipped = null;
  {
    const rows = N.ordered();
    if (rows.length) {
      // 新闻的漂移基线存在 settings 里：dev 若改过 news/ 下的文件就不能覆盖
      const nb = db.get("SELECT value FROM settings WHERE key='news.base_sha'");
      const nbase = nb && nb.value;
      let ndrift = [];
      if (nbase && nbase !== mainSha) {
        try {
          ndrift = sh(['log', '--oneline', `${nbase}..origin/main`, '--',
            'news.html', 'cn/news.html', 'news/', 'cn/news/']).split('\n').filter(Boolean);
        } catch { ndrift = ['（基线不在历史中）']; }
      }
      if (ndrift.length) {
        newsSkipped = '库里的新闻已被开发改过（' + ndrift.length + ' 个提交），本次保留 main 的版本';
        log('⚠ ' + newsSkipped);
      } else if (DRY) {
        // ⚠️ 生成脚本**没有 dry-run 模式，它总是写盘**（`--check` 是个空参数）。
        //    所以这里“生成完再还原”，保证干跑不留痕 —— 干跑就该是只读的。
        const NEWS = ['news.html', 'cn/news.html', 'news/', 'cn/news/'];
        const before = changedPaths(NEWS);
        N.regenerate(REPO);
        newsChanged.push(...changedPaths(NEWS));
        sh(['checkout', '--', 'news.html', 'cn/news.html', 'news/', 'cn/news/']);
        log(`[dry-run] 新闻：会有 ${newsChanged.length} 个文件改动（已还原，未留痕）`
          + (before.split('\n').filter(Boolean).length ? '；注意生成前仓库里本就有改动' : ''));
      } else {
        N.regenerate(REPO);
        newsChanged.push(...changedPaths(['news.html', 'cn/news.html', 'news/', 'cn/news/']));
      }
    }
  }

  log(`新闻再生成：${newsChanged.length} 个文件改动${newsChanged.length ? ' → ' + newsChanged.slice(0, 4).join(', ') : ''}`
    + (newsSkipped ? '（已跳过）' : ''));

  const managed = db.all('SELECT id, slug FROM pages ORDER BY slug');
  const changed = [];
  const skipped = [];
  for (const p of managed) {
    const f = path.join(REPO, p.slug + '.html');
    if (!fs.existsSync(f)) { skipped.push(`${p.slug}（仓库里没有该文件）`); continue; }

    // 单独判断这一页有没有漂移：漂移的就不动它，保留 main 的版本
    let pd = [];
    const pb = db.get('SELECT base_sha FROM pages WHERE id = ?', [p.id]).base_sha;
    if (pb && pb !== mainSha) {
      try {
        pd = sh(['log', '--oneline', `${pb}..origin/main`, '--', p.slug + '.html']).split('\n').filter(Boolean);
      } catch { pd = ['（基线不在历史中）']; }
    }
    if (pd.length) { skipped.push(`${p.slug}（库里积木已过期，保留了 main 的版本）`); continue; }

    const html = renderPage(p.id);
    gateDeterministic(p.id, html);
    const cur = fs.readFileSync(f, 'utf8');
    if (cur === html) continue;
    if (DRY) { log(`[dry-run] ${p.slug} 有改动（${html.length} 字节）`); changed.push(p.slug + '.html'); continue; }
    fs.writeFileSync(f, html.replace(/\r\n/g, '\n'), 'utf8');
    gateLF(f);
    gateRefs(f);
    changed.push(p.slug + '.html');
  }

  if (!changed.length && !newsChanged.length) {
    // ⚠️ 没有待审改动时**不能直接返回** —— 若 creator 上还残留着早先的提交
    //    （例如那批改动后来被撤销了），分支就会一直挂着过期的内容，
    //    开 PR 会把这些过期改动再次带进 main。
    //    所以这里把分支**收敛回 main**，维持不变量：creator = main + 待审改动。
    if (hasRemoteBranch) {
      const stale = sh(['rev-list', '--count', `${mainSha}..origin/${BRANCH}`]);
      if (Number(stale) > 0) {
        log(`待审分支上有 ${stale} 个已无对应改动的提交，收敛回 main`);
        if (!DRY) {
          sh(['checkout', '--quiet', '-B', BRANCH, 'origin/main']);
          try {
            sh(['push', '--quiet', '--force', PUSH_URL, `${mainSha}:refs/heads/${BRANCH}`]);
            log('待审分支已回到 main 的状态');
          } catch (e) {
            log('收敛失败（不影响本次）：' + String(e.stderr || e.message).slice(0, 120));
          }
        }
        return { status: 'done', note: `内容与线上一致，已把待审分支 ${BRANCH} 收敛回 main（清掉 ${stale} 个过期提交）` };
      }
    }
    return { status: 'done', note: '内容与线上一致，无需发布（未产生提交）' };
  }
  log(`待提交 ${changed.length} 个页面：${changed.join(', ')}`);
  if (skipped.length) log(`跳过 ${skipped.length} 个：${skipped.join('；')}`);

  if (DRY) return { status: 'done', note: 'dry-run 通过（未提交未推送）' };

  // ── ④ 闸门（范围必须是已纳管的页面）──
  const allowed = [...changed, ...newsChanged];
  const scope = gateScope(allowed);
  if (!scope.files.length) return { status: 'done', note: '内容与线上一致，无需发布（未产生提交）' };
  log('✓ 闸门：行尾 / 引用完整性 / 渲染确定性 / 变更范围 全部通过');

  // ── ⑤ 提交 ──
  const msg = `content(pages): 后台发布 ${changed.length} 个页面${newsChanged.length ? ` + ${newsChanged.length} 个新闻页` : ''}\n\n`
    + `来源：/admin/pages 页面内容编辑器（起草人 admin_id=${task.author_id || '-'}）\n`
    + `渲染：server/src/lib/render-page.js（与画布预览同一套代码）\n`
    + `闸门：行尾 LF / 引用完整性 / 渲染确定性 / 变更范围 全部通过\n\n`
    + (changed.length ? `改动页面：\n` + changed.map(f => `  - ${f}`).join('\n') + '\n' : '')
    + (newsChanged.length ? `改动新闻页：\n` + newsChanged.map(f => `  - ${f}`).join('\n') + '\n' : '')
    + (skipped.length ? `\n因积木过期而跳过（保留了 main 的版本）：\n` + skipped.map(s => `  - ${s}`).join('\n') + '\n' : '')
    + `\n本提交由发布服务自动生成，位于待审分支 ${BRANCH}，需评审合并后才会上线。\n`;

  sh(['-c', `user.name=${BOT_NAME}`, '-c', `user.email=${BOT_EMAIL}`, 'commit', '--quiet', '-m', msg]);
  const sha = sh(['rev-parse', 'HEAD']);
  log(`已提交 ${sha.slice(0, 8)}`);

  // ── ⑥ 推送（重建过，所以是 force；前面已确认无他人提交）──
  try {
    sh(['push', '--quiet', '--force', PUSH_URL, `${sha}:refs/heads/${BRANCH}`]);
    log(`已推送到待审分支 ${BRANCH}`);
  } catch (e) {
    const out = String(e.stderr || e.stdout || e.message);
    if (/read only|permission|denied/i.test(out)) {
      throw Object.assign(new Error(
        '推送被拒：发布密钥**没有写权限**。\n'
        + '  请把 /root/.ssh/creator_publish.pub 加到 GitHub 仓库的 Deploy keys\n'
        + '  （Settings → Deploy keys → Add deploy key → **勾选 Allow write access**）。'),
        { pushDenied: true });
    }
    throw new Error('推送失败：' + out.slice(0, 300));
  }

  // ── ⑦ 回写基线（**关键**：不回写的话，下次发布会把这次自己的提交
  //        误判成"他人改动"，导致每个页面只能成功发布一次）──
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  db.tx(() => {
    for (const f of changed) {
      const slug = f.replace(/\.html$/, '');
      db.run('UPDATE pages SET base_sha = ?, published = 1, updated_at = ? WHERE slug = ?',
        [sha, now, slug]);
    }
  });
  if (newsChanged.length) {
    db.run(`INSERT INTO settings (key, value) VALUES ('news.base_sha', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [sha]);
  }
  log('已回写基线 base_sha=' + sha.slice(0, 8));

  return {
    status: 'done',
    note: `已推送到待审分支 ${BRANCH}（${sha.slice(0, 8)}，${changed.length} 个页面）\n`
      + `下一步：在 GitHub 上开 Pull Request（main ← ${BRANCH}）并评审合并。\n`
      + '合并进 main 后，现有 auto-deploy 会在 2 分钟内自动上线。',
  };
}

/* ───────────────  入口  ─────────────── */

if (process.argv.includes('--list')) {
  for (const q of db.all('SELECT * FROM publish_queue ORDER BY id DESC LIMIT 20')) {
    console.log(`  #${q.id} ${q.status.padEnd(8)} ${q.branch}  ${q.created_at}`);
  }
  process.exit(0);
}

// 认领必须**原子**：定时器与手工触发可能同时进来，两条都读到同一条待办就会重复发布。
let claimed = null;
db.tx(() => {
  const t = db.get("SELECT * FROM publish_queue WHERE status = 'pending' ORDER BY id LIMIT 1");
  if (t) { db.run("UPDATE publish_queue SET status = 'running' WHERE id = ?", [t.id]); claimed = t; }
});
if (!claimed) { console.log('  队列为空，无待办'); process.exit(0); }

try {
  const r = processOne(claimed);
  setQueue(claimed.id, r.status, r.note || '');
  if (r.status === 'done' && r.note && /Pull Request/.test(r.note)) {
    console.log('\n  ' + r.note.split('\n').join('\n  '));
  }
} catch (e) {
  const st = e.conflict ? 'conflict' : 'failed';
  setQueue(claimed.id, st, e.message);
  console.error('\n  ✗ ' + e.message.split('\n').join('\n    '));
  process.exit(1);
}
