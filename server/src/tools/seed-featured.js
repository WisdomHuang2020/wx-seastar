#!/usr/bin/env node
'use strict';
/**
 * 建立「常用字段」的初始清单。
 *
 * 依据是对全站文字节点的实测扫描：运维高频会改的集中在**联系方式**——
 * 而且**同一个值在页面上重复出现多次**（电话 6 处、邮箱 4 处、无锡地址 3 处）。
 *
 * ⚠️ 拆分原则：**同一行里的不同字段用互不重叠的子串定位**。
 *    例如「邮编 214145 · 电话 0510-68506661」这一行：
 *      · 「无锡邮编」定位 "邮编 214145"
 *      · 「联系电话」定位 "0510-68506661"
 *    两者不重叠 —— 改其中一个不会让另一个的定位失效。
 *    若图省事让「联系电话」定位整行，改完邮编后电话字段就会失配报错。
 *
 * 用法：node src/tools/seed-featured.js [--reset]
 */
const db = require('../lib/db');
const F = require('../lib/featured');

db.migrate();

const C = '表单 + 信息';      // 联系页的「表单 + 信息」模块
const L = '公司位置';          // 「公司位置」模块
const G = '集团办公地';        // 「集团办公地」模块

const FIELDS = [
  {
    label: '联系邮箱',
    hint: '联系表单与页脚共用；改动会同时更新英文与中文页',
    targets: [
      { slug: 'cn/contact', blockHint: C, idx: 4, find: 'edison_liu@wx-seastar.com' },
      { slug: 'cn/contact', blockHint: C, idx: 33, find: 'edison_liu@wx-seastar.com' },
      { slug: 'contact', blockHint: C, idx: 3, find: 'edison_liu@wx-seastar.com' },
      { slug: 'contact', blockHint: C, idx: 32, find: 'edison_liu@wx-seastar.com' },
    ],
  },
  {
    label: '联系电话（无锡总部）',
    hint: '含联系表单里的纯号码，以及「邮编 · 电话」行里的那一段',
    targets: [
      { slug: 'cn/contact', blockHint: C, idx: 35, find: '0510-68506661' },
      { slug: 'cn/contact', blockHint: L, idx: 4, find: '0510-68506661' },
      { slug: 'cn/contact', blockHint: G, idx: 6, find: '0510-68506661' },
      { slug: 'contact', blockHint: C, idx: 34, find: '0510-68506661' },
      { slug: 'contact', blockHint: L, idx: 4, find: '0510-68506661' },
      { slug: 'contact', blockHint: G, idx: 5, find: '0510-68506661' },
      // 正文句子里也嵌着电话：「…或直接致电 0510-68506661 由我们指引。」
      // 这类必须靠**子串**定位 —— 整节点替换会把整句话换掉。
      { slug: 'cn/contact', blockHint: L, idx: 10, find: '0510-68506661' },
      { slug: 'contact', blockHint: L, idx: 10, find: '0510-68506661' },
    ],
  },
  {
    // ⚠️ 地址在「联系页」和「页脚」里是**同一个值**，必须放在**同一个字段**下 ——
    //    拆成两个字段的话，两边会把对方覆盖的位置报成"漏网"，
    //    而且运维会以为改了一个就都好了。
    label: '无锡总部地址（中文）',
    hint: '联系页与全站中文页脚共用；改一次，全部一起变',
    targets: [
      { slug: 'cn/contact', blockHint: C, idx: 37, find: '江苏省无锡市新吴区鸿山街道经十一路以西、经十三路以北、规划河道以南' },
      { slug: 'cn/contact', blockHint: L, idx: 3, find: '江苏省无锡市新吴区鸿山街道经十一路以西、经十三路以北、规划河道以南' },
      { slug: 'cn/contact', blockHint: G, idx: 5, find: '江苏省无锡市新吴区鸿山街道经十一路以西、经十三路以北、规划河道以南' },
    ],
  },
  {
    label: '无锡总部地址（英文）',
    hint: '联系页与全站英文页脚共用；改一次，全部一起变',
    targets: [
      { slug: 'contact', blockHint: C, idx: 36, find: 'West of Jing 11th Rd, North of Jing 13th Rd, South of the planned canal, Hongshan Sub-district, Xinwu District, Wuxi, Jiangsu, PRC' },
      { slug: 'contact', blockHint: L, idx: 3, find: 'West of Jing 11th Rd, North of Jing 13th Rd, South of the planned canal, Hongshan Sub-district, Xinwu District, Wuxi, Jiangsu, PRC' },
      { slug: 'contact', blockHint: G, idx: 4, find: 'West of Jing 11th Rd, North of Jing 13th Rd, South of the planned canal, Hongshan Sub-district, Xinwu District, Wuxi, Jiangsu, PRC' },
    ],
  },
  {
    label: '无锡邮编',
    targets: [
      { slug: 'cn/contact', blockHint: L, idx: 4, find: '邮编 214145' },
      { slug: 'cn/contact', blockHint: G, idx: 6, find: '邮编 214145' },
      { slug: 'contact', blockHint: L, idx: 4, find: 'Postcode 214145' },
      { slug: 'contact', blockHint: G, idx: 5, find: 'Postcode 214145' },
    ],
  },
  {
    label: '深圳办公地地址',
    targets: [
      { slug: 'cn/contact', blockHint: G, idx: 9, find: '广东省深圳市龙岗区宝龙工业城金隆路 6 号 Halcyon Office 4F' },
    ],
  },
  {
    label: '深圳联系电话',
    targets: [
      { slug: 'cn/contact', blockHint: G, idx: 10, find: '0755-89366668' },
      { slug: 'contact', blockHint: G, idx: 8, find: '0755-89366668' },
    ],
  },
  {
    label: '深圳邮编',
    targets: [
      { slug: 'cn/contact', blockHint: G, idx: 10, find: '邮编 518000' },
      { slug: 'contact', blockHint: G, idx: 8, find: 'Postcode 518000' },
    ],
  },
];

/**
 * 页脚的联系方式必须**扫出来**，不能硬编码：
 *   页脚在 20 个页面里各有一份，且**各页的节点序号并不相同**
 *   （实测邮箱落在 [14] / [17] / [18] / [20] 等不同位置）。
 * 而且页脚是**锁定块**（不给自由编辑），但联系方式恰恰是运维最需要改的 ——
 * 所以常用字段**允许指向锁定块**：改一次，全站页脚一起变。
 */
const FOOTER_RULES = [
  { field: '联系邮箱', re: /edison_liu@wx-seastar\.com/ },
  { field: '联系电话（无锡总部）', re: /0510-68506661/ },
  // 页脚地址直接挂到「无锡总部地址（中/英）」上 —— 与联系页是同一个值、同一个字段
  { field: '无锡总部地址（英文）', re: /^West of Jing 11th Rd/ },
  { field: '无锡总部地址（中文）', re: /^江苏省?无锡市新吴区鸿山街道/ },
];

function scanFooter() {
  const { textNodes } = require('../lib/fragment');
  const found = new Map();   // field → [ {slug, blockHint, idx, find} ]
  for (const p of db.all('SELECT id, slug FROM pages ORDER BY slug')) {
    for (const b of db.all('SELECT * FROM page_blocks WHERE page_id=? AND locked=1', [p.id])) {
      textNodes(b.content).forEach((t, i) => {
        const v = t.text.replace(/\s+/g, ' ').trim();
        if (!v) return;
        for (const r of FOOTER_RULES) {
          if (r.re.test(v)) {
            if (!found.has(r.field)) found.set(r.field, []);
            // 页脚注释为空，用 kind 当坐标
            found.get(r.field).push({ slug: p.slug, blockHint: b.comment || b.kind, idx: i, find: v });
            break;
          }
        }
      });
    }
  }
  return found;
}

if (process.argv.includes('--reset')) {
  db.run('DELETE FROM featured_targets');
  db.run('DELETE FROM featured_fields');
  console.log('  已清空旧的常用字段');
}

// 把扫到的页脚位置并进字段清单（没有对应字段的就新建一个）
const foot = scanFooter();
for (const [label, list] of foot) {
  let f = FIELDS.find(x => x.label === label);
  if (!f) {
    const meta = FOOTER_META[label] || {};
    f = { label, hint: meta.hint, order: meta.order, targets: [] };
    FIELDS.push(f);
  }
  const seen = new Set(f.targets.map(x => x.slug + '|' + x.blockHint + '|' + x.idx));
  for (const x of list) {
    const k = x.slug + '|' + x.blockHint + '|' + x.idx;
    if (!seen.has(k)) { f.targets.push(x); seen.add(k); }
  }
}

let nf = 0, nt = 0, bad = 0;
let order = 0;
for (const f of FIELDS) {
  order = f.order || (order + 10);
  const fid = db.run('INSERT INTO featured_fields (label, hint, kind, sort_order) VALUES (?,?,?,?)',
    [f.label, f.hint || null, 'text', order]).lastInsertRowid;
  nf++;
  for (const t of f.targets) {
    let b = F.findBlock(t.slug, t.blockHint);
    if (!b) {
      // 页脚等没有注释的块：按 kind 兜底（shell-epilogue / shell-preamble）
      const pg = db.get('SELECT id FROM pages WHERE slug=?', [t.slug]);
      b = db.get('SELECT * FROM page_blocks WHERE page_id=? AND kind=? LIMIT 1', [pg && pg.id, t.blockHint]);
    }
    if (!b) { console.log(`    ✗ ${f.label}：「${t.slug}」里找不到模块「${t.blockHint}」`); bad++; continue; }
    const { textNodes } = require('../lib/fragment');
    const node = textNodes(b.content)[t.idx];
    if (!node) { console.log(`    ✗ ${f.label}：${t.slug}/${t.blockHint} 没有第 ${t.idx} 个节点`); bad++; continue; }
    if (!node.text.includes(t.find)) {
      console.log(`    ✗ ${f.label}：节点 ${t.idx} 里找不到「${t.find.slice(0, 40)}」`);
      bad++; continue;
    }
    db.run('INSERT INTO featured_targets (field_id, slug, block_hint, idx, find, sample) VALUES (?,?,?,?,?,?)',
      [fid, t.slug, F.clean(t.blockHint), t.idx, t.find, t.find]);
    nt++;
  }
}

console.log(`\n  ✓ ${nf} 个常用字段 / ${nt} 个位置${bad ? `（${bad} 个未命中）` : ''}`);

/**
 * 漏网检查 —— 这一步抓到过一次真实的遗漏，别删。
 *
 * 逻辑：某个字段的值若在**它没覆盖到的位置**也出现，说明运维改了字段之后
 * 页面上还会残留旧值 —— 也就是"以为改好了、其实没改"。
 * 本期实测就靠它发现「…或直接致电 0510-68506661 由我们指引。」这句话没被覆盖。
 */
console.log('\n  漏网检查（字段值是否还出现在未覆盖的位置）：');
let leak = 0;
for (const r of db.all('SELECT * FROM featured_fields ORDER BY sort_order, id')) {
  const d = F.readField(r);
  if (!d.value || d.kind === 'img') continue;
  // ⚠️ 覆盖判定必须是**全局**的：同一个值可能被另一个字段覆盖
  //    （例：中文地址既在「无锡总部地址（中文）」下、也在页脚扫进来的位置里）。
  //    只看本字段会把自己人报成漏网。
  const covered = new Set();
  for (const other of db.all('SELECT id FROM featured_fields')) {
    for (const x of F.resolve(other.id)) if (x.ok) covered.add(x.block.id + '|' + x.target.idx);
  }
  for (const p of db.all('SELECT id, slug FROM pages')) {
    for (const b of db.all('SELECT * FROM page_blocks WHERE page_id=?', [p.id])) {
      if (!b.content.includes(d.value)) continue;
      const { textNodes } = require('../lib/fragment');
      textNodes(b.content).forEach((t2, i) => {
        if (t2.text.includes(d.value) && !covered.has(b.id + '|' + i)) {
          console.log(`    ⚠ ${d.label}：「${p.slug}」的「${(b.comment||b.kind).toString().replace(/[=\s]+/g,' ').trim()}」[${i}] 未覆盖`);
          leak++;
        }
      });
    }
  }
}
console.log(leak ? `    → 共 ${leak} 处漏网，请把它们补进对应字段的 targets` : '    ✓ 无漏网');
console.log('');
for (const r of db.all('SELECT * FROM featured_fields ORDER BY sort_order, id')) {
  const d = F.readField(r);
  console.log(`    ${d.label.padEnd(18)} ${String(d.live)}/${d.targets} 处   ${JSON.stringify(d.value || '').slice(0, 46)}`);
}
