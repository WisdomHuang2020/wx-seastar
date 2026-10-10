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
  scene       TEXT,                         -- 应用场景（JSON 数组，可多选）：home/commercial/outdoor
                                            -- 与业务线 category 分离：category 决定出现在哪个页面，
                                            -- scene 只决定页面内的筛选归类，互不影响
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


-- ══════════════════════════════════════════════════════════════════════════
--  Creator 设计者模式（页面模版与静态文案的可视化编辑）
--
--  为什么编辑产物落在数据库而不是文件：
--    deploy/auto-deploy.sh 每次运行都会 `git reset --hard` 并把仓库文件**覆盖**
--    到 /var/www/wx-seastar。所以 web 根目录是「仓库的镜像」，不是可写工作区 ——
--    编辑器若直接改那里的 .html，改动会在 2 分钟内被静默冲掉。
--    故：**数据库负责「改」，Git 负责「发」**，两边都不碰 web 根目录。
-- ══════════════════════════════════════════════════════════════════════════

-- ── 页面清单 ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT    NOT NULL,             -- 'oem' / 'cn/oem'（含语言前缀，全站唯一）
  lang        TEXT    NOT NULL,             -- 'en' | 'zh'
  title       TEXT,                         -- <title>
  description TEXT,                         -- meta description
  og_image    TEXT,
  published   INTEGER NOT NULL DEFAULT 0,   -- 是否已有发布过的版本
  base_sha    TEXT,                         -- 上次发布时所基于的仓库提交（基线校验）
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pages_slug ON pages(slug);

-- ── 页面模块（页面 = 有序的模块列表；每个模块存一段 HTML 片段）──────────
--  采用「片段」而非「结构化字段」是**刻意的**：现有 78 个页面是手工排版的，
--  拆成结构化字段必然产生视觉回归。片段模型能保证**原样拼回**，
--  同时通过 data-cf 标记把「可改的文字/图片」暴露给编辑器。
CREATE TABLE IF NOT EXISTS page_blocks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id    INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  kind       TEXT    NOT NULL,              -- hero/section/dark/cta/footer/header …
  tag        TEXT    NOT NULL DEFAULT 'section',
  attrs      TEXT    NOT NULL DEFAULT '',   -- 标签属性（原样保留）
  comment    TEXT,                          -- 标签前的 <!-- --> 注释（模块名）
  content    TEXT    NOT NULL DEFAULT '',   -- 标签内部 HTML
  visible    INTEGER NOT NULL DEFAULT 1,
  locked     INTEGER NOT NULL DEFAULT 0,    -- 全局组件（导航/页脚）不可编辑
  style      TEXT    NOT NULL DEFAULT '{}', -- 布局档位（列数/间距/比例/对齐）
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_blocks_page ON page_blocks(page_id, sort_order);

-- ── 版本快照（发布与回滚）───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS page_revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id    INTEGER NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  snapshot   TEXT    NOT NULL,              -- 该页全部 blocks 的 JSON
  author_id  INTEGER,
  note       TEXT,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_rev_page ON page_revisions(page_id, created_at DESC);

-- ── 发布队列（Web 进程只写任务；真正的 git push 由特权服务执行）─────────
--  Web 进程**不持有仓库写权限** —— 即使站点被攻破也拿不到 GitHub 写权限。
CREATE TABLE IF NOT EXISTS publish_queue (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id    INTEGER NOT NULL,
  branch     TEXT    NOT NULL,              -- creator/<slug>-<时间戳>
  base_sha   TEXT,                          -- 提交时 main 的 SHA（基线）
  status     TEXT    NOT NULL DEFAULT 'pending', -- pending|running|done|failed|conflict
  log        TEXT,
  author_id  INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pubq_status ON publish_queue(status, created_at);
