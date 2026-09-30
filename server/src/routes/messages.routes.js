'use strict';
/** 客户留言：列表 / 详情 / 状态与备注 / 批量操作 / CSV 导出 */
const express = require('express');
const db = require('../lib/db');
const A = require('../lib/auth');
const { ok, fail, wrap, paging, toCsv } = require('../lib/util');

const router = express.Router();
router.use(A.requireAuth, A.requirePasswordChanged);

const STATUS = ['new', 'read', 'replied', 'archived', 'spam'];
const STATUS_LABEL = {
  new: '未读', read: '已读', replied: '已回复', archived: '已归档', spam: '垃圾',
};

/** GET /api/messages */
router.get('/', wrap(async (req, res) => {
  const { status, q, from, to } = req.query;
  const { page, size, offset } = paging(req.query, 30);

  const where = [];
  const params = [];
  if (status && STATUS.includes(status)) { where.push('status = ?'); params.push(status); }
  if (q) {
    where.push('(name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ? OR content LIKE ?)');
    const like = `%${q}%`; params.push(like, like, like, like, like);
  }
  if (from) { where.push('created_at >= ?'); params.push(from + ' 00:00:00'); }
  if (to)   { where.push('created_at <= ?'); params.push(to + ' 23:59:59'); }

  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.scalar(`SELECT COUNT(*) FROM messages ${clause}`, params) || 0;
  const rows = db.all(
    `SELECT * FROM messages ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    [...params, size, offset]
  );

  // 各状态计数，供左侧筛选显示角标
  const counts = {};
  for (const s of STATUS) counts[s] = db.scalar('SELECT COUNT(*) FROM messages WHERE status = ?', [s]) || 0;

  return ok(res, rows.map(r => ({ ...r, status_label: STATUS_LABEL[r.status] || r.status })),
    { total, page, size, counts, statuses: STATUS_LABEL });
}));

/** GET /api/messages/:id —— 顺带标记为已读 */
router.get('/:id', wrap(async (req, res) => {
  const m = db.get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!m) return fail(res, 404, '留言不存在');
  if (m.status === 'new') db.run("UPDATE messages SET status = 'read' WHERE id = ?", [m.id]);
  return ok(res, { ...m, status_label: STATUS_LABEL[m.status] || m.status });
}));

/** PATCH /api/messages/:id —— 改状态 / 写内部备注 */
router.patch('/:id', wrap(async (req, res) => {
  const m = db.get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!m) return fail(res, 404, '留言不存在');
  const b = req.body || {};
  const status = STATUS.includes(b.status) ? b.status : m.status;
  db.run('UPDATE messages SET status = ?, note = ? WHERE id = ?',
    [status, b.note !== undefined ? (b.note || null) : m.note, m.id]);
  A.audit(req, 'update', `messages:${m.id}`, `状态 ${m.status} → ${status}`);
  return ok(res, db.get('SELECT * FROM messages WHERE id = ?', [m.id]));
}));

/** POST /api/messages/batch —— 批量改状态（勾选多条一起处理） */
router.post('/batch', wrap(async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Boolean) : [];
  const status = req.body?.status;
  if (!ids.length) return fail(res, 400, '请先勾选要处理的留言');
  if (!STATUS.includes(status)) return fail(res, 400, '状态值不合法');

  const ph = ids.map(() => '?').join(',');
  const r = db.run(`UPDATE messages SET status = ? WHERE id IN (${ph})`, [status, ...ids]);
  A.audit(req, 'update', `messages:batch`, `${r.changes} 条 → ${status}`);
  return ok(res, { changed: r.changes });
}));

/** DELETE /api/messages/:id */
router.delete('/:id', wrap(async (req, res) => {
  const m = db.get('SELECT * FROM messages WHERE id = ?', [req.params.id]);
  if (!m) return fail(res, 404, '留言不存在');
  db.run('DELETE FROM messages WHERE id = ?', [m.id]);
  A.audit(req, 'delete', `messages:${m.id}`, m.email || m.name);
  return ok(res);
}));

/**
 * GET /api/messages/export.csv —— 导出 CSV
 * 支持与列表相同的筛选条件；带 BOM 以便 Excel 正确识别中文。
 */
router.get('/export.csv', wrap(async (req, res) => {
  const { status, q, from, to } = req.query;
  const where = [];
  const params = [];
  if (status && STATUS.includes(status)) { where.push('status = ?'); params.push(status); }
  if (q) {
    where.push('(name LIKE ? OR company LIKE ? OR email LIKE ? OR phone LIKE ? OR content LIKE ?)');
    const like = `%${q}%`; params.push(like, like, like, like, like);
  }
  if (from) { where.push('created_at >= ?'); params.push(from + ' 00:00:00'); }
  if (to)   { where.push('created_at <= ?'); params.push(to + ' 23:59:59'); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = db.all(`SELECT * FROM messages ${clause} ORDER BY created_at DESC`, params);

  const csv = toCsv(rows, [
    { label: '编号',     get: r => r.id },
    { label: '提交时间', get: r => r.created_at },
    { label: '状态',     get: r => STATUS_LABEL[r.status] || r.status },
    { label: '姓名',     get: r => r.name },
    { label: '公司',     get: r => r.company },
    { label: '邮箱',     get: r => r.email },
    { label: '电话',     get: r => r.phone },
    { label: '需求描述', get: r => r.content },
    { label: '内部备注', get: r => r.note },
    { label: '来源IP',   get: r => r.ip },
    { label: '来源页',   get: r => r.referer },
  ]);

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition',
    `attachment; filename="wx-seastar-messages-${stamp}.csv"; filename*=UTF-8''${encodeURIComponent(`客户留言-${stamp}.csv`)}`);
  A.audit(req, 'export', 'messages', `${rows.length} 条`);
  return res.send(csv);
}));

module.exports = { router, STATUS, STATUS_LABEL };
