-- ============================================================================
--  SEA☆STAR 实益达 官网 · 内容管理数据库
--
--  设计原则：
--    · 双语字段从第一天就预留（*_zh / *_en），日后加英文站不必迁移表结构
--    · 所有"可维护内容"都必须落在表里，不允许再硬编码进 HTML
--    · 删除采用软删除（published / status），避免误删后无法恢复
--    · 时间统一用本地时间字符串（SQLite 的 datetime('now','localtime')）
-- ============================================================================

-- ── 管理员 ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT    NOT NULL UNIQUE,
  display_name  TEXT,
  password_hash TEXT    NOT NULL,           -- scrypt: salt:hash（见 lib/auth.js）
  must_change   INTEGER NOT NULL DEFAULT 1, -- 首次登录强制改密
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  last_login_at TEXT,
  last_login_ip TEXT
);

-- ── 登录会话（存库而非内存，服务重启不掉线） ────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT    PRIMARY KEY,
  admin_id   INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  expires_at TEXT    NOT NULL,
  ip         TEXT,
  ua         TEXT
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);

-- ── 媒体（图片）────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS media (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  filename      TEXT    NOT NULL,           -- 磁盘上的文件名
  original_name TEXT,                       -- 上传时的原始名
  mime          TEXT,
  size          INTEGER,
  width         INTEGER,
  height        INTEGER,
  alt_zh        TEXT,
  alt_en        TEXT,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ── 产品 ────────────────────────────────────────────────────────────────
-- ⚠️ 数据纪律：本表字段**允许留空**，因为原官网 www.wx-seastar.com 的产品页
--    只有一行英文产品名 —— 没有规格参数、没有简介、没有中文名。
--    **留空是诚实，编造才是错误**。前台遇到空字段会显示"素材待补充"。
CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL UNIQUE,      -- URL 友好标识，如 cdx2-mesh-ble
  category    TEXT,                         -- 业务线：led-lighting / driver-odm
  series      TEXT,                         -- 产品系列（原官网未提供，可留空）
  -- 双语内容（两者都可为空，但业务层保证至少有一个）
  title_zh    TEXT,                         -- 中文名：原官网没有就不要编
  title_en    TEXT,                         -- 英文名：原官网原文
  summary_zh  TEXT,
  summary_en  TEXT,
  body_zh     TEXT,
  body_en     TEXT,
  -- 结构化数据（JSON 字符串）；原官网没有规格时存 '[]'
  specs       TEXT,
  badges      TEXT,
  cover_media INTEGER REFERENCES media(id) ON DELETE SET NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  published   INTEGER NOT NULL DEFAULT 1,   -- 软删除/下架
  created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_products_cat  ON products(category, published, sort_order);
CREATE INDEX IF NOT EXISTS idx_products_sort ON products(published, sort_order);

-- ── 产品图库（一个产品多张图）───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS product_media (
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id   INTEGER NOT NULL REFERENCES media(id)    ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, media_id)
);

-- ── 资料文件（规格书 / 说明书 / IES / 其他）─────────────────────────────
--  product_id 为 NULL 表示"通用资料"（不属于某个具体产品）
CREATE TABLE IF NOT EXISTS documents (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
  kind          TEXT    NOT NULL DEFAULT 'other',  -- spec|manual|ies|drawing|other
  lang          TEXT    NOT NULL DEFAULT 'zh',     -- zh|en
  title_zh      TEXT,
  title_en      TEXT,
  filename      TEXT    NOT NULL,                  -- 磁盘文件名
  original_name TEXT    NOT NULL,                  -- 上传时原始名（下载时用它）
  mime          TEXT,
  size          INTEGER,
  downloads     INTEGER NOT NULL DEFAULT 0,        -- 下载计数
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_documents_product ON documents(product_id, kind);
CREATE INDEX IF NOT EXISTS idx_documents_kind    ON documents(kind, lang);

-- ── 客户留言 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT,
  company    TEXT,
  email      TEXT,
  phone      TEXT,
  content    TEXT,
  -- 溯源信息（反垃圾与合规留痕）
  ip         TEXT,
  ua         TEXT,
  referer    TEXT,
  -- 处理状态
  status     TEXT    NOT NULL DEFAULT 'new',   -- new|read|replied|archived|spam
  note       TEXT,                              -- 内部备注（不对外）
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status, created_at DESC);

-- ── 站点设置（键值对，供后台维护标题/描述/联系方式等）─────────────────
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ── 操作日志（谁在什么时候改了什么，便于追责）───────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER,
  action     TEXT NOT NULL,      -- create|update|delete|login|logout|upload
  target     TEXT,               -- products:12 / documents:3 ...
  detail     TEXT,
  ip         TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
