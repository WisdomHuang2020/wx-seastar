/* ============================================================
   SEA☆STAR 实益达 — 共享交互脚本
   纯原生 JS，无依赖。遵循 prefers-reduced-motion。
   ============================================================ */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Sticky 导航：滚动后毛玻璃化 ---------- */
  var nav = document.querySelector('.nav');
  if (nav) {
    var onScroll = function () {
      if (window.scrollY > 24) {
        nav.classList.add('nav--solid');
        nav.classList.remove('nav--transparent');
      } else {
        nav.classList.remove('nav--solid');
        if (nav.dataset.navTransparent !== 'false') {
          nav.classList.add('nav--transparent');
        }
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /* ---------- 2. 移动端抽屉 ---------- */
  var burger = document.querySelector('.nav__burger');
  var drawer = document.querySelector('.drawer');
  if (burger && drawer) {
    var openDrawer = function () {
      drawer.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      // stagger 菜单项逐个淡入
      var links = drawer.querySelectorAll('a, .drawer__cta');
      links.forEach(function (el, i) {
        el.style.transitionDelay = (60 + i * 70) + 'ms';
      });
    };
    var closeDrawer = function () {
      drawer.classList.remove('is-open');
      document.body.style.overflow = '';
    };
    burger.addEventListener('click', openDrawer);
    var closeBtn = drawer.querySelector('.drawer__close');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    drawer.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', closeDrawer);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
    });
  }

  /* ---------- 2b. 桌面端导航下拉（通用照明 → 家居/商业/户外） ----------
     ⚠️ 为什么不用纯 CSS :hover 作为唯一机制：
        纯 CSS 版本靠 opacity + visibility 过渡，而 visibility 是**离散属性**，
        鼠标快速进出、或页面从 bfcache 恢复时状态可能残留，
        表现为"下拉只在第一次 hover 时能展开"。
        改由 JS 显式加 .is-open（display 切换，无中间态），
        关闭再加 160ms 延迟 —— 鼠标从触发器移进菜单的途中不会断线。
        CSS 里的 :hover 规则保留，仅作为无 JS 时的兜底。 */
  document.querySelectorAll('.nav__dropdown').forEach(function (dd) {
    var closeTimer = null;

    var open = function () {
      clearTimeout(closeTimer);
      dd.classList.add('is-open');
    };
    var closeSoon = function () {
      clearTimeout(closeTimer);
      closeTimer = setTimeout(function () { dd.classList.remove('is-open'); }, 160);
    };

    dd.addEventListener('mouseenter', open);
    dd.addEventListener('mouseleave', closeSoon);
    dd.addEventListener('focusin', open);       // 键盘 Tab 进入也展开
    dd.addEventListener('focusout', closeSoon);

    // 触屏设备没有 hover：第一次点触发器先展开，再点才跳转
    var trigger = dd.querySelector('.nav__dropdown-trigger');
    if (trigger) {
      trigger.addEventListener('click', function (e) {
        if (window.matchMedia('(hover: none)').matches && !dd.classList.contains('is-open')) {
          e.preventDefault();
          open();
        }
      });
    }
  });

  // 点击下拉以外的区域、或按 Esc，收起所有下拉
  document.addEventListener('click', function (e) {
    document.querySelectorAll('.nav__dropdown.is-open').forEach(function (dd) {
      if (!dd.contains(e.target)) dd.classList.remove('is-open');
    });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    document.querySelectorAll('.nav__dropdown.is-open').forEach(function (dd) {
      dd.classList.remove('is-open');
    });
  });

  /* ---------- 3. 滚动入场（IntersectionObserver） ---------- */
  var revealObserver = null;

  function attachReveal(scope) {
    var reveals = (scope || document).querySelectorAll('.reveal:not(.is-in)');
    if (!reveals.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      reveals.forEach(function (el) { el.classList.add('is-in'); });
      return;
    }
    if (!revealObserver) {
      revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
          }
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    }
    reveals.forEach(function (el) { revealObserver.observe(el); });
  }

  attachReveal(document);
  // 供动态插入的内容（如从接口取回的产品卡）重新挂载入场动画
  window.SeaStarReveal = attachReveal;

  /* ---------- 4. 光谱曲线绘制（Trace 动效） ---------- */
  var tracePaths = document.querySelectorAll('.trace-path');
  if (tracePaths.length) {
    if (reduce || !('IntersectionObserver' in window)) {
      tracePaths.forEach(function (p) { p.classList.add('is-drawn'); });
    } else {
      var io2 = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-drawn');
            io2.unobserve(entry.target);
          }
        });
      }, { threshold: 0.35 });
      tracePaths.forEach(function (p) { io2.observe(p); });
    }
  }

  /* ---------- 5. 通用 Tab / Pill 切换 ---------- */
  // 用法: <div class="pills" data-tabs="groupName"> <button class="pill" data-tab="key">
  //       目标面板: [data-panel="groupName:key"]
  document.querySelectorAll('[data-tabs]').forEach(function (group) {
    var name = group.getAttribute('data-tabs');
    var pills = group.querySelectorAll('.pill, [data-tab]');
    pills.forEach(function (pill) {
      pill.addEventListener('click', function () {
        pills.forEach(function (p) { p.classList.remove('is-active'); });
        pill.classList.add('is-active');
        var key = pill.getAttribute('data-tab');
        var panels = document.querySelectorAll('[data-panel^="' + name + ':"]');
        panels.forEach(function (panel) {
          var isTarget = panel.getAttribute('data-panel') === name + ':' + key;
          panel.classList.toggle('hidden', !isTarget);
          if (isTarget && !reduce) {
            panel.classList.remove('is-in');
            void panel.offsetWidth;
            panel.classList.add('is-in');
          }
        });
      });
    });
  });

  /* ---------- 5b. 快捷跳转并同步 Tab（顶部品类导航） ---------- */
  // 用法: <a href="#target" data-jump-tab="group:key">
  document.querySelectorAll('[data-jump-tab]').forEach(function (link) {
    link.addEventListener('click', function () {
      var target = link.getAttribute('data-jump-tab'); // e.g. "catalog:home"
      var parts = target.split(':');
      var groupEl = document.querySelector('[data-tabs="' + parts[0] + '"]');
      if (!groupEl) return;
      var pill = groupEl.querySelector('[data-tab="' + parts[1] + '"]');
      if (pill) pill.click();
    });
  });

  /* ---------- 6. 数字滚动统计（滚动进入触发） ----------
     ⚠️ HTML 里的初始文本本身就是**目标值**，不是 0 ——
        因为 IntersectionObserver 只在滚动进入时才触发动画，
        无 JS、或无头截图、或用户没滚到那里时，必须能看到正确的数字。
        不要把它改回 0（实测踩到过：线上数据区整片显示 0）。 */
  var counters = document.querySelectorAll('[data-count]');
  if (counters.length) {
    var animateCount = function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var decimals = (el.getAttribute('data-decimals') | 0);
      if (reduce) { el.textContent = target.toFixed(decimals); return; }
      var start = performance.now(), dur = 1400;
      var step = function (now) {
        var t = Math.min((now - start) / dur, 1);
        var eased = 1 - Math.pow(1 - t, 3);
        el.textContent = (target * eased).toFixed(decimals);
        if (t < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (!('IntersectionObserver' in window)) {
      counters.forEach(animateCount);
    } else {
      var io3 = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) { animateCount(entry.target); io3.unobserve(entry.target); }
        });
      }, { threshold: 0.5 });
      counters.forEach(function (c) { io3.observe(c); });
    }
  }

  /* ---------- 7. 联系表单 ----------
     提交逻辑已移交 js/site.js 的 SeaStar.mountContactForm()，
     由它 POST 到 /api/public/messages 存入后台数据库，
     这样客户留言才能在管理后台查阅与导出。
     本文件不再处理表单，避免两套逻辑抢同一个 submit 事件。 */

  /* ---------- 8. 业务线卡片代表图轮播（交叉淡入） ----------
     用法: <div class="biz-card__media biz-card__media--cycle" data-cycle="3000">
              <img class="is-active" …><img …><img …>
           </div>
     · 无 JS 时由 HTML 里首图的 .is-active 兜底 —— 不做"必须有 JS 才看得见"的设计
     · 遵循 prefers-reduced-motion：该偏好下**不自动切换**，只静态显示首图
     · 标签页切走后暂停计时器，切回来再继续 —— 不在看不见的地方空转
     · **鼠标悬浮 / 键盘聚焦时暂停**（客户要求）—— 便于看清当前这一张
       hovered 标志位不能省：否则"悬浮期间切标签页再切回来"会把计时器重新启动 */
  document.querySelectorAll('[data-cycle]').forEach(function (box) {
    var imgs = box.querySelectorAll('img');
    if (imgs.length < 2 || reduce) return;
    var idx = 0;
    var step = parseInt(box.getAttribute('data-cycle'), 10) || 5000;
    var timer = null;
    var hovered = false;
    var tick = function () {
      imgs[idx].classList.remove('is-active');
      idx = (idx + 1) % imgs.length;
      imgs[idx].classList.add('is-active');
    };
    var start = function () { if (!timer && !hovered) timer = setInterval(tick, step); };
    var stop = function () { if (timer) { clearInterval(timer); timer = null; } };
    box.addEventListener('mouseenter', function () { hovered = true; stop(); });
    box.addEventListener('mouseleave', function () { hovered = false; start(); });
    box.addEventListener('focusin', function () { hovered = true; stop(); });
    box.addEventListener('focusout', function () { hovered = false; start(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { stop(); } else { start(); }
    });
    start();
  });
})();
