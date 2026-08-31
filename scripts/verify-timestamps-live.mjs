/**
 * 功能 4 的实测驱动：把构建出的 client bundle 注入运行中的 DSH 页面，在**真实
 * 会话页**上断言逐行时间戳的装饰完整性、格式、取的是不是开始时刻、读的是不是本行
 * 的节点、标签落在本行自己的盒子里、不压正文、Think 行、上游三类改常驻，以及卸载
 * 回收。
 *
 * CDP 连接与判据框架来自 [lib/cdp.mjs](lib/cdp.mjs)，与另外两个 verify 脚本共用。
 * 这个文件只做编排：前置检查、选会话、清场、基线、注入、覆盖度、收尾。页面侧的
 * 公用片段在 [lib/ts-page.mjs](lib/ts-page.mjs)，十条断言的本体在
 * [lib/ts-checks.mjs](lib/ts-checks.mjs)。
 *
 * 五处只有这里才守得住的坑：
 *
 *   1. **hover 媒体特性得由 Chrome 启动参数给**。headless 默认 `(hover: none)`，
 *      上游那条 `@media (hover: hover)` 里的 `opacity: 0` 根本不生效，装载前量到的
 *      恒是 `1`——就等于在「没测到任何东西」的情况下报绿。
 *      `Emulation.setEmulatedMedia` **办不到**：实测下发 `{name:'hover'}` 返回 `{}`
 *      无错，而 `matchMedia('(hover: hover)').matches` 纹丝不动地保持 `false`；
 *      Chrome 只认它支持的那几个 `prefers-*` / `color-*` 特性，多余的静默忽略。
 *      唯一有效的开关是 `--blink-settings=primaryHoverType=2,availableHoverTypes=2`，
 *      所以这里改成读 `matchMedia` 的前置检查，不满足一律 abort、不记 FAIL——那是
 *      环境没配对，不是功能缺陷。
 *   2. **本插件很可能已经装在 profile 里，页面自带一份实例**（`node_modules` 里
 *      指向本仓库的符号链接）。不先停掉它就注入，页面上会有两份互不知情的实例，
 *      每行两枚标签，「恰好一枚」那条断言直接崩在假象上。清场因此调
 *      `window.__dshOperationImprove__.timestamps.dispose()`，而不只是把标签删掉：
 *      光删 DOM，原生那份的 MutationObserver 下一帧就把它们贴回来。
 *   3. **几何基线必须在清场之后、注入之前采**，且用「相对滚动内容」的坐标而不是
 *      视口坐标：视口坐标随 `scrollTop` 整体平移，页面自己滚一下就会把全部行报成
 *      位移。基线在这里只用于 dispose 之后的复原比对——**装载态与基线本来就不同**，
 *      标签要靠右侧留白，正文列会窄一截。
 *   4. **时间要独立重算一遍再比**，不能只断言「是个数字」。取错字段（拿完成时刻当
 *      开始时刻）和 fiber 反查串行（把邻行的时间安到本行上）是这个功能仅有的两种
 *      失败方式，而两种的产物每一条都长得像合法时间戳。所以一条按上游
 *      `ui-trajectory/src/client/layout.ts` 的 `startedAt` 规则重算后逐行比对，
 *      一条断言整列单调不减。
 *   5. **「标签属于哪一行」是要断言的东西**。标签落在行间距里时它离本行和离下一行
 *      都是 1px，看着一切正常，读起来却归属下一行。判据因此是标签的垂直中心与
 *      **本行第一行文字**的中心对齐，而不是「标签存在」。
 *
 * 用法：node scripts/verify-timestamps-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过 Page.reload（页面已就绪时省 10 秒）。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'
import { HELPERS } from './lib/ts-page.mjs'
import { runChecks, checkDispose } from './lib/ts-checks.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

/** 跑满全部断言所需的最小行数：太短的会话里「单调不减」测不出什么。 */
const NEED_ROWS = 20

/**
 * hover 媒体特性不满足时给出的处理办法。
 *
 * 测试栈起的 Chrome 自带那两个 `--blink-settings`，所以正常路径下走不到这里；
 * 走到了就说明打的是别人手起的 Chrome，那就只能让它自己重起——**hover 只能由
 * 启动参数给**。
 */
const RELAUNCH = 'npm run stack:down && npm run stack:up'

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

if (process.env.DSH_OI_NO_RELOAD !== '1') await reloadAndWait(conn)

// ---- 前置检查：hover 媒体特性 ------------------------------------------------
const media = await evaluate(`(() => ({
  hover: matchMedia('(hover: hover)').matches,
  anyHover: matchMedia('(any-hover: hover)').matches,
  pointerFine: matchMedia('(pointer: fine)').matches,
}))()`)
console.log('[media]', JSON.stringify(media))
if (media.hover !== true) {
  abort(
    '这个 Chrome 不匹配 `(hover: hover)`——上游那条藏时间的规则整条不生效，'
    + '「改成常驻」的断言会在功能完全没生效的情况下报绿。',
    `观测：${JSON.stringify(media)}\n`
    + '处理：`Emulation.setEmulatedMedia` 对 hover 无效（实测返回 `{}` 无错但 matchMedia 不变），'
    + `只能由启动参数给。重起测试栈的 Chrome：\n  ${RELAUNCH}`,
  )
}

// 展开工作区并挑一个够长、且带 Think 行与上游时间标签的会话打开。
const opened = await evaluate(`(async () => {
  ${HELPERS}
  const probe = () => ({
    flowRows: rowsOf().length,
    thinks: document.querySelectorAll('[data-variant="think"]').length,
    upstreamTimes: upstreamTimeEls().length,
  });
  const good = (p) => p.flowRows >= ${NEED_ROWS} && p.thinks >= 1 && p.upstreamTimes >= 1;
  const first = probe();
  if (good(first)) return { reused: true, ...first };
  for (const r of document.querySelectorAll('[role="treeitem"]')) {
    if (String(r.className).includes('_projectRow') && r.getAttribute('aria-expanded') === 'false') r.click();
  }
  await new Promise((r) => setTimeout(r, 1500));
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'));
  const tried = [];
  for (const row of rows) {
    row.click();
    await new Promise((r) => setTimeout(r, 3500));
    const p = probe();
    tried.push({ title: row.textContent.slice(0, 24), ...p });
    if (good(p)) return { reused: false, title: row.textContent.slice(0, 40), ...p, tried: tried.length };
  }
  return { reused: false, title: null, flowRows: 0, thinks: 0, upstreamTimes: 0, tried: tried.length, detail: tried.slice(0, 8) };
})()`)
console.log('[session]', JSON.stringify(opened))

// ---- 前置检查：会话内容不满足一律中止，不记跳过 ------------------------------
if (opened.flowRows < NEED_ROWS) {
  abort(
    `会话页只有 ${opened.flowRows} 条节点行（需 ≥${NEED_ROWS}）——断言会退化成「没东西可测」。`,
    `观测：${JSON.stringify(opened)}\n处理：该 profile 下需要一个足够长的会话。`,
  )
}
if (opened.thinks < 1) {
  abort(
    'Think 行一条都没有——思考行的断言实测未发生。',
    `观测：${JSON.stringify(opened)}\n处理：换一个含思考过程的会话。`,
  )
}
if (opened.upstreamTimes < 1) {
  abort(
    '页面上没有上游时间标签（`[data-time-hover-root] [class*="_timeStart"|"_timeEnd"]`）——常驻断言实测未发生。',
    `观测：${JSON.stringify(opened)}\n处理：换一个含 user / turn-tail 行的会话。`,
  )
}

// 清场。**必须先停掉页面自带的那份实例**，理由见模块头第 2 条；只删 DOM 的话，
// 原生那份的 MutationObserver 下一帧就把标签贴回来，注入之后每行两枚。
const cleaned = await evaluate(`(async () => {
  ${HELPERS}
  const native = window.__dshOperationImprove__;
  let stopped = null;
  if (native !== undefined && native !== null) {
    stopped = [];
    for (const key of ['timestamps', 'startNav']) {
      const feature = native[key];
      if (feature !== undefined && feature !== null && typeof feature.dispose === 'function') {
        feature.dispose(); stopped.push(key);
      }
    }
    delete window.__dshOperationImprove__;
  }
  if (window.__dshOiTsTest__ !== undefined) {
    window.__dshOiTsTest__.disposers.forEach((d) => { try { d() } catch (error) { void error } });
    delete window.__dshOiTsTest__;
  }
  for (const el of document.querySelectorAll('.' + LABEL)) el.remove();
  for (const el of document.querySelectorAll('[data-dsh-oi-ts]')) el.removeAttribute('data-dsh-oi-ts');
  for (const el of document.querySelectorAll('.dsh-oi-nav')) el.remove();
  for (const el of document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]')) el.remove();
  await new Promise((r) => setTimeout(r, 500));
  return { nativeStopped: stopped,
    labels: document.querySelectorAll('.' + LABEL).length,
    styles: document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]').length };
})()`)
console.log('[clean]', JSON.stringify(cleaned))
if (cleaned.labels !== 0 || cleaned.styles !== 0) {
  abort(
    '清场没清干净——页面上还留着标签或本插件的样式表，之后的断言分不清是谁的产物。',
    `观测：${JSON.stringify(cleaned)}\n处理：整页 reload 后重跑（去掉 DSH_OI_NO_RELOAD=1）。`,
  )
}

// 基线：几何 + 上游标签的 opacity，都必须在注入之前采。
const baseline = await evaluate(`(async () => {
  ${HELPERS}
  await new Promise((r) => setTimeout(r, 300));
  return { geo: geometry(), upstream: upstreamOpacity(),
    scrollTop: scrollerEl().scrollTop,
    kinds: rowsOf().reduce((acc, el) => {
      const k = el.getAttribute('data-chat-flow-kind') ?? '(null)';
      acc[k] = (acc[k] ?? 0) + 1; return acc;
    }, {}) };
})()`)
console.log('[baseline]', JSON.stringify({ ...baseline, geo: { count: baseline.geo.count, scrollHeight: baseline.geo.scrollHeight } }))

// hover 匹配上了，上游标签就该全部藏着。不是的话说明选择器选空了或上游改了规则，
// 「装载后是 1」这条断言测不出任何东西，会在功能完全没生效的情况下报绿。
const baseZero = baseline.upstream.opacity['0'] ?? 0
if (baseZero !== baseline.upstream.count) {
  abort(
    `装载前上游时间标签不是全部 opacity=0（${JSON.stringify(baseline.upstream)}）——常驻断言会假通过。`,
    `hover 匹配情况见上面的 [media]。若 hover 为真而这里仍是 1，说明上游那条隐藏规则或类名片段变了。`,
  )
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
const NONCE = Date.now()

const boot = `
(() => {
  const BUNDLE = ${JSON.stringify(bundle)};
  const real = window.__ModuleLoader__;
  let captured = null;
  window.__ModuleLoader__ = { load: (r) => { captured = r } };
  try { (0, eval)(BUNDLE) } finally { window.__ModuleLoader__ = real }
  if (captured === null) return { ok: false, reason: 'bundle did not register' };
  const exports = captured.factory((name) => { throw new Error('unexpected external require: ' + name) });
  const disposers = [];
  const ctx = {
    effect: (cb) => { const d = cb(); if (typeof d === 'function') disposers.push(d) },
    workspaces: new Proxy({}, { get: () => () => Promise.resolve(undefined) }),
    sessions: new Proxy({}, { get: () => () => Promise.resolve(undefined) }),
    // 这个脚本验的是时间戳，右键菜单一个都不开，locale 只需让 apply() 走得通：
    // register 收下词典，bind 出的 t 原样返回键名。菜单文案的断言在 verify-live.mjs。
    locale: { register: () => () => {}, bind: () => (key) => key },
  };
  exports.apply(ctx);
  window.__dshOiTsTest__ = { exports, disposers, nonce: ${NONCE} };
  return { ok: true, id: captured.id, disposers: disposers.length };
})()
`
const applied = await evaluate(boot)
console.log('[boot]', JSON.stringify(applied))
if (applied.ok !== true) abort('client bundle 注入失败', JSON.stringify(applied))

/**
 * 确认页面里仍然是本次注入的那个实例。共享的常驻 Chrome 上别人会并发 `Page.reload`，
 * 把本次 apply 的实例连同执行上下文冲掉；此时后续断言得出的结论与被测代码无关，
 * **必须中止而不是记 FAIL**。
 */
async function assertSameContext(stage) {
  const alive = await evaluate(`(() => ({
    nonce: window.__dshOiTsTest__ === undefined ? null : window.__dshOiTsTest__.nonce,
    handle: typeof window.__dshOperationImprove__,
  }))()`)
  if (alive.nonce !== NONCE) {
    abort(
      `页面在测试中途被重新加载（${stage}），本次注入的实例已不在——实测未发生。`,
      `观测：期望 nonce=${NONCE}，实际 ${JSON.stringify(alive)}\n处理：串行跑，或给本脚本一个独占的 Chrome 实例后重跑。`,
    )
  }
}

const { check, report } = createChecker()

await runChecks({ evaluate, check, baseline, needRows: NEED_ROWS })

// 覆盖度：真实页面上出得来哪些 kind 不由脚本决定，显式报出来而不是假装全测了。
// 没出现的 kind **不记 skip**——它们不在本轮的断言计划里，记 skip 会让脚本永远
// 非零退出；缺口写进 README 的已知限制。
const coverage = await evaluate(`(() => {
  ${HELPERS}
  const seen = {};
  for (const row of rowsOf()) {
    const k = row.getAttribute('data-chat-flow-kind') ?? '(null)';
    seen[k] = (seen[k] ?? 0) + 1;
  }
  return seen;
})()`)
const ALL_KINDS = [
  'user', 'steering', 'assistant-step', 'tool-call', 'context', 'compaction',
  'manual-compaction', 'command', 'command-input', 'model-retry', 'turn-error',
  'turn-max-tokens', 'turn-tail', 'workflow-run', 'agent-teams', 'unknown',
]
console.log('[coverage] seen:', JSON.stringify(coverage))
console.log('[coverage] not exercised:', JSON.stringify(ALL_KINDS.filter((k) => coverage[k] === undefined)))

await checkDispose({ evaluate, check, baseline, assertSameContext })

conn.ws.close()
report()
