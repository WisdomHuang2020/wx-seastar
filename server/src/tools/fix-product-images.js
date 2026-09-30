#!/usr/bin/env node
'use strict';
/**
 * 按 slug 重新绑定全部产品封面图。
 *
 * 背景：早期产品图靠"猜文件名"映射，连续两轮配错。
 * 现在图片统一以 slug 命名（assets/img/product/<slug>.jpg），
 * 由 deploy/fetch-product-images.py 从原官网按栏目结构抓取。
 * 本脚本把数据库里的 cover_media 与这套命名**对齐**，
 * 并清掉所有对不上号的旧图关联。
 *
 * 幂等，可反复执行。
 *
 *   node src/tools/fix-product-images.js
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const cfg = require('../config');

db.migrate();

const IMG_DIR = path.join(cfg.uploadDir, 'img');
const SRC_CANDIDATES = [
  path.join(cfg.webRoot, 'assets', 'img', 'product'),
  path.resolve(__dirname, '..', '..', '..', 'assets', 'img', 'product'),
].filter(p => fs.existsSync(p));

if (!SRC_CANDIDATES.length) {
  console.error('❌ 找不到 assets/img/product/。请先跑 deploy/fetch-product-images.py。');
  process.exit(1);
}
const SRC_DIR = SRC_CANDIDATES[0];

function ensureMedia(filename) {
  const src = path.join(SRC_DIR, filename);
  if (!fs.existsSync(src)) return null;

  fs.mkdirSync(IMG_DIR, { recursive: true });
  const dst = path.join(IMG_DIR, filename);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);

  const row = db.get('SELECT * FROM media WHERE filename = ?', [filename]);
  if (row) return row.id;
  const r = db.run(
    'INSERT INTO media (filename, original_name, mime, size) VALUES (?,?,?,?)',
    [filename, filename, 'image/jpeg', fs.statSync(dst).size]);
  return r.lastInsertRowid;
}

let rebound = 0, cleared = 0, noimg = 0;
const missing = [];

db.tx(() => {
  // 1) 全部先卸掉（含 product_media 关联），之后按 slug 重新绑定。
  //    之所以全清：旧图是"猜"出来的，逐条判断对错本身不可靠；
  //    而新素材是按原官网栏目结构抓的，可以无条件信任。
  cleared = db.scalar('SELECT COUNT(*) FROM product_media') || 0;
  db.run('UPDATE products SET cover_media = NULL');
  db.run('DELETE FROM product_media');

  // 2) 逐个产品按 <slug>.jpg 绑定
  for (const p of db.all('SELECT id, slug FROM products ORDER BY sort_order, id')) {
    const mid = ensureMedia(p.slug + '.jpg');
    if (!mid) { noimg++; missing.push(p.slug); continue; }
    db.run('UPDATE products SET cover_media = ? WHERE id = ?', [mid, p.id]);
    db.run('INSERT OR REPLACE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)', [p.id, mid]);
    rebound++;
  }
});

const ledN = db.scalar("SELECT COUNT(*) FROM products WHERE category='led-lighting'") || 0;
const ledI = db.scalar("SELECT COUNT(*) FROM products WHERE category='led-lighting' AND cover_media IS NOT NULL") || 0;
const odmN = db.scalar("SELECT COUNT(*) FROM products WHERE category='driver-odm'") || 0;
const odmI = db.scalar("SELECT COUNT(*) FROM products WHERE category='driver-odm' AND cover_media IS NOT NULL") || 0;

console.log(`✅ 重新绑定 ${rebound} 张，清理旧关联 ${cleared} 条，无图 ${noimg} 个。`);
if (missing.length) console.log('   无图（如实显示「素材待补充」）：' + missing.join(', '));
console.log(`   通用照明 ${ledI}/${ledN} 有图；ODM 驱动 ${odmI}/${odmN} 有图。`);
