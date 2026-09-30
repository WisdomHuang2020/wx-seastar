'use strict';
/** 图片媒体库：上传 / 列表 / 更新说明 / 删除 */
const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const A = require('../lib/auth');
const U = require('../lib/upload');
const { ok, fail, wrap, paging } = require('../lib/util');

const router = express.Router();
router.use(A.requireAuth, A.requirePasswordChanged);

/** 读取图片真实尺寸（PNG/JPEG/WebP/GIF 头部解析，不引图像库） */
function imageSize(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(64 * 1024);
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    const b = buf.subarray(0, n);

    // PNG: \x89PNG\r\n\x1a\n + IHDR
    if (b[0] === 0x89 && b.toString('ascii', 1, 4) === 'PNG') {
      return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    }
    // GIF
    if (b.toString('ascii', 0, 3) === 'GIF') {
      return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
    }
    // WebP（VP8X / VP8L / VP8 ）
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
      const fmt = b.toString('ascii', 12, 16);
      if (fmt === 'VP8X') {
        const w = 1 + (b[24] | (b[25] << 8) | (b[26] << 16));
        const h = 1 + (b[27] | (b[28] << 8) | (b[29] << 16));
        return { width: w, height: h };
      }
      if (fmt === 'VP8 ') {
        return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
      }
      if (fmt === 'VP8L') {
        const bits = b.readUInt32LE(21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
    }
    // JPEG：扫描 SOFn 段
    if (b[0] === 0xff && b[1] === 0xd8) {
      let off = 2;
      while (off + 9 < b.length) {
        if (b[off] !== 0xff) { off++; continue; }
        const marker = b[off + 1];
        const len = b.readUInt16BE(off + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: b.readUInt16BE(off + 5), width: b.readUInt16BE(off + 7) };
        }
        off += 2 + len;
      }
    }
  } catch { /* 解析失败不影响上传 */ }
  return { width: null, height: null };
}

/** POST /api/media —— 上传一张图片（multipart，字段名 file） */
router.post('/', wrap(async (req, res) => {
  const file = await U.runUpload(U.uploadImage)(req, res);
  if (!file) return fail(res, 400, '没有收到文件');

  const { width, height } = imageSize(file.path);
  const r = db.run(
    `INSERT INTO media (filename, original_name, mime, size, width, height, alt_zh, alt_en)
     VALUES (?,?,?,?,?,?,?,?)`,
    [file.filename, file.originalname, file.mimetype, file.size, width, height,
     req.body?.alt_zh || null, req.body?.alt_en || null]
  );
  A.audit(req, 'upload', `media:${r.lastInsertRowid}`, file.originalname);

  const row = db.get('SELECT * FROM media WHERE id = ?', [r.lastInsertRowid]);
  return ok(res, { ...row, url: U.urlOf(file.path) });
}));

/** GET /api/media —— 媒体库列表 */
router.get('/', wrap(async (req, res) => {
  const { q, unused } = req.query;
  const { page, size, offset } = paging(req.query, 60);
  const where = [];
  const params = [];
  if (q) { where.push('(original_name LIKE ? OR filename LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  if (unused === '1') {
    where.push(`id NOT IN (SELECT media_id FROM product_media)
                AND id NOT IN (SELECT cover_media FROM products WHERE cover_media IS NOT NULL)`);
  }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.scalar(`SELECT COUNT(*) FROM media ${clause}`, params) || 0;
  const rows = db.all(`SELECT * FROM media ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]);
  return ok(res, rows.map(r => ({ ...r, url: `/uploads/img/${r.filename}` })), { total, page, size });
}));

/** PATCH /api/media/:id —— 更新替代文字（alt，影响 SEO 与无障碍） */
router.patch('/:id', wrap(async (req, res) => {
  const m = db.get('SELECT * FROM media WHERE id = ?', [req.params.id]);
  if (!m) return fail(res, 404, '图片不存在');
  db.run('UPDATE media SET alt_zh = ?, alt_en = ? WHERE id = ?', [
    req.body?.alt_zh ?? m.alt_zh, req.body?.alt_en ?? m.alt_en, m.id,
  ]);
  A.audit(req, 'update', `media:${m.id}`, '更新替代文字');
  return ok(res, db.get('SELECT * FROM media WHERE id = ?', [m.id]));
}));

/** DELETE /api/media/:id?force=1 —— 默认拒绝删除仍被引用的图片 */
router.delete('/:id', wrap(async (req, res) => {
  const m = db.get('SELECT * FROM media WHERE id = ?', [req.params.id]);
  if (!m) return fail(res, 404, '图片不存在');

  const usedByCover = db.all('SELECT id, title_zh FROM products WHERE cover_media = ?', [m.id]);
  const usedInGallery = db.all(
    `SELECT p.id, p.title_zh FROM product_media pm JOIN products p ON p.id = pm.product_id
      WHERE pm.media_id = ?`, [m.id]);

  if ((usedByCover.length || usedInGallery.length) && req.query.force !== '1') {
    const names = [...usedByCover, ...usedInGallery].map(x => x.title_zh);
    return fail(res, 409,
      `该图片正被 ${names.length} 个产品引用（${[...new Set(names)].slice(0, 3).join('、')}${names.length > 3 ? ' 等' : ''}），请先解除引用，或确认后强制删除`,
      'IN_USE');
  }

  db.tx(() => {
    db.run('UPDATE products SET cover_media = NULL WHERE cover_media = ?', [m.id]);
    db.run('DELETE FROM product_media WHERE media_id = ?', [m.id]);
    db.run('DELETE FROM media WHERE id = ?', [m.id]);
  });
  U.removeUpload(path.join(U.IMG_DIR, m.filename));
  A.audit(req, 'delete', `media:${m.id}`, m.original_name);
  return ok(res);
}));

module.exports = router;
