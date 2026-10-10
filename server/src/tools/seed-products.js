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

/** 应用场景受控词表（顺序 = 前台筛选按钮顺序，与 products.routes.js / admin.js 保持一致） */
const SCENES = ['home', 'commercial', 'outdoor'];
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
 * 格式：[slug, 原官网产品名（原文，勿改）, 应用场景数组]
 *
 * 图片**不在这里指定** —— 约定为 `assets/img/product/<slug>.jpg`，
 * 由 ensureMediaFor() 按 slug 直接取。缺文件就如实不配图（前台显示「素材待补充」）。
 *
 * category 字段表示业务线：led-lighting = 通用照明灯具 / driver-odm = 驱动与控制板。
 * 原官网并未给出产品分类，所以这里不做任何细分。
 *
 * ⚠️ 第三项 scene（应用场景）**原官网同样没有这个维度** —— 它是按产品名里的
 *    行业术语推断出来的，不是原官网资料：
 *      名字含 Commercial  → 商业（CDX / ECDX 系列，依据最硬）
 *      Vanity             → 家居（镜前灯）
 *      Wallpack           → 户外（户外壁灯）
 *      其余按术语常识归类（Downlight 筒灯、Panel 面板灯、Ceiling 吸顶灯、Cylinder 圆柱灯…）
 *    受控词表 home / commercial / outdoor，可多选。
 *    如需调整，请在后台「应用场景」里改，并同步更新此处以保持一致。
 */
const PRODUCTS = [
  // ── LED LIGHTING（24 个，原官网 LED 页「全部」标签下的完整清单）──
  ['cdx2-mesh-ble',            'CDX2 MESH BLE Wireless Control Commercial Downlight', ['commercial'], 'CDX2 MESH BLE 无线控制商用筒灯'],
  ['cdx8-flood-module',        'CDX8 Flood Module Commercial Downlight',              ['commercial'], 'CDX8 泛光模块商用筒灯'],
  ['cdx11-retrofit-277v',      'CDX11 120-277V Retrofit Commercial Downlight',        ['commercial'], 'CDX11 120-277V 改造型商用筒灯'],
  ['fmx15-slim-surface',       'FMX15 5/7/9/12/15/19/24in Slim Surface Mount',         ['home', 'commercial'], 'FMX15 5/7/9/12/15/19/24 英寸超薄明装筒灯'],
  ['wrpx3-prismatic',          'WRPX3 Prismatic Wraparound',                           ['commercial'], 'WRPX3 棱纹环绕灯'],
  ['3d-neon-strip',            '3D Neon Strip',                                        ['commercial'], '3D 霓虹灯带'],
  ['vntx2-square-vanity',      'VNTX2 Series Square Vanity',                           ['home'], 'VNTX2 现代方形镜前灯'],
  ['bpx6-slot-panel',          'BPX6 Slot Panel Light',                                ['commercial'], 'BPX6线槽形面板灯'],
  ['bpx9-prow-panel',          'BPX9 Prow Luxury Panel Light',                         ['commercial'], 'BPX9 Prow面板灯'],
  ['rdx3-5cct-slim',           'RDX3 5CCT & Wattage Selectable  Slim Downlight',       ['home', 'commercial'], 'RDX3超薄筒灯'],
  ['fmx11-pro-surface',        'FMX11 Pro Surface Mount',                              ['home', 'commercial'], 'FMX11 Pro压铸前环吸顶灯'],
  ['fmx11-regress-surface',    'FMX11 Regress Surface Mount',                          ['home', 'commercial'], 'FMX11低炫吸顶灯'],
  ['cldx3-cylinder',           'CLDX3 Cylinder',                                       ['commercial'], 'CLDX3 圆柱灯'],
  ['eclx2-ceiling',            'ECLX2 Series LED Ceiling Light',                       ['home', 'commercial'], 'ECLX2 LED 吸顶灯'],
  ['eclx3-ceiling',            'ECLX3 Series LED Ceiling Light',                       ['home', 'commercial'], 'ECLX3 LED 吸顶灯'],
  ['eclx6-ceiling',            'ECLX6 Series LED Ceiling Light',                       ['home', 'commercial'], 'ECLX6 LED 吸顶灯'],
  ['eclx7-ceiling',            'ECLX7 Series LED Ceiling Light',                       ['home', 'commercial'], 'ECLX7 LED 吸顶灯'],
  ['ecdx7-recessed',           'ECDX7 Commercial Recessed Downlight',                  ['commercial'], 'ECDX7 商用嵌入筒灯'],
  ['ecdx9-recessed',           'ECDX9 Commercial Recessed Downlight',                  ['commercial'], 'ECDX9 商用嵌入筒灯'],
  ['ecdx11-surface',           'ECDX11 Commercial Surface Downlight',                  ['commercial'], 'ECDX11 商用明装筒灯'],
  ['dfx2-round',               'DFX2 Round LED Downlight',                             ['home', 'commercial'], 'DFX2 圆形 LED 筒灯'],
  ['vdlx1-round',              'VDLX1 Round LED Downlight',                            ['home', 'commercial'], 'VDLX1 圆形 LED 筒灯'],
  ['espx2-slim-panel',         'ESPX2 Slim Panel Light',                               ['commercial'], 'ESPX2 超薄面板灯'],
  ['espx3-backlight-panel',    'ESPX3 Slim Backlight Panel',                           ['commercial'], 'ESPX3 超薄背发光面板灯'],
  // ── 以下 59 个为 2026-10-09 从原官网**完整补录**（此前只抓了第 1 页的 24 个）──
  //    来源：/forum/id/15448/ 的 page1~4，以及 4 个市场分区 cid/15449~15452
  ['smd-strip',                         'SMD Strip',                                                  ['commercial'], 'SMD灯带'],
  ['neon-strip',                        'Neon Strip',                                                 ['commercial'], '霓虹灯带'],
  ['cob-strip',                         'COB Strip',                                                  ['commercial'], 'COB灯带'],
  ['magnetic-v-strip-light',            'Magnetic V Strip Light',                                     ['commercial'], 'V 形磁吸灯带'],
  ['magnetic-strip-light',              'Magnetic Strip Light',                                       ['commercial'], '磁吸灯带'],
  ['fz01-cooler-lighting-canopy-shelf', 'FZ01 Cooler Lighting（Canopy+Shelf）',                         ['commercial'], 'FZ01 冷柜灯（层板型）'],
  ['fz01-cooler-lighting-vertical-center', 'FZ01 Cooler Lighting（Vertical center）',                      ['commercial'], 'FZ01 冰箱灯 (竖直中间安装)'],
  ['fz01-cooler-lighting-vertical-side', 'FZ01 Cooler Lighting (Vertical side)',                       ['commercial'], 'FZ01 冰箱灯（竖直侧边安装）'],
  ['flx2-larger-flood-light',           'FLX2 Series Larger Flood Light',                             ['outdoor'], 'FLX2系列泛光灯'],
  ['flx1-flood-light',                  'FLX1 Series Flood Light',                                    ['outdoor'], 'FLX1系列泛光灯'],
  ['cpx3-canopy-parking-garage',        'CPX3 Series Canopy/Parking Garage',                          ['outdoor'], 'CPX3系列停车场/油站灯'],
  ['cpx2-traditional-canopy',           'CPX2 Series Traditional Canopy',                             ['outdoor'], 'CPX2系列传统天棚灯'],
  ['wpx5-half-cut-off-commercial-wallpack', 'WPX5 Series Half Cut-off Commercial Wallpack',               ['outdoor'], 'WPX5系列半截光商业户外壁灯'],
  ['wpx3-full-cut-off-commercial-wallpack', 'WPX3 Series Full Cut-off Commercial Wallpack',               ['outdoor'], 'WPX3系列全截光商业户外壁灯'],
  ['wpx2-full-cut-off-architectural-wallpack', 'WPX2 Full Cut-off Architectural Wallpack',                   ['outdoor'], 'WPX2系列全截光建筑户外壁灯'],
  ['wpx1-mini-commercial-wallpack-wall-mount', 'WPX1 Series Mini Commercial Wallpack/Wall Mount',            ['outdoor'], 'WPX1系列Mini商业户外壁灯'],
  ['hbx3-ufo-high-bay',                 'HBX3 Series UFO High Bay',                                   ['commercial'], 'HBX3系列UFO工矿灯'],
  ['hbx2-linear-high-bay',              'HBX2 Series Linear High Bay',                                ['commercial'], 'HBX2系列线性工矿灯'],
  ['bpx5-back-lit-surface-mount-panel', 'BPX5 Back-lit Surface Mount Panel',                          ['commercial'], 'BPX5背发光吸顶面板灯'],
  ['bpx3-back-lit-panel-light',         'BPX3 Back-lit Panel Light',                                  ['commercial'], 'BPX3背发光面板灯'],
  ['tfx2-center-troffer',               'TFX2 Series Center Troffer',                                 ['commercial'], 'TFX2系列Troffer面板灯'],
  ['led-interlighting-grow-light',      'LED Interlighting Grow Light',                               ['commercial'], 'LED植物生长灯（中间安装）'],
  ['led-magnetic-retrofit',             'LED Magnetic Retrofit',                                      ['home', 'commercial'], 'LED磁吸替换套件'],
  ['wrpx2-frosted-wraparound',          'WRPX2 Frosted Wraparound',                                   ['commercial'], 'WRPX2系列圆角灯'],
  ['vpx2-vaportight',                   'VPX2 Series Vaportight',                                     ['outdoor'], 'VPX2系列三防灯'],
  ['lsx2-architectural-linear-strip',   'LSX2 Series Architectural Linear Strip',                     ['commercial'], 'LSX2系列建筑线性灯'],
  ['fmx10-small-panel-lamp-ceiling-lamp', 'FMX10 Small Panel Lamp Ceiling Lamp',                        ['home', 'commercial'], 'FMX10吊线灯'],
  ['fmx9-moon-trimless-surface-mount',  'FMX9 Moon/Trimless Surface Mount',                           ['home', 'commercial'], 'FMX9超窄边吸顶灯'],
  ['fmx8-back-lit-with-night-light-surface-mount', 'FMX8 Back-lit with Night Light Surface Mount',               ['home', 'commercial'], 'FMX8装饰吸顶灯（小夜灯）'],
  ['fmx7-edge-lit-with-night-light-surface-mount', 'FMX7 Edge-lit with Night Light Surface Mount',               ['home', 'commercial'], 'FMX7超薄侧发光吸顶灯（小夜灯）'],
  ['fmx6-eco-surface-mount',            'FMX6 Series ECO Surface Mount',                              ['home', 'commercial'], 'FMX6系列经济款吸顶灯'],
  ['fmx5-disk-surface-mount',           'FMX5 Series Disk Surface Mount',                             ['home', 'commercial'], 'FMX5系列蝶形吸顶灯'],
  ['fmx3-5cct-sensor-surface-mount',    'FMX3 Series 5CCT + Sensor Surface Mount',                    ['home', 'commercial'], 'FMX3系列感应吸顶灯'],
  ['fgx2-floating-gimbal',              'FGX2 Series Floating Gimbal',                                ['commercial'], 'FGX2系列垂直90度可调射灯'],
  ['gbx5-ox-head-gimbal',               'GBX5 Series Ox-head Gimbal',                                 ['commercial'], 'GBX5系列牛头摇头射灯'],
  ['gbx3-trimless-narrow-eyeball-gimbal', 'GBX3 Series Trimless Narrow Eyeball Gimbal',                 ['commercial'], 'GBX3系列无边框眼球摇头射灯'],
  ['gbx3-narrow-eyeball-gimbal',        'GBX3 Series Narrow Eyeball Gimbal',                          ['commercial'], 'GBX3系列眼球摇头射灯'],
  ['gbx2-flood-gimbal-mini-panel',      'GBX2 Series Flood Gimbal Mini Panel',                        ['commercial'], 'GBX2系列泛光摇头筒灯/摇头小面板'],
  ['spx2-moduel-narrow-downlight',      'SPX2 Series Moduel Narrow Downlight',                        ['home', 'commercial'], 'SPX2模组型射灯'],
  ['spx2-trimless-narrow-downlight',    'SPX2 Trimless Narrow Downlight',                             ['home', 'commercial'], 'SPX2无边框射灯'],
  ['spx2-deep-gress-narrow-downlight',  'SPX2 Series Deep Gress Narrow Downlight',                    ['home', 'commercial'], 'SPX2系列深眩射灯'],
  ['rdx6-back-lit-slim-downlight',      'RDX6 Back-lit Slim Downlight',                               ['home', 'commercial'], 'RDX6背发光超薄筒灯'],
  ['rdx5-back-lit-regress-downlight',   'RDX5 Series Back-lit Regress Downlight',                     ['home', 'commercial'], 'RDX5系列背发光深眩筒灯'],
  ['rdx2-e26-base-retrofit-downlight',  'RDX2 E26 Base Retrofit Downlight',                           ['home', 'commercial'], 'RDX2系列E26灯头替换筒灯'],
  ['cdx6-back-lit-slim-downlight',      'CDX6 Back-lit Slim Downlight',                               ['home', 'commercial'], 'CDX6系列背发光超薄筒灯'],
  ['cdx5-commercial-downlight',         'CDX5 Series Commercial Downlight',                           ['home', 'commercial'], 'CDX5系列商业筒灯'],
  ['cdx3-commercial-downlight',         'CDX3 Series Commercial Downlight',                           ['home', 'commercial'], 'CDX3系列商业筒灯'],
  ['cdx2-commercial-downlight',         'CDX2 Series Commercial Downlight',                           ['home', 'commercial'], 'CDX2系列商业筒灯'],
  ['eplx6-led-panel-light',             'EPLX6 Series LED Panel Light',                               ['commercial'], 'EPLX6 LED 面板灯'],
  ['eplx5-led-panel-light',             'EPLX5 Series LED Panel Light',                               ['commercial'], 'EPLX5 LED 面板灯'],
  ['eplx3-led-panel-light',             'EPLX3 Series LED Panel Light',                               ['commercial'], 'EPLX3 LED 面板灯'],
  ['etlx2-commercial-surface-track-light', 'ETLX2 Commercial Surface Track Light',                       ['commercial'], 'ETLX2 商用明装轨道灯'],
  ['ehbx6-ufo-highbay-light',           'EHBX6 UFO Highbay Light',                                    ['commercial'], 'EHBX6 UFO 工矿灯'],
  ['ehbx5-ufo-highbay-light',           'EHBX5 UFO Highbay Light',                                    ['commercial'], 'EHBX5 UFO 工矿灯'],
  ['esflx3-solar-flood-light',          'ESFLX3 Solar Flood Light',                                   ['outdoor'], 'ESFLX3 太阳能投光灯'],
  ['esflx2-solar-flood-light',          'ESFLX2 Solar Flood Light',                                   ['outdoor'], 'ESFLX2 太阳能投光灯'],
  ['eflx3-flood-light',                 'EFLX3 Flood Light',                                          ['outdoor'], 'EFLX3 投光灯'],
  ['eflx2-flood-light',                 'EFLX2 Flood Light',                                          ['outdoor'], 'EFLX2 投光灯'],
  ['espx5-plastic-slim-backlight-panel', 'ESPX5 Plastic Slim Backlight Panel',                         ['commercial'], 'ESPX5 塑料超薄背发光面板灯'],
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

/**
 * ⚠️ 极少数产品的**原文摘要**（唯一例外，务必克制）
 *
 * 背景：老站 83 个 LED 产品页里，**82 个连一个字都没有**——规格全部"画在一张图里"
 * （由 `deploy/build-spec-docs.py` 把原图包成 PDF 供下载，见 /docs）。
 * **只有 `smd-strip` 这一个产品页有正文**，是下面这 3 行特性语。
 *
 * 这里逐字照抄老站原文（原文每行前缀的 "l" 是列表符号残留，已去掉）。
 * **不允许**再往这张表里加任何"为了让产品页好看"而写的文案 —— 没有出处就是编造。
 */
const SUMMARIES = {
  'smd-strip': {
    en: 'SMD2835 high quality LED.\nDouble side PCB.\nVarious specifications and series optional.',
    zh: 'SMD2835 高品质灯珠。\n双面 PCB。\n规格与系列可选。',
  },
};

/** 通用的「写入或补图」逻辑，避免两台设备重复代码 */
function upsert(slug, category, titleEn, sceneArr, titleZh, order, counters) {
  const exists = db.get('SELECT * FROM products WHERE slug = ?', [slug]);
  const sm = SUMMARIES[slug];
  if (exists) {
    if (!exists.cover_media) {
      const mid = ensureMediaFor(slug);
      if (mid) {
        db.run('UPDATE products SET cover_media = ? WHERE id = ?', [mid, exists.id]);
        db.run('INSERT OR IGNORE INTO product_media (product_id, media_id, sort_order) VALUES (?,?,0)', [exists.id, mid]);
        counters.imaged++;
      } else counters.noimg++;
    }
    // 已存在且原文摘要尚未写入时补上（不覆盖后台手工改过的内容）
    if (sm && !exists.summary_en) {
      db.run('UPDATE products SET summary_en = ?, summary_zh = ? WHERE id = ?',
        [sm.en, sm.zh, exists.id]);
      counters.summarised = (counters.summarised || 0) + 1;
    }
    counters.skipped++;
    return;
  }
  const mid = ensureMediaFor(slug);
  if (!mid) counters.noimg++;
  const r = db.run(
    `INSERT INTO products (slug, category, title_zh, title_en, summary_zh, summary_en,
                           specs, badges, scene, cover_media, sort_order, published)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,1)`,
    [
      slug,
      category,
      titleZh || null,   // 中文名：优先用原厂中文站 cn.wx-seastar.com 的官方名；没有则留空
      titleEn,    // 原文照抄
      sm ? sm.zh : null,  // 摘要：仅上面 SUMMARIES 里列出的极少数产品有出处
      sm ? sm.en : null,
      '[]',       // 原官网无规格参数 —— 空数组，不编造
      '[]',       // 原官网无角标 —— 空数组
      JSON.stringify(SCENES.filter(s => (sceneArr || []).indexOf(s) >= 0)),  // 受控词表归一化
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
  for (const [slug, titleEn, scene, titleZh] of PRODUCTS) {   // 通用照明
    order += 10;
    upsert(slug, 'led-lighting', titleEn, scene, titleZh, order, c);
  }
  order = 10000;                                     // ODM 驱动（无应用场景，仅出现在 /odm）
  for (const [slug, titleEn] of DRIVERS) {
    order += 10;
    upsert(slug, 'driver-odm', titleEn, [], null, order, c);
  }
});

console.log(`✅ 导入完成：新增 ${c.created} 个，跳过 ${c.skipped} 个，补图 ${c.imaged} 张，无图 ${c.noimg} 个`);
console.log(`   通用照明 ${db.scalar("SELECT COUNT(*) FROM products WHERE category='led-lighting'")} 个` +
            ` / ODM 驱动 ${db.scalar("SELECT COUNT(*) FROM products WHERE category='driver-odm'")} 个`);
console.log(`   有封面图 ${db.scalar('SELECT COUNT(*) FROM products WHERE cover_media IS NOT NULL')} 个`);
console.log('');
console.log('   注意：产品名称一律照抄原官网原文，规格参数与简介**故意留空** ——');
console.log('        原官网没有这些信息，编造会与事实不符。素材补齐后可在后台填。');
