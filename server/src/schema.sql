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
  comment    TEXT,                          -- 模块名（由 prefix 派生，供界面展示）
  prefix     TEXT    NOT NULL DEFAULT '',   -- 标签**之前的原文逐字前缀**（空白 + 注释），
                                            -- 重建时必须原样拼回，否则会丢换行/缩进
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
  page_id    INTEGER NOT NULL,              -- kind='page' 时为页面 id；
                                            -- kind='news' 时固定填 0（SQLite 改 NOT NULL 要重建表，
                                            -- 而 0 不是合法页面 id，用它代替 NULL 代价最小）
  kind       TEXT    NOT NULL DEFAULT 'page', -- page | news
  branch     TEXT    NOT NULL,
  base_sha   TEXT,                          -- 提交时 main 的 SHA（基线）
  status     TEXT    NOT NULL DEFAULT 'pending', -- pending|running|done|failed|conflict
  log        TEXT,
  author_id  INTEGER,
  created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_pubq_status ON publish_queue(status, created_at);


-- ── 常用字段（运维真正高频会改的那几十处）──────────────────────────────
--  动机：全站 1191 处可改文字，但运维常动的只有联系方式、标语、简介这类几十处。
--        把它们提到编辑器最上面，不用在 134 个模块里翻。
--
--  ⚠️ 关键设计：**一个字段可以对多个位置**。
--     实测「联系电话 0510-68506661」在联系页出现 3 次、「邮箱」出现 2 次。
--     若一个字段只改一处，运维会以为改好了、其实页面上还有几处没变 —— 必须一起改。
--
--  ⚠️ 定位用**语义坐标**（slug + 模块注释 + 序号）而不是 block_id：
--     重新拆页会重建 block 行、block_id 全变；语义坐标能扛住重拆。
CREATE TABLE IF NOT EXISTS featured_fields (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT    NOT NULL,              -- 运维看得懂的名字，如「联系电话」
  hint       TEXT,                          -- 补充说明（显示在输入框下方）
  kind       TEXT    NOT NULL DEFAULT 'text', -- text | img
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS featured_targets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  field_id   INTEGER NOT NULL REFERENCES featured_fields(id) ON DELETE CASCADE,
  slug       TEXT    NOT NULL,              -- 页面 slug，如 contact / cn/contact
  block_hint TEXT,                          -- 模块注释（不含 ===== 装饰即可匹配）
  idx        INTEGER NOT NULL,              -- 该模块内第 N 个非空白文字节点 / 第 N 张图
  find       TEXT,                          -- 在该节点内要替换的**原文子串**（见下）
  sample     TEXT,                          -- 建档时的原值，用于校验定位是否失效
  UNIQUE(field_id, slug, block_hint, idx)
);
CREATE INDEX IF NOT EXISTS idx_ft_field ON featured_targets(field_id);


-- ── 新闻（v0.28.0 起入库，此前由 deploy/news-data.json 生成）──────────
--  动机：56 篇文章页此前全靠改 JSON + 重跑脚本，运维加一篇新闻要找开发。
--
--  ⚠️ 为什么中英**段落数组一一对应**而不合并成"双语富文本"：
--     生成器按 `paras[i]` ↔ `paras_zh[i]` 逐段渲染，这是既有版式的既定事实；
--     允许自由增删段落会让中英错位。入库后仍保持"数组对齐"，
--     编辑界面也按段落成对编辑。
CREATE TABLE IF NOT EXISTS news (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  src_id      TEXT,                          -- 老站 id（译文按它对齐）
  slug        TEXT    NOT NULL,              -- URL 片段
  date        TEXT    NOT NULL,              -- YYYY-MM-DD
  title       TEXT    NOT NULL,              -- 英文标题
  title_zh    TEXT,                          -- 中文标题
  summary     TEXT,                          -- 英文摘要（列表卡片与详情导语）
  summary_zh  TEXT,
  paras       TEXT    NOT NULL DEFAULT '[]', -- 英文段落，JSON 数组
  paras_zh    TEXT    NOT NULL DEFAULT '[]', -- 中文段落，与英文**一一对应**
  images      TEXT    NOT NULL DEFAULT '[]', -- 正文配图（本地路径），JSON 数组
  thumb       TEXT,                          -- 列表卡片缩略图
  cover       TEXT,                          -- 老站封面 URL（仅溯源，不渲染）
  nchar       INTEGER,                       -- 老站正文字数（仅溯源）
  published   INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,    -- 越小越靠前；同值为日期倒序
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_news_slug ON news(slug);
CREATE INDEX IF NOT EXISTS idx_news_order ON news(published, sort_order, date DESC);
