#!/usr/bin/env node
'use strict';
/**
 * 初始化数据库（建表）—— 幂等，可反复执行。
 *   node src/tools/init-db.js
 */
const db = require('../lib/db');
const cfg = require('../config');

db.migrate();
const tables = db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
console.log(`✅ 数据库已就绪：${cfg.dbPath}`);
console.log(`   表（${tables.length}）：${tables.map(t => t.name).join(', ')}`);
