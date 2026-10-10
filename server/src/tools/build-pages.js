#!/usr/bin/env node
'use strict';
/**
 * 由数据库里的「积木」重新生成页面 HTML。
 *
 * 这是 Creator 的**输出端**：编辑器改的是数据库，本脚本负责把改动变成
 * 可提交的源码。之所以不直接改 web 根目录的 .html，见 routes/creator.routes.js
 * 顶部说明（auto-deploy 会 `git reset --hard` + 覆盖发布，改了会被静默冲掉）。
 *
 * 用法：
 *   node src/tools/build-pages.js --slug oem --out /tmp/oem.html
 *   node src/tools/build-pages.js --slug oem --check oem.html     # 逐字节比对
 *   node src/tools/build-pages.js --all --out-dir /tmp/out        # 生成全部页面
 *
 * 退出码：
 *   0 正常；1 参数错误；2 --check 比对不一致（会打印首个差异位置）
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');

db.migrate();

const { renderPage } = require('../lib/render-page');

/** 第一个不同字符的位置（便于定位问题） */
function firstDiff(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  if (a.length !== b.length) return n;
  return -1;
}

const argv = process.argv.slice(2);
const get = (k) => { const i = argv.indexOf(k); return i < 0 ? null : argv[i + 1]; };

const checkAll = argv.includes('--check-all');
const slug = get('--slug');
const out = get('--out');
const check = get('--check');
const outDir = get('--out-dir');
const all = argv.includes('--all');

if (checkAll) {
  // 全站回归闸门：把每一页重新渲染一遍，与线上文件逐字节比对。
  // 这是「模板化没有引入视觉回归」的唯一硬证据，改任何渲染逻辑后都该跑。
  const rows = db.all('SELECT id, slug FROM pages ORDER BY slug');
  let bad = 0, empty = 0;
  for (const p of rows) {
    const f = path.join(process.env.WX_WEB_ROOT || '/var/www/wx-seastar', p.slug + '.html');
    if (!fs.existsSync(f)) { console.log(`  ? ${p.slug.padEnd(12)} 线上文件不存在: ${f}`); empty++; continue; }
    const orig = fs.readFileSync(f, 'utf8');
    const html = renderPage(p.id);
    const d = firstDiff(orig, html);
    if (d < 0) {
      console.log(`  ✓ ${p.slug.padEnd(12)} 逐字节一致（${html.length} 字节）`);
    } else {
      bad++;
      console.log(`  ✗ ${p.slug.padEnd(12)} 不一致 @ 第 ${d} 字节（原 ${orig.length} / 新 ${html.length}）`);
      console.log('      原: ' + JSON.stringify(orig.slice(Math.max(0, d - 30), d + 50)));
      console.log('      新: ' + JSON.stringify(html.slice(Math.max(0, d - 30), d + 50)));
    }
  }
  console.log(`\n  共 ${rows.length} 页：一致 ${rows.length - bad - empty} / 不一致 ${bad} / 缺文件 ${empty}`);
  process.exit(bad ? 2 : 0);
}

if (!slug && !all) {
  console.error('用法：--slug <slug> [--out 文件 | --check 原文件]  或  --all --out-dir <目录>  或  --check-all');
  process.exit(1);
}

const targets = all
  ? db.all('SELECT * FROM pages ORDER BY slug')
  : [db.get('SELECT * FROM pages WHERE slug = ?', [slug])].filter(Boolean);

if (!targets.length) { console.error('✗ 页面不存在：' + slug); process.exit(1); }

let failed = 0;
for (const p of targets) {
  const html = renderPage(p.id);

  if (check) {
    const orig = fs.readFileSync(check, 'utf8');
    const d = firstDiff(orig, html);
    if (d < 0) {
      console.log(`  ✓ ${p.slug}  逐字节一致（${html.length} 字节）`);
    } else {
      failed++;
      console.log(`  ✗ ${p.slug}  不一致 @ 第 ${d} 字节（原 ${orig.length} / 新 ${html.length}）`);
      console.log('     原: ' + JSON.stringify(orig.slice(Math.max(0, d - 40), d + 60)));
      console.log('     新: ' + JSON.stringify(html.slice(Math.max(0, d - 40), d + 60)));
    }
    continue;
  }

  const dest = out || path.join(outDir, p.slug + '.html');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  // 强制 LF，与项目纪律一致（本机默认 CRLF 会毒化 .sh 与部署）
  fs.writeFileSync(dest, html.replace(/\r\n/g, '\n'), 'utf8');
  console.log(`  ✓ ${p.slug} → ${dest}  (${html.length} 字节)`);
}

process.exit(failed ? 2 : 0);
