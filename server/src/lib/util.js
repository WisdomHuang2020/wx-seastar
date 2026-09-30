'use strict';
/** 通用小工具：响应包装、异步路由、字段清洗、分页 */
const crypto = require('node:crypto');

/** 统一成功响应 */
function ok(res, data = null, extra = {}) {
  return res.json({ ok: true, data, ...extra });
}

/** 统一失败响应 */
function fail(res, status, error, code) {
  return res.status(status).json({ ok: false, error, ...(code ? { code } : {}) });
}

/**
 * 包裹 async 路由，让抛出的异常流向 Express 错误中间件。
 * 否则 Express 4 不会自动捕获 async 函数里的 rejection。
 */
function wrap(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** 生成 URL 友好的 slug（支持中文转拼音式降级：保留字母数字，中文丢弃） */
function slugify(input, fallback = 'item') {
  const s = String(input || '')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-')
    .replace(/[\u4e00-\u9fa5]/g, '')   // 中文不适合进 URL，交由调用方补英文
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return s || fallback;
}

/** 生成不冲突的 slug（同前缀自动加 -2 -3 …） */
function uniqueSlug(base, existsFn, fallback = 'item') {
  let s = slugify(base, fallback);
  if (!existsFn(s)) return s;
  for (let i = 2; i < 500; i++) {
    const t = `${s}-${i}`;
    if (!existsFn(t)) return t;
  }
  return `${s}-${crypto.randomBytes(3).toString('hex')}`;
}

/** 安全文件名：只保留扩展名，主体用随机串，避免路径穿越与中文编码问题 */
function safeFilename(originalName) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(String(originalName || ''));
  const ext = m ? m[1].toLowerCase() : 'bin';
  return `${Date.now().toString(36)}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
}

/** 人类可读文件大小 */
function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/** 解析分页参数，带上限保护 */
function paging(query, defaultSize = 20, maxSize = 200) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const size = Math.min(maxSize, Math.max(1, parseInt(query.size, 10) || defaultSize));
  return { page, size, offset: (page - 1) * size };
}

/** 安全 JSON.parse（坏数据不炸服务） */
function parseJson(str, fallback) {
  if (str === null || str === undefined || str === '') return fallback;
  if (typeof str === 'object') return str;
  try { return JSON.parse(str); } catch { return fallback; }
}

/** 截断字符串（用于日志/备注） */
function truncate(s, n = 200) {
  const t = String(s ?? '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}

/** 纯文本转义（写进 HTML 属性/文本时用） */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** CSV 单元格转义（Excel 兼容：双引号内的双引号翻倍；前置 =+-@ 防公式注入） */
function csvCell(v) {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;          // 防 CSV 公式注入
  return '"' + s.replace(/"/g, '""') + '"';
}

function toCsv(rows, columns) {
  const head = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(r => columns.map(c => csvCell(c.get(r))).join(',')).join('\r\n');
  // BOM 让 Excel 正确识别 UTF-8 中文
  return '\uFEFF' + head + '\r\n' + body + '\r\n';
}

module.exports = {
  ok, fail, wrap, slugify, uniqueSlug, safeFilename, humanSize,
  paging, parseJson, truncate, esc, csvCell, toCsv,
};
