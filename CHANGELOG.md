# 更新日志

SEA☆STAR 实益达官网（`https://www.wx-seastar.cn`）。

> **版本号的唯一来源是仓库根目录的 `VERSION` 文件。**
> 本文件、git tag、GitHub Release 三处必须一致 —— 发版收尾跑
> `python3 deploy/release-audit.py`，退出码非 0 就不算发完。
>
> 版本位判断：文档/注释类改动 → PATCH；向后兼容的功能新增 → MINOR；
> **用户可见的输入口径或行为变更** → MAJOR（本站尚无 MAJOR 变更）。

---

## [v0.21.1] - 2026-10-10

### 🧭 导航当前栏目高亮（新增）+ 人数口径全站统一为 600+

#### ① 人数口径统一（客户指定：公司人数 600+）

**问题**：about 页数据带写 `600+ 员工`，而 OEM 页数据带另有一块 **`500+ 熟练工人`** ——
两者都是"人数型"数字，访客会读成互相矛盾。

| 位置 | 旧 | 新 |
|---|---|---|
| `oem.html` 数据带 | `500+` / Skilled workers | **`600+` / Employees** |
| `cn/oem.html` 数据带 | `500+` / 熟练工人 | **`600+` / 员工** |
| `cn/oem.html` meta | 「…十万级洁净车间，500+ 熟练工人，月产能 100 万 PCS」 | 「…十万级洁净车间，**600+ 员工**，月产能 100 万 PCS」 |
| 两页「组装线」卡片 | 「…500+ skilled workers with a monthly capacity of 1 million PCS」 | 「…with a monthly capacity of 1 million PCS」（**人数移除，产能保留**） |

**出处说明**：`600+` 取自源站 About Us 的 `a workforce of over 600 employees`；
源站 Facilities 另有 `More than 500 skillful workers…`（与月产能绑在同一句）。
本页**不再引用其中的 500+ 人数**（否则与 600+ 冲突），**月产能 100 万 PCS 保留**。
两点均写入两页文件头注释留痕。

#### ② 导航当前栏目高亮（新增）

**此前站内没有任何"当前栏目"机制**（`.nav__links a` 只有 hover 态）。

| 层 | 改动 |
|---|---|
| `styles.css` | `.nav__links a[aria-current="page"]` 着色 + 下划线；抽屉 `.drawer a[aria-current="page"]` |
| `js/app.js` | 新增**第 9 节**：按 `location.pathname` 打 `aria-current="page"` |

**设计要点**：
- 用**标准属性 `aria-current`** 而非自建类名 —— 读屏可播报「当前页」，且**无 JS 时不误标任何项**；
- **跳过带 query 的项** —— 下拉里的 `/lighting?scene=outdoor` 是栏目内筛选，否则会「三项同时高亮」；
- 同级多命中取**最长路径**（`/cn/news/<slug>` → 高亮 `/cn/news`），并把该长度上所有匹配项一起标注
  （桌面导航与移动抽屉各一份）。

**实测（真实路径：本地干净 URL 服务 + 无头 Chrome 读回 DOM，12 条路径）**：

| 路径 | 高亮项 | 结果 |
|---|---|---|
| `/` | （无） | ✓ 首页无对应导航项 |
| `/about` `/odm` `/oem` `/news` `/lighting` | 对应项 | ✓ |
| `/lighting?scene=outdoor` | **通用照明（仅栏目，不含 3 个筛选子项）** | ✓ |
| `/cn` | （无） | ✓ |
| `/cn/about` `/cn/odm` `/cn/news` `/cn/lighting` | 对应中文项 | ✓ |

#### ③ 待确认：自动化产线配图（本轮未改动）

客户要求「从源站抓取 **wafer 自动化生产线** 替换」。**核查结果：源站不存在 "wafer" 这一标识** ——
已逐项查过源站全部页面 HTML 文本、全部 **91 张** 图片的文件名与 `alt`、以及 `sitemap.xml`（404）。
故本轮**未改动**，待客户指认具体是哪一张（对照图与候选见交付记录）。

---

## [v0.21.0] - 2026-10-10

### 🎠 首页「精选产品」改为按客户指定型号轮播

**用户指令**：精选产品区从**通用照明**产品中选 **18 个型号**
（CDX2 CDX3 CDX5 CDX8 CDX11 RDX3 RDX5 FMX6 FMX9 FMX11 FMX15 WPX2 BPX3 BPX9 GBX2 VNTX2 WRPX3 CLDX3）轮询播放。

| 层 | 改动 |
|---|---|
| `index.html` / `cn/index.html` | 该区容器 `data-products="limit:3"` → `data-featured="codes:…;limit:3;interval:6000"` |
| `js/site.js` | 新增 `mountFeatured()`：按型号前缀筛选 + 窗口轮换；`autoMount` 挂载 `[data-featured]` |

**实测命中 20 个产品**（18 个型号全覆盖）：**CDX2 与 FMX11 各命中 2 个产品**
（`cdx2-mesh-ble` + `cdx2-commercial-downlight`；`fmx11-pro-surface` + `fmx11-regress-surface`）。
展示顺序**严格按客户给的型号顺序**，每屏 3 个 → 共 7 屏；**20 张封面图线上均 200**。

**四条硬约束（均已实测）**：
1. **前缀匹配必须防误命中** —— 要求型号后一位**不是 `A-Z0-9`**，否则 `CDX1` 会吃掉 `CDX11`。
   ⚠️ 边界判定**不能**用"是否字母数字"这种模糊说法：Python 里 `"系".isalnum()` 为 True，
   而 JS 的 `/[A-Z0-9]/` 对汉字为 false —— 站点统一用后者。
2. 🔴 **默认就轮换，绝不把"启动"依赖在 `IntersectionObserver` 上** —— IO 在无头渲染等环境下
   **可能不触发**，那样会变成"代码看着写好了却永远不转"。IO 只承担"滚出视口时暂停"，不承担启动。
   （本条是**开发中实测踩到**：首版把启动挂在 IO 上，无头下恒定不动。）
3. **`prefers-reduced-motion` 下不轮换** —— 实测恒为首屏 3 张。
4. **渐进增强**：取数失败 / 一个都没匹配上 → **不清空**容器，静态兜底继续可用。

**校验手法**：本地起「静态服务 + `/api` 反代到线上」联调（该 API 无 CORS 头，`file://` 无法直联），
再用注入探针采样轮换序列 —— 实测 `[CDX2×2, CDX3]` → `[CDX5, CDX8, CDX11]`，顺序正确、间隔 6s。

---

## [v0.20.2] - 2026-10-10

### ➕ OEM 页「产线构成」补第 6 格：十万级洁净车间

**用户指令**：OEM 页产线构成的红✓处（第 6 格留白）补上内容。

#### 先查清了「第 6 格到底该放什么」

`grid-3` 放 5 张卡会留一个空洞 —— 但**不是漏了内容**：

- 老站 FACILITIES-MANUFACTURING 的**原始图注清单恰好是 5 项**：
  `SMT / WAVE-SOLDERING / ASSEMBLY / PLASTIC INJECTION / STAMPING`
  → 新站现有 5 张卡与之**一一对应**，无遗漏
- 而同一份清单里还有一项**没做成卡片**：**`Class 100,000 clean room`**
  → 这就是第 6 格应有的内容（用户确认采用）

#### 为什么用占位而不是配图

**老站没有洁净车间的照片** —— `Class 100,000 clean room` 在那份清单里是**纯文字条目**。
按本项目「图注必须与照片实际内容一致」的纪律，**不能拿别的照片凑**。

> ⚠️ 排查中还发现一个**文件名骗人**的坑：`assets/img/scene-cleanroom.jpg`
> 名字叫洁净车间，**实际拍的是两台环境试验箱**（恒温恒湿 / 冷热冲击箱）。
> 差点按文件名直接引用 —— 正是「不得用文字清单推断照片内容」这条纪律要防的事。

故本版按项目既有约定（`product-card__media--empty` 的「素材待补充」）
做了**斜纹占位卡**：`media-card--empty` + `media-card__pending`。

#### 改动

| 文件 | 内容 |
|---|---|
| `oem.html` | 新增第 6 张卡：title `Class 100,000 clean room`，占位标记 `Photo pending` |
| `cn/oem.html` | 同上：title `十万级洁净车间`，副行保留英文原名 `Class 100,000 clean room` |
| `styles.css` | 新增 `.media-card--empty`（16/9 斜纹占位）与 `.media-card__pending` |

#### 验证

- 无头 Chrome 本地渲染，**逐像素测量第二排三张卡的上下边界**：
  y≈894→1126 **完全齐平** → `align-items:stretch` 与 `aspect-ratio` 无冲突，六格等高
- `oem.html` / `cn/oem.html` 各 33 个引用：**零失效**
- 行尾全部 LF

#### 待办（需客户提供）

**补一张十万级洁净车间的实拍照片**，到位后把占位替换为真图即可
（替换时仍须目视核对照片内容确实是洁净车间）。

---

## [v0.20.1] - 2026-10-10

### 📝 补记 v0.20.0：悬浮 / 聚焦暂停（该版唯一未记录的内容）

v0.20.0 的条目本身 + 其补记（`41e759f`）**已覆盖**「左卡 3 图轮播」与
「右卡 6 图轮播（间隔 3s）」；**唯一未记录的是「悬浮 / 聚焦暂停」** ——
本版补记，使 CHANGELOG 与已发布代码一致。

| 项 | v0.20.0 已发布内容 | 记录情况 |
|---|---|---|
| 左卡 3 图轮播 | `ems-smt` → `ems-plant` → `ems-assembly` | ✅ v0.20.0 条目 |
| 右卡 6 图轮播（间隔 3s） | `cdx3` / `bpx9` / `ehbx6` / `3d-neon-strip` / `vntx2` / `fmx15` | ✅ 补记 `41e759f` |
| **悬浮 / 聚焦暂停** | `mouseenter` / `mouseleave` / `focusin` / `focusout` 暂停与恢复，<br>并用 `hovered` 标志位防止「悬浮期间切标签页再切回」把计时器重启 | ❌ **本版补记** |

**实测证据**（无头 Chrome + 真实 DOM 事件 + `MutationObserver` 计数）：

| JS 变体 | 悬浮期间 `is-active` 获得次数 | 悬浮暂停 | 松开后恢复 |
|---|---|---|---|
| 去掉悬浮监听（反面对照） | **2** | ❌ false | true |
| 当前版本（含悬浮暂停） | **0** | ✅ true | true |

反面对照**能失败** → 该断言不是假阳性。
⚠️ 第一版探针有测量缺陷：观察窗 900ms 恰好等于 3 个 300ms 周期，索引绕回原值造成假阳性
—— 已改用 `MutationObserver` 计数（留档，避免复用错误手法）。

---

## [v0.20.0] - 2026-10-10

### 🎠 首页「客户定制开发」卡片新增代表图轮播（3 图交叉淡入）

**用户指令**：把「电子实验室」这张图作为首页定制开发业务线的**轮播图之一**。
站内此前**没有任何轮播机制**（`js/*.js` 与 `styles.css` 中都没有 carousel / slider / 定时切换），本版新增。

| 层 | 改动 |
|---|---|
| `index.html` / `cn/index.html` | 该卡 `.biz-card__media` 由单图改为 3 图：`ems-smt` → `ems-plant`（电子实验室）→ `ems-assembly` |
| `styles.css` | 新增 `.biz-card__media--cycle`：多图绝对定位叠放 + 交叉淡入 |
| `js/app.js` | 新增第 8 节：容器 `[data-cycle]` 内多图轮换（间隔可配，默认 5000ms） |

**三条硬约束（均已实测，不是"应该可以"）**：
1. **渐进增强** —— 无 JS 时由 HTML 里首图的 `.is-active` 兜底显示第一张，不会出现"必须 JS 才看得见"。
2. **遵循 `prefers-reduced-motion`** —— 该偏好下**不自动切换**，只静态显示首图。
   实测：正常模式采样 `ems-smt → ems-plant → ems-assembly`；减少动效模式恒为 `ems-smt`。
3. **标签页切走即暂停计时器**（`visibilitychange`），不在看不见的地方空转。

**校验**：容器实测 `327×204`、`ratio=1.600`（正好 16:10，未被绝对定位破坏）；
3 张图 `naturalWidth` 均 1400（确认真的加载了）；标签配对 OK；`node --check js/app.js` 通过；
中英两版渲染截图均核对。

> ⚠️ 版本位说明：本版含**新增功能**（新 CSS + 新 JS），按本文件顶部的定级规则走 **MINOR**，
> 区别于 v0.19.x 系列的纯文案/配图修改（PATCH）。

> 📌 **补记：同版还包含第二张卡片的轮播** —— `自研标准灯具` 卡在本版中同样改为轮播
> （6 张产品图：CDX3 / BPX9 / EHBX6 / 3D Neon Strip / VNTX2 / FMX15，间隔 3s）。
> 该改动由**并行会话**在同一工作副本中完成，复用了本版新增的
> `.biz-card__media--cycle` 与 `data-cycle` 机制；提交时与卡片 1 一并入库，
> 故在此补记 —— 避免版本记录与实际内容不符。

---

## [v0.19.9] - 2026-10-10

### 🧹 HTML 注释中性化 —— 去掉「原官网 / 老站」表述（承接 v0.19.5）

v0.19.5 清掉了**访客可见**的迁移类表述；本版处理**页面源码注释**里的同类表述。
注释访客看不到，但**查看页面源码 / 公开仓库**都能读到，同样会暴露
"本站内容另有来源"。

#### 做法：词组级替换，**保留维护价值**

只把"另一个站"的说法换掉，**维护纪律本身一字不删**——
例如「本页事实性内容全部来自原官网 www.wx-seastar.com 的 FACILITIES 页」
→「本页事实性内容全部来自**公司已公开的设施资料**」，纪律仍成立。

| 原文（注释内） | 改后 |
|---|---|
| 原官网 www.wx-seastar.com 的 FACILITIES 页 | 公司已公开的设施资料 |
| 原官网工厂设施页 | 工厂设施资料 |
| 原官网口径为… | 既有口径为… |
| （数据源 www.wx-seastar.com） | （数据源：产品库） |
| 来源：www.wx-seastar.com 的产品线 | 来源：业务线数据 |
| 原官网原文 / 原官网未提供… | 原文 / 暂无可用的产品图… |
| 【不得添加】原官网没有的认证… | 【不得添加】无出处的认证… |
| 图注必须与老站原图注一一对应 | 图注必须与既有图注一一对应 |
| （老站 6 个英文标签）/ 老站标 X | （既有 6 个英文标签）/ 既有标签 X |
| 出自老站 FACILITIES-MANUFACTURING 清单 | 出自已公开的 FACILITIES-MANUFACTURING 清单 |
| 依用户质疑重修 | 已复核修订 |
| 原官网 www.wx-seastar.com 用的是 Google Maps… | 既有页面的地图方案（Google Maps）… |

合计 **38 处、12 个文件**（中英各 6 页：contact / facilities / index / lighting / odm / oem）。

#### 关键验证：**可见内容一字未变**

把 12 个文件的**可见文本**（剥掉注释与标签后归一化）与**线上现行版本**逐字节比对：

```
✓ contact / facilities / index / lighting / odm / oem            （英）
✓ cn/contact / cn/facilities / cn/index / cn/lighting / cn/odm / cn/oem（中）
→ 12/12 完全一致，字号逐页相同
```

即本版**只改注释，页面表现零变化**。

#### 验证汇总

- 78 页 / **2326 个引用：零失效**
- **注释内**残留 原官网/老站/迁移/归档/wx-seastar.com：**0 处**
- **可见文本**迁移类字样：**0 处**（v0.19.5 已清）
- 行尾全部 LF

> ⚠️ 说明：本仓库为**公开仓库**，注释会被发布到 GitHub 源码。
> 本次改动同时消除了"页面源码"与"仓库源码"两处的该表述。

---

---

## [v0.19.8] - 2026-10-10

### 🖼 首页「两条业务线」代表图更换（客户指出图文不符）

**起因**：客户指出首页 `01 / Portfolio`（两条业务线）的配图与业务内容不匹配。

**目视核对确认（全站 27 张场景图 + 89 张产品图逐类筛查）**：

| 业务线 | 原图 | 问题 |
|---|---|---|
| 客户定制开发（→ `/odm`） | `scene-line.jpg` | 画的是**冲压产线**（SEYI 冲床 + 送料机械臂）—— 属金属结构件制造，答不了「ODM 驱动与控制板开发」这个题 |
| 自研标准灯具（→ `/lighting`） | `scene-test-rack.jpg` | 画的是**老化测试架** —— 属「测试」环节，不是「产品」 |

**更换为**：

| 业务线 | 新图 | 理由 |
|---|---|---|
| 客户定制开发 | **`ems-smt.jpg`** | SMT 电子制造车间（贴片设备、料盘、防静电地面）—— 一眼就是「电子」，覆盖该线的 ODM 驱动/控制板与 OEM 电子制造 |
| 自研标准灯具 | **`scene-exhibition.jpg`** | 品牌展位实拍，展墙陈列标准灯具产品系列 —— 属于「产品」；且是**全站此前未被使用**的素材 |

**筛选方法（可复用）**：
先用「**白底占比**」客观排序 89 张产品图 —— 白底占比低的才是实景/带场景的图
（`drv-*.jpg` 驱动板仅 13~18%，而 `cdx3` 等目录图高达 73%+）；
再对候选按卡片**真实 16:10 裁切**（`.biz-card__media` 是 `aspect-ratio:16/10` + `object-fit:cover`）
出图逐张目视，避免「看着合适、裁完难看」。

**两处未采纳初步建议，理由如下（备选对照图已产出）**：

- **CDX3 产品图（建议用于标准灯具）**：方向正确（该线要「产品」而非「测试」），但这张图有三个硬伤：
  ① **白底** —— 16:10 只裁出整块白，与卡片浅色底融在一起；
  ② **仅 600×488 px** —— 卡片宽约 600 CSS px，视网膜屏会发虚；
  ③ 画面带**认证徽标行**（ETL / FC / RoHS / Energy Star / JA8 / 90CRI），观感是「电商详情图」而非「业务线代表图」。
  → 若要上产品图，建议另找**更大尺寸、带应用场景**的产品照，或加一个 `object-fit:contain` 的样式变体。
- **`drv-tri-mode.jpg` 等驱动板照片**：内容**最贴题**（就是该线的交付物本身），
  但画面是**带飞线的工程样机 + 绿垫背景**，观感偏「实验室」，不宜作首页门面。

**验证**：中英两页各 2 处图片引用文件均存在；CRLF 0。

---

## [v0.19.7] - 2026-10-10

### 🖼️ 「电子实验室」配图自 OEM 页移至 ODM 页

**用户指令**：该图应放到 ODM 页，并从 OEM 页删除。

| 页 | 改动 |
|---|---|
| `oem.html` / `cn/oem.html` | 删除 `ems-plant.jpg` 图卡（制造图网格 6 → **5** 张） |
| `odm.html` / `cn/odm.html` | 新增区块 **`02 / Engineering` · Electronics laboratory**，含该图与图注 |

- 图注**原样随图迁移**（客户裁定文案，未改动一字）：
  `Electronics laboratory / 电子实验室` ＋
  `ESD-protected workstations and test instruments for electronic design, debugging and inspection.`
  ／`防静电工位与测试仪器，承担电子组件的设计调试与检测。`
- **配图纪律随图迁移**：OEM 页头那段「该照片是**防静电工位区**、**不是十万级洁净车间**」
  的判据已移到 ODM 页头（`Class 100,000 clean room` 这一**事实仍有效**，由 OEM 页文字与数据块承载）；
  OEM 页头保留一条「该图已移至 ODM 页」的指向说明，避免后续误读。
- 版式：区块标题与图**同左轴**（`max-width:900px` 左对齐，与站内 editorial 版式一致）。
- 校验：4 个文件 `div/section/article/main` 标签配对**全部 OK**；
  `ems-plant.jpg` 现仅出现于 `odm.html` / `cn/odm.html`；已出渲染截图逐页核对。

---

## [v0.19.6] - 2026-10-10

### ✏️ OEM 页「电子实验室」小字按客户指定加入「设计调试」

客户指定中文小字为：「防静电工位与测试仪器，承担电子组件的**设计调试**与检测。」

| 侧 | 旧 | 新 |
|---|---|---|
| 中文 | …承担电子组件的**装配**与检测。 | …承担电子组件的**设计调试**与检测。 |
| 英文 | …for electronic **assembly** and inspection. | …for electronic **design, debugging** and inspection. |

**出处核对**：

- 「**设计**」**有出处** —— 老站 FACILITIES-RD 段写明该团队覆盖
  `driver (both hardware and software), structure, optics, and packaging` 的**设计**；
- 「**调试**」属**客户对现场用途的说明**，与画面中的测试仪器、在制板件相符，
  **不是照片直接可证之物** —— 按客户口径采纳并在此如实标注来源。

**同步**：两页文件头「配图纪律」注释里对该照片的描述，
由「电子装配 / 检测车间」改为「电子设计调试 / 装配 / 检测工位区」，
避免注释与新图注互相矛盾。

**验证**：两页卡片图注就位；`Class 100,000` 文字事实未受影响；CRLF 0。

---

## [v0.19.5] - 2026-10-10

### 🧹 全站清除「迁移 / 归档 / 原官网」类内部表述（访客可见处）

**用户指令**：网站中这种"历史记录迁移"的字样不要出现。

这些句子本是**内部的溯源说明**（"内容有出处、不是编的"），但对访客而言等于
**向客户暴露"这站是从别处搬来的"**，且多处在讲"我们的官网如何如何"——
站在自家官网上说这句本身就不成立。故一律删除或改写。

#### 改动清单（英文 11 处 + 中文 11 处）

| 页面 | 原文（节选） | 处置 |
|---|---|---|
| `/news` `/cn/news` | "migrated in full from the SEA☆STAR official website archive" / "自 SEA☆STAR 原官网归档完整迁移" | **删除该半句**，保留"最新在前、最早在后" |
| `/news` `/cn/news`（meta + og） | 同上表述 | 同步删除 |
| `/news/<slug>` × 7（中） | "本篇为图片报道，**原官网发布时**未附正文。" | → "本篇为图片报道，未附文字说明。" |
| `/news/<slug>` × 7（英） | "the original posting carried no body text" | → "no body text was provided" |
| `/` `/cn/` | "Product names and documents come from the SEA☆STAR official website." / "产品名称与资料来自 SEA☆STAR 实益达官网。" | **删除整句** |
| `/` `/cn/` | "According to the FACILITIES page of the SEA☆STAR official website, Wuxi Seastar operates…" | → 直接陈述 "Wuxi Seastar operates…" |
| `/` `/cn/` | "Laboratory section names and management-system certifications come from…" | 删除前半句 |
| `/lighting` `/cn/lighting` | "The product lines below come from…" / "以下产品线来自…" | 删除整句 |
| `/lighting` `/cn/lighting` | 认证信息"来自…官网（www.wx-seastar.com）的工厂设施页与首页" | 删除，仅留"认证要求因目标市场而异" |
| `/odm` `/cn/odm` | "comes from the 「DRIVER AND CONTROL BOARD」section of…" | 删除，直接讲定制驱动与控制板 |
| `/oem` `/cn/oem` | "capability data…from publicly available factory information on…" | 删除整句 |
| `/facilities` `/cn/facilities` | "facility data on this page is taken from…" / "本页设施数据取自…原官网公开信息。" | 删除整句 |
| `/grow-light` `/cn/grow-light` | "Our official website (**www.wx-seastar.com**) currently publishes…" | 改写为"我们目前的产品线为…，植物照明的目录仍在整理中"——**同时去掉了旧域名引用** |

#### 同步项

- **`deploy/build-news.py` 一并修改**（6 处）—— 新闻页由它生成，
  只改页面不改生成器，下次重新生成会把字样写回来
- 重新生成 58 个新闻页，已确认新文案生效

#### 未改动（说明）

- `cn/news/…` 里的「**搬迁**」是**真实新闻内容**（2023 年马来西亚工厂搬迁庆典），
  **与迁移无关，保留**
- `news/guided-by-light…` 结尾 "please stay tuned to our official website" 是
  **原新闻正文的译文**，在当前站点语境下依然成立（新站就是官网），保留
- **HTML 注释**里的维护说明（"内容纪律"等）**访客不可见**，本次未动；
  如需连注释一并中性化，可另开一版（注意：仓库为公开仓库，注释在源码中本就可见）

#### 验证

- 78 个前台页面 / **2326 个引用：零失效**
- 全站「访客可见」的 迁移/归档/原官网/migrat/archiv/official website 字样：**残留 0 处**（上述保留项除外）
- 行尾全部 LF

---

---

## [v0.19.4] - 2026-10-10

### 📐 导航 Logo 尺寸对齐源站（34px → 40px）

**用户指令**：左上角 SEA☆STAR Logo 改成与源站 `www.wx-seastar.com` 一样大。

**源站判据（实测）**：源站 CSS 规则 `#logo img{ max-height:40px }`，
源图 `resources.jsmo.xin/.../1550989099833.png` 自然尺寸 **335×89**
→ 实际渲染 **40px 高 × 151px 宽**（本站导航原为 34px 高 × 128px 宽）。

| | 源站 | 本站改前 | 本站改后 |
|---|---|---|---|
| 渲染高 | 40px | 34px | **40px** |
| 渲染宽 | 151px | 128px | **151px** |

- ⚠️ **窄屏回落**：实测 40px 时导航内容需 **405px** 宽，≤420px 会横向溢出
  （375px 屏溢出 30px）。故 `≤420px` 回落 28px。源站导航没有 CTA 按钮故能全断点 40px，本站有。
- 校验：`getBoundingClientRect()` = **151×40 csspx**（1440/375/360 一致）；
  多档视口 360/375/414/420/430/500/640 复测**均无横向溢出**。
- 说明：`<img width height>` 属性仍为 128×34，**未改动** —— 与页脚 logo 同样沿现状
  （实际尺寸由 CSS 决定；142 个文件改动量与该属性零实际影响不成比例）。

> 📌 **版本追溯**：本次改动曾因**另一并发 AI 会话正在占用版本号**，先以**无版本号**提交
> （`8c44316`）；本条目发布时补记版本号为 **v0.19.4**（0.19.0~0.19.3 已被先占）。
> 两个会话共用同一工作副本，版本号须以远端 `VERSION` 为准、动手前先读。

---

## [v0.19.3] - 2026-10-10

### 🖼 OEM 页 `ems-plant.jpg` 图注更正为「电子实验室」（客户裁定）

**起因**：客户指出该图图注（十万级洁净车间 / `Class 100,000 clean room`）与照片内容不符。

**目视核对确认客户判断成立**：照片实为**防静电工作台 + 测试仪器**构成的电子装配 / 检测车间 ——
画面可见防静电垫、焊接工位、测试仪器、周转箱与在制板件，而且还有**纸箱、布艺座椅、绿植**，
洁净室不可能长这样。

| 侧 | 旧 | 新 |
|---|---|---|
| 中文 | 十万级洁净车间 ／「Class 100,000 洁净环境，保障制程稳定性。」 | **电子实验室** ／「防静电工位与测试仪器，承担电子组件的装配与检测。」 |
| 英文 | Class 100,000 clean room ／「Class 100,000 clean environment ensuring process stability.」 | **Electronics laboratory** ／「ESD-protected workstations and test instruments for electronic assembly and inspection.」 |

小字描述由客户授权**自拟** —— 措辞严格限于照片中可见之物，
**不含任何未见于照片的设备型号、认证或产能数字**。

🔴 **`Class 100,000 clean room` / 十万级洁净车间这个事实仍然有效**（出自老站
FACILITIES-MANUFACTURING 清单），只是**不占这张照片**。它继续由以下位置承载：
`meta` / `og:description`、oem 页的 `Class 100,000 / Clean room` 数据块、
`about.html` 里程碑、`facilities.html` 的生产能力段。

**同页新增「配图纪律」注释块**（中英各一）：写明该图为客户指定、原图注错在哪、
「Class 100,000 事实仍然有效」，以及 —— **不得用"文字清单"去推断某张照片拍的是什么**。

**验证**：两页卡片图注就位；`ems-plant.jpg` 的 `alt` 同步；保留项（meta / og / 数据块 / 里程碑）
未受影响；CRLF 0。

---

## [v0.19.2] - 2026-10-10

### 🏷 实验室名称全站改为「CSA 集团授权实验室」+ 英文术语改用 HI-POT TEST

**需求（客户三点裁定）**：

1. `EMS` = **电磁抗扰度**，中文站保持 `EMS` 不另译 → **无需改动**；
2. 英文 `dielectric withstand test` → 业内简称 **`HI-POT TEST`**；
3. 实验室名称**以实体门牌为准** —— 门牌原文「CSA集团授权实验室 / CSA AUTHORIZED
   TESTING LABORATORY」，故用**授权（Authorized）**，不是老站旧标签的「见证 / 目击（Witness）」。

🔴 **第 3 点是全站术语变更，不是改一处图注。** 只改设施页会造成首页写 `Witness`、
设施页写 `Authorized`，站内自相矛盾。故 **8 个页面同步替换，共 31 处**。

| 侧 | 旧 | 新 |
|---|---|---|
| 英文 | `CSA Witness Lab` | **`CSA Authorized Testing Laboratory`** |
| 英文（概述句） | `a CSA-witnessed testing laboratory` | **`a CSA Authorized Testing Laboratory`** |
| 中文 | `CSA 目击实验室` | **`CSA 集团授权实验室`** |
| 英文图注（第 5 张） | `EMS and dielectric withstand test` | **`EMS and HI-POT TEST`** |

**替换范围（31 处 / 8 文件）**：

| 文件 | 处数 | 落点 |
|---|---|---|
| `facilities.html` | 9 | meta / og / 概述段 / 章节注释 / `<h2>` / 导语段 / 卡片 `<h3>` / 内容纪律注释 / 第 5 张图注 |
| `cn/facilities.html` | 9 | 同上（中文侧）+ 导语段内的英文括注 |
| `index.html` | 3 | badge / `<h2>` / 正文段 |
| `cn/index.html` | 3 | badge / `<h2>` / 正文段（含内嵌英文名） |
| `about.html` | 3 | meta / og / `spec-box` |
| `cn/about.html` | 1 | `spec-box` |
| `oem.html` | 1 | 内容纪律注释 |
| `cn/oem.html` | 1 | 内容纪律注释 |

**刻意保留**：两页文件头「配图纪律」对照表里的**大写**旧标签 `CSA WITNESS LAB` ——
那是对**老站原始标签**的引用，属史料，不能抹掉。同时把「有意偏离」说明由第 2、5 项
扩为**第 1、2、5 项**，并写明第 1 项的理由（门牌口径）与「后续审计不得当作回归缺陷」。

**验证**：全站 `CSA Witness Lab` / `目击实验室` / `dielectric withstand` 残留**均为 0**；
大写 `CSA WITNESS LAB` 保留 2 处（仅注释对照表）；8 个改动文件 CRLF **0**。

---

## [v0.19.1] - 2026-10-10

### 🔀 首页「两条业务线」按「业务模式」重构 + 首页口径同步（中英共 6 处）

**用户指令**：两条业务线由「LED 照明灯具 / 驱动控制板」（按**产品类型**分）
改为「**客户定制开发**」与「**自研标准灯具**」（按**业务模式**分）。
客户明确：**客户定制开发 = ODM + OEM 全含**。

| 位置 | 旧 | 新 |
|---|---|---|
| 业务线区块标题 | Two product lines | **Two business lines** |
| 左卡 | ODM Design / Driver and Control Board | **Custom Development / 客户定制开发** |
| 右卡 | General Lighting / 通用照明灯具 | **Standard Lighting / 自研标准灯具** |
| 首页 Hero 正文 | …LED luminaires and driver & control boards | …**two business lines: custom development … standard lighting** |
| 首页 meta / og 描述 | general lighting / ODM / OEM 三分法 | **custom development (ODM/OEM) + in-house standard lighting** |
| 首页 CTA | ODM custom development / 通用照明选型 | **custom development / 自研标准灯具选型** |

- 卡片链接**未变**：客户定制开发 → `/odm`；自研标准灯具 → `/lighting`。
- 驱动/控制板型号清单与 OEM 能力表述**均有出处**（原官网 / `/odm` / `/oem`），未新增任何未溯源参数。
- 植物照明（`/grow-light`）**未并入**「自研标准灯具」，待业主确认。
- 导航栏与页脚仍为 General Lighting / ODM / OEM（用户选定：本次不改，影响约 70 个前台页）。

> ⚠️ **版本追溯说明（如实记录）**：本重构的**卡片代码**已随 **v0.19.0**
> （提交 `a5d5520`，因该次用 `git add -A` 提交而被一并卷入）先行入库，
> 但 v0.19.0 的 CHANGELOG **未记录**此事。本条目补齐记录，
> 并完成 Hero / meta / CTA 三处（中英共 6 处）口径同步 ——
> **同一逻辑变更分两次入库，特此说明。**

---

## [v0.19.0] - 2026-10-10

### 🔍 第二轮核查：补齐 4 类内容缺口 + 2 处细节

依 `output/oldsite-full/迁移缺口补充核查.md` 落实。方法：把老站 193 页**每一行正文**
归一化后去新站全量语料找最长公共子串，去噪后逐条人工定性。

> ⚠️ **先修了校验工具自身的一个缺陷**：上轮归一化把 HTML 标签**整体剥除**，
> 导致**只存在于 `alt=` 属性里的图注查不到**，误报 5 个设施图注缺失
> （实际都在 `facilities.html`）。**校验"文本是否存在"时不能把标签连同属性一起丢。**

#### 1. `/contact` 补集团办公地 + 品牌微信公众号

老站 CONTACT 页列有**三个法人主体**，新站此前只有无锡总部。

| 主体 | 补入内容 |
|---|---|
| **Shenzhen Sea Star Technologies Co., Ltd.** | 地址（深圳龙岗宝龙工业城金隆路 6 号 Halcyon Office 4F）· 邮编 518000 · 电话 0755-89366668 · **Stock Code 002137 (SZ)** |
| **Hongkong Seastar Lighting Co., Ltd.** | 地址（中国香港湾仔洛克道 301-307 号洛克中心 19C 室） |
| **品牌微信公众号** | 二维码图片（`assets/img/wechat-qr.jpg`），已核验为真实可用的品牌码 |

- 新增「Group Offices / 集团办公地」区块，EN + CN 各一
- ⚠️ **未照搬老站给中国香港办公室写的邮编 `214028`** —— 该值与无锡/深圳均不符，
  疑为老站复制错误，**无可核对来源故不写**，已报业主确认
- 中国香港一份按规范写作 `Hong Kong, China` / `中国香港`

#### 2. `/about` 补 4 条集团事实

| 补入事实 | 位置 |
|---|---|
| 集团 **over 10 subsidiaries / 数千名员工** | 导语段 |
| 集团布点 **北京、上海、深圳、无锡及马来西亚** | 导语段 |
| 马来西亚厂选址 **Iskandar, Johor Bahru** | 2021 里程碑 |
| 马来西亚厂 **workforce of over 80** | 2021 里程碑 |

> 核查时一度把 `national high-tech enterprise`（国家高新技术企业）与
> `Shenzhen Sea Star Technology` 也报为缺失，**复核后确认二者本就在页面上**，
> 属我的短语匹配误判，未作改动。

#### 3. 新闻列表摘要文案 11 条

老站新闻列表是**「短标题 + 摘要」两行**，新站只有封面 + 日期 + 标题。已补齐 11 条：

- `deploy/news-data.json` 增加 `summary` 字段（英文原文照抄）
- `deploy/cn-translations.json` 增加对应中文译文
- `build-news.py` 在**列表卡**与**详情页导语**两处渲染；`styles.css` 新增
  `.news-card__summary` 与 `.lead-quote`

#### 4. 产品原文摘要（唯一一个有文字的产品）

老站 83 个 LED 产品页里 **82 个连一个字都没有**（规格全在图里，已由规格 PDF 承载）。
**只有 `smd-strip` 有正文**，已逐字补入产品库 `summary_en` / `summary_zh`：

```
SMD2835 high quality LED. / Double side PCB. / Various specifications and series optional.
```

- `seed-products.js` 增加 `SUMMARIES` 白名单表，**只允许列出的极少数产品带摘要**，
  并在注释里写明"没有出处就是编造"

#### 5. 认证版本年份

老站首页写 `ISO9001:2015　ISO14001:2015　IATF 16949:2016`，新站此前只有标准号。
已在 `/about` 的「体系认证」补齐版本年。

#### 6. 未作改动

`PLASTIC INJECTION` / `WAVE-SOLDERING` 图注，新站作 `Injection moulding` / `Wave soldering`，
**语义一致、属措辞差异**，按设计需要保留。

---

---

## [v0.18.1] - 2026-10-10

### ✏️ facilities 第 2 张图注按客户指定改为「光电测试」

> 🔴 **版本号更正说明**：本条目最初被误编号为 `v0.17.6`，并把 `VERSION` 从 **0.18.0**
> **回落写成 0.17.6** —— 因为该改动提交时未察觉 `v0.18.0` 已在先推送。
> 现更正为 **v0.18.1**，`VERSION` 恢复为 0.18.1。误建的 `v0.17.6` 标签已删除。
> 提交内容本身无误，仅版本号与顺序有误。

**需求**：客户指定该项中文图注用「光电测试」。

| 侧 | 旧 | 新 |
|---|---|---|
| 中文 | 光源分析测试 | **光电测试** |
| 英文 | Light source analysis test | **Photometric and electrical test** |

**理由**：该照片是两间**积分球**测试台 —— 同时做光度与电参数测量
（墙上贴 ANSI C78.377-2017 色温要求图表）；老站标签 `LIGHT SOURCE ANALYSIS TEST`
只覆盖了"光源"这一半。属**客户指定的有意偏离**。

**改动**：

| 文件 | 变更 |
|---|---|
| `facilities.html` / `cn/facilities.html` | 各 2 处：卡片 `<h3>` + `alt` |
| 两页文件头配图对照表 | 偏离说明由「第 5 项」扩为「**第 2、5 项**」，并统一移到表末，标注「**后续审计不得当作回归缺陷**」 |

**验证**：两页 6 张图注就位；`光源分析` / `Light source analysis` 残留均 **0**；CRLF 0。

---

## [v0.18.0] - 2026-10-10

### 🔍 依核查报告补齐 3 处迁移缺口 + 修正 1 处编造性数字

**需求**：全面核查老站内容是否已复制到新站并校验准确性。
核查报告见 `output/oldsite-full/迁移完整性核查报告.md`；本版落实报告中的待办。

#### 1. 补齐 4 篇缺失新闻（24 → 28 篇）

老站新闻实为 **28 篇**，此前只搬了 24 篇 —— 缺的 4 篇在**老站新闻列表第 2 页**：

| post | 日期 | 标题 |
|---|---|---|
| 114524 | 2019-02-24 | You're Invited! |
| 114523 | 2019-02-14 | Good-luck of beginning！ |
| 114520 | 2019-01-16 | Annual party！ |
| 114510 | 2018-10-18 | Brainstorming Meeting. |

- 新增页面 8 个（EN + CN 各 4），新闻板块共 **58 页**（28×2 + 2 列表）
- 配图 9 张（含封面与缩略图）
- 中文译文 4 篇；其中 3 篇老站原文即无正文（纯图片），`paras` 如实为空

#### 2. Highlight 里程碑按原文重建（6 条 → 15 条）

`about` 的里程碑此前是 **6 条改写版**，现按老站 Highlight 页**逐条重建为 15 条**（1998 → Future）。

补齐的关键事实（此前新站全无）：

- 更名 **Mindata Group（麦达数字集团）**，原 EMS 业务剥离
- 挂牌**新三板，代码 839575**
- 深圳实益达智能技术子公司成立（人工智能家居物联网）
- 向北美出口 **1000 万只 LED 筒灯**
- 无锡设 **Class 100,000 洁净车间**、无锡迁新厂（面积扩大 1.5 倍）
- 马来西亚设自有工厂

⚠️ **两处如实处理，未擅自补全**：

- 老站 2015 条原文**本身断尾**（断在 "…transferred to Shenzhen Sea Sta"），
  只保留完整句，**断尾弃掉，不替它编完**。
- 2023 条马来西亚面积老站写 **10,000 m²**，而老站 About Us 页写 **12,000 m²** ——
  **老站自相矛盾**。本页按 Highlight 原文取 10,000 m²，**冲突已报业主核实**。

#### 3. TEAM / PARTNER 并入 `about`

- 新增「03 / Teams &amp; Partners」区块：PARTNER 的 slogan 作主标题，
  TEAM 的 4 个团队（LED / Automotive Electronics / E-Bike / EMS）作标签
- ⚠️ 老站 Team 页混有**建站模板占位废话**（"对产品进行行为设计和界面设计…"），
  **已剔除，未照搬**
- 老站 TEAM 的 4 个子页本身为空壳（无文字无图），故只迁移团队名
- 后续区块编号顺延（工厂 03→04，联系我们 04→05）

#### 4. 🔴 修正 `about` 统计数字（原数字全部无出处或与老站矛盾）

核查发现「What We Believe」的 4 张统计卡**全部有问题**：

| 原值 | 老站原文 | 处置 |
|---|---|---|
| `48` R&D engineers | over **45** engineers | → **45+ Engineers** |
| `3` Optical labs | 实验室分 **six parts** | → **6 Lab testing areas** |
| `120` New products / year | 全站无 "per year" 口径 | → **600+ Employees**（老站：over 600 employees） |
| `360+` Employees | **over 600 employees** | → **1M PCS monthly capacity**（老站：1 million PCS） |

改后 4 个数字**全部可在老站找到出处**。

同时修正里程碑中两处年份：无锡实益达**照明**成立为 **2017**（原写 '16）、
马来西亚建厂为 **2021**（原写 '20）。

#### 5. 其他

- sitemap 68 → **76 条**
- 修正 `about` 中未转义的 `&`（`Factory & Capacity` → `&amp;`）
- 60 个页面 / 1854 个引用检查：**零失效**；无未定义 CSS 类

---

## [v0.17.5] - 2026-10-10

### 📝 更正 v0.17.4 条目中的计数笔误（6 处 → 7 处）

v0.17.4 的 CHANGELOG 与提交信息把替换处数写成 **6 处**，实测为 **7 处** ——
漏掉了**章节导语段落**那一处。本版更正 CHANGELOG 中的计数与枚举。

**页面代码本身无需改动** —— 当时 7 处已全部替换到位，线上内容是正确的。

- 判据：`grep -o "CSA 目击实验室" cn/facilities.html | wc -l` → **7**
  （行 44 / 51 / 112 / 200 / 205 / 207 / 215）
- 提交信息 `7516dd9` 中的「6 处」已推送、无法改写 —— 在此留档更正。

---

## [v0.17.4] - 2026-10-10

### ✏️ 中文侧术语统一：「CSA 见证实验室」→「CSA 目击实验室」

**需求**：客户指定中文译名用「目击实验室」。

| 范围 | 变更 |
|---|---|
| `cn/facilities.html` | **7 处**中文本语全部改为「CSA 目击实验室」—— meta description / og:description / 概述段 / 章节注释 / 章节导语段落 / `<h2>` / 卡片 `<h3>`（行 44 / 51 / 112 / 200 / 205 / 207 / 215） |
| 英文侧 | **不动** —— `CSA Witness Lab` 是该实验室的正确英文名称 |
| 其它页面 | **不动** —— `cn/news/*` 里的「见证」是**动词**用法（"共同见证了这一荣耀时刻"），与实验室术语无关 |

**为什么 7 处一起改**：只改截图里那一处的话，同一页会同时出现「见证实验室」与「目击实验室」两个译名。

**验证**：`cn/facilities.html` 内「见证实验室」残留 **0**；新闻页动词用法未受影响；CRLF 0。

> ⚠️ 本条目初版误记为「6 处」，已由 **v0.17.5** 更正。

---

## [v0.17.3] - 2026-10-10

### ✏️ facilities 第 5 张图注按客户指定改为「EMS 和耐压测试」

**需求**：客户（用户）指定该图图注改为 `EMS 和耐压测试`。
英文侧对应写作 `EMS and dielectric withstand test`。

**为什么这不是"又改错了"**：该照片实为**一整间测试区**，顶部标牌同时列出
雷击浪涌 / 频闪 / 安规综合 / 静电放电 / 振铃波 / LCR / 群脉冲等多项测试，
老站原标签 `LIGHTNING SURGE TEST` **只点了其中一个项目，过窄**。
本次是**有意的、客户确认过的偏离**，已在两页文件头注释中显式标注
「后续审计不得当作回归缺陷」。

**改动**：

| 文件 | 变更 |
|---|---|
| `facilities.html` | 卡 5 图注 `Lightning surge test` → `EMS and dielectric withstand test`；`alt` 同步 |
| `cn/facilities.html` | 卡 5 图注 `雷击浪涌测试` → `EMS 和耐压测试`；`alt` 同步 |
| 两页文件头注释 | 配图对照表标注该处为客户指定的有意偏离及其理由 |

**未变**：图注与老站标签的对应关系在**其余 5 张**上保持一一对应；副注仍为 0；CRLF 0。

---

## [v0.17.2] - 2026-10-10

### 🖼 修正 facilities 页配图图注 —— 曾与照片张冠李戴

**起因**：用户质疑「环境测试」的配图与图片内容不符，问依据是什么、源网站是否这样写。

**核查结论**：问题不是「图不对文」，而是**图注与照片张冠李戴**。
逐张打开老站原图目视核对后确认，老站该段 6 张图的真实图注是：

`CSA WITNESS LAB` · `LIGHT SOURCE ANALYSIS TEST` · `LIGHTNING SURGE TEST` ·
`QUIET ROOM AND EMI TEST` · `RELIABILITY ENVIRONMENT TEST` · `LONG LIFE AGING`

而本站曾把第 4 张（两台白色步入式箱体，老站注为 **QUIET ROOM AND EMI TEST**）
写成「环境测试 / 恒温恒湿试验箱与冷热冲击试验箱」；
第 5 张「电气性能测试」还**与第 1 张用了同一张照片**，
真正的雷击浪涌测试区实拍则**从未被使用**。

**根因**：把老站 RD 段的**整间实验室设备清单**（"It is equipped with … constant temperature
and humidity test chambers, thermal shock test chambers …"）当成了**单张照片的说明**。
🔴 **文字有出处 ≠ 该照片有出处** —— 绑定关系同样必须可溯源。

**改动**：

| 项目 | 变更 |
|---|---|
| 图注 | 6 张卡改为**与老站原图注一一对应**；删除全部照片无法自证的副注 |
| 用图 | 新增 `assets/img/scene-surge-test.jpg`（老站雷击浪涌测试区实拍，此前漏用） |
| 用图 | `scene-env-chamber.jpg` → 更名 `scene-quiet-room.jpg`（原文件名与内容不符） |
| 段落 | 设备清单回归其本位：CSA 段总述（照抄老站原文），不再充当图注 |
| 注释 | 两页文件头的配图说明改为**图 ↔ 老站图注**对照表，并写入配图纪律 |

**范围**：`facilities.html` 与 `cn/facilities.html` 同步；**未新增页面，无需改部署白名单**
（`assets` 目录本就在四处白名单内）。

**验证**：两页各 6 张图引用全部可解析；图注 6/6 与老站标签一致；副注残留 0；CRLF 0。

---

## [v0.17.1] - 2026-10-10

### 🧹 全站页脚移除 ICP 备案号

**需求**：英文站与中文站的页脚均不再展示 ICP 备案号。

| 项目 | 变更 |
|---|---|
| 英文前台 | 35 页（根目录 11 + `news/` 24）页脚删除备案号整行 |
| 中文前台 | 35 页（`/cn/` 11 + `cn/news/` 24）页脚删除备案号整行 |
| 生成脚本 | `deploy/build-news.py` 的页脚模板同步删除 2 行 |

**要点**：

- **不改生成脚本等于没改** —— 新闻页由 `deploy/build-news.py` 生成，其页脚模板里内嵌着备案号，
  重跑脚本会把号写回 48 个页面，故一并删除。
- 合计 **70 个前台页面**，每页恰好 **-1 行、0 增行**；页脚结构不变。
- `.cc-backup/`、`.flip-nav/` 备份目录与 `output/` 产物副本未动；
  `COMPANY-INFO.md` 中的备案记录属事实档案，保留。

**验证**：

- 全站 `ICP Filing No` / `苏ICP备` / `beian.miit` 残留：**0**
- 70 页 `footer__bottom` 直接子元素**全部恰好 3 个**（span / span / button），div 嵌套收支平衡
- 全部改动文件 **CRLF = 0**

---

## [v0.17.0] - 2026-10-10

### 📰 新增新闻板块（News）—— 24 篇全文迁移

**需求**：老官网（`www.wx-seastar.com`）内容搬迁，IA 方案 A 的第二个独立栏目，
且明确要求**全文搬**。

| 项目 | 变更 |
|---|---|
| 新增页面 | `/news` 列表 + `/news/<slug>` 文章 × 24；`/cn/news` + `/cn/news/<slug>` × 24 —— **共 50 个页面** |
| 导航 | 8 项 → **9 项**，News 置于 Documents 之后（全站 22 页同步） |
| 页脚 | 「公司 / Company」列新增 News 入口 |
| sitemap | 18 条 → **68 条**（含 hreflang 双向声明） |
| 部署白名单 | 四处加入 `news.html` 与 `news/` |
| nginx | 新增 `/news/` 与 `/cn/news/` 的干净 URL 规则（`^~` 内嵌正则，与 `/cn/` 同范式） |
| 样式 | `styles.css` 新增 `.news-card` 与 `.article` 两套，沿用既有令牌，**不引入新颜色** |

**内容与数据**：

- 24 篇全部来自原官网 NEWS CENTER（实测抓取），时间跨度 **2019-03 ~ 2025-10**
- 正文合计 **24,220 字符**；配图 114 张（去重后），转格式并压缩至 27.7 MB
- 列表页另生成 700px 缩略图 24 张（合计 **1.3 MB**），避免列表页加载原图
- 中文站 24 篇**全文翻译**，段落与英文一一对应
- 其中 4 篇（2019–2020）原官网发布时即为**纯图片报道、无正文**，
  页面如实只呈现图片并注明，**不补写文字**
- `title` 中的 "Surfahce" 等原官网拼写错误**原样保留**（照抄纪律，不擅自更正）

**构建方式（可复现）**：

- `deploy/news-data.json` —— 英文原文（含 slug / images / thumb）
- `deploy/cn-translations.json` —— 中文译文
- `deploy/build-news.py` —— 由数据生成全部 50 页（幂等，可重跑）
- `deploy/patch-nginx-news.py` —— 打/回退 nginx 规则（幂等，含 `--revert`）

**新增 slug 路由**：文章地址 `/news/<slug>`，由标题生成并冻结在数据文件中；
遇到过长或重名标题时回退为标题 + 文章 ID。

### 🐛 修复生成器两处缺陷（构建过程中自查发现）

1. `NAV` 定义里把 News 的「下拉」标志位误写成 `True`，导致 50 个页面都生成了
   `/news?scene=home` 这类**假链接**。已修正，全站 0 处残留。
2. 下拉触发器在该项 `is-active` 时会输出**两个 `class` 属性**。已合并为单个。

---

## [v0.16.0] - 2026-10-10

### 📄 新增「研发与检测设施」页（Facilities）

**需求**：老官网（`www.wx-seastar.com`）内容搬迁，按 IA 方案 A 执行 ——
把 6 个待迁栏目中价值最高的两个独立成页，其余并入 `/about`。

本次先落地其中之一：**Facilities**。

| 项目 | 变更 |
|---|---|
| 新增页面 | `/facilities`（英文）、`/cn/facilities`（中文） |
| 导航 | 7 项 → **8 项**，Facilities 置于 OEM 之后、Documents 之前 |
| 页脚 | 「公司 / Company」列新增 Facilities 入口 |
| sitemap | 16 条 → **18 条**（含 hreflang 双向声明） |
| 部署白名单 | 四处同步加入 `facilities.html` |

**页面内容**（全部来自原官网 FACILITIES 页，实测抓取，未添加任何原官网没有的
认证、设备型号、客户名或产能数字）：

- **研发**：45+ 工程师，覆盖驱动硬件/软件、结构、光学、包装
- **驱动技术**：TRIAC / 0-10V / Tri-mode / BLE / WiFi / BLE+WiFi
- **CSA 见证实验室**：分 6 个测试区；设备含积分球、配光机、恒温恒湿试验箱、
  冷热冲击试验箱、雷击浪涌发生器、脉冲群发生器、振铃波发生器、EMI 测试设备
- **质量体系**：ISO 9001 / ISO 14001 / IATF 16949；独立质量监督检查部门，
  强调质量风险的事前控制

**与 `/oem` 的分工**：制造产线（SMT / 波峰焊 / 组装 / 注塑 / 冲压 / 洁净室 / 产能）
已在 `/oem` 完整承载，本页**不复述**，仅做指引链接，避免两页内容重复。

**配图**：6 张，均经目视核对后配文，避免"名不副实"。
其中 `scene-cleanroom.jpg` 实拍内容为**环境试验箱**而非洁净室，
已另存为语义正确的 `scene-env-chamber.jpg` 供本页使用（原文件保留、未被任何页引用）。

### 🐛 修复：媒体卡片图注类名写错（24 处）

`oem.html` 与 `cn/oem.html` 的图注容器用了 **`media-card__body`**，
但 `styles.css` 中定义的是 **`media-card__label`** —— 该类**根本不存在**，
导致这 24 处图注**丢失了应有的覆盖层样式**（深色渐变 + 白字），
在深色区块上以普通正文色渲染，可读性差。

已全部改为正确的 `media-card__label`（`about.html` 一直是正确写法，本次统一）。

---

## [v0.15.1] - 2026-10-10

### 🍪 Cookie 横幅 UI 按参考图调整

**需求**：cookie 隐私设置参照附图设计。

已上线的功能逻辑（告知 + 授权闸门 + 留痕）不变，仅调整首访横幅布局与文案，
使其与附图一致：

| 位置 | 变更 |
|---|---|
| 标题 | 英文「Your Choices Regarding Cookies on this Site」/ 中文「关于本站 Cookie 使用说明」 |
| 正文 | 改为参考图风格的隐私说明段落 |
| 链接行 | 「Cookie notice / Cookie 说明」—— 点击打开偏好中心 |
| 操作栏 | 左侧「My Preferences / 我的偏好」蓝色链接 + 中间「Only necessary / 仅必要 Cookie」深色按钮 + 右侧「Allow all cookies / 允许所有 Cookie」深色按钮 |

附图中有「Tracker Details Page」链接，但本站实际没有追踪器页面，
所以不放这个空链接。

验证沿用 v0.15.0 的 6 轮运行时断言 + 反向验证，全部通过。

---

## [v0.15.0] - 2026-10-09

### 🍪 Cookie 隐私设置：告知 + 真实授权闸门

**需求**：网站需要 cookie 隐私设置。

#### 一、先核对现状：本站实际用了什么 Cookie

动手前先把全站扫一遍，避免做成一个「假装有一堆追踪 Cookie 请求授权」的假弹窗。
实测结论（决定了整套设计）：

| 位置 | 是否写 Cookie |
|---|---|
| 前台 18 个页面（静态站） | **零**。无 `document.cookie`、无 localStorage、无第三方脚本 |
| 后台 `/admin` 登录 | `wxs_sid`（HttpOnly + SameSite=Lax，仅在登录时下发） |
| 第三方统计 / 广告 / 地图 / 社交像素 | **无**（全仓 grep 命中的全是 `.crawl/`、`.cn/` 抓取缓存） |

所以这个功能**不可能是**「拒绝追踪」那种标准模板，而是三件事：
**如实告知 + 真实生效的授权闸门 + 留痕不打扰**。这也是本版所有文案的写法依据。

#### 二、做了什么

| 部件 | 位置 |
|---|---|
| 同意横幅（首访出现） | `js/consent.js` 动态生成，底部非遮罩，不拦浏览 |
| 偏好中心面板 | 同文件，三分类 + 开关 + 保存 |
| 页脚「Cookie 设置 / Cookie settings」入口 | 18 个页面各一处，随时重开偏好中心 |
| 样式 | `styles.css` 新增 `.cc-*` / `.footer__cc` 两套 |

**三分类**（文案如实对应当下真实情况）：

- **必要 Cookie**：始终启用，不可关闭。内容是后台登录会话 + 本偏好记录自身。
- **统计与分析 Cookie**：默认关闭，可切换。**本站当前未部署任何统计工具**，
  所以现在开启不会写入任何东西；它的作用是**预先授权闸门** ——
  将来新增的测量脚本若不带 `data-cookie-category="analytics"`，在开启前不会被执行。
- **营销与广告 Cookie**：永久关闭，仅作说明列出（本站不用）。

**留痕**：`localStorage['wxs_cc_v1']` 存完整记录，另加一枚第一方必要 Cookie
`wxs_cc`（180 天，https 下带 Secure），服务端也可读。回访不再弹窗。

**授权闸门是真实接口**，不是装饰：
`SeaStarConsent.runWhenGranted('analytics', fn)` —— 未同意时入队不执行，
同意后立即放行并执行队列；撤回同意会 `purge()` 掉登记过的 Cookie 并再次上锁。

#### 三、🔴 过程中查出并修掉的一个真实缺陷

显隐动画原本用 `requestAnimationFrame` 给横幅/面板挂 `is-in` 类。rAF 由**渲染管线**
驱动，在后台标签页、低电量节流等场景下回调可能永不执行 —— 结果是元素**存在但
`opacity:0`，用户根本看不见**。已改为 `setTimeout(…, 16)` 挂载。

这一条不是凭感觉改的：既然常规环境里 rAF 照常执行、看不出差别，
就**专门造了一轮「冻结 `requestAnimationFrame`」的验证**（见下），把这条选择钉死。

#### 四、验证（正反双向，含反向自检）

| 层次 | 手段 | 结果 |
|---|---|---|
| 静态挂载 | `deploy/verify-cookie-static.py` | 18 页全合格；`--self-test` 用注入前原文喂入，**18/18 必须报错**，通过 |
| 运行时行为 | `deploy/verify-cookie-consent.py` | 6 轮 × 17/5 项断言全绿（英文站/中文站 × 首访/回访/rAF 冻结） |
| 反向验证 | `deploy/verify-cookie-consent-negative.py` | 4 类已知缺陷塞回去**全部被抓到** |

运行时验证一律走**真实 `.click()`**（不调内部函数）—— 这是 v0.13.2 的教训：
选择器没命中真实 DOM 时，页面看着完全正常、控制台无报错，只有真点击才验得出来。
反向验证的第 A 类就是复刻那次缺陷：事件委托选择器写错，探针必须报错。

> ⚠️ 本机 `--headless=new` 的坑（已写进脚本注释）：`--virtual-time-budget` 下虚拟
> 时钟推进远快于真实网络，**固定 `setTimeout(700)` 起步会误判成"模块没加载"**
> （表现为前几步 FAIL、后几步又 OK）。改用轮询等到依赖就绪。
> 另外 Chrome profile 目录必须每轮唯一，复用会带着上次的 localStorage，
> 让"首次到访"变成"回访"，横幅压根不会创建。

#### 五、部署

新增的 `js/consent.js` 落在已登记的 `js` 目录内，四处白名单
（CI `FILES` / `sites.yml` / `auto-deploy.sh` / `deploy-manual.sh`）
用的都是整目录 `cp -r`，**无需改动清单**。

#### 六、遗留

- 暂无独立的 Cookie 政策页：政策说明当前放在偏好面板里。若要单独成页，
  会变成第 10 个页面 —— 需要动四处白名单并更新 sitemap，届时另行处理。

---

## [v0.14.0] - 2026-10-09

### ✨ 规格书上线：从原官网详情页抓取 → 转 PDF → 挂到产品卡

**需求**：核对「通用照明」内容是否全部转移；并把 www.wx-seastar.com 上的
规格书图片转成 PDF 放进技术资料，在产品展示图下方给下载入口。

#### 一、核对结果：原官网 83 个已全数转入

跑 `deploy/crawl-official-products.py`（按栏目+分页全量遍历，不手工数页面）：

| 来源 | 条目 |
|---|---|
| LED 主栏目 page1–4 | 24 + 24 + 24 + 11 |
| EUROPE / NORTH AMERICA(3 页) / ASIA | 22 / 24+24+10 / 3 |
| **去重合计** | **83** |

库内照明线 84 个（多出的 1 个是后台新增的 WPX5）。顺带查出原官网还有 4 个
此前未覆盖的栏目：`15454` NEWS / `15455` Team / `15456` PARTNER / `15457` Highlight。

#### 二、🔴 规格书在哪：只在**产品详情页**（此前遗漏）

原官网有**两套图，不是同一张**：

| 位置 | 内容 |
|---|---|
| 产品列表页 `item_img` | 产品**照片**（600×488 横版）—— 即卡片上现有的图 |
| **产品详情页** `/forum/post/<id>/` 正文 | **规格书**（1152×1607 竖版长图） |

规格书内容：标题 + 特性列表 + 认证徽章 + 多角度实拍 + **Model No./电压/功率/
流明/色温完整规格表**。其 `<img>` 的 `alt` 即原站后台原始文件名。

**判别规则**（确定性判据）：正文容器 `.richtext` 内 + `h > w and w >= 900`。

#### 三、抓取结果

- 83 个详情页 → **79 个有规格书（82 张图）**
- **75 个产品成功转出 PDF**（41 MB），4 张正文内横版小图判定为产品照、不入 PDF
- **8 个产品原站确实没有规格书**（详情页正文为 50 字节空白）：
  SMD Strip / Neon Strip / COB Strip / 3D Neon Strip / Magnetic V Strip Light /
  Magnetic Strip Light / LED Magnetic Retrofit / WRPX3 Prismatic Wraparound

#### 四、前台

- `/api/public/products` 增加 `spec_doc_id` / `doc_count` 两个字段
  （子查询取该产品的第一份规格书，不塞完整文档列表，避免放大响应体）
- 产品卡底部：有规格书时直接给「规格书 (PDF) / Datasheet (PDF)」下载入口，
  与原有「技术资料」入口并列；无规格书时只保留后者
- 下载走 `/api/public/download/<id>`，由后端转发才能计数并还原原始文件名

#### 五、新增脚本

| 脚本 | 作用 |
|---|---|
| `deploy/crawl-official-specs.py` | 抓详情页规格图（pages / extract / download） |
| `deploy/build-spec-docs.py` | 图片转 PDF（A4 宽 300dpi，长图自适应页高）+ 生成清单 |
| `server/src/tools/import-specs.js` | 服务器端登记进 documents 表（幂等） |

### 🐛 过程中修掉的三个问题

1. **无头 Chrome 偶发返回 0 字节** → 首轮 83 个里 11 个是空文件。
   若不区分会把"抓取失败"误判成"该产品没有规格书"（**假阴性**）。
   已加最多 3 次重试 + 轮换 profile；重抓后 0 空文件。
2. **脚本里连续 `os.remove()` 被 safe-delete 守卫拦截** —— 原本用 `.bin` 中转再删，
   到第 50 个文件时报 `SAFE_DELETE_BULK_CONFIRM_REQUIRED`，**整个任务中断**
   （表现为"只下载了 50 张、且尺寸字段一个都没写入"）。
   改为直接下到最终文件名、原地覆盖，**不产生临时文件也就不需要删除**。
3. **跨来源产品名空格数不一致** —— seed 里写作 `Selectable  Slim`（两个空格），
   原官网是单个空格，导致 RDX3 漏配。改为比对前统一压缩空白。

---

## [v0.13.2] - 2026-10-09

### 🐛 修复：产品页导航没有下拉菜单

**现象**：在通用照明页（`/lighting`、`/cn/lighting`）上，鼠标划过导航「通用照明」
没有下拉；其他页面正常。用户描述为「只有第一次能显示，选中之后就不显示」。

**根因**：`deploy/add-nav-dropdown.py` 用的是**精确匹配**：

```html
<a href="/cn/lighting">通用照明</a>
```

而产品页上这一项带**选中态 class**：

```html
<a href="/cn/lighting" class="is-active">通用照明</a>
```

nav 区块里匹配不到 → 第一次 `re.sub` **顺延匹配到了 drawer 里的同一个链接**，
把桌面下拉结构插进了移动抽屉；drawer 的第二次替换已无匹配可用。两个后果：

1. 产品页 nav 里根本没有下拉结构 → hover 无反应
2. 移动端 drawer 里塞进了桌面结构，版式错乱

**更值得记的是**：脚本当时**打印了 ✔** —— `re.sub` 找不到匹配不报错，
属**静默假绿**。所有"绿色输出"看起来都正常。

### 修复与防复发

- 新增 `deploy/fix-nav-lighting.py`：只在 nav / drawer **各自区块内**替换，
  把误插进 drawer 的桌面结构还原为 `drawer__sub` 列表，
  并把产品页的 `<a class="is-active">` 升级为下拉（**选中态保留到 trigger 上**）
- 新增 `deploy/verify-nav.py`：18 个页面**正反两向**断言
  - nav 必须含 `.nav__dropdown`，且不得含 `.drawer__sub`
  - drawer 必须含 `.drawer__sub`，且不得含 `.nav__dropdown`（防误插）
  - 4 条下拉链接齐备；产品页 trigger 必须带 `is-active`，其余页不得带
- 该断言器做了**反向验证**：拿修复前的产物喂进去，报出 7 类错误、
  退出码非 0 —— 证明它不是"永远通过"的假检查

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
