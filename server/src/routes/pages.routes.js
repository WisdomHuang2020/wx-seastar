'use strict';
/**
 * 页面编辑器 API —— 页面模版与静态文案的可视化编辑。
 * （原挂在 /Creator 下，v0.25.0 起并入 /admin 的子页 /admin/pages，API 前缀改 /api/pages）
 *
 * ── 为什么编辑产物存数据库而不是文件 ───────────────────────────────────
 *   deploy/auto-deploy.sh 每次运行都会 `git reset --hard origin/main`，
 *   并把仓库白名单文件**覆盖**到 /var/www/wx-seastar（定时器每 2 分钟一次）。
 *   所以 web 根目录是「仓库的镜像」——编辑器若直接改那里的 .html，
 *   改动会在 2 分钟内被静默冲掉、且不报错。
 *   故本模块**只写数据库**；把改动变成源码是 `/Creator` 的「发布」流程
 *   （写 publish_queue，由特权服务提交到分支，不直推 main）。
 *
 * ── 角色 ──────────────────────────────────────────────────────────────
 *   creator  可增删模块、可发布          （对应 creator_1）
 *   editor   只能改文案与图片            （对应 creator_2）
 *   owner    超管，全部权限
 *   admin    现有后台，不进 Creator
 *
 *   editor 的限制不是靠前端藏按钮，而是**在服务端校验**：
 *   提交上来的 HTML 必须与原片段**标签结构一致**，且
 *   class 属性完全相同 —— 也就是只允许改文字与图片地址。
 */
const express = require('express');
const A = require('../lib/auth');
const db = require('../lib/db');
const { wrap } = require('../lib/util');
const { patchFragment } = require('../lib/fragment');
const { renderPage } = require('../lib/render-page');

const router = express.Router();

// 谁可以用页面编辑器。
// admin 一并纳入 —— 用户决定把内容管理统一收进 /admin，不再单开 Creator 后台，
// 所以现有的 admin 账号本来就该能改页面内容，不该因为角色名不是 creator 而被挡。
const R_FULL = ['creator', 'owner', 'admin'];   // 可增删模块、可发布
const R_ANY = ['creator', 'editor', 'owner', 'admin'];  // 含只能改文案图片的 editor

router.use(A.requireAuth, A.requirePasswordChanged, A.requireRole(...R_ANY));

/* ─────────────────────────  编辑守卫  ───────────────────────── */

/** 取标签结构骨架（只看标签名与顺序，不看属性） */
function tagSkeleton(html) {
  const out = [];
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g;
  let m;
  while ((m = re.exec(html))) {
    out.push((m[1] ? '/' : '') + m[2].toLowerCase() + (m[3] ? '/' : ''));
  }
  return out.join(',');
}

/** 取所有 class 属性（含顺序），用于判断「有没有动样式」 */
function classList(html) {
  const out = [];
  const re = /\sclass\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) out.push(m[1].trim());
  return out.join('|');
}

/**
 * editor（只能改文案图片）的提交是否合法。
 *
 * 判据：标签结构必须完全一致 + class 必须完全一致。
 * 通过 = 只改了文字节点或 src/alt/href 之类的内容属性。
 */
function isContentOnlyEdit(oldHtml, newHtml) {
  if (tagSkeleton(oldHtml) !== tagSkeleton(newHtml)) {
    return { ok: false, reason: '检测到标签结构变化 —— 你的账号只能修改文字与图片' };
  }
  if (classList(oldHtml) !== classList(newHtml)) {
    return { ok: false, reason: '检测到样式类变化 —— 你的账号只能修改文字与图片' };
  }
  return { ok: true };
}

/* ─────────────────────────  页面  ───────────────────────── */

/** 列出可编辑页面（含模块数） */
router.get('/', wrap(async (req, res) => {
  const rows = db.all(`
    SELECT p.id, p.slug, p.lang, p.title, p.published, p.updated_at,
           (SELECT COUNT(*) FROM page_blocks b WHERE b.page_id = p.id) AS blocks
      FROM pages p
     ORDER BY p.lang, p.slug`);
  res.json({ ok: true, data: rows });
}));

/** 取一页的全部模块 */
/** 发布队列（给前端看进度） */
router.get('/publish-queue', wrap(async (req, res) => {
  res.json({ ok: true, data: db.all('SELECT * FROM publish_queue ORDER BY id DESC LIMIT 30') });
}));

router.get('/:slug', wrap(async (req, res) => {
  const page = db.get('SELECT * FROM pages WHERE slug = ?', [req.params.slug]);
  if (!page) return res.status(404).json({ ok: false, error: '页面不存在' });
  const blocks = db.all(
    'SELECT * FROM page_blocks WHERE page_id = ? ORDER BY sort_order, id', [page.id]);
  res.json({
    ok: true,
    data: {
      page,
      blocks,
      // 前端据此决定显示哪些按钮；**真正的拦截在服务端**
      caps: {
        role: req.admin.role || 'admin',
        canEditContent: true,
        canEditStructure: R_FULL.includes(req.admin.role || 'admin'),
        canPublish: R_FULL.includes(req.admin.role || 'admin'),
      },
    },
  });
}));

/* ─────────────────────────  模块  ───────────────────────── */

/** 改一个模块（内容 / 可见性 / 样式档位） */
router.put('/blocks/:id', wrap(async (req, res) => {
  const b = db.get('SELECT * FROM page_blocks WHERE id = ?', [req.params.id]);
  if (!b) return res.status(404).json({ ok: false, error: '模块不存在' });
  if (b.locked) return res.status(403).json({ ok: false, error: '该模块为全局组件，不可在 Creator 中编辑' });

  const isFull = R_FULL.includes(req.admin.role || 'admin');
  const { content, visible, style } = req.body || {};

  if (typeof content === 'string') {
    if (!isFull) {
      const v = isContentOnlyEdit(b.content, content);
      if (!v.ok) return res.status(403).json({ ok: false, error: v.reason, code: 'CONTENT_ONLY' });
    }
    // ⚠️ 不建议整段替换：浏览器序列化会规范化标记（自闭合、实体、引号），
    //    整段存回等于每次保存都把该段重排版，Stage 1 好不容易验出来的
    //    「拼回去逐字节一致」当场作废。故此处**只把真正变了的文字/图片打补丁回原文**。
    const p = patchFragment(b.content, content);
    if (!p.ok) {
      return res.status(400).json({
        ok: false, code: 'PATCH_REJECTED',
        error: '内容变动方式不被支持：' + p.reason + '。Creator 只允许修改文字与图片，不改页面结构。',
      });
    }
    db.run('UPDATE page_blocks SET content = ?, updated_at = datetime(\'now\',\'localtime\') WHERE id = ?',
      [p.html, b.id]);
    A.audit(req, 'update', 'page_blocks:' + b.id,
      'content · ' + b.kind + ' · 补丁 ' + p.changes.length + ' 处');
  }

  if (visible !== undefined) {
    if (!isFull) return res.status(403).json({ ok: false, error: '你的账号不能隐藏/显示模块', code: 'ROLE_DENIED' });
    db.run('UPDATE page_blocks SET visible = ? WHERE id = ?', [visible ? 1 : 0, b.id]);
    A.audit(req, 'update', 'page_blocks:' + b.id, 'visible=' + (visible ? 1 : 0));
  }

  if (style !== undefined) {
    if (!isFull) return res.status(403).json({ ok: false, error: '你的账号不能修改布局', code: 'ROLE_DENIED' });
    db.run('UPDATE page_blocks SET style = ? WHERE id = ?', [JSON.stringify(style), b.id]);
    A.audit(req, 'update', 'page_blocks:' + b.id, 'style · ' + JSON.stringify(style).slice(0, 120));
  }

  res.json({ ok: true, data: db.get('SELECT * FROM page_blocks WHERE id = ?', [b.id]) });
}));

/** 排序（拖动） */
router.post('/blocks/:id/move', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const b = db.get('SELECT * FROM page_blocks WHERE id = ?', [req.params.id]);
  if (!b) return res.status(404).json({ ok: false, error: '模块不存在' });
  if (b.locked) return res.status(403).json({ ok: false, error: '全局组件不可移动' });

  const to = Number(req.body?.to);
  if (!Number.isInteger(to) || to < 0) return res.status(400).json({ ok: false, error: 'to 参数不合法' });

  const list = db.all(
    'SELECT id FROM page_blocks WHERE page_id = ? AND locked = 0 ORDER BY sort_order, id', [b.page_id]);
  const ids = list.map(x => x.id).filter(id => id !== b.id);
  ids.splice(Math.min(to, ids.length), 0, b.id);

  db.tx(() => {
    // 全局组件（导航/页脚）保持原位，故只重排未锁定的那批
    ids.forEach((id, i) => db.run('UPDATE page_blocks SET sort_order = ? WHERE id = ?', [i + 1, id]));
  });
  A.audit(req, 'update', 'page_blocks:' + b.id, '移动到第 ' + (to + 1) + ' 位');
  res.json({ ok: true });
}));

/** 复制一个模块（「增加模块」的 v1：同类型复制后自行改内容） */
router.post('/blocks/:id/duplicate', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const b = db.get('SELECT * FROM page_blocks WHERE id = ?', [req.params.id]);
  if (!b) return res.status(404).json({ ok: false, error: '模块不存在' });
  if (b.locked) return res.status(403).json({ ok: false, error: '全局组件不可复制' });

  const r = db.run(
    `INSERT INTO page_blocks (page_id, sort_order, kind, tag, attrs, comment, content, visible, locked, style)
     VALUES (?,?,?,?,?,?,?,1,0,?)`,
    [b.page_id, b.sort_order + 0.5, b.kind, b.tag, b.attrs, b.comment, b.content, b.style]);
  // 重排成整数序号
  const ids = db.all('SELECT id FROM page_blocks WHERE page_id = ? AND locked = 0 ORDER BY sort_order, id', [b.page_id]);
  db.tx(() => ids.forEach((x, i) => db.run('UPDATE page_blocks SET sort_order = ? WHERE id = ?', [i + 1, x.id])));
  A.audit(req, 'create', 'page_blocks:' + r.lastInsertRowid, '复制自 ' + b.id + ' · ' + b.kind);
  res.json({ ok: true, data: db.get('SELECT * FROM page_blocks WHERE id = ?', [r.lastInsertRowid]) });
}));

/** 删除一个模块 */
router.delete('/blocks/:id', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const b = db.get('SELECT * FROM page_blocks WHERE id = ?', [req.params.id]);
  if (!b) return res.status(404).json({ ok: false, error: '模块不存在' });
  if (b.locked) return res.status(403).json({ ok: false, error: '全局组件不可删除' });
  db.run('DELETE FROM page_blocks WHERE id = ?', [b.id]);
  A.audit(req, 'delete', 'page_blocks:' + b.id, b.kind + ' · ' + (b.comment || ''));
  res.json({ ok: true });
}));

/* ─────────────────────────  版本与发布  ───────────────────────── */

/** 存一个版本快照（发布前自动调用） */
router.post('/:id/snapshot', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const page = db.get('SELECT * FROM pages WHERE id = ?', [req.params.id]);
  if (!page) return res.status(404).json({ ok: false, error: '页面不存在' });
  const blocks = db.all('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY sort_order, id', [page.id]);
  const r = db.run('INSERT INTO page_revisions (page_id, snapshot, author_id, note) VALUES (?,?,?,?)',
    [page.id, JSON.stringify(blocks), req.admin.admin_id, String(req.body?.note || '').slice(0, 200)]);
  A.audit(req, 'create', 'page_revisions:' + r.lastInsertRowid, page.slug);
  res.json({ ok: true, data: { id: r.lastInsertRowid } });
}));

/**
 * 发布 —— **只入队，不推仓库**。
 *
 * 真正的 git 操作由独立特权服务（持有仅限本仓库的 Deploy Key）执行，
 * 目的在于：Web 进程**不持有仓库写权限**，站点被攻破也拿不到 GitHub 写权限。
 */
router.post('/:id/publish', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const page = db.get('SELECT * FROM pages WHERE id = ?', [req.params.id]);
  if (!page) return res.status(404).json({ ok: false, error: '页面不存在' });

  const base = String(req.body?.base_sha || '').trim();
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  const branch = 'creator/' + page.slug.replace(/\//g, '-') + '-' + ts;

  // 发布前自动留一个版本快照
  const blocks = db.all('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY sort_order, id', [page.id]);
  db.run('INSERT INTO page_revisions (page_id, snapshot, author_id, note) VALUES (?,?,?,?)',
    [page.id, JSON.stringify(blocks), req.admin.admin_id, '发布前自动快照']);

  const r = db.run(
    `INSERT INTO publish_queue (page_id, branch, base_sha, author_id) VALUES (?,?,?,?)`,
    [page.id, branch, base || null, req.admin.admin_id]);
  A.audit(req, 'create', 'publish_queue:' + r.lastInsertRowid, page.slug + ' → ' + branch);

  res.json({
    ok: true,
    data: {
      queue_id: r.lastInsertRowid, branch,
      message: '已入队。真正的 git 提交由特权服务执行，提交到分支后需经评审合并才会上线。',
    },
  });
}));

/**
 * 预览 —— 用**当前草稿**渲染整页，供编辑器画布内嵌。
 *
 * 刻意与 build-pages.js 共用同一个 renderPage，**不允许各写一份**：
 * 画布看到的必须与将来生成出来的完全一致，否则编辑等于盲改。
 *
 * 页内相对路径靠注入 <base href="/"> 解决（见下方），
 * 这样 DOM 里的 src 仍是原文的相对写法，回写时不会凭空产生「改图」差异。
 */
router.get('/:slug/preview', wrap(async (req, res) => {
  const page = db.get('SELECT * FROM pages WHERE slug = ?', [req.params.slug]);
  if (!page) return res.status(404).send('页面不存在');
  let html;
  try { html = renderPage(page.id); } catch (e) { return res.status(500).send('渲染失败：' + e.message); }
  // 注入 <base> —— 让页面里的相对路径（assets/…、../assets/…）在 /Creator/ 下也能解析
  html = html.replace(/<head([^>]*)>/i, '<head$1>\n<base href="/">');
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  res.send(html);
}));

/** 版本快照列表（回滚在 Stage 4） */
router.get('/:id/revisions', wrap(async (req, res) => {
  const rows = db.all(
    `SELECT id, note, author_id, created_at, length(snapshot) AS bytes
       FROM page_revisions WHERE page_id = ? ORDER BY id DESC LIMIT 40`, [req.params.id]);
  res.json({ ok: true, data: rows });
}));


module.exports = { router, isContentOnlyEdit };
