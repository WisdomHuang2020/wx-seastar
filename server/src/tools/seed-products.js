#!/usr/bin/env node
'use strict';
/**
 * 把站上现有的产品导入数据库，作为后台的初始内容。
 *
 *   node src/tools/seed-products.js
 *
 * 幂等：以 slug 为准，已存在则跳过（不会覆盖后台已改过的内容）。
 * 产品图会同时登记进 media 表并挂到产品图库。
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const cfg = require('../config');

db.migrate();

const IMG_DIR = path.join(cfg.uploadDir, 'img');
// 图片来源：优先取已发布的 web 根（生产环境），回退到开发机上的仓库 assets/img
const SRC_CANDIDATES = [
  path.join(cfg.webRoot, 'assets', 'img'),
  path.resolve(__dirname, '..', '..', '..', 'assets', 'img'),
].filter(p => fs.existsSync(p));

if (!SRC_CANDIDATES.length) {
  console.error('❌ 找不到产品图片源目录。请确认站点已部署（web 根下应有 assets/img）。');
  process.exit(1);
}
const SRC_DIR = SRC_CANDIDATES[0];

// 与站上现有页面一致的真实产品（原官网 LED LIGHTING 产品线）
const PRODUCTS = [
  ['3d-neon-strip',      'Specialty / Neon',       '3D Neon',      '3D Neon Strip',                        'prod-neon-strip.jpg',  '热销', 'brand',
   [['Series', '3D Neon'], ['Type', 'Flexible Strip'], ['Cert.', 'CE / UL / RoHS']]],
  ['wrpx3-prismatic',    'Commercial / Wraparound', 'WRPX3',        'WRPX3 棱镜环绕灯具',                    'prod-wrpx3.jpg',       '新品', 'tech',
   [['Series', 'WRPX3'], ['Type', 'Prismatic'], ['Mount', 'Surface']]],
  ['fmx15-slim-surface', 'Commercial / Surface',    'FMX15',        'FMX15 超薄吸顶面板灯',                  'prod-fmx15.jpg',       '主推', 'brand',
   [['Series', 'FMX15'], ['Aperture', '5–24 in'], ['Type', 'Slim Surface']]],
  ['cdx11-retrofit',     'Commercial / Downlight',  'CDX11',        'CDX11 快装式商业筒灯',                  'prod-cdx11.jpg',       '',     'brand',
   [['Series', 'CDX11'], ['Voltage', '120–277V'], ['Type', 'Retrofit']]],
  ['cdx2-mesh-ble',      'Commercial / Downlight',  'CDX2',         'CDX2 MESH BLE 无线控制筒灯',            'prod-cdx2-ble.jpg',    '智能', 'tech',
   [['Series', 'CDX2'], ['Control', 'MESH BLE'], ['Type', 'Recessed']]],
  ['cdx8-flood-module',  'Commercial / Downlight',  'CDX8',         'CDX8 泛光模块商业筒灯',                 'prod-cdx8.jpg',        '',     'brand',
   [['Series', 'CDX8'], ['Type', 'Flood Module'], ['Mount', 'Recessed']]],
  ['vntx2-square-vanity', 'Residential / Vanity',   'VNTX2',        'VNTX2 方形镜前灯',                      'prod-vntx2.jpg',       '',     'neutral',
   [['Series', 'VNTX2'], ['Type', 'Square Vanity'], ['Mount', 'Wall']]],
  ['bpx6-slot-panel',    'Commercial / Panel',      'BPX6',         'BPX6 槽型面板灯',                       'prod-bpx6.jpg',        '',     'brand',
   [['Series', 'BPX6'], ['Type', 'Slot Panel'], ['Mount', 'Recessed']]],
  ['rdx3-5cct-slim',     'Residential / Downlight', 'RDX3',         'RDX3 5CCT 可调薄型筒灯',                'prod-series-a.jpg',    '调光', 'tech',
   [['Series', 'RDX3'], ['CCT', '5CCT Selectable'], ['Wattage', 'Selectable']]],
  ['cldx3-cylinder',     'Commercial / Cylinder',   'CLDX3',        'CLDX3 圆柱吊装灯具',                    'prod-linear-round.jpg','',     'brand',
   [['Series', 'CLDX3'], ['Type', 'Cylinder'], ['Mount', 'Pendant']]],
  ['eclx-ceiling',       'Residential / Ceiling',   'ECLX',         'ECLX 系列 LED 吸顶灯',                  'prod-eclx.jpg',        '',     'neutral',
   [['Series', 'ECLX2/3/6/7'], ['Type', 'Ceiling'], ['Cert.', 'CE / UL']]],
  ['espx2-slim-backlight', 'Commercial / Panel',    'ESPX2',        'ESPX2 薄型背光面板灯',                  'prod-series-b.jpg',    '',     'brand',
   [['Series', 'ESPX2'], ['Type', 'Slim Backlight'], ['Mount', 'Recessed']]],
  ['bpx9-prow-panel',    'Commercial / Panel',      'BPX9',         'BPX9 高端槽型面板灯',                   'prod-series-a.jpg',    '',     'brand',
   [['Series', 'BPX9'], ['Type', 'Prow Panel'], ['Mount', 'Recessed']]],
  ['fmx11-pro-surface',  'Commercial / Surface',    'FMX11 Pro',    'FMX11 Pro 明装面板灯',                  'prod-linear-l.jpg',    '',     'brand',
   [['Series', 'FMX11 Pro'], ['Type', 'Surface Mount'], ['Aperture', '1–4 ft']]],
  ['fmx11-regress',      'Commercial / Surface',    'FMX11 Regress','FMX11 Regress 嵌入式面板灯',            'prod-linear-l.jpg',    '',     'brand',
   [['Series', 'FMX11 Regress'], ['Type', 'Recessed'], ['Mount', 'Surface Flush']]],
  ['ecdx7-recessed',     'Commercial / Downlight',  'ECDX7',        'ECDX7 商业嵌入筒灯',                    'prod-cdx8.jpg',        '',     'brand',
   [['Series', 'ECDX7'], ['Type', 'Recessed'], ['Cert.', 'CE / UL']]],
  ['ecdx9-recessed',     'Commercial / Downlight',  'ECDX9',        'ECDX9 商业嵌入筒灯',                    'prod-cdx11.jpg',       '',     'brand',
   [['Series', 'ECDX9'], ['Type', 'Recessed'], ['Cert.', 'CE / UL']]],
  ['ecdx11-surface',     'Commercial / Downlight',  'ECDX11',       'ECDX11 商业明装筒灯',                   'prod-cdx2-ble.jpg',    '',     'brand',
   [['Series', 'ECDX11'], ['Type', 'Surface'], ['Cert.', 'CE / UL']]],
  ['dfx2-round-downlight', 'Residential / Downlight', 'DFX2',       'DFX2 圆形 LED 筒灯',                    'prod-series-b.jpg',    '',     'neutral',
   [['Series', 'DFX2'], ['Type', 'Round'], ['Mount', 'Recessed']]],
  ['vdlx1-round-downlight', 'Residential / Downlight', 'VDLX1',     'VDLX1 圆形 LED 筒灯',                   'prod-series-b.jpg',    '',     'neutral',
   [['Series', 'VDLX1'], ['Type', 'Round'], ['Mount', 'Recessed']]],
  ['espx3-slim-backlight', 'Commercial / Panel',    'ESPX3',        'ESPX3 薄型背光面板灯',                  'prod-eclx.jpg',        '',     'brand',
   [['Series', 'ESPX3'], ['Type', 'Slim Backlight'], ['Cert.', 'CE / UL']]],
];

// ── 确保上传目录存在，并把站上已有的产品图纳入媒体库 ───────────────────
fs.mkdirSync(IMG_DIR, { recursive: true });

function ensureMedia(filename) {
  const src = path.join(SRC_DIR, filename);
  if (!fs.existsSync(src)) return null;

  const dst = path.join(IMG_DIR, filename);
  if (!fs.existsSync(dst)) fs.copyFileSync(src, dst);

  const stat = fs.statSync(dst);
  let row = db.get('SELECT * FROM media WHERE filename = ?', [filename]);
  if (row) return row.id;

  const r = db.run(
    'INSERT INTO media (filename, original_name, mime, size) VALUES (?,?,?,?)',
    [filename, filename, 'image/jpeg', stat.size]
  );
  return r.lastInsertRowid;
}

let created = 0, skipped = 0, imagesAdded = 0;

db.tx(() => {
  let order = 0;
  for (const [slug, category, series, title_zh, img, badgeText, badgeType, specs] of PRODUCTS) {
    order += 10;
    const existing = db.get('SELECT * FROM products WHERE slug = ?', [slug]);

    if (existing) {
      // 产品已存在：不覆盖内容，但补齐缺失的图片（便于在无图的库上补跑）
      if (!existing.cover_media) {
        const mid = ensureMedia(img);
        if (mid) {
          db.run('UPDATE products SET cover_media = ? WHERE id = ?', [mid, existing.id]);
          db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)',
            [existing.id, mid]);
          imagesAdded++;
        }
      }
      skipped++;
      continue;
    }

    const mediaId = ensureMedia(img);
    const r = db.run(
      `INSERT INTO products (slug, category, series, title_zh, summary_zh, body_zh,
                             specs, badges, cover_media, sort_order, published)
       VALUES (?,?,?,?,?,?,?,?,?,?,1)`,
      [
        slug, category, series, title_zh,
        `${title_zh} —— 由 SEA☆STAR 实益达自主开发的商业照明产品。`,
        null,
        JSON.stringify(specs.map(([k, v]) => ({ k, v, u: '' }))),
        JSON.stringify(badgeText ? [{ text: badgeText, type: badgeType }] : []),
        mediaId, order,
      ]
    );
    if (mediaId) {
      db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)',
        [r.lastInsertRowid, mediaId]);
    }
    created++;
  }
});

console.log(`✅ 导入完成：新增 ${created} 个产品，跳过 ${skipped} 个（已存在），补图 ${imagesAdded} 张`);
const total = db.scalar('SELECT COUNT(*) FROM products') || 0;
const mediaCount = db.scalar('SELECT COUNT(*) FROM media') || 0;
console.log(`   当前产品总数 ${total}，媒体库 ${mediaCount} 张`);
console.log('');
console.log('   下一步：node src/tools/create-admin.js admin  （创建后台账号）');
