/**
 * 功能 4 验证脚本的页面侧片段：常量与工具函数，由
 * [../verify-timestamps-live.mjs](../verify-timestamps-live.mjs) 与
 * [ts-checks.mjs](ts-checks.mjs) 拼进每段 `Runtime.evaluate` 的求值表达式。
 *
 * 它是**在被测页面里跑的源码字符串**，不是本进程的模块——所以不能 import 任何东西，
 * 语法只能用目标 Chrome 支持的那些，而且每段求值都要重新拼一次（求值之间不共享作用域）。
 *
 * `nodeOf` 与被测代码的 fiber 反查是同路径的**独立实现**：这里只用它取原始时间字段，
 * 好按上游 `ui-trajectory/src/client/layout.ts` 的规则重算一遍再和标签比。抄被测代码
 * 的实现会让「标签等于上游 Started」那条断言变成自己和自己比。
 */
export const HELPERS = `
const UPSTREAM = new Set(['user', 'steering', 'turn-tail']);
const LABEL = 'dsh-oi-ts';
const rowsOf = () => [...document.querySelectorAll('[data-chat-flow-key]')];
const labelsOf = (row) => [...row.children].filter((el) => el.classList.contains(LABEL));
const hasForeign = (row) => [...row.children].some((el) => !el.classList.contains(LABEL));
const scrollerEl = () => document.querySelector('[data-conversation-scroll]');
// 相对滚动内容的坐标：视口坐标会随 scrollTop 整体平移，页面自己滚一下就会把
// 全部行报成「位移」，那是假失败。
const geometry = () => {
  const scroller = scrollerEl();
  if (scroller === null) return null;
  const base = scroller.getBoundingClientRect();
  const out = {};
  for (const row of rowsOf()) {
    const r = row.getBoundingClientRect();
    out[row.getAttribute('data-chat-flow-key')] = [
      Math.round((r.top - base.top + scroller.scrollTop) * 100) / 100,
      Math.round(r.height * 100) / 100,
      Math.round(r.width * 100) / 100,
    ];
  }
  return { rows: out, scrollHeight: scroller.scrollHeight, count: Object.keys(out).length };
};
const diffGeometry = (a, b) => {
  const bad = [];
  for (const key of Object.keys(a.rows)) {
    const x = a.rows[key], y = b.rows[key];
    if (y === undefined) { bad.push({ key, gone: true }); continue; }
    if (x[0] !== y[0] || x[1] !== y[1] || x[2] !== y[2]) bad.push({ key, before: x, after: y });
  }
  return bad;
};
const upstreamTimeEls = () => [...document.querySelectorAll(
  '[data-time-hover-root] [class*="_timeStart"], [data-time-hover-root] [class*="_timeEnd"]')];
const upstreamOpacity = () => {
  const tally = {};
  for (const el of upstreamTimeEls()) {
    const o = getComputedStyle(el).opacity;
    tally[o] = (tally[o] ?? 0) + 1;
  }
  return { count: upstreamTimeEls().length, opacity: tally };
};
// 本行第一行文字的垂直区间。用 Range 的 client rect 而不是元素矩形：元素矩形是
// 整段的高度，拿它判「标签和第一行对齐」永远成立。
const firstLineBand = (row) => {
  const walk = document.createTreeWalker(row, NodeFilter.SHOW_TEXT);
  let top = Infinity, bottom = -Infinity, node;
  while ((node = walk.nextNode()) !== null) {
    if ((node.nodeValue ?? '').trim() === '') continue;
    if (node.parentElement !== null && node.parentElement.closest('.' + LABEL) !== null) continue;
    const range = document.createRange();
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.width === 0 || r.height === 0) continue;
      if (r.top < top) { top = r.top; bottom = r.bottom; }
      else if (r.top < top + 4 && r.bottom > bottom) bottom = r.bottom;
    }
  }
  return top === Infinity ? null : { top, bottom };
};
// 反查一行对应的 chat 节点，与被测代码同路径但独立实现——这里只用它取原始时间
// 字段，好按上游规则重算一遍再和标签比。
const fiberOf = (el) => {
  for (const k of Object.keys(el)) if (k.startsWith('__reactFiber$')) return el[k];
  return null;
};
const nodeOf = (row) => {
  const wanted = row.getAttribute('data-chat-flow-key');
  const root = fiberOf(row);
  if (root === null || root === undefined) return null;
  const stack = [{ f: root, d: 0 }];
  while (stack.length > 0) {
    const { f, d } = stack.pop();
    if (f === null || f === undefined || d > 12) continue;
    const n = f.memoizedProps === undefined || f.memoizedProps === null ? undefined : f.memoizedProps.node;
    if (n !== null && n !== undefined && typeof n === 'object' && n.key === wanted && 'data' in n) return n;
    if (f.child !== null && f.child !== undefined) stack.push({ f: f.child, d: d + 1 });
    if (f.sibling !== null && f.sibling !== undefined) stack.push({ f: f.sibling, d });
  }
  return null;
};
`
