'use strict';
/**
 * 常用字段 —— 给运维的高频入口。
 *
 * 动机：全站 1191 处可改文字，但运维常动的只有联系方式、标语这类几十处。
 *       把它们提到编辑器最上面，不用在 134 个模块里翻。
 *
 * ⚠️ 三条关键设计（都是实测踩出来后定的）：
 *
 *   ① **一个字段可以对多个位置**。实测「联系电话 0510-68506661」在联系页出现 3 次、
 *      「邮箱」2 次、「无锡地址」3 次。只改一处，运维会以为改好了、
 *      其实页面上还有几处没变 —— 必须一起改。
 *
 *   ② **定位到"子串"，不是"整节点"**。同一个电话既**单独成节点**，
 *      又**嵌在**「邮编 214145 · 电话 0510-68506661」这一行里。
 *      若只能整节点替换，改电话时那一行不会跟着变 —— 又是"以为改好了"。
 *      所以每个目标存 `find`（节点内要替换的**原文子串**），
 *      替换时把该子串换成新值；整节点替换只是 find == 整个节点文本的特例。
 *
 *   ③ **用语义坐标定位，不用 block_id**。重新拆页会重建 block 行、id 全变；
 *      语义坐标（slug + 模块注释 + 序号）能扛住重拆。
 *
 *   失效时**明确标出来**（stale），绝不默默改到别的地方去。
 */
const db = require('./db');
const { textNodes, imgSrcs, encodeText } = require('./fragment');

/** 注释里的 ====== 只是分隔装饰；两边都清干净再比，避免格式差异导致匹配不上 */
function clean(s) {
  return String(s == null ? '' : s).replace(/^[=\s]+|[=\s]+$/g, '').trim();
}

/** 按语义坐标找到那一块积木 */
function findBlock(slug, blockHint) {
  const page = db.get('SELECT id FROM pages WHERE slug = ?', [slug]);
  if (!page) return null;
  const blocks = db.all('SELECT * FROM page_blocks WHERE page_id = ? ORDER BY sort_order, id', [page.id]);
  const want = clean(blockHint);
  // 先按注释匹配；页面骨架块（页脚/导航）没有注释，注释为空会误命中
  // 第一个同样没注释的块 —— 所以再按 kind 兜底匹配一次。
  return blocks.find(b => want && clean(b.comment) === want)
      || blocks.find(b => b.kind === blockHint)
      || null;
}

/** 解析一个字段的全部位置；失效的带 stale + 原因 */
function resolve(fieldId) {
  const ts = db.all('SELECT * FROM featured_targets WHERE field_id = ? ORDER BY id', [fieldId]);
  const out = [];
  for (const t of ts) {
    const b = findBlock(t.slug, t.block_hint);
    if (!b) {
      out.push({ ok: false, stale: true, why: `「${t.slug}」里找不到模块「${t.block_hint}」`, target: t });
      continue;
    }
    const isImg = t.kind === 'img';
    const list = isImg ? imgSrcs(b.content) : textNodes(b.content);
    const node = list[t.idx];
    if (!node) {
      out.push({ ok: false, stale: true, why: `模块「${t.block_hint}」里没有第 ${t.idx} 个${isImg ? '图片' : '文字节点'}`, target: t });
      continue;
    }
    const raw = isImg ? node.src : node.text;
    const find = t.find == null ? (isImg ? node.src : raw.trim()) : t.find;
    if (!raw.includes(find)) {
      // 目标文字已经变了（多半是有人在画布上直接改过）—— 明确报出来
      out.push({ ok: false, stale: true, why: `模块「${t.block_hint}」里已找不到「${String(find).slice(0, 30)}」`, target: t });
      continue;
    }
    out.push({ ok: true, stale: false, target: t, block: b, find, raw, isImg, idx: t.idx });
  }
  return out;
}

/** 读一个字段：当前值 + 位置统计 + 失效与不一致提示 */
function readField(f) {
  const rs = resolve(f.id);
  const good = rs.filter(r => r.ok);
  const vals = [...new Set(good.map(r => r.find))];
  return {
    id: f.id, label: f.label, hint: f.hint, kind: f.kind, sort_order: f.sort_order,
    value: good.length ? good[0].find : null,
    targets: rs.length,
    live: good.length,
    places: good.map(r => ({ slug: r.target.slug, block: r.target.block_hint })),
    stale: rs.filter(r => r.stale).map(r => r.why),
    // 同一字段的多个位置值不一致 —— 说明有人只改了其中一处
    inconsistent: vals.length > 1 ? vals : null,
    updated_at: f.updated_at,
  };
}

/**
 * 写出一个字段 —— **所有位置一起改**（这正是"一个字段多个位置"的意义）。
 * 只替换 `find` 那一段，节点内其余文字（如「邮编 214145 · 电话 」前缀）原样保留。
 */
function writeField(f, value) {
  const rs = resolve(f.id).filter(r => r.ok);
  if (!rs.length) return { ok: false, reason: '该字段的所有位置都已失效，请重新指定' };
  const enc = encodeText(value);
  let changed = 0;
  const failed = [];

  // 同一块可能被多个目标命中 —— 先按块聚合，再在块内**从后往前**改，
  // 否则前面的替换会让后面记录的偏移失效。
  const byBlock = new Map();
  for (const r of rs) {
    if (!byBlock.has(r.block.id)) byBlock.set(r.block.id, { block: r.block, items: [] });
    byBlock.get(r.block.id).items.push(r);
  }

  for (const { block, items } of byBlock.values()) {
    let content = block.content;
    const sorted = [...items].sort((a, b) => b.idx - a.idx);
    for (const it of sorted) {
      if (it.isImg) {
        const node = imgSrcs(content)[it.idx];
        if (!node || node.src !== it.find) { failed.push(`图片「${it.find}」已变化`); continue; }
        const seg = content.slice(node.start, node.start + 400);
        const mm = /\ssrc\s*=\s*"([^"]*)"/i.exec(seg);
        if (!mm) { failed.push('找不到 src'); continue; }
        const s = node.start + mm.index + mm[0].indexOf('"') + 1;
        content = content.slice(0, s) + value + content.slice(s + mm[1].length);
      } else {
        const node = textNodes(content)[it.idx];
        if (!node || !node.text.includes(it.find)) { failed.push(`「${it.find}」已变化`); continue; }
        // 节点内**所有**出现都换掉（同一行里重复出现也一起改）
        const next = node.text.split(it.find).join(enc);
        content = content.slice(0, node.start) + next + content.slice(node.end);
      }
      changed++;
    }
    db.run("UPDATE page_blocks SET content = ?, updated_at = datetime('now','localtime') WHERE id = ?",
      [content, block.id]);
  }

  db.run("UPDATE featured_fields SET updated_at = datetime('now','localtime') WHERE id = ?", [f.id]);
  // 值变了以后各目标的 find 要跟着更新，否则下次解析会判定失效
  for (const r of rs) {
    db.run('UPDATE featured_targets SET find = ?, sample = ? WHERE id = ?', [value, value, r.target.id]);
  }
  return { ok: true, changed, failed };
}

module.exports = { clean, findBlock, resolve, readField, writeField };
