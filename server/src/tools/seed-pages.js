#!/usr/bin/env node
'use strict';
/**
 * 把一个前台页面拆成「积木」（page_blocks），供 Creator 可视化编辑。
 *
 * ── 为什么用「HTML 片段」而不是「结构化字段」──────────────────────────
 *   现有 78 个页面是手工排版的，结构各不相同。硬拆成 {标题, 副标题, 图片…}
 *   这类字段，必然产生视觉回归（间距、换行、内联样式都会丢）。
 *   所以这里只做**切分**，不做**解析**：每个 <section> 原样存为一段片段，
 *   拼回去必须与原文件**逐字节一致**。
 *
 *   编辑器要「改文案与图片」，靠的是在片段内部就地编辑文字节点与图片地址，
 *   而不是靠结构化字段 —— 这也正好卡住"搭积木的自由，不给改图纸的自由"。
 *
 * ── 页面骨架的三段式 ──────────────────────────────────────────────────
 *   [preamble]  <!DOCTYPE …> … <main>        ← locked，全局组件（导航/抽屉）
 *   [blocks]    <main> 内每个 <section>       ← 可编辑
 *   [epilogue]  </main> … </html>            ← locked，页脚
 *
 * 用法：
 *   node src/tools/seed-pages.js oem           # 只处理 oem（中英各一页）
 *   node src/tools/seed-pages.js               # 处理内置清单
 *   node src/tools/seed-pages.js --reset oem   # 先删该页再重建
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const db = require('../lib/db');
const cfg = require('../config');

/**
 * 取部署副本当前的 origin/main —— 记进 pages.base_sha，作为**基线**。
 *
 * 为什么需要它：拆页之后如果开发者又改了 .html，库里的积木就**过期**了。
 * 发布服务靠这个基线判断"目标文件在这一版之后有没有被改过"，
 * 被改过就拒绝发布并报冲突，而不是闷头把别人的改动覆盖掉。
 */
function originMainSha() {
  const repo = process.env.WX_REPO_DIR || '/opt/wx-seastar/repo';
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', 'origin/main'],
      { encoding: 'utf8', timeout: 15000 }).trim();
  } catch { return null; }
}

db.migrate();

/**
 * 接入模板化的页面。
 *
 * ⚠️ **不含 `news.html` / `cn/news.html`** —— 那两个是 `deploy/build-news.py`
 *    生成的，两边同时"拥有"同一份文件必然打架。新闻要走数据库驱动需另案处理。
 * ⚠️ 也不含 `news/` 下的 56 篇文章页，理由同上。
 */
const COLS = ['index', 'lighting', 'grow-light', 'odm', 'oem', 'facilities', 'docs', 'about', 'contact', '404'];
const PAGES = [
  ...COLS.map(c => ({ slug: c, lang: 'en', file: c + '.html' })),
  ...COLS.map(c => ({ slug: 'cn/' + c, lang: 'zh', file: 'cn/' + c + '.html' })),
];

/** 站点根目录：优先用 web 根，其次用仓库根 */
function repoRoot() {
  const cands = [cfg.webRoot, path.resolve(__dirname, '..', '..', '..')];
  for (const c of cands) {
    if (c && fs.existsSync(path.join(c, 'oem.html'))) return c;
  }
  throw new Error('找不到站点根目录（需要含 oem.html）');
}

/** 从 section 的属性推断模块类型（只用于 UI 归类与图标） */
function kindOf(attrs) {
  const a = attrs || '';
  if (/hero-split/.test(a)) return 'hero';
  if (/\bcta-band\b|\boem-cta\b/.test(a)) return 'cta';
  if (/\bsection\s+dark\b|\btech-band\b/.test(a)) return 'section-dark';
  if (/section-tight/.test(a)) return 'section-tight';
  return 'section';
}

/**
 * 把整页切成 preamble / sections / epilogue。
 * 用**括号配平**找 <section> 的结束位置，避免嵌套 section 时切错。
 */
function splitPage(html) {
  const mi = html.indexOf('<main>');
  if (mi < 0) throw new Error('未找到 <main>');
  const me = html.lastIndexOf('</main>');
  if (me < 0) throw new Error('未找到 </main>');

  const mainEnd = mi + '<main>'.length;
  // preamble 到 <main> 为止；此后每个 section 各自带走"它之前的原文前缀"
  const preamble = html.slice(0, mainEnd);

  const sections = [];
  let prevEnd = mainEnd;                 // html 坐标
  const re = /<section\b/g;
  re.lastIndex = mainEnd;
  let m;
  while ((m = re.exec(html))) {
    const start = m.index;
    if (start >= me) break;
    // 括号配平找结束位置（防止嵌套 section 切错）
    let depth = 0, end = -1;
    const tok = /<(\/?)section\b[^>]*>/g;
    tok.lastIndex = start;
    let t2;
    while ((t2 = tok.exec(html))) {
      depth += t2[1] ? -1 : 1;
      if (depth === 0) { end = t2.index + t2[0].length; break; }
    }
    if (end < 0) throw new Error('section 未闭合 @' + start);

    // ⚠️ prefix 必须**逐字保留**（空白 + 注释）。
    //    初版把注释内的换行/缩进规范化掉了，含换行注释的页面（index/lighting）
    //    重建时对不上 —— 原文空白是内容的一部分，不是装饰。
    const prefix = html.slice(prevEnd, start);
    const full = html.slice(start, end);
    const tagEnd = full.indexOf('>');
    const attrs = full.slice('<section'.length, tagEnd).trim();
    const openLen = '<section'.length + (attrs ? attrs.length + 1 : 0) + 1;
    const content = full.slice(openLen, full.lastIndexOf('</section>'));

    // 模块名（仅供界面展示）：取 prefix 里最后一段 <!-- --> 并压平空白
    let comment = null;
    const k = prefix.lastIndexOf('<!--');
    if (k >= 0) {
      const e = prefix.indexOf('-->', k);
      if (e >= 0) comment = prefix.slice(k + 4, e).replace(/\s+/g, ' ').trim();
    }

    sections.push({ prefix, attrs, content, comment, kind: kindOf(attrs) });
    prevEnd = end;
    re.lastIndex = end;
  }
  // ⚠️ epilogue 必须从**最后一个 section 的结束处**开始，
  //    而不是从 </main> 开始 —— 否则 `</section>` 与 `</main>` 之间那段空白
  //    既不属于任何模块的前缀、也不属于 epilogue，会被吞掉。
  const epilogue = html.slice(prevEnd);
  return { preamble, sections, epilogue };
}

/** 取 head 里的 title / description */
function headMeta(html) {
  const t = html.match(/<title>([\s\S]*?)<\/title>/);
  const d = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  return { title: t ? t[1].trim() : null, description: d ? d[1] : null };
}

const args = process.argv.slice(2);
const reset = args.includes('--reset');
const only = args.filter(a => !a.startsWith('--'));

const root = repoRoot();
console.log('站点根目录: ' + root);

const targets = PAGES.filter(p => !only.length || only.some(o => p.slug === o || p.slug.endsWith('/' + o)));
if (only.includes('all')) { /* --all 已在上面覆盖 */ }

for (const spec of targets) {
  const abs = path.join(root, spec.file);
  if (!fs.existsSync(abs)) { console.log('  ✗ 找不到 ' + spec.file); continue; }

  const html = fs.readFileSync(abs, 'utf8');
  const { preamble, sections, epilogue } = splitPage(html);
  const meta = headMeta(html);

  const exist = db.get('SELECT * FROM pages WHERE slug = ?', [spec.slug]);
  if (exist && !reset) {
    console.log('  - ' + spec.slug + ' 已存在，跳过（加 --reset 重建）');
    continue;
  }

  db.tx(() => {
    if (exist) {
      db.run('DELETE FROM page_blocks WHERE page_id = ?', [exist.id]);
      db.run('DELETE FROM pages WHERE id = ?', [exist.id]);
    }
    const base = originMainSha();
    const r = db.run(
      'INSERT INTO pages (slug, lang, title, description, published, base_sha) VALUES (?,?,?,?,0,?)',
      [spec.slug, spec.lang, meta.title, meta.description, base]);
    const pid = r.lastInsertRowid;

    let order = 0;
    // ① preamble —— 全局组件，锁定
    db.run(`INSERT INTO page_blocks (page_id, sort_order, kind, tag, attrs, comment, content, visible, locked, style)
            VALUES (?,?,?,?,?,?,?,1,1,'{}')`,
      [pid, ++order, 'shell-preamble', 'shell', '', '页面骨架（导航等全局组件）', preamble]);

    // ② 内容 section —— 可编辑
    for (const s of sections) {
      db.run(`INSERT INTO page_blocks (page_id, sort_order, kind, tag, attrs, comment, prefix, content, visible, locked, style)
              VALUES (?,?,?,?,?,?,?,?,1,0,'{}')`,
        [pid, ++order, s.kind, 'section', s.attrs, s.comment, s.prefix, s.content]);
    }

    // ③ epilogue —— 页脚，锁定
    db.run(`INSERT INTO page_blocks (page_id, sort_order, kind, tag, attrs, comment, content, visible, locked, style)
            VALUES (?,?,?,?,?,?,?,1,1,'{}')`,
      [pid, ++order, 'shell-epilogue', 'shell', '', '页脚', epilogue]);

    console.log(`  ✓ ${spec.slug}  ${sections.length} 个内容模块 + 2 个锁定块  基线=${base ? base.slice(0, 8) : '(未取到)'}`);
    sections.forEach((s, i) => console.log(`      ${String(i + 1).padStart(2)}  ${s.kind.padEnd(14)} ${(s.comment || '').slice(0, 40)}`));
  });
}

const n = db.scalar('SELECT COUNT(*) FROM pages');
const b = db.scalar('SELECT COUNT(*) FROM page_blocks');
console.log(`\n  当前库内：${n} 个页面 / ${b} 个模块`);
