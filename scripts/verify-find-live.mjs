/**
 * 功能 11 的端到端验证：在运行中的 DSH 页面上验证 `Ctrl`/`cmd` + `F` 页内查找。
 *
 * 不注入 bundle、不 apply 自造 ctx，验的是页面自带实例：本功能不调用任何 harness 服务，
 * 没有需要打桩的破坏性动作。
 *
 * 断言清单（19 条）：
 *  1. 页面有 find 句柄，snapshot 形状齐
 *  2. 真实 Ctrl+F 开条，且插件吃掉了这一次默认行为
 *  3. 命中数与脚本自己的 oracle 一致且 >0
 *  4. 高亮集与 snapshot 同数（`CSS.highlights` 两个名字都认领着）
 *  5. 当前项唯一，且它的文本与查询词只差大小写
 *  6. 活动项滚进了视口
 *  7. Enter → 下一条；8. Shift+Enter → 回上一条
 *  9. 连按 Enter 到端点后环绕回第一条
 * 10. **整轮没有产生一次 `childList` mutation**（高亮全靠 CSS，不动上游 DOM）
 * 11. 改词即重扫：总数与当前项都跟上新词
 * 12. token 真实存在（查找条底色与高亮色用的两枚）
 * 13. `Esc` 关条并摘掉两个高亮注册名
 * 14. 右键菜单开着时 `Esc` 让位给菜单（条留着），第二次才收条
 * 15. 折叠组里看不见的正文不计入命中（在 DOM 里 `raw>0`、可见口径 0、插件 0）
 * 16. 切会话后条留着、词条不变，高亮 Range 全部重挂到新 DOM 上且与 oracle 同数
 * 17. `find.dispose()` 后 Ctrl+F 的 `defaultPrevented === false`
 * 18. 清场：刷新后页面重新长出新实例、find 句柄在
 *
 * oracle 是脚本自己的一份 TreeWalker 扫描（[lib/find-page.mjs](lib/find-page.mjs)），不
 * 复用被测代码——命中数、折叠判据都由它独立算一遍。
 *
 * 用法：node scripts/verify-find-live.mjs [cdpPort] [pageUrlPrefix]，先 `stack:up`。
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过开头那次 Page.reload。
 *
 * 只能真 Electron 客户端手工确认、这里覆盖不到的：shell 层的 accelerator 抢键（CDP 的
 * `Input.dispatchKeyEvent` 不经 `before-input-event`）、`cmd` + `F`、观感。
 */
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'
import { PROBE_INSTALL, MUTATION_INSTALL, ORACLE_SOURCE, FIND_PAGE_HELPERS } from './lib/find-page.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

/** CDP `Input.dispatchKeyEvent` 的 modifiers 位：Ctrl=2，Shift=8。 */
const CTRL = 2
const SHIFT = 8

/** 发一次真实按键（按下 + 抬起）。 */
async function press(key, code, vk, modifiers = 0) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    const res = await conn.send('Input.dispatchKeyEvent', {
      type, key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    })
    if (res.error !== undefined) abort('Input.dispatchKeyEvent 失败', JSON.stringify(res.error))
  }
  await sleep(120)
}

async function typeText(text) {
  const res = await conn.send('Input.insertText', { text })
  if (res.error !== undefined) abort('Input.insertText 失败', JSON.stringify(res.error))
  await sleep(200)
}

/** 换查询词：先把输入框内容整段选中，再插新词（`insertText` 替换选区）。 */
async function setQuery(text) {
  const ok = await evaluate(`(() => {
    const el = document.querySelector('.dsh-oi-find__input')
    if (el === null) return false
    el.focus()
    el.select()
    return true
  })()`)
  if (!ok) abort('查找条的输入框不在', '这段断言需要条开着。')
  await typeText(text)
}

/** 真实右键（`el.click()` 不算：功能 2 的菜单判据是真实 contextmenu 事件）。 */
async function rightClick(x, y) {
  for (const [type, button, buttons] of [['mouseMoved', 'none', 0], ['mousePressed', 'right', 2], ['mouseReleased', 'right', 0]]) {
    const res = await conn.send('Input.dispatchMouseEvent', { type, x, y, button, buttons, clickCount: button === 'none' ? 0 : 1 })
    if (res.error !== undefined) abort('Input.dispatchMouseEvent 失败', JSON.stringify(res.error))
    await sleep(60)
  }
  await sleep(250)
}

const snapshot = () => evaluate(`window.__dshOperationImprove__?.find?.snapshot() ?? null`)

// ---- 环境准备 ----

if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
}
await conn.send('Page.enable')

const boot = await evaluate(`(() => {
  const h = window.__dshOperationImprove__
  if (h === undefined) return { fatal: 'no-handle' }
  const f = h.find
  const shape = f !== undefined && typeof f.dispose === 'function' && typeof f.open === 'function'
    && typeof f.snapshot === 'function'
  return { instanceId: h.instanceId, hasFind: shape, supported: shape ? f.snapshot().supported : false }
})()`)
if (boot.fatal !== undefined) {
  abort('页面上没有本插件的实例句柄', 'window.__dshOperationImprove__ 不存在：插件没装进 profile，或 apply 中途崩了（看页面 console）。')
}
if (!boot.hasFind) {
  abort('页面加载的是旧产物', '句柄里没有 find（或它缺 open/snapshot/dispose）。先 npm run build，再重跑。')
}
if (!boot.supported) {
  abort('这个运行时没有 CSS Custom Highlight API', '实测未发生：功能 11 在没有该 API 的运行时上主动不启用（不靠改 DOM 画高亮）。')
}

// 相位前提：插件的 keydown 挂在 window 捕获且在页面加载时注册，这里的探针后注册，
// 因此跑在它之后——读到的 defaultPrevented 就是插件的处理结果。
await evaluate(PROBE_INSTALL)
await evaluate(FIND_PAGE_HELPERS)

const { check, report } = createChecker()

// ---- 1：句柄形状 ----

const snap0 = await snapshot()
check('find 句柄存在且 snapshot 形状齐', snap0,
  (v) => (v !== null && 'open' in v && 'query' in v && 'total' in v && 'index' in v && 'activeText' in v)
    || `期望 { open, query, total, index, activeText, … }，实测 ${JSON.stringify(v)}`)

// ---- 挑一个能用的会话页：多轮、消息流有足量文本 ----

const listSessionRows = () => evaluate(`(() => {
  for (const r of document.querySelectorAll('[role="treeitem"]')) {
    if (String(r.className).includes('_projectRow') && r.getAttribute('aria-expanded') === 'false') r.click()
  }
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'))
    .filter((r) => !(r.textContent ?? '').includes('新会话'))
    .filter((r) => !__dshOiFindIsRunning(r))
  return rows.map((row) => ({ title: (row.textContent ?? '').trim().slice(0, 24) }))
})()`)

/** 点开第 index 条会话行（跳过「新会话」与运行中——流式追加会让命中数与 oracle 抢时序）。 */
const clickSessionRow = (index) => evaluate(`(() => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'))
    .filter((r) => !(r.textContent ?? '').includes('新会话'))
    .filter((r) => !__dshOiFindIsRunning(r))
  const row = rows[${index}]
  if (row === undefined) return false
  row.click()
  return (row.textContent ?? '').trim().slice(0, 30)
})()`)

/** 会话页落定判据：已渲染文本足够长，且两次读数一致。 */
const probeFlow = () => evaluate(`(() => {
  const rows = document.querySelectorAll('[data-chat-node-key], [data-chat-flow-key]')
  const text = __dshOiFindPageText()
  return { rows: rows.length, chars: text.length, hasComposer: document.querySelector('div[contenteditable="true"][role="textbox"]') !== null }
})()`)

let picked = null
{
  const rows = await listSessionRows()
  console.log(`[session-pick] ${rows.length} 行会话`)
  for (let i = 0; i < Math.min(rows.length, 12) && picked === null; i += 1) {
    if ((await clickSessionRow(i)) === false) break
    let prevChars = null
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await sleep(400)
      const flow = await probeFlow()
      if (flow.chars < 400) continue
      if (prevChars === flow.chars) { picked = flow; break }
      prevChars = flow.chars
    }
  }
}
if (picked === null) {
  abort('找不到「已渲染文本 ≥400 字且落定」的会话', '测试栈副本里需要一个内容够长的会话页；实测未发生。')
}

// 查询词：**插件的命中域**（可见、可搜的文本）里出现 ≥2 次的 4 字窗口。
// 按整页原始文本数重复次数不够——折叠起来的过程文本在原始串里重复，在页面上却不可见，
// 挑出来的词只剩 1 条可见命中时，「跳下一条」根本没有第二条可跳，断言就自相矛盾。
const query1 = await evaluate(`(() => {
  const visibleCount = (${ORACLE_SOURCE})
  const text = __dshOiFindPageText().replace(/\\s+/g, ' ')
  for (let i = 0; i + 4 <= text.length; i += 1) {
    const gram = text.slice(i, i + 4)
    if (/^\\s+$/.test(gram)) continue
    if (visibleCount(gram, 'visible') >= 2) return gram
  }
  return null
})()`)
if (query1 === null) abort('插件的可见命中域里挑不出重复 ≥2 次的 4 字窗口', '命中数、跳转与环绕断言需要一个在页面上真能跳第二条的查询词。')

// ---- 2：真实 Ctrl+F 开条 ----

await press('f', 'KeyF', 70, CTRL)
const opened = { snap: await snapshot(), probe: await evaluate(`window.__dshOiFindProbe ?? []`) }
check('真实 Ctrl+F 开条，且插件吃掉默认行为', { open: opened.snap?.open, prevented: opened.probe.at(-1) },
  (v) => v.open === true && v.prevented === true
    || `期望条开着且 defaultPrevented=true，实测 ${JSON.stringify(v)}`)

// ---- 3-4：命中数与 oracle、高亮集同数 ----

await setQuery(query1)
const oracle1 = await evaluate(`(${ORACLE_SOURCE})(${JSON.stringify(query1)}, 'visible')`)
const search1 = { snap: await snapshot(), hl: await evaluate(`(() => {
  const all = CSS.highlights.get('dsh-oi-find')
  const active = CSS.highlights.get('dsh-oi-find-active')
  return { all: all?.size ?? null, active: active?.size ?? null }
})()`) }
check('命中数与独立 oracle 一致且 >0', { plugin: search1.snap?.total, oracle: oracle1 },
  (v) => v.plugin > 0 && v.plugin === v.oracle
    || `期望 plugin===oracle 且 >0，实测 ${JSON.stringify(v)}`)
check('高亮集与命中同数，两个注册名都在', { snapshot: search1.snap, ...search1.hl },
  (v) => v.all === v.snapshot.total && v.active === 1
    || `期望 all===total 且 active===1，实测 ${JSON.stringify(v)}`)

// 当前项落点读数。只在**跳过一条之后**读：`open()` 与改词都不滚动页面，只有 `step()`
// 调 `scrollIntoView`。把它读在按 Enter 之前，验的是「第一条命中恰好在视口里」这个
// 与会话内容绑在一起的巧合，而不是本功能承诺的行为。
const ACTIVE_RECT = `(() => {
  const set = CSS.highlights.get('dsh-oi-find-active')
  const range = set === undefined ? null : [...set][0]
  if (range === undefined || range === null) return { rect: null }
  const el = range.startContainer.parentElement
  const r = el.getBoundingClientRect()
  return { inViewport: r.top >= 0 && r.bottom <= window.innerHeight, height: Math.round(r.height) }
})()`

// ---- 5：当前项就是那个词 ----

const snapActive1 = await snapshot()
check('当前项唯一且文本与查询词只差大小写', { activeText: snapActive1?.activeText, query: query1 },
  (v) => (v.activeText ?? '').toLowerCase() === (v.query ?? '').toLowerCase()
    && (v.activeText ?? '').length === (v.query ?? '').length
    || `期望 activeText 与 query 同长、大小写折叠后相等，实测 ${JSON.stringify(v)}`)

// ---- 6-9：Enter / Shift+Enter / 环绕 ----

await press('Enter', 'Enter', 13)
const afterEnter = await snapshot()
check('Enter 跳下一条', { index: afterEnter?.index, total: afterEnter?.total },
  (v) => v.index === 1 || `期望 index=1（共 ${v.total} 条），实测 ${JSON.stringify(v)}`)
check('跳转后当前项滚进了视口', await evaluate(ACTIVE_RECT),
  (v) => v.inViewport === true || `期望命中元素整块在视口内，实测 ${JSON.stringify(v)}`)

await press('Enter', 'Enter', 13, SHIFT)
const afterShift = await snapshot()
check('Shift+Enter 回上一条', { index: afterShift?.index },
  (v) => v.index === 0 || `期望 index=0，实测 ${JSON.stringify(v)}`)

const total1 = afterEnter.total
for (let i = 1; i < total1; i += 1) await press('Enter', 'Enter', 13)
const atEnd = await snapshot()
await press('Enter', 'Enter', 13)
const wrapped = await snapshot()
check('连按 Enter 到端点后环绕回第一条', { end: atEnd?.index, total: total1, wrapped: wrapped?.index },
  (v) => v.end === v.total - 1 && v.wrapped === 0
    || `期望先停在 ${total1 - 1} 再回到 0，实测 ${JSON.stringify(v)}`)

// ---- 10-11：整轮不动上游 DOM，改词即重扫 ----

await evaluate(MUTATION_INSTALL)
// 改词用前三字：它是原词的前缀，必然还有命中，又能证明「重扫」真的发生了。
const query2 = query1.slice(0, 3)
await setQuery(query2)
await press('Enter', 'Enter', 13)
await press('Enter', 'Enter', 13, SHIFT)
const mutations = await evaluate(`(() => {
  const n = window.__dshOiFindMutations
  window.__dshOiFindMutationStop()
  window.__dshOiFindMutations = null
  return { childListNodes: n }
})()`)
check('一轮输入与跳转没有产生一次 childList mutation', mutations,
  (v) => v.childListNodes === 0 || `期望 0（高亮只走 CSS，不改 DOM），实测 ${JSON.stringify(v)}`)

const retyped = await snapshot()
check('改词后重扫：仍有命中且当前项文本就是新词', { query: retyped?.query, total: retyped?.total, activeText: retyped?.activeText, expected: query2 },
  (v) => v.query === v.expected && v.total > 0
    && (v.activeText ?? '').toLowerCase() === v.expected.toLowerCase()
    || `期望 query===${JSON.stringify(query2)} 且 total>0、activeText 大小写折叠后同词，实测 ${JSON.stringify(v)}`)

// ---- 12：token 真实存在 ----

// 主题令牌定义在 `document.body` 上而不是 `:root`（实测：html 上读到的全是空串，body 上
// 有值）。读错元素等于这条断言从来没在判它依赖的东西。
const tokens = await evaluate(`(() => {
  const cs = getComputedStyle(document.body)
  const read = (n) => (cs.getPropertyValue(n) ?? '').trim()
  return { warnLabel: read('--dsw-alias-state-warn-label'), menu: read('--dsw-specific-menu') }
})()`)
check('查找条用到的两枚 token 在当前主题里真有定义', tokens,
  (v) => v.warnLabel !== '' && v.menu !== ''
    || `写错的 token 不会报错，只会静默落到 var() 的兜底值上。实测 ${JSON.stringify(v)}`)

// ---- 13-14：Esc 关条，菜单优先 ----

await press('Escape', 'Escape', 27)
const closed = await evaluate(`({
  bar: document.querySelector('.dsh-oi-find') !== null,
  all: CSS.highlights.get('dsh-oi-find') !== undefined,
  active: CSS.highlights.get('dsh-oi-find-active') !== undefined,
  open: window.__dshOperationImprove__?.find?.snapshot()?.open ?? null,
})`)
check('Esc 关条并摘掉两个高亮注册名', closed,
  (v) => v.bar === false && v.open === false && v.all === false && v.active === false
    || `期望条消失、快照报没开、两个注册名都不在，实测 ${JSON.stringify(v)}`)

// 重开，再在侧栏行上真实右键 → Esc 一次收菜单、条留着；第二次 Esc 才收条。
await press('f', 'KeyF', 70, CTRL)
await setQuery(query1)
const rowBox = await evaluate(`(() => {
  const row = [...document.querySelectorAll('[role="treeitem"]')].find((el) => String(el.className).includes('_sessionRow'))
  if (row === undefined) return null
  const r = row.getBoundingClientRect()
  return { x: Math.round(r.left + 40), y: Math.round(r.top + r.height / 2) }
})()`)
if (rowBox === null) abort('侧栏没有可右键的会话行', 'Esc 让位断言实测未发生。')
await rightClick(rowBox.x, rowBox.y)
const menuOpen = await evaluate(`({ menu: document.querySelector('.dsh-oi-menu') !== null, bar: document.querySelector('.dsh-oi-find') !== null })`)
await press('Escape', 'Escape', 27)
const afterFirstEsc = await evaluate(`({ menu: document.querySelector('.dsh-oi-menu') !== null, bar: document.querySelector('.dsh-oi-find') !== null })`)
await press('Escape', 'Escape', 27)
const afterSecondEsc = await evaluate(`({ menu: document.querySelector('.dsh-oi-menu') !== null, bar: document.querySelector('.dsh-oi-find') !== null })`)
check('菜单开着时第一次 Esc 让位给菜单，第二次才收条', { menuOpen, afterFirstEsc, afterSecondEsc },
  (v) => v.menuOpen.menu === true && v.afterFirstEsc.menu === false && v.afterFirstEsc.bar === true
    && v.afterSecondEsc.bar === false
    || `期望「菜单关、条留」再「条也关」，实测 ${JSON.stringify(v)}`)

// ---- 15-16：折叠正文不计入命中，展开后出现 ----

// 「已完成工作」这类整组折叠的过程块：上游把正文容器标成 `[hidden]`，而主题给它的不是
// display:none 而是 `content-visibility: hidden`——元素仍有 layout 盒，光看矩形判不出来，
// 靠的是 `checkVisibility({ checkVisibilityCSS: true })`。实测一条多轮会话上有 59 个这样
// 的条目：组里的思考与工具文本全在 DOM 里，但一个字都画不出来，也不该被搜到。
// 挑词时要求它在可见口径下 0 命中，否则「别处也有同样的词」会让判据失真。
const invisibleQuery = await evaluate(`(() => {
  const opts = { checkVisibilityCSS: true, visibilityProperty: true, contentVisibilityAuto: true }
  const hosts = [...document.querySelectorAll('[data-chat-flow-key] [hidden], [data-chat-node-key] [hidden]')]
    .filter((host) => !(host.checkVisibility(opts) && host.getClientRects().length > 0))
  for (const host of hosts) {
    const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const value = node.nodeValue ?? ''
      // 从正文中后段取词：折叠时组标题会显示一段摘要预览，取开头的词会同时命中摘要。
      const m = /\\S[^\\n\\r]{11,}/.exec(value.slice(Math.floor(value.length / 2)))
      if (m === null) continue
      const query = m[0].slice(0, 12)
      const needle = query.toLowerCase()
      let elsewhere = 0
      for (const text of window.__dshOiFindTexts('visible')) {
        const hay = text.toLowerCase()
        let at = hay.indexOf(needle)
        while (at !== -1) { elsewhere += 1; at = hay.indexOf(needle, at + needle.length) }
      }
      if (elsewhere > 0) continue
      return query
    }
  }
  return null
})()`)
if (invisibleQuery === null) abort('页面上没有「在 DOM 里但整组不可见」的正文', '折叠判据（第 15 条）实测未发生：需要一个带折叠过程块的会话。')

await press('f', 'KeyF', 70, CTRL)
await setQuery(invisibleQuery)
const collapsed = {
  snap: await snapshot(),
  raw: await evaluate(`(${ORACLE_SOURCE})(${JSON.stringify(invisibleQuery)}, 'raw')`),
  visible: await evaluate(`(${ORACLE_SOURCE})(${JSON.stringify(invisibleQuery)}, 'visible')`),
}
check('折叠组里看不见的正文不计入命中', {
  plugin: collapsed.snap?.total, raw: collapsed.raw, visible: collapsed.visible,
},
  (v) => v.plugin === 0 && v.raw > 0 && v.visible === 0
    || `期望「在 DOM 里（raw>0）但不可见（visible===0）」且插件也不计（plugin===0），实测 ${JSON.stringify(v)}`)

// ---- 16：切会话后重算跟上当前 DOM（不留悬空 Range） ----

await press('f', 'KeyF', 70, CTRL)
await setQuery(query1)
const beforeSwitch = await snapshot()
const switchedTo = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'))
    .filter((r) => !(r.textContent ?? '').includes('新会话'))
    .filter((r) => r.getAttribute('aria-selected') !== 'true')
  const row = rows[0]
  if (row === undefined) return null
  row.click()
  return (row.textContent ?? '').trim().slice(0, 30)
})()`)
if (switchedTo === null) abort('侧栏没有第二条会话行', '切会话重算断言（第 16 条）实测未发生。')

/** 等重算落定：条还开着、词条没变，且高亮集里每条 Range 都还挂在活的 DOM 上。 */
let afterSwitch = null
for (let attempt = 0; attempt < 14; attempt += 1) {
  await sleep(500)
  afterSwitch = await evaluate(`(() => {
    const set = CSS.highlights.get('dsh-oi-find')
    let connected = true
    if (set !== undefined) for (const range of set) if (!range.startContainer.isConnected) connected = false
    return {
      snap: window.__dshOperationImprove__?.find?.snapshot() ?? null,
      ranges: set?.size ?? null,
      connected,
      oracle: (${ORACLE_SOURCE})(${JSON.stringify(query1)}, 'visible'),
    }
  })()`)
  if (afterSwitch.snap?.open === true && afterSwitch.connected === true) break
}
check('切会话后条留着、词条不变，且高亮全部重挂到新 DOM 上', {
  queryBefore: beforeSwitch?.query, queryAfter: afterSwitch?.snap?.query, open: afterSwitch?.snap?.open,
  ranges: afterSwitch?.ranges, total: afterSwitch?.snap?.total, connected: afterSwitch?.connected,
},
  (v) => v.open === true && v.queryBefore === v.queryAfter && v.connected === true && v.ranges === v.total
    || `期望条开着、词条没变、每条 Range 都还连着且与命中同数，实测 ${JSON.stringify(v)}`)
check('切会话后的命中数与当前页面的 oracle 一致', { plugin: afterSwitch?.snap?.total, oracle: afterSwitch?.oracle },
  (v) => v.plugin === v.oracle || `期望 plugin===oracle，实测 ${JSON.stringify(v)}`)

await press('Escape', 'Escape', 27)

// ---- 17：dispose 后不再接管 ----

await evaluate(`window.__dshOperationImprove__.find.dispose()`)
await sleep(100)
await press('f', 'KeyF', 70, CTRL)
const afterDispose = await evaluate(`(() => ({
  prevented: (window.__dshOiFindProbe ?? []).at(-1) ?? null,
  bar: document.querySelector('.dsh-oi-find') !== null,
  names: [CSS.highlights.get('dsh-oi-find'), CSS.highlights.get('dsh-oi-find-active')].filter((s) => s !== undefined).length,
}))()`)
check('find.dispose() 后 Ctrl+F 不再被接管、注册名也不留', afterDispose,
  (v) => v.prevented === false && v.bar === false && v.names === 0
    || `期望 defaultPrevented=false、没有条、注册名清空，实测 ${JSON.stringify(v)}`)

// ---- 18：清场 ----

await reloadAndWait(conn, { mountMs: 6000 })
const restored = await evaluate(`(() => {
  const h = window.__dshOperationImprove__
  return { handle: h !== undefined, hasFind: typeof h?.find?.snapshot === 'function', freshInstance: h?.instanceId !== ${JSON.stringify(boot.instanceId)} }
})()`)
check('清场：刷新后页面重新长出新实例', restored,
  (v) => v.handle && v.hasFind && v.freshInstance || `页面没有恢复干净：${JSON.stringify(v)}`)

conn.ws.close()
report()
