'use strict';
/** 产品管理：列表 / 详情 / 新建 / 更新 / 软删除 / 排序 */
const express = require('express');
const db = require('../lib/db');
const A = require('../lib/auth');
const { ok, fail, wrap, uniqueSlug, parseJson, paging } = require('../lib/util');

const router = express.Router();
router.use(A.requireAuth, A.requirePasswordChanged);

/** 把数据库行转成前端友好的形状（JSON 字段解码 + 补 URL） */
function shape(row) {
  if (!row) return null;
  return {
    ...row,
    published: !!row.published,
    specs: parseJson(row.specs, []),
    badges: parseJson(row.badges, []),
    cover_url: row.cover_filename ? `/uploads/img/${row.cover_filename}` : null,
  };
}

const SELECT_BASE = `
  SELECT p.*, m.filename AS cover_filename
    FROM products p
    LEFT JOIN media m ON m.id = p.cover_media`;

/** GET /api/products —— 支持 ?q= 搜索、?category= 过滤、分页 */
router.get('/', wrap(async (req, res) => {
  const { q, category, published } = req.query;
  const { page, size, offset } = paging(req.query, 50);

  const where = [];
  const params = [];
  if (q) {
    where.push('(p.title_zh LIKE ? OR p.title_en LIKE ? OR p.series LIKE ? OR p.slug LIKE ?)');
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (category) { where.push('p.category = ?'); params.push(category); }
  if (published === '0') where.push('p.published = 0');
  if (published === '1') where.push('p.published = 1');

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.scalar(`SELECT COUNT(*) FROM products p ${clause}`, params) || 0;
  const rows = db.all(
    `${SELECT_BASE} ${clause} ORDER BY p.sort_order ASC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );

  return ok(res, rows.map(shape), { total, page, size });
}));

/** GET /api/products/:id */
router.get('/:id', wrap(async (req, res) => {
  const row = db.get(`${SELECT_BASE} WHERE p.id = ?`, [req.params.id]);
  if (!row) return fail(res, 404, '产品不存在');

  const images = db.all(
    `SELECT m.id, m.filename, m.alt_zh, m.alt_en, m.width, m.height, pm.sort_order
       FROM product_media pm JOIN media m ON m.id = pm.media_id
      WHERE pm.product_id = ? ORDER BY pm.sort_order, m.id`,
    [row.id]
  );
  const docs = db.all(
    `SELECT * FROM documents WHERE product_id = ? ORDER BY sort_order, id`,
    [row.id]
  );

  return ok(res, {
    ...shape(row),
    images: images.map(i => ({ ...i, url: `/uploads/img/${i.filename}` })),
    documents: docs,
  });
}));

/** 校验并规范化提交上来的产品字段 */
function normalize(body, existing) {
  const title_zh = String(body.title_zh ?? existing?.title_zh ?? '').trim();
  if (!title_zh) throw Object.assign(new Error('产品中文名称为必填项'), { status: 400 });

  const specs = Array.isArray(body.specs)
    ? body.specs.filter(s => s && String(s.k || '').trim())
        .map(s => ({ k: String(s.k).trim(), v: String(s.v ?? '').trim(), u: String(s.u ?? '').trim() }))
    : parseJson(body.specs, null) ?? parseJson(existing?.specs, []);

  const badges = Array.isArray(body.badges)
    ? body.badges.filter(b => b && String(b.text || '').trim())
        .map(b => ({ text: String(b.text).trim(), type: String(b.type || 'brand').trim() }))
    : parseJson(body.badges, null) ?? parseJson(existing?.badges, []);

  return {
    slug: String(body.slug ?? existing?.slug ?? '').trim(),
    category: String(body.category ?? existing?.category ?? '').trim() || null,
    series: String(body.series ?? existing?.series ?? '').trim() || null,
    title_zh,
    title_en: String(body.title_en ?? existing?.title_en ?? '').trim() || null,
    summary_zh: String(body.summary_zh ?? existing?.summary_zh ?? '').trim() || null,
    summary_en: String(body.summary_en ?? existing?.summary_en ?? '').trim() || null,
    body_zh: String(body.body_zh ?? existing?.body_zh ?? '') || null,
    body_en: String(body.body_en ?? existing?.body_en ?? '') || null,
    specs: JSON.stringify(specs),
    badges: JSON.stringify(badges),
    cover_media: body.cover_media !== undefined
      ? (body.cover_media ? Number(body.cover_media) : null)
      : (existing?.cover_media ?? null),
    sort_order: Number(body.sort_order ?? existing?.sort_order ?? 0) || 0,
    published: body.published === undefined
      ? (existing ? existing.published : 1)
      : (body.published ? 1 : 0),
  };
}

/** POST /api/products */
router.post('/', wrap(async (req, res) => {
  let data;
  try { data = normalize(req.body || {}); }
  catch (e) { return fail(res, e.status || 400, e.message); }

  if (!data.slug) {
    data.slug = uniqueSlug(data.title_en || data.series || data.title_zh,
                           s => !!db.get('SELECT 1 FROM products WHERE slug = ?', [s]), 'product');
  } else if (db.get('SELECT 1 FROM products WHERE slug = ?', [data.slug])) {
    return fail(res, 409, `标识「${data.slug}」已被占用，请换一个`);
  }

  // 未指定排序时排到现有产品末尾 —— 否则默认值 0 会抢走首页前三位
  if (req.body?.sort_order === undefined || String(req.body.sort_order).trim() === '') {
    const max = db.scalar('SELECT COALESCE(MAX(sort_order), 0) FROM products') || 0;
    data.sort_order = max + 10;
  }

  const cols = Object.keys(data);
  const r = db.run(
    `INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`,
    cols.map(k => data[k])
  );
  A.audit(req, 'create', `products:${r.lastInsertRowid}`, data.title_zh);
  const row = db.get(`${SELECT_BASE} WHERE p.id = ?`, [r.lastInsertRowid]);
  return ok(res, shape(row));
}));

/** PATCH /api/products/:id */
router.patch('/:id', wrap(async (req, res) => {
  const existing = db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!existing) return fail(res, 404, '产品不存在');

  let data;
  try { data = normalize(req.body || {}, existing); }
  catch (e) { return fail(res, e.status || 400, e.message); }

  if (data.slug !== existing.slug) {
    if (!data.slug) data.slug = existing.slug;
    if (db.get('SELECT 1 FROM products WHERE slug = ? AND id <> ?', [data.slug, existing.id])) {
      return fail(res, 409, `标识「${data.slug}」已被占用`);
    }
  }

  const cols = Object.keys(data);
  db.run(
    `UPDATE products SET ${cols.map(c => `${c} = ?`).join(', ')},
       updated_at = datetime('now','localtime') WHERE id = ?`,
    [...cols.map(k => data[k]), existing.id]
  );
  A.audit(req, 'update', `products:${existing.id}`, data.title_zh);
  return ok(res, shape(db.get(`${SELECT_BASE} WHERE p.id = ?`, [existing.id])));
}));

/**
 * DELETE /api/products/:id?hard=1
 * 默认**软删除**（published=0），避免误删；带 hard=1 才真删（同时清理关联图库与资料关联）
 */
router.delete('/:id', wrap(async (req, res) => {
  const p = db.get('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (!p) return fail(res, 404, '产品不存在');

  if (req.query.hard === '1') {
    db.tx(() => {
      db.run('DELETE FROM product_media WHERE product_id = ?', [p.id]);
      // 资料文件的磁盘文件保留，只解除关联（避免误删客户资料原件）
      db.run('UPDATE documents SET product_id = NULL WHERE product_id = ?', [p.id]);
      db.run('DELETE FROM products WHERE id = ?', [p.id]);
    });
    A.audit(req, 'delete', `products:${p.id}`, `硬删除 ${p.title_zh}`);
    return ok(res, { hard: true });
  }

  db.run("UPDATE products SET published = 0, updated_at = datetime('now','localtime') WHERE id = ?", [p.id]);
  A.audit(req, 'delete', `products:${p.id}`, `下架 ${p.title_zh}`);
  return ok(res, { hard: false });
}));

/** POST /api/products/:id/images —— 把已有媒体挂到产品图库 */
router.post('/:id/images', wrap(async (req, res) => {
  const p = db.get('SELECT id FROM products WHERE id = ?', [req.params.id]);
  if (!p) return fail(res, 404, '产品不存在');
  const mediaId = Number(req.body?.media_id);
  if (!mediaId) return fail(res, 400, '缺少 media_id');
  if (!db.get('SELECT 1 FROM media WHERE id = ?', [mediaId])) return fail(res, 404, '图片不存在');

  const max = db.scalar('SELECT COALESCE(MAX(sort_order),-1) FROM product_media WHERE product_id = ?', [p.id]);
  db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,?)',
    [p.id, mediaId, (max ?? -1) + 1]);
  A.audit(req, 'update', `products:${p.id}`, `添加图库 media:${mediaId}`);
  return ok(res);
}));

/** DELETE /api/products/:id/images/:mediaId —— 从产品图库移除（不动媒体本身） */
router.delete('/:id/images/:mediaId', wrap(async (req, res) => {
  db.run('DELETE FROM product_media WHERE product_id = ? AND media_id = ?',
    [req.params.id, req.params.mediaId]);
  A.audit(req, 'update', `products:${req.params.id}`, `移除图库 media:${req.params.mediaId}`);
  return ok(res);
}));

module.exports = { router, shape };
