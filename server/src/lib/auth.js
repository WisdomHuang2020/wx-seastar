'use strict';
/**
 * 认证与会话 —— 只用 Node 内置 crypto，不引第三方加密库。
 *
 * 密码：scrypt（内存硬，抗 GPU 爆破）+ 每用户独立 salt，存为 `scrypt$N$r$p$salt$hash`
 * 会话：随机 32 字节 token 存库（服务重启不掉线），Cookie 为 HttpOnly + SameSite
 */
const crypto = require('node:crypto');
const cfg = require('../config');
const db = require('./db');

// scrypt 参数：N=16384 在 4 核小机上单次约 60–90ms，足以拖慢离线爆破又不至于卡登录
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// ── 密码 ────────────────────────────────────────────────────────────────
function hashPassword(plain) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(plain, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

function verifyPassword(plain, stored) {
  try {
    const [algo, N, r, p, saltB64, hashB64] = String(stored).split('$');
    if (algo !== 'scrypt') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expect = Buffer.from(hashB64, 'base64');
    const actual = crypto.scryptSync(plain, salt, expect.length, { N: +N, r: +r, p: +p });
    // 定时安全比较，避免通过响应时间推断
    return actual.length === expect.length && crypto.timingSafeEqual(actual, expect);
  } catch {
    return false;
  }
}

/** 生成一个人类可读但强度足够的初始密码（避开易混淆字符 0/O/1/l/I） */
function generatePassword(len = 14) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.randomBytes(len);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

// ── 会话 ────────────────────────────────────────────────────────────────
function createSession(adminId, ip, ua) {
  const token = crypto.randomBytes(32).toString('hex');
  db.run(
    `INSERT INTO sessions (token, admin_id, expires_at, ip, ua)
     VALUES (?, ?, datetime('now','localtime',? ), ?, ?)`,
    [token, adminId, `+${cfg.sessionDays} days`, ip || null, ua ? ua.slice(0, 300) : null]
  );
  return token;
}

function getSession(token) {
  if (!token) return null;
  return db.get(
    // ⚠️ 必须带出 a.role —— Creator 的角色鉴权依赖它。
    //    漏了会让 req.admin.role 恒为 undefined（被当成 admin），
    //    结果所有 Creator 账号都被 403 挡住。
    `SELECT s.token, s.expires_at, a.id AS admin_id, a.username, a.display_name,
            a.must_change, a.role
       FROM sessions s JOIN admins a ON a.id = s.admin_id
      WHERE s.token = ? AND s.expires_at > datetime('now','localtime')`,
    [token]
  );
}

function destroySession(token) {
  if (!token) return;
  db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

/** 某个管理员名下的所有会话（改密后强制其它设备下线用） */
function destroyAdminSessions(adminId) {
  db.run('DELETE FROM sessions WHERE admin_id = ?', [adminId]);
}

// ── 中间件 ──────────────────────────────────────────────────────────────
/** 要求已登录；未登录返回 401 JSON */
function requireAuth(req, res, next) {
  const s = getSession(req.cookies?.[cfg.cookieName]);
  if (!s) return res.status(401).json({ ok: false, error: '未登录或会话已过期' });
  req.admin = s;
  next();
}

/** 要求已改过初始密码（未改密者只允许访问改密接口） */
function requirePasswordChanged(req, res, next) {
  if (req.admin && req.admin.must_change) {
    return res.status(403).json({ ok: false, error: '请先修改初始密码', code: 'MUST_CHANGE_PASSWORD' });
  }
  next();
}

/**
 * 角色白名单 —— 必须放在 requireAuth 与 requirePasswordChanged 之后。
 *
 * 角色定义（Creator 设计者模式）：
 *   owner   超管，全部权限
 *   creator 可增删模块、可发布（对应 creator_1）
 *   editor  只能改文案与图片（对应 creator_2）—— 结构性改动由路由层拒绝
 *   admin   现有后台（产品/资料/留言），不进 Creator
 */
function requireRole(...roles) {
  const allow = new Set(roles);
  return (req, res, next) => {
    const role = req.admin?.role || 'admin';
    if (!allow.has(role)) {
      return res.status(403).json({ ok: false, error: '当前账号无权进行此操作', code: 'ROLE_DENIED' });
    }
    next();
  };
}

/** 写操作留痕 */
function audit(req, action, target, detail) {
  try {
    db.run(
      'INSERT INTO audit_log (admin_id, action, target, detail, ip) VALUES (?,?,?,?,?)',
      [req.admin?.admin_id ?? null, action, target ?? null,
       detail ? String(detail).slice(0, 500) : null, clientIp(req)]
    );
  } catch { /* 日志失败不影响主流程 */ }
}

function clientIp(req) {
  return req.headers['x-real-ip']
      || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket.remoteAddress
      || null;
}

/** 极简 Cookie 解析（避免为一个函数引入 cookie-parser 依赖） */
function cookieParser(req, res, next) {
  const raw = req.headers.cookie;
  const out = {};
  if (raw) {
    for (const part of raw.split(';')) {
      const i = part.indexOf('=');
      if (i < 0) continue;
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
    }
  }
  req.cookies = out;
  next();
}

/** 下发会话 Cookie */
function setSessionCookie(res, token) {
  const maxAge = cfg.sessionDays * 86400;
  const attrs = [
    `${cfg.cookieName}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
  ];
  if (cfg.isProd) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

function clearSessionCookie(res) {
  const attrs = [`${cfg.cookieName}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (cfg.isProd) attrs.push('Secure');
  res.append('Set-Cookie', attrs.join('; '));
}

module.exports = {
  hashPassword, verifyPassword, generatePassword,
  createSession, getSession, destroySession, destroyAdminSessions,
  requireAuth, requirePasswordChanged,
  requireRole, audit, clientIp,
  cookieParser, setSessionCookie, clearSessionCookie,
};
