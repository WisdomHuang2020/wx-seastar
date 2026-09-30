/* ============================================================================
   SEA☆STAR 内容管理后台 · 前端逻辑
   原生 JS，零构建、零框架 —— 维护者只需点鼠标，不需要会命令行或跑构建。
   ============================================================================ */
'use strict';

// ───────────────────────────  基础工具  ───────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** 转义，防止内容里的尖括号破坏页面（所有插值一律经过它） */
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function humanSize(n) {
  n = Number(n) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
  if (n < 1073741824) return (n / 1048576).toFixed(1) + ' MB';
  return (n / 1073741824).toFixed(2) + ' GB';
}

function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' toast--err' : kind === 'ok' ? ' toast--ok' : '');
  el.textContent = msg;
  $('#toastRoot').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 3200);
  setTimeout(() => el.remove(), 3600);
}

/** 统一 API 调用：自动带 Cookie、解析 JSON、把后端错误转成异常 */
async function api(path, { method = 'GET', body, raw = false } = {}) {
  const opt = { method, credentials: 'same-origin', headers: {} };
  if (body instanceof FormData) {
    opt.body = body;
  } else if (body !== undefined) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch('/api' + path, opt);
  if (raw) return res;
  let data = null;
  try { data = await res.json(); } catch { /* 非 JSON */ }
  if (!res.ok || (data && data.ok === false)) {
    const err = new Error((data && data.error) || `请求失败（HTTP ${res.status}）`);
    err.status = res.status;
    err.code = data && data.code;
    throw err;
  }
  return data;
}

/** 确认框（原生 confirm 够用且不会被误点关闭） */
const confirmDo = (msg) => window.confirm(msg);

// ───────────────────────────  状态  ───────────────────────────
const state = {
  view: 'products',
  me: null,
  products: [], documents: [], messages: [], media: [],
  msgCounts: {},
};

// ───────────────────────────  登录  ───────────────────────────
$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#lgBtn'), errBox = $('#lgErr');
  errBox.classList.add('hidden');
  btn.disabled = true; btn.textContent = '登录中…';
  try {
    const r = await api('/auth/login', {
      method: 'POST',
      body: { username: $('#lgUser').value, password: $('#lgPass').value },
    });
    state.me = r.data;
    if (r.data.must_change) {
      await boot();
      openPasswordModal(true);
    } else {
      await boot();
    }
  } catch (err) {
    errBox.textContent = err.message;
    errBox.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = '登录';
  }
});

$('#btnLogout').addEventListener('click', async (e) => {
  e.preventDefault();
  if (!confirmDo('确定要退出登录吗？')) return;
  try { await api('/auth/logout', { method: 'POST' }); } catch { /* ignore */ }
  location.reload();
});

$('#btnPwd').addEventListener('click', (e) => { e.preventDefault(); openPasswordModal(false); });

/** 修改密码弹窗；forced=true 时不可取消（首次登录） */
function openPasswordModal(forced) {
  const box = document.createElement('div');
  box.className = 'modal';
  box.innerHTML = `
    <form class="modal__box" id="pwdForm">
      <div class="modal__hd">
        <h3>${forced ? '请先修改初始密码' : '修改密码'}</h3>
      </div>
      <div class="modal__bd">
        ${forced ? '<p class="small muted" style="margin-bottom:14px">为了账号安全，首次登录必须设置新密码后才能使用后台。</p>' : ''}
        <div class="field">
          <label>当前密码</label>
          <input class="inp" type="password" name="current" required autocomplete="current-password">
        </div>
        <div class="field" style="margin-top:12px">
          <label>新密码</label>
          <input class="inp" type="password" name="next" required minlength="10" autocomplete="new-password">
          <span class="hint">至少 10 位，建议混合大小写字母、数字与符号</span>
        </div>
        <div class="field" style="margin-top:12px">
          <label>确认新密码</label>
          <input class="inp" type="password" name="confirm" required autocomplete="new-password">
        </div>
        <div class="hidden" id="pwdErr" style="margin-top:12px;padding:10px 12px;background:#FEE2E2;color:#991B1B;border-radius:6px;font-size:13px"></div>
      </div>
      <div class="modal__ft">
        ${forced ? '' : '<button type="button" class="btn btn--ghost" id="pwdCancel">取消</button>'}
        <button class="btn" type="submit">保存</button>
      </div>
    </form>`;
  document.body.appendChild(box);

  const close = () => box.remove();
  const cancel = $('#pwdCancel', box);
  if (cancel) cancel.addEventListener('click', close);

  $('#pwdForm', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const errBox = $('#pwdErr', box);
    errBox.classList.add('hidden');
    if (f.next.value !== f.confirm.value) {
      errBox.textContent = '两次输入的新密码不一致'; errBox.classList.remove('hidden'); return;
    }
    try {
      await api('/auth/password', { method: 'POST', body: { current: f.current.value, next: f.next.value } });
      alert('密码已修改，请用新密码重新登录。');
      location.reload();
    } catch (err) {
      errBox.textContent = err.message; errBox.classList.remove('hidden');
    }
  });
}

// ───────────────────────────  启动与视图路由  ───────────────────────────
async function boot() {
  try {
    const me = await api('/auth/me');
    state.me = me.data;
  } catch {
    $('#loginView').classList.remove('hidden');
    $('#appView').classList.add('hidden');
    return;
  }
  $('#loginView').classList.add('hidden');
  $('#appView').classList.remove('hidden');
  $('#whoami').textContent = state.me.display_name || state.me.username;
  await refreshCounts();
  switchView('products');
}

$$('#nav button').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

function switchView(view) {
  state.view = view;
  $$('#nav button').forEach(b => b.classList.toggle('is-active', b.dataset.view === view));
  const titles = { products: '产品管理', documents: '资料文件', messages: '客户留言', media: '图片库' };
  $('#viewTitle').textContent = titles[view] || view;
  $('#viewActions').innerHTML = '';
  if (view === 'products') renderProducts();
  if (view === 'documents') renderDocuments();
  if (view === 'messages') renderMessages();
  if (view === 'media') renderMedia();
}

/** 侧栏角标 */
async function refreshCounts() {
  try {
    const [p, d, m, md] = await Promise.all([
      api('/products?size=1'), api('/documents?size=1'),
      api('/messages?size=1'), api('/media?size=1'),
    ]);
    $('#cntProducts').textContent = p.total ?? 0;
    $('#cntDocuments').textContent = d.total ?? 0;
    $('#cntMessages').textContent = m.total ?? 0;
    $('#cntMedia').textContent = md.total ?? 0;
    state.msgCounts = (m.data && m.counts) || {};
  } catch { /* 忽略 */ }
}

// ───────────────────────────  产品管理  ───────────────────────────
async function renderProducts() {
  const body = $('#viewBody');
  body.innerHTML = '<div class="empty">加载中…</div>';
  $('#viewActions').innerHTML = `
    <input class="inp" id="pQ" placeholder="搜索名称 / 系列 / 标识" style="width:210px;height:34px">
    <select class="sel" id="pCat" style="height:34px"><option value="">全部业务线</option></select>
    <button class="btn" id="pNew">+ 新建产品</button>`;

  try {
    const r = await api('/products?size=200');
    state.products = r.data;
    // 业务线下拉由实际数据汇总而来，避免写死
    const cats = [...new Set(r.data.map(p => p.category).filter(Boolean))].sort();
    $('#pCat').innerHTML = '<option value="">全部业务线</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    const draw = () => {
      const q = ($('#pQ').value || '').toLowerCase();
      const cat = $('#pCat').value;
      const list = state.products.filter(p =>
        (!cat || p.category === cat) &&
        (!q || [p.title_zh, p.title_en, p.series, p.slug].some(v => (v || '').toLowerCase().includes(q))));
      renderProductTable(list);
    };
    $('#pQ').addEventListener('input', draw);
    $('#pCat').addEventListener('change', draw);
    $('#pNew').addEventListener('click', () => openProductEditor(null));
    draw();
  } catch (err) {
    body.innerHTML = `<div class="empty">加载失败：${esc(err.message)}</div>`;
  }
}

function renderProductTable(list) {
  const body = $('#viewBody');
  if (!list.length) {
    body.innerHTML = `<div class="card"><div class="empty"><span class="star"></span>还没有产品<br><span class="small">点右上角「新建产品」开始添加</span></div></div>`;
    return;
  }
  body.innerHTML = `
    <div class="card">
      <table class="tbl">
        <thead><tr>
          <th style="width:64px">图片</th><th>产品名称</th><th>业务线 / 系列</th>
          <th style="width:88px">标识</th><th style="width:80px">状态</th>
          <th style="width:132px">更新时间</th><th style="width:190px">操作</th>
        </tr></thead>
        <tbody>${list.map(p => `
          <tr data-id="${p.id}">
            <td>${p.cover_url
              ? `<img class="thumb" src="${esc(p.cover_url)}" alt="" loading="lazy">`
              : '<div class="thumb" style="display:grid;place-items:center;color:#9AA3AE;font-size:11px">无图</div>'}</td>
            <td class="title-cell">
              ${esc(p.title_zh)}
              <div class="small muted mono">${esc(p.slug)}</div>
            </td>
            <td class="small">${esc(p.category || '—')}<div class="muted mono">${esc(p.series || '')}</div></td>
            <td>${(p.badges || []).map(b => `<span class="tag tag--brand">${esc(b.text)}</span>`).join(' ') || '<span class="muted small">—</span>'}</td>
            <td>${p.published ? '<span class="tag tag--ok">已上架</span>' : '<span class="tag tag--off">已下架</span>'}</td>
            <td class="small muted mono">${esc((p.updated_at || '').slice(0, 16))}</td>
            <td>
              <button class="btn btn--sm btn--ghost" data-act="edit">编辑</button>
              <button class="btn btn--sm btn--ghost" data-act="toggle">${p.published ? '下架' : '上架'}</button>
              <button class="btn btn--sm btn--ghost" data-act="del" style="color:#DC2626">删除</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  $$('#viewBody tbody tr').forEach(tr => {
    const id = Number(tr.dataset.id);
    const p = state.products.find(x => x.id === id);
    tr.addEventListener('click', async (e) => {
      const act = e.target.dataset.act;
      if (!act) return;
      if (act === 'edit') return openProductEditor(p);
      if (act === 'toggle') {
        try {
          await api(`/products/${id}`, { method: 'PATCH', body: { published: !p.published } });
          toast(p.published ? '已下架' : '已上架', 'ok');
          renderProducts(); refreshCounts();
        } catch (err) { toast(err.message, 'err'); }
      }
      if (act === 'del') {
        if (!confirmDo(`确定下架「${p.title_zh}」吗？\n\n下架后前台不再显示，但数据仍保留，可随时重新上架。`)) return;
        try { await api(`/products/${id}`, { method: 'DELETE' }); toast('已下架', 'ok'); renderProducts(); refreshCounts(); }
        catch (err) { toast(err.message, 'err'); }
      }
    });
  });
}

/** 产品编辑抽屉：基本信息 + 规格参数 + 标识 + 图库 + 关联资料 */
async function openProductEditor(p) {
  const isNew = !p;
  let detail = null;
  if (!isNew) {
    try { detail = (await api(`/products/${p.id}`)).data; }
    catch (err) { return toast(err.message, 'err'); }
  }
  const d = detail || {
    title_zh: '', title_en: '', summary_zh: '', summary_en: '', body_zh: '', body_en: '',
    slug: '', category: '', series: '', specs: [], badges: [], images: [], documents: [],
    cover_url: null, cover_media: null, published: true, sort_order: 0,
  };

  const wrap = document.createElement('div');
  wrap.className = 'mask';
  wrap.innerHTML = `
  <div class="drawer">
    <div class="drawer__hd">
      <h3>${isNew ? '新建产品' : '编辑产品'}</h3>
      <button class="btn btn--sm btn--ghost" id="edCancel">关闭</button>
      <button class="btn btn--sm" id="edSave">保存</button>
    </div>
    <div class="drawer__bd">
      <div class="grid2">
        <div class="field">
          <label>产品名称（中文）<span style="color:#DC2626">*</span></label>
          <input class="inp" id="fTitleZh" value="${esc(d.title_zh)}" required>
        </div>
        <div class="field">
          <label>Product name (English)</label>
          <input class="inp" id="fTitleEn" value="${esc(d.title_en)}">
        </div>
        <div class="field">
          <label>业务线</label>
          <input class="inp" id="fCategory" value="${esc(d.category)}" placeholder="如 Commercial / Downlight">
        </div>
        <div class="field">
          <label>产品系列</label>
          <input class="inp" id="fSeries" value="${esc(d.series)}" placeholder="如 CDX2">
        </div>
        <div class="field span2">
          <label>简介（中文，一行）</label>
          <input class="inp" id="fSumZh" value="${esc(d.summary_zh)}">
        </div>
        <div class="field span2">
          <label>Summary (English)</label>
          <input class="inp" id="fSumEn" value="${esc(d.summary_en)}">
        </div>
        <div class="field">
          <label>URL 标识（slug）</label>
          <input class="inp" id="fSlug" value="${esc(d.slug)}" placeholder="留空自动生成">
          <span class="hint">产品专用的资料地址形如 /docs?p=<b>cdx2-mesh-ble</b>，建议用英文</span>
        </div>
        <div class="field">
          <label>排序（数字越小越靠前）</label>
          <input class="inp" id="fOrder" type="number" value="${esc(d.sort_order)}">
        </div>
        <div class="field span2">
          <label>详细描述（中文）</label>
          <textarea class="ta" id="fBodyZh">${esc(d.body_zh)}</textarea>
        </div>
      </div>

      <hr style="margin:24px 0;border:0;border-top:1px solid var(--border)">

      <div class="row" style="justify-content:space-between">
        <h3 style="font-size:14px">规格参数</h3>
        <button class="btn btn--sm btn--ghost" id="specAdd">+ 添加一行</button>
      </div>
      <div id="specList" style="margin-top:10px"></div>

      <hr style="margin:24px 0;border:0;border-top:1px solid var(--border)">

      <div class="row" style="justify-content:space-between">
        <h3 style="font-size:14px">角标</h3>
        <button class="btn btn--sm btn--ghost" id="badgeAdd">+ 添加角标</button>
      </div>
      <div id="badgeList" style="margin-top:10px;display:flex;flex-direction:column;gap:8px"></div>

      <hr style="margin:24px 0;border:0;border-top:1px solid var(--border)">

      <h3 style="font-size:14px;margin-bottom:10px">产品图片</h3>
      ${isNew
        ? '<p class="small muted">保存后即可上传图片。</p>'
        : `<div id="imgArea"></div>`}

      ${isNew ? '' : `
      <hr style="margin:24px 0;border:0;border-top:1px solid var(--border)">
      <div class="row" style="justify-content:space-between">
        <h3 style="font-size:14px">关联资料</h3>
        <button class="btn btn--sm btn--ghost" id="docAdd">+ 上传资料</button>
      </div>
      <div id="docArea" style="margin-top:10px"></div>`}
    </div>
  </div>`;
  $('#modalRoot').appendChild(wrap);

  const close = () => { wrap.remove(); refreshCounts(); };
  $('#edCancel', wrap).addEventListener('click', close);
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });

  // ——— 规格动态行 ———
  const specList = $('#specList', wrap);
  const addSpec = (k = '', v = '', u = '') => {
    const row = document.createElement('div');
    row.className = 'row';
    row.style.marginBottom = '8px';
    row.innerHTML = `
      <input class="inp" data-k placeholder="参数名（如 Series）" value="${esc(k)}" style="flex:1">
      <input class="inp" data-v placeholder="值（如 CDX2）" value="${esc(v)}" style="flex:1.4">
      <input class="inp" data-u placeholder="单位" value="${esc(u)}" style="width:88px">
      <button class="btn btn--sm btn--ghost" data-rm style="color:#DC2626">×</button>`;
    row.querySelector('[data-rm]').addEventListener('click', () => row.remove());
    specList.appendChild(row);
  };
  (d.specs || []).forEach(s => addSpec(s.k, s.v, s.u));
  $('#specAdd', wrap).addEventListener('click', () => addSpec());

  // ——— 角标动态行 ———
  const badgeList = $('#badgeList', wrap);
  const addBadge = (text = '', type = 'brand') => {
    const row = document.createElement('div');
    row.className = 'row';
    row.innerHTML = `
      <input class="inp" data-text placeholder="角标文字（如 新品）" value="${esc(text)}" style="flex:1">
      <select class="sel" data-type style="width:150px">
        ${[['brand', '品牌蓝'], ['tech', '技术蓝'], ['neutral', '中性']]
          .map(([v, l]) => `<option value="${v}"${v === type ? ' selected' : ''}>${l}</option>`).join('')}
      </select>
      <button class="btn btn--sm btn--ghost" data-rm style="color:#DC2626">×</button>`;
    row.querySelector('[data-rm]').addEventListener('click', () => row.remove());
    badgeList.appendChild(row);
  };
  (d.badges || []).forEach(b => addBadge(b.text, b.type));
  $('#badgeAdd', wrap).addEventListener('click', () => addBadge());

  // ——— 图片区（已有产品）———
  let images = d.images ? [...d.images] : [];
  let coverId = d.cover_media || null;
  if (!isNew) {
    const imgArea = $('#imgArea', wrap);
    const drawImages = () => {
      imgArea.innerHTML = `
        <div class="drop" id="imgDrop">
          点击选择图片，或把图片拖到这里<br>
          <span class="small">支持 JPG / PNG / WebP，单张不超过 ${window.__MAXIMG || 12} MB</span>
          <div class="progress hidden" id="imgProg"><i></i></div>
        </div>
        <div class="pickgrid" style="margin-top:12px">
          ${images.map(im => `
            <div class="pick${im.id === coverId ? ' is-sel' : ''}" data-id="${im.id}">
              <img src="${esc(im.url)}" alt="" loading="lazy">
              <button class="pick__x" data-rm="${im.id}" title="从本产品移除">×</button>
              <div class="small" style="padding:4px 6px;text-align:center">${im.id === coverId ? '主图' : '点选设为主图'}</div>
            </div>`).join('')}
        </div>`;
      const drop = $('#imgDrop', imgArea);
      const fileInput = document.createElement('input');
      fileInput.type = 'file'; fileInput.accept = 'image/*'; fileInput.className = 'hidden';
      imgArea.appendChild(fileInput);

      drop.addEventListener('click', () => fileInput.click());
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files[0]) uploadImg(e.dataTransfer.files[0]); });
      fileInput.addEventListener('change', () => { if (fileInput.files[0]) uploadImg(fileInput.files[0]); });

      async function uploadImg(file) {
        const prog = $('#imgProg', imgArea);
        prog.classList.remove('hidden');
        const bar = prog.querySelector('i');
        try {
          const fd = new FormData();
          fd.append('file', file);
          const up = await api('/media', { method: 'POST', body: fd });
          const mid = up.data.id;
          await api(`/products/${p.id}/images`, { method: 'POST', body: { media_id: mid } });
          if (!coverId) {
            await api(`/products/${p.id}`, { method: 'PATCH', body: { cover_media: mid } });
            coverId = mid;
          }
          images.push({ id: mid, url: up.data.url });
          toast('图片已上传', 'ok');
          drawImages(); refreshCounts();
        } catch (err) { toast(err.message, 'err'); }
        finally { prog.classList.add('hidden'); bar.style.width = '0'; }
      }

      $$('.pick', imgArea).forEach(el => {
        const id = Number(el.dataset.id);
        el.addEventListener('click', async (e) => {
          if (e.target.dataset.rm) {
            e.stopPropagation();
            if (!confirmDo('确定从本产品移除这张图片？（图片本身仍保留在图片库）')) return;
            try {
              await api(`/products/${p.id}/images/${id}`, { method: 'DELETE' });
              images = images.filter(x => x.id !== id);
              if (coverId === id) {
                coverId = images[0] ? images[0].id : null;
                await api(`/products/${p.id}`, { method: 'PATCH', body: { cover_media: coverId } });
              }
              drawImages(); toast('已移除', 'ok');
            } catch (err) { toast(err.message, 'err'); }
            return;
          }
          try {
            await api(`/products/${p.id}`, { method: 'PATCH', body: { cover_media: id } });
            coverId = id; drawImages(); toast('已设为主图', 'ok');
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    };
    drawImages();

    // ——— 关联资料区 ———
    let docList = detail.documents || [];
    const docArea = $('#docArea', wrap);
    const drawDocs = () => {
      docArea.innerHTML = docList.length
        ? `<table class="tbl"><tbody>${docList.map(dd => `
            <tr data-id="${dd.id}">
              <td><span class="tag tag--brand">${esc(dd.kind_label || dd.kind)}</span></td>
              <td>${esc(dd.title_zh || dd.original_name)}</td>
              <td class="small muted mono">${humanSize(dd.size)}</td>
              <td style="width:70px"><button class="btn btn--sm btn--ghost" data-unlink style="color:#DC2626">移除</button></td>
            </tr>`).join('')}</tbody></table>`
        : '<p class="small muted">暂无关联资料</p>';

      $$('tr[data-id]', docArea).forEach(tr => {
        tr.querySelector('[data-unlink]').addEventListener('click', async () => {
          const id = Number(tr.dataset.id);
          if (!confirmDo('把这份资料从本产品移除？（资料仍保留在「资料文件」中）')) return;
          try {
            await api(`/documents/${id}`, { method: 'PATCH', body: { product_id: null } });
            docList = docList.filter(x => x.id !== id);
            drawDocs(); refreshCounts(); toast('已移除关联', 'ok');
          } catch (err) { toast(err.message, 'err'); }
        });
      });
    };
    drawDocs();

    $('#docAdd', wrap).addEventListener('click', () => openDocUploader({ productId: p.id, onDone: (doc) => { docList.push(doc); drawDocs(); refreshCounts(); } }));
  }

  // ——— 保存 ———
  $('#edSave', wrap).addEventListener('click', async () => {
    const specs = $$('#specList .row', wrap).map(r => ({
      k: r.querySelector('[data-k]').value.trim(),
      v: r.querySelector('[data-v]').value.trim(),
      u: r.querySelector('[data-u]').value.trim(),
    })).filter(s => s.k);
    const badges = $$('#badgeList .row', wrap).map(r => ({
      text: r.querySelector('[data-text]').value.trim(),
      type: r.querySelector('[data-type]').value,
    })).filter(b => b.text);

    const payload = {
      title_zh: $('#fTitleZh', wrap).value.trim(),
      title_en: $('#fTitleEn', wrap).value.trim(),
      summary_zh: $('#fSumZh', wrap).value.trim(),
      summary_en: $('#fSumEn', wrap).value.trim(),
      body_zh: $('#fBodyZh', wrap).value,
      category: $('#fCategory', wrap).value.trim(),
      series: $('#fSeries', wrap).value.trim(),
      slug: $('#fSlug', wrap).value.trim(),
      sort_order: Number($('#fOrder', wrap).value) || 0,
      specs, badges,
    };
    if (!payload.title_zh) return toast('产品名称（中文）是必填项', 'err');

    try {
      if (isNew) {
        const r = await api('/products', { method: 'POST', body: payload });
        toast('已创建，可继续上传图片与资料', 'ok');
        close();
        openProductEditor(r.data);
        renderProducts();
      } else {
        await api(`/products/${p.id}`, { method: 'PATCH', body: payload });
        toast('已保存', 'ok');
        close();
        renderProducts();
      }
    } catch (err) { toast(err.message, 'err'); }
  });
}

// ───────────────────────────  资料文件  ───────────────────────────
const KIND_LABEL = { spec: '规格书', manual: '说明书', ies: 'IES 光度文件', drawing: '图纸', other: '其他资料' };

async function renderDocuments() {
  const body = $('#viewBody');
  body.innerHTML = '<div class="empty">加载中…</div>';
  $('#viewActions').innerHTML = `<button class="btn" id="docNew">+ 上传资料</button>`;

  try {
    const r = await api('/documents?size=300');
    state.documents = r.data;
    const kinds = r.kinds || KIND_LABEL;

    body.innerHTML = `
      <div class="card">
        <div class="card__hd">
          <input class="inp" id="dQ" placeholder="搜索文件名 / 标题 / 产品" style="width:250px;height:34px">
          <select class="sel" id="dKind" style="height:34px;width:160px">
            <option value="">全部类型</option>
            ${Object.entries(kinds).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
          </select>
          <span class="grow"></span>
          <span class="small muted">共 ${state.documents.length} 份资料</span>
        </div>
        <div id="docTable"></div>
      </div>`;

    const draw = () => {
      const q = ($('#dQ').value || '').toLowerCase();
      const kind = $('#dKind').value;
      const list = state.documents.filter(d =>
        (!kind || d.kind === kind) &&
        (!q || [d.original_name, d.title_zh, d.title_en, d.product_title].some(v => (v || '').toLowerCase().includes(q))));
      const box = $('#docTable');
      if (!list.length) { box.innerHTML = '<div class="empty"><span class="star"></span>没有符合条件的资料</div>'; return; }
      box.innerHTML = `
        <table class="tbl">
          <thead><tr>
            <th style="width:120px">类型</th><th>文件 / 标题</th><th>关联产品</th>
            <th style="width:90px">大小</th><th style="width:72px">语言</th>
            <th style="width:84px">下载数</th><th style="width:200px">操作</th>
          </tr></thead>
          <tbody>${list.map(d => `
            <tr data-id="${d.id}">
              <td><span class="tag tag--brand">${esc(d.kind_label || d.kind)}</span></td>
              <td>
                <div class="title-cell">${esc(d.title_zh || d.original_name)}</div>
                <div class="small muted mono">${esc(d.original_name)}</div>
              </td>
              <td class="small">${d.product_title ? esc(d.product_title) : '<span class="muted">通用资料</span>'}</td>
              <td class="small mono">${esc(d.size_human || humanSize(d.size))}</td>
              <td class="small">${d.lang === 'en' ? 'English' : '中文'}</td>
              <td class="small mono">${d.downloads || 0}</td>
              <td>
                <a class="btn btn--sm btn--ghost" href="/api/public/download/${d.id}" target="_blank">查看</a>
                <button class="btn btn--sm btn--ghost" data-act="edit">编辑</button>
                <button class="btn btn--sm btn--ghost" data-act="del" style="color:#DC2626">删除</button>
              </td>
            </tr>`).join('')}</tbody>
        </table>`;
      $$('tr[data-id]', box).forEach(tr => {
        const id = Number(tr.dataset.id);
        const d = state.documents.find(x => x.id === id);
        tr.addEventListener('click', (e) => {
          const act = e.target.dataset.act;
          if (act === 'edit') openDocEditor(d);
          if (act === 'del') {
            if (!confirmDo(`确定删除「${d.original_name}」？\n\n文件将从服务器移除，且不可恢复。`)) return;
            api(`/documents/${id}`, { method: 'DELETE' })
              .then(() => { toast('已删除', 'ok'); renderDocuments(); refreshCounts(); })
              .catch(err => toast(err.message, 'err'));
          }
        });
      });
    };
    $('#dQ').addEventListener('input', draw);
    $('#dKind').addEventListener('change', draw);
    draw();
    $('#docNew').addEventListener('click', () => openDocUploader({ onDone: () => { renderDocuments(); refreshCounts(); } }));
  } catch (err) {
    body.innerHTML = `<div class="empty">加载失败：${esc(err.message)}</div>`;
  }
}

/** 资料上传弹窗（也用于产品详情里的「+ 上传资料」） */
async function openDocUploader({ productId = null, onDone } = {}) {
  let products = state.products;
  if (!products.length) { try { products = (await api('/products?size=200')).data; } catch { products = []; } }

  const box = document.createElement('div');
  box.className = 'modal';
  box.innerHTML = `
    <form class="modal__box" id="upForm">
      <div class="modal__hd"><h3>上传资料</h3></div>
      <div class="modal__bd">
        <div class="drop" id="docDrop">
          点击选择文件，或把文件拖到这里<br>
          <span class="small">支持 PDF / IES / LDT / Office / 图纸 / 压缩包，单个不超过 ${window.__MAXDOC || 80} MB</span>
          <div class="progress hidden" id="docProg"><i></i></div>
          <div id="docPicked" class="small" style="margin-top:8px"></div>
        </div>
        <div class="grid2" style="margin-top:16px">
          <div class="field">
            <label>资料类型</label>
            <select class="sel" name="kind">
              ${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>语言</label>
            <select class="sel" name="lang">
              <option value="zh">中文</option><option value="en">English</option>
            </select>
          </div>
          <div class="field span2">
            <label>显示标题</label>
            <input class="inp" name="title_zh" placeholder="留空则用文件名">
          </div>
          <div class="field span2">
            <label>关联产品</label>
            <select class="sel" name="product_id">
              <option value="">通用资料（不属于具体产品）</option>
              ${products.map(p => `<option value="${p.id}"${productId === p.id ? ' selected' : ''}>${esc(p.title_zh)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="modal__ft">
        <button type="button" class="btn btn--ghost" id="upCancel">取消</button>
        <button class="btn" type="submit" id="upBtn" disabled>上传</button>
      </div>
    </form>`;
  $('#modalRoot').appendChild(box);

  let picked = null;
  const drop = $('#docDrop', box);
  const input = document.createElement('input');
  input.type = 'file'; input.className = 'hidden';
  box.appendChild(input);

  const setPicked = (f) => {
    picked = f;
    $('#docPicked', box).textContent = f ? `已选择：${f.name}（${humanSize(f.size)}）` : '';
    $('#upBtn', box).disabled = !f;
    const t = $('input[name=title_zh]', box);
    if (f && !t.value) t.value = f.name.replace(/\.[^.]+$/, '');
  };
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); if (e.dataTransfer.files[0]) setPicked(e.dataTransfer.files[0]); });
  input.addEventListener('change', () => { if (input.files[0]) setPicked(input.files[0]); });

  const close = () => box.remove();
  $('#upCancel', box).addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });

  $('#upForm', box).addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!picked) return;
    const btn = $('#upBtn', box), prog = $('#docProg', box);
    btn.disabled = true; btn.textContent = '上传中…';
    prog.classList.remove('hidden');
    try {
      const f = e.target;
      const fd = new FormData();
      fd.append('file', picked);
      fd.append('kind', f.kind.value);
      fd.append('lang', f.lang.value);
      fd.append('title_zh', f.title_zh.value);
      if (f.product_id.value) fd.append('product_id', f.product_id.value);
      const r = await api('/documents', { method: 'POST', body: fd });
      toast('上传成功', 'ok');
      if (onDone) onDone(r.data);
      close();
    } catch (err) {
      toast(err.message, 'err');
      btn.disabled = false; btn.textContent = '上传';
    } finally { prog.classList.add('hidden'); }
  });
}

/** 编辑资料元信息 */
async function openDocEditor(d) {
  let products = state.products;
  if (!products.length) { try { products = (await api('/products?size=200')).data; } catch { products = []; } }

  const box = document.createElement('div');
  box.className = 'modal';
  box.innerHTML = `
    <form class="modal__box">
      <div class="modal__hd"><h3>编辑资料</h3></div>
      <div class="modal__bd">
        <p class="small muted mono" style="margin-bottom:14px">${esc(d.original_name)}</p>
        <div class="grid2">
          <div class="field">
            <label>资料类型</label>
            <select class="sel" name="kind">
              ${Object.entries(KIND_LABEL).map(([k, v]) => `<option value="${k}"${d.kind === k ? ' selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>语言</label>
            <select class="sel" name="lang">
              <option value="zh"${d.lang === 'zh' ? ' selected' : ''}>中文</option>
              <option value="en"${d.lang === 'en' ? ' selected' : ''}>English</option>
            </select>
          </div>
          <div class="field span2">
            <label>显示标题</label>
            <input class="inp" name="title_zh" value="${esc(d.title_zh || '')}">
          </div>
          <div class="field span2">
            <label>关联产品</label>
            <select class="sel" name="product_id">
              <option value="">通用资料</option>
              ${products.map(p => `<option value="${p.id}"${d.product_id === p.id ? ' selected' : ''}>${esc(p.title_zh)}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>
      <div class="modal__ft">
        <button type="button" class="btn btn--ghost" id="deCancel">取消</button>
        <button class="btn" type="submit">保存</button>
      </div>
    </form>`;
  $('#modalRoot').appendChild(box);
  const close = () => box.remove();
  $('#deCancel', box).addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });
  box.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api(`/documents/${d.id}`, {
        method: 'PATCH',
        body: {
          kind: f.kind.value, lang: f.lang.value, title_zh: f.title_zh.value,
          product_id: f.product_id.value ? Number(f.product_id.value) : null,
        },
      });
      toast('已保存', 'ok'); close(); renderDocuments();
    } catch (err) { toast(err.message, 'err'); }
  });
}

// ───────────────────────────  客户留言  ───────────────────────────
async function renderMessages() {
  const body = $('#viewBody');
  body.innerHTML = '<div class="empty">加载中…</div>';

  try {
    const r = await api('/messages?size=200');
    state.messages = r.data;
    const counts = r.counts || {};
    const labels = r.statuses || {};

    $('#viewActions').innerHTML = `<button class="btn btn--ghost" id="mExport">导出 CSV</button>`;
    $('#mExport').addEventListener('click', () => {
      const st = $('#mStatus') ? $('#mStatus').value : '';
      const q = $('#mQ') ? $('#mQ').value : '';
      const qs = new URLSearchParams();
      if (st) qs.set('status', st);
      if (q) qs.set('q', q);
      window.location.href = '/api/messages/export.csv' + (qs.toString() ? '?' + qs : '');
      toast('正在导出，请稍候…');
    });

    body.innerHTML = `
      <div class="card">
        <div class="card__hd">
          <input class="inp" id="mQ" placeholder="搜索姓名 / 公司 / 邮箱 / 内容" style="width:250px;height:34px">
          <select class="sel" id="mStatus" style="height:34px;width:150px">
            <option value="">全部状态</option>
            ${Object.entries(labels).map(([k, v]) => `<option value="${k}">${esc(v)}${counts[k] ? `（${counts[k]}）` : ''}</option>`).join('')}
          </select>
          <span class="grow"></span>
          <span class="small muted">共 ${state.messages.length} 条</span>
        </div>
        <div id="msgTable"></div>
      </div>`;

    const draw = () => {
      const q = ($('#mQ').value || '').toLowerCase();
      const st = $('#mStatus').value;
      const list = state.messages.filter(m =>
        (!st || m.status === st) &&
        (!q || [m.name, m.company, m.email, m.phone, m.content].some(v => (v || '').toLowerCase().includes(q))));
      const box = $('#msgTable');
      if (!list.length) { box.innerHTML = '<div class="empty"><span class="star"></span>还没有客户留言</div>'; return; }
      const tagCls = { new: 'tag--new', read: 'tag--read', replied: 'tag--replied', archived: 'tag--archived', spam: 'tag--spam' };
      box.innerHTML = `
        <table class="tbl">
          <thead><tr>
            <th style="width:140px">提交时间</th><th style="width:100px">状态</th>
            <th style="width:120px">姓名</th><th>公司 / 联系方式</th>
            <th>需求摘要</th><th style="width:80px">操作</th>
          </tr></thead>
          <tbody>${list.map(m => `
            <tr data-id="${m.id}" style="cursor:pointer">
              <td class="small mono">${esc(m.created_at)}</td>
              <td><span class="tag ${tagCls[m.status] || 'tag--read'}">${esc(m.status_label || m.status)}</span></td>
              <td class="title-cell">${esc(m.name || '—')}</td>
              <td class="small">
                ${m.company ? esc(m.company) + '<br>' : ''}
                ${m.email ? `<span class="mono">${esc(m.email)}</span><br>` : ''}
                ${m.phone ? `<span class="mono">${esc(m.phone)}</span>` : ''}
              </td>
              <td class="small">${esc((m.content || '').slice(0, 60))}${(m.content || '').length > 60 ? '…' : ''}</td>
              <td><button class="btn btn--sm btn--ghost" data-act="open">查看</button></td>
            </tr>`).join('')}</tbody>
        </table>`;
      $$('tr[data-id]', box).forEach(tr => tr.addEventListener('click', () => openMessage(Number(tr.dataset.id))));
    };
    $('#mQ').addEventListener('input', draw);
    $('#mStatus').addEventListener('change', draw);
    draw();
  } catch (err) {
    body.innerHTML = `<div class="empty">加载失败：${esc(err.message)}</div>`;
  }
}

/** 留言详情弹窗：可改状态、写内部备注、一键复制邮箱 */
async function openMessage(id) {
  let m;
  try { m = (await api(`/messages/${id}`)).data; }
  catch (err) { return toast(err.message, 'err'); }

  const box = document.createElement('div');
  box.className = 'modal';
  box.innerHTML = `
    <div class="modal__box" style="max-width:600px">
      <div class="modal__hd">
        <h3>留言详情 #${m.id}</h3>
      </div>
      <div class="modal__bd">
        <div class="grid2">
          <div class="field"><label>姓名</label><div>${esc(m.name || '—')}</div></div>
          <div class="field"><label>公司</label><div>${esc(m.company || '—')}</div></div>
          <div class="field"><label>邮箱</label><div class="mono">${esc(m.email || '—')}</div></div>
          <div class="field"><label>电话</label><div class="mono">${esc(m.phone || '—')}</div></div>
        </div>
        <div class="field" style="margin-top:16px">
          <label>需求描述</label>
          <div class="msg-body" style="padding:12px;background:var(--n50);border:1px solid var(--border);border-radius:6px">${esc(m.content || '')}</div>
        </div>
        <div class="grid2" style="margin-top:16px">
          <div class="field">
            <label>处理状态</label>
            <select class="sel" id="mSt">
              ${Object.entries(KIND_LABEL).length ? '' : ''}
              ${[['new', '未读'], ['read', '已读'], ['replied', '已回复'], ['archived', '已归档'], ['spam', '垃圾']]
                .map(([k, v]) => `<option value="${k}"${m.status === k ? ' selected' : ''}>${v}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>提交信息</label>
            <div class="small muted mono">${esc(m.created_at)}<br>IP ${esc(m.ip || '—')}</div>
          </div>
        </div>
        <div class="field" style="margin-top:16px">
          <label>内部备注（仅后台可见）</label>
          <textarea class="ta" id="mNote" style="min-height:80px">${esc(m.note || '')}</textarea>
        </div>
      </div>
      <div class="modal__ft">
        ${m.email ? `<button class="btn btn--ghost" id="mReply">写邮件回复</button>` : ''}
        <button class="btn btn--ghost" id="mClose">关闭</button>
        <button class="btn" id="mSave">保存</button>
      </div>
    </div>`;
  $('#modalRoot').appendChild(box);

  const close = () => box.remove();
  $('#mClose', box).addEventListener('click', close);
  box.addEventListener('click', (e) => { if (e.target === box) close(); });

  const reply = $('#mReply', box);
  if (reply) reply.addEventListener('click', () => {
    const subject = encodeURIComponent('Re: 您的照明需求咨询 — SEA☆STAR 实益达');
    window.location.href = `mailto:${m.email}?subject=${subject}`;
    $('#mSt', box).value = 'replied';
  });

  $('#mSave', box).addEventListener('click', async () => {
    try {
      await api(`/messages/${m.id}`, {
        method: 'PATCH',
        body: { status: $('#mSt', box).value, note: $('#mNote', box).value },
      });
      toast('已保存', 'ok'); close(); renderMessages(); refreshCounts();
    } catch (err) { toast(err.message, 'err'); }
  });
}

// ───────────────────────────  图片库  ───────────────────────────
async function renderMedia() {
  const body = $('#viewBody');
  body.innerHTML = '<div class="empty">加载中…</div>';
  $('#viewActions').innerHTML = `<button class="btn" id="mdNew">+ 上传图片</button>`;

  try {
    const r = await api('/media?size=300');
    state.media = r.data;
    body.innerHTML = `
      <div class="card">
        <div class="card__hd">
          <input class="inp" id="mdQ" placeholder="搜索文件名" style="width:220px;height:34px">
          <label class="small" style="display:flex;align-items:center;gap:6px;cursor:pointer">
            <input type="checkbox" id="mdUnused"> 只看未被引用的
          </label>
          <span class="grow"></span>
          <span class="small muted">共 ${state.media.length} 张</span>
        </div>
        <div class="card__bd"><div id="mediaGrid"></div></div>
      </div>`;

    const draw = () => {
      const q = ($('#mdQ').value || '').toLowerCase();
      const list = state.media.filter(m => !q || (m.original_name || '').toLowerCase().includes(q));
      const box = $('#mediaGrid');
      if (!list.length) { box.innerHTML = '<div class="empty"><span class="star"></span>图片库是空的</div>'; return; }
      box.innerHTML = `<div class="pickgrid">${list.map(m => `
        <div class="pick" data-id="${m.id}" title="${esc(m.original_name || '')}">
          <img src="${esc(m.url)}" alt="" loading="lazy">
          <div class="small" style="padding:4px 6px;text-align:center;word-break:break-all">
            ${m.width ? `${m.width}×${m.height}` : ''}<br>
            <span class="muted">${humanSize(m.size)}</span>
          </div>
          <button class="pick__x" data-del="${m.id}" title="删除">×</button>
        </div>`).join('')}</div>`;

      $$('.pick', box).forEach(el => {
        const id = Number(el.dataset.id);
        const m = state.media.find(x => x.id === id);
        el.addEventListener('click', (e) => {
          if (e.target.dataset.del) {
            e.stopPropagation();
            if (!confirmDo(`确定删除这张图片？\n\n${m.original_name || ''}\n若仍被产品引用，会提示你先解除引用。`)) return;
            api(`/media/${id}`, { method: 'DELETE' })
              .then(() => { toast('已删除', 'ok'); renderMedia(); refreshCounts(); })
              .catch(err => {
                if (err.status === 409 && confirmDo(err.message + '\n\n仍要强制删除吗？')) {
                  api(`/media/${id}?force=1`, { method: 'DELETE' })
                    .then(() => { toast('已强制删除', 'ok'); renderMedia(); refreshCounts(); })
                    .catch(e2 => toast(e2.message, 'err'));
                } else if (err.status !== 409) toast(err.message, 'err');
              });
            return;
          }
          window.open(m.url, '_blank');
        });
      });
    };
    $('#mdQ').addEventListener('input', draw);
    $('#mdUnused').addEventListener('change', async () => {
      const only = $('#mdUnused').checked;
      try {
        const rr = await api('/media?size=300' + (only ? '&unused=1' : ''));
        state.media = rr.data; draw();
      } catch (err) { toast(err.message, 'err'); }
    });
    draw();

    $('#mdNew').addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', async () => {
        if (!input.files[0]) return;
        try {
          const fd = new FormData();
          fd.append('file', input.files[0]);
          await api('/media', { method: 'POST', body: fd });
          toast('已上传', 'ok'); renderMedia(); refreshCounts();
        } catch (err) { toast(err.message, 'err'); }
      });
      input.click();
    });
  } catch (err) {
    body.innerHTML = `<div class="empty">加载失败：${esc(err.message)}</div>`;
  }
}

// ───────────────────────────  启动  ───────────────────────────
(async function init() {
  // 把后端的上传上限取回来，用于界面文案（避免写死后端改了界面没说）
  try {
    const h = await fetch('/api/health');
    if (h.ok) { window.__MAXIMG = 12; window.__MAXDOC = 80; }
  } catch { /* ignore */ }
  boot();
})();
