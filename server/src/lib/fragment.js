'use strict';
/**
 * 片段补丁器 —— Creator 编辑回写的核心。
 *
 * ── 为什么需要它 ──────────────────────────────────────────────────────
 *   浏览器把 DOM 序列化成 outerHTML 时会**规范化标记**：
 *     · 自闭合标签 <img … /> → <img …>
 *     · 实体 &amp; / &nbsp; 解码成字符再按需重编码
 *     · 属性引号形式、部分属性顺序可能变化
 *   如果直接把 outerHTML 存回去，**每一次保存都会把整段重排版**，
 *   "拼回去逐字节一致"这个性质（Creator Stage 1 好不容易证明出来的）
 *   当场就丢了，git diff 也会变得无法阅读。
 *
 * ── 做法 ──────────────────────────────────────────────────────────────
 *   客户端仍提交整段 HTML（简单、无状态），但服务端**不整段替换**：
 *     ① 先用标签骨架校验结构没变（已有）
 *     ② 逐项比对「文字节点序列」与「图片 src 序列」
 *     ③ **只把真正变了的项，打补丁回原文**
 *   于是除被编辑的那几个字/几张图之外，其余字节**原样保留**。
 *
 *   若两侧的文字节点数量不一致（说明结构变了），直接拒绝 —— 宁可报错，
 *   也不要静默把整段规范化。
 */

/** 把常见的 HTML 实体解码，便于比较（比较用解码值，写回用编码值） */
function decodeEntities(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, '\u00a0')
    .replace(/&amp;/g, '&');
}

function encodeText(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 跳到标签结束位置（正确处理属性值里的 >，以及 <!-- 注释 -->） */
function skipTag(html, i) {
  if (html.startsWith('<!--', i)) {
    const e = html.indexOf('-->', i);
    return e < 0 ? html.length : e + 3;
  }
  let j = i, q = null;
  while (j < html.length) {
    const c = html[j];
    if (q) { if (c === q) q = null; }
    else if (c === '"' || c === "'") q = c;
    else if (c === '>') return j + 1;
    j++;
  }
  return html.length;
}

/** 取「非空白文字节点」的位置序列（跳过注释、标签、script/style 内容） */
function textNodes(html) {
  const out = [];
  let i = 0, start = -1;
  while (i < html.length) {
    const c = html[i];
    if (c === '<') {
      if (start >= 0) {
        const t = html.slice(start, i);
        if (t.trim()) out.push({ start, end: i, text: t });
        start = -1;
      }
      // script/style 内容整体跳过
      const m = /^<(script|style)\b/i.exec(html.slice(i, i + 8));
      const end = skipTag(html, i);
      if (m) {
        const close = html.toLowerCase().indexOf('</' + m[1].toLowerCase(), end);
        i = close < 0 ? html.length : skipTag(html, close);
      } else {
        i = end;
      }
      continue;
    }
    if (start < 0) start = i;
    i++;
  }
  if (start >= 0) {
    const t = html.slice(start);
    if (t.trim()) out.push({ start, end: html.length, text: t });
  }
  return out;
}

/** 取所有 <img …> 的 src（按出现顺序） */
function imgSrcs(html) {
  const out = [];
  const re = /<img\b[^>]*?\ssrc\s*=\s*"([^"]*)"/gi;
  let m;
  while ((m = re.exec(html))) out.push({ start: m.index, src: m[1] });
  return out;
}

/**
 * 把 `edited`（浏览器规范化过的 HTML）相对 `orig`（库里的原文）的差异，
 * 以**最小补丁**的形式应用到 `orig` 上。
 *
 * @returns {{ok:true, html:string, changes:Array}|{ok:false, reason:string}}
 */
function patchFragment(orig, edited) {
  const oT = textNodes(orig);
  const eT = textNodes(edited);
  if (oT.length !== eT.length) {
    return { ok: false, reason: `文字节点数量不一致（原 ${oT.length} / 新 ${eT.length}），结构可能已变化` };
  }
  const oI = imgSrcs(orig);
  const eI = imgSrcs(edited);
  if (oI.length !== eI.length) {
    return { ok: false, reason: `图片数量不一致（原 ${oI.length} / 新 ${eI.length}）` };
  }

  // 收集改动（记录位置，稍后从后往前应用，避免偏移失效）
  const edits = [];
  for (let k = 0; k < oT.length; k++) {
    const a = decodeEntities(oT[k].text);
    const b = decodeEntities(eT[k].text);
    if (a !== b) edits.push({ start: oT[k].start, end: oT[k].end, to: encodeText(b.trim() ? b : b) });
  }
  for (let k = 0; k < oI.length; k++) {
    if (oI[k].src !== eI[k].src) {
      // 只替换 src 属性的值
      const seg = orig.slice(oI[k].start, oI[k].start + 400);
      const mm = /\ssrc\s*=\s*"([^"]*)"/i.exec(seg);
      if (!mm) continue;
      const s = oI[k].start + mm.index + mm[0].indexOf('"') + 1;
      edits.push({ start: s, end: s + mm[1].length, to: eI[k].src });
    }
  }

  if (!edits.length) return { ok: true, html: orig, changes: [] };

  edits.sort((x, y) => y.start - x.start);
  let out = orig;
  for (const e of edits) out = out.slice(0, e.start) + e.to + out.slice(e.end);
  return { ok: true, html: out, changes: edits.map(e => ({ from: orig.slice(e.start, e.end), to: e.to })) };
}

module.exports = { patchFragment, textNodes, imgSrcs, decodeEntities };
