#!/usr/bin/env node
'use strict';
/**
 * 把「从原官网规格书图片转成的 PDF」批量登记进技术资料库。
 *
 * 背景
 * ────
 * 原官网 www.wx-seastar.com 的产品规格书藏在**产品详情页**
 * （/forum/post/<id>/）的正文里，形态是竖版长图（约 1152x1607）。
 * deploy/crawl-official-specs.py 抓这些图，
 * deploy/build-spec-docs.py 按 A4 宽 300dpi 转成 PDF 并生成清单。
 *
 * 用法（在服务器上跑，因为要把文件落到 /var/www/wx-seastar/uploads/doc）
 * ────────────────────────────────────────────────────────────────────
 *   1) 本地：python3 deploy/crawl-official-specs.py pages|extract|download
 *   2) 本地：python3 deploy/build-spec-docs.py         → .crawl/specpdf/<slug>.pdf
 *   3) 本地：scp .crawl/specpdf/*.pdf  root@host:/var/www/wx-seastar/uploads/doc/
 *   4) 本地：scp .crawl/spec-manifest.json root@host:/tmp/
 *   5) 服务器：cd /opt/wx-seastar/server && node src/tools/import-specs.js /tmp/spec-manifest.json
 *
 * 幂等：以 (product_id, original_name) 判重，重复跑只更新文件与大小，不产生重复记录。
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const cfg = require('../config');

db.migrate();

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error('用法：node src/tools/import-specs.js <manifest.json>');
  process.exit(1);
}

const rows = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const DOC_DIR = path.join(cfg.uploadDir, 'doc');
fs.mkdirSync(DOC_DIR, { recursive: true });

let added = 0, updated = 0, skipped = 0, failed = 0;

for (const r of rows) {
  const product = db.get('SELECT id, slug FROM products WHERE slug = ?', [r.slug]);
  if (!product) {
    console.log(`  ⚠️ 跳过：库里没有产品 slug=${r.slug}`);
    skipped++;
    continue;
  }

  const filename = `${r.slug}.pdf`;            // 用 slug 命名，便于人工核对与重跑
  const stablePath = path.join(DOC_DIR, filename);
  if (!fs.existsSync(stablePath)) {
    console.log(`  ⚠️ 跳过：服务器上没有文件 ${filename}（先 scp 上传）`);
    skipped++;
    continue;
  }

  const size = fs.statSync(stablePath).size;
  const originalName = r.original_name || filename;

  const exist = db.get(
    'SELECT * FROM documents WHERE product_id = ? AND original_name = ?',
    [product.id, originalName]
  );

  if (exist) {
    db.run('UPDATE documents SET filename=?, size=?, mime=?, title_zh=?, title_en=? WHERE id=?',
      [filename, size, 'application/pdf', r.title_zh || exist.title_zh,
       r.title_en || exist.title_en, exist.id]);
    updated++;
    continue;
  }

  const max = db.scalar(
    'SELECT COALESCE(MAX(sort_order),-1) FROM documents WHERE product_id = ?',
    [product.id]) ?? -1;

  db.run(
    `INSERT INTO documents (product_id, kind, lang, title_zh, title_en, filename,
                            original_name, mime, size, sort_order)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [product.id, 'spec', 'en',
     r.title_zh || r.title_en || r.slug,
     r.title_en || null,
     filename, originalName, 'application/pdf', size, max + 1]
  );
  added++;
}

console.log(`\n导入完成：新增 ${added} / 更新 ${updated} / 跳过 ${skipped} / 失败 ${failed}`);
const total = db.scalar('SELECT COUNT(*) FROM documents') || 0;
console.log(`documents 表现有记录：${total} 条`);
