'use strict';
/** 产品资料文件：规格书 / 说明书 / IES / 图纸 / 其他 */
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const db = require('../lib/db');
const A = require('../lib/auth');
const U = require('../lib/upload');
const { ok, fail, wrap, paging, humanSize } = require('../lib/util');

const router = express.Router();
router.use(A.requireAuth, A.requirePasswordChanged);

/** 资料类型的中文名（前端下拉与 CSV 导出共用） */
const KINDS = {
  spec:    '规格书',
  manual:  '说明书 / 安装指南',
  ies:     'IES 光度文件',
  drawing: '图纸 / 尺寸图',
  video:   '视频',
  other:   '其他资料',
};

function shape(row) {
  return { ...row, kind_label: KINDS[row.kind] || row.kind, size_human: humanSize(row.size) };
}

/** GET /api/documents —— 可按产品 / 类型 / 语言 / 关键词筛选 */
router.get('/', wrap(async (req, res) => {
  const { product_id, kind, lang, q } = req.query;
  const { page, size, offset } = paging(req.query, 100);

  const where = [];
  const params = [];
  if (product_id === 'none') where.push('d.product_id IS NULL');
  else if (product_id) { where.push('d.product_id = ?'); params.push(product_id); }
  if (kind) { where.push('d.kind = ?'); params.push(kind); }
  if (lang) { where.push('d.lang = ?'); params.push(lang); }
  if (q) {
    where.push('(d.original_name LIKE ? OR d.title_zh LIKE ? OR d.title_en LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const total = db.scalar(`SELECT COUNT(*) FROM documents d ${clause}`, params) || 0;
  const rows = db.all(
    `SELECT d.*, p.title_zh AS product_title, p.slug AS product_slug
       FROM documents d LEFT JOIN products p ON p.id = d.product_id
       ${clause} ORDER BY d.sort_order, d.id DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );
  return ok(res, rows.map(shape), { total, page, size, kinds: KINDS });
}));

/** POST /api/documents —— 上传一个资料文件 */
router.post('/', wrap(async (req, res) => {
  const file = await U.runUpload(U.uploadDoc)(req, res);
  if (!file) return fail(res, 400, '没有收到文件');

  const kind = KINDS[req.body?.kind] ? req.body.kind : 'other';
  const lang = ['zh', 'en'].includes(req.body?.lang) ? req.body.lang : 'zh';
  const productId = req.body?.product_id ? Number(req.body.product_id) : null;
  if (productId && !db.get('SELECT 1 FROM products WHERE id = ?', [productId])) {
    U.removeUpload(file.path);
    return fail(res, 404, '指定的产品不存在');
  }

  const max = db.scalar(
    'SELECT COALESCE(MAX(sort_order),-1) FROM documents WHERE ' +
    (productId ? 'product_id = ?' : 'product_id IS NULL'),
    productId ? [productId] : []);

  const r = db.run(
    `INSERT INTO documents (product_id, kind, lang, title_zh, title_en, filename,
                            original_name, mime, size, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [productId, kind, lang,
     req.body?.title_zh || file.originalname.replace(/\.[^.]+$/, ''),
     req.body?.title_en || null,
     file.filename, file.originalname, file.mimetype, file.size, (max ?? -1) + 1]
  );
  A.audit(req, 'upload', `documents:${r.lastInsertRowid}`, `${KINDS[kind]} · ${file.originalname}`);

  return ok(res, shape(db.get('SELECT * FROM documents WHERE id = ?', [r.lastInsertRowid])));
}));

/** PATCH /api/documents/:id —— 改标题 / 类型 / 语言 / 归属产品 / 排序 */
router.patch('/:id', wrap(async (req, res) => {
  const d = db.get('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  if (!d) return fail(res, 404, '资料不存在');
  const b = req.body || {};

  let productId = d.product_id;
  if (b.product_id !== undefined) {
    productId = b.product_id ? Number(b.product_id) : null;
    if (productId && !db.get('SELECT 1 FROM products WHERE id = ?', [productId])) {
      return fail(res, 404, '指定的产品不存在');
    }
  }

  db.run(
    `UPDATE documents SET product_id = ?, kind = ?, lang = ?, title_zh = ?, title_en = ?, sort_order = ?
      WHERE id = ?`,
    [productId,
     KINDS[b.kind] ? b.kind : d.kind,
     ['zh', 'en'].includes(b.lang) ? b.lang : d.lang,
     b.title_zh !== undefined ? (b.title_zh || null) : d.title_zh,
     b.title_en !== undefined ? (b.title_en || null) : d.title_en,
     b.sort_order !== undefined ? (Number(b.sort_order) || 0) : d.sort_order,
     d.id]
  );
  A.audit(req, 'update', `documents:${d.id}`, d.original_name);
  return ok(res, shape(db.get('SELECT * FROM documents WHERE id = ?', [d.id])));
}));

/** DELETE /api/documents/:id —— 删除记录并移除磁盘文件 */
router.delete('/:id', wrap(async (req, res) => {
  const d = db.get('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  if (!d) return fail(res, 404, '资料不存在');
  db.run('DELETE FROM documents WHERE id = ?', [d.id]);
  U.removeUpload(path.join(U.DOC_DIR, d.filename));
  A.audit(req, 'delete', `documents:${d.id}`, d.original_name);
  return ok(res);
}));

/** GET /api/documents/meta/kinds —— 供前端渲染下拉 */
router.get('/meta/kinds', wrap(async (_req, res) => ok(res, KINDS)));

module.exports = { router, KINDS, shape };
