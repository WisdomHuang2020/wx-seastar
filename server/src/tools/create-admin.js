#!/usr/bin/env node
'use strict';
/**
 * 创建 / 重置管理员账号。
 *
 *   新建：node src/tools/create-admin.js <用户名> [显示名]
 *   重置：node src/tools/create-admin.js <用户名> --reset
 *
 * 若不提供密码，脚本会**生成一个强随机密码并打印一次**，
 * 并置 must_change=1 —— 首次登录必须修改。这样密码不会出现在命令历史里。
 */
const db = require('../lib/db');
const A = require('../lib/auth');

db.migrate();

const args = process.argv.slice(2);
const username = args[0];
const reset = args.includes('--reset');
const displayName = args.find(a => !a.startsWith('--') && a !== username) || null;

if (!username) {
  console.error('用法：node src/tools/create-admin.js <用户名> [显示名] [--reset]');
  process.exit(1);
}
if (!/^[a-zA-Z0-9._@-]{3,40}$/.test(username)) {
  console.error('用户名只能用字母、数字与 . _ @ - ，长度 3–40');
  process.exit(1);
}

const existing = db.get('SELECT * FROM admins WHERE username = ?', [username]);
const password = A.generatePassword(14);
const hash = A.hashPassword(password);

if (existing) {
  if (!reset) {
    console.error(`用户「${username}」已存在。若要重置密码，请加 --reset。`);
    process.exit(1);
  }
  db.run('UPDATE admins SET password_hash = ?, must_change = 1 WHERE id = ?', [hash, existing.id]);
  db.run('DELETE FROM sessions WHERE admin_id = ?', [existing.id]);
  console.log(`✅ 已重置「${username}」的密码（该账号此前所有登录已失效）`);
} else {
  db.run('INSERT INTO admins (username, display_name, password_hash, must_change) VALUES (?,?,?,1)',
    [username, displayName, hash]);
  console.log(`✅ 已创建管理员「${username}」`);
}

console.log('');
console.log('   ┌─────────────────────────────────────────────┐');
console.log('   │  初始密码（只显示这一次，请立即保存）        │');
console.log('   └─────────────────────────────────────────────┘');
console.log(`      用户名：${username}`);
console.log(`      密  码：${password}`);
console.log('');
console.log('   ⚠️  首次登录会强制要求修改密码。');
console.log('   ⚠️  该密码不会以明文存库（库中为 scrypt 加盐哈希）。');
console.log('');
