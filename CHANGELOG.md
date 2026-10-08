# 更新日志

SEA☆STAR 实益达官网（`https://www.wx-seastar.cn`）。

> **版本号的唯一来源是仓库根目录的 `VERSION` 文件。**
> 本文件、git tag、GitHub Release 三处必须一致 —— 发版收尾跑
> `python3 deploy/release-audit.py`，退出码非 0 就不算发完。
>
> 版本位判断：文档/注释类改动 → PATCH；向后兼容的功能新增 → MINOR；
> **用户可见的输入口径或行为变更** → MAJOR（本站尚无 MAJOR 变更）。

---

## [v0.9.0] - 2026-10-08

### 新增
- **照明页可按「应用场景」筛选产品**（家居 / 商业 / 户外）。
  原先 hero 区那三个 pill（家居照明 / 商业照明 / 户外照明）配的是
  `data-jump-tab="catalog:*"`，而页面上**根本没有 `catalog` 这个 Tab 组** ——
  `js/app.js` 里 `if (!groupEl) return;` 直接静默放弃，点击的唯一效果是页内锚点滚动
  （现象就是「点哪个都一样」）。产品矩阵区那个位置也只留了一行 `<!-- 筛选 Tab -->` 注释占位。
  本次补齐：产品矩阵区新增筛选 Tab，hero 的 pill 改为 `data-jump-filter` 与之联动。

### 变更
- `products` 表新增 `scene` 列（JSON 数组，可多选），承载应用场景。
  **与业务线 `category` 严格分离** —— `category` 决定产品出现在哪个页面
  （`/lighting` / `/odm`），`scene` 只决定页面内的筛选归类，两者不可混用。
- `db.migrate()` 增加幂等 `ALTER TABLE`：`schema.sql` 全是 `CREATE TABLE IF NOT EXISTS`，
  它只能建新表、**不会给已存在的表补列**，故新增列必须在 migrate 里显式补齐。
- 前台筛选逻辑由 `category` 前缀匹配改为按 `scene` 数组包含（`js/site.js`）。
- 产品卡在没有系列名时改显示应用场景标签，让访客看得见归类依据。
- 后台产品编辑抽屉新增「应用场景」多选（`admin.js`）；产品列表增加场景标签，
  未归类的会显式标出「未归类」。

### 数据
- 给 25 个照明产品写入应用场景。其中 **8 个有产品名上的明确依据**：
  6 个名字含 `Commercial`（CDX2 / CDX8 / CDX11 / ECDX7 / ECDX9 / ECDX11）→ 商业；
  `Vanity`（VNTX2 镜前灯）→ 家居；`Wallpack` → 户外。
  其余 17 个**按照明行业术语推断**（Downlight 筒灯、Panel 面板灯、Ceiling 吸顶灯、
  Cylinder 圆柱灯…）。最终分布：家居 11 / 商业 23 / 户外 1，未归类 0。
- ⚠️ **原官网没有「家居 / 商业 / 户外」这个分类维度** —— 它是设计稿引入的。
  上述归类属推断结果，建议由客户复核；后台可随时调整（改后前台即时生效）。

### 说明
- 「户外照明」目前只有 Wallpack 一个产品 —— 如实呈现，未为凑数塞入不相关产品。
- 「商业照明」有 23 个（占 92%），因此它与「全部」差别不大；这是该厂产品结构的实情。
- 线上数据写入前已备份数据库（`/root/wx-seastar-db-2026-10-08-before-scene.db`），
  且写入前做了断言（25 个 slug 必须全部命中且都属于照明线，否则中止）。

---

## [v0.8.1] - 2026-10-08

### 修复
- **后台新建的产品可能在任何一个前台产品页都不出现**。根因是它的「业务线」
  （`products.category`）为空，而 `/lighting` 与 `/odm` 都是**按固定值取数**
  （`category:led-lighting` / `category:driver-odm`），空值两边都进不去。
  线上实例：`id=61`「洗墙壁灯 wallpack」。
- 该产品同时因 `sort_order = 0`（小于现有产品最小值 10）**顶到了首页产品区第一位**，
  抢占了原有展示位。

### 变更
- **后台「业务线」由自由输入框改为下拉选择**（`server/public/admin.js`）。
  原先的输入框提示词是「如 Commercial / Downlight」，而前台只认
  `led-lighting` / `driver-odm` 两个值 —— **提示词与真实取值不是一套词表**，
  照着提示填写同样不会上架。改为下拉「照明线（→ /lighting） / ODM 驱动与控制板
  （→ /odm） / 不归类」后，填写口径与前台取数口径统一。
  历史数据若存在非标准值，会保留并标注「非标准值，建议改选」，**不做静默改写**。
- **新建产品未填排序时自动排到末尾**（`server/src/routes/products.routes.js`）：
  取当前 `MAX(sort_order) + 10`，不再使用默认值 0。后台「排序」留空即为此行为。

### 数据修正
- 线上 `products.id = 61`：`category` 由 `NULL` 改为 `led-lighting`，
  `sort_order` 由 `0` 改为 `250`（排到照明线末尾）。修正前已备份数据库到
  `/root/wx-seastar-db-2026-10-08.db`。

### 说明
- `server/**` **不在** CI 静态部署白名单内，本次后端改动需单独同步到
  `/opt/wx-seastar/server` 并重启 `wx-seastar` 服务，`git push` 不会带上它。

---

## [v0.8.0] - 2026-09-30

### 变更
- **联系页「公司位置」改为「真实地址 + 一键导航」**，替换原先那张内联 SVG 画的
  假地图（非真实底图，对访客无实用价值）。
- 新增「复制地址」按钮（`data-copy-text` 驱动，`js/site.js` 的 `mountCopyButtons`；
  优先 `navigator.clipboard`，非安全上下文回退 `execCommand`）。

### 说明（为什么没有直接嵌地图）
- 国内可公开展示的地图只有**腾讯 / 高德 / 百度 / 天地图**四家，且都要求自备 key +
  域名白名单；`wx-seastar.cn` 目前**尚未完成 ICP 备案**，高德会直接报 `INVALID_DOMAIN`。
- 故采用**官方便捷链接**（免 key、免备案、即刻可用）：
  高德 `uri.amap.com/search`、百度 `map.baidu.com/search`。
- 检索词用**公司全称**而非地址：地址中的「经十一路以西、经十三路以北」是**宗地描述**，
  拿去检索可能落到错误位置。**宁可搜不到，也不能搜到别的地方。**
- ⚠️ 原官网 `www.wx-seastar.com` 联系页嵌的是 **Google Maps 短链**，在国内属
  不合规地图源，**未照搬**。

### 修复
- `.btn svg` 缺少尺寸规则，导致按钮内的内联 `<svg>` 被 flex 撑成巨型图形、盖住内容。
  已补 `.btn svg{ width:17px; height:17px; flex-shrink:0 }`。

---

## [v0.7.0] - 2026-09-30

### 变更
- **全站地址去掉 `.html` 后缀**：主页即 `/`，其余为 `/odm` `/lighting` `/grow-light`
  `/docs` `/about` `/contact`。
- 老地址 `<name>.html` 一律 **301** 到干净地址（保留 query string）；
  `/index` 与 `/index.html` 301 到 `/`。
- 站内引用同步 235 处（导航/页脚/正文内链、`canonical`、`og:url`、`sitemap.xml`
  以及 JS 生成的产品卡链接）。

### 说明
- nginx：`location /` 改为 `try_files $uri $uri.html $uri/ =404`；
  `/api/` `/admin` `/uploads/` 改用 `^~` 前缀，避免被跳转用的正则 location 抢走。
- 配置留档于 `deploy/nginx-wx-seastar.conf`（**不在自动发布白名单内，需手工 scp 生效**）。

---

## [v0.6.0] - 2026-09-30

### 变更
- **抓齐全部 30 个产品的原官网产品图**（24 个通用照明 + 6 个 ODM 驱动/控制板），
  此前 24 个照明型号里只配了 4 张图、其余被误标「素材待补充」。
- 图片改为**以产品 slug 命名**：`assets/img/product/<slug>.jpg`，
  **映射表被彻底删除** —— 文件名即产品身份，图文错配从机制上不再可能。
- 新增 `deploy/fetch-product-images.py`：从原官网产品页的**栏目结构**提取
  「产品名 ↔ 图片 URL」的真实对应关系（不是猜的），下载并转真 JPEG。
- 新增 `server/src/tools/prune-legacy-media.js`：清理旧命名素材的孤儿记录与文件。

### 说明
- 抓图两条硬要求：带 `Referer: http://www.wx-seastar.com/`，且**必须用 `http`**
  （同一张图 `https` 一律 403，`http` 才 200）。
- 下载到的文件**全是 WebP，但扩展名伪装成 `.jpg`/`.png`**，已统一转真 JPEG。

---

## [v0.5.3] - 2026-09-30

### 修复
- 产品图与型号**再次错配**：此前按「看起来像」猜的映射表本身就是错的。
  逐张读图核对后修正为：CDX2 BLE→`prod-cdx2-ble.jpg`、CDX11→`prod-series-a.jpg`、
  FMX15→`prod-fmx15.jpg`、WRPX3→`prod-neon-strip-b.jpg`；
  CDX8 因图上无型号印字，**按纪律不配图**。
- 新增 `server/src/tools/fix-product-images.js` 用于重绑线上库的封面图
  （`seed-products.js` 是幂等的，不会覆盖已存在的错配）。

---

## [v0.5.2] - 2026-09-30

### 修复
- 按图片实际印出的型号重新映射产品图；删除两张根本不是产品图的素材
  （实为「New DLC V6.0 Product Launched」横幅与客厅场景图）。
- 删除编造的技术参数。

---

## [v0.5.1] - 2026-09-30

### 修复
- **数据区四个数字在无 JS / 未滚动时显示为 0**：计数器只在 `IntersectionObserver`
  触发时才跑，而 HTML 兜底写的是 `0`。已把**目标值直接写进 HTML**，JS 仍负责动画。

---

## [v0.5.0] - 2026-09-30

### 变更
- 视觉尺度升级，解决「不够大气」：容器 1240→1340px；区块间距 88/120/152 →
  112/152/192px；`h2` 上限 → 2.6rem；`display-xl` → 5.4rem；正文 17px/62ch → 19px/58ch；
  产品卡图片区 4:3 → 1:1；Hero 高度 → `min(94vh, 940px)`。
- 首页 Hero 换图：老化测试房 → 厂房外景 + 蓝天 + 品牌招牌。

---

## [v0.4.3] - 2026-09-30

### 文档
- `OPERATIONS.md` 运维手册改为「拉取式部署」写法；沉淀本次踩坑到维护技能。

---

## [v0.4.2] - 2026-09-30

### 变更
- **部署改为「服务器主动拉取」**：systemd timer 每 2 分钟 `git fetch` 比对，
  有新提交就发布。`git push` 后最多 2 分钟自动上线（实测 45–90 秒），
  **不再依赖 GitHub runner → 服务器的网络环境**。

### 说明
- 放弃 push 模式的根因：runner → 本服务器的 SSH/SCP 链路**实测不稳定**，
  会卡在 `in_progress` 并留下僵尸会话，`BatchMode`、`ConnectTimeout`、
  `ServerAliveInterval` 都压不住，换成 scp 不走管道也依然卡。
- 发布前整站备份（保留最近 5 份）；数据库与 `uploads/` 不在仓库里，永不被覆盖。

---

## [v0.4.1] - 2026-09-30

### 修复
- **清理全部编造内容**：产品与描述一律照原官网原文，缺素材如实标注。
  涉及：ODM 页曾把「DRIVER AND CONTROL BOARD」写成「灯具定制开发」并编了
  5 步流程与 6 个案例；产品曾编造 Series/Type/Cert. 规格与中文名；
  首页曾出现编造的合作品牌与认证断言。**留空是诚实，编造才是错误。**
- CI 部署「假死」保护 + 兜底脚本闸门修复。

---

## [v0.4.0] - 2026-09-30

### 新增
- **内容管理后台**：非技术人员可登录 `/admin/` 自助维护产品、图片与技术资料，
  查看并导出客户留言。改完即生效，不需要重新构建发布。

### 说明
- 架构：nginx 静态站 + `/api`、`/admin` 反代到 Node（回环 3000）+ SQLite 单文件。
- 技术选型核心是**没有原生模块**：Node 内置 `node:sqlite` 与 `crypto.scrypt`，
  只有 `express`/`multer` 两个纯 JS 包 → Node 升级不需重编译，备份就是一个文件。
- 双语字段（`*_zh` / `*_en`）从第一天预留，日后加英文站不必迁移表结构。
- 前端采用**渐进增强**：取数失败时不清空容器，页面静态兜底内容继续可用。

---

## [v0.3.0] - 2026-09-30

### 变更
- **全站品牌一致性改造**：对 Logo 风车区域逐像素采样后定出设计语言 ——
  单一青蓝色相（H 197°–209°）、8 片楔形叶片（周期 45°）、
  中心四角星负空间（73% 镂空）、锐利硬边。
- 新增品牌图形层（`.brand-star` / `.brand-burst` / `.brand-wedge` / `.brand-list` /
  `.brand-rule` / `.brand-bevel` / `.brand-spin`），`.overline::before` 自动注入星形
  前缀，全站章节标零 HTML 改动。
- 重建 OG 分享图（PNG → JPG，650KB → 45KB）；404 页品牌化。
- 新增 `BRAND.md`，并声明 `DESIGN.md` 的旧方向已废弃。

---

## [v0.2.0] - 2026-09-30

### 变更
- **视觉改版 v2：白底大图 + 品牌蓝**（主色 `#0070C0`，实测自 Logo 风车位图），
  参照 OKT Lighting 的布局语言；素材全部从原官网抓取。
- 导航改为恒定白底；旧的光效体系（glow / beam-cone / halo）与玻璃拟态退役。
- 保留全部 162 个原 class 名，只换视觉，逐页平滑迁移。

---

## [v0.1.1] - 2026-09-30

### 修复
- 清理页面上的「原型演示 / 占位」措辞；联系表单由「前端演示」改为可用的
  邮件提交（`mailto`）；移除「工作时间：待补充」整项。

---

## [v0.1.0] - 2026-09-30

### 新增
- **站点首次上线**：SEA☆STAR 实益达官网静态站（7 个页面 + 404），
  接管域名 `wx-seastar.cn` 并部署到腾讯云轻量服务器 `/var/www/wx-seastar`。
- 上线配套：`favicon.ico`（由官网原版 Logo 风车位图裁剪）、`apple-touch-icon.png`、
  OG 分享图、`robots.txt`、`sitemap.xml`、`404.html`；
  6 页 `<head>` 补齐 canonical / Open Graph / theme-color。
- CI 部署流水线 + `deploy/sites.yml` 站点对照表 + 本 `VERSION` 版本基线。

### 说明
- nginx 为**多页静态站**配置：`try_files $uri $uri/ =404` + `error_page 404 /404.html`，
  **绝不回落 `index.html`**（否则不存在的页面会返回首页内容 + 200，误导访客且伤 SEO）。
