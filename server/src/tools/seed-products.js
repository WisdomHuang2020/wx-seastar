#!/usr/bin/env node
'use strict';
/**
 * 把原官网 www.wx-seastar.com 的产品导入数据库。
 *
 * ⚠️ 数据纪律（务必遵守）：
 *   原官网的产品页**只有一行产品名**，没有任何规格参数、简介或分类。
 *   因此这里只写 title_en（原文），其余字段一律留空 ——
 *   **不允许为了"好看"而给产品编造规格参数、中文名或宣传语**。
 *   素材缺的部分由前台如实显示"素材待补充"，而不是拿别的东西凑。
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
const SRC_CANDIDATES = [
  path.join(cfg.webRoot, 'assets', 'img'),
  path.resolve(__dirname, '..', '..', '..', 'assets', 'img'),
].filter(p => fs.existsSync(p));

if (!SRC_CANDIDATES.length) {
  console.error('❌ 找不到产品图片源目录。请确认站点已部署（web 根下应有 assets/img）。');
  process.exit(1);
}
const SRC_DIR = SRC_CANDIDATES[0];

/**
 * 产品清单 —— 名称一律照抄原官网原文（www.wx-seastar.com → LED LIGHTING）
 * 格式：[slug, 原官网产品名（原文，勿改）, 配图文件名]
 *
 * category 字段表示业务线：led-lighting = 通用照明灯具。
 * 原官网并未给出产品分类，所以这里不做任何细分。
 */
const PRODUCTS = [
  ['3d-neon-strip',            '3D Neon Strip',                                        'prod-neon-strip.jpg'],
  ['wrpx3-prismatic',          'WRPX3 Prismatic Wraparound',                           'prod-wrpx3.jpg'],
  ['fmx15-slim-surface',       'FMX15 5/7/9/12/15/19/24in Slim Surface Mount',         'prod-fmx15.jpg'],
  ['cdx11-retrofit-277v',      'CDX11 120-277V Retrofit Commercial Downlight',         'prod-cdx11.jpg'],
  ['cdx2-mesh-ble',            'CDX2 MESH BLE Wireless Control Commercial Downlight',   'prod-cdx2-ble.jpg'],
  ['cdx8-flood-module',        'CDX8 Flood Module Commercial Downlight',                'prod-cdx8.jpg'],
  ['vntx2-square-vanity',      'VNTX2 Series Square Vanity',                           'prod-vntx2.jpg'],
  ['bpx6-slot-panel',          'BPX6 Slot Panel Light',                                'prod-bpx6.jpg'],
  ['bpx9-prow-panel',          'BPX9 Prow Luxury Panel Light',                         'prod-series-a.jpg'],
  ['rdx3-5cct-slim',           'RDX3 5CCT & Wattage Selectable  Slim Downlight',       'prod-series-a.jpg'],
  ['fmx11-pro-surface',        'FMX11 Pro Surface Mount',                              'prod-linear-l.jpg'],
  ['fmx11-regress-surface',    'FMX11 Regress Surface Mount',                          'prod-linear-l.jpg'],
  ['cldx3-cylinder',           'CLDX3 Cylinder',                                       'prod-linear-round.jpg'],
  ['eclx2-ceiling',            'ECLX2 Series LED Ceiling Light',                       'prod-eclx.jpg'],
  ['eclx3-ceiling',            'ECLX3 Series LED Ceiling Light',                       'prod-eclx.jpg'],
  ['eclx6-ceiling',            'ECLX6 Series LED Ceiling Light',                       'prod-eclx.jpg'],
  ['eclx7-ceiling',            'ECLX7 Series LED Ceiling Light',                       'prod-eclx.jpg'],
  ['ecdx7-recessed',           'ECDX7 Commercial Recessed Downlight',                  'prod-cdx8.jpg'],
  ['ecdx9-recessed',           'ECDX9 Commercial Recessed Downlight',                  'prod-cdx11.jpg'],
  ['ecdx11-surface',           'ECDX11 Commercial Surface Downlight',                  'prod-cdx2-ble.jpg'],
  ['dfx2-round',               'DFX2 Round LED Downlight',                             'prod-series-b.jpg'],
  ['vdlx1-round',              'VDLX1 Round LED Downlight',                            'prod-series-b.jpg'],
  ['espx2-slim-panel',         'ESPX2 Slim Panel Light',                               'prod-series-b.jpg'],
  ['espx3-backlight-panel',    'ESPX3 Slim Backlight Panel',                           'prod-eclx.jpg'],
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

function ensureMedia(filename) {
  if (!filename) return null;
  const src = path.join(SRC_DIR, filename);
  if (!fs.existsSync(src)) return null;
  const dst = path.join(IMG_DIR, filename);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);

  const row = db.get('SELECT * FROM media WHERE filename = ?', [filename]);
  if (row) return row.id;
  const r = db.run('INSERT INTO media (filename, original_name, mime, size) VALUES (?,?,?,?)',
    [filename, filename, 'image/jpeg', fs.statSync(dst).size]);
  return r.lastInsertRowid;
}

const reset = process.argv.includes('--reset');
if (reset) {
  db.tx(() => {
    db.run('DELETE FROM product_media');
    db.run('DELETE FROM products');
  });
  console.log('⚠️  已清空产品表（--reset）');
}

let created = 0, skipped = 0, imaged = 0;

db.tx(() => {
  let order = 0;

  // ── 通用照明产品（原官网 LED LIGHTING）──
  for (const [slug, titleEn, img] of PRODUCTS) {
    order += 10;
    const exists = db.get('SELECT * FROM products WHERE slug = ?', [slug]);
    if (exists) {
      if (!exists.cover_media) {
        const mid = ensureMedia(img);
        if (mid) {
          db.run('UPDATE products SET cover_media = ? WHERE id = ?', [mid, exists.id]);
          db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)', [exists.id, mid]);
          imaged++;
        }
      }
      skipped++;
      continue;
    }
    const mid = ensureMedia(img);
    const r = db.run(
      `INSERT INTO products (slug, category, title_zh, title_en, specs, badges,
                             cover_media, sort_order, published)
       VALUES (?,?,?,?,?,?,?,?,1)`,
      [
        slug,
        'led-lighting',      // 业务线
        null,                // 原官网无中文名 —— 留空，不编造
        titleEn,             // 原文照抄
        '[]',                // 原官网无规格参数 —— 空数组，不编造
        '[]',                // 原官网无角标 —— 空数组
        mid, order,
      ]
    );
    if (mid) db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)', [r.lastInsertRowid, mid]);
    created++;
  }

  // ── ODM/OEM 产品线（原官网 DRIVER AND CONTROL BOARD）──
  order = 10000;
  for (const [slug, titleEn] of DRIVERS) {
    order += 10;
    if (db.get('SELECT 1 FROM products WHERE slug = ?', [slug])) { skipped++; continue; }
    db.run(
      `INSERT INTO products (slug, category, title_zh, title_en, specs, badges,
                             cover_media, sort_order, published)
       VALUES (?,?,?,?,?,?,NULL,?,1)`,
      [slug, 'driver-odm', null, titleEn, '[]', '[]', order]
    );
    created++;
  }
});

console.log(`✅ 导入完成：新增 ${created} 个，跳过 ${skipped} 个，补图 ${imaged} 张`);
console.log(`   通用照明 ${db.scalar("SELECT COUNT(*) FROM products WHERE category='led-lighting'")} 个` +
            ` / ODM 驱动 ${db.scalar("SELECT COUNT(*) FROM products WHERE category='driver-odm'")} 个`);
console.log('');
console.log('   注意：产品名称一律照抄原官网原文，规格参数与简介**故意留空** ——');
console.log('        原官网没有这些信息，编造会与事实不符。素材补齐后可在后台填。');
