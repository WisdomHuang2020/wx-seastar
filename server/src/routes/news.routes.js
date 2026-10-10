'use strict';
/**
 * 新闻管理 API（/api/news）。
 *
 * 页面生成不在请求里做 —— 与栏目页一样：**编辑只写数据库，发布才动文件**。
 * 这里只暴露「描述改了什么」和「入队」，真正的 git 操作交给发布服务。
 */
const express = require('express');
const A = require('../lib/auth');
const db = require('../lib/db');
const N = require('../lib/news');
const { wrap } = require('../lib/util');

const router = express.Router();
const R_ANY = ['creator', 'editor', 'owner', 'admin'];   // 与栏目页编辑器一致（admin 已并入）
const R_FULL = ['creator', 'owner', 'admin'];

router.use(A.requireAuth, A.requirePasswordChanged, A.requireRole(...R_ANY));

/** 列表（带搜索与分页） */
router.get('/', wrap(async (req, res) => {
  const limit = Math.min(Number(req.query.size) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const published = req.query.published === undefined ? undefined
    : (req.query.published === '1' || req.query.published === 'true');
  res.json({ ok: true, data: N.list({ q: req.query.q, published, limit, offset }) });
}));

/** 给后台列表页用的「有哪些地方还没对齐」体检 */
router.get('/health', wrap(async (req, res) => {
  const rows = N.ordered();
  const issues = [];
  for (const r of rows) {
    const p = N.parseArr(r.paras), pz = N.parseArr(r.paras_zh);
    if (!r.title_zh) issues.push({ id: r.id, slug: r.slug, kind: '缺中文标题' });
    if (pz.length && p.length !== pz.length) {
      issues.push({ id: r.id, slug: r.slug, kind: `中英段落数不一致（中 ${pz.length} / 英 ${p.length}）` });
    }
    if (!r.thumb) issues.push({ id: r.id, slug: r.slug, kind: '缺列表缩略图（列表卡片会没有图）' });
    if (!p.length && !N.parseArr(r.images).length) issues.push({ id: r.id, slug: r.slug, kind: '既无正文也无配图' });
  }
  const total = db.scalar('SELECT COUNT(*) FROM news');
  res.json({ ok: true, data: { total, published: rows.length, issues } });
}));

router.get('/:id', wrap(async (req, res) => {
  const r = N.get(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: '新闻不存在' });
  res.json({ ok: true, data: r });
}));

/** 新建（新增一篇新闻） */
router.post('/', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const d = req.body || {};
  if (!d.slug || !d.title) return res.status(400).json({ ok: false, error: 'slug 与 title 必填' });
  if (!/^[a-z0-9-]+$/.test(d.slug)) {
    return res.status(400).json({ ok: false, error: 'slug 只能用小写字母、数字与连字符（它会成为网址）' });
  }
  if (db.get('SELECT id FROM news WHERE slug = ?', [d.slug])) {
    return res.status(409).json({ ok: false, error: '这个 slug 已经被占用了，换一个' });
  }
  const r = N.create(d);
  A.audit(req, 'create', 'news:' + r.id, r.slug);
  res.json({ ok: true, data: r });
}));

/** 改一篇 */
router.put('/:id', wrap(async (req, res) => {
  const before = N.get(req.params.id);
  if (!before) return res.status(404).json({ ok: false, error: '新闻不存在' });
  const d = req.body || {};

  // 中英段落数不一致会让生成器渲染错位（页面上看不出来），能救就救、救不了就拦
  if (d.paras && d.paras_zh && d.paras.length && d.paras_zh.length
      && d.paras.length !== d.paras_zh.length) {
    return res.status(400).json({
      ok: false, code: 'PARA_MISMATCH',
      error: `中英段落数不一致（英 ${d.paras.length} / 中 ${d.paras_zh.length}）。`
        + '生成器按段落一一对应渲染，不一致会让中英错位 —— 请改成一样多。',
    });
  }
  if (d.slug && d.slug !== before.slug) {
    if (!/^[a-z0-9-]+$/.test(d.slug)) {
      return res.status(400).json({ ok: false, error: 'slug 只能用小写字母、数字与连字符' });
    }
    if (db.get('SELECT id FROM news WHERE slug = ? AND id <> ?', [d.slug, before.id])) {
      return res.status(409).json({ ok: false, error: '这个 slug 已经被占用了' });
    }
  }
  const r = N.save(before.id, d);
  A.audit(req, 'update', 'news:' + before.id, `${before.slug} · 字段 ${Object.keys(d).join(',')}`);
  res.json({ ok: true, data: r });
}));

router.delete('/:id', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const r = N.remove(req.params.id);
  if (!r) return res.status(404).json({ ok: false, error: '新闻不存在' });
  A.audit(req, 'delete', 'news:' + req.params.id, r.slug);
  res.json({ ok: true });
}));

/**
 * 发布新闻改动 —— **只入队**，真正的 git 操作由发布服务执行。
 * kind='news' 的任务会让发布服务重新生成 58 个新闻页面（含列表页）并同步抽屉。
 */
router.post('/publish', A.requireRole(...R_FULL), wrap(async (req, res) => {
  const branch = req.body && req.body.branch;
  const r = db.run(
    `INSERT INTO publish_queue (page_id, kind, branch, base_sha, author_id) VALUES (0, 'news', ?, ?, ?)`,
    [branch || 'creator', req.body && req.body.base_sha || null, req.admin.admin_id]);
  A.audit(req, 'create', 'publish_queue:' + r.lastInsertRowid, 'news → ' + (branch || 'creator'));
  res.json({
    ok: true,
    data: {
      queue_id: r.lastInsertRowid,
      message: '已入队。真正的 git 提交由发布服务执行，提交到待审分支后需评审合并才会上线。',
    },
  });
}));

module.exports = { router };
