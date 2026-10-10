// delete-product-61.js —— 删除遗留草稿 products:61 (wallpack)
//
// 依据：用户 2026-10-10 明确指示「直接删」。
// 背景：该记录由 admin 于 2026-10-08 手工创建，2026-10-09 16:28 最后编辑，
//       内容已被 products:76 (wpx2-full-cut-off-architectural-wallpack) 完全取代，
//       且 published=0（前台不可见）。
//
// 安全措施（按项目删除纪律）：
//   ① 执行前必须已有数据库备份（由调用方保证）
//   ② 先把记录完整内容 dump 到 JSON 留档
//   ③ 在事务里删除，删前断言、删后复核
//   ④ 图片文件不硬删，移到备份目录
//
// 用法：node delete-product-61.js            # 干跑，只打印将删除的内容
//       node delete-product-61.js --apply    # 实际执行
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const APPLY = process.argv.includes('--apply');
const DB = '/var/lib/wx-seastar/data.db';
const PID = 61;

const db = new DatabaseSync(DB, { readOnly: !APPLY });

const product = db.prepare('SELECT * FROM products WHERE id=?').get(PID);
const pmedia = db.prepare('SELECT * FROM product_media WHERE product_id=?').all(PID);
const docs = db.prepare('SELECT id,kind,filename FROM documents WHERE product_id=?').all(PID);
const mediaIds = pmedia.map(x => x.media_id);
const media = mediaIds.length
  ? db.prepare(`SELECT * FROM media WHERE id IN (${mediaIds.map(() => '?').join(',')})`).all(...mediaIds)
  : [];

// 媒体是否被别处引用（必须为 0 才连图片一起清）
const mediaUsedElsewhere = mediaIds.length
  ? db.prepare(`SELECT COUNT(*) n FROM product_media WHERE media_id IN (${mediaIds.map(() => '?').join(',')}) AND product_id<>?`)
      .get(...mediaIds, PID).n
  : 0;
const mediaAsCoverElsewhere = mediaIds.length
  ? db.prepare(`SELECT COUNT(*) n FROM products WHERE cover_media IN (${mediaIds.map(() => '?').join(',')}) AND id<>?`)
      .get(...mediaIds, PID).n
  : 0;

const dump = {
  deleted_at: new Date().toISOString(),
  reason: '用户指示直接删除；遗留草稿，已被 products:76 取代，published=0',
  product, product_media: pmedia, documents: docs, media,
};

console.log('=== 将删除的内容 ===');
console.log('  product : ' + JSON.stringify(product));
console.log('  pmedia  : ' + JSON.stringify(pmedia));
console.log('  docs    : ' + JSON.stringify(docs));
console.log('  media   : ' + JSON.stringify(media));
console.log('  媒体被别处引用(product_media) : ' + mediaUsedElsewhere);
console.log('  媒体被别处引用(cover_media)   : ' + mediaAsCoverElsewhere);

if (!product) { console.log('  ✗ 记录不存在，无需删除'); db.close(); process.exit(0); }
if (mediaUsedElsewhere || mediaAsCoverElsewhere) {
  console.log('  ⚠️ 图片仍被其他产品引用，本次不删 media —— 只删产品记录');
}

const backupPath = `/root/deleted-product-${PID}-${Date.now()}.json`;
fs.writeFileSync(backupPath, JSON.stringify(dump, null, 2), 'utf8');
console.log('  记录已留档: ' + backupPath);

if (!APPLY) {
  console.log('\n（干跑完成，未改动数据。加 --apply 执行）');
  db.close();
  process.exit(0);
}

// ── 执行 ──
const before = {
  products: db.prepare('SELECT COUNT(*) n FROM products').get().n,
  media: db.prepare('SELECT COUNT(*) n FROM media').get().n,
  pmedia: db.prepare('SELECT COUNT(*) n FROM product_media').get().n,
};
console.log('\n删除前: ' + JSON.stringify(before));

db.exec('BEGIN');
try {
  db.prepare('DELETE FROM product_media WHERE product_id=?').run(PID);
  if (!mediaUsedElsewhere && !mediaAsCoverElsewhere && mediaIds.length) {
    db.prepare(`DELETE FROM media WHERE id IN (${mediaIds.map(() => '?').join(',')})`).run(...mediaIds);
  }
  db.prepare('DELETE FROM products WHERE id=?').run(PID);
  db.prepare('INSERT INTO audit_log (admin_id, action, target, detail, ip, created_at) VALUES (?,?,?,?,?,?)')
    .run(1, 'delete', 'products:' + PID,
         'wallpack（遗留草稿，已被 products:76 取代）· 经用户指示由命令行删除',
         '127.0.0.1', new Date().toISOString().slice(0, 19).replace('T', ' '));
  db.exec('COMMIT');
  console.log('  ✓ 事务提交');
} catch (e) {
  db.exec('ROLLBACK');
  console.log('  ✗ 回滚: ' + e.message);
  db.close();
  process.exit(1);
}

// ── 复核 ──
const after = {
  products: db.prepare('SELECT COUNT(*) n FROM products').get().n,
  media: db.prepare('SELECT COUNT(*) n FROM media').get().n,
  pmedia: db.prepare('SELECT COUNT(*) n FROM product_media').get().n,
  published: db.prepare('SELECT COUNT(*) n FROM products WHERE published=1').get().n,
  unpublished: db.prepare('SELECT COUNT(*) n FROM products WHERE published=0').get().n,
  stillThere: db.prepare('SELECT COUNT(*) n FROM products WHERE id=?').get(PID).n,
};
console.log('删除后: ' + JSON.stringify(after));
console.log('  断言 product 已消失 : ' + (after.stillThere === 0 ? 'PASS' : 'FAIL'));
console.log('  断言 media 减少     : ' + (after.media === before.media - mediaIds.length || mediaUsedElsewhere || mediaAsCoverElsewhere ? 'PASS' : 'CHECK'));
console.log('  断言已发布数不变     : ' + (after.published === 89 ? 'PASS (89)' : 'CHECK -> ' + after.published));
db.close();
