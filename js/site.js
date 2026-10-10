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
      downloadSpec: '规格书 (PDF)',
      noProduct: '该分类下暂无产品',
      noDoc: '该分类下暂无资料',
      searchNone: '未找到匹配项 —— 换个型号或关键词试试',
      searchHits: '匹配 {n} 条（共 {total} 条）',
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
      downloadSpec: 'Datasheet (PDF)',
      noProduct: 'No products in this category yet',
      noDoc: 'No documents in this category yet',
      searchNone: 'No matches — try another model or keyword',
      searchHits: 'Showing {n} of {total}',
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
          // 有规格书时直接给下载入口（图下方即可点击），否则只保留资料中心的入口。
          // 下载走 /api/public/download/<id>：由后端转发才能计数并还原原始文件名。
          (p.spec_doc_id
            ? '<a class="link-arrow" href="/api/public/download/' + p.spec_doc_id + '">' + t('downloadSpec') +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 4v12M6 12l6 6 6-6M4 20h16"/></svg>' +
              '</a>'
            : '') +
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
        if (window.__SeaStarSearchRefresh) window.__SeaStarSearchRefresh();
      })
      .catch(function (err) {
        console.warn('[site] 产品加载失败，保留页面静态内容：', err.message);
      });
  }

  function paintProducts(el, list, q) {
    if (!list.length) {
      el.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:52px 0;color:var(--text-tertiary)">' +
        '<span class="brand-star" style="width:26px;height:26px;display:block;margin:0 auto 12px;opacity:.4"></span>' +
        esc(q ? t('searchNone') : t('noProduct')) + '</div>';
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

  /* ───────────  客户指定型号清单（通用照明）  ───────────
     客户 2026-10-10 指定，用于首页「精选产品」与通用照明页 hero 视觉轮播。
     ⚠️ index.html / cn/index.html 的 data-featured 里也写着同一份清单 —— 那两页由页面模板
     系统管理，改它会触发模板漂移，所以这里保留一份默认值兜底。
     **改型号清单必须两处同步。** */
  var FEATURED_CODES = ('CDX2,CDX3,CDX5,CDX8,CDX11,RDX3,RDX5,FMX6,FMX9,FMX11,FMX15,'
    + 'WPX2,BPX3,BPX9,GBX2,VNTX2,WRPX3,CLDX3').split(',');

  /* 解析 "k:v;k:v" 形式的 data-* 配置；codes 缺省时用 FEATURED_CODES */
  function parseCfg(attr, defaults) {
    defaults = defaults || {};
    var cfg = {
      limit: defaults.limit || 3,
      interval: defaults.interval || 3000,
      codes: FEATURED_CODES.slice()
    };
    (attr || '').split(';').forEach(function (kv) {
      var i = kv.indexOf(':');
      if (i < 0) return;
      var k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
      if (k === 'limit') cfg.limit = parseInt(v, 10) || cfg.limit;
      else if (k === 'interval') cfg.interval = parseInt(v, 10) || cfg.interval;
      else if (k === 'codes' && v) {
        cfg.codes = v.toUpperCase().split(',').map(function (s) { return s.trim(); })
          .filter(Boolean);
      }
    });
    return cfg;
  }

  /* 型号前缀匹配：防「CDX1 命中 CDX11」—— 要求前缀后一位不是 A-Z0-9 */
  function startsWithCode(s, c) {
    if (s.indexOf(c) !== 0) return false;
    var nx = s.charAt(c.length);
    return !nx || !/[A-Z0-9]/.test(nx);
  }

  /* 按型号清单筛选并排序（展示顺序 = 清单给定顺序） */
  function pickByCodes(all, codes) {
    return all
      .map(function (p) {
        var zh = String(((p.title || {}).zh) || '').toUpperCase();
        var en = String(((p.title || {}).en) || '').toUpperCase();
        var hit = null;
        for (var i = 0; i < codes.length && !hit; i++) {
          if (startsWithCode(zh, codes[i]) || startsWithCode(en, codes[i])) hit = codes[i];
        }
        return { p: p, c: hit };
      })
      .filter(function (x) { return x.c; })
      .sort(function (a, b) { return codes.indexOf(a.c) - codes.indexOf(b.c); })
      .map(function (x) { return x.p; });
  }

  /* ───────────  精选产品轮播（首页专用）  ───────────
     HTML: <div class="grid grid-3" data-featured="limit:3;interval:3000">（codes 可缺省）
     · 只取 category=led-lighting（通用照明）；按**型号前缀**筛选，展示顺序 = 清单顺序
     · 每 interval 把窗口整体推进 limit 个并循环
     · 无 JS / 取数失败：**不清空**容器，页面静态兜底继续可用（与 renderProducts 同一纪律）
     · prefers-reduced-motion：不轮换，只显示前 limit 个
     · 鼠标悬浮 / 键盘聚焦 / 标签页隐藏 / **滚出视口**：一律暂停 */
  function mountFeatured(el) {
    var cfg = parseCfg(el.getAttribute('data-featured'), { limit: 3, interval: 3000 });
    if (!cfg.codes.length) return Promise.resolve();

    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return get('/products?size=500&category=led-lighting')
      .then(function (res) {
        var picked = pickByCodes(res.data || [], cfg.codes);

        if (!picked.length) return;   // 一个都没匹配上：保留静态兜底，别清空

        var from = 0, timer = null, paused = false;
        // ⚠️ visible 默认 true：**默认就轮换**，IntersectionObserver 只用于"滚出视口时暂停"。
        //    不要把"开始轮换"依赖在 IO 上 —— IO 在无头渲染等环境下可能不触发，
        //    那样就会变成"功能看着写好了却永远不转"。
        var visible = true;

        function paint() {
          var n = Math.min(cfg.limit, picked.length), win = [];
          for (var i = 0; i < n; i++) win.push(picked[(from + i) % picked.length]);
          el.innerHTML = win.map(productCardHtml).join('');
          if (window.SeaStarReveal) window.SeaStarReveal(el);
        }
        function step() { from = (from + cfg.limit) % picked.length; paint(); }
        function start() {
          if (timer || paused || !visible || reduce || picked.length <= cfg.limit) return;
          timer = setInterval(step, cfg.interval);
        }
        function stop() { if (timer) { clearInterval(timer); timer = null; } }

        paint();

        el.addEventListener('mouseenter', function () { paused = true; stop(); });
        el.addEventListener('mouseleave', function () { paused = false; start(); });
        el.addEventListener('focusin', function () { paused = true; stop(); });
        el.addEventListener('focusout', function () { paused = false; start(); });
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) { stop(); } else { start(); }
        });

        // 离屏暂停只是优化，不承担"启动"职责（见上）
        if (!reduce && 'IntersectionObserver' in window) {
          new IntersectionObserver(function (es) {
            es.forEach(function (e) { visible = e.isIntersecting; if (visible) { start(); } else { stop(); } });
          }, { threshold: 0.15 }).observe(el);
        }

        start();
      })
      .catch(function (err) {
        console.warn('[site] 精选产品加载失败，保留页面静态内容：', err.message);
      });
  }

  /* ───────────  通用照明页 hero 视觉轮播（单图交叉淡入）  ───────────
     HTML: <div data-hero-rotate="interval:3000"> …静态兜底（原示意图）… </div>
     · 与首页「精选产品」用**同一份型号清单**（FEATURED_CODES）
     · 只显示**一张图**：两张 <img> 交替淡入 —— 不把 20 张型号图一次性压进首屏
     · 无 JS / 取数失败 / 无匹配：**不动容器里的静态兜底内容**
     · reduced-motion / 悬浮 / 聚焦 / 标签页隐藏 / 离屏：一律暂停 */
  function mountHeroRotate(el) {
    var cfg = parseCfg(el.getAttribute('data-hero-rotate'), { interval: 3000 });
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    return get('/products?size=500&category=led-lighting')
      .then(function (res) {
        var picked = pickByCodes(res.data || [], cfg.codes)
          .filter(function (p) { return p.cover && p.cover.url; });
        if (!picked.length) return;

        var box = document.createElement('div');
        box.className = 'hero-rotate';
        var imgs = [document.createElement('img'), document.createElement('img')];
        imgs.forEach(function (im) { im.alt = ''; im.decoding = 'async'; });
        box.appendChild(imgs[0]);
        box.appendChild(imgs[1]);

        var cap = document.createElement('div');
        cap.className = 'hero-rotate__cap';

        el.innerHTML = '';               // 到这里才替换静态兜底
        el.appendChild(box);
        el.appendChild(cap);

        var idx = 0, cur = 0, timer = null, paused = false, visible = true;

        function label(p) { return pick(p.title) || p.slug; }
        imgs[0].classList.add('is-active');
        imgs[0].src = picked[0].cover.url;
        cap.textContent = label(picked[0]);

        function step() {
          idx = (idx + 1) % picked.length;
          var p = picked[idx];
          var active = imgs[cur], incoming = imgs[1 - cur];
          incoming.onload = function () {           // 加载完才切 —— 不会闪出空白
            incoming.classList.add('is-active');
            active.classList.remove('is-active');
            cur = 1 - cur;
            cap.textContent = label(p);
          };
          incoming.src = p.cover.url;
        }
        function start() {
          if (timer || paused || !visible || reduce || picked.length < 2) return;
          timer = setInterval(step, cfg.interval);
        }
        function stop() { if (timer) { clearInterval(timer); timer = null; } }

        el.addEventListener('mouseenter', function () { paused = true; stop(); });
        el.addEventListener('mouseleave', function () { paused = false; start(); });
        el.addEventListener('focusin', function () { paused = true; stop(); });
        el.addEventListener('focusout', function () { paused = false; start(); });
        document.addEventListener('visibilitychange', function () {
          if (document.hidden) { stop(); } else { start(); }
        });
        if (!reduce && 'IntersectionObserver' in window) {
          new IntersectionObserver(function (es) {
            es.forEach(function (e) { visible = e.isIntersecting; if (visible) { start(); } else { stop(); } });
          }, { threshold: 0.15 }).observe(el);
        }
        start();
      })
      .catch(function (err) {
        console.warn('[site] hero 视觉轮播加载失败，保留页面静态示意图：', err.message);
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
      applyGridFilter(pills, grid);
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
    var q = el.__q || '';                              // 检索词挂在容器上，pills 与检索共用一套状态
    var filtered = list.filter(function (d) {
      if (kind && d.kind !== kind) return false;
      return !q || matchTokens(docHay(d), q);
    });
    if (!filtered.length) {
      el.innerHTML = '<div style="text-align:center;padding:52px 0;color:var(--text-tertiary)">' +
        '<span class="brand-star" style="width:26px;height:26px;display:block;margin:0 auto 12px;opacity:.4"></span>' +
        esc(q ? t('searchNone') : t('noDoc')) + '</div>';
      return 0;                                        // ⚠️ 必须返回条数：调用方用它判断"是否命中"
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
    return filtered.length;
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

  /* ───────────  型号 / 描述检索（通用照明 · 资料中心）  ───────────
     HTML：<div data-search-box>
             <input type="search" data-search="products|docs"
                    data-search-target="#productGrid" data-search-pills="[data-products-filter]">
           </div>
     · **纯客户端、零请求**：在已取回的数据上过滤，不打后端
     · 与既有筛选（场景 / 资料类型 pills）**取交集**：任一变化都重算
     · 匹配字段：型号(slug) / 标题 / 描述 / 系列 / 规格 / 标签 / 归类（资料另含文件名与所属产品）
     · 多词查询按 **AND** —— 每个词都要命中，且可分别落在不同字段
     · 归一化：忽略大小写与空格、连字符、斜杠，使 "CDX-3" / "cdx 3" / "CDX3" 等价
     · Esc 清空；自绘清除按钮；结果数 aria-live 播报
     · **无 JS 时整块不显示**（CSS 默认 display:none，靠 .is-ready 露出）——
       不做"露出却不可用"的假控件 */
  function normKey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s\-_/·、，,.]+/g, ''); }
  function matchTokens(hay, q) {
    var ts = String(q || '').toLowerCase().split(/[\s\-_/·、，,.]+/).filter(Boolean);
    if (!ts.length) return true;
    for (var i = 0; i < ts.length; i++) { if (hay.indexOf(normKey(ts[i])) < 0) return false; }
    return true;
  }
  function productHay(p) {
    var parts = [p.slug, p.series, p.category];
    if (p.title) parts.push(p.title.zh, p.title.en);
    if (p.summary) parts.push(p.summary.zh, p.summary.en);
    (p.specs || []).forEach(function (s) { parts.push(s.k, s.v); });
    (p.badges || []).forEach(function (b) { parts.push(b); });
    (p.scene || []).forEach(function (s) { parts.push(s); });
    return normKey(parts.join(' '));
  }
  function docHay(d) {
    var parts = [d.title, d.filename, d.kind, kindLabel(d)];
    if (d.product) parts.push(d.product.title, d.product.slug);
    return normKey(parts.join(' '));
  }
  /** 网格筛选：场景 pills × 检索词 取交集。pills 与检索都走这里，避免两套逻辑打架 */
  function applyGridFilter(pills, grid) {
    var all = grid.__products || [];
    if (!all.length) return 0;                        // 数据未到：**不动 DOM**，保留静态兜底
    var btn = pills ? pills.querySelector('[data-filter].is-active') : null;
    var scene = btn ? (btn.getAttribute('data-filter') || '') : '';
    var q = grid.__q || '';
    var out = all.filter(function (p) {
      if (scene && (p.scene || []).indexOf(scene) < 0) return false;
      return !q || matchTokens(productHay(p), q);
    });
    paintProducts(grid, out, q);
    return out.length;
  }
  function currentKind(pills) {
    var b = pills ? pills.querySelector('[data-kind].is-active') : null;
    return b ? (b.getAttribute('data-kind') || '') : '';
  }
  function initSearches() {
    document.querySelectorAll('input[data-search]').forEach(function (input) {
      var box = input.closest ? input.closest('[data-search-box]') : null;
      if (box) box.classList.add('is-ready');         // 露出（无 JS 时保持隐藏）
      var kind = input.getAttribute('data-search');
      var target = document.querySelector(input.getAttribute('data-search-target') || '');
      if (!target) return;
      var pills = document.querySelector(input.getAttribute('data-search-pills') || '');
      var clearBtn = box ? box.querySelector('[data-search-clear]') : null;
      var countEl = box ? box.querySelector('[data-search-count]') : null;
      var run = function () {
        var q = input.value.trim();
        var n = 0;
        if (kind === 'products') { target.__q = q; n = applyGridFilter(pills, target); }
        else { target.__q = q; n = paintDocs(target, window.__SeaStarDocs || [], currentKind(pills)) || 0; }
        if (clearBtn) clearBtn.classList.toggle('is-shown', !!q);
        if (countEl) {
          var total = (kind === 'products' ? (target.__products || []) : (window.__SeaStarDocs || [])).length;
          countEl.textContent = !q ? '' : (n ? t('searchHits').replace('{n}', n).replace('{total}', total) : t('searchNone'));
        }
      };
      input.__run = run;
      var deb = null;
      input.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(run, 160); });
      input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; run(); } });
      if (clearBtn) clearBtn.addEventListener('click', function () { input.value = ''; run(); input.focus(); });
      run();                                          // 初始化（数据已到时计数立即正确）
    });
  }
  /* 数据到达后刷新检索计数（由 renderProducts / renderDocuments 完成后调用） */
  window.__SeaStarSearchRefresh = function () {
    document.querySelectorAll('input[data-search]').forEach(function (i) { if (i.__run) i.__run(); });
  };

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
    // 精选产品轮播（首页）：data-featured="limit:3;interval:3000"
    document.querySelectorAll('[data-featured]').forEach(function (el) {
      mountFeatured(el);
    });
    // 通用照明页 hero 视觉轮播：data-hero-rotate="interval:3000"
    document.querySelectorAll('[data-hero-rotate]').forEach(function (el) {
      mountHeroRotate(el);
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
      renderDocuments(docBox).then(function () {
        mountDocFilter('[data-doc-filter]', docBox);
        if (window.__SeaStarSearchRefresh) window.__SeaStarSearchRefresh();
      });
    }
    // 产品详情：data-product-detail="slug"
    var detail = document.querySelector('[data-product-detail]');
    if (detail) renderProductDetail(detail.getAttribute('data-product-detail'), detail);
    // 复制按钮：data-copy-text="要复制的文字"
    if (document.querySelector('[data-copy-text]')) {
      mountCopyButtons('[data-copy-text]');
    }
    // 型号 / 描述检索：input[data-search]
    if (document.querySelector('input[data-search]')) initSearches();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoMount);
  } else {
    autoMount();
  }
})();
