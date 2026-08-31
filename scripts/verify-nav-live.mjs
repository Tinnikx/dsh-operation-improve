/**
 * 功能 3 的实测驱动：把构建出的 client bundle 注入运行中的 DSH 页面，在**真实
 * 会话页**上断言导航列的刻度、空闲静止、淡入、tooltip、点击定位、高亮跟随与
 * 卸载回收。
 *
 * CDP 连接与判据框架来自 [lib/cdp.mjs](lib/cdp.mjs)，与 `verify-live.mjs` 共用：
 * `check(label, value, expect)` 的 `expect` 返回 `true` 为 PASS、返回字符串为失败
 * 原因，`failed + skipped > 0` 即非零退出。
 *
 * 前置检查是响亮失败而不是跳过：功能 3 要求页面**已经打开一个会话页**且 user
 * 起点 ≥2，首页 hero 态一条 user 行都没有，此时每条断言都会退化成「没东西可测」。
 * 那不是通过，是没测，直接非零退出并点名「实测未发生」。
 *
 * 用法：node scripts/verify-nav-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过 Page.reload（页面已就绪时省 10 秒）。
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

/** 跑满全部断言所需的最小起点数：增删与高亮跟随都要 ≥2 条才有意义。 */
const NEED_ANCHORS = 2
/** 侧边栏折叠的宽度阈值，与 verify-live.mjs 一致。 */
const NEED_WIDTH = 1200
/** 点击定位后起点距容器顶部的空隙，与 src/start-nav/index.js 的 SCROLL_MARGIN 对齐。 */
const SCROLL_MARGIN = 16
/** 列离锚点右缘的空隙占参照边的比例，与 src/start-nav/index.js 的 RIGHT_RATIO 对齐。 */
const RIGHT_RATIO = 0.02
/** 临时把外壳右侧详情列撑到多宽——数值不重要，重要的是列必须左移同样多。 */
const PANEL_WIDTH = 360

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

if (process.env.DSH_OI_NO_RELOAD !== '1') await reloadAndWait(conn)

// 展开工作区并挑一个消息够多的会话打开：hero 态里没有任何 user 行。
const opened = await evaluate(`(async () => {
  for (const r of document.querySelectorAll('[role="treeitem"]')) {
    if (String(r.className).includes('_projectRow') && r.getAttribute('aria-expanded') === 'false') r.click()
  }
  await new Promise((r) => setTimeout(r, 1500))
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'))
  const tried = []
  for (const row of rows) {
    row.click()
    await new Promise((r) => setTimeout(r, 3500))
    const n = document.querySelectorAll('[data-conversation-scroll] [class*="_userRow"]').length
    tried.push({ title: row.textContent.slice(0, 26), userRows: n })
    if (n >= ${NEED_ANCHORS}) return { title: row.textContent.slice(0, 40), userRows: n, tried: tried.length }
  }
  return { title: null, userRows: 0, tried: tried.length, detail: tried.slice(0, 6) }
})()`)
console.log('[session]', JSON.stringify(opened))

// ---- 前置检查：会话页真的打开了吗，起点够不够 ------------------------------
// 不满足就中止，不是跳过：断言退化成「没东西可测」时报绿是最坏的结果。
const viewport = await evaluate(`(() => {
  const scroller = document.querySelector('[data-conversation-scroll]')
  const rows = scroller === null ? [] : [...scroller.querySelectorAll('[class*="_userRow"]')]
    .filter((el) => !el.hasAttribute('data-pending-steering'))
  return { width: innerWidth, height: innerHeight, hasScroller: scroller !== null,
    scrollHeight: scroller ? scroller.scrollHeight : 0,
    clientHeight: scroller ? scroller.clientHeight : 0, userRows: rows.length }
})()`)
console.log('[preflight]', JSON.stringify(viewport))

if (viewport.width < NEED_WIDTH) {
  abort(
    `窗口太窄（innerWidth=${viewport.width}），侧边栏折叠，点不开会话——实测未发生。`,
    '处理：用 --window-size=1600,1000 重起 Chrome 实例后再跑，见 README「验证」。',
  )
}
if (!viewport.hasScroller) {
  abort(
    '页面上没有 [data-conversation-scroll]，会话页没打开——实测未发生。',
    '处理：确认该 profile 下有会话，且脚本能点开侧边栏里的会话行。',
  )
}
if (viewport.userRows < NEED_ANCHORS) {
  abort(
    `会话页只有 ${viewport.userRows} 条 user 起点（需 ≥${NEED_ANCHORS}）——全部断言都会退化成「没东西可测」，拒绝以「跳过」收场。`,
    `观测：${JSON.stringify(opened)}\n处理：该 profile 下需要至少一个含 ≥${NEED_ANCHORS} 条 user 消息的会话。`,
  )
}
if (viewport.scrollHeight <= viewport.clientHeight) {
  abort(
    `会话内容没有超出视口（scrollHeight=${viewport.scrollHeight} <= clientHeight=${viewport.clientHeight}），点击定位与高亮跟随无从观测——实测未发生。`,
    '处理：换一个更长的会话。',
  )
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
/** 本次运行的标记：用来识别页面是否被别人中途重载掉。 */
const NONCE = Date.now()

const boot = `
(() => {
  const BUNDLE = ${JSON.stringify(bundle)};
  // 同一页面上可能残留上一次运行留下的实例（脚本崩在中途，或别人并发跑过）。
  // 不清掉，dispose 一类的断言就会打在别人的 DOM 上，得出与被测代码无关的结论。
  // 样式表必须一并清掉：崩在半路的运行不会跑 disposer，它插的那张
  // style[data-plugin] 会留在 head 里，而 dispose 断言是全局计数的，
  // 下一轮就会把这张孤儿样式表报成「本次没清干净」——与被测代码无关的假失败。
  for (const el of document.querySelectorAll('.dsh-oi-nav')) el.remove()
  for (const el of document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]')) el.remove()
  if (window.__dshOiNavTest__ !== undefined) {
    window.__dshOiNavTest__.disposers.forEach((d) => { try { d() } catch (error) { void error } })
    delete window.__dshOiNavTest__
  }
  const real = window.__ModuleLoader__
  let captured = null
  window.__ModuleLoader__ = { load: (r) => { captured = r } }
  try { (0, eval)(BUNDLE) } finally { window.__ModuleLoader__ = real }
  if (captured === null) return { ok: false, reason: 'bundle did not register' }
  // bundle 的 factory 顶层会 require 加载器 seed 表里的模块——功能 6 的
  // \`writeClipboard\` 就住在 ui-primitives 里，而 apply() 会把功能 6 一并装上。
  // 页面真实的 \`__ModuleLoader__\` 不对外交出 require（只有 load / create），所以
  // 这里给一份最小替身。**导航列的断言全程碰不到它**，真被调用就抛，免得悄悄
  // 退化成「注入的实例和页面用的不是同一份实现」这种测不出来的差异。
  // 白名单之外的 external 仍然直接抛：那说明 bundle 多了一条没预料到的依赖。
  const SEEDED = {
    '@deepseek-ai/dsh-client-ui-primitives': {
      writeClipboard: () => { throw new Error('verify-nav: 导航列断言不该走到剪贴板路径') },
    },
  }
  const exports = captured.factory((name) => {
    const seeded = SEEDED[name]
    if (seeded === undefined) throw new Error('unexpected external require: ' + name)
    return seeded
  })
  const disposers = []
  const ctx = {
    effect: (cb) => { const d = cb(); if (typeof d === 'function') disposers.push(d) },
    workspaces: new Proxy({}, { get: () => () => Promise.resolve(undefined) }),
    sessions: new Proxy({}, { get: () => () => Promise.resolve(undefined) }),
    // 这个脚本验的是导航列，右键菜单一个都不开，locale 只需让 apply() 走得通：
    // register 收下词典，bind 出的 t 原样返回键名。菜单文案的断言在 verify-live.mjs。
    locale: { register: () => () => {}, bind: () => (key) => key },
  }
  exports.apply(ctx)
  window.__dshOiNavTest__ = { exports, disposers, nonce: ${NONCE} }
  return { ok: true, id: captured.id, disposers: disposers.length }
})()
`
const applied = await evaluate(boot)
console.log('[boot]', JSON.stringify(applied))
if (applied.ok !== true) abort('client bundle 注入失败', JSON.stringify(applied))

/**
 * 确认页面里仍然是本次注入的那个实例。
 *
 * 共享的常驻 Chrome 上别人会并发 `Page.reload`，把本次 apply 的实例连同整个
 * 执行上下文冲掉。此时后续断言查到的是空页面或别人的残留 DOM，会得出「刻度
 * 归零」「dispose 没清干净」这类与被测代码毫无关系的结论。**这种情况必须中止
 * 而不是记为 FAIL**：把环境问题写成功能缺陷，比不测更糟。
 */
async function assertSameContext(stage) {
  const alive = await evaluate(`(() => ({
    nonce: window.__dshOiNavTest__ === undefined ? null : window.__dshOiNavTest__.nonce,
    handle: typeof window.__dshOperationImprove__,
  }))()`)
  if (alive.nonce !== NONCE) {
    abort(
      `页面在测试中途被重新加载（${stage}），本次注入的实例已不在——实测未发生。`,
      `观测：期望 nonce=${NONCE}，实际 ${JSON.stringify(alive)}\n` +
      '原因：共享的常驻 Chrome 上有并发的验证脚本在 Page.reload。\n' +
      '处理：串行跑，或给本脚本一个独占的 Chrome 实例后重跑。',
    )
  }
}

const { check, report } = createChecker()

check('ticks built from user rows', await evaluate(`(async () => {
  await new Promise((r) => setTimeout(r, 400))
  const nav = document.querySelector('.dsh-oi-nav')
  if (nav === null) return { navPresent: false }
  const snap = window.__dshOperationImprove__.startNav.snapshot()
  const domRows = document.querySelectorAll('[data-conversation-scroll] [class*="_userRow"]:not([data-pending-steering])').length
  return { navPresent: true, navCount: document.querySelectorAll('.dsh-oi-nav').length,
    ticks: nav.querySelectorAll('.dsh-oi-nav__tick').length,
    snapshotCount: snap.count, domUserRows: domRows,
    firstSummary: snap.summaries[0]?.slice(0, 40) ?? null }
})()`), (v) => {
  if (v.navPresent !== true) return '导航列没挂上（.dsh-oi-nav 不存在）'
  if (v.navCount !== 1) return `页面上有 ${v.navCount} 个导航列，应当恰好 1 个`
  if (v.domUserRows < NEED_ANCHORS) return `DOM 里只有 ${v.domUserRows} 条 user 行`
  if (v.ticks !== v.domUserRows) return `刻度 ${v.ticks} 条 != user 行 ${v.domUserRows} 条`
  if (v.snapshotCount !== v.domUserRows) return `snapshot ${v.snapshotCount} != user 行 ${v.domUserRows}`
  if (typeof v.firstSummary !== 'string' || v.firstSummary.length === 0) return '首条摘要为空'
  return true
})

// 空闲状态下导航列不得自己重建。判据是 captain 给的验收标准，不是人工看：
// 注入后空闲 3 秒，nav 子树 childList 变更 <=2 且新增 tick 节点 ==0，且 3 秒前后
// 第一个 tick 是同一个对象且仍在文档里，刻度数恒等于 DOM user 行数（不得为 2 倍）。
// 自激环的表现极隐蔽——刻度条数看起来完全正常，但 hover、focus 与 transition
// 每帧被打断，那是交互正确性问题，不是「多跑几次」的性能问题。
check('idle: no self-triggered rebuild', await evaluate(`(async () => {
  const nav = document.querySelector('.dsh-oi-nav')
  if (nav === null) return { navPresent: false }
  const first = nav.querySelector('.dsh-oi-nav__tick')
  let navChildListMutations = 0
  let tickNodesAdded = 0
  const obs = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type !== 'childList') continue
      navChildListMutations += 1
      for (const n of r.addedNodes) {
        if (n.classList !== undefined && n.classList.contains('dsh-oi-nav__tick')) tickNodesAdded += 1
      }
    }
  })
  obs.observe(nav, { childList: true, subtree: true })
  await new Promise((r) => setTimeout(r, 3000))
  obs.disconnect()
  const later = nav.querySelector('.dsh-oi-nav__tick')
  return { navPresent: true, idleMs: 3000, navChildListMutations, tickNodesAdded,
    visibleTicks: nav.querySelectorAll('.dsh-oi-nav__tick').length,
    domUserRows: document.querySelectorAll('[data-conversation-scroll] [class*="_userRow"]:not([data-pending-steering])').length,
    sameTickIdentity: first === later, firstStillConnected: first !== null && first.isConnected }
})()`), (v) => {
  if (v.navPresent !== true) return '导航列不存在'
  if (v.navChildListMutations > 2) {
    return `空闲 3s 内 nav 子树发生 ${v.navChildListMutations} 次 childList 变更（上限 2），导航列在自己重建`
  }
  if (v.tickNodesAdded !== 0) {
    return `空闲 3s 内新增了 ${v.tickNodesAdded} 个刻度节点，应为 0`
  }
  if (v.sameTickIdentity !== true) return '3s 前后第一个刻度不是同一个对象——刻度身份被替换，hover/focus/transition 会被打断'
  if (v.firstStillConnected !== true) return '首个刻度已脱离文档'
  if (v.visibleTicks !== v.domUserRows) {
    return `刻度 ${v.visibleTicks} 个 != DOM user 行 ${v.domUserRows} 个（2 倍即为重复 append 或存在残留实例）`
  }
  return true
})

// 淡入的判据里带上 pointer-events：容器**任何时候都不接事件**，可点的只有刻度，
// 且只在可见时可点。列压在会话正文上，容器可点就是在正文上盖一条吞掉点击与文本
// 选中的透明带——那种缺陷肉眼看不出来，只能靠这条断言拦。
check('hidden until right edge hover', await evaluate(`(async () => {
  const nav = document.querySelector('.dsh-oi-nav')
  if (nav === null) return { navPresent: false }
  const tick = nav.querySelector('.dsh-oi-nav__tick')
  const cs = () => getComputedStyle(nav)
  const tickPe = () => (tick === null ? null : getComputedStyle(tick).pointerEvents)
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 400, bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  const far = { opacity: cs().opacity, visible: nav.hasAttribute('data-visible'),
    pointerEvents: cs().pointerEvents, tickPointerEvents: tickPe() }
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth - 10, clientY: 400, bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  const near = { opacity: cs().opacity, visible: nav.hasAttribute('data-visible'),
    pointerEvents: cs().pointerEvents, tickPointerEvents: tickPe() }
  return { navPresent: true, far, near }
})()`), (v) => {
  if (v.navPresent !== true) return '导航列不存在'
  if (v.far.visible !== false) return '鼠标远离右边缘时仍带 data-visible'
  if (Number(v.far.opacity) !== 0) return `远离时 opacity=${v.far.opacity}，应为 0`
  if (v.far.pointerEvents !== 'none') return `远离时容器 pointer-events=${v.far.pointerEvents}，应为 none`
  if (v.far.tickPointerEvents !== 'none') return `远离时刻度 pointer-events=${v.far.tickPointerEvents}，应为 none`
  if (v.near.visible !== true) return '鼠标贴近右边缘时没有 data-visible'
  if (Number(v.near.opacity) !== 1) return `贴近时 opacity=${v.near.opacity}，应为 1`
  if (v.near.pointerEvents !== 'none') return `贴近时容器 pointer-events=${v.near.pointerEvents}，应恒为 none（可点的只有刻度）`
  if (v.near.tickPointerEvents !== 'auto') return `贴近时刻度 pointer-events=${v.near.tickPointerEvents}，应为 auto`
  return true
})

// ---- 被别的界面盖住时不点亮 ------------------------------------------------
// 设置面板盖在会话区上的是一层 fixed 全屏遮罩，而导航列的 z-index 在它之上；
// 不挡一道，鼠标一贴右边缘列就浮在设置面板上面。两种时序各测一遍，缺一条都盖不全：
// 先开页再移过去（命中测试走 pointermove 那条路），以及**人已经悬在列上、页从底下
// 弹出来**（鼠标不动，只能靠 MutationObserver 那条路径收起）。
//
// 面板必须用 CDP 发真实点击打开：实测页面内 `el.click()` 之后触发器的
// `aria-expanded` 仍是 false、面板不出现，那样这条断言会在浮层根本没打开的情况下
// 报绿——测的是「没有浮层时列照常点亮」，与要防的缺陷无关。
const SETTINGS_TRIGGER = `[...document.querySelectorAll('button')].find((b) => b.className.includes('_trigger') && b.getAttribute('aria-haspopup') === 'dialog')`

/** 用 CDP 在元素中心发一次真实鼠标点击；元素不存在返回 false。 */
async function realClick(expr) {
  const at = await evaluate(`(() => {
    const el = ${expr}
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }
  })()`)
  if (at === null) return false
  const base = { x: at.x, y: at.y, button: 'left', clickCount: 1, pointerType: 'mouse' }
  await conn.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 })
  await new Promise((r) => setTimeout(r, 100))
  await conn.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed', buttons: 1 })
  await new Promise((r) => setTimeout(r, 60))
  await conn.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased', buttons: 0 })
  await new Promise((r) => setTimeout(r, 1500))
  return true
}

/** 把鼠标移进热区（合成事件即可：命中测试读的是几何，不是真实指针位置），再读状态。 */
const hoverAndRead = async () => evaluate(`(async () => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 400, bubbles: true }))
  await new Promise((r) => setTimeout(r, 120))
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth - 10, clientY: 400, bubbles: true }))
  await new Promise((r) => setTimeout(r, 300))
  const nav = document.querySelector('.dsh-oi-nav')
  const tick = nav === null ? null : nav.querySelector('.dsh-oi-nav__tick')
  return {
    visible: nav === null ? null : nav.hasAttribute('data-visible'),
    opacity: nav === null ? null : getComputedStyle(nav).opacity,
    tickPointerEvents: tick === null ? null : getComputedStyle(tick).pointerEvents,
    covered: window.__dshOperationImprove__.startNav.snapshot().covered,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }
})()`)

await assertSameContext('遮挡断言之前')
const beforeOverlay = await hoverAndRead()
// 悬停状态原样留着，接下来开面板时**不动鼠标**——要验的就是这种时序。
const openedPanel = await realClick(SETTINGS_TRIGGER)
const whileHovering = await evaluate(`(() => {
  const nav = document.querySelector('.dsh-oi-nav')
  return {
    visible: nav === null ? null : nav.hasAttribute('data-visible'),
    opacity: nav === null ? null : getComputedStyle(nav).opacity,
    covered: window.__dshOperationImprove__.startNav.snapshot().covered,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  }
})()`)
const whileOverlay = await hoverAndRead()
await conn.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await conn.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
await new Promise((r) => setTimeout(r, 1200))
const afterOverlay = await hoverAndRead()

check('stays hidden while a page covers the conversation', {
  openedPanel, beforeOverlay, whileHovering, whileOverlay, afterOverlay,
}, (v) => {
  if (v.openedPanel !== true) return '找不到设置面板的触发器（aria-haspopup="dialog"）——实测未发生'
  if (v.beforeOverlay.dialogs !== 0) return `基线上已经有 ${v.beforeOverlay.dialogs} 个浮层，测不出差别`
  if (v.beforeOverlay.visible !== true) return '基线：贴近右边缘没有点亮导航列'
  if (v.beforeOverlay.covered !== false) return '基线：无浮层时 covered 却为 true'
  if (v.whileOverlay.dialogs < 1) return '设置面板没有真的打开（role=dialog 为 0）——实测未发生'
  if (v.whileHovering.visible !== false) return '面板从悬停中的列底下弹出来，列没有收起（鼠标不动那条时序漏了）'
  if (Number(v.whileHovering.opacity) !== 0) return `面板弹出后 opacity=${v.whileHovering.opacity}，应为 0`
  if (v.whileHovering.covered !== true) return '面板弹出后 covered 仍为 false'
  if (v.whileOverlay.visible !== false) return '面板打开时贴近右边缘仍点亮了导航列'
  if (Number(v.whileOverlay.opacity) !== 0) return `面板打开时 opacity=${v.whileOverlay.opacity}，应为 0`
  if (v.whileOverlay.tickPointerEvents !== 'none') return `面板打开时刻度 pointer-events=${v.whileOverlay.tickPointerEvents}，应为 none`
  if (v.afterOverlay.dialogs !== 0) return `Esc 之后仍有 ${v.afterOverlay.dialogs} 个浮层，恢复分支没测到`
  if (v.afterOverlay.visible !== true) return '面板关掉之后贴近右边缘不再点亮——收起没有恢复'
  if (v.afterOverlay.covered !== false) return '面板关掉之后 covered 仍为 true'
  return true
})

// 上一条用的设置面板带 `role="dialog"`，光看那一条分不出判据是命中测试还是 role
// 属性。而快捷键速查表那种浮层**没有任何 dialog 语义**（实测只有一层 z=1000 的
// `dyn-kbd-palette-backdrop`），认 role 就漏。这里插一个无语义的全屏 fixed 层复现
// 那种形态：它来自本脚本而不是另一个插件，所以这条断言不吃「那个插件装没装」。
check('stays hidden under a cover with no dialog semantics', await evaluate(`(async () => {
  const nav = document.querySelector('.dsh-oi-nav')
  if (nav === null) return { navPresent: false }
  const read = () => ({
    visible: nav.hasAttribute('data-visible'),
    opacity: getComputedStyle(nav).opacity,
    covered: window.__dshOperationImprove__.startNav.snapshot().covered,
    dialogs: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length,
  })
  const hover = async () => {
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 100, clientY: 400, bubbles: true }))
    await new Promise((r) => setTimeout(r, 120))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: window.innerWidth - 10, clientY: 400, bubbles: true }))
    await new Promise((r) => setTimeout(r, 300))
    return read()
  }
  const before = await hover()
  const cover = document.createElement('div')
  // z-index 抄上游浮层实测的 1000：导航列是 2147482000，这一层压根盖不住它的
  // 绘制顺序——命中测试读的是元素栈而不是谁画在上面，这正是要验的。
  cover.style.cssText = 'position:fixed;inset:0;z-index:1000;background:rgba(0,0,0,.4)'
  cover.id = 'dsh-oi-verify-cover'
  document.body.append(cover)
  await new Promise((r) => setTimeout(r, 400))
  const under = await hover()
  cover.remove()
  await new Promise((r) => setTimeout(r, 400))
  const after = await hover()
  return { navPresent: true, before, under, after }
})()`), (v) => {
  if (v.navPresent !== true) return '导航列不存在'
  if (v.before.visible !== true) return '基线：贴近右边缘没有点亮导航列'
  if (v.before.covered !== false) return '基线：无覆盖层时 covered 却为 true'
  if (v.under.dialogs !== 0) return `覆盖层期间页面上有 ${v.under.dialogs} 个带 dialog 语义的节点，这条就退化成了上一条`
  if (v.under.covered !== true) return '无 dialog 语义的全屏覆盖层没有被认出来（covered 仍为 false）'
  if (v.under.visible !== false) return '覆盖层挡着时贴近右边缘仍点亮了导航列'
  if (Number(v.under.opacity) !== 0) return `覆盖层挡着时 opacity=${v.under.opacity}，应为 0`
  if (v.after.covered !== false) return '移除覆盖层后 covered 仍为 true'
  if (v.after.visible !== true) return '移除覆盖层后贴近右边缘不再点亮——收起没有恢复'
  return true
})

// 列贴的是会话视图 `_viewArea` 的右缘，不是窗口右缘：外壳是三列 grid，别的插件
// 展开右侧详情列时会话区整体左移，按窗口定位的列会被压在面板底下。真实页面上没有
// 第二个插件可以驱动这件事，所以直接改外壳那一行 inline——**这正是真实的展开方式**，
// 顺带证明它一条 mutation 都不打出来，跟随只能挂在锚点的 ResizeObserver 上。
// 复原写回原字符串而不是清空：轨道宽度由 inline 驱动，清掉等于把外壳布局也清掉。
check('column tracks the view area, not the window edge', await evaluate(`(async () => {
  const nav = document.querySelector('.dsh-oi-nav')
  const area = document.querySelector('[class*="_viewArea"]')
  const frame = document.querySelector('[class*="_frame"]')
  if (nav === null || area === null || frame === null) {
    return { skipped: \`量不到必需的节点：nav=\${nav !== null} viewArea=\${area !== null} frame=\${frame !== null}\` }
  }
  const tracks = getComputedStyle(frame).gridTemplateColumns.split(/\\s+/)
  if (tracks.length !== 3) return { skipped: \`外壳 grid 有 \${tracks.length} 条轨道，不是预期的三列\` }
  const saved = frame.getAttribute('style')
  const edge = document.documentElement.clientWidth
  const before = { nav: nav.getBoundingClientRect().right, area: area.getBoundingClientRect().right }

  let mutations = 0
  const spy = new MutationObserver((records) => { mutations += records.length })
  spy.observe(document.body, { childList: true, subtree: true })
  frame.style.gridTemplateColumns = \`\${tracks[0]} minmax(0px, 1fr) ${PANEL_WIDTH}px\`
  await new Promise((r) => setTimeout(r, 600))
  spy.disconnect()
  const open = { nav: nav.getBoundingClientRect().right, area: area.getBoundingClientRect().right }

  frame.setAttribute('style', saved)
  await new Promise((r) => setTimeout(r, 600))
  const after = { nav: nav.getBoundingClientRect().right, area: area.getBoundingClientRect().right }
  return { edge, innerWidth: window.innerWidth, before, open, after, mutations, panel: ${PANEL_WIDTH},
    gapBefore: before.area - before.nav, gapOpen: open.area - open.nav, expectGap: edge * ${RIGHT_RATIO} }
})()`), (v) => {
  if (Math.abs(v.gapBefore - v.expectGap) > 1) {
    return `列离会话视图右缘 ${v.gapBefore.toFixed(1)}px，期望 ${v.expectGap.toFixed(1)}px`
  }
  const areaShift = v.before.area - v.open.area
  if (Math.abs(areaShift - v.panel) > 1) return `展开详情列后会话视图只左移了 ${areaShift}px，期望 ${v.panel}px`
  const navShift = v.before.nav - v.open.nav
  if (Math.abs(navShift - v.panel) > 1) return `会话视图左移 ${areaShift}px，导航列只跟了 ${navShift}px`
  if (Math.abs(v.gapOpen - v.gapBefore) > 1) return `空隙从 ${v.gapBefore.toFixed(1)}px 变成 ${v.gapOpen.toFixed(1)}px`
  if (v.mutations !== 0) return `展开动作打出了 ${v.mutations} 条 mutation，跟随可能是被 rebuild 带出来的假通过`
  if (Math.abs(v.after.nav - v.before.nav) > 1) return `收起后列没回到原位（${v.after.nav} vs ${v.before.nav}）`
  return true
})

check('tooltip on tick hover', await evaluate(`(async () => {
  const nav = document.querySelector('.dsh-oi-nav')
  if (nav === null) return { navPresent: false }
  const ticks = [...nav.querySelectorAll('.dsh-oi-nav__tick')]
  if (ticks.length < 2) return { navPresent: true, tooFew: ticks.length }
  const tick = ticks[1]
  const label = tick.getAttribute('aria-label')
  tick.dispatchEvent(new PointerEvent('pointerenter', { bubbles: false }))
  await new Promise((r) => setTimeout(r, 200))
  const tip = nav.querySelector('.dsh-oi-nav__tip')
  const shown = { open: tip.hasAttribute('data-open'), opacity: getComputedStyle(tip).opacity, text: tip.textContent }
  tick.dispatchEvent(new PointerEvent('pointerleave', { bubbles: false }))
  await new Promise((r) => setTimeout(r, 200))
  return { navPresent: true, shown, afterLeave: { open: tip.hasAttribute('data-open'), opacity: getComputedStyle(tip).opacity },
    ariaLabel: label, matchesLabel: tip.textContent === label }
})()`), (v) => {
  if (v.navPresent !== true) return '导航列不存在'
  if (v.tooFew !== undefined) return `只有 ${v.tooFew} 个刻度，测不了 hover`
  if (v.shown.open !== true) return 'hover 后 tooltip 没有 data-open'
  if (Number(v.shown.opacity) !== 1) return `hover 后 tooltip opacity=${v.shown.opacity}，应为 1`
  if (typeof v.shown.text !== 'string' || v.shown.text.length === 0) return 'tooltip 文本为空'
  if (v.matchesLabel !== true) return `tooltip 文本与 aria-label 不一致（tip=${v.shown.text} label=${v.ariaLabel}）`
  if (Number(v.afterLeave.opacity) !== 0) return `离开后 tooltip opacity=${v.afterLeave.opacity}，应为 0`
  return true
})

await assertSameContext('click scrolls to that start 之前')
check('click scrolls to that start', await evaluate(`(async () => {
  const scroller = document.querySelector('[data-conversation-scroll]')
  const nav = document.querySelector('.dsh-oi-nav')
  if (nav === null || scroller === null) return { navPresent: nav !== null, scroller: scroller !== null }
  const ticks = [...nav.querySelectorAll('.dsh-oi-nav__tick')]
  const rows = [...scroller.querySelectorAll('[class*="_userRow"]:not([data-pending-steering])')]
  if (ticks.length === 0) return { navPresent: true, scroller: true, noTicks: true }
  scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' })
  await new Promise((r) => setTimeout(r, 300))
  const before = scroller.scrollTop
  ticks[0].click()
  // smooth 滚动的时长随距离变化（跨 ~13000px 要 1.4s），固定等待会采到中途值，
  // 所以轮询到 scrollTop 连续三次不变为止。
  let last = -1, settled = 0, waited = 0
  while (settled < 3 && waited < 8000) {
    await new Promise((r) => setTimeout(r, 150)); waited += 150
    if (scroller.scrollTop === last) settled += 1; else { settled = 0; last = scroller.scrollTop }
  }
  const after = scroller.scrollTop
  const offset = rows[0].getBoundingClientRect().top - scroller.getBoundingClientRect().top
  return { navPresent: true, scroller: true, before, after, settleMs: waited,
    moved: after !== before, targetOffsetFromTop: Math.round(offset) }
})()`), (v) => {
  if (v.navPresent !== true || v.scroller !== true) return '导航列或滚动容器不存在'
  if (v.noTicks === true) return '没有刻度可点'
  if (v.moved !== true) return `点击后 scrollTop 纹丝不动（${v.before}）`
  // 容差 4px 而不是「大概到顶就行」：scrollTo 落点是算出来的确定值，
  // 放宽容差会让「滚过头一屏」这类真缺陷照样通过。
  if (Math.abs(v.targetOffsetFromTop - SCROLL_MARGIN) > 4) {
    return `目标起点没落到容器顶部：距顶 ${v.targetOffsetFromTop}px，期望 ${SCROLL_MARGIN}±4`
  }
  return true
})

check('active tick follows scroll', await evaluate(`(async () => {
  const scroller = document.querySelector('[data-conversation-scroll]')
  const nav = document.querySelector('.dsh-oi-nav')
  if (nav === null || scroller === null) return { navPresent: nav !== null, scroller: scroller !== null }
  const handle = window.__dshOperationImprove__.startNav
  scroller.scrollTo({ top: 0, behavior: 'auto' })
  await new Promise((r) => setTimeout(r, 500))
  const atTop = handle.snapshot().active
  scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'auto' })
  await new Promise((r) => setTimeout(r, 500))
  const atBottom = handle.snapshot().active
  const flags = [...nav.querySelectorAll('.dsh-oi-nav__tick')].map((t) => t.hasAttribute('data-active'))
  return { navPresent: true, scroller: true, activeAtTop: atTop, activeAtBottom: atBottom,
    ticks: flags.length, activeCount: flags.filter(Boolean).length,
    exactlyOneActive: flags.filter(Boolean).length === 1,
    activeIsLast: flags[flags.length - 1] === true }
})()`), (v) => {
  if (v.navPresent !== true || v.scroller !== true) return '导航列或滚动容器不存在'
  if (v.ticks < NEED_ANCHORS) return `只有 ${v.ticks} 个刻度`
  if (v.activeAtBottom === -1) return '滚到底部时仍没有任何起点被高亮（active 恒为 -1）'
  if (v.activeAtBottom !== v.ticks - 1) return `滚到底部时 active=${v.activeAtBottom}，应为最后一个起点 ${v.ticks - 1}`
  if (v.exactlyOneActive !== true) return `底部时有 ${v.activeCount} 个刻度带 data-active，应恰好 1 个`
  if (v.activeIsLast !== true) return '底部时高亮的不是最后一个刻度'
  if (v.activeAtTop === v.activeAtBottom) return `滚到顶与滚到底 active 相同（${v.activeAtTop}），高亮没有跟随滚动`
  return true
})

await assertSameContext('rebuilds when user rows change 之前')
check('rebuilds when user rows change', await evaluate(`(async () => {
  const scroller = document.querySelector('[data-conversation-scroll]')
  if (scroller === null) return { scroller: false }
  const handle = window.__dshOperationImprove__.startNav
  const before = handle.snapshot().count
  // 造一条假的 user 行，观察 MutationObserver 是否把刻度加上去，再撤掉。
  const fake = document.createElement('div')
  fake.className = 'zzz_userRow'
  const bubble = document.createElement('div')
  bubble.className = 'zzz_bubble'
  bubble.textContent = 'dev2 synthetic start'
  fake.append(bubble)
  scroller.append(fake)
  await new Promise((r) => setTimeout(r, 600))
  const grown = handle.snapshot()
  fake.remove()
  await new Promise((r) => setTimeout(r, 600))
  const shrunk = handle.snapshot().count
  return { scroller: true, before, afterAdd: grown.count,
    addedSummary: grown.summaries[grown.summaries.length - 1] ?? null, afterRemove: shrunk }
})()`), (v) => {
  if (v.scroller !== true) return '滚动容器不存在'
  if (v.before < NEED_ANCHORS) return `起点只有 ${v.before} 条`
  if (v.afterAdd !== v.before + 1) return `插入一条 user 行后刻度 ${v.before}→${v.afterAdd}，应为 ${v.before + 1}`
  if (v.addedSummary !== 'dev2 synthetic start') return `新刻度摘要为 ${v.addedSummary}，应为注入的文本`
  if (v.afterRemove !== v.before) return `移除后刻度 ${v.afterRemove}，应回到 ${v.before}`
  return true
})

check('does not hijack page scrolling', await evaluate(`(async () => {
  const scroller = document.querySelector('[data-conversation-scroll]')
  const nav = document.querySelector('.dsh-oi-nav')
  if (scroller === null || nav === null) return { scroller: scroller !== null, navPresent: nav !== null }
  scroller.scrollTo({ top: 0, behavior: 'auto' })
  await new Promise((r) => setTimeout(r, 250))
  const start = scroller.scrollTop
  const evt = new WheelEvent('wheel', { deltaY: 400, bubbles: true, cancelable: true })
  scroller.dispatchEvent(evt)
  scroller.scrollTop = start + 400
  await new Promise((r) => setTimeout(r, 250))
  nav.removeAttribute('data-visible')
  return { scroller: true, navPresent: true, wheelDefaultPrevented: evt.defaultPrevented,
    scrolled: scroller.scrollTop - start, pointerEventsWhenHidden: getComputedStyle(nav).pointerEvents }
})()`), (v) => {
  if (v.scroller !== true || v.navPresent !== true) return '滚动容器或导航列不存在'
  if (v.wheelDefaultPrevented !== false) return 'wheel 事件被 preventDefault，劫持了原有滚动'
  if (v.scrolled !== 400) return `滚动量 ${v.scrolled}，应为 400`
  if (v.pointerEventsWhenHidden !== 'none') return `隐藏时 pointer-events=${v.pointerEventsWhenHidden}，会挡住页面点击`
  return true
})

await assertSameContext('rebuilds on session switch 之前')
check('rebuilds on session switch', await evaluate(`(async () => {
  const handle = window.__dshOperationImprove__.startNav
  const before = handle.snapshot()
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'))
  let switched = null
  for (const row of rows) {
    row.click()
    await new Promise((r) => setTimeout(r, 3200))
    const snap = handle.snapshot()
    if (snap.count > 0 && snap.summaries[0] !== before.summaries[0]) {
      switched = { title: row.textContent.slice(0, 30), snap }
      break
    }
  }
  return { beforeCount: before.count, beforeFirst: before.summaries[0]?.slice(0, 24) ?? null,
    switchedTo: switched?.title ?? null, afterCount: switched?.snap.count ?? 0,
    afterFirst: switched?.snap.summaries[0]?.slice(0, 24) ?? null,
    sessionRows: rows.length }
})()`), (v) => {
  if (v.sessionRows < 2) return `侧边栏只有 ${v.sessionRows} 条会话行，切不了会话`
  if (v.switchedTo === null) return '遍历完所有会话行都没能切到另一个有起点的会话，刻度可能没有随会话重建'
  if (v.afterCount < 1) return `切换后刻度数为 ${v.afterCount}，导航列归零了`
  if (v.afterFirst === null || v.afterFirst === v.beforeFirst) return '切换后首条摘要没变，刻度没跟着会话重建'
  return true
})

await assertSameContext('dispose removes nav 之前')
// 本插件全程只插**一张**样式表：`src/client/index.js` 把 MENU_CSS 与 NAV_CSS 拼在
// 一起插入，导航列不自插第二张（`src/start-nav/index.js` 只导出 NAV_CSS 字符串）。
// 所以这里数 `style[data-plugin]` 为 0 就是「这一张被回收了」，不存在把共享那张
// 误算进来的问题——真要分成两张才需要给导航列单独加标记。
check('dispose removes nav', await evaluate(`(() => {
  window.__dshOiNavTest__.disposers.forEach((d) => d())
  return { navs: document.querySelectorAll('.dsh-oi-nav').length,
    ticks: document.querySelectorAll('.dsh-oi-nav__tick').length,
    tips: document.querySelectorAll('.dsh-oi-nav__tip').length,
    styles: document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]').length,
    handle: typeof window.__dshOperationImprove__ }
})()`), (v) => {
  if (v.navs !== 0) return `dispose 后仍有 ${v.navs} 个导航列`
  if (v.ticks !== 0 || v.tips !== 0) return `dispose 后仍有 ${v.ticks} 个刻度、${v.tips} 个 tooltip`
  if (v.styles !== 0) return `dispose 后仍有 ${v.styles} 张本插件样式表（全插件共一张，含 MENU_CSS + NAV_CSS）`
  if (v.handle !== 'undefined') return '调试句柄没摘掉'
  return true
})

conn.ws.close()
report()
