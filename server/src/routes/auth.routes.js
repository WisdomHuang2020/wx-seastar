'use strict';
/** 认证路由：登录 / 登出 / 改密 / 当前用户 */
const express = require('express');
const db = require('../lib/db');
const A = require('../lib/auth');
const { ok, fail, wrap } = require('../lib/util');

const router = express.Router();

// 简单的登录失败节流（内存计数，防暴力破解；重启即清零，够用且零依赖）
const attempts = new Map();
const MAX_FAIL = 8;
const LOCK_MS = 10 * 60 * 1000;

function keyOf(req) {
  return A.clientIp(req) || 'unknown';
}
function isLocked(req) {
  const rec = attempts.get(keyOf(req));
  if (!rec) return false;
  if (Date.now() - rec.at > LOCK_MS) { attempts.delete(keyOf(req)); return false; }
  return rec.count >= MAX_FAIL;
}
function noteFail(req) {
  const k = keyOf(req);
  const rec = attempts.get(k);
  if (rec && Date.now() - rec.at <= LOCK_MS) rec.count += 1;
  else attempts.set(k, { count: 1, at: Date.now() });
}
function clearFail(req) { attempts.delete(keyOf(req)); }

/** POST /api/auth/login */
router.post('/login', wrap(async (req, res) => {
  if (isLocked(req)) {
    return fail(res, 429, '登录失败次数过多，请 10 分钟后再试');
  }
  const { username, password } = req.body || {};
  if (!username || !password) return fail(res, 400, '请输入用户名和密码');

  const admin = db.get('SELECT * FROM admins WHERE username = ?', [String(username).trim()]);
  // 无论用户是否存在都做一次哈希运算，避免通过响应时间枚举用户名
  const valid = admin
    ? A.verifyPassword(String(password), admin.password_hash)
    : A.verifyPassword(String(password), A.hashPassword('__dummy__'));

  if (!admin || !valid) {
    noteFail(req);
    return fail(res, 401, '用户名或密码不正确');
  }

  clearFail(req);
  const token = A.createSession(admin.id, A.clientIp(req), req.headers['user-agent']);
  A.setSessionCookie(res, token);

  db.run(
    "UPDATE admins SET last_login_at = datetime('now','localtime'), last_login_ip = ? WHERE id = ?",
    [A.clientIp(req), admin.id]
  );
  db.run('INSERT INTO audit_log (admin_id, action, detail, ip) VALUES (?,?,?,?)',
    [admin.id, 'login', admin.username, A.clientIp(req)]);

  return ok(res, {
    username: admin.username,
    display_name: admin.display_name,
    must_change: !!admin.must_change,
  });
}));

/** POST /api/auth/logout */
router.post('/logout', wrap(async (req, res) => {
  const token = req.cookies?.[require('../config').cookieName];
  if (token) {
    const s = A.getSession(token);
    if (s) db.run('INSERT INTO audit_log (admin_id, action, ip) VALUES (?,?,?)', [s.admin_id, 'logout', A.clientIp(req)]);
    A.destroySession(token);
  }
  A.clearSessionCookie(res);
  return ok(res);
}));

/** GET /api/auth/me —— 前端用它判断是否已登录 */
router.get('/me', wrap(async (req, res) => {
  const s = A.getSession(req.cookies?.[require('../config').cookieName]);
  if (!s) return fail(res, 401, '未登录');
  return ok(res, {
    username: s.username,
    display_name: s.display_name,
    must_change: !!s.must_change,
  });
}));

/** POST /api/auth/password —— 修改密码（首次登录也走这里） */
router.post('/password', A.requireAuth, wrap(async (req, res) => {
  const { current, next } = req.body || {};
  if (!current || !next) return fail(res, 400, '请填写当前密码与新密码');
  if (String(next).length < 10) return fail(res, 400, '新密码至少 10 位');
  if (String(next) === String(current)) return fail(res, 400, '新密码不能与当前密码相同');

  const admin = db.get('SELECT * FROM admins WHERE id = ?', [req.admin.admin_id]);
  if (!admin || !A.verifyPassword(String(current), admin.password_hash)) {
    return fail(res, 401, '当前密码不正确');
  }

  db.run(
    'UPDATE admins SET password_hash = ?, must_change = 0 WHERE id = ?',
    [A.hashPassword(String(next)), admin.id]
  );
  // 改密后把该账号的所有会话踢掉（含当前），强制重新登录 —— 这是安全惯例
  A.destroyAdminSessions(admin.id);
  A.clearSessionCookie(res);
  A.audit(req, 'update', `admins:${admin.id}`, '修改密码');
  return ok(res, { relogin: true });
}));

module.exports = router;
