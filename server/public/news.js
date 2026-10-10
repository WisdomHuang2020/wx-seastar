'use strict';
/* ══════════════════════════════════════════════════════════════════════
   SEA☆STAR 新闻管理（/admin/news）
   ──────────────────────────────────────────────────────────────────────
   · 编辑只写**数据库**；发布才动文件（由发布服务重新生成 58 个新闻页）。
   · ⚠️ 中英段落**一一对应**是硬约束：生成器按 paras[i] ↔ paras_zh[i] 逐段渲染，
     数目不等会让两边错位，**页面上完全看不出来**。所以界面上并排成对呈现，
     并在数目不等时立刻标红、保存时拦下。
   ══════════════════════════════════════════════════════════════════════ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const state = { me: null, list: [], cur: null, dirty: false };

/* ───────────────  基础  ─────────────── */
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  el.style.background = kind === 'err' ? 'var(--danger)' : '';
  $('#toastWrap').appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 6000 : 3200);
}

async function api(path, opts = {}) {
  const r = await fetch('/api/news' + path, {
    credentials: 'same-origin',
    headers: opts.body instanceof FormData ? {} : { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body instanceof FormData ? opts.body
      : (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  let d = {};
  try { d = await r.json(); } catch { /* 非 JSON */ }
  if (!r.ok) { const e = new Error(d.error || ('HTTP ' + r.status)); e.status = r.status; e.code = d.code; throw e; }
  return d;
}

/* 媒体库（用来选图）—— 走后台原有的 /api/media */
async function mediaList(size = 24) {
  const r = await fetch('/api/media?size=' + size, { credentials: 'same-origin' });
  const d = await r.json();
  return d.data || [];
}

/* ───────────────  登录  ─────────────── */
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#lgBtn').disabled = true;
  try {
    const r = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: $('#lgUser').value.trim(), password: $('#lgPass').value }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || '登录失败');
    await boot();
  } catch (err) {
    const el = $('#lgErr');
    el.textContent = err.message;
    el.className = '';
  } finally { $('#lgBtn').disabled = false; }
});

$('#btnLogout').onclick = async (e) => {
  e.preventDefault();
  await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
  location.href = '/admin/';
};

async function boot() {
  let me;
  try {
    const r = await fetch('/api/auth/me', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('未登录');
    me = (await r.json()).data;
  } catch {
    $('#loginView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
    return;
  }
  if (me.must_change) { location.href = '/admin/'; return; }
  state.me = me;
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#whoami').textContent = me.display_name || me.username;
  await load();
}

/* ───────────────  列表  ─────────────── */
async function load() {
  const body = $('#viewBody');
  body.innerHTML = '<div class="empty">加载中…</div>';
  $('#viewActions').innerHTML = `
    <input class="inp" id="q" placeholder="搜索标题或 slug…" style="width:220px">
    <a class="btn btn--ghost btn--sm" href="/news" target="_blank">看线上列表 ↗</a>
    <button class="btn btn--primary btn--sm" id="btnNew">新建新闻</button>
    <button class="btn btn--sm" id="btnPublish" title="把数据库里的新闻改动生成页面并提交到待审分支">发布新闻</button>`;
  $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') load(); });
  $('#btnNew').onclick = () => openEditor(null);
  $('#btnPublish').onclick = publish;

  try {
    const [d, h] = await Promise.all([api('?size=300&q=' + encodeURIComponent($('#q').value.trim())), api('/health')]);
    state.list = d.data.rows;
    renderHealth(h.data);
    renderList(d.data.rows);
  } catch (e) {
    body.innerHTML = `<div class="empty">加载失败：${esc(e.message)}</div>`;
  }
}

/** 体检提示 —— 这些问题**页面上看不出来**，只能在这里提示 */
function renderHealth(h) {
  const issues = h.issues || [];
  const mism = issues.filter(i => i.kind.indexOf('段落数') >= 0);
  const box = document.createElement('div');
  if (!issues.length) {
    box.innerHTML = `<div class="banner banner--info">共 ${h.published} 篇已发布 / 库里 ${h.total} 篇，未发现明显问题 ✓</div>`;
  } else {
    box.innerHTML = `<div class="banner ${mism.length ? 'banner--err' : 'banner--warn'}">
      <b>有 ${issues.length} 处需要注意${mism.length ? `（其中 ${mism.length} 处会让中英错位）` : ''}</b>
      ${issues.slice(0, 8).map(i => `${esc(i.slug)} —— ${esc(i.kind)}`).join('<br>')}
      ${issues.length > 8 ? `<br>…还有 ${issues.length - 8} 处` : ''}
    </div>`;
  }
  $('#viewBody').innerHTML = '';
  $('#viewBody').appendChild(box);
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.id = 'listCard';
  $('#viewBody').appendChild(wrap);
}

function renderList(rows) {
  const card = $('#listCard');
  if (!rows.length) {
    card.innerHTML = '<div class="empty">没有匹配的新闻</div>';
    return;
  }
  card.innerHTML = `
    <table class="tbl">
      <thead><tr>
        <th style="width:110px">日期</th>
        <th>标题（中）</th>
        <th style="width:64px">段落</th>
        <th style="width:88px">状态</th>
        <th style="width:120px"></th>
      </tr></thead>
      <tbody>${rows.map(r => `
        <tr data-id="${r.id}">
          <td class="mono">${esc(r.date)}</td>
          <td class="title-cell">
            ${esc(r.title_zh || r.title || '(无标题)')}
            <div class="muted" style="font-size:12px;font-weight:400">${esc(r.title)}</div>
          </td>
          <td class="mono">${r.paras.length}${r.paras_zh.length ? ' / ' + r.paras_zh.length : ''}
            ${r.aligned ? '' : '<span style="color:var(--warn)" title="中英段落数不一致，会让两边错位">⚠</span>'}</td>
          <td>${r.published ? '<span class="tag" style="background:#ECFDF5;color:#065F46;border-color:#A7F3D0">已发布</span>'
            : '<span class="tag" style="background:var(--n100);color:var(--n500)">草稿</span>'}</td>
          <td><button class="btn btn--sm" data-edit="${r.id}">编辑</button></td>
        </tr>`).join('')}</tbody>
    </table>`;
  $$('tr[data-id]', card).forEach(tr => {
    const id = Number(tr.dataset.id);
    tr.addEventListener('click', (e) => {
      if (e.target.dataset.edit) return;   // 别在点按钮时又开一次
      openEditor(id);
    });
  });
  $$('[data-edit]', card).forEach(b => b.onclick = (e) => { e.stopPropagation(); openEditor(Number(b.dataset.edit)); });
}

/* ───────────────  编辑器  ─────────────── */
async function openEditor(id) {
  const data = id ? (await api('/' + id)).data : {
    id: null, slug: '', date: new Date().toISOString().slice(0, 10),
    title: '', title_zh: '', summary: '', summary_zh: '',
    paras: [], paras_zh: [], images: [], thumb: null, published: 1,
  };
  state.cur = JSON.parse(JSON.stringify(data));
  state.dirty = false;
  renderEditor();
}

function renderEditor() {
  const c = state.cur;
  const isNew = !c.id;
  const root = $('#drawerRoot');
  root.innerHTML = `
  <div class="mask" id="dMask"><div class="drawer" style="width:min(980px,100%)">
    <div class="drawer__hd">
      <h3>${isNew ? '新建新闻' : '编辑新闻'}</h3>
      <button class="btn btn--sm" id="dClose">关闭</button>
    </div>
    <div class="drawer__bd" id="dBd"></div>
    <div class="drawer__ft">
      <button class="btn btn--danger" id="dDel" ${isNew ? 'hidden' : ''}>删除</button>
      <span style="flex:1"></span>
      <a class="btn btn--ghost btn--sm" id="dView" target="_blank"
         href="/news/${esc(c.slug)}" ${isNew ? 'hidden' : ''}>看线上页 ↗</a>
      <button class="btn btn--primary" id="dSave">${isNew ? '创建' : '保存'}</button>
    </div>
  </div></div>`;
  $('#dClose').onclick = closeEditor;
  $('#dMask').addEventListener('click', e => { if (e.target.id === 'dMask') closeEditor(); });
  document.addEventListener('keydown', onKey);
  $('#dSave').onclick = save;
  if (!isNew) $('#dDel').onclick = del;
  renderFields();
}

function onKey(e) {
  if (e.key === 'Escape' && $('#dMask')) closeEditor();
}

function closeEditor() {
  if (state.dirty && !confirm('有未保存的改动，确定关闭？')) return;
  document.removeEventListener('keydown', onKey);
  $('#drawerRoot').innerHTML = '';
  state.cur = null;
}

function renderFields() {
  const c = state.cur;
  const mismatch = c.paras_zh.filter(x => x.trim()).length > 0
    && c.paras.length !== c.paras_zh.length;
  $('#dBd').innerHTML = `
    ${mismatch ? `<div class="banner banner--err"><b>中英段落数不一致（英 ${c.paras.length} / 中 ${c.paras_zh.length}）</b>
      生成页面时按段落一一对应渲染，不一致会让中文页出现错位 —— 页面上看不出来，但内容是错的。
      请改成一样多（中文没有对应内容时也留一个空段落占位）。</div>` : ''}

    <div class="grid3">
      <div class="field"><label>日期</label><input class="inp" id="fDate" value="${esc(c.date)}" placeholder="YYYY-MM-DD"></div>
      <div class="field"><label>网址片段（slug）</label>
        <input class="inp" id="fSlug" value="${esc(c.slug)}" placeholder="小写字母、数字、连字符"></div>
      <div class="field"><label>状态</label>
        <select class="sel" id="fPub">
          <option value="1"${c.published ? ' selected' : ''}>已发布</option>
          <option value="0"${c.published ? '' : ' selected'}>草稿（不生成页面）</option>
        </select></div>
    </div>

    <div class="grid2">
      <div class="field"><label>标题（英文）</label><input class="inp" id="fTitle" value="${esc(c.title)}"></div>
      <div class="field"><label>标题（中文）</label><input class="inp" id="fTitleZh" value="${esc(c.title_zh || '')}"></div>
    </div>
    <div class="grid2">
      <div class="field"><label>摘要（英文，可空）</label><input class="inp" id="fSum" value="${esc(c.summary || '')}"></div>
      <div class="field"><label>摘要（中文，可空）</label><input class="inp" id="fSumZh" value="${esc(c.summary_zh || '')}"></div>
    </div>

    <div class="field"><label>列表缩略图</label>
      <div class="imgs" id="thumbBox"></div>
    </div>

    <div class="field">
      <label>正文段落（左英文 / 右中文，按序号一一对应）</label>
      <div class="para__hd"><span></span><span>English</span><span>中文</span><span></span></div>
      <div class="paras ${mismatch ? 'paras--bad' : ''}" id="paraBox"></div>
      <button class="btn btn--sm" id="addPara" style="margin-top:10px">＋ 加一段</button>
    </div>

    <div class="field">
      <label>正文配图（顺序即版式，第一张作为大图）</label>
      <div class="imgs" id="imgBox"></div>
    </div>
  `;

  // 输入绑定
  const bind = (sel, key, cast) => {
    const el = $(sel);
    el.addEventListener('input', () => {
      state.cur[key] = cast ? cast(el.value) : el.value;
      state.dirty = true;
      if (key === 'paras' || key === 'paras_zh') return;
      if (['date', 'slug', 'published', 'title', 'paras'].includes(key)) renderParsOnly();
    });
  };
  bind('#fDate', 'date'); bind('#fSlug', 'slug');
  bind('#fTitle', 'title'); bind('#fTitleZh', 'title_zh');
  bind('#fSum', 'summary'); bind('#fSumZh', 'summary_zh');
  $('#fPub').addEventListener('change', () => { state.cur.published = Number($('#fPub').value); state.dirty = true; });

  renderParas();
  renderThumb();
  renderImages();
  $('#addPara').onclick = () => {
    state.cur.paras.push('');
    state.cur.paras_zh.push('');
    state.dirty = true;
    renderFields();
  };
}

/** 段落列表单独重渲染（改中文时会变，但不必整页重建、免得输入框失焦） */
function renderParsOnly() {
  const c = state.cur;
  const n = Math.max(c.paras.length, c.paras_zh.length);
  while (c.paras.length < n) c.paras.push('');
  while (c.paras_zh.length < n) c.paras_zh.push('');
  renderParas();
}

function renderParas() {
  const c = state.cur;
  const n = Math.max(c.paras.length, c.paras_zh.length);
  const box = $('#paraBox');
  box.innerHTML = Array.from({ length: n }, (_, i) => `
    <div class="para">
      <div class="para__no">${i + 1}</div>
      <textarea data-i="${i}" data-lang="en" placeholder="English paragraph">${esc(c.paras[i] || '')}</textarea>
      <textarea class="zh" data-i="${i}" data-lang="zh" placeholder="中文段落">${esc(c.paras_zh[i] || '')}</textarea>
      <div class="para__x"><button data-del="${i}" title="删掉这一段（中英一起删）">×</button></div>
    </div>`).join('');
  // 自动长高
  $$('textarea', box).forEach(t => {
    t.style.height = 'auto';
    t.style.height = Math.max(76, t.scrollHeight) + 'px';
    t.addEventListener('input', () => {
      const i = Number(t.dataset.i);
      if (t.dataset.lang === 'en') c.paras[i] = t.value; else c.paras_zh[i] = t.value;
      state.dirty = true;
      t.style.height = 'auto';
      t.style.height = Math.max(76, t.scrollHeight) + 'px';
    });
  });
  $$('[data-del]', box).forEach(b => b.onclick = () => {
    const i = Number(b.dataset.del);
    if (!confirm(`删掉第 ${i + 1} 段？（中英一起删）`)) return;
    c.paras.splice(i, 1);
    c.paras_zh.splice(i, 1);
    state.dirty = true;
    renderFields();
  });
}

/* 缩略图与配图 */
function renderThumb() {
  const box = $('#thumbBox');
  const t = state.cur.thumb;
  box.innerHTML = `
    ${t ? `<div class="imgcell"><img src="${esc(t)}" alt=""><button class="imgcell__x" id="thumbDel" title="移除">×</button>
            <div class="imgcell__p">${esc(t.split('/').pop())}</div></div>` : ''}
    <div class="imgadd" id="thumbPick">${t ? '换一张' : '＋ 选图'}</div>`;
  if (t) $('#thumbDel').onclick = () => { state.cur.thumb = null; state.dirty = true; renderThumb(); };
  $('#thumbPick').onclick = () => pickImage(url => { state.cur.thumb = url; state.dirty = true; renderFields(); });
}

function renderImages() {
  const box = $('#imgBox');
  const list = state.cur.images;
  box.innerHTML = list.map((u, i) => `
    <div class="imgcell"><img src="${esc(u)}" alt="">
      <button class="imgcell__x" data-rm="${i}" title="移除">×</button>
      <div class="imgcell__p" title="${esc(u)}">${esc(u.split('/').pop())}</div>
    </div>`).join('') + '<div class="imgadd" id="imgAdd">＋ 加图</div>';
  $$('[data-rm]', box).forEach(b => b.onclick = () => {
    state.cur.images.splice(Number(b.dataset.rm), 1);
    state.dirty = true;
    renderImages();
  });
  $('#imgAdd').onclick = () => pickImage(url => { state.cur.images.push(url); state.dirty = true; renderImages(); });
}

/** 选图：从媒体库挑，或上传新图 */
async function pickImage(onPick) {
  const items = await mediaList(24).catch(() => []);
  const root = $('#drawerRoot');
  const m = document.createElement('div');
  m.className = 'mask';
  m.id = 'pickMask';
  m.style.zIndex = '300';
  m.innerHTML = `<div class="modal" style="width:min(720px,92vw)">
    <div class="modal__hd"><h3>选图</h3><button class="btn btn--sm" id="pickX">关闭</button></div>
    <div class="modal__bd">
      <div class="field"><label>上传新图</label><input type="file" id="pickUp" accept="image/*"></div>
      <div class="paras" style="display:block"></div>
      <label class="muted" style="font-size:12px">或从图库选（最近 24 张）</label>
      <div class="pickgrid" style="margin-top:8px">
        ${items.length ? items.map(x => `<img src="${esc(x.url)}" data-url="${esc(x.url)}"
            title="${esc(x.original_name || x.filename)}" style="cursor:pointer">`).join('')
          : '<div class="muted">图库是空的</div>'}
      </div>
    </div></div>`;
  root.appendChild(m);
  const close = () => m.remove();
  $('#pickX', m).onclick = close;
  m.addEventListener('click', e => { if (e.target.id === 'pickMask') close(); });
  $$('img[data-url]', m).forEach(im => im.onclick = () => { onPick(im.dataset.url); close(); });
  $('#pickUp', m).onchange = async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    try {
      const r = await fetch('/api/media', { method: 'POST', credentials: 'same-origin', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || '上传失败');
      onPick(d.data.url); close();
    } catch (err) { toast(err.message, 'err'); }
  };
}

/* ───────────────  保存 / 删除 / 发布  ─────────────── */
async function save() {
  const c = state.cur;
  const nz = c.paras_zh.filter(x => String(x).trim()).length;
  if (nz && c.paras.length !== c.paras_zh.length) {
    toast('中英段落数不一致，先改成一样多再保存', 'err');
    return;
  }
  const btn = $('#dSave');
  btn.disabled = true;
  btn.textContent = '保存中…';
  try {
    if (c.id) await api('/' + c.id, { method: 'PUT', body: c });
    else {
      const d = await api('', { method: 'POST', body: c });
      state.cur.id = d.data.id;
    }
    state.dirty = false;
    toast('已保存。改动只在数据库里，要点「发布新闻」才会生成页面并提交。');
    closeEditor();
    await load();
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if ($('#dSave')) { btn.disabled = false; btn.textContent = '保存'; }
  }
}

async function del() {
  const c = state.cur;
  if (!confirm(`确定删除《${c.title_zh || c.title}》？\n删除后对应的页面也会在下次发布时移除。`)) return;
  try {
    await api('/' + c.id, { method: 'DELETE' });
    state.dirty = false;
    toast('已删除');
    closeEditor();
    await load();
  } catch (e) { toast(e.message, 'err'); }
}

/* ───────────────  发布  ─────────────── */
/**
 * 发布 = 入队，由发布服务重新生成 58 个新闻页并提交到待审分支。
 * ⚠️ 「入队成功」不等于「已推送」—— 必须回查队列真实结果，
 *    否则冲突/闸门不过时运维会一直以为发布成功了。
 */
async function publish() {
  if (!confirm('发布会把数据库里的新闻改动生成页面，提交到待审分支 creator。\n\n'
    + '不会直接改线上；要评审合并后才上线。继续？')) return;
  const btn = $('#btnPublish');
  btn.disabled = true;
  btn.textContent = '已入队…';
  try {
    const d = await api('/publish', { method: 'POST', body: {} });
    const qid = d.data.queue_id;
    toast('已入队（#' + qid + '），等发布服务处理…');
    const q = await waitQueue(qid);
    showResult(q);
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    if ($('#btnPublish')) { btn.disabled = false; btn.textContent = '发布新闻'; }
  }
}

async function waitQueue(id, tries = 25) {
  for (let i = 0; i < tries; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const r = await fetch('/api/pages/publish-queue', { credentials: 'same-origin' });
      const d = await r.json();
      const q = (d.data || []).find(x => x.id === id);
      if (q && q.status !== 'pending' && q.status !== 'running') return q;
    } catch { /* 继续等 */ }
  }
  return { status: 'timeout', log: '发布服务还没处理（可能未安装或未启动）。' };
}

function showResult(q) {
  if (q.status === 'done') { toast('已推送到待审分支，去 GitHub 开 PR 评审合并。'); return; }
  const m = document.createElement('div');
  m.className = 'mask';
  m.style.zIndex = '300';
  m.innerHTML = `<div class="modal" style="width:min(620px,92vw)">
    <div class="modal__hd"><h3>${q.status === 'conflict' ? '发布被拦下' : '发布未完成'}</h3></div>
    <div class="modal__bd">
      <div class="banner banner--warn"><b>没有产生任何提交，线上内容未变。</b>
        ${q.status === 'conflict'
          ? '原因：库里的新闻已被开发者改过（或与仓库冲突），直接发布会覆盖别人的改动，所以系统拒绝了。'
          : '原因见下方日志。'}</div>
      <pre style="background:var(--n100);padding:12px;border-radius:var(--radius);font-size:12px;
                  white-space:pre-wrap;word-break:break-all;max-height:240px;overflow:auto">${esc(q.log || '')}</pre>
    </div>
    <div class="modal__ft"><button class="btn" id="rClose">知道了</button></div></div>`;
  $('#drawerRoot').appendChild(m);
  $('#rClose', m).onclick = () => m.remove();
}

/* ───────────────  启动  ─────────────── */
boot();
