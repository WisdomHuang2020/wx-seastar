'use strict';
/**
 * 新闻数据访问 + 页面再生成。
 *
 * ⚠️ 为什么「生成」和「同步抽屉」必须绑在一起执行：
 *    实测发现 `build-news.py` **本身不产「移动端抽屉」**，
 *    项目的既定流程是「生成 → 再跑 `sync-drawer.py` 同步抽屉」。
 *    只跑前者、忘了后者，**58 个页面的手机菜单会全坏，而且不报错**
 *    —— 正是 v0.21.5 修过的"60 个死按钮"。
 *    所以此处把两步封成一个函数，不给"忘记"的机会。
 */
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const db = require('./db');

/** 新闻表的字段（列表与详情共用的那批） */
const FIELDS = ['src_id', 'slug', 'date', 'title', 'title_zh', 'summary', 'summary_zh',
  'paras', 'paras_zh', 'images', 'thumb', 'cover', 'nchar', 'published', 'sort_order'];

function parseArr(s) {
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** 把一行转成前端友好的形状（JSON 字段解开、附带中英段落是否对齐） */
function shape(r) {
  if (!r) return null;
  const paras = parseArr(r.paras);
  const paras_zh = parseArr(r.paras_zh);
  return {
    ...r,
    paras, paras_zh,
    images: parseArr(r.images),
    // 前端据此提示"中英段落数不一致"——生成器按 paras[i] ↔ paras_zh[i] 渲染，
    // 不对齐会让中英错位，而页面上看不出来
    aligned: paras.length === paras_zh.length,
  };
}

function list({ q, published, limit = 100, offset = 0 } = {}) {
  const where = [], params = [];
  if (q) { where.push('(title LIKE ? OR title_zh LIKE ? OR slug LIKE ?)'); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (published !== undefined) { where.push('published = ?'); params.push(published ? 1 : 0); }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const total = db.scalar(`SELECT COUNT(*) FROM news ${w}`, params);
  const rows = db.all(
    `SELECT * FROM news ${w} ORDER BY sort_order ASC, date DESC, id ASC LIMIT ? OFFSET ?`,
    [...params, limit, offset]);
  return { total, rows: rows.map(shape) };
}

function get(id) { return shape(db.get('SELECT * FROM news WHERE id = ?', [id])); }

/** 仅供 worker / 生成器使用：按渲染顺序取出**全部已发布**的新闻 */
function ordered() {
  return db.all(
    "SELECT * FROM news WHERE published = 1 ORDER BY sort_order ASC, date DESC, id ASC");
}

function save(id, data) {
  const cols = FIELDS.filter(f => data[f] !== undefined);
  if (!cols.length) return get(id);
  const vals = cols.map(f => {
    const v = data[f];
    if (f === 'paras' || f === 'paras_zh' || f === 'images') {
      return JSON.stringify(Array.isArray(v) ? v : parseArr(v));
    }
    if (f === 'published') return v ? 1 : 0;
    return v === '' ? null : v;
  });
  db.run(`UPDATE news SET ${cols.map(f => f + ' = ?').join(', ')},
            updated_at = datetime('now','localtime') WHERE id = ?`, [...vals, id]);
  return get(id);
}

function create(data) {
  const r = db.run(
    `INSERT INTO news (src_id, slug, date, title, title_zh, summary, summary_zh,
       paras, paras_zh, images, thumb, cover, nchar, published, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [data.src_id || null, data.slug, data.date || new Date().toISOString().slice(0, 10),
     data.title || '', data.title_zh || null, data.summary || null, data.summary_zh || null,
     JSON.stringify(data.paras || []), JSON.stringify(data.paras_zh || []),
     JSON.stringify(data.images || []), data.thumb || null, data.cover || null,
     data.nchar || null, data.published === false ? 0 : 1, data.sort_order || 0]);
  return get(r.lastInsertRowid);
}

function remove(id) {
  const r = db.get('SELECT slug FROM news WHERE id = ?', [id]);
  db.run('DELETE FROM news WHERE id = ?', [id]);
  return r;
}

/**
 * 重新生成全部新闻页面。
 *
 * ⚠️ 两步**必须一起跑**，理由见文件头。这里封装成一个函数就是为了不让调用方漏掉。
 * @returns {string} 生成脚本的输出（便于写进发布日志）
 */
function regenerate(repoDir, dbPath) {
  const env = { ...process.env, WX_DB: dbPath || process.env.WX_DB || '/var/lib/wx-seastar/data.db' };
  const a = execFileSync('python3', [path.join(repoDir, 'deploy', 'build-news.py')],
    { cwd: repoDir, encoding: 'utf8', env, timeout: 300000 });
  const b = execFileSync('python3', [path.join(repoDir, 'deploy', 'sync-drawer.py'), '--apply'],
    { cwd: repoDir, encoding: 'utf8', env, timeout: 300000 });
  return (a + b).trim();
}

/** 页面的同步抽屉也走同一个脚本（栏目页重新生成后同样需要，否则手机菜单会缺） */
function syncDrawer(repoDir) {
  return execFileSync('python3', [path.join(repoDir, 'deploy', 'sync-drawer.py'), '--apply'],
    { cwd: repoDir, encoding: 'utf8', timeout: 300000 });
}

module.exports = { FIELDS, parseArr, shape, list, get, ordered, save, create, remove, regenerate, syncDrawer };
