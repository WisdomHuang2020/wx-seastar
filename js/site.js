/* ============================================================================
   SEA☆STAR 前台 · 内容对接层
   ---------------------------------------------------------------------------
   职责：把页面上"由后台维护的内容"从写死的 HTML 改为向 /api/public/* 取数。

   设计约束：
     · 纯原生 JS，无构建、无依赖 —— 与整站保持一致
     · **渐进增强**：取数失败时页面仍能正常浏览（HTML 里保留了静态兜底内容）
     · 不阻塞首屏：脚本以 defer 加载，取数失败也不影响其它区块
   ============================================================================ */
(function () {
  'use strict';

  var API = '/api/public';

  /* ───────────  工具  ─────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function get(path) {
    return fetch(API + path, { headers: { 'Accept': 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (d) {
        if (!d.ok) throw new Error(d.error || '接口返回失败');
        return d;
      });
  }

  /* 语言：由页面通过 window.__SEASTAR_LANG__ 指定（英文站为 'en'），默认中文。
     中英字段任一缺失时 pick() 会自动回退到有值的一侧，不会出现空白。 */
  var LANG = (typeof window !== 'undefined' && window.__SEASTAR_LANG__ === 'en') ? 'en' : 'zh';
  function pick(pair) {
    if (!pair) return '';
    return (LANG === 'en' && pair.en) ? pair.en : (pair.zh || pair.en || '');
  }

  /* ───────────  语言前缀  ───────────
     v0.13.0 起：英文站在根路径（无前缀），中文站在 /cn 子路径。
     本文件被**两套页面共用**，所有站内链接必须经 href() 拼前缀，
     否则中文站上的动态卡片会跳回英文站（跨语言串台）。
     后端接口 /api 与上传文件 /uploads 是语言无关的，**不**加前缀。 */
  var BASE = (LANG === 'en') ? '' : '/cn';
  function href(path) {
    return BASE + (path.charAt(0) === '/' ? path : '/' + path);
  }

  /* UI 文案表：本文件里所有**写死在字符串里**的提示语都必须走 t()，
     否则英文站会出现中文提示（v0.12.0 遗漏项）。 */
  var TEXT = {
    zh: {
      mediaEmpty: '素材待补充',
      noProduct: '该分类下暂无产品',
      noDoc: '该分类下暂无资料',
      techDocs: '技术资料',
      docScopeFiltered: '已筛选',
      docScopeShowing: '正在显示该产品的技术资料',
      docScopeUnit: '份',
      docScopeNone: '暂无',
      docScopeEmpty: '该产品还没有上传技术资料',
      viewAllDocs: '查看全部资料',
      askUs: '向我们索取',
      genericDoc: '通用资料',
      docDownloadHeading: '资料下载',
      docName: '资料名称',
      docType: '类型',
      docProduct: '关联产品',
      docSize: '大小',
      download: '下载',
      submitNeedName: '请填写姓名与需求描述后再提交。',
      submitOk: '已收到您的需求，我们会在 1–3 个工作日内与您联系。',
      submitFail: '提交失败，请稍后重试，或直接致电 0510-68506661。',
      submitNet: '网络异常，未能提交。请稍后重试，或直接致电 0510-68506661。',
      submitting: '提交中…',
      copied: '已复制',
      copyManual: '请手动复制',
      copy: '复制',
    },
    en: {
      mediaEmpty: 'Image pending',
      noProduct: 'No products in this category yet',
      noDoc: 'No documents in this category yet',
      techDocs: 'Technical data',
      docScopeFiltered: 'Filtered',
      docScopeShowing: 'Showing technical data for this product',
      docScopeUnit: 'files',
      docScopeNone: 'None',
      docScopeEmpty: 'No technical data uploaded for this product yet',
      viewAllDocs: 'View all documents',
      askUs: 'Request from us',
      genericDoc: 'General document',
      docDownloadHeading: 'Downloads',
      docName: 'Document',
      docType: 'Type',
      docProduct: 'Product',
      docSize: 'Size',
      download: 'Download',
      submitNeedName: 'Please provide your name and a description of your requirement.',
      submitOk: 'Thank you — we have received your enquiry and will contact you within 1–3 business days.',
      submitFail: 'Submission failed. Please try again later, or call +86 510 6850 6661.',
      submitNet: 'Network error — not submitted. Please try again, or call +86 510 6850 6661.',
      submitting: 'Submitting…',
      copied: 'Copied',
      copyManual: 'Please copy manually',
      copy: 'Copy',
    },
  };
  function t(key) {
    var pack = TEXT[LANG] || TEXT.zh;
    return pack[key] || (TEXT.zh[key] || key);
  }

  /* 资料类型标签：随语言切换（原来只有中文，英文站会漏成中文） */
  var KIND_LABEL = {
    zh: { spec: '规格书', manual: '说明书', ies: 'IES 光度文件', drawing: '图纸', other: '其他资料' },
    en: { spec: 'Datasheet', manual: 'User manual', ies: 'IES photometric file', drawing: 'Drawing', other: 'Other' },
  };
  function kindLabel(d) {
    if (d.kind_label) return d.kind_label;
    var pack = KIND_LABEL[LANG] || KIND_LABEL.zh;
    return pack[d.kind] || (KIND_LABEL.zh[d.kind] || d.kind);
  }

  /* ───────────  产品渲染  ─────────── */
  function specHtml(specs) {
    return (specs || []).slice(0, 4).map(function (s) {
      return '<div class="mini-spec">' +
        '<div class="mini-spec__k">' + esc(s.k) + '</div>' +
        '<div class="mini-spec__v">' + esc(s.v) + (s.u ? '<span class="unit">' + esc(s.u) + '</span>' : '') + '</div>' +
        '</div>';
    }).join('');
  }

  function badgeHtml(badges) {
    if (!badges || !badges.length) return '';
    return '<div class="product-card__badges">' + badges.map(function (b) {
      return '<span class="badge badge--' + esc(b.type || 'brand') + '">' + esc(b.text) + '</span>';
    }).join('') + '</div>';
  }

  /**
   * 产品卡。
   *
   * ⚠️ 数据纪律：原官网的产品页**只有一行产品名**，没有规格参数与简介。
   *    所以这里**规格为空时就不渲染规格区**、简介为空就不渲染简介 ——
   *    宁可留白，也不用编造内容把卡片"填满"。
   */
  /* 卡片上的小标签：优先用系列名；没有系列时退化为应用场景（让访客看清归类依据） */
  var SCENE_TEXT = {
    zh: { home: '家居', commercial: '商业', outdoor: '户外' },
    en: { home: 'Residential', commercial: 'Commercial', outdoor: 'Outdoor' },
  };
  function cardCategory(p) {
    if (p.series) return p.series;
    var pack = SCENE_TEXT[LANG] || SCENE_TEXT.zh;
    return (p.scene || []).map(function (s) { return pack[s] || s; }).join(' · ');
  }

  function productCardHtml(p, idx) {
    var d = (idx % 4) + 1;
    var title = pick(p.title) || p.slug;
    var specs = p.specs || [];
    var badges = p.badges || [];

    return '<article class="product-card reveal reveal-d' + d + '">' +
      '<div class="product-card__media">' +
        badgeHtml(badges) +
        (p.cover
          ? '<img src="' + esc(p.cover.url) + '" alt="' + esc(p.cover.alt || title) + '" loading="lazy" decoding="async">'
          : '<div class="product-card__media--empty">' + t('mediaEmpty') + '</div>') +
      '</div>' +
      '<div class="product-card__body">' +
        (cardCategory(p) ? '<span class="product-card__cat">' + esc(cardCategory(p)) + '</span>' : '') +
        '<h3 class="product-card__title">' + esc(title) + '</h3>' +
        (specs.length
          ? '<div class="product-card__specs">' + specHtml(specs) + '</div>'
          : '') +
        '<div class="product-card__foot">' +
          '<a class="link-arrow" href="' + href('/docs') + '?p=' + encodeURIComponent(p.slug) + '">' + t('techDocs') +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</article>';
  }

  /**
   * 把产品列表渲染进容器。
   * container: CSS 选择器或元素
   * opts.category / opts.prefix: 服务端过滤
   * opts.limit: 最多显示几个
   *
   * 渐进增强：取数失败时**不清空**容器 —— 页面里保留的静态内容继续可用。
   */
  function renderProducts(container, opts) {
    opts = opts || {};
    var el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return Promise.resolve();

    var qs = ['size=' + (opts.limit || 300)];
    if (opts.category) qs.push('category=' + encodeURIComponent(opts.category));
    if (opts.prefix) qs.push('category_prefix=' + encodeURIComponent(opts.prefix));

    return get('/products?' + qs.join('&'))
      .then(function (res) {
        var list = res.data || [];
        el.__products = list;                 // 缓存，供客户端筛选复用
        paintProducts(el, list);
        applySceneFilter();                   // URL ?scene=xxx 自动激活对应筛选
      })
      .catch(function (err) {
        console.warn('[site] 产品加载失败，保留页面静态内容：', err.message);
      });
  }

  function paintProducts(el, list) {
    if (!list.length) {
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:52px 0;color:var(--text-tertiary)">' +
        '<span class="brand-star" style="width:26px;height:26px;display:block;margin:0 auto 12px;opacity:.4"></span>' +
        esc(t('noProduct')) + '</div>';
      return;
    }
    el.innerHTML = list.map(productCardHtml).join('');
    if (window.SeaStarReveal) window.SeaStarReveal(el);
  }

  /**
   * URL 带 ?scene=home|commercial|outdoor 时，自动激活对应筛选按钮并过滤产品。
   * 供导航下拉菜单直接链入某个场景（如 /lighting?scene=home）。
   */
  function applySceneFilter() {
    var qs = new URLSearchParams(window.location.search);
    var scene = qs.get('scene');
    if (!scene) return;
    document.querySelectorAll('[data-products-filter]').forEach(function (pills) {
      var btn = pills.querySelector('[data-filter="' + scene + '"]');
      if (!btn) return;
      var gridSel = pills.getAttribute('data-products-filter');
      var grid = gridSel ? document.querySelector(gridSel) : null;
      if (!grid || !grid.__products) return;
      pills.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      paintProducts(grid, grid.__products.filter(function (p) {
        return (p.scene || []).indexOf(scene) >= 0;
      }));
    });
  }

  /**
   * 客户端筛选：绑在 pills 上，按产品的「应用场景」多选标签过滤已取回的数据（零请求）。
   * pillsSel 里的按钮用 data-filter="home|commercial|outdoor"（空值 = 显示全部）。
   * ⚠️ 筛的是 scene（页内归类），不是 category（业务线 —— 它决定出现在哪个页面）。
   */
  function mountProductFilter(pillsSel, gridSel) {
    // ⚠️ 两个参数都既可能是选择器字符串、也可能是 DOM 元素：
    //    挂载处传的是 `querySelectorAll(...)` 遍历出来的**元素**。
    //    若这里直接对元素调用 document.querySelector()，会因选择器非法而**抛异常**，
    //    导致整个函数中断、筛选静默失效（v0.9.0 实测踩到：点了没反应）。
    var pills = typeof pillsSel === 'string' ? document.querySelector(pillsSel) : pillsSel;
    var grid = typeof gridSel === 'string' ? document.querySelector(gridSel) : gridSel;
    if (!pills || !grid) return;
    pills.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-filter]');
      if (!btn) return;
      pills.querySelectorAll('[data-filter]').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var f = btn.getAttribute('data-filter') || '';
      var all = grid.__products || [];
      paintProducts(grid, f ? all.filter(function (p) {
        return (p.scene || []).indexOf(f) >= 0;
      }) : all);
    });
  }

  /* ───────────  资料中心  ─────────── */
  function humanSize(n) {
    n = Number(n) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1048576) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1048576).toFixed(1) + ' MB';
  }

  function renderDocuments(container, opts) {
    opts = opts || {};
    var el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return Promise.resolve();

    // 支持从产品卡跳转过来：/docs?p=<slug> → 只显示该产品的资料
    var qs = new URLSearchParams(window.location.search);
    var slug = qs.get('p');

    return get('/documents?size=500')
      .then(function (res) {
        var list = res.data || [];
        // product 字段里带的是产品 slug，用它过滤
        var filtered = slug ? list.filter(function (d) {
          return d.product && d.product.slug === slug;
        }) : list;

        window.__SeaStarDocs = filtered;
        window.__SeaStarDocScope = slug || null;
        paintDocs(el, filtered, opts.kind || '');
        showDocScope(filtered.length, slug, list.length);
      })
      .catch(function (err) {
        console.warn('[site] 资料加载失败：', err.message);
      });
  }

  /** 若带 ?p= 参数，在列表上方显示"仅显示 XX 的资料 / 查看全部" */
  function showDocScope(count, slug, totalAll) {
    var host = document.querySelector('[data-doc-scope]');
    if (!host) return;
    if (!slug) { host.innerHTML = ''; return; }
    host.innerHTML = count
      ? '<div class="card-lum" style="padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
          '<span class="badge badge--brand">' + esc(t('docScopeFiltered')) + '</span>' +
          '<span class="small">' + esc(t('docScopeShowing')) + ' (' + count + ' ' + esc(t('docScopeUnit')) + ')</span>' +
          '<a class="link-arrow" style="margin-left:auto" href="' + href('/docs') + '">' + esc(t('viewAllDocs')) +
            ' (' + totalAll + ' ' + esc(t('docScopeUnit')) + ')</a>' +
        '</div>'
      : '<div class="card-lum" style="padding:14px 18px;margin-bottom:18px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
          '<span class="badge badge--neutral">' + esc(t('docScopeNone')) + '</span>' +
          '<span class="small">' + esc(t('docScopeEmpty')) + '</span>' +
          '<a class="link-arrow" style="margin-left:auto" href="' + href('/contact') + '">' + esc(t('askUs')) + '</a>' +
        '</div>';
  }

  function paintDocs(el, list, kind) {
    var filtered = kind ? list.filter(function (d) { return d.kind === kind; }) : list;
    if (!filtered.length) {
      el.innerHTML = '<div style="text-align:center;padding:52px 0;color:var(--text-tertiary)">' +
        '<span class="brand-star" style="width:26px;height:26px;display:block;margin:0 auto 12px;opacity:.4"></span>' +
        esc(t('noDoc')) + '</div>';
      return;
    }
    el.innerHTML = '<div class="table-wrap"><table class="tech-table">' +
      '<thead><tr>' +
        '<th>' + esc(t('docName')) + '</th>' +
        '<th>' + esc(t('docType')) + '</th>' +
        '<th>' + esc(t('docProduct')) + '</th>' +
        '<th>' + esc(t('docSize')) + '</th>' +
        '<th style="text-align:right">' + esc(t('download')) + '</th>' +
      '</tr></thead><tbody>' +
      filtered.map(function (d) {
        return '<tr>' +
          '<td>' + esc(d.title) + (d.filename ? '<div class="small" style="color:var(--text-tertiary)">' + esc(d.filename) + '</div>' : '') + '</td>' +
          '<td><span class="badge badge--brand">' + esc(kindLabel(d)) + '</span></td>' +
          '<td>' + (d.product ? esc(d.product.title) : '<span style="color:var(--text-tertiary)">' + esc(t('genericDoc')) + '</span>') + '</td>' +
          '<td class="mono">' + esc(humanSize(d.size)) + '</td>' +
          '<td style="text-align:right"><a class="link-arrow" href="' + esc(d.url) + '">' + esc(t('download')) +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v12M6 12l6 6 6-6M4 20h16"/></svg>' +
          '</a></td>' +
        '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  /** 资料中心：按类型筛选（pills 复用站点样式） */
  function mountDocFilter(pillsSel, tableSel) {
    var pills = document.querySelector(pillsSel);
    var table = document.querySelector(tableSel);
    if (!pills || !table) return;
    pills.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-kind]');
      if (!btn) return;
      pills.querySelectorAll('[data-kind]').forEach(function (b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      paintDocs(table, window.__SeaStarDocs || [], btn.getAttribute('data-kind'));
    });
  }

  /* ───────────  产品详情（可选：在产品页展开完整信息）  ─────────── */
  function renderProductDetail(slug, container) {
    var el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return Promise.resolve();
    return get('/products/' + encodeURIComponent(slug))
      .then(function (res) {
        var p = res.data;
        el.innerHTML =
          '<div class="grid grid-2" style="gap:var(--space-2xl);align-items:start">' +
            '<div>' + (p.cover ? '<img src="' + esc(p.cover.url) + '" alt="' + esc(pick(p.title)) + '" style="width:100%;border-radius:var(--radius-md)">' : '') +
              (p.images && p.images.length > 1 ? '<div class="grid grid-3 mt-lg">' + p.images.slice(1).map(function (im) {
                return '<img src="' + esc(im.url) + '" alt="' + esc(im.alt) + '" loading="lazy" style="width:100%;border-radius:var(--radius-sm);border:1px solid var(--border-subtle)">';
              }).join('') + '</div>' : '') +
            '</div>' +
            '<div>' +
              '<span class="overline">' + esc(p.category || '') + '</span>' +
              '<h1 class="h1 mt-md">' + esc(pick(p.title)) + '</h1>' +
              (pick(p.summary) ? '<p class="body-l mt-lg text-secondary">' + esc(pick(p.summary)) + '</p>' : '') +
              '<div class="table-wrap mt-2xl"><table class="tech-table"><tbody>' +
                (p.specs || []).map(function (s) {
                  return '<tr><th style="width:38%">' + esc(s.k) + '</th><td>' + esc(s.v) + (s.u ? ' ' + esc(s.u) : '') + '</td></tr>';
                }).join('') +
              '</tbody></table></div>' +
              ((p.documents && p.documents.length)
                ? '<h3 class="h4 mt-2xl">' + esc(t('docDownloadHeading')) + '</h3><ul class="brand-list mt-md">' + p.documents.map(function (d) {
                    return '<li><a href="' + esc(d.url) + '">' + esc(d.title) + ' <span class="small">(' + esc(d.kind_label) + ' · ' + esc(humanSize(d.size)) + ')</span></a></li>';
                  }).join('') + '</ul>'
                : '') +
            '</div>' +
          '</div>';
      })
      .catch(function (err) { console.warn('[site] 产品详情加载失败：', err.message); });
  }

  /* ───────────  联系表单：提交到后端存库  ─────────── */
  function mountContactForm(formSel) {
    var form = document.querySelector(formSel);
    if (!form) return;

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var note = form.querySelector('[data-form-note]');
      var btn = form.querySelector('button[type="submit"]');
      var val = function (n) {
        var el = form.elements[n];
        return el ? String(el.value || '').trim() : '';
      };

      var payload = {
        name: val('name'),
        company: val('company'),
        email: val('email'),
        phone: val('phone'),
        content: val('msg') || val('content'),
      };
      if (!payload.name || !payload.content) {
        showNote(note, t('submitNeedName'), 'error');
        return;
      }

      var oldText = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = t('submitting'); }

      fetch('/api/public/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (r) { return r.json().then(function (d) { return { status: r.status, d: d }; }); })
        .then(function (res) {
          if (res.d && res.d.ok) {
            showNote(note, t('submitOk'), 'success');
            form.reset();
          } else {
            showNote(note, (res.d && res.d.error) || t('submitFail'), 'error');
          }
        })
        .catch(function () {
          showNote(note, t('submitNet'), 'error');
        })
        .finally(function () {
          if (btn) { btn.disabled = false; btn.textContent = oldText; }
        });
    });
  }

  function showNote(note, msg, kind) {
    if (!note) { alert(msg); return; }
    note.textContent = msg;
    note.classList.remove('hidden');
    note.style.color = kind === 'error' ? 'var(--color-danger)' : 'var(--color-success)';
  }

  /* ───────────  复制到剪贴板（地址等）  ───────────
     用法：<button data-copy-text="要复制的文字">
             <svg…/><span data-copy-label>复制地址</span>
           </button>
     只替换 <span data-copy-label> 里的文字，保留图标，避免按钮宽度跳动。 */
  function mountCopyButtons(sel) {
    document.querySelectorAll(sel).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy-text') || '';
        var labelEl = btn.querySelector('[data-copy-label]');
        var label = labelEl ? labelEl.textContent : t('copy');
        if (!text) return;

        var show = function (msg) {
          if (!labelEl) return;
          labelEl.textContent = msg;
          setTimeout(function () { labelEl.textContent = label; }, 2000);
        };

        // 现代 API 只在安全上下文（https / localhost）可用；否则回退 execCommand
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(text).then(
            function () { show(t('copied')); },
            function () { fallback(); });
        } else {
          fallback();
        }

        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          var ok = false;
          try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
          document.body.removeChild(ta);
          show(ok ? t('copied') : t('copyManual'));
        }
      });
    });
  }

  /* ───────────  对外暴露  ─────────── */
  window.SeaStar = {
    get: get,
    esc: esc,
    renderProducts: renderProducts,
    renderDocuments: renderDocuments,
    renderProductDetail: renderProductDetail,
    mountDocFilter: mountDocFilter,
    mountProductFilter: mountProductFilter,
    mountContactForm: mountContactForm,
    setLang: function (l) {
      LANG = l === 'en' ? 'en' : 'zh';
      // 前缀必须跟着语言一起变，否则切语言后动态卡片仍指向旧站
      BASE = (LANG === 'en') ? '' : '/cn';
    },
    href: href,
    t: t,
    kindLabel: kindLabel,
    get lang() { return LANG; },
    get base() { return BASE; },
  };

  /* ───────────  自动挂载  ───────────
     页面只要引入本文件即可，无需在 HTML 里写初始化代码 ——
     降低维护者"漏写某段脚本"的概率。行为由元素上的 data-* 属性驱动。 */
  function autoMount() {
    // 联系表单：存库
    if (document.querySelector('[data-contact-form]')) {
      mountContactForm('[data-contact-form]');
    }
    // 产品列表：data-products="category:xxx;limit:6"
    var grids = [];
    document.querySelectorAll('[data-products]').forEach(function (el) {
      var cfg = {};
      (el.getAttribute('data-products') || '').split(';').forEach(function (kv) {
        var i = kv.indexOf(':');
        if (i < 0) return;
        var k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
        if (k === 'limit') cfg.limit = parseInt(v, 10) || undefined;
        else if (k === 'category') cfg.category = v || undefined;
        else if (k === 'prefix') cfg.prefix = v || undefined;
      });
      grids.push(el);
      renderProducts(el, cfg);
    });
    // 与之配对的客户端筛选器：data-products-filter="<grid 选择器>"
    document.querySelectorAll('[data-products-filter]').forEach(function (pills) {
      var sel = pills.getAttribute('data-products-filter');
      var grid = sel ? document.querySelector(sel) : (grids[0] || null);
      if (grid) mountProductFilter(pills, grid);
    });
    // 资料中心：data-documents 指定表格容器
    var docBox = document.querySelector('[data-documents]');
    if (docBox) {
      renderDocuments(docBox).then(function () { mountDocFilter('[data-doc-filter]', docBox); });
    }
    // 产品详情：data-product-detail="slug"
    var detail = document.querySelector('[data-product-detail]');
    if (detail) renderProductDetail(detail.getAttribute('data-product-detail'), detail);
    // 复制按钮：data-copy-text="要复制的文字"
    if (document.querySelector('[data-copy-text]')) {
      mountCopyButtons('[data-copy-text]');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
