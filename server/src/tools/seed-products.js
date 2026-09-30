#!/usr/bin/env node
'use strict';
/**
 * 把原官网 www.wx-seastar.com 的产品导入数据库。
 *
 * ⚠️ 数据纪律（务必遵守）：
 *   原官网的产品页**只有一行产品名**，没有任何规格参数、简介或分类。
 *   因此这里只写 title_en（原文），其余字段一律留空 ——
 *   **不允许为了"好看"而给产品编造规格参数、中文名或宣传语**。
 *
 * ── 产品图的取法（2026-09-30 第三次修正，这次是有依据的）──────────────
 *   原始素材文件名是建站方按顺序生成的（1764299xxx.png），与型号无关；
 *   前两轮靠"猜文件名"映射，连续配错。
 *   现在改为：图片由 `deploy/fetch-product-images.py` 从原官网
 *   LED 页 / ODM 页的**栏目结构**里按「产品名 ↔ 图片 URL」的真实关系抓取，
 *   并**以 slug 命名**存于 `assets/img/product/<slug>.jpg`。
 *   → 文件名即 slug，**映射表被取消**，错配这一类问题从机制上不再可能。
 *
 *   node src/tools/seed-products.js          # 幂等：已存在则只补图，不覆盖后台改过的内容
 *   node src/tools/seed-products.js --reset  # 清空产品表后重建（会丢失后台的修改）
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const cfg = require('../config');

db.migrate();

const IMG_DIR = path.join(cfg.uploadDir, 'img');
// 图片源目录：<repo>/assets/img/product/  或  <webroot>/assets/img/product/
const SRC_CANDIDATES = [
  path.join(cfg.webRoot, 'assets', 'img', 'product'),
  path.resolve(__dirname, '..', '..', '..', 'assets', 'img', 'product'),
].filter(p => fs.existsSync(p));

if (!SRC_CANDIDATES.length) {
  console.error('❌ 找不到产品图源目录 assets/img/product/。请先跑 deploy/fetch-product-images.py。');
  process.exit(1);
}
const SRC_DIR = SRC_CANDIDATES[0];

/**
 * 产品清单 —— 名称一律照抄原官网原文（www.wx-seastar.com）
 * 格式：[slug, 原官网产品名（原文，勿改）]
 *
 * 图片**不在这里指定** —— 约定为 `assets/img/product/<slug>.jpg`，
 * 由 ensureMediaFor() 按 slug 直接取。缺文件就如实不配图（前台显示「素材待补充」）。
 *
 * category 字段表示业务线：led-lighting = 通用照明灯具 / driver-odm = 驱动与控制板。
 * 原官网并未给出产品分类，所以这里不做任何细分。
 */
const PRODUCTS = [
  // ── LED LIGHTING（24 个，原官网 LED 页「全部」标签下的完整清单）──
  ['cdx2-mesh-ble',            'CDX2 MESH BLE Wireless Control Commercial Downlight'],
  ['cdx8-flood-module',        'CDX8 Flood Module Commercial Downlight'],
  ['cdx11-retrofit-277v',      'CDX11 120-277V Retrofit Commercial Downlight'],
  ['fmx15-slim-surface',       'FMX15 5/7/9/12/15/19/24in Slim Surface Mount'],
  ['wrpx3-prismatic',          'WRPX3 Prismatic Wraparound'],
  ['3d-neon-strip',            '3D Neon Strip'],
  ['vntx2-square-vanity',      'VNTX2 Series Square Vanity'],
  ['bpx6-slot-panel',          'BPX6 Slot Panel Light'],
  ['bpx9-prow-panel',          'BPX9 Prow Luxury Panel Light'],
  ['rdx3-5cct-slim',           'RDX3 5CCT & Wattage Selectable  Slim Downlight'],
  ['fmx11-pro-surface',        'FMX11 Pro Surface Mount'],
  ['fmx11-regress-surface',    'FMX11 Regress Surface Mount'],
  ['cldx3-cylinder',           'CLDX3 Cylinder'],
  ['eclx2-ceiling',            'ECLX2 Series LED Ceiling Light'],
  ['eclx3-ceiling',            'ECLX3 Series LED Ceiling Light'],
  ['eclx6-ceiling',            'ECLX6 Series LED Ceiling Light'],
  ['eclx7-ceiling',            'ECLX7 Series LED Ceiling Light'],
  ['ecdx7-recessed',           'ECDX7 Commercial Recessed Downlight'],
  ['ecdx9-recessed',           'ECDX9 Commercial Recessed Downlight'],
  ['ecdx11-surface',           'ECDX11 Commercial Surface Downlight'],
  ['dfx2-round',               'DFX2 Round LED Downlight'],
  ['vdlx1-round',              'VDLX1 Round LED Downlight'],
  ['espx2-slim-panel',         'ESPX2 Slim Panel Light'],
  ['espx3-backlight-panel',    'ESPX3 Slim Backlight Panel'],
];

/** ODM/OEM 业务线 —— 原官网是「DRIVER AND CONTROL BOARD」，不是灯具定制 */
const DRIVERS = [
  ['drv-triac-120v',   '120V TRIAC Driver 8-30W, Single CCT or 5CCT'],
  ['drv-tri-mode',     'Tri-mode, TRIAC & 0-10V, CCT & Wattage Selectable Driver 10-55W'],
  ['drv-0-10v',        '0-10V, CCT & Wattage Selectable Driver 10-55W'],
  ['drv-sensor-pacb',  'Sensor Control PACB'],
  ['drv-ble-wireless', 'BLE & Wireless Control Driver 20-40W'],
  ['drv-uv-bms',       'UV Sterilizer Li-ion Battery BMS Board'],
];

fs.mkdirSync(IMG_DIR, { recursive: true });

/**
 * 把 <src>/<slug>.jpg 复制进 uploads/img 并登记 media 表。
 * 找不到文件就返回 null（前台如实显示「素材待补充」，不拿别的东西凑）。
 */
function ensureMediaFor(slug) {
  const filename = slug + '.jpg';
  const src = path.join(SRC_DIR, filename);
  if (!fs.existsSync(src)) return null;

  const dst = path.join(IMG_DIR, filename);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);

  const row = db.get('SELECT * FROM media WHERE filename = ?', [filename]);
  if (row) return row.id;
  const r = db.run(
    'INSERT INTO media (filename, original_name, mime, size) VALUES (?,?,?,?)',
    [filename, filename, 'image/jpeg', fs.statSync(dst).size]);
  return r.lastInsertRowid;
}

/** 通用的「写入或补图」逻辑，避免两台设备重复代码 */
function upsert(slug, category, titleEn, order, counters) {
  const exists = db.get('SELECT * FROM products WHERE slug = ?', [slug]);
  if (exists) {
    if (!exists.cover_media) {
      const mid = ensureMediaFor(slug);
      if (mid) {
        db.run('UPDATE products SET cover_media = ? WHERE id = ?', [mid, exists.id]);
        db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)', [exists.id, mid]);
        counters.imaged++;
      } else counters.noimg++;
    }
    counters.skipped++;
    return;
  }
  const mid = ensureMediaFor(slug);
  if (!mid) counters.noimg++;
  const r = db.run(
    `INSERT INTO products (slug, category, title_zh, title_en, specs, badges,
                           cover_media, sort_order, published)
     VALUES (?,?,?,?,?,?,?,?,1)`,
    [
      slug,
      category,
      null,       // 原官网无中文名 —— 留空，不编造
      titleEn,    // 原文照抄
      '[]',       // 原官网无规格参数 —— 空数组，不编造
      '[]',       // 原官网无角标 —— 空数组
      mid, order,
    ]
  );
  if (mid) db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)', [r.lastInsertRowid, mid]);
  counters.created++;
}

const reset = process.argv.includes('--reset');
if (reset) {
  db.tx(() => {
    db.run('DELETE FROM product_media');
    db.run('DELETE FROM products');
  });
  console.log('⚠️  已清空产品表（--reset）');
}

const c = { created: 0, skipped: 0, imaged: 0, noimg: 0 };

db.tx(() => {
  let order = 0;
  for (const [slug, titleEn] of PRODUCTS) {      // 通用照明
    order += 10;
    upsert(slug, 'led-lighting', titleEn, order, c);
  }
  order = 10000;                                  // ODM 驱动
  for (const [slug, titleEn] of DRIVERS) {
    order += 10;
    upsert(slug, 'driver-odm', titleEn, order, c);
  }
});

console.log(`✅ 导入完成：新增 ${c.created} 个，跳过 ${c.skipped} 个，补图 ${c.imaged} 张，无图 ${c.noimg} 个`);
console.log(`   通用照明 ${db.scalar("SELECT COUNT(*) FROM products WHERE category='led-lighting'")} 个` +
            ` / ODM 驱动 ${db.scalar("SELECT COUNT(*) FROM products WHERE category='driver-odm'")} 个`);
console.log(`   有封面图 ${db.scalar('SELECT COUNT(*) FROM products WHERE cover_media IS NOT NULL')} 个`);
console.log('');
console.log('   注意：产品名称一律照抄原官网原文，规格参数与简介**故意留空** ——');
console.log('        原官网没有这些信息，编造会与事实不符。素材补齐后可在后台填。');
