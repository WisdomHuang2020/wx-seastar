'use strict';
/**
 * SEA☆STAR 实益达 官网 · 内容管理服务入口
 *
 * 只监听 127.0.0.1，对外由 nginx 反代（/api → 本服务）。
 * 启动即自动建表（幂等），不需要单独的部署脚本。
 */
const path = require('node:path');
const express = require('express');

const cfg = require('./config');
const db = require('./lib/db');
const A = require('./lib/auth');

// ── 初始化数据库（建表幂等，首次启动自动完成）──────────────────────────
db.migrate();
console.log(`[db] 就绪 → ${cfg.dbPath}`);

const app = express();
app.disable('x-powered-by');
if (cfg.trustProxy) app.set('trust proxy', true);

// 请求体：留言与产品提交都是小 JSON，限制 2MB 足够；文件走 multipart 单独处理
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));
app.use(A.cookieParser);

// 极简访问日志（写 stdout，由 journald 收集）
app.use((req, res, next) => {
  const t0 = Date.now();
  res.on('finish', () => {
    // 静态资源不记，避免日志噪音
    if (req.path.startsWith('/admin/') && !req.path.includes('.')) return;
    const ms = Date.now() - t0;
    console.log(`${A.clientIp(req) || '-'} ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// ── 路由 ────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/products', require('./routes/products.routes').router);
app.use('/api/media', require('./routes/media.routes'));
app.use('/api/documents', require('./routes/documents.routes').router);
app.use('/api/messages', require('./routes/messages.routes').router);
app.use('/api/public', require('./routes/public.routes'));
app.use('/api/pages', require('./routes/pages.routes').router);

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  version: require('../package.json').version,
  time: new Date().toISOString(),
  uptime: Math.round(process.uptime()),
}));

// ── 管理后台静态页面（/admin）──────────────────────────────────────────
// 后台是零构建的原生 HTML/JS，直接由本服务托管；
// 不放进公开 web 根，避免与其静态发布流程搅在一起。
app.use('/admin', express.static(path.join(__dirname, '..', 'public'), {
  extensions: ['html'],
  index: 'index.html',
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// ── 页面内容编辑器（/admin/pages）──────────────────────────────────────
// v0.25.0 起并入 /admin 命名空间：同一个登录、同一套账号、同一套样式。
// 保留为独立页而非塞进 admin 的 SPA —— 编辑器要独占整屏三栏，
// 后台的内容区尺寸装不下。之所以挂在 /admin 下由 Node 托管而不是放进公开
// web 根，是因为 auto-deploy 会 `git reset --hard` + 覆盖发布，放进去活不过 2 分钟。
// （/admin 本身已由下面那条 express.static 覆盖，无需再挂。）


// ── 兜底 ────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ ok: false, error: '接口不存在' }));

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({
    ok: false,
    error: status >= 500 ? '服务器内部错误，请稍后再试' : (err.message || '请求无效'),
  });
});

// ── 启动 ────────────────────────────────────────────────────────────────
const server = app.listen(cfg.port, cfg.host, () => {
  console.log(`[http] 监听 http://${cfg.host}:${cfg.port}  (env=${cfg.isProd ? 'production' : 'development'})`);
  console.log(`[http] 后台入口：/admin    公开接口：/api/public/*`);
});

// 定时清理过期会话（每小时）与限流表
const timer = setInterval(() => {
  try {
    const r = db.purgeExpiredSessions();
    if (r && r.changes) console.log(`[cron] 清理过期会话 ${r.changes} 条`);
  } catch (e) { console.error('[cron] 清理失败', e.message); }
}, 3600 * 1000);
timer.unref();

// 优雅退出（systemd 重启时不丢正在处理的请求）
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    console.log(`[http] 收到 ${sig}，正在关闭…`);
    server.close(() => { console.log('[http] 已关闭'); process.exit(0); });
    setTimeout(() => process.exit(1), 8000).unref();
  });
}

module.exports = app;
