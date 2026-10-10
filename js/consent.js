/* ============================================================
   SEA☆STAR · Cookie 同意与偏好中心
   ------------------------------------------------------------
   设计前提（写死在本文件里，改动前请先读）：

   本站前台 18 个页面**不写任何追踪型 Cookie**，页面里也没有
   第三方统计 / 广告脚本。唯一的 Cookie 来自后台：
     · wxs_sid —— 后台登录会话（HttpOnly + SameSite=Lax，
       只在登录 /admin 时下发，前台访客拿不到）
   因此本模块**不能**做成"套模板的假同意弹窗"（假装有一堆
   营销 Cookie 请求授权）。它如实做三件事：

     1. 告知：说明本站实际用了什么、没用什么。
     2. 授权闸门：analytics 开关是**真实生效**的 ——
        带 data-cookie-category="analytics" 的脚本（或经
        runWhenGranted() 注册的函数）只有在用户同意后才会执行。
     3. 留痕：把选择记入 localStorage + 一枚第一方必要 Cookie
        （wxs_cc），横幅不再反复打扰，且服务端可读。

   渐进增强：本文件加载失败 = 什么都没有 = 行为与未做之前完全一致
   （本来就没有非必要 Cookie）。任何时候都不拦住浏览行为，
   不做全屏遮罩强制先点。

   语言：读 window.__SEASTAR_LANG__（'zh' | 'en'），与站点
   其余 i18n 保持同一来源，不另设一套。
   ============================================================ */
(function () {
  'use strict';

  var STORE_KEY = 'wxs_cc_v1';   // localStorage：完整结构化记录
  var COOKIE_NAME = 'wxs_cc';    // 必要 Cookie：只存版本号与档位摘要
  var VERSION = 1;
  var MAX_AGE_DAYS = 180;

  /* 将来若真引入统计/营销工具，把它们的 Cookie 名字（或前缀通配）
     登记到这里。用户撤回同意时，本模块会把它们逐个删掉 ——
     目前登记为空，因为本站不写这类 Cookie，删了也是空操作。 */
  var COOKIE_REGISTRY = {
    analytics: [
      // 例：'_ga', '_ga_*', '_gid', '_clck'
    ],
    marketing: []
  };

  var LANG = (window.__SEASTAR_LANG__ === 'zh') ? 'zh' : 'en';

  var COPY = {
    zh: {
      bannerTitle: '关于本站 Cookie 使用说明',
      bannerBody: '我们尊重您的隐私。本站使用 Cookie 及类似技术来保障网站正常运行、记录您在本处的偏好选择，并为您提供更好的浏览体验。点击「允许所有 Cookie」即表示您同意我们使用全部 Cookie；点击「仅必要 Cookie」则只加载维持网站基本功能所必需的 Cookie。如需自定义，请点击「我的偏好」。',
      acceptAll: '允许所有 Cookie',
      essentialOnly: '仅必要 Cookie',
      customize: '我的偏好',
      cookieNotice: 'Cookie 说明',
      prefsTitle: 'Cookie 偏好设置',
      prefsIntro: '以下按用途列出本站的 Cookie 分类。「必要」类无法关闭；其余类别在您开启前不会写入任何 Cookie。您随时可以回来更改。',
      catEssential: '必要 Cookie',
      catEssentialDesc: '保障网站基本功能所必需：后台登录会话 Cookie（仅在登录本站后台时下发，前台浏览不会产生），以及记录您本次选择的偏好 Cookie。这类 Cookie 不用于识别您的身份，也不用于追踪。',
      catAnalytics: '统计与分析 Cookie',
      catAnalyticsDesc: '本站当前未部署任何统计、追踪或第三方分析工具，因此现在开启此项不会写入任何 Cookie。它的作用是**预先授权闸门**：将来若新增访问量统计脚本，在该项开启前不会被执行。',
      catMarketing: '营销与广告 Cookie',
      catMarketingDesc: '本站不使用此类 Cookie，也没有接入任何广告联盟、再营销或社交平台像素。此项永久关闭，仅为说明用途列出。',
      alwaysOn: '始终启用',
      off: '关闭',
      on: '已开启',
      notUsed: '未使用',
      save: '保存偏好',
      rejectAll: '全部拒绝',
      close: '关闭',
      savedAt: '选择记录于',
      footerLink: 'Cookie 设置',
      reopenHint: '可随时在页脚重新打开此面板。'
    },
    en: {
      bannerTitle: 'Your Choices Regarding Cookies on this Site',
      bannerBody: 'We respect your privacy. This site uses cookies and similar technologies to keep the website working, remember the choice you make here, and provide a better browsing experience. By clicking “Allow all cookies”, you consent to our use of all cookies. By clicking “Only necessary”, the website will load only the cookies required for proper functioning. To customize, click “My preferences”.',
      acceptAll: 'Allow all cookies',
      essentialOnly: 'Only necessary',
      customize: 'My Preferences',
      cookieNotice: 'Cookie notice',
      prefsTitle: 'Cookie preferences',
      prefsIntro: 'Cookies are listed below by purpose. Essential cookies cannot be switched off; nothing else is written to your device until you allow it. You can come back and change this whenever you like.',
      catEssential: 'Essential cookies',
      catEssentialDesc: 'Required for the site to function: the session cookie used when signing in to our back office (issued only on the admin sign-in; browsing the public pages does not create one), plus the cookie that remembers this preference so the notice stops repeating. These do not identify you and are not used for tracking.',
      catAnalytics: 'Analytics cookies',
      catAnalyticsDesc: 'No analytics, tracking or third-party measurement tool is currently deployed on this site, so enabling this writes nothing today. It works as an advance-consent gate: any measurement script added later stays blocked until you turn this on.',
      catMarketing: 'Marketing and advertising cookies',
      catMarketingDesc: 'Not used. This site carries no advertising network, remarketing or social-platform pixels. Listed for completeness; it stays off permanently.',
      alwaysOn: 'Always on',
      off: 'Off',
      on: 'On',
      notUsed: 'Not used',
      save: 'Save preferences',
      rejectAll: 'Reject all',
      close: 'Close',
      savedAt: 'Choice recorded on',
      footerLink: 'Cookie settings',
      reopenHint: 'You can reopen this panel from the footer at any time.'
    }
  };

  function txt(k) { return (COPY[LANG] || COPY.en)[k] || k; }

  /* ───────────  存取  ─────────── */

  function readStore() {
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || o.v !== VERSION) return null;
      return {
        v: VERSION,
        essential: true,                 // 必要项恒为 true，不接受外部写入
        analytics: o.analytics === true,
        marketing: false,                // 本站不使用，恒 false
        ts: o.ts || null
      };
    } catch (e) { return null; }         // 隐私模式下 localStorage 会抛异常
  }

  function writeStore(state) {
    state.ts = new Date().toISOString();
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* 忽略：仍会用 Cookie 兜底 */ }
    writeCookie(state);
    return state;
  }

  /* 一枚第一方 Cookie，用于服务端读取偏好（亦为"必要 Cookie"的真实一例） */
  function writeCookie(state) {
    var value = VERSION + '.' + (state.analytics ? 'a' : 'e');
    var attrs = [
      COOKIE_NAME + '=' + value,
      'Path=/',
      'Max-Age=' + (MAX_AGE_DAYS * 24 * 60 * 60),
      'SameSite=Lax'
    ];
    if (window.location.protocol === 'https:') attrs.push('Secure');
    document.cookie = attrs.join('; ');
  }

  /* 撤回同意时把该类别登记过的 Cookie 删干净（当前 registry 为空） */
  function purge(cat) {
    var names = COOKIE_REGISTRY[cat] || [];
    var hostParts = window.location.hostname.split('.');
    for (var i = 0; i < names.length; i++) {
      var n = names[i];
      if (n.indexOf('*') >= 0) { purgeByPrefix(n.replace(/\*$/, '')); continue; }
      // 主域与父域各删一次，避免残留在 .example.com 上
      document.cookie = n + '=; Path=/; Max-Age=0; SameSite=Lax';
      if (hostParts.length > 2) {
        document.cookie = n + '=; Path=/; Domain=.' + hostParts.slice(-2).join('.') + '; Max-Age=0; SameSite=Lax';
      }
    }
  }

  function purgeByPrefix(prefix) {
    var all = document.cookie ? document.cookie.split(';') : [];
    for (var i = 0; i < all.length; i++) {
      var name = (all[i].split('=')[0] || '').trim();
      if (name && name.indexOf(prefix) === 0) {
        document.cookie = name + '=; Path=/; Max-Age=0; SameSite=Lax';
      }
    }
  }

  /* ───────────  UI 构造  ─────────── */

  /* desc 里出现的 **粗体** 标记，渲染成 <strong>，避免整段 HTML 注入 */
  function rich(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  }

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function toggleRow(opts) {
    var row = el('div', 'cc-row' + (opts.disabled ? ' cc-row--locked' : ''));

    var head = el('div', 'cc-row__head');
    var h = el('h5', 'cc-row__title', opts.title);
    head.appendChild(h);

    var badge = el('span', 'cc-badge' + (opts.badgeKind ? ' cc-badge--' + opts.badgeKind : ''), opts.badgeText);
    head.appendChild(badge);

    var sw = el('label', 'cc-switch');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'cc-switch__input';
    input.checked = !!opts.checked;
    input.disabled = !!opts.disabled;
    input.setAttribute('data-cc-cat', opts.cat);
    if (opts.disabled) input.setAttribute('aria-disabled', 'true');
    sw.appendChild(input);
    sw.appendChild(el('span', 'cc-switch__track', '<span class="cc-switch__dot"></span>'));
    sw.appendChild(el('span', 'visually-hidden', opts.title));
    head.appendChild(sw);

    row.appendChild(head);
    row.appendChild(el('p', 'cc-row__desc', rich(opts.desc)));
    return row;
  }

  function buildBanner() {
    var b = el('div', 'cc-banner');
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', txt('bannerTitle'));
    b.hidden = true;

    var inner = el('div', 'container cc-banner__inner');

    var copy = el('div', 'cc-banner__copy');
    copy.appendChild(el('h4', 'cc-banner__title', txt('bannerTitle')));
    copy.appendChild(el('p', 'cc-banner__body', rich(txt('bannerBody'))));

    // 参考图底部链接行：Cookie notice。Tracker Details Page 本站没有，不放。
    var links = el('div', 'cc-banner__links');
    var notice = el('button', 'cc-linkbtn', txt('cookieNotice'));
    notice.type = 'button';
    notice.setAttribute('data-cc', 'prefs');
    links.appendChild(notice);
    copy.appendChild(links);

    inner.appendChild(copy);

    var actions = el('div', 'cc-banner__actions');
    var bPrefs = el('button', 'cc-linkbtn', txt('customize'));
    bPrefs.type = 'button';
    bPrefs.setAttribute('data-cc', 'prefs');

    var bEssential = el('button', 'btn btn--dark cc-btn', txt('essentialOnly'));
    bEssential.type = 'button';
    bEssential.setAttribute('data-cc', 'essential');

    var bAll = el('button', 'btn btn--dark cc-btn', txt('acceptAll'));
    bAll.type = 'button';
    bAll.setAttribute('data-cc', 'all');

    actions.appendChild(bPrefs);
    actions.appendChild(bEssential);
    actions.appendChild(bAll);
    inner.appendChild(actions);

    b.appendChild(inner);
    document.body.appendChild(b);
    return b;
  }

  function buildDialog() {
    var wrap = el('div', 'cc-overlay');
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');

    var panel = el('div', 'cc-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-label', txt('prefsTitle'));

    var head = el('div', 'cc-panel__head');
    head.appendChild(el('h3', 'cc-panel__title', txt('prefsTitle')));
    var x = el('button', 'cc-close', '&times;');
    x.type = 'button';
    x.setAttribute('aria-label', txt('close'));
    x.setAttribute('data-cc', 'close');
    head.appendChild(x);
    panel.appendChild(head);

    panel.appendChild(el('p', 'cc-panel__intro', rich(txt('prefsIntro'))));

    var current = api.get();

    panel.appendChild(toggleRow({
      cat: 'essential', title: txt('catEssential'), desc: txt('catEssentialDesc'),
      checked: true, disabled: true, badgeText: txt('alwaysOn'), badgeKind: 'locked'
    }));
    panel.appendChild(toggleRow({
      cat: 'analytics', title: txt('catAnalytics'), desc: txt('catAnalyticsDesc'),
      checked: !!current.analytics, disabled: false,
      badgeText: current.analytics ? txt('on') : txt('off')
    }));
    panel.appendChild(toggleRow({
      cat: 'marketing', title: txt('catMarketing'), desc: txt('catMarketingDesc'),
      checked: false, disabled: true, badgeText: txt('notUsed'), badgeKind: 'locked'
    }));

    var stamp = el('p', 'cc-panel__stamp');
    if (current.ts) {
      var d = new Date(current.ts);
      stamp.textContent = txt('savedAt') + ' ' + d.toLocaleDateString(LANG === 'zh' ? 'zh-CN' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    }
    panel.appendChild(stamp);

    var foot = el('div', 'cc-panel__foot');
    var bReject = el('button', 'btn btn--secondary cc-btn', txt('rejectAll'));
    bReject.type = 'button'; bReject.setAttribute('data-cc', 'essential');
    var bAccept = el('button', 'btn btn--secondary cc-btn', txt('acceptAll'));
    bAccept.type = 'button'; bAccept.setAttribute('data-cc', 'all');
    var bSave = el('button', 'btn btn--primary cc-btn', txt('save'));
    bSave.type = 'button'; bSave.setAttribute('data-cc', 'save');
    foot.appendChild(bReject);
    foot.appendChild(bAccept);
    foot.appendChild(bSave);
    panel.appendChild(foot);

    panel.appendChild(el('p', 'cc-panel__hint', txt('reopenHint')));

    wrap.appendChild(panel);
    document.body.appendChild(wrap);

    // 点遮罩空白处关闭（绑在自己身上，避免依赖外部变量是否已赋值）
    wrap.addEventListener('click', function (e) { if (e.target === wrap) closePanel(); });
    return wrap;
  }

  /* ───────────  行为  ─────────── */

  var banner = null, overlay = null, lastFocus = null;

  /* ★ 为什么用 setTimeout 而不是 requestAnimationFrame：
     rAF 由渲染管线驱动，在后台标签页、被节流的场景（以及无头验证环境）里
     可能根本不执行 —— 于是 is-in 加不上、opacity 永远停在 0，
     面板实际上存在却看不见。显隐的可靠开关只能是定时器，不能是渲染帧队。 */
  function showBanner() {
    if (!banner) banner = buildBanner();
    banner.hidden = false;
    window.setTimeout(function () { banner.classList.add('is-in'); }, 16);
  }

  function hideBanner() {
    if (!banner) return;
    banner.classList.remove('is-in');
    var node = banner;
    window.setTimeout(function () { node.hidden = true; }, 240);
  }

  function openPanel() {
    if (!overlay) overlay = buildDialog();
    lastFocus = document.activeElement;
    refreshPanel();
    overlay.hidden = false;
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('cc-locked');
    window.setTimeout(function () { overlay.classList.add('is-in'); }, 16);   // 理由同 showBanner：不用 rAF
    var first = overlay.querySelector('.cc-panel__foot button');
    if (first) first.focus();
  }

  function closePanel() {
    if (!overlay) return;
    overlay.classList.remove('is-in');
    overlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('cc-locked');
    var node = overlay;
    window.setTimeout(function () { node.hidden = true; }, 200);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { /* noop */ } }
  }

  /* 面板每次打开都按最新状态重画（外部调用 setAll 后也一致） */
  function refreshPanel() {
    if (!overlay) return;
    var cur = api.get();
    overlay.querySelectorAll('.cc-switch__input').forEach(function (input) {
      var cat = input.getAttribute('data-cc-cat');
      input.checked = (cat === 'essential') ? true : (cat === 'marketing') ? false : !!cur[cat];
      var row = input.closest('.cc-row');
      var badge = row ? row.querySelector('.cc-badge') : null;
      if (badge && cat === 'analytics') badge.textContent = input.checked ? txt('on') : txt('off');
    });
    var stamp = overlay.querySelector('.cc-panel__stamp');
    if (stamp) {
      if (cur.ts) {
        var d = new Date(cur.ts);
        stamp.textContent = txt('savedAt') + ' ' + d.toLocaleDateString(LANG === 'zh' ? 'zh-CN' : 'en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
      } else { stamp.textContent = ''; }
    }
  }

  function applyChoice(analytics, alsoClose) {
    var prev = api.get();
    if (prev.analytics && !analytics) purge('analytics');   // 撤回授权 → 清掉已写的分析 Cookie
    writeStore({ v: VERSION, essential: true, analytics: !!analytics, marketing: false });
    hideBanner();
    if (alsoClose) closePanel();
    fire();                       // 放行排队中的分析任务
    hydrateDeferredScripts();     // 放行页面里"待授权"的 script
  }

  /* ─── 授权闸门：真实的执行控制 ─── */

  var queue = { analytics: [], marketing: [] };

  function fire() {
    var cur = api.get();
    Object.keys(queue).forEach(function (cat) {
      if (!cur[cat]) return;
      while (queue[cat].length) {
        var fn = queue[cat].shift();
        try { fn(); } catch (e) { /* 第三方脚本异常不得拖垮站点其余部分 */ }
      }
    });
  }

  /* 扫描页面上"待授权"的 script 标签并执行 —— <script type="text/plain"
     不会被浏览器自动执行，正好当作"暂停区"，同意后我们再把它放出来 */
  function hydrateDeferredScripts() {
    if (!api.get().analytics) return;
    document.querySelectorAll('script[data-cookie-category="analytics"]').forEach(function (s) {
      if (s.getAttribute('data-cc-done') === '1') return;
      var n = document.createElement('script');
      if (s.src) { n.src = s.src; } else { n.textContent = s.textContent; }
      Array.prototype.forEach.call(s.attributes, function (a) {
        if (a.name === 'type' || a.name === 'data-cookie-category') return;
        n.setAttribute(a.name, a.value);
      });
      s.setAttribute('data-cc-done', '1');
      (document.head || document.documentElement).appendChild(n);
    });
  }

  /* ───────────  公开接口  ─────────── */

  var api = {
    get: function () {
      return readStore() || { v: VERSION, essential: true, analytics: false, marketing: false, ts: null };
    },
    isGranted: function (cat) { return this.get()[cat] === true; },
    /* 给将来的统计代码用：SeaStarConsent.runWhenGranted('analytics', loadGA) */
    runWhenGranted: function (cat, fn) {
      if (this.isGranted(cat)) { try { fn(); } catch (e) { /* noop */ } return; }
      if (queue[cat]) queue[cat].push(fn);
    },
    open: openPanel,
    close: closePanel,
    setAll: function (on) { applyChoice(!!on, true); },
    reset: function () {
      try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* noop */ }
      document.cookie = COOKIE_NAME + '=; Path=/; Max-Age=0; SameSite=Lax';
      queue = { analytics: [], marketing: [] };
      showBanner();
    },
    get lang() { return LANG; }
  };
  window.SeaStarConsent = api;

  /* ───────────  事件接线  ─────────── */

  function wire() {
    document.addEventListener('click', function (e) {
      var t = e.target.closest ? e.target.closest('[data-cc], [data-cookie-settings]') : null;
      if (!t) return;

      if (t.hasAttribute('data-cookie-settings')) { e.preventDefault(); openPanel(); return; }

      var act = t.getAttribute('data-cc');
      if (!act) return;
      e.preventDefault();

      if (act === 'all') applyChoice(true, true);
      else if (act === 'essential') applyChoice(false, true);
      else if (act === 'prefs') openPanel();
      else if (act === 'close') closePanel();
      else if (act === 'save') {
        var box = overlay ? overlay.querySelector('.cc-switch__input[data-cc-cat="analytics"]') : null;
        applyChoice(box ? box.checked : false, true);
      }
    });

    // 面板内的 switch 实时更新徽标文案
    document.addEventListener('change', function (e) {
      var input = e.target;
      if (!input || input.className !== 'cc-switch__input') return;
      var row = input.closest('.cc-row');
      var badge = row ? row.querySelector('.cc-badge') : null;
      if (badge && input.getAttribute('data-cc-cat') === 'analytics') {
        badge.textContent = input.checked ? txt('on') : txt('off');
      }
    });

    // Esc 收起面板（点击遮罩的收口已在 buildDialog 内完成）
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && !overlay.hidden) closePanel();
    });

    // 简易焦点陷阱：Tab 在面板内循环
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Tab' || !overlay || overlay.hidden) return;
      var f = overlay.querySelectorAll('button:not([disabled]), input:not([disabled])');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  function boot() {
    wire();
    var cur = readStore();
    if (!cur) { showBanner(); }      // 首次到访：告知
    else {                            // 回访：按既有授权放行 deferred 脚本
      if (cur.analytics) { queue && fire(); hydrateDeferredScripts(); }
    }
    // 面板 DOM 延后建，避免拖慢首屏
    window.setTimeout(function () { overlay = buildDialog(); }, 0);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }
})();
