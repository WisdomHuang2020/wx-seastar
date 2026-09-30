'use strict';
/**
 * 统一配置入口。
 *
 * 全部可用环境变量覆盖 —— 部署时通过 systemd 的 EnvironmentFile 注入，
 * 代码里不硬编码任何服务器路径或密钥。
 */
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

function env(key, fallback) {
  const v = process.env[key];
  return (v === undefined || v === '') ? fallback : v;
}

module.exports = {
  // 服务监听（只监听回环，由 nginx 反代对外）
  port: Number(env('PORT', 3000)),
  host: env('HOST', '127.0.0.1'),

  // 数据与文件
  dbPath: env('DB_PATH', '/var/lib/wx-seastar/data.db'),
  uploadDir: env('UPLOAD_DIR', '/var/www/wx-seastar/uploads'),
  webRoot: env('WEB_ROOT', '/var/www/wx-seastar'),

  // 会话
  sessionDays: Number(env('SESSION_DAYS', 14)),
  cookieName: env('COOKIE_NAME', 'wxs_sid'),
  // 反代后需要信任 nginx 传来的真实 IP
  trustProxy: env('TRUST_PROXY', '1') === '1',

  // 上传限制
  maxImageMB: Number(env('MAX_IMAGE_MB', 12)),
  maxDocMB: Number(env('MAX_DOC_MB', 80)),

  // 站点
  siteName: env('SITE_NAME', 'SEA☆STAR 实益达'),
  siteUrl: env('SITE_URL', 'https://www.wx-seastar.cn'),

  // 留言通知邮箱（可选：有值时用 Agent Mail 发提醒，留空则不发）
  notifyTo: env('NOTIFY_TO', ''),

  // 是否为生产（生产下开启安全 Cookie 等）
  isProd: env('NODE_ENV', 'production') === 'production',

  root: ROOT,
};
