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
 * ── 铁律 ──────────────────────────────────────────────────────────────
 *   ① **绝不推 main** —— 只推 creator/<slug>-<时间戳>，由人评审合并
 *   ② **基线校验** —— 目标文件在 base_sha..origin/main 之间被改过，
 *      说明库里的积木已过期（开发者改了页面），此时**拒绝发布**并报冲突，
 *      绝不闷头覆盖别人的提交
 *   ③ **发布前必过闸门** —— 行尾 / 引用完整性 / 渲染确定性 / 变更范围
 *   ④ **变更范围只准是目标页面** —— 多改一个文件就中止（防止误伤全站）
 *
 * 用法：
 *   node src/tools/publish-worker.js --once            # 处理一条待办
 *   node src/tools/publish-worker.js --once --dry-run  # 走完全流程但不提交/不推送
 *   node src/tools/publish-worker.js --list            # 只看队列
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const db = require('../lib/db');
const { renderPage } = require('../lib/render-page');

db.migrate();

const REPO = process.env.WX_REPO_DIR || '/opt/wx-seastar/repo';
/** 推送用**有写权限**的别名；仓库里的 origin 是只读别名，不能用来推 */
const PUSH_URL = process.env.WX_PUSH_URL
  || 'git@github-wxseastar-publish:WisdomHuang2020/wx-seastar.git';
const BRANCH_PREFIX = 'creator/';

const DRY = process.argv.includes('--dry-run');

function sh(args, opts = {}) {
  return execFileSync('git', ['-C', REPO, ...args], {
    encoding: 'utf8', timeout: 120000, ...opts,
  }).trim();
}

function log(msg) { console.log('  ' + msg); }

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
    if (/^(https?:|mailto:|tel:|#|javascript:|\/\/)/.test(u)) continue;
    refs.add(u.split('#')[0].split('?')[0]);
  }
  const dir = path.dirname(file);
  const bad = [];
  for (const r of refs) {
    if (!r) continue;
    const p = r.startsWith('/') ? path.join(REPO, r.slice(1)) : path.resolve(dir, r);
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
 * ④ 变更范围只准是目标页面
 *
 * ⚠️ 不能看 `git status --porcelain` —— 部署副本里**随时可能有与本次无关的
 *    未跟踪文件**（运维手工放的脚本、上一次部署的残留等），
 *    那样每个发布都会被自己的闸门挡死。所以先 add 再看**暂存区差异**，
 *    这样只关心"这次到底要提交什么"。
 */
function gateScope(pageFile) {
  sh(['add', '--', pageFile]);
  const staged = sh(['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  const extra = staged.filter(f => f !== pageFile);
  if (extra.length) {
    sh(['reset', '--quiet']);
    throw new Error('闸门/越界：本次暂存了不该提交的文件 ' + extra.slice(0, 5).join(', '));
  }
  // 「没有变化」不是错误 —— 内容与线上一致本来就无需发布，返回信号让上层记 done
  if (!staged.length) return { empty: true };
  return { empty: false };
}

/* ───────────────  主流程  ─────────────── */

function processOne(task) {
  const id = task.id;
  const page = db.get('SELECT * FROM pages WHERE id = ?', [task.page_id]);
  if (!page) throw new Error('页面不存在（page_id=' + task.page_id + '）');

  const relFile = page.slug + '.html';
  const absFile = path.join(REPO, relFile);
  log(`任务 #${id} · ${page.slug} · 分支 ${task.branch}`);

  if (!fs.existsSync(REPO)) throw new Error('找不到仓库目录 ' + REPO);
  if (!fs.existsSync(absFile)) throw new Error('仓库里找不到目标文件 ' + relFile);

  // ── 取最新 main ──
  sh(['fetch', '--quiet', 'origin', 'main']);
  const mainSha = sh(['rev-parse', 'origin/main']);
  log(`origin/main = ${mainSha.slice(0, 8)}`);

  // ── 基线校验：目标文件在 base_sha 之后被改过吗 ──
  const base = page.base_sha || task.base_sha;
  if (!base) {
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

  // ── 建分支 ──
  const branch = task.branch || (BRANCH_PREFIX + page.slug.replace(/\//g, '-') + '-' + Date.now());
  if (!DRY) {
    sh(['checkout', '--quiet', '-B', branch, 'origin/main']);
  }
  log(`分支 ${branch}（基于 origin/main，**不推 main**）`);

  // ── 渲染并写文件 ──
  const html = renderPage(page.id);
  gateDeterministic(page.id, html);
  if (DRY) {
    log(`[dry-run] 渲染 ${html.length} 字节，未写盘`);
  } else {
    fs.writeFileSync(absFile, html.replace(/\r\n/g, '\n'), 'utf8');
  }

  // ── 闸门 ──
  if (!DRY) {
    gateLF(absFile);
    gateRefs(absFile);
    const scope = gateScope(relFile);
    if (scope.empty) {
      return { status: 'done', note: '内容与线上一致，无需发布（未产生提交）' };
    }
    log('✓ 闸门：行尾 / 引用完整性 / 渲染确定性 / 变更范围 全部通过');
  }

  // ── 提交 ──
  const msg = `content(${page.slug}): 由 Creator 发布\n\n`
    + `来源：/Creator 设计者模式（起草人 admin_id=${task.author_id || '-'}）\n`
    + `渲染：server/src/lib/render-page.js（与画布预览同一套代码）\n`
    + `闸门：行尾 LF / 引用完整性 / 渲染确定性 / 变更范围 全部通过\n\n`
    + `本提交由发布服务自动生成，位于分支 ${branch}，需评审合并后才会上线。\n`
    + (task.base_sha ? `基线：${task.base_sha}\n` : '');

  if (DRY) {
    log('[dry-run] 将要提交：' + msg.split('\n')[0]);
    return { status: 'done', note: 'dry-run 通过（未提交未推送）' };
  }

  // 文件已在 gateScope 里 add 过（那一步顺带做了范围校验）
  sh(['-c', 'user.name=wx-seastar-publish', '-c', 'user.email=publish@wx-seastar.local',
      'commit', '--quiet', '-m', msg]);

  const sha = sh(['rev-parse', 'HEAD']);
  log(`已提交 ${sha.slice(0, 8)}`);

  // ── 推送（推到专用别名，不是 origin）──
  try {
    sh(['push', '--quiet', PUSH_URL, `${sha}:refs/heads/${branch}`]);
    log('已推送分支 ' + branch);
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

  return {
    status: 'done',
    note: `分支 ${branch} 已推送（${sha.slice(0, 8)}）\n`
      + '下一步：在 GitHub 上开 Pull Request 并评审合并。合并进 main 后，'
      + '现有 auto-deploy 会在 2 分钟内自动上线。',
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
