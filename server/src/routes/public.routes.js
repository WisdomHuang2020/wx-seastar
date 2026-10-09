'use strict';
/**
 * 前台公开接口（无需登录）—— 供静态站点用 fetch 读取内容。
 *
 * 安全与防滥用：
 *   · 只暴露 published = 1 的产品
 *   · 留言提交：同 IP 限流 + 蜜罐字段 + 必填校验 + 长度上限
 *   · 下载：通过后端转发，才能计数并还原原始文件名
 */
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const A = require('../lib/auth');
const cfg = require('../config');
const { ok, fail, wrap, parseJson, paging } = require('../lib/util');
const { KINDS } = require('./documents.routes');

const router = express.Router();

// ── 产品 ────────────────────────────────────────────────────────────────
router.get('/products', wrap(async (req, res) => {
  const { category, category_prefix, q } = req.query;
  const { page, size, offset } = paging(req.query, 100, 500);

  const where = ['p.published = 1'];
  const params = [];
  if (category) { where.push('p.category = ?'); params.push(category); }
  // 前缀匹配：满足 "Commercial" 能涵盖 "Commercial / Downlight" 这类多级分类
  if (category_prefix) { where.push('p.category LIKE ?'); params.push(category_prefix + '%'); }
  if (q) {
    where.push('(p.title_zh LIKE ? OR p.title_en LIKE ? OR p.series LIKE ?)');
    const like = `%${q}%`; params.push(like, like, like);
  }
  const clause = 'WHERE ' + where.join(' AND ');

  const total = db.scalar(`SELECT COUNT(*) FROM products p ${clause}`, params) || 0;
  // ⚠️ 子查询取「该产品第一份规格书」的 id，供前台产品卡直接给下载入口。
  //    不在返回里塞完整文档列表 —— 列表页一次最多 500 条，带全量文档会显著放大响应体。
  const rows = db.all(
    `SELECT p.id, p.slug, p.category, p.series, p.scene,
            p.title_zh, p.title_en, p.summary_zh, p.summary_en,
            p.specs, p.badges, p.sort_order, p.updated_at,
            m.filename AS cover_filename, m.alt_zh AS cover_alt_zh,
            (SELECT d.id FROM documents d
              WHERE d.product_id = p.id AND d.kind = 'spec'
              ORDER BY d.sort_order, d.id LIMIT 1) AS spec_doc_id,
            (SELECT COUNT(*) FROM documents d WHERE d.product_id = p.id) AS doc_count
       FROM products p LEFT JOIN media m ON m.id = p.cover_media
       ${clause} ORDER BY p.sort_order, p.id LIMIT ? OFFSET ?`,
    [...params, size, offset]);

  return ok(res, rows.map(r => ({
    id: r.id, slug: r.slug, category: r.category, series: r.series,
    scene: parseJson(r.scene, []),
    title: { zh: r.title_zh, en: r.title_en },
    summary: { zh: r.summary_zh, en: r.summary_en },
    specs: parseJson(r.specs, []),
    badges: parseJson(r.badges, []),
    cover: r.cover_filename
      ? { url: `/uploads/img/${r.cover_filename}`, alt: r.cover_alt_zh || r.title_zh }
      : null,
    // 前端据此在产品卡上直接给「规格书下载」入口；无规格书时为 null
    spec_doc_id: r.spec_doc_id || null,
    doc_count: r.doc_count || 0,
    updated_at: r.updated_at,
  })), { total, page, size });
}));

router.get('/products/:slug', wrap(async (req, res) => {
  const p = db.get(
    `SELECT p.*, m.filename AS cover_filename, m.alt_zh AS cover_alt_zh
       FROM products p LEFT JOIN media m ON m.id = p.cover_media
      WHERE p.slug = ? AND p.published = 1`, [req.params.slug]);
  if (!p) return fail(res, 404, '产品不存在');

  const images = db.all(
    `SELECT m.filename, m.alt_zh, m.alt_en, pm.sort_order
       FROM product_media pm JOIN media m ON m.id = pm.media_id
      WHERE pm.product_id = ? ORDER BY pm.sort_order, m.id`, [p.id]);

  const docs = db.all(
    `SELECT id, kind, lang, title_zh, title_en, original_name, size
       FROM documents WHERE product_id = ? ORDER BY sort_order, id`, [p.id]);

  return ok(res, {
    id: p.id, slug: p.slug, category: p.category, series: p.series,
    scene: parseJson(p.scene, []),
    title: { zh: p.title_zh, en: p.title_en },
    summary: { zh: p.summary_zh, en: p.summary_en },
    body: { zh: p.body_zh, en: p.body_en },
    specs: parseJson(p.specs, []),
    badges: parseJson(p.badges, []),
    cover: p.cover_filename
      ? { url: `/uploads/img/${p.cover_filename}`, alt: p.cover_alt_zh || p.title_zh } : null,
    images: images.map(i => ({
      url: `/uploads/img/${i.filename}`,
      alt: i.alt_zh || i.alt_en || p.title_zh,
    })),
    documents: docs.map(d => ({
      id: d.id, kind: d.kind, kind_label: KINDS[d.kind] || d.kind, lang: d.lang,
      title: d.title_zh || d.title_en || d.original_name,
      filename: d.original_name, size: d.size, url: `/api/public/download/${d.id}`,
    })),
    updated_at: p.updated_at,
  });
}));

// ── 资料中心 ────────────────────────────────────────────────────────────
router.get('/documents', wrap(async (req, res) => {
  const { kind, lang, q, product_id } = req.query;
  const { page, size, offset } = paging(req.query, 200, 500);

  const where = ['(p.id IS NULL OR p.published = 1)'];
  const params = [];
  if (kind) { where.push('d.kind = ?'); params.push(kind); }
  if (lang) { where.push('d.lang = ?'); params.push(lang); }
  if (product_id) { where.push('d.product_id = ?'); params.push(product_id); }
  if (q) {
    where.push('(d.original_name LIKE ? OR d.title_zh LIKE ? OR d.title_en LIKE ? OR p.title_zh LIKE ?)');
    const like = `%${q}%`; params.push(like, like, like, like);
  }
  const clause = 'WHERE ' + where.join(' AND ');

  const total = db.scalar(
    `SELECT COUNT(*) FROM documents d LEFT JOIN products p ON p.id = d.product_id ${clause}`,
    params) || 0;

  const rows = db.all(
    `SELECT d.id, d.kind, d.lang, d.title_zh, d.title_en, d.original_name,
            d.size, d.downloads, d.created_at,
            p.slug AS product_slug, p.title_zh AS product_title, p.series AS product_series
       FROM documents d LEFT JOIN products p ON p.id = d.product_id
       ${clause} ORDER BY d.kind, d.sort_order, d.id DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]);

  return ok(res, rows.map(d => ({
    id: d.id, kind: d.kind, kind_label: KINDS[d.kind] || d.kind, lang: d.lang,
    title: d.title_zh || d.title_en || d.original_name,
    filename: d.original_name, size: d.size, downloads: d.downloads,
    product: d.product_slug ? { slug: d.product_slug, title: d.product_title, series: d.product_series } : null,
    url: `/api/public/download/${d.id}`,
  })), { total, page, size });
}));

/** GET /api/public/download/:id —— 转发文件并计数（原始文件名通过 Content-Disposition 还原） */
router.get('/download/:id', wrap(async (req, res) => {
  const d = db.get('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  if (!d) return res.status(404).send('文件不存在');

  const abs = path.join(cfg.uploadDir, 'doc', d.filename);
  if (!fs.existsSync(abs)) return res.status(410).send('文件已从服务器移除，请联系我们重新获取');

  db.run('UPDATE documents SET downloads = downloads + 1 WHERE id = ?', [d.id]);

  res.setHeader('Content-Type', d.mime || 'application/octet-stream');
  res.setHeader('Content-Length', fs.statSync(abs).size);
  // ASCII 回退名 + RFC 5987 的 UTF-8 名，保证各浏览器都能拿到正确中文名
  const ascii = d.original_name.replace(/[^\x20-\x7e]/g, '_');
  res.setHeader('Content-Disposition',
    `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(d.original_name)}`);
  return fs.createReadStream(abs).pipe(res);
}));

// ── 留言提交 ────────────────────────────────────────────────────────────
const RECENT = new Map();          // ip → 最近提交时间戳数组
const WINDOW_MS = 10 * 60 * 1000;  // 10 分钟内
const MAX_PER_WINDOW = 5;          // 最多 5 条

router.post('/messages', wrap(async (req, res) => {
  const b = req.body || {};
  const ip = A.clientIp(req);

  // 1) 蜜罐字段：正常用户看不见、不会填；机器人会填
  if (b.website || b.url) {
    return ok(res, { accepted: true });   // 静默丢弃，不给爬虫反馈
  }

  // 2) 限流
  const now = Date.now();
  const hits = (RECENT.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (hits.length >= MAX_PER_WINDOW) {
    return fail(res, 429, '提交过于频繁，请稍后再试', 'RATE_LIMITED');
  }

  // 3) 校验
  const name = String(b.name || '').trim();
  const content = String(b.content || b.msg || '').trim();
  const email = String(b.email || '').trim();
  const phone = String(b.phone || '').trim();
  if (!name) return fail(res, 400, '请填写您的姓名');
  if (!content) return fail(res, 400, '请描述您的需求');
  if (name.length > 60 || content.length > 4000 || email.length > 160 || phone.length > 40) {
    return fail(res, 400, '内容超出长度限制');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    return fail(res, 400, '邮箱格式不正确');
  }

  hits.push(now); RECENT.set(ip, hits);

  const r = db.run(
    `INSERT INTO messages (name, company, email, phone, content, ip, ua, referer)
     VALUES (?,?,?,?,?,?,?,?)`,
    [name, String(b.company || '').trim() || null, email || null, phone || null,
     content, ip, (req.headers['user-agent'] || '').slice(0, 300),
     (req.headers.referer || '').slice(0, 300)]
  );

  return ok(res, { accepted: true, id: r.lastInsertRowid });
}));

// ── 站点设置 ────────────────────────────────────────────────────────────
router.get('/settings', wrap(async (_req, res) => {
  const rows = db.all('SELECT key, value FROM settings');
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return ok(res, out);
}));

module.exports = router;
