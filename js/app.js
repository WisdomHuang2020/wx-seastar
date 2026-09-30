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
})();
