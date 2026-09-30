# DESIGN.md — SEA☆STAR 实益达（无锡市益明光电有限公司）照明灯具公司官网设计系统

> 项目：全新照明灯具品牌官网（ODM设计 / 通用照明 / 植物灯具 三大业务线）
> 设计基因：Modern Minimal（骨）+ Soft Warm 光感（魂）+ Tech Utility（技术区）
> 核心记忆点：**「暗中有光」** — 深色品牌区托底 + 暖琥珀金光效贯穿全站

---

## 0. 设计系统来源与选择依据

### 候选方案对比

| 方案 | 设计系统基因 | 匹配度 | 特征 | 适合原因 |
|------|------------|--------|------|---------|
| **A（最佳）** | **Linear** 的暗色克制骨架 + **Warm Editorial** 的暖光质感 + **ClickHouse** 的技术数据区 | ★★★★★ | 暗色精密网格、极简排版、数据密集组件、暖色点缀 | Linear 的「暗色专业感 + 精密栅格」完美承载 B端工业调性；Warm Editorial 提供暖琥珀光感注入灵魂；ClickHouse 的等宽数据表胜任光谱/参数区。三基因叠加 = Modern Minimal 骨 + Soft Warm 魂 + Tech Utility 技术区 |
| **B** | **Vercel** + **Notion** | ★★★★☆ | 黑白极简、强几何、大留白、组件规范极清晰 | Vercel 的零装饰极简是 Modern Minimal 的教科书级示范，落地风险低；但纯黑白冷感偏硬，需额外注入暖光才不显冷峻，对「照明/光」意象的表达需要大量二次创作 |
| **C** | **Apple** 产品页语言 | ★★★☆☆ | 极致留白、大图叙事、产品居中聚焦、动效精致 | Apple 的产品聚焦叙事非常适合灯具产品展示页（通用照明/植物灯），但整体偏 C 端消费感，B端 ODM 的工程/参数专业感需要另一套子系统补足，架构会变复杂 |

### 最终选择：方案 A（Linear × Warm Editorial × ClickHouse 三基因融合）

**理由**：照明行业的本质是「用光营造氛围与控制数据」的双重叙事。
- **ODM 页偏设计创意** → 用 Warm Editorial 的暖调 + 大留白
- **通用照明页偏生活商业** → 用 Linear 的克制网格 + 暖光产品卡
- **植物灯页偏技术专业** → 用 ClickHouse 的等宽数据区 + 高对比暗底

三个业务线共享同一套「暗中有光」的色彩骨架，但通过**明暗模式切换 + 光效强度变量**实现差异化。

---

## 1. Visual Theme（视觉主题）

**Philosophy**：以「光」为唯一主角——界面是暗场，产品是光源。用深色托底放大每一束暖光的温度，用克制排版让光效本身成为最响亮的视觉语言。

**Direction**：`minimal, luminous, precise, industrial-warm`

**Personality**：`专业可信 · 温润通透 · 精密克制 · 暗中有光`

**Reference**：
- 骨架：Linear（暗色精密栅格、克制边框、1px 分割线）
- 灵魂：北欧暖光家居 + 黄昏室内暖调（光晕、光锥、暖琥珀）
- 技术区：ClickHouse / IBM 数据终端（等宽字体、数据网格、状态色点缀）

**三大业务线视觉差异化策略**：

| 业务线 | 主导明暗 | 光效强度 | 主视觉语言 | 排版密度 |
|--------|---------|---------|-----------|---------|
| ODM 设计 | 明底为主 | 中（柔光晕） | 大留白 + 暖调渐变 + 设计草图感 | 低密度 |
| 通用照明 | 明底 + 暗色产品卡 | 中高（产品发光） | 产品影棚图 + 场景氛围 + 圆润卡片 | 中密度 |
| 植物灯 | 暗底为主 | 高（光谱发光） | 光谱曲线 + 参数表 + 深色仪表盘感 | 高密度 |

---

## 2. Color Palette（调色板）

### 2.1 品牌核心色 — 暖光琥珀金（Warm Amber「光」）

| Token | HEX | OKLCh | Usage |
|-------|-----|-------|-------|
| `--brand-amber-50` | `#FFF8EC` | oklch(97% 0.025 85) | 极浅暖光底、hover 光晕 |
| `--brand-amber-100` | `#FFEDCC` | oklch(93% 0.055 85) | 暖光卡片底纹 |
| `--brand-amber-300` | `#FFB84D` | oklch(82% 0.15 75) | **暖光强调（亮）**、高亮态 |
| `--brand-amber-500` | `#F5A623` | oklch(76% 0.17 70) | **品牌主色 / CTA 主色** |
| `--brand-amber-600` | `#E0900F` | oklch(68% 0.17 68) | 主色 hover、按下态 |
| `--brand-amber-700` | `#B87408` | oklch(56% 0.14 65) | 主色 active、深底上的强调文字 |

### 2.2 基础深色 — 深夜蓝黑（Deep Night「暗」）

| Token | HEX | OKLCh | Usage |
|-------|-----|-------|-------|
| `--night-950` | `#0A0A14` | oklch(13% 0.015 275) | 最深底（hero/footer 全暗区） |
| `--night-900` | `#0F0F1A` | oklch(17% 0.015 275) | **深色品牌区主底** |
| `--night-800` | `#16162A` | oklch(21% 0.02 275) | 深色卡片/面板底 |
| `--night-700` | `#1A1A2E` | oklch(24% 0.025 275) | 深色区 hover/抬升 |
| `--night-600` | `#232342` | oklch(29% 0.03 275) | 深色边框/分割线 |
| `--night-500` | `#33334F` | oklch(36% 0.03 275) | 深色区次级文字/图标 |

### 2.3 净白与中性灰阶（Neutral）

| Token | HEX | OKLCh | Usage |
|-------|-----|-------|-------|
| `--neutral-0` | `#FFFFFF` | oklch(100% 0 0) | 纯白卡片、最高亮面 |
| `--neutral-50` | `#FAFAFA` | oklch(98% 0 0) | **页面主体底色** |
| `--neutral-100` | `#F4F4F5` | oklch(96% 0.002 275) | 区块浅底、striped 表格行 |
| `--neutral-200` | `#E5E7EB` | oklch(92% 0.003 265) | 分割线、卡片边框 |
| `--neutral-300` | `#D1D5DB` | oklch(87% 0.005 265) | 输入框边框、禁用边框 |
| `--neutral-400` | `#9CA3AF` | oklch(72% 0.01 265) | 占位符、禁用文字 |
| `--neutral-500` | `#6B7280` | oklch(55% 0.015 265) | **正文次级文字、元数据** |
| `--neutral-600` | `#4B5563` | oklch(43% 0.015 265) | 次级正文 |
| `--neutral-700` | `#374151` | oklch(35% 0.015 265) | 深色正文 |
| `--neutral-900` | `#111827` | oklch(18% 0.02 265) | **明底页面主文字/标题** |

### 2.4 技术蓝 — 数据可视化（Tech Blue）

| Token | HEX | OKLCh | Usage |
|-------|-----|-------|-------|
| `--tech-blue-300` | `#93B4FD` | oklch(78% 0.1 265) | 暗底图表辅助线 |
| `--tech-blue-500` | `#2563EB` | oklch(55% 0.2 262) | **技术参数、数据可视化主色** |
| `--tech-blue-600` | `#1D4ED8` | oklch(48% 0.2 262) | 数据 hover、链接 |
| `--tech-cyan-400` | `#22D3EE` | oklch(80% 0.13 195) | 光谱曲线高亮、冷光对照 |

### 2.5 语义色（Semantic）

| Token | HEX | OKLCh | Usage |
|-------|-----|-------|-------|
| `--color-success` | `#10B981` | oklch(70% 0.15 160) | 正向状态、认证通过、能效达标 |
| `--color-warning` | `#F59E0B` | oklch(76% 0.16 70) | 提示、注意（与品牌色同族但语义区分） |
| `--color-danger` | `#EF4444` | oklch(63% 0.2 25) | 错误、告警、过载 |
| `--color-info` | `#3B82F6` | oklch(60% 0.18 260) | 信息提示 |

### 2.6 光谱色 — 植物灯专用（Plant Spectrum）

用于植物灯页的光谱图（PAR / PPFD 曲线），对应光合有效辐射波段：

| Token | HEX | 波长语义 | Usage |
|-------|-----|---------|-------|
| `--spectrum-violet` | `#8B5CF6` | 400–450nm 紫 | 光谱曲线起点 |
| `--spectrum-blue` | `#3B82F6` | 450–495nm 蓝 | 叶绿素吸收峰 |
| `--spectrum-green` | `#22C55E` | 495–570nm 绿 | 视觉响应峰 |
| `--spectrum-yellow` | `#FACC15` | 570–590nm 黄 | 过渡带 |
| `--spectrum-red` | `#EF4444` | 620–700nm 红 | 光合作用主吸收区 |
| `--spectrum-deepred` | `#DC2626` | 700–750nm 深红 | 光形态建成响应 |

### 2.7 语义表面令牌（明/暗双模）

**明色模式（Light Mode — 通用照明 / ODM 页主用）**

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-bg` | `#FAFAFA` | 页面底色 |
| `--surface-card` | `#FFFFFF` | 卡片底 |
| `--surface-raised` | `#FFFFFF` + shadow | 抬升卡片 |
| `--surface-sunken` | `#F4F4F5` | 凹陷区/代码块底 |
| `--surface-dark` | `#0F0F1A` | 深色锚定区（footer/CTA带） |
| `--border-subtle` | `#E5E7EB` | 卡片边框 |
| `--border-strong` | `#D1D5DB` | 输入框边框 |
| `--text-primary` | `#111827` | 标题/正文 |
| `--text-secondary` | `#6B7280` | 辅助文字 |
| `--text-tertiary` | `#9CA3AF` | 占位/禁用 |
| `--text-on-dark` | `#F4F4F5` | 深色区文字 |
| `--text-on-dark-muted` | `#9CA3AF` | 深色区辅助文字 |

**暗色模式（Dark Mode — 植物灯页 / 全站深色锚定区主用）**

| Token | Value | Usage |
|-------|-------|-------|
| `--surface-bg` | `#0A0A14` | 页面底色 |
| `--surface-card` | `#16162A` | 卡片底 |
| `--surface-raised` | `#1A1A2E` | 抬升卡片 |
| `--surface-sunken` | `#0F0F1A` | 凹陷区 |
| `--border-subtle` | `#232342` | 卡片边框 |
| `--border-strong` | `#33334F` | 输入框边框 |
| `--text-primary` | `#F4F4F5` | 标题/正文 |
| `--text-secondary` | `#9CA3AF` | 辅助文字 |
| `--text-tertiary` | `#6B7280` | 占位/禁用 |

**WCAG AA 对比度校验（关键组合）**：
- `--text-primary #111827` on `--surface-bg #FAFAFA` = **16.1:1** ✅ AAA
- `--text-secondary #6B7280` on `#FAFAFA` = **5.3:1** ✅ AA
- `--brand-amber-500 #F5A623` on `--night-900 #0F0F1A` = **9.4:1** ✅ AAA（深底上的品牌字）
- `#0F0F1A` on `--brand-amber-500 #F5A623` = **9.4:1** ✅ AAA（CTA 按钮文字）
- `--text-on-dark #F4F4F5` on `--night-900 #0F0F1A` = **15.8:1** ✅ AAA
- 注意：`--brand-amber-500` 用于浅底文字时对比不足（约 2.2:1），**仅可用于深底文字或作为背景/图形色**；浅底需要暖色文字时改用 `--brand-amber-700 #B87408`（on 白 = 4.6:1 ✅ AA）

---

## 3. Typography（排版）

### 3.1 字体族

- **Heading（标题）**: `"Inter", "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- **Body（正文）**: `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`
- **Mono（技术/数据）**: `"JetBrains Mono", "IBM Plex Mono", "SF Mono", "Roboto Mono", ui-monospace, "Cascadia Code", monospace`

**中文适配说明**：中文字体回退到 PingFang SC（macOS）/ Microsoft YaHei（Windows），保证标题与正文的中英混排基线对齐。标题英文字重偏轻以保持 Modern Minimal 的克制感。

### 3.2 字号梯度

| Level | Size | Weight | Line-height | Letter-spacing | Usage |
|-------|------|--------|-------------|----------------|-------|
| Display XL | 72px / 4.5rem | 300 (Light) | 1.05 | -0.03em | 首页 Hero 主标题（暗底大光） |
| Display | 56px / 3.5rem | 300–400 | 1.08 | -0.02em | 业务线页 Hero |
| H1 | 40px / 2.5rem | 400–500 | 1.15 | -0.02em | 页面主标题 |
| H2 | 32px / 2rem | 500 | 1.25 | -0.01em | 区块标题 |
| H3 | 24px / 1.5rem | 500 | 1.35 | -0.01em | 子区块标题 |
| H4 | 20px / 1.25rem | 500 | 1.4 | 0 | 卡片标题 |
| Body L | 18px / 1.125rem | 400 | 1.7 | 0 | 引言段落、长文 |
| Body | 16px / 1rem | 400 | 1.65 | 0 | 默认正文 |
| Body S | 15px / 0.9375rem | 400 | 1.6 | 0 | 卡片描述、紧凑正文 |
| Small | 14px / 0.875rem | 400 | 1.5 | 0.005em | 元数据、辅助说明 |
| Micro | 12px / 0.75rem | 500 | 1.4 | 0.02em | 标签、徽章 |
| Overline | 11px / 0.6875rem | 600 | 1.4 | 0.12em (UPPER) | 眉标、章节序号（如 `01 / ODM`） |

**技术/数据字号（Mono）**：

| Level | Font | Size | Weight | Usage |
|-------|------|------|--------|-------|
| Spec Value | Mono | 15px | 500 | 参数数值（如 `2700K`、`1200 lm`） |
| Spec Label | Mono | 11px | 500 | 参数键名（UPPER + 0.08em） |
| Table Cell | Mono | 13px | 400 | 数据表格单元格 |
| Spectrum Axis | Mono | 10px | 400 | 光谱图坐标轴刻度 |

**排版规则**：
- 大标题（Display/H1）用 **Light/Regular（300–400）** 字重 + 负字距，营造克制精密的 Modern Minimal 气质；不要用 Bold 标题。
- 正文严格 400；强调用 500 或色值区分，**不用加粗**（避免视觉噪音）。
- 数据区所有数值、单位、键名一律 Mono；中英混排数据保持 Mono 对齐。
- 段落最大宽度：`65ch`（正文）/ `72ch`（大屏引言），保证阅读舒适。

---

## 4. Spacing System（间距系统）

**基础单位：4px**（`--space-unit`）。全站间距为 4 的倍数。

| Token | Value | Usage |
|-------|-------|-------|
| `--space-2xs` | 4px | 图标与文字间隙、紧凑内联 |
| `--space-xs` | 8px | 标签内边距、小间隙 |
| `--space-sm` | 12px | 紧凑组件内边距 |
| `--space-md` | 16px | **默认间距**、卡片内基础 padding |
| `--space-lg` | 24px | 卡片 padding、组件间距 |
| `--space-xl` | 32px | 区块内分组间距 |
| `--space-2xl` | 48px | 区块之间间距（移动端） |
| `--space-3xl` | 64px | 区块之间间距（平板） |
| `--space-4xl` | 96px | **Section 垂直间距（桌面）** |
| `--space-5xl` | 128px | Hero 区上下留白、大区块分隔 |
| `--space-6xl` | 160px | 首页大章节间的呼吸区 |

**布局栅格**：
- 容器最大宽度：`1280px`（内容区 `1200px` + 左右 40px 安全边距）
- 栅格：12 列，Gutter `24px`；技术参数区可用 16 列细栅格增强精密感。
- 阅读型内容（关于/博客）：容器收窄至 `760px`。

---

## 5. Radius System（圆角规范）

| Token | Value | Usage |
|-------|-------|-------|
| `--radius-xs` | 4px | 徽章、小标签、输入框内元素 |
| `--radius-sm` | 6px | 输入框、小按钮 |
| `--radius-md` | 10px | **默认按钮、表单控件** |
| `--radius-lg` | 16px | 卡片、面板 |
| `--radius-xl` | 24px | 大卡片、图片容器、模态框 |
| `--radius-2xl` | 32px | Hero 焦点卡片、大图容器 |
| `--radius-full` | 9999px | 药丸按钮、头像、状态点 |

**规则**：照明产品本身多圆润（灯罩、灯球），UI 圆角取中高值（卡片 16px、按钮 10px）呼应产品形态；但**技术数据区收紧至 6–10px**，保持仪表盘的精密感。

---

## 6. Depth, Shadow & Light Effects（深度、阴影与光效系统）★ 照明品牌核心特色

### 6.1 常规阴影（Elevation）

| Level | Value | Usage |
|-------|-------|-------|
| Flat | `none` | 默认平面（含 1px 边框） |
| Raised | `0 1px 2px rgba(17,24,39,0.06), 0 1px 3px rgba(17,24,39,0.04)` | 卡片、下拉 |
| Floating | `0 8px 24px rgba(17,24,39,0.08), 0 2px 6px rgba(17,24,39,0.05)` | 浮层、popover |
| Overlay | `0 20px 48px rgba(10,10,20,0.18)` | 模态框、抽屉 |

### 6.2 光效系统（Glow System）— 品牌灵魂

**光的三种语义**：产品在发光（`glow-product`）、界面在发光（`glow-accent`）、氛围在发光（`glow-ambient`）。

| Token | Value | Usage |
|-------|-------|-------|
| `--glow-accent-sm` | `0 0 12px rgba(245,166,35,0.35)` | 按钮 hover 暖光、图标点亮 |
| `--glow-accent-md` | `0 0 24px rgba(245,166,35,0.45), 0 0 48px rgba(245,166,35,0.20)` | CTA 主按钮、焦点元素光晕 |
| `--glow-accent-lg` | `0 0 40px rgba(245,166,35,0.50), 0 0 80px rgba(245,166,35,0.25)` | 品牌区主视觉、Hero 光源 |
| `--glow-product` | `0 0 60px rgba(255,184,77,0.55), 0 8px 32px rgba(0,0,0,0.30)` | 暗底产品图下方的光锥/光晕 |
| `--glow-ambient-radial` | `radial-gradient(ellipse at center, rgba(245,166,35,0.18) 0%, rgba(245,166,35,0.06) 40%, transparent 70%)` | 大区块背景氛围光 |
| `--glow-tech-cyan` | `0 0 20px rgba(34,211,238,0.40)` | 光谱曲线、冷光数据高亮 |
| `--glow-text-amber` | `0 0 28px rgba(245,166,35,0.42)` | 深底暖色大标题的文字辉光 |

**光效使用准则**：
1. **暗底优先**：光效只在深色底（`--night-900` 及更深）或产品发光场景使用，明底上光效极弱（降 opacity 至 0.15）。
2. **一区一光源**：每个视区最多一个主要发光焦点（产品/CTA），避免多点抢夺注意力。
3. **呼吸而非闪烁**：光效动态用缓慢呼吸（3–5s 循环），绝不使用高频闪烁。
4. **暖主冷辅**：暖琥珀为品牌光（主），技术蓝/青为数据光（辅），二者不混用于同一元素。

### 6.3 玻璃拟态光层（Luminous Glass — 用于深色区叠加）

```css
--glass-dark: rgba(26, 26, 46, 0.60);
--glass-dark-border: rgba(245, 166, 35, 0.15);
backdrop-filter: blur(16px) saturate(140%);
```
用于深色区悬浮导航、Hero 上的信息胶囊，让背景光效透出，强化「暗中有光」层次。

### 6.4 光锥 / 光晕装饰（Scene Lighting）

```css
/* 顶部光源投射 —— Hero 与产品区的标志性装饰 */
--beam-cone: conic-gradient(from 180deg at 50% 0%, transparent 40%, rgba(245,166,35,0.20) 50%, transparent 60%);

/* 底部柔光晕 —— 产品卡片下方 */
--halo-bottom: radial-gradient(ellipse at 50% 100%, rgba(255,184,77,0.30) 0%, transparent 65%);
```

### 6.5 Z-index Scale

- Base: `0`
- Decorative light: `1`（氛围光层）
- Dropdown: `100`
- Sticky nav: `200`
- Modal: `300`
- Toast: `400`
- Cursor / spotlight: `500`

---

## 7. Component Styles（组件规范）

### 7.1 Buttons（按钮）

**Primary（暖光 CTA）**
```css
background: var(--brand-amber-500);       /* #F5A623 */
color: var(--night-900);                   /* #0F0F1A — 深字在暖底，对比 9.4:1 */
border: none;
border-radius: var(--radius-md);           /* 10px */
padding: 12px 24px;
font: 500 15px/1 Inter, sans-serif;
letter-spacing: 0.005em;
box-shadow: var(--glow-accent-sm);
transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
/* hover */
background: var(--brand-amber-600);        /* #E0900F */
box-shadow: var(--glow-accent-md);
transform: translateY(-1px);
/* active */
background: var(--brand-amber-700); transform: translateY(0);
```

**Secondary（描边）**
```css
background: transparent;
color: var(--text-primary);                /* 明底 */
border: 1px solid var(--border-strong);    /* #D1D5DB */
border-radius: var(--radius-md); padding: 12px 24px;
/* hover */
border-color: var(--brand-amber-500); color: var(--brand-amber-700);
background: var(--brand-amber-50);
```

**Ghost（幽灵 — 深色区）**
```css
background: rgba(255,255,255,0.04);
color: var(--text-on-dark);
border: 1px solid rgba(245,166,35,0.20);
/* hover */ background: rgba(245,166,35,0.10); border-color: var(--brand-amber-500);
```

按钮尺寸：`sm` 高 36px / `md` 高 44px（默认）/ `lg` 高 52px。图标 → 文字间距 `--space-xs`（8px）。

### 7.2 Cards（卡片）

**Standard Product Card（明底）**
```css
background: var(--surface-card);           /* #FFFFFF */
border: 1px solid var(--border-subtle);    /* #E5E7EB */
border-radius: var(--radius-lg);           /* 16px */
padding: var(--space-lg);                  /* 24px */
box-shadow: none;                          /* 靠边框而非阴影定义边界 */
transition: all 300ms ease;
/* hover */
border-color: var(--brand-amber-300);
box-shadow: var(--glow-accent-sm), var(--shadow-raised);
transform: translateY(-2px);
```

**Luminous Card（暗底产品卡 — 通用照明/植物灯）**
```css
background: var(--surface-card);           /* #16162A */
border: 1px solid var(--border-subtle);    /* #232342 */
border-radius: var(--radius-xl);           /* 24px */
/* 产品图为光源：图片容器底部叠加 --halo-bottom，图片加 --glow-product */
/* hover 时产品光晕增强，border-color -> rgba(245,166,35,0.35) */
```

### 7.3 Navigation（导航）

- **类型**：顶部固定导航（Sticky），高度 `72px`。
- **滚动前**：透明背景（Hero 上），文字 `--text-on-dark`（暗底 Hero）。
- **滚动后**：`--glass-dark` + backdrop-blur + 底部 `1px solid var(--border-subtle)`，文字转明/暗跟随页面。
- **Logo 左置**，主导航居中或右置，CTA 主按钮最右。
- **激活指示**：底部 `2px` 暖光下划线，`background: var(--brand-amber-500); box-shadow: var(--glow-accent-sm)`。
- **移动端**：汉堡菜单 → 全屏深色抽屉（`--night-950`），菜单项大字（H3 级），逐个淡入。

**业务线子导航（Tab 切换）**：ODM / 通用照明 / 植物灯 —— 药丸式 Tab，激活项暖光底。

### 7.4 Forms（表单）

```css
/* Input */
height: 48px;
background: var(--surface-card);
border: 1px solid var(--border-strong);    /* #D1D5DB */
border-radius: var(--radius-md);           /* 10px */
padding: 0 16px;
font: 400 15px/1.4 Inter, sans-serif;
color: var(--text-primary);
/* placeholder */ color: var(--text-tertiary);
/* focus */
border-color: var(--brand-amber-500);
box-shadow: 0 0 0 3px rgba(245,166,35,0.15), var(--glow-accent-sm);
outline: none;
/* error */ border-color: var(--color-danger);
/* textarea */ min-height: 128px; padding: 12px 16px;

/* Label */ 13px / 500 / --text-secondary / margin-bottom 8px;
/* Helper text */ 12px Mono / --text-tertiary;
```

深色区表单：Input 底 `--surface-card #16162A`，边框 `--border-strong #33334F`，文字 `--text-on-dark`。

### 7.5 Data Table（技术参数表 — Tech Utility）

```css
/* Table */
width: 100%; border-collapse: collapse;
font: 400 13px/1.5 "JetBrains Mono", monospace;
/* Header (键名) */
font: 500 11px/1.4 "JetBrains Mono", monospace;
text-transform: uppercase; letter-spacing: 0.08em;
color: var(--text-secondary);
border-bottom: 1px solid var(--border-strong);
padding: 12px 16px;
/* Row */
border-bottom: 1px solid var(--border-subtle);
padding: 14px 16px;
/* Striped */ 奇行 background: var(--surface-sunken);
/* Hover */ background: rgba(245,166,35,0.04);
/* 数值列右对齐，单位用 --text-secondary 小字 */
```

### 7.6 Spectrum Chart（光谱图容器 — 植物灯专用）

- 深色底 `--surface-sunken #0F0F1A`，圆角 `--radius-lg`。
- 曲线：PAR 强度用 `--spectrum-*` 渐变色描边，主峰高亮 `--glow-tech-cyan`。
- 坐标轴：Mono 10px，网格线 `rgba(255,255,255,0.06)`。
- 关键波长标注：竖虚线 + Mono 标签 + 小圆点（使用对应光谱色）。
- 交互：hover 显示 PPFD 数值 tooltip（玻璃拟态深色胶囊）。

### 7.7 Badges / Tags（徽章）

- 认证/能效徽章：药丸形（`--radius-full`），Micro 字号 + 字距 0.02em。
- 语义：成功 `#10B981`/12% 底；技术 `--tech-blue-500`/12% 底；品牌 `--brand-amber-500`/15% 底。
- 深底徽章：亮色文字 + 低透明底 + 1px 同色边框。

---

## 8. Motion & Animation（动效规范）★ 光的动效语言

### 8.1 缓动与时长

| Token | Value | Usage |
|-------|-------|-------|
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | 默认过渡 |
| `--ease-out-soft` | `cubic-bezier(0.16, 1, 0.3, 1)` | 元素入场、光晕浮现 |
| `--ease-in-out-glow` | `cubic-bezier(0.45, 0, 0.55, 1)` | 光效呼吸循环 |
| `--duration-fast` | `150ms` | hover、按钮反馈 |
| `--duration-base` | `300ms` | 卡片过渡、展开 |
| `--duration-slow` | `600ms` | 区块入场、大图揭示 |
| `--duration-ambient` | `3000–5000ms` | 氛围光呼吸循环 |

### 8.2 光的动效语言（Light Motion Language）

1. **点亮（Ignite）**：元素入场时，先由暗转亮——`opacity 0→1` + `glow` 由 0 增强到目标值，模拟灯被点亮。用于 Hero 标题、主 CTA。
```css
@keyframes ignite {
  from { opacity: 0; filter: brightness(0.6); }
  to   { opacity: 1; filter: brightness(1); }
}
```

2. **呼吸（Breathe）**：氛围光 / 焦点光源的缓慢脉动，`--duration-ambient` 循环。
```css
@keyframes breathe {
  0%, 100% { opacity: 0.7; }
  50%      { opacity: 1; }
}
```

3. **流光（Sheen）**：产品卡片 / 按钮上一道暖光斜向扫过（1.2s，一次性，触发于 hover 或滚动进入）。
```css
@keyframes sheen {
  from { transform: translateX(-120%); }
  to   { transform: translateX(220%); }
}
```

4. **光谱绘制（Trace）**：光谱曲线 / 数据图表进入视口时，用 `stroke-dashoffset` 从起点绘制到终点（1.5s）。

5. **滚动联动（Scroll-Lit）**：深色区块滚动进入时，背景氛围光渐显，模拟「走近光源」。

### 8.3 交互反馈

- 按钮 hover：`transform: translateY(-1px)` + 光晕增强（`--duration-fast`）。
- 卡片 hover：上浮 2px + 边框转暖 + 光晕浮现（`--duration-base`）。
- 链接 hover：暖色下划线从左滑入。
- 列表/网格入场：`stagger` 逐个延迟 60–80ms。
- **尊重 `prefers-reduced-motion`**：关闭呼吸/流光/滚动联动，仅保留 opacity 过渡。

---

## 9. Layout Patterns（页面布局模式）

### 首页（Home）
1. **Hero**：深色满屏（`--night-950`）+ 顶部 `--beam-cone` 光锥 + 中央暖光氛围 + Display XL 大标题「让光，恰到好处」+ 双 CTA。产品灯剪影发光。
2. **三业务线导航区**：三张并列卡片（ODM / 通用照明 / 植物灯），各自光色微差异（ODM 暖、通用中性暖、植物灯青蓝+暖），hover 点亮。
3. **核心能力/信任区**：数据统计（Mono 数字）+ 合作客户 Logo 墙 + 认证徽章。
4. **精选产品展示**：明底，产品卡网格（3 列）。
5. **技术实力带**：深色区 + 光谱/参数可视化预览。
6. **CTA 区**：深色 + 暖光氛围，最终行动呼吁。
7. **Footer**：`--night-950`，多列链接 + 联系方式 + 版权。

### ODM 设计页（偏设计创意 · 明底为主）
Hero（大留白 + 暖调渐变 + 设计叙事）→ 服务流程（时间轴，1-2-3-4 步）→ 案例作品集（错落卡片）→ 设计能力（工艺/研发）→ 合作 CTA。

### 通用照明页（偏生活商业 · 明底 + 暗色产品卡）
Hero（场景氛围图）→ 产品分类（家用/商用 Tab）→ 产品网格（发光卡片）→ 场景应用（客厅/办公/商铺）→ 能效参数 → CTA。

### 植物灯页（偏技术专业 · 暗底为主 · Tech Utility）
Hero（深色 + 光谱动画）→ 光谱技术区（Spectrum Chart + 关键参数）→ 产品型号对比表 → 应用场景（种植/农业科技）→ 数据验证（PPFD 数据）→ CTA。

### 关于 / 联系页
关于：品牌故事（Warm Editorial 叙事排版）+ 团队 + 工厂/资质。
联系：表单（明底）+ 地图 + 联系方式卡。

---

## 10. Cautions（注意事项与反模式）

### Never Do
- ❌ 明底上使用强暖光发光（光晕 opacity > 0.15）——会显脏，光效只在暗底/产品发光场景生效。
- ❌ 一屏内多个争夺注意力的发光焦点——每视区最多一个主光源。
- ❌ 用高频闪烁/弹跳动效模拟「光」——光应呼吸、渐亮，不可闪烁（伤眼且显廉价）。
- ❌ 暖琥珀金作为浅底正文/链接色（对比度仅 2.2:1，不达标）。
- ❌ 技术参数区使用圆润大圆角（> 16px）——破坏仪表盘精密感。
- ❌ 标题使用 Bold/Black 字重——违背 Modern Minimal 的克制气质。
- ❌ 混用暖光与冷光（暖琥珀 + 冷蓝）于同一元素——暖主冷辅，分区使用。
- ❌ 纯黑 `#000` 大面积底色——用深夜蓝黑 `#0F0F1A` 保层次与温度。

### Prefer
- ✅ 用「边框 + 极浅阴影」而非重投影定义卡片边界（Linear 式克制）。
- ✅ 深色区用玻璃拟态 + 背景光效透出，强化「暗中有光」。
- ✅ 大留白 + Light 字重大标题，让光效成为视觉主角。
- ✅ 数据区用 Mono + 细栅格 + 状态色，营造精密技术感。
- ✅ 光效动态统一用呼吸/点亮/流光三种语言，保持品牌一致性。

---

## 11. Responsive Behavior（响应式行为）

| Name | Width | Behavior |
|------|-------|----------|
| Mobile | < 640px | 单列堆叠；导航折叠为汉堡抽屉；Display XL 降至 40px；Section 间距 `--space-2xl`（48px）；Hero 高度自适应不超过 100vh |
| Tablet | 640–1024px | 2 列网格；导航精简；技术表格横向滚动；标题降一档 |
| Desktop | > 1024px | 完整 12 列布局；3–4 列网格；固定导航；最大容器 1280px |
| Wide | > 1440px | 容器居中，两侧留白增大，背景氛围光扩展 |

**适配规则**：
- Hero 大标题用 `clamp()`：`clamp(2.5rem, 6vw, 4.5rem)`。
- 产品网格：`repeat(auto-fit, minmax(280px, 1fr))`。
- 技术参数表移动端转卡片式（键值对堆叠），或横向滚动保留表格。
- 光效强度移动端降 30%（性能与观感平衡）；`prefers-reduced-motion` 时全部关闭动态光效。
- 触摸目标最小 44×44px。

---

## 12. Agent Prompt Guide（Agent 生成指南）

### 关键指令
1. **色彩纪律**：暗色区底用 `--night-900/950`，暖光只做「光源/强调」，明底只做「净白/暖浅」。暖琥珀 `#F5A623` 是品牌识别色的唯一主角。
2. **光效克制**：光效是灵魂但必须克制——只在深底和产品处发光，一区一光源，opacity 有度。
3. **排版气质**：大标题 Light 字重 + 负字距；正文 400 不加粗；数据一律 Mono。
4. **技术区精密**：参数表、光谱图用 Mono + 细栅格 + 小圆角 + 状态色，绝不圆润化。
5. **动效语言**：用点亮/呼吸/流光/绘制四种光的动效，统一缓动与时长；尊重 reduced-motion。
6. **三线差异**：ODM 明底创意、通用照明亮产品卡、植物灯暗底仪表盘——共享色彩骨架，切换明暗模式与光效强度。

### Quick CSS Snippet（核心令牌速用）

```css
:root {
  /* — Brand 暖光琥珀 — */
  --brand-amber-50:  #FFF8EC;  --brand-amber-100: #FFEDCC;
  --brand-amber-300: #FFB84D;  --brand-amber-500: #F5A623;
  --brand-amber-600: #E0900F;  --brand-amber-700: #B87408;

  /* — Night 深夜蓝黑 — */
  --night-950:#0A0A14; --night-900:#0F0F1A; --night-800:#16162A;
  --night-700:#1A1A2E; --night-600:#232342; --night-500:#33334F;

  /* — Neutrals — */
  --neutral-0:#FFFFFF; --neutral-50:#FAFAFA; --neutral-100:#F4F4F5;
  --neutral-200:#E5E7EB; --neutral-300:#D1D5DB; --neutral-400:#9CA3AF;
  --neutral-500:#6B7280; --neutral-600:#4B5563; --neutral-900:#111827;

  /* — Tech — */
  --tech-blue-500:#2563EB; --tech-blue-600:#1D4ED8; --tech-cyan-400:#22D3EE;

  /* — Semantic — */
  --color-success:#10B981; --color-warning:#F59E0B;
  --color-danger:#EF4444;  --color-info:#3B82F6;

  /* — Spectrum (植物灯) — */
  --spectrum-violet:#8B5CF6; --spectrum-blue:#3B82F6; --spectrum-green:#22C55E;
  --spectrum-yellow:#FACC15; --spectrum-red:#EF4444;  --spectrum-deepred:#DC2626;

  /* — Surfaces (Light) — */
  --surface-bg:#FAFAFA; --surface-card:#FFFFFF; --surface-sunken:#F4F4F5;
  --border-subtle:#E5E7EB; --border-strong:#D1D5DB;
  --text-primary:#111827; --text-secondary:#6B7280; --text-tertiary:#9CA3AF;
  --text-on-dark:#F4F4F5; --text-on-dark-muted:#9CA3AF;

  /* — Typography — */
  --font-heading:"Inter","Geist",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  --font-body:"Inter",-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;
  --font-mono:"JetBrains Mono","IBM Plex Mono","SF Mono","Roboto Mono",ui-monospace,monospace;

  /* — Spacing — */
  --space-2xs:4px; --space-xs:8px; --space-sm:12px; --space-md:16px;
  --space-lg:24px; --space-xl:32px; --space-2xl:48px; --space-3xl:64px;
  --space-4xl:96px; --space-5xl:128px; --space-6xl:160px;

  /* — Radius — */
  --radius-xs:4px; --radius-sm:6px; --radius-md:10px; --radius-lg:16px;
  --radius-xl:24px; --radius-2xl:32px; --radius-full:9999px;

  /* — Shadow — */
  --shadow-raised:0 1px 2px rgba(17,24,39,.06),0 1px 3px rgba(17,24,39,.04);
  --shadow-floating:0 8px 24px rgba(17,24,39,.08),0 2px 6px rgba(17,24,39,.05);
  --shadow-overlay:0 20px 48px rgba(10,10,20,.18);

  /* — Glow (品牌光效) — */
  --glow-accent-sm:0 0 12px rgba(245,166,35,.35);
  --glow-accent-md:0 0 24px rgba(245,166,35,.45),0 0 48px rgba(245,166,35,.20);
  --glow-accent-lg:0 0 40px rgba(245,166,35,.50),0 0 80px rgba(245,166,35,.25);
  --glow-product:0 0 60px rgba(255,184,77,.55),0 8px 32px rgba(0,0,0,.30);
  --glow-tech-cyan:0 0 20px rgba(34,211,238,.40);
  --glow-ambient-radial:radial-gradient(ellipse at center,rgba(245,166,35,.18) 0%,rgba(245,166,35,.06) 40%,transparent 70%);
  --beam-cone:conic-gradient(from 180deg at 50% 0%,transparent 40%,rgba(245,166,35,.20) 50%,transparent 60%);
  --halo-bottom:radial-gradient(ellipse at 50% 100%,rgba(255,184,77,.30) 0%,transparent 65%);

  /* — Motion — */
  --ease-standard:cubic-bezier(0.4,0,0.2,1);
  --ease-out-soft:cubic-bezier(0.16,1,0.3,1);
  --duration-fast:150ms; --duration-base:300ms; --duration-slow:600ms;
  --duration-ambient:4000ms;
}
```

---

*— DESIGN.md 完 · 设计系统专家 彩格调（Cai）· Phase 2 交付物*
