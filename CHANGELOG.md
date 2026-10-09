# 更新日志

SEA☆STAR 实益达官网（`https://www.wx-seastar.cn`）。

> **版本号的唯一来源是仓库根目录的 `VERSION` 文件。**
> 本文件、git tag、GitHub Release 三处必须一致 —— 发版收尾跑
> `python3 deploy/release-audit.py`，退出码非 0 就不算发完。
>
> 版本位判断：文档/注释类改动 → PATCH；向后兼容的功能新增 → MINOR；
> **用户可见的输入口径或行为变更** → MAJOR（本站尚无 MAJOR 变更）。

---

## [v0.13.1] - 2026-10-09

### ✨ 导航下拉：通用照明支持 hover 展开场景入口

桌面端导航「通用照明 / General Lighting」增加 hover 下拉菜单：

| 中文下拉 | 英文下拉 | 链接 |
|---|---|---|
| 家居照明 | Residential | `?scene=home` |
| 商业照明 | Commercial | `?scene=commercial` |
| 户外照明 | Outdoor | `?scene=outdoor` |

- 入口直接链到 `/lighting?scene=xxx`（中文站为 `/cn/lighting?scene=xxx`）
- `js/site.js` 读取 URL 参数自动激活页内对应筛选按钮，无需二次点击
- 移动端 drawer 同步把三个场景入口静态展开，便于触屏访问

新增 `deploy/add-nav-dropdown.py` 统一处理 18 个页面（中英文各 9 个）的
nav + drawer 结构改写，避免手工改漏。

---

### v0.12.0 —— 未独立发布，内容已并入 v0.13.0

> v0.12.0 的改动随 v0.13.0 的架构翻转**一并发布，没有单独打 tag**。
> 之所以不是独立版本节点：承载它的那次提交误纳入了 2559 个本地临时文件
> （抓取缓存与 Chrome profile），已整体重写为干净的 v0.13.0 提交。
> 保留本段是为了留住下面这条**产品中文名更正**的记录。

**重要修正：产品中文名一律改用原厂中文站的官方名称**

发现原厂**另有中文站 `http://cn.wx-seastar.com/`**（此前只用了英文站）。
中文站有 **51 个产品的官方中文名**，已全部抓取并按型号对应到库里。

**我先前的自行翻译有 50 条与官方不符，其中数条是实质错误**：

| 产品 | 我先前翻译的 | **原厂官方中文名** |
|---|---|---|
| FMX10 | 小型面板吸顶灯 | **吊线灯** |
| FMX5 | 圆盘明装筒灯 | **蝶形吸顶灯** |
| FMX11 Pro | 明装筒灯 | **压铸前环吸顶灯** |
| FLX1 / FLX2 | 投光灯 | **泛光灯** |
| CPX3 | 雨棚灯 / 停车场灯 | **停车场 / 油站灯** |
| FZ01 | 冷柜灯 | **冰箱灯** |
| GBX3 | 万向射灯 | **眼球摇头射灯** |
| VNTX2 | 方形镜前灯 | **现代方形镜前灯** |

**教训**：原厂有中文名时**必须用官方名**，不能自行翻译 ——
灯饰行业对同一类产品的叫法差异很大（"投光灯/泛光灯"、"冷柜灯/冰箱灯"），
自行翻译看似合理，实际会与客户的惯用说法脱节。

- 51 个产品用**官方中文名**（`cn.wx-seastar.com` 全部条目，一一对应，无剩余）
- 其余 39 个中文站未收录 → **保留原官网英文名**（未自行编造）
- 中文名同步进 `seed-products.js`，`--reset` 可重建

### 新增
- **英文站点 `/en`**（8 个页面 + 404），URL 结构：
  `/en` · `/en/lighting` · `/en/grow-light` · `/en/odm` · `/en/oem` ·
  `/en/docs` · `/en/about` · `/en/contact`
- **语言切换器**：导航右侧，中文页显示 `EN`、英文页显示 `中文`，互为入口。
- `js/site.js` 支持**页面级语言**：英文页在 head 里声明
  `window.__SEASTAR_LANG__='en'`，产品名即取 `title_en`；
  中英任一字段缺失时 `pick()` 自动回退，不会出现空白。
- `sitemap.xml` 补英文 URL 并加 **`hreflang`** 双语标注。
- nginx 增加 `/en` 的干净地址规则（`/en/lighting.html` → 301 `/en/lighting`，
  `/en/` 与 `/en/index.html` → 301 `/en`），与中文站同一套规范。

### 英文文案来源
- 能对应原官网英文站表述的（公司沿革、工厂能力、体系认证、联系方式）
  **直接采用官网原文**；
- 我方自撰的中文文案做**忠实翻译**，未添加原意之外的内容。
- 共 337 条文案，全部有对应；术语使用原厂既有说法
  （如 SMT / wave soldering / Class 100,000 clean room / CSA Witness Lab）。

### 工程
- 新增静态目录 `en/`，已同步**四处部署白名单**
  （workflow FILES / sites.yml / auto-deploy.sh / deploy-manual.sh）。
- 页面由中文页**程序化生成**（替换文本节点 + 路径前缀 + 导航/链接改写），
  样式与结构完全复用，后续改版可重跑脚本再生成。

---

---

## [v0.13.0] - 2026-10-09

### 🔴 架构变更：英文站为主（根路径），中文站为从（/cn）

按客户要求把 v0.12.0 的双语布局**整体翻转**：

| URL | 语言 | 地位 |
|---|---|---|
| `https://www.wx-seastar.cn/...` | 英文 | **为主（master）** |
| `https://www.wx-seastar.cn/cn/...` | 中文 | **为从（slave）** |

v0.12.0 做成了「中文在根 + 英文在 `/en`」，本次把两套页面树各自平移一层：

- 英文页 `en/<p>.html` → `./<p>.html`，资源路径 `../assets/x` → `assets/x`
- 中文页 `./<p>.html` → `cn/<p>.html`，资源路径 `assets/x` → `../assets/x`
- 站内链接同步换前缀；后端接口 `/api` 与上传文件 `/uploads` **语言无关，不加前缀**

新增 `deploy/flip-i18n.py` 固化这套平移与重写规则（可重跑），
中文页原稿已备份在 `.flip-zh/`（已 gitignore）。

**语言切换按钮**：多页静态站每页独立，故按「同页对应」把 href 写死在 HTML 里，
不依赖 JS：

```
英文 /about  ⇄  中文 /cn/about        英文 /  ⇄  中文 /cn
```

### 🐛 修复：动态卡片跨语言串台

`js/site.js` 里动态生成的卡片原先写死了**绝对路径**（`/docs`、`/contact`）和
**中文字面量**。翻转后这会同时暴露两个毛病：

- 中文站 `/cn/lighting` 上的卡片点"技术资料"会跳到英文站 `/docs`
- 英文站的卡片提示语显示中文（"素材待补充"、"该分类下暂无产品"……）

改法：

- 引入 `BASE`（英文 `''` / 中文 `/cn`）与 `href(path)` 统一拼前缀
- 新增文案表 `TEXT.zh / TEXT.en` 与 `t(key)`，覆盖卡片、表格表头、空状态、表单提示
- 资料类型标签 `KIND_LABEL` 改为按语言分组，配套 `kindLabel(d)`
- 应用场景 `SCENE_TEXT` 同样按语言分组（家居/商业/户外 ⇄ Residential/Commercial/Outdoor）
- `setLang()` 现在会同步更新 `BASE`，避免切语言后链接仍指向旧站

### 🔧 其它

- **旧 `/en` 地址保留 301**（`/en` → `/`、`/en/lighting` → `/lighting`），
  避免 v0.12.0 期间已发出/已收录的链接变成死链
- `sitemap.xml` 重写：每个 URL 声明**全套** hreflang（含自身与 `x-default`）——
  Google 要求声明必须双向 reciprocate，单向无效
- `robots.txt` 补 `Disallow: /cn/404.html`
- 部署白名单四处同步 `en` → `cn`

> ⚠️ 提醒：`deploy/auto-deploy.sh` 在服务器上跑、**不随 git 更新**，
> 改完必须手工 `scp` 同步一次。

---

---

## [v0.11.0] - 2026-10-09

### 新增
- **ODM 与 OEM 拆分为两个独立页面**，各占一个导航项。

  | 页面 | 内容 |
  |---|---|
  | `/odm` | **保持原「ODM/OEM」页全部内容**，仅摘掉标题与文案里的 OEM 字样 |
  | `/oem` | **新建** —— OEM 电子制造服务（SMT 贴片 / 波峰焊 / 整机组装 / PCBA 代工） |

- 导航顺序调整为：**通用照明 → 植物灯具 → ODM → OEM → 资料中心 → 关于我们 → 联系我们**
  （ODM / OEM 由原来的第 1 位挪到第 3、4 位，即「植物灯具之后、资料中心之前」）。
  `nav__links`、移动端 `drawer`、页脚「业务线」三处同步更新，9 个页面全部一致。

### OEM 页的内容来源（**全部有出处，未编造**）
事实性内容取自原官网 `www.wx-seastar.com` 的 **FACILITIES** 页（实测抓取）：

| 原官网原文 | 页面呈现 |
|---|---|
| `Several high-speed SMT lines, wave-soldering lines and assembly lines` | 产线构成（SMT / 波峰焊 / 整机组装） |
| `Class 100,000 clean room` | 十万级洁净车间 |
| `More than 500 skillful workers with a monthly capacity of 1 million PCS` | 制造规模数据条 |
| `SAP, AOI, SPI, MES` | 信息化管理系统 |
| `plastic injection and stamping` | 注塑与冲压（垂直整合） |
| `ISO 9001, ISO14001, IATF 16949` | 品质体系徽标 |
| `IQC` / `OQC` / `BURNING` 图注 | 工艺流程与实拍图 |
| `CSA Witness Lab` + 六类测试 | 品质体系配图说明 |
| 集团 1998 成立 / 2007 年 A 股上市（002137）/ 中国第一家 EMS 上市公司 / 无锡 43,000㎡ / 600+ 员工 / 45+ 工程师 | 集团背景区块 |

- **配图 10 张**（`assets/img/ems-*.jpg`）全部来自原官网 FACILITIES 页的实拍图，
  图注与图片的对应关系是按 HTML 结构逐一核对得出的（SMT / 波峰焊 / 组装 / 注塑 /
  冲压 / IQC / OQC / BURNING / CSA 实验室 / 车间），未做任何替换或合成。
- ⚠️ **工艺流程**（IQC→SMT→AOI→波峰焊→组装→老化→OQC）是依据上述产线构成的
  **行业通行流程梳理**，页面中已如实标注为「典型流程」——
  原官网并未逐步列出该顺序，此处属结构化整理，请客户复核。
- ⚠️ 原官网的 `EMS SERVICE` 栏目**是空的**（建了页面但没有内容），
  故 OEM 页素材全部取自 FACILITIES 页，未从空白栏目臆测内容。

### 修复
- **`.gitattributes` 已声明 `* text=auto eol=lf`，但工作区仍被写成了 CRLF**：
  本机 Python `io.open(f,'w')` 默认 `newline=None`，写入时把 `\n` 转成 Windows 的 `\r\n`。
  带 CRLF 的 `auto-deploy.sh` 上传到 Linux 后直接语法错误（`$'do\r'`），
  **会让拉取式部署整体挂掉**。已将 11 个受影响文件统一转回 LF，
  并在服务器上以 `bash -n` 校验通过。今后写文本文件一律显式指定 `newline='\n'`。

### 说明
- **新增静态文件必须同步四处白名单**（本项目既有纪律）：
  `.github/workflows/deploy-lighthouse.yml` 的 `FILES`、`deploy/sites.yml` 的
  `deploy_files`、`deploy/auto-deploy.sh` 与 `deploy/deploy-manual.sh` 的 `FILES`。
  本次 `oem.html` 四处均已加入；其中 `auto-deploy.sh` 在服务器上运行、
  **不随 git 自动更新**，已手工 scp 同步并在远端校验。

---

## [v0.10.0] - 2026-10-09

### 🔴 重大发现：原官网的产品远不止之前抓到的 24 个

此前只抓了原官网 `LED LIGHTING` 栏目**第 1 页**的 24 个产品，便当成"全部"。
本次按「包括二级、三级子目录下的各页面」重新彻底爬取，实际情况是：

| 位置 | 内容 |
|---|---|
| `/forum/id/15448/` | LED LIGHTING **主栏目，共 4 页**（每页 24 个） |
| `cid/15449` | **EUROPE**（市场分区，1 页） |
| `cid/15450` | **NORTH AMERICA**（3 页） |
| `cid/15451` | **ASIA**（1 页） |
| `cid/15452` | SOUTH AMERICA（空） |
| `/page/28684/` | DRIVER AND CONTROL BOARD (ODM/OEM)，6 个（**与库内一致，无遗漏**） |

**去重后原官网共 83 个 LED 产品，而我们库里只有 24 个 —— 漏了 59 个。**

漏掉的包括整整几个产品线：Wallpack（WPX1~WPX5）、High Bay（HBX/EHBX）、
Flood Light（FLX/EFLX）、Solar Flood、Vaportight、Canopy/Parking Garage、
Track Light、Troffer、Grow Light、灯带（SMD/Neon/COB/Magnetic）、
冷柜灯（FZ01）、以及 FMX/GBX/SPX/RDX/CDX/EPLX/ESPX 等多个系列。
**这也解释了此前「户外照明」只有一个产品的尴尬**。

### 新增
- **补录 59 个产品**，照明线从 25 → **84 个**（总数 90，含 6 个 ODM）。
  图片全部从原官网按栏目结构抓取（`item_img` ↔ `a.title` 的真实对应），
  以 slug 命名存入 `assets/img/product/<slug>.jpg`，并同步到线上 `uploads/img/`。
- **应用场景重新分类**（按产品名里的行业术语判定）：
  家居 29 / 商业 69 / **户外 14**（此前户外仅 1 个）。
- `seed-products.js` 同步扩充到 83 个产品（含 scene），保证 `--reset` 可重建。

### 判定依据（⚠️ 属推断，建议客户复核）
- **有明确文字依据的**：名字含 `Wallpack` / `Flood Light` / `Solar Flood` /
  `Vaportight` / `Canopy` / `Parking Garage` → 户外；
  含 `High Bay` / `Troffer` / `Track Light` / `Panel` / `Strip` / `Wraparound` /
  `Linear` / `Gimbal` / `Eyeball` → 商业；`Vanity` → 家居；
  `Downlight` / `Surface Mount` / `Ceiling` / `Retrofit` → 家居 + 商业。
- **两处特判**（按字面规则会判错）：
  `FZ01 Cooler Lighting（Canopy+…）` 里的 Canopy 指**冷柜层板**而非户外雨棚 → 商业；
  `FMX10 Small Panel Lamp Ceiling Lamp` 是吸顶形态 → 家居 + 商业。
- **原官网本身没有「家居/商业/户外」这个维度**，上述归类全部是按术语推断的，
  请客户过目；后台可随时调整，改完前台即时生效。

### 技术说明
- 原官网对 `curl` 一律返回 **403**（页面有 WAF），但图片源
  `resources.jsmo.xin` 仍可 `curl`（须带 `Referer` 与 `http` 协议）。
  因此**页面用无头 Chrome 抓取**、**图片用 curl 下载**，两者结合。
- 抓取脚本保存在 `deploy/crawl-official-products.py`，日后核对可复现。

---

## [v0.9.2] - 2026-10-08

### 修复
- **照明页的场景筛选「点了没反应」**（v0.9.0 引入）。
  根因：`js/site.js` 的 `mountProductFilter(pillsSel, gridSel)` 内部用
  `document.querySelector(pillsSel)` 处理**第一个参数**，但挂载处传进去的是
  `querySelectorAll(...)` 遍历出来的 **DOM 元素**，不是选择器字符串。
  `querySelector(DOM元素)` 会因选择器非法而**抛异常**，函数在绑定事件之前就中断 ——
  于是筛选**静默失效**，按钮点了毫无变化。
  紧邻的 `grid` 参数**本来就有类型判断**（`typeof … === 'string' ? … : …`），
  `pills` 这行漏了。这段代码一直潜伏着，只因**此前页面上没有任何
  `data-products-filter` 元素**（产品矩阵区只有一行空注释占位）而从未被执行到 ——
  v0.9.0 补上筛选 Tab 时正好把它踩响。

- **正反双向实测**（真实点击，不是代码走查）：同一套页面结构 + 同一份线上数据，
  分别加载线上版与修复版 JS，然后点击「家居照明」：

  | 加载的 JS | 结果 |
  |---|---|
  | 线上版（v0.9.1） | 产品数仍为 25、高亮未转移 → **复现故障** |
  | 修复版 | 产品数变为 11、高亮转到 `home` → **正常** |

  ⚠️ 教训：v0.9.0 我只用「抽取筛选表达式执行」验证了**筛选逻辑**，
  却漏掉了**挂载路径**——表达式是对的，但它压根没被绑上去。
  **涉及 DOM 事件的功能，必须真的点一下。**

### 变更
- **删掉照明页 hero 区的 4 个品类 pill**（家居照明 / 商业照明 / 户外照明 / 全部产品）。
  它们与产品矩阵区的筛选 Tab **完全重复**：名字一模一样，点击后也只是滚动到下方
  再触发同一套筛选，等于同页出现两排功能相同的按钮。
  保留产品区的筛选 Tab —— 它同时承担「筛选」与「当前筛选状态指示」两个职责；
  hero 区本身已有「浏览产品」按钮承担入口职能。
  同时移除 `js/app.js` 里配套的 `data-jump-filter` 处理逻辑（已无元素使用）。

---

## [v0.9.1] - 2026-10-08

### 修复
- **发版后访客可能仍执行旧版 JS/CSS，新功能"看着像没上线"**。
  根因：站内静态资源只有 nginx 默认的 `Last-Modified` / `ETag`、
  **完全没有 `Cache-Control`**，浏览器于是按 RFC 7234 §4.2.2 做「启发式缓存」，
  在缓存新鲜期内**根本不发请求**，自然拿不到新版。
  实测症状：`/lighting` 的 HTML 已是新版（筛选按钮出现了），
  但 `js/site.js` 还是旧版（筛选逻辑对不上）→ **点筛选没反应**。
  核验手法：`curl` 直接拉线上源文件与本地 `cmp` 逐字节比对 —— 结果是完全一致，
  证明**不是没部署，而是浏览器没去取**。

### 变更
- nginx（`deploy/nginx-wx-seastar.conf`）新增 `location ~* \.(js|css)$`，
  对站内 JS/CSS 下发 `Cache-Control: no-cache, must-revalidate` ——
  要求浏览器每次回源校验（有 `ETag`，未变即 304，开销很小）。
- ⚠️ 该 location 内**重复声明了 HSTS**。nginx 的规则是：
  location 里只要出现**一个** `add_header`，server 块的 `add_header` 就**不再继承** ——
  不重复就会丢掉 `Strict-Transport-Security`。
- 图片（`/uploads/img/`，30 天）与文档（`/uploads/doc/`，不缓存）的既有策略未改动。

### 说明
- nginx 配置**不在发布白名单内**，需手工 scp 到
  `/etc/nginx/sites-available/wx-seastar` 再 `systemctl reload nginx`。
  上传前已备份到 `/root/nginx-wx-seastar-bak-<时间戳>.conf`，
  并以 `nginx -t` 作为闸门（测试不过就不 reload）。
- **已存在的浏览器缓存需要用户强刷一次**才会更新；此后每次回访都会自动校验。
- 验证：`/js/site.js` 等已带 `Cache-Control: no-cache, must-revalidate` 且 HSTS 仍在；
  8 个页面全 200；`/lighting.html` → `/lighting` 的 301 未被新正则抢走；
  图片长缓存未受影响；同机其它站点正常。

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
