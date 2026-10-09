/* 注入式探针 —— 验证 js/consent.js 的真实行为。
   必须与被验证页面同目录（相对路径才能加载到 js/*.js 与 styles.css）。
   手法：真实 .click()，不调用内部函数；每条"状态不变"都配"操作有效"的自证断言。 */
(function () {
  'use strict';

  /* ★ 模拟「渲染帧队被冻结」的环境 —— 后台标签页、低电量节流、
     部分无头场景都会这样：rAF 注册了但回调永不执行。
     覆写必须放在这里（IIFE 最开头）：本探针是同步 script，
     早于 defer 的 consent.js 执行，所以 consent.js 拿到的就是冻结版本。
     这一轮专门用来证明「UI 显隐不依赖 rAF」这条设计真的成立。 */
  if (SETTINGS.throttleRAF) {
    window.__RAF_FROZEN = true;
    window.requestAnimationFrame = function () { return 0; };
    window.cancelAnimationFrame = function () { /* noop */ };
  }

  var RESULT = { steps: [], fail: 0 };
  RESULT.rafFrozen = !!window.__RAF_FROZEN;
  var EXPECT_ZH = (document.documentElement.lang === 'zh' ||
                   window.__SEASTAR_LANG__ === 'zh' ||
                   /Cookie 设置/.test(document.body.textContent));

  function step(name, fn) {
    try {
      var r = fn();
      RESULT.steps.push('OK   ' + name + (r === undefined ? '' : ' :: ' + JSON.stringify(r)));
    } catch (e) {
      RESULT.fail++;
      RESULT.steps.push('FAIL ' + name + ' :: ' + e.name + ': ' + e.message);
    }
  }
  function ok(cond, msg) { if (!cond) throw new Error(msg); }

  function visible(el) {
    /* 显隐的唯一可靠开关是 hidden 属性 + display/visibility。
       不要把 opacity 混进来当判据 —— 它受 CSS transition 驱动，
       在无头环境里可能还没过完（这是「存在但看不见」与「不存在」的区别）。 */
    if (!el) return false;
    if (el.hidden) return false;
    var cs = getComputedStyle(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden';
  }
  /* 已挂上 is-in → CSS 的目标态就是可见，transition 只是过程 */
  function fadedIn(el) { return !!el && el.classList.contains('is-in'); }
  function q(sel) { return document.querySelector(sel); }

  function flush() {
    /* 把结果写进 DOM，供 --dump-dom 抓取 */
    RESULT.lang = window.__SEASTAR_LANG__;
    RESULT.expectZh = EXPECT_ZH;
    RESULT.nowSecondLoad = SETTINGS.secondLoad;
    var pre = document.createElement('pre');
    pre.id = '__probe';
    pre.textContent = 'PROBE:' + JSON.stringify(RESULT, null, 1);
    document.body.appendChild(pre);
  }

  /* ★ 必须「轮询等到就绪」，不能用固定 setTimeout：
     --virtual-time-budget 下虚拟时钟会飞快推进，defer 脚本还在真实网络上下载，
     固定 700ms 时 API 根本没定义 —— 表现为前几步全 FAIL、后几步又 OK 的假故障。
     这里对每个步骤都显式等它依赖的 DOM/API 真正出现。 */
  function until(condFn, cb, budget) {
    var waited = 0;
    (function poll() {
      var yes = false;
      try { yes = !!condFn(); } catch (e) { yes = false; }
      if (yes) { cb(); return; }
      if (waited >= (budget || 20000)) { cb(); return; }   // 超时也跑，让失败显式暴露
      waited += 100;
      setTimeout(poll, 100);
    })();
  }

  var queue = [];
  /* item = [name, gate, fn]
     gate 为数字 → 固定延时；为函数 → 轮询等到它返回真值 */
  function later(name, gate, fn) { queue.push([name, gate, fn]); }

  function run() {
    var i = 0;
    (function next() {
      if (i >= queue.length) { flush(); return; }
      var item = queue[i++];
      var gate = item[1];
      var go = function () { step(item[0], item[2]); setTimeout(next, 80); };
      if (typeof gate === 'function') until(gate, go, 20000);
      else setTimeout(go, gate);
    })();
  }

  var bannerReady = function () {
    var b = document.querySelector('.cc-banner');
    return !!(b && fadedIn(b));
  };
  var apiReady = function () { return !!window.SeaStarConsent; };
  var overlayReady = function () {
    var o = document.querySelector('.cc-overlay');
    return !!(o && fadedIn(o));
  };

  /* ── 第二轮加载（回访）：横幅不应再出现 ───────────────────────── */
  if (SETTINGS.secondLoad) {
    later('02-回访不再弹横幅', apiReady, function () {
      var b = q('.cc-banner');
      ok(!visible(b), '回访仍显示了横幅');
      return { bannerExists: !!b, visible: visible(b) };
    });
    later('02-偏好记录仍在', apiReady, function () {
      var raw = localStorage.getItem('wxs_cc_v1');
      ok(!!raw, 'localStorage 记录丢失');
      var o = JSON.parse(raw);
      ok(o.v === 1, '版本号不对');
      return o;
    });
    later('02-页脚入口可重开面板', function () { return !!q('[data-cookie-settings]'); }, function () {
      var btn = q('[data-cookie-settings]');
      ok(!!btn, '找不到页脚 Cookie 设置按钮');
      RESULT.footerLabel = btn.textContent.trim();
      btn.click();                                  // ← 真实点击，不是 open()
      return { label: btn.textContent.trim() };
    });
  later('02-面板确实打开（自证点击有效）', overlayReady, function () {
    var ov = q('.cc-overlay');
    ok(!!ov, '未创建 .cc-overlay');
    ok(visible(ov), '点击页脚入口后面板未打开（仍 hidden）');
    ok(fadedIn(ov), '面板未挂 is-in —— 会停在透明看不见');
    return true;
  });
    later('02-面板反映已保存的 analytics=true', function () {
      return !!q('.cc-switch__input[data-cc-cat="analytics"]');
    }, function () {
      var box = q('.cc-switch__input[data-cc-cat="analytics"]');
      ok(box.checked === true, '重开面板未回填上次选择');
      return { checked: box.checked };
    });
    run();
    return;
  }

  /* ── 第一轮加载（首次到访）────────────────────────────────────── */

  later('01-API 已挂载', apiReady, function () {
    ok(!!window.SeaStarConsent, 'window.SeaStarConsent 未定义 —— consent.js 没跑成功');
    return { lang: window.SeaStarConsent.lang };
  });

  later('01-首次到访：横幅可见', bannerReady, function () {
    var b = q('.cc-banner');
    ok(visible(b), '横幅存在但不可见（display/visibility 被挡）');
    ok(fadedIn(b), '横幅未挂 is-in —— rAF 又没跑，opacity 会停在 0');
    RESULT.bannerText = (q('.cc-banner__title') || {}).textContent;
    return { visible: true, title: RESULT.bannerText };
  });

  later('01-尚未记录偏好', apiReady, function () {
    ok(localStorage.getItem('wxs_cc_v1') === null, '首次到访却有残留记录（测试环境污染）');
    return true;
  });

  later('01-三个按钮齐备且文案双语正确', function () {
    return !!q('.cc-banner [data-cc="prefs"]');
  }, function () {
    var essentials = q('.cc-banner [data-cc="essential"]');
    var all = q('.cc-banner [data-cc="all"]');
    var prefs = q('.cc-banner [data-cc="prefs"]');
    ok(!!essentials && !!all && !!prefs, '横幅按钮不齐');
    var labels = [essentials.textContent, all.textContent, prefs.textContent];
    if (EXPECT_ZH) {
      ok(labels[0].indexOf('必要') >= 0, '中文站此按钮文案不对：' + labels[0]);
      ok(labels[2].indexOf('偏好') >= 0, '中文站偏好按钮文案不对：' + labels[2]);
    } else {
      ok(/Essential/i.test(labels[0]), '英文站文案不对：' + labels[0]);
      ok(/Preference/i.test(labels[2]), '英文站偏好按钮文案不对：' + labels[2]);
    }
    RESULT.bannerLabels = labels;
    return labels;
  });

  /* ★ 关键：真点击偏好按钮，验证事件真的挂上了
     （v0.13.2 的教训 —— 选择器没命中时事件根本没绑，页面看着却正常） */
  later('01-真点击「偏好设置」', function () {
    return !!q('.cc-banner [data-cc="prefs"]');
  }, function () {
    var prefs = q('.cc-banner [data-cc="prefs"]');
    ok(!!prefs, '按钮选不到');
    prefs.click();
    return true;
  });

  later('01-面板打开（自证上面的点击真的生效了）', overlayReady, function () {
    var ov = q('.cc-overlay');
    ok(!!ov, '未创建 .cc-overlay');
    ok(visible(ov), '点击后面板仍 hidden —— 事件没绑上');
    ok(fadedIn(ov), '面板未挂 is-in —— 会停在透明看不见');
    return true;
  });

  later('01-三类齐全且必要/营销被锁定', function () {
    return document.querySelectorAll('.cc-switch__input').length >= 3;
  }, function () {
    var cats = ['essential', 'analytics', 'marketing'];
    var seen = {};
    document.querySelectorAll('.cc-switch__input').forEach(function (i) {
      var c = i.getAttribute('data-cc-cat');
      seen[c] = { checked: i.checked, disabled: i.disabled };
    });
    cats.forEach(function (c) { ok(!!seen[c], '缺少分类：' + c); });
    ok(seen.essential.checked === true, '必要项未默认开启');
    ok(seen.essential.disabled === true, '必要项应当锁定，不可关闭');
    ok(seen.marketing.disabled === true, '营销项应当锁定');
    ok(seen.marketing.checked === false, '营销项不应为勾选态');
    ok(seen.analytics.disabled === false, '分析项必须可手动切换');
    ok(seen.analytics.checked === false, '分析项默认应为关闭');
    RESULT.toggles = seen;
    return seen;
  });

  later('01-面板文案与语言一致', 120, function () {
    var title = (q('.cc-panel__title') || {}).textContent || '';
    if (EXPECT_ZH) ok(title.indexOf('偏好') >= 0, '中文站面板标题不对：' + title);
    else ok(/Preference/i.test(title), '英文站面板标题不对：' + title);
    RESULT.panelTitle = title;
    return title;
  });

  later('01-未同意前：授权闸门不放行', 200, function () {
    var ran = false;
    window.SeaStarConsent.runWhenGranted('analytics', function () { ran = true; });
    ok(ran === false, '未同意却执行了 analytics 任务 —— 闸门失效');
    ok(window.SeaStarConsent.isGranted('analytics') === false, 'isGranted 判断错');
    return { ran: ran };
  });

  later('01-真点击 analytics 开关并保存', function () {
    return !!q('.cc-switch__input[data-cc-cat="analytics"]') && !!q('.cc-panel__foot [data-cc="save"]');
  }, function () {
    var box = q('.cc-switch__input[data-cc-cat="analytics"]');
    ok(!!box, '找不到开关');
    box.click();                                    // ← 真实点击 <input>
    ok(box.checked === true, '开关点击后未变为开启');
    var save = q('.cc-panel__foot [data-cc="save"]');
    ok(!!save, '找不到保存按钮');
    save.click();                                   // ← 真实点击
    return true;
  });

  later('01-保存后落库与放行', 350, function () {
    var raw = localStorage.getItem('wxs_cc_v1');
    ok(!!raw, '保存后 localStorage 未写入');
    var o = JSON.parse(raw);
    ok(o.analytics === true, 'analytics 未记为 true');
    ok(o.essential === true, 'essential 丢失');
    ok(typeof o.ts === 'string', '缺少时间戳');
    RESULT.saved = o;
    return o;
  });

  later('01-必要 Cookie 已写出', 120, function () {
    var all = document.cookie || '';
    RESULT.cookieRaw = all;
    ok(/wxs_cc=1\.a/.test(all), '未找到偏好 Cookie（期望 1.a）：' + all);
    ok(all.indexOf('wxs_sid') < 0, '前台不应出现后台会话 Cookie');
    return { cookie: all };
  });

  later('01-授权后闸门放行排队任务', 150, function () {
    var ran = false;
    window.SeaStarConsent.runWhenGranted('analytics', function () { ran = true; });
    ok(ran === true, '已同意却未立即执行 —— runWhenGranted 有 bug');
    return { ran: ran };
  });

  later('01-横幅已收起', 120, function () {
    var b = q('.cc-banner');
    ok(!visible(b), '已做出选择但横幅仍在');
    return true;
  });

  /* ── 反面漏斗：撤回授权必须真的收回许可 ─────────────────────── */
  later('01-撤回授权后不再放行', 200, function () {
    window.SeaStarConsent.setAll(false);
    ok(window.SeaStarConsent.isGranted('analytics') === false, 'setAll(false) 未收回授权');
    var ran = false;
    window.SeaStarConsent.runWhenGranted('analytics', function () { ran = true; });
    ok(ran === false, '撤回授权后仍在放行 —— 闸门只增不减');
    return { ran: ran };
  });

  later('01-撤回后重新登记 essential-only', 200, function () {
    var raw = JSON.parse(localStorage.getItem('wxs_cc_v1'));
    ok(raw.analytics === false, '撤回后 analytics 仍为 true');
    return raw;
  });

  /* 恢复成"已授权 analytics"，供第二轮加载验证持久化 */
  later('01-恢复授权状态供第二轮验证', 150, function () {
    window.SeaStarConsent.setAll(true);
    ok(window.SeaStarConsent.isGranted('analytics') === true, '未恢复成功');
    return true;
  });

  /* 起步也不用固定延时：等到 API 真正挂上来再开始第一步 */
  until(apiReady, run, 20000);
})();
