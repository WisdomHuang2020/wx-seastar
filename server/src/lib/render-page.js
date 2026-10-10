'use strict';
/**
 * 由数据库里的「积木」渲染出完整页面 HTML。
 *
 * 被两处共用，**不允许各写一份**（否则迟早不一致）：
 *   · server/src/tools/build-pages.js     —— CLI，把改动写成源码文件
 *   · server/src/routes/creator.routes.js —— /preview 接口，画布实时预览
 */
const db = require('./db');

/** 拼装：preamble + Σ(注释 + <section>) + epilogue；块之间空一行 */
function renderPage(pageId) {
  const blocks = db.all(
    'SELECT * FROM page_blocks WHERE page_id = ? AND visible = 1 ORDER BY sort_order, id', [pageId]);
  const parts = [];
  for (const b of blocks) {
    if (b.tag === 'shell') { parts.push({ shell: true, html: b.content }); continue; }
    const open = '<' + b.tag + (b.attrs ? ' ' + b.attrs : '') + '>';
    const cm = b.comment ? '<!-- ' + b.comment + ' -->\n' : '';
    parts.push({ shell: false, html: cm + open + b.content + '</' + b.tag + '>' });
  }
  const head = parts.find(p => p.shell && /^<!DOCTYPE/i.test(p.html));
  const tail = parts.filter(p => p.shell && !/^<!DOCTYPE/i.test(p.html)).slice(-1)[0];
  const mid = parts.filter(p => !p.shell).map(p => p.html);
  if (!head || !tail) throw new Error('缺少 preamble 或 epilogue（被锁定的骨架块）');
  return head.html + '\n\n' + mid.join('\n\n') + '\n\n' + tail.html;
}

module.exports = { renderPage };
