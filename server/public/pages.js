'use strict';
/* ══════════════════════════════════════════════════════════════════════
   SEA☆STAR 页面内容编辑器（/admin/pages）
   ──────────────────────────────────────────────────────────────────────
   架构要点（改动前请先读）：
     原为独立后台，v0.25.0 起并入 /admin 子页。
     · 编辑产物存**数据库**，不写文件。web 根目录是「仓库的镜像」，
       auto-deploy 每 2 分钟 `git reset --hard` + 覆盖发布，写文件会被静默冲掉。
     · 画布是**同源 iframe**，直接加载 /api/pages/:slug/preview，
       与将来 build-pages 生成的是同一套渲染代码 —— 画布所见即发布所得。
     · 回写**不整段替换**：提交整段 HTML，服务端只把真正变了的文字/图片
       打补丁回原文（浏览器序列化会规范化标记，整段存回会毁掉逐字节一致性）。
     · 本文件里的权限判断**只是别让人白点**；真正的拦截在服务端。
   ══════════════════════════════════════════════════════════════════════ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = {
  me: null,
  pages: [],
  slug: null,
  page: null,
  blocks: [],
  caps: null,
  selected: null,      // block id
  dirty: false,
  saving: false,
};

/* ───────────────  工具  ─────────────── */
function toast(msg, isErr) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast' + (isErr ? ' err' : '');
  t.hidden = false;
  clearTimeout(t._h);
  t._h = setTimeout(() => { t.hidden = true; }, isErr ? 5200 : 2200);
}

async function api(path, opts = {}) {
  const r = await fetch('/api/pages' + path, {
    credentials: 'same-origin',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData ? opts.body
        : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  let d = {};
  try { d = await r.json(); } catch { /* 非 JSON */ }
  if (!r.ok) {
    const e = new Error(d.error || ('HTTP ' + r.status));
    e.status = r.status; e.code = d.code;
    throw e;
  }
  return d;
}

function setSave(s, cls) {
  const el = $('#saveTag');
  el.textContent = s;
  el.className = 'save' + (cls ? ' ' + cls : '');
}

/* ───────────────  鉴权  ─────────────── */
/* 本页不再自己做登录 —— 后台已经有登录了。未登录就回 /admin 登录页；
   首次登录需改密的也回后台处理。**真正的权限拦截在服务端**。 */
async function requireLogin() {
  let me;
  // ⚠️ 这里**不能**用 api() —— 它的基址是 /api/pages，会把这条变成
  //    /api/pages/auth/me 而 404。登录态是 /api/auth/me，必须走绝对路径。
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('未登录');
    me = (await r.json()).data;
  } catch { location.href = '/admin/'; return false; }
  if (me.must_change) { location.href = '/admin/'; return false; }
  state.me = me;
  return true;
}

/* ───────────────  启动  ─────────────── */
async function boot() {
  if (!await requireLogin()) return;
  $('#whoami').textContent = state.me.display_name || state.me.username;
  $('#cvRole').textContent = '账号：' + state.me.username +
    (state.me.role === 'editor' ? '（只能改文案与图片）' : '（可增删模块并发布）');
  if (state.me.role === 'editor') {
    $('#btnPublish').disabled = true;
    $('#btnPublish').title = '你的账号没有发布权限';
    $('#lockNote').hidden = false;
  }
  await loadFeatured();
  await loadPages();
}

async function loadPages() {
  const d = await api('/');
  state.pages = d.data || [];
  if (!state.pages.length) { toast('还没有可编辑的页面', true); return; }
  // 记忆上次编辑的页面
  const last = localStorage.getItem('creator.slug');
  state.slug = (last && state.pages.some(p => p.slug === last)) ? last : state.pages[0].slug;
  await loadPage(state.slug);
}

async function loadPage(slug) {
  const d = await api('/' + encodeURIComponent(slug));
  state.slug = slug;
  state.page = d.data.page;
  state.blocks = d.data.blocks;
  state.caps = d.data.caps;
  state.selected = null;
  localStorage.setItem('creator.slug', slug);

  const p = state.pages.find(x => x.slug === slug);
  $('#pgName').textContent = pageLabel(p || state.page);
  $('#cvUrl').textContent = 'www.wx-seastar.cn/' + slug;
  $$('#langSw button').forEach(b => b.classList.toggle('on', b.dataset.lang === state.page.lang));

  renderOutline();
  renderPanel(null);
  loadCanvas();
  setSave('已同步');
  state.dirty = false;
}

function pageLabel(p) {
  const t = (p.title || p.slug).replace(/\s*[·|]\s*SEA☆STAR.*$/i, '').trim();
  return (p.lang === 'zh' ? '中文 · ' : 'EN · ') + (t || p.slug);
}

/* ───────────────  画布  ─────────────── */
function loadCanvas() {
  // 用 srcdoc 而不是 src，避免 iframe 被当成独立文档走缓存；
  // 内容仍由服务端预览接口渲染（与 build-pages 同一套代码）。
  setSave('载入中…');
  const url = '/api/pages/' + encodeURIComponent(state.slug) + '/preview';
  const cv = $('#cv');
  cv.onload = onCanvasLoad;
  cv.src = url + '?_t=' + Date.now();   // 同源 + 带 Cookie；加时间戳穿透缓存
  setSave('已同步');
}

function onCanvasLoad() {
  const doc = $('#cv').contentDocument;
  if (!doc) { toast('画布载入失败（跨域？）', true); return; }
  injectCanvasHelpers(doc);
  bindCanvas(doc);
  syncSelection();
}

/** 给画布注入一点辅助样式：可编辑元素高亮、选中描边 */
function injectCanvasHelpers(doc) {
  const s = doc.createElement('style');
  s.textContent = `
    [data-cv-sel]{outline:2px solid #0070C0 !important;outline-offset:-2px;position:relative}
    [data-cv-edit]{background:rgba(0,112,192,.07);outline:1px dashed #A8CFEE;outline-offset:1px;
                   cursor:text;border-radius:2px}
    [data-cv-img]{outline:2px dashed #7FD1A0;outline-offset:-2px;cursor:pointer}
    [data-cv-lock]{position:relative}
    /* 同意条是 js/consent.js 注入的浮层，不属于页面内容，编辑时挡住视线 */
    [class^="cc-"],[class*=" cc-"]{display:none !important}
  `;
  doc.head.appendChild(s);
}

const TEXT_SEL = 'h1,h2,h3,h4,h5,h6,p,li,figcaption,span,strong,em,b,small,label,option,button,a,td,th,dt,dd,blockquote';

function bindCanvas(doc) {
  const main = doc.querySelector('main') || doc.body;
  const secs = Array.from(main.children).filter(el => el.tagName === 'SECTION');

  secs.forEach((sec, i) => {
    // 与 state.blocks 里的非 shell 块按顺序对应
    const un = state.blocks.filter(b => b.locked === 0);
    const b = un[i];
    if (!b) return;
    sec.dataset.cvBlock = b.id;

    sec.addEventListener('click', (e) => {
      if (e.target.closest('[contenteditable="true"]')) return;
      e.preventDefault();
      selectBlock(b.id);
    }, true);

    // 阻止编辑时误点链接跳走
    sec.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (a) e.preventDefault();
    });

    // 点图片 → 换图（仅选中模块内的图，减少误触）
    sec.addEventListener('click', (e) => {
      const im = e.target.closest('img');
      if (!im || !sec.contains(im)) return;
      if (state.selected !== b.id) return;
      if (!state.caps.canEditContent) return;
      e.preventDefault(); e.stopPropagation();
      selectImage(im, b, sec);
    }, true);

    // 双击文字 → 就地编辑
    sec.addEventListener('dblclick', (e) => {
      const el = e.target.closest(TEXT_SEL);
      if (!el || !sec.contains(el)) return;
      e.preventDefault(); e.stopPropagation();
      startTextEdit(el, b, sec);
    });

    if (b.locked) sec.dataset.cvLock = '1';
  });
}

function sectionsInOrder(doc) {
  const main = doc.querySelector('main') || doc.body;
  return Array.from(main.children).filter(el => el.tagName === 'SECTION');
}

function syncSelection() {
  const doc = $('#cv').contentDocument;
  if (!doc) return;
  const un = state.blocks.filter(b => b.locked === 0);
  sectionsInOrder(doc).forEach((sec, i) => {
    const b = un[i];
    if (!b) return;
    const on = state.selected === b.id;
    if (on) { sec.setAttribute('data-cv-sel', ''); sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
    else sec.removeAttribute('data-cv-sel');
    // 未选中的模块里的图片不显示「可换」描边，减少视觉噪音
    sec.querySelectorAll('img').forEach(im => on ? im.setAttribute('data-cv-img', '') : im.removeAttribute('data-cv-img'));
  });
}

/** 双击文字后就地编辑；失焦时把整段提交给服务端打补丁 */
function startTextEdit(el, block, sec) {
  const before = el.innerHTML;
  el.setAttribute('contenteditable', 'true');
  el.setAttribute('data-cv-edit', '');
  el.focus();
  const sel = $('#cv').contentWindow.getSelection();
  const r = document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);

  const finish = () => {
    el.removeAttribute('contenteditable');
    el.removeAttribute('data-cv-edit');
    el.removeEventListener('blur', finish);
    el.removeEventListener('keydown', onKey);
    if (el.innerHTML !== before) submitSection(block, sec);
  };
  const onKey = (ev) => {
    if (ev.key === 'Escape') { el.innerHTML = before; el.blur(); }
    if (ev.key === 'Enter' && !ev.shiftKey && !/^(P|LI|DIV|H1|H2|H3|H4|H5|H6|TD|TH)$/.test(el.tagName)) {
      ev.preventDefault(); el.blur();
    }
  };
  el.addEventListener('blur', finish);
  el.addEventListener('keydown', onKey);
}

/** 取 section 的内部 HTML 提交（服务端只打补丁，不整段替换） */
function sectionInner(sec) {
  const out = sec.outerHTML;
  const open = out.indexOf('>');
  const close = out.lastIndexOf('</section>');
  return out.slice(open + 1, close);
}

async function submitSection(block, sec) {
  const content = sectionInner(sec);
  if (content === block.content) return;
  state.saving = true;
  setSave('保存中…', 'dirty');
  try {
    const d = await api('/blocks/' + block.id, { method: 'PUT', body: { content } });
    block.content = d.data.content;
    // 同步内存里的 block，避免下次误判
    const i = state.blocks.findIndex(x => x.id === block.id);
    if (i >= 0) state.blocks[i] = d.data;
    setSave('已保存 ✓');
    state.dirty = false;
  } catch (e) {
    setSave('保存失败', 'err');
    toast(e.message, true);
    // 结构被拒 → 回滚画布到库里的版本
    if (e.code === 'PATCH_REJECTED' || e.code === 'CONTENT_ONLY') loadCanvas();
  } finally {
    state.saving = false;
  }
}

/* ───────────────  换图  ─────────────── */
/** 在右侧面板里给出「上传新图 / 从图库选」两种方式 */
async function selectImage(img, block, sec) {
  $('#panelHd').textContent = '换图 · ' + (cleanLabel(block.comment) || block.kind);
  const panel = $('#panel');
  const oldSrc = img.getAttribute('src');
  panel.innerHTML = `
    <div class="fld"><div class="fld__k">当前图片</div>
      <img src="${escapeHtml(oldSrc)}" alt="" style="width:100%;border-radius:var(--radius-sm);border:1px solid var(--border-subtle)">
      <div class="fld__v" style="margin-top:6px;font-family:var(--mono);font-size:11px;word-break:break-all">${escapeHtml(oldSrc)}</div>
    </div>
    <div class="fld"><div class="fld__k">上传新图</div>
      <input type="file" id="imUp" accept="image/*" class="upl">
    </div>
    <div class="fld"><div class="fld__k">或从图库选</div>
      <div class="thumbs" id="imLib"><div class="empty">载入中…</div></div>
    </div>
    <div class="rowbtn"><button class="btn" id="imBack">返回模块属性</button></div>
  `;
  $('#imBack').onclick = () => renderPanel(block);

  const apply = async (url) => {
    img.setAttribute('src', url);
    await submitSection(block, sec);
    toast('已换图');
    renderPanel(block);
  };

  $('#imUp').onchange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const d = await api('/media', { method: 'POST', body: fd });
      await apply(d.data.url);
    } catch (err) { toast(err.message, true); }
  };

  try {
    const d = await api('/media?size=18');
    const items = d.data || [];
    const box = $('#imLib');
    box.innerHTML = items.length
      ? items.map(m => `<img src="${escapeHtml(m.url)}" title="${escapeHtml(m.original_name || m.filename)}" data-url="${escapeHtml(m.url)}">`).join('')
      : '<div class="empty">图库还是空的</div>';
    box.querySelectorAll('img[data-url]').forEach(im => im.onclick = () => apply(im.dataset.url));
  } catch (e) {
    $('#imLib').innerHTML = '<div class="empty">图库载入失败</div>';
  }
}


/* ───────────────  常用字段（运维高频入口）  ─────────────── */
/**
 * 全站 1191 处可改文字，运维常动的只有联系方式这类几十处。
 * 把它们提到最上面，不用在 134 个模块里翻。
 *
 * ⚠️ 一个字段可能**对应多个位置**（电话在页面上出现 28 次）——
 *    保存时会一次改全部，这是刻意的：只改一处的话，运维会以为改好了、
 *    其实页面上还有二十几处是旧的。
 */
async function loadFeatured() {
  const box = $('#favBox');
  try {
    const d = await api('/featured');
    renderFeatured(d.data || []);
  } catch (e) {
    box.innerHTML = '<div class="empty" style="padding:14px 6px">载入失败：' + escapeHtml(e.message) + '</div>';
  }
}

function renderFeatured(list) {
  const box = $('#favBox');
  if (!list.length) {
    box.innerHTML = '<div class="empty" style="padding:14px 6px">还没有常用字段</div>';
    $('#capF').textContent = '';
    return;
  }
  const stale = list.filter(f => f.stale && f.stale.length).length;
  $('#capF').textContent = '· ' + list.length + ' 个' + (stale ? '（' + stale + ' 个待修）' : '');
  box.innerHTML = list.map(f => {
    const bad = f.stale && f.stale.length;
    const inc = f.inconsistent;
    return `
    <div class="fav" data-id="${f.id}">
      <div class="fav__k">${escapeHtml(f.label)}
        <span class="fav__n">${f.live}/${f.targets} 处</span></div>
      <div class="fav__row">
        <input class="fav__in" data-id="${f.id}" value="${escapeHtml(f.value || '')}"
               placeholder="${f.value == null ? '（定位失效，请重载后重新指定）' : ''}">
        <button class="fav__save" data-id="${f.id}" disabled>保存</button>
      </div>
      ${f.hint ? `<div class="fav__hint">${escapeHtml(f.hint)}</div>` : ''}
      ${bad ? `<div class="fav__err">⚠ ${f.stale.map(escapeHtml).join('；')}</div>` : ''}
      ${inc ? `<div class="fav__warn">⚠ 各位置的值不一致：${inc.map(x => '「' + escapeHtml(String(x).slice(0, 24)) + '」').join(' / ')}</div>` : ''}
      <span class="fav__go" data-goto="${escapeHtml(f.places && f.places[0] ? f.places[0].slug : '')}">在页面里看看 →</span>
    </div>`;
  }).join('');

  box.querySelectorAll('.fav__in').forEach(inp => {
    inp.addEventListener('input', () => {
      const btn = box.querySelector('.fav__save[data-id="' + inp.dataset.id + '"]');
      btn.disabled = false;
      inp.classList.add('dirty');
    });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); saveFeatured(inp.dataset.id); }
    });
  });
  box.querySelectorAll('.fav__save').forEach(btn => {
    btn.onclick = () => saveFeatured(btn.dataset.id);
  });
  box.querySelectorAll('.fav__go').forEach(a => {
    a.onclick = () => {
      const slug = a.dataset.goto;
      if (slug && slug !== state.slug) loadPage(slug);
      else toast('已在该页面，直接点画布查看');
    };
  });
}

async function saveFeatured(id) {
  const box = $('#favBox');
  const inp = box.querySelector('.fav__in[data-id="' + id + '"]');
  const btn = box.querySelector('.fav__save[data-id="' + id + '"]');
  const value = inp.value;
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const d = await api('/featured/' + id, { method: 'PUT', body: { value } });
    toast('已保存，同时更新了 ' + d.changed + ' 处' + (d.failed && d.failed.length ? '（' + d.failed.length + ' 处失败）' : ''));
    await loadFeatured();
    // 积木内容变了，画布要重载才看得到
    if (state.page) loadCanvas();
  } catch (e) {
    toast(e.message, true);
    btn.disabled = false;
    btn.textContent = '保存';
  }
}

/* ───────────────  大纲  ─────────────── */
function renderOutline() {
  const ol = $('#ol');
  ol.innerHTML = '';
  const canStruct = state.caps && state.caps.canEditStructure;
  $('#capL').textContent = canStruct ? '' : '· 只读结构';

  state.blocks.forEach((b, idx) => {
    const li = document.createElement('li');
    li.dataset.id = b.id;
    li.draggable = !b.locked && canStruct;
    if (b.locked) li.classList.add('locked');
    if (!b.visible) li.classList.add('hid');
    if (state.selected === b.id) li.classList.add('on');
    li.innerHTML =
      `<span class="no">${String(idx).padStart(2, '0')}</span>` +
      `<span class="nm" title="${escapeHtml(b.comment || b.kind)}">${escapeHtml(cleanLabel(b.comment) || b.kind)}</span>` +
      (b.locked ? '<span class="eye" title="全局组件，不可编辑">🔒</span>'
                : `<span class="eye" title="隐藏/显示">${b.visible ? '◉' : '○'}</span>`);
    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('eye')) { toggleVisible(b); return; }
      selectBlock(b.id);
    });
    // 拖动排序
    li.addEventListener('dragstart', (e) => { li.classList.add('drag'); e.dataTransfer.setData('text/plain', String(b.id)); });
    li.addEventListener('dragend', () => li.classList.remove('drag'));
    li.addEventListener('dragover', (e) => { e.preventDefault(); li.classList.add('over'); });
    li.addEventListener('dragleave', () => li.classList.remove('over'));
    li.addEventListener('drop', async (e) => {
      e.preventDefault(); li.classList.remove('over');
      await moveBlock(Number(e.dataTransfer.getData('text/plain')), li);
    });
    ol.appendChild(li);
  });
}

async function moveBlock(id, targetLi) {
  const un = state.blocks.filter(b => !b.locked);
  const from = un.findIndex(b => b.id === id);
  const target = state.blocks.find(b => b.id === Number(targetLi.dataset.id));
  if (from < 0 || !target || target.locked) return;
  const to = un.findIndex(b => b.id === target.id);
  if (to < 0 || from === to) return;
  const ids = un.map(b => b.id);
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  try {
    await api('/blocks/' + id + '/move', { method: 'POST', body: { to } });
    toast('已调整顺序');
    await loadPage(state.slug);
  } catch (e) { toast(e.message, true); }
}

async function toggleVisible(b) {
  if (!state.caps.canEditStructure) { toast('你的账号不能隐藏/显示模块', true); return; }
  try {
    await api('/blocks/' + b.id, { method: 'PUT', body: { visible: b.visible ? 0 : 1 } });
    await loadPage(state.slug);
  } catch (e) { toast(e.message, true); }
}

/* ───────────────  选中与属性面板  ─────────────── */
function selectBlock(id) {
  state.selected = id;
  $$('#ol li').forEach(li => li.classList.toggle('on', Number(li.dataset.id) === id));
  syncSelection();
  renderPanel(state.blocks.find(b => b.id === id) || null);
}

function renderPanel(b) {
  const panel = $('#panel');
  if (!b) {
    $('#panelHd').textContent = '模块属性';
    panel.innerHTML = '<div class="empty">从左侧选一个模块，<br>或直接点画布上的模块。</div>';
    return;
  }
  $('#panelHd').textContent = '属性 · ' + (cleanLabel(b.comment) || b.kind);
  const canStruct = state.caps.canEditStructure;
  const imgs = (b.content.match(/<img\b/gi) || []).length;

  panel.innerHTML = `
    <div class="fld"><div class="fld__k">模块</div>
      <div class="fld__v">${escapeHtml(b.kind)}${b.locked ? ' · 🔒 全局组件' : ''}</div></div>
    <div class="fld"><div class="fld__k">名称</div>
      <div class="fld__v">${escapeHtml(cleanLabel(b.comment) || '（无注释）')}</div></div>
    <div class="fld"><div class="fld__k">内容</div>
      <div class="fld__v">${b.content.length.toLocaleString()} 字节 · 含 ${imgs} 张图</div></div>

    ${b.locked ? `<div class="note warn"><b>全局组件</b>导航与页脚不在本页维护，避免改一处影响全站。</div>` : `
    <div class="note"><b>怎么改</b>
      双击画布上的文字即可就地编辑；<br>
      点画布上的图片可换图；<br>
      左侧大纲可拖动排序。改动自动存草稿。
    </div>
    <div class="rowbtn">
      <button class="btn" id="pvHide" ${canStruct ? '' : 'disabled'}>${b.visible ? '隐藏模块' : '显示模块'}</button>
    </div>
    <div class="rowbtn">
      <button class="btn" id="pvDup" ${canStruct ? '' : 'disabled'}>复制模块</button>
      <button class="btn btn--danger" id="pvDel" ${canStruct ? '' : 'disabled'}>删除模块</button>
    </div>`}
  `;

  const dup = $('#pvDup'); if (dup) dup.onclick = () => blockOp(b, 'duplicate', '已复制模块（记得改内容）');
  const del = $('#pvDel'); if (del) del.onclick = () => {
    if (!confirm('确定删除「' + (cleanLabel(b.comment) || b.kind) + '」？\n草稿阶段可重载丢弃，发布后需走回滚。')) return;
    blockOp(b, 'delete', '已删除模块');
  };
  const hid = $('#pvHide'); if (hid) hid.onclick = () => toggleVisible(b);
}

async function blockOp(b, op, okMsg) {
  try {
    if (op === 'delete') await api('/blocks/' + b.id, { method: 'DELETE' });
    else await api('/blocks/' + b.id + '/' + op, { method: 'POST' });
    toast(okMsg);
    await loadPage(state.slug);
  } catch (e) { toast(e.message, true); }
}

/** 注释里的 ====== 只是分隔装饰，去掉后再展示，否则大纲全是等号 */
function cleanLabel(s) {
  if (!s) return '';
  return String(s).replace(/^[=\s]+|[=\s]+$/g, '').trim();
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* 画布上点图片 → 换图 */
document.addEventListener('click', (e) => {
  const cv = $('#cv');
  if (!cv || e.target !== cv) return;
}, true);

window.addEventListener('message', () => {});

/* ───────────────  顶栏动作  ─────────────── */
$('#btnReload').onclick = () => loadPage(state.slug);

$('#btnPreview').onclick = () => {
  window.open('/api/pages/' + encodeURIComponent(state.slug) + '/preview', '_blank');
};

$('#pgSel').onclick = (e) => {
  e.stopPropagation();
  let m = $('#pgMenu');
  if (!m) {
    m = document.createElement('div');
    m.className = 'menu'; m.id = 'pgMenu';
    $('#pgSel').appendChild(m);
  }
  m.innerHTML = state.pages.map(p =>
    `<button data-slug="${escapeHtml(p.slug)}"><span class="lg">${p.lang.toUpperCase()}</span>
      <span>${escapeHtml((p.title || p.slug).replace(/\s*[·|]\s*SEA☆STAR.*$/i, ''))}</span></button>`).join('');
  m.classList.toggle('on');
  m.querySelectorAll('button').forEach(btn => btn.onclick = async () => {
    m.classList.remove('on');
    await loadPage(btn.dataset.slug);
  });
};
document.addEventListener('click', () => { const m = $('#pgMenu'); if (m) m.classList.remove('on'); });

$$('#langSw button').forEach(b => b.onclick = async () => {
  const cur = state.page.lang;
  const want = b.dataset.lang;
  if (cur === want) return;
  const sib = state.pages.find(p => {
    const base = p.slug.replace(/^cn\//, '');
    return base === state.slug.replace(/^cn\//, '') && p.lang === want;
  });
  if (!sib) { toast('该页面还没有' + (want === 'zh' ? '中文' : '英文') + '版本', true); return; }
  await loadPage(sib.slug);
});

$('#btnBack').onclick = () => { location.href = '/admin/'; };

/* 历史 */
$('#btnHist').onclick = async () => {
  try {
    const d = await api('/' + state.page.id + '/revisions');
    const list = d.data || [];
    if (!list.length) { toast('还没有版本快照'); return; }
    toast('共 ' + list.length + ' 个版本，最近：' + list[0].created_at + '（回滚功能在 Stage 4）');
  } catch (e) { toast(e.message, true); }
};

/* ───────────────  发布  ─────────────── */
$('#btnPublish').onclick = async () => {
  const ts = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
  $('#pubBranch').textContent = 'creator/' + state.slug.replace(/\//g, '-') + '-' + ts;
  const un = state.blocks.filter(b => !b.locked);
  $('#pubDiff').innerHTML =
    `<span class="m">本次将提交：${state.slug}（${state.page.lang === 'zh' ? '中文' : '英文'}）</span>\n` +
    `<span class="a">+ 页面共 ${un.length} 个可编辑模块、${(state.blocks.filter(b=>!b.locked).reduce((n,b)=>n+((b.content.match(/<img\\b/gi)||[]).length),0))} 张图</span>\n` +
    `<span class="m">  渲染代码与画布预览完全相同，发布内容＝画布所见</span>`;
  $('#pubBase').innerHTML = '<b>发布方式：评审后上线</b>提交到独立分支并发起 Pull Request，' +
    '由你或开发合并后才会上线；<b>不会直接推 main</b>，也不会覆盖他人的改动。';
  $('#pubMask').classList.add('on');
};
$('#pubX').onclick = $('#pubCancel').onclick = () => $('#pubMask').classList.remove('on');
$('#pubOk').onclick = async () => {
  const btn = $('#pubOk');
  btn.disabled = true;
  btn.textContent = '已入队，等待处理…';
  let qid = null;
  try {
    const d = await api('/' + state.page.id + '/publish', { method: 'POST', body: {} });
    qid = d.data.queue_id;
    $('#pubMask').classList.remove('on');
    // ⚠️ 这里**不能**说"已提交到分支" —— 入队 ≠ 已推送。
    //    真正的 git 操作由发布服务执行，可能因为基线冲突/闸门不通过而**被拒**。
    //    所以必须回查队列状态，否则运维会以为发布成功了。
    toast('已入队（#' + qid + '），正在处理…');
    const r = await waitQueue(qid);
    showPublishResult(r, d.data.branch);
  } catch (e) {
    toast(e.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '提交到分支并发起评审';
  }
};

/** 轮询队列，等发布服务处理完（最多约 75 秒 —— 定时器 30 秒一轮） */
async function waitQueue(id, tries = 25) {
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const d = await api('/publish-queue');
      const q = (d.data || []).find(x => x.id === id);
      if (q && q.status !== 'pending' && q.status !== 'running') return q;
    } catch { /* 单次失败继续等 */ }
  }
  return { status: 'timeout', log: '发布服务还没处理完（可能未安装或未启动）。' };
}

/** 把发布结果明确告诉用户 —— 成功、被拒、还是失败 */
function showPublishResult(q, branch) {
  if (q.status === 'done') {
    toast('已推送分支 ' + branch + '。去 GitHub 开 Pull Request 并评审合并。');
    return;
  }
  const why = String(q.log || '');
  const box = document.createElement('div');
  box.className = 'pg-mask on';
  box.innerHTML = `
    <div class="pg-modal" style="width:600px">
      <div class="pg-modal__hd"><h3>${q.status === 'conflict' ? '发布被拦下' : '发布未完成'}</h3></div>
      <div class="pg-modal__bd">
        <div class="note warn"><b>没有产生任何提交，线上内容未变。</b>
          ${q.status === 'conflict'
            ? '原因：本页在你编辑之后**被开发改过**，库里的内容已过期。直接发布会把开发者的改动覆盖掉，所以系统拒绝了。'
            : '原因见下方日志。'}</div>
        <pre style="background:var(--n100);padding:12px;border-radius:var(--radius);font-size:12px;
                    white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto">${escapeHtml(why)}</pre>
        <div class="note"><b>怎么修</b>
          如果确认是"开发改了页面"，需要把改动同步进编辑器后才能发布
          （这一步要开发执行 <span class="mono">seed-pages.js --reset ${escapeHtml(state.slug)}</span>）。
          同步之后再重新编辑、再次发布即可。</div>
      </div>
      <div class="pg-modal__ft"><button class="btn" id="pubResClose">知道了</button></div>
    </div>`;
  document.body.appendChild(box);
  box.querySelector('#pubResClose').onclick = () => box.remove();
}

/* ───────────────  离开前提醒  ─────────────── */
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
});

boot();
