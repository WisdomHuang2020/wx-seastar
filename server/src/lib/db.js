'use strict';
/**
 * 数据库访问层 —— **全项目唯一直接接触 SQL 的文件**。
 *
 * 之所以单独抽一层：用的是 Node 内置的 node:sqlite（实验性 API）。
 * 若将来该 API 变更、或需要换成 better-sqlite3 / MySQL，
 * 只需改这一个文件，上层业务代码不受影响。
 */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const cfg = require('../config');

let db = null;

/** 打开（并在需要时初始化）数据库 */
function open() {
  if (db) return db;

  fs.mkdirSync(path.dirname(cfg.dbPath), { recursive: true });
  db = new DatabaseSync(cfg.dbPath);

  // 并发与安全设置：WAL 提升并发读性能；外键约束必须显式打开
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');

  return db;
}

/** 执行表结构（幂等，全部 CREATE TABLE IF NOT EXISTS） */
function migrate() {
  const d = open();
  const sql = fs.readFileSync(path.join(__dirname, '..', 'schema.sql'), 'utf8');
  d.exec(sql);

  // ⚠️ schema.sql 全是 `CREATE TABLE IF NOT EXISTS` —— 它只能**建新表**，
  // 不会给**已存在**的表补列。所以后续新增的列必须在这里显式 ALTER（幂等）。
  const cols = new Set(d.prepare('PRAGMA table_info(products)').all().map(c => c.name));
  if (!cols.has('scene')) {
    d.exec('ALTER TABLE products ADD COLUMN scene TEXT');
  }

  // Creator 设计者模式：账号角色（admin=现有后台 / creator=可增删模块并发布 /
  // editor=只能改文案图片 / owner=超管）。存量账号一律视为 admin，权限不变。
  const acols = new Set(d.prepare('PRAGMA table_info(admins)').all().map(c => c.name));
  if (!acols.has('role')) {
    d.exec("ALTER TABLE admins ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'");
  }

  // Creator：page_blocks.prefix —— 存「标签之前的原文逐字前缀」。
  // 初版把注释里的换行/缩进规范化掉了，导致含换行注释的页面（index/lighting 等）
  // 重建时对不上。原文空白必须原样保留。
  if (d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='page_blocks'").get().n) {
    const bcols = new Set(d.prepare('PRAGMA table_info(page_blocks)').all().map(c => c.name));
    if (!bcols.has('prefix')) {
      d.exec("ALTER TABLE page_blocks ADD COLUMN prefix TEXT NOT NULL DEFAULT ''");
    }
  }

  // 常用字段：featured_targets.find —— 要在节点内替换的原文子串。
  // 为什么需要它：「0510-68506661」既单独成节点，又嵌在「邮编 214145 · 电话 0510-68506661」
  // 这一行里。只能整节点替换的话，改电话时那一行不会跟着变 ——
  // 运维会以为改好了、其实页面上还有一处是旧的。
  if (d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='featured_targets'").get().n) {
    const fcols = new Set(d.prepare('PRAGMA table_info(featured_targets)').all().map(c => c.name));
    if (!fcols.has('find')) {
      d.exec("ALTER TABLE featured_targets ADD COLUMN find TEXT");
    }
  }

  // 新闻入库：发布队列区分任务类型（页面 / 新闻）
  if (d.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name='publish_queue'").get().n) {
    const qcols = new Set(d.prepare('PRAGMA table_info(publish_queue)').all().map(c => c.name));
    if (!qcols.has('kind')) {
      d.exec("ALTER TABLE publish_queue ADD COLUMN kind TEXT NOT NULL DEFAULT 'page'");
    }
  }

  return d;
}

/** 查询多行 */
function all(sql, params = []) {
  return open().prepare(sql).all(...params);
}

/** 查询单行（无结果返回 undefined） */
function get(sql, params = []) {
  return open().prepare(sql).get(...params);
}

/** 执行写入，返回 { changes, lastInsertRowid } */
function run(sql, params = []) {
  return open().prepare(sql).run(...params);
}

/** 取单值（第一行第一列） */
function scalar(sql, params = []) {
  const row = get(sql, params);
  if (!row) return undefined;
  return Object.values(row)[0];
}

/**
 * 事务包装。node:sqlite 没有内置 transaction helper，手写一层。
 * 用法：tx(() => { run(...); run(...); })
 */
function tx(fn) {
  const d = open();
  d.exec('BEGIN');
  try {
    const r = fn();
    d.exec('COMMIT');
    return r;
  } catch (e) {
    try { d.exec('ROLLBACK'); } catch { /* ignore */ }
    throw e;
  }
}

/** 清理过期会话（常驻服务里定时调用） */
function purgeExpiredSessions() {
  return run("DELETE FROM sessions WHERE expires_at < datetime('now','localtime')");
}

module.exports = { open, migrate, all, get, run, scalar, tx, purgeExpiredSessions };
