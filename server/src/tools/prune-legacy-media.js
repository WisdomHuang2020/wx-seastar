#!/usr/bin/env node
'use strict';
/**
 * 一次性清理：删除旧的「猜测式命名」产品图（prod-*.jpg）的
 *   · media 表记录（仅限未被任何产品引用的孤儿行）
 *   · uploads/img 下的实体文件
 *
 * 只针对文件名匹配 prod-% 且**未被任何产品引用**的记录 —— 绝不碰后台后传的其它素材。
 *
 *   node src/tools/prune-legacy-media.js          # 预演（只看，不删）
 *   node src/tools/prune-legacy-media.js --apply  # 真删
 */
const fs = require('node:fs');
const path = require('node:path');
const db = require('../lib/db');
const cfg = require('../config');

db.migrate();
const apply = process.argv.includes('--apply');

const rows = db.all(`
  SELECT m.id, m.filename, m.size
    FROM media m
   WHERE m.filename LIKE 'prod-%'
     AND m.id NOT IN (SELECT cover_media FROM products WHERE cover_media IS NOT NULL)
     AND m.id NOT IN (SELECT media_id FROM product_media)
   ORDER BY m.filename`);

if (!rows.length) {
  console.log('没有需要清理的孤儿 media 记录。');
  process.exit(0);
}

let fileBytes = 0;

for (const r of rows) {
  const abs = path.join(cfg.uploadDir, 'img', r.filename);
  const exists = fs.existsSync(abs);
  const onDisk = exists ? fs.statSync(abs).size : 0;

  console.log(`${apply ? '删除' : '待删'}  media#${r.id}  ${r.filename}  ` +
              `db=${r.size}B  磁盘=${exists ? onDisk + 'B' : '（不存在）'}`);

  if (apply) {
    if (exists) fs.unlinkSync(abs);
    db.run('DELETE FROM media WHERE id = ?', [r.id]);
    fileBytes += onDisk;
  }
}

console.log(`\n${apply ? '已' : '待'}删除 ${rows.length} 条孤儿记录` +
            (apply ? `，释放 ${(fileBytes / 1024).toFixed(0)} KB 磁盘。` : '。'));
if (!apply) console.log('加上 --apply 才真正执行。');
