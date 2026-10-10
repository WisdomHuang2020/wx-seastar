// backup-db.js —— 用 VACUUM INTO 做一致性备份（WAL 模式下不能直接 cp）
// 用法：node backup-db.js [输出路径前缀]
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const SRC = '/var/lib/wx-seastar/data.db';
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const out = process.argv[2] || `/root/data.db.bak-${stamp}`;

const db = new DatabaseSync(SRC, { readOnly: true });
db.exec(`VACUUM INTO '${out}'`);
db.close();

const s = fs.statSync(out);
console.log(`已备份 ${SRC} -> ${out}  (${(s.size / 1048576).toFixed(1)} MB)`);
