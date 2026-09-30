#!/usr/bin/env node
'use strict';
/**
 * 修复产品封面图错配。
 *
 * 问题：seed-products.js 早期按文件名猜测映射，导致图片与产品型号不一致。
 * 本脚本按「图上实际印出的型号」重新绑定 cover_media，并清理 LED 产品线中
 * 所有未经确认的配图。
 *
 * 用法：
 *   node src/tools/fix-product-images.js
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const cfg = require('../config');

db.migrate();

const IMG_DIR = path.join(cfg.uploadDir, 'img');
const SRC_CANDIDATES = [
  path.join(cfg.webRoot, 'assets', 'img'),
  path.resolve(__dirname, '..', '..', '..', 'assets', 'img'),
].filter(p => fs.existsSync(p));

if (!SRC_CANDIDATES.length) {
  console.error('❌ 找不到产品图片源目录。');
  process.exit(1);
}
const SRC_DIR = SRC_CANDIDATES[0];

// 经过逐张读图核对后的正确映射：slug → 图片文件名
// 只保留「图上明确印出产品型号」的图片；无法确认的不配图。
const CORRECT_MAP = {
  'cdx2-mesh-ble':     'prod-cdx2-ble.jpg',     // 图上印 CDX2 BLE
  // cdx8-flood-module：prod-cdx8.jpg 上没有印 CDX8，仅外形无法确认，不配。
  'cdx11-retrofit-277v':'prod-series-a.jpg',    // 图上印 CDX11
  'fmx15-slim-surface':'prod-fmx15.jpg',        // 图上印 FMX15
  'wrpx3-prismatic':   'prod-neon-strip-b.jpg', // 图上印 WRPX3（文件名历史遗留）
};

function ensureMedia(filename) {
  if (!filename) return null;
  const src = path.join(SRC_DIR, filename);
  if (!fs.existsSync(src)) {
    console.error('⚠️  源图片不存在：' + filename);
    return null;
  }
  const dst = path.join(IMG_DIR, filename);
  fs.mkdirSync(IMG_DIR, { recursive: true });
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);

  const row = db.get('SELECT * FROM media WHERE filename = ?', [filename]);
  if (row) return row.id;
  const r = db.run(
    'INSERT INTO media (filename, original_name, mime, size) VALUES (?,?,?,?)',
    [filename, filename, 'image/jpeg', fs.statSync(dst).size]
  );
  return r.lastInsertRowid;
}

let updated = 0, missing = 0, cleared = 0;

db.tx(() => {
  // 1) 先清理 LED 产品线所有产品的封面，把之前错配的图全部卸掉，
  //    之后只重新绑定确认无误的图片。
  const pmBefore = db.scalar('SELECT COUNT(*) FROM product_media') || 0;
  db.run("UPDATE products SET cover_media = NULL WHERE category = 'led-lighting'");
  db.run("DELETE FROM product_media WHERE product_id IN (SELECT id FROM products WHERE category = 'led-lighting')");
  const pmAfter = db.scalar('SELECT COUNT(*) FROM product_media') || 0;
  cleared = pmBefore - pmAfter;

  // 2) 按正确映射重新绑定
  for (const [slug, filename] of Object.entries(CORRECT_MAP)) {
    const product = db.get('SELECT id, title_en FROM products WHERE slug = ?', [slug]);
    if (!product) {
      console.log('⚠️  产品不存在：' + slug);
      missing++;
      continue;
    }
    const mid = ensureMedia(filename);
    if (!mid) {
      console.log('⚠️  图片无法确保：' + filename);
      missing++;
      continue;
    }
    db.run('UPDATE products SET cover_media = ? WHERE id = ?', [mid, product.id]);
    db.run(
      'INSERT OR REPLACE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)',
      [product.id, mid]
    );
    console.log(`✅ ${slug} → ${filename}  (${product.title_en})`);
    updated++;
  }
});

console.log(`\n修复完成：重新绑定 ${updated} 张，清理 LED 产品线旧配图 ${cleared} 条，缺失 ${missing} 个。`);
console.log('其余 20 个通用照明型号与全部 ODM 型号仍不配图，前台显示「素材待补充」。');
