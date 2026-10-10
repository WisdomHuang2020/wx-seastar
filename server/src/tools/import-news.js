#!/usr/bin/env node
'use strict';
/**
 * 把新闻从 JSON 迁进数据库（v0.28.0 起新闻入库）。
 *
 * 输入（都在仓库的 deploy/ 下）：
 *   news-data.json        英文原文（含 slug / images / thumb）
 *   cn-translations.json  中文译文，键是**老站 id**，含 title / summary / paras
 *
 * ⚠️ 段落数组必须**一一对应**：生成器按 paras[i] ↔ paras_zh[i] 逐段渲染。
 *    导入时若发现某篇中英段落数不一致，**明确报出来**而不是静默补齐 ——
 *    补齐会让中英错位，页面上看不出来但内容是错的。
 *
 * 用法：
 *   node src/tools/import-news.js                 # 导入（已存在则更新）
 *   node src/tools/import-news.js --dry           # 只看会做什么
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');

db.migrate();

const REPO = process.env.WX_REPO_DIR || path.resolve(__dirname, '..', '..', '..');
const DRY = process.argv.includes('--dry');

const EN = JSON.parse(fs.readFileSync(path.join(REPO, 'deploy', 'news-data.json'), 'utf8'));
const TRPATH = path.join(REPO, 'deploy', 'cn-translations.json');
const TR = fs.existsSync(TRPATH) ? JSON.parse(fs.readFileSync(TRPATH, 'utf8')) : {};

console.log(`  英文原文 ${EN.length} 条；中文译文 ${Object.keys(TR).length} 条\n`);

let ins = 0, upd = 0, missTr = 0, mismatch = [];
for (const a of EN) {
  const t = TR[a.id] || {};
  if (!Object.keys(t).length) missTr++;

  const paras = a.paras || [];
  const paras_zh = t.paras || [];
  // 段落数不一致就记下来 —— 静默补齐会让中英错位
  if (paras_zh.length && paras.length !== paras_zh.length) {
    mismatch.push(`${a.slug}：英文 ${paras.length} 段 / 中文 ${paras_zh.length} 段`);
  }

  const row = {
    src_id: String(a.id),
    slug: a.slug,
    date: a.date,
    title: a.title,
    title_zh: t.title || null,
    summary: (a.summary || '').trim() || null,
    summary_zh: (t.summary || '').trim() || null,
    paras: JSON.stringify(paras),
    paras_zh: JSON.stringify(paras_zh),
    images: JSON.stringify(a.images || []),
    thumb: a.thumb || null,
    cover: a.cover || null,
    nchar: a.nchar || null,
    published: 1,
  };

  const ex = db.get('SELECT id FROM news WHERE slug = ?', [row.slug]);
  if (DRY) { ex ? upd++ : ins++; continue; }
  if (ex) {
    db.run(`UPDATE news SET src_id=?, date=?, title=?, title_zh=?, summary=?, summary_zh=?,
              paras=?, paras_zh=?, images=?, thumb=?, cover=?, nchar=?,
              updated_at=datetime('now','localtime') WHERE id=?`,
      [row.src_id, row.date, row.title, row.title_zh, row.summary, row.summary_zh,
       row.paras, row.paras_zh, row.images, row.thumb, row.cover, row.nchar, ex.id]);
    upd++;
  } else {
    db.run(`INSERT INTO news (src_id, slug, date, title, title_zh, summary, summary_zh,
              paras, paras_zh, images, thumb, cover, nchar, published)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      [row.src_id, row.slug, row.date, row.title, row.title_zh, row.summary, row.summary_zh,
       row.paras, row.paras_zh, row.images, row.thumb, row.cover, row.nchar]);
    ins++;
  }
}

console.log(`  ${DRY ? '[dry] 将' : '已'}新增 ${ins} 条、更新 ${upd} 条`);
if (missTr) console.log(`  ⚠ ${missTr} 篇没有中文译文（中文页会回落显示英文）`);
if (mismatch.length) {
  console.log(`  ⚠ ${mismatch.length} 篇中英段落数不一致（会导致中英错位）：`);
  mismatch.forEach(m => console.log('      ' + m));
} else {
  console.log('  ✓ 中英段落数全部一一对应');
}

if (!DRY) {
  const n = db.scalar('SELECT COUNT(*) FROM news');
  const nozh = db.scalar("SELECT COUNT(*) FROM news WHERE title_zh IS NULL OR title_zh=''");
  console.log(`\n  库内共 ${n} 条；其中 ${nozh} 条没有中文标题`);
}
