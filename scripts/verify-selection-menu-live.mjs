/**
 * 实测驱动：在运行中的 DSH 页面上验证功能 6（选中文本的右键菜单）。
 *
 * 与 [verify-active-dot-live.mjs](verify-active-dot-live.mjs) 一样**不注入 bundle、不 apply
 * 自造 ctx**，验的是页面自己那份实例：功能 6 不调用任何 harness 服务，没有需要打桩的破坏性
 * 动作，走页面自己的实例反而把「构建产物 → profile 装载 → 真实 locale 词典」这条路径一起验了。
 *
 * **手势必须是真的**：`Input.dispatchMouseEvent` 而不是 `el.click()`。合成点击不带 user
 * activation，而 `navigator.clipboard.readText()` 要的正是它——用合成事件跑，粘贴那几条会
 * 全部倒在权限上，且症状是「剪贴板为空」而不是报错。另外 `Browser.grantPermissions` 先把
 * `clipboardReadWrite` 授掉（headless 下没有人能点权限气泡），`Emulation.setFocusEmulationEnabled`
 * 让文档保持聚焦（剪贴板 API 对未聚焦文档直接 reject）。
 *
 * **粘贴用的剪贴板内容是脚本自己写进去的哨兵串**，不是上一条断言复制进去的会话文本：
 * 期望值必须逐字可算，而会话里那段文字是什么取决于测试栈当时打开的是哪个会话。
 *
 * CDP 连接与断言框架来自 [lib/cdp.mjs](lib/cdp.mjs)，判据语义（skip 也算失败、非零退出）
 * 与其余脚本共用一份实现。
 *
 * **默认打测试栈（3181）**，先 `node scripts/test-stack.mjs up`。
 *
 * 用法：node scripts/verify-selection-menu-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过开头那次 Page.reload
 */
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

/** 写进输入框的草稿。全 ASCII 且无 `/`：上游 InputBar 的 `onPaste` 带 slash-token 事务。 */
const DRAFT = 'AAAABBBBCCCC'

/** 草稿里被选中的那一段（左闭右开），粘贴会把它换掉。 */
const PICK = [4, 8]

/** 粘贴用的剪贴板哨兵。同样避开 `/` 与换行。 */
const SENTINEL = 'PASTE-SENTINEL-42'

/** 两种语言下菜单该显示的字面文案，用来确认两项来自**同一种**语言的词典。 */
const LITERALS = {
  zh: { copy: '复制', paste: '粘贴' },
  en: { copy: 'Copy', paste: 'Paste' },
}

/**
 * 比 computed style 时要排除的属性——它们随菜单项数与文案长度变，与「外观是否一致」无关。
 * 用显式清单而不是正则：`font-size` 里也有 "size"，一条 `/size/` 会把字号一起放过。
 */
const GEOMETRY_KEYS = new Set([
  'width', 'height', 'inline-size', 'block-size',
  'perspective-origin', 'transform-origin',
  'left', 'top', 'right', 'bottom',
  'inset', 'inset-block', 'inset-block-start', 'inset-block-end',
  'inset-inline', 'inset-inline-start', 'inset-inline-end',
  '-webkit-logical-width', '-webkit-logical-height',
])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

/**
 * 开一条到 browser target（不是页面 target）的长驻连接。
 *
 * `Browser.grantPermissions` 只在 browser 级别的那条连接上存在，页面连接会答
 * `'Browser.grantPermissions' wasn't found`。
 *
 * **这条连接必须一直开着**：授权跟着授权的那个 CDP client 走，ws 一关 Chrome 就把
 * 覆盖撤回，之后 `readText()` 报 `NotAllowedError: Read permission denied`——症状看着
 * 像没授权成功，其实是授过又收回了（`grantPermissions` 本身答的是 `{}`）。
 *
 * @returns {Promise<{ ws: WebSocket, send: (method: string, params?: object) => Promise<any> }>}
 */
async function openBrowserConn() {
  const info = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
  const ws = new (globalThis.WebSocket)(info.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true })
    ws.addEventListener('error', reject, { once: true })
  })
  let seq = 0
  const pending = new Map()
  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data)
    const entry = pending.get(msg.id)
    if (entry === undefined) return
    pending.delete(msg.id)
    entry(msg)
  })
  const send = (method, params) => {
    const id = (seq += 1)
    return new Promise((resolve) => {
      pending.set(id, resolve)
      ws.send(JSON.stringify({ id, method, params }))
    })
  }
  return { ws, send }
}

/**
 * 发一次真实鼠标事件。
 *
 * @param {'mousePressed'|'mouseReleased'|'mouseMoved'} type
 * @param {number} x
 * @param {number} y
 * @param {'left'|'right'|'none'} button
 */
async function mouse(type, x, y, button) {
  const buttons = type === 'mousePressed' ? (button === 'right' ? 2 : 1) : 0
  const res = await conn.send('Input.dispatchMouseEvent', {
    type, x, y, button, buttons, clickCount: button === 'none' ? 0 : 1,
  })
  if (res.error !== undefined) abort(`Input.dispatchMouseEvent 失败`, JSON.stringify(res.error))
}

/** 在 (x, y) 上真实右键；返回前留出一拍让菜单挂上去。 */
async function rightClick(x, y) {
  await mouse('mouseMoved', x, y, 'none')
  await mouse('mousePressed', x, y, 'right')
  await sleep(40)
  await mouse('mouseReleased', x, y, 'right')
  await sleep(200)
}

/** 在 (x, y) 上真实左键。 */
async function leftClick(x, y) {
  await mouse('mouseMoved', x, y, 'none')
  await mouse('mousePressed', x, y, 'left')
  await sleep(40)
  await mouse('mouseReleased', x, y, 'left')
  await sleep(250)
}

/**
 * 发一次真实按键（按下 + 抬起）。
 *
 * @param {string} key `KeyboardEvent.key`
 * @param {string} code `KeyboardEvent.code`
 * @param {number} vk Windows virtual key code——不给的话 Chrome 收不到「这是哪个键」
 */
async function press(key, code, vk) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    const res = await conn.send('Input.dispatchKeyEvent', {
      type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    })
    if (res.error !== undefined) abort('Input.dispatchKeyEvent 失败', JSON.stringify(res.error))
  }
  await sleep(120)
}

/** 读当前页面上的菜单：数量、归属、逐项文案。 */
const readMenu = () => evaluate(`(() => {
  const roots = [...document.querySelectorAll('.dsh-oi-menu')]
  const root = roots[0] ?? null
  return {
    count: roots.length,
    owner: root === null ? null : root.getAttribute('data-dsh-oi-owner'),
    items: root === null ? [] : [...root.querySelectorAll('.dsh-oi-menu__item')]
      .map((b) => b.querySelector('.dsh-oi-menu__label').textContent),
  }
})()`)

/** 菜单里某一项的中心点；没有该项时返回 `null`。 */
const itemPoint = (label) => evaluate(`(() => {
  const root = document.querySelector('.dsh-oi-menu')
  if (root === null) return null
  const button = [...root.querySelectorAll('.dsh-oi-menu__item')]
    .find((b) => b.querySelector('.dsh-oi-menu__label').textContent === ${JSON.stringify(label)})
  if (button === undefined) return null
  const r = button.getBoundingClientRect()
  return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
})()`)

/** Esc 关掉可能还开着的菜单，返回关完之后还剩几个。 */
async function escapeMenu() {
  await press('Escape', 'Escape', 27)
  return evaluate('document.querySelectorAll(".dsh-oi-menu").length')
}

// ---- 环境准备 ----

if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
}
await conn.send('Page.enable')

const browser = await openBrowserConn()
const granted = await browser.send('Browser.grantPermissions', {
  origin: PREFIX,
  permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'],
})
if (granted.error !== undefined) {
  abort('Browser.grantPermissions 失败，剪贴板断言无法执行', JSON.stringify(granted.error))
}
// headless 下窗口默认不聚焦，而剪贴板 API 对未聚焦文档直接 reject。
const focused = await conn.send('Emulation.setFocusEmulationEnabled', { enabled: true })
if (focused.error !== undefined) {
  abort('Emulation.setFocusEmulationEnabled 失败，文档拿不到焦点', JSON.stringify(focused.error))
}

const boot = await evaluate(`(() => {
  const h = window.__dshOperationImprove__
  if (h === undefined) return { fatal: 'no-handle' }
  return {
    instanceId: h.instanceId,
    hasSelectionMenu: typeof h.selectionMenu?.dispose === 'function',
    hasTCommon: typeof h.locale?.tCommon === 'function',
    lang: document.documentElement.lang,
    copy: h.locale?.tCommon?.('copy') ?? null,
    paste: h.locale?.tOwn?.('selection.paste') ?? null,
    rowLabels: [h.locale?.t?.('rename') ?? null, h.locale?.t?.('menu.fork') ?? null, h.locale?.t?.('menu.archiveSession') ?? null],
  }
})()`)
if (boot.fatal !== undefined) {
  abort('页面上没有本插件的实例句柄', 'window.__dshOperationImprove__ 不存在：插件没装进 profile，或页面还没 mount。'
    + '先确认 test-stack up 报告「本插件在名册里=true」。')
}
if (!boot.hasSelectionMenu || !boot.hasTCommon) {
  abort('页面加载的是旧产物', `观测：hasSelectionMenu=${boot.hasSelectionMenu} hasTCommon=${boot.hasTCommon}。`
    + '先 node scripts/build.mjs，再重跑（脚本开头会自己 reload）。')
}

const LANG = boot.lang.startsWith('en') ? 'en' : 'zh'
const EXPECT = LITERALS[LANG]

// 探针：读每次 contextmenu 结束时的 defaultPrevented。挂在捕获阶段且注册在插件之后，
// 所以它一定在插件那个 handler 之后跑——`stopPropagation()` 拦不住同一节点上的另一个
// 监听器，这正是本脚本能观测到「插件有没有吃掉这次事件」的原因。
// 自己也 preventDefault：读完之后才做，不影响判据，但挡住真实 Chrome 里会盖住页面的原生菜单。
await evaluate(`(() => {
  if (window.__dshOiCtxProbe__ === undefined) {
    window.__dshOiCtxProbe__ = { last: null }
    document.addEventListener('contextmenu', (event) => {
      window.__dshOiCtxProbe__.last = { defaultPrevented: event.defaultPrevented }
      event.preventDefault()
    }, true)
  }
  window.__dshOiCtxProbe__.last = null
  return true
})()`)

const { check, report } = createChecker()

// ---- 1 / 2：会话正文里的选区 → 复制 ----

// 选一段真实正文：必须**整段落在一行里**（`getClientRects().length === 1`），否则算出来的
// 中点可能落在行尾空白上，那里不在选区内，右键理应不弹——判据会失败，但失败的是探针。
const picked = await evaluate(`(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = null
  while ((node = walker.nextNode()) !== null) {
    const raw = node.nodeValue ?? ''
    if (raw.trim().length < 20) continue
    const host = node.parentElement
    if (host === null) continue
    if (host.closest('[class*="_sessionRow"], [class*="_projectRow"], textarea, input, .dsh-oi-menu') !== null) continue
    const box = host.getBoundingClientRect()
    if (box.top < 80 || box.bottom > window.innerHeight - 120 || box.width < 80) continue
    const lead = raw.length - raw.trimStart().length
    const range = document.createRange()
    range.setStart(node, lead)
    range.setEnd(node, Math.min(raw.length, lead + 12))
    const rects = [...range.getClientRects()]
    if (rects.length !== 1 || rects[0].width < 20) continue
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(range)
    window.__dshOiSel__ = { range: range.cloneRange() }
    return {
      text: range.toString(),
      x: Math.round(rects[0].x + rects[0].width / 2),
      y: Math.round(rects[0].y + rects[0].height / 2),
    }
  }
  return null
})()`)
if (picked === null) {
  abort('页面上找不到可用于选区的会话正文', '要求：≥20 字的文本节点、不在侧边栏/输入框里、'
    + '前 12 个字符在同一行内、整体落在视口内。先在测试栈里打开一个有正文的会话。')
}

await rightClick(picked.x, picked.y)
const menu1 = await readMenu()
check('会话正文选区上右键：恰好 1 个菜单、归属页面实例、只有「复制」', menu1,
  (v) => (v.count === 1 && v.owner === boot.instanceId
    && v.items.length === 1 && v.items[0] === EXPECT.copy)
    || `期望 count=1 owner=${boot.instanceId} items=[${EXPECT.copy}]，实测 ${JSON.stringify(v)}`)

// 复制那一项的图标与页面上真实那枚消息复制按钮逐字比。**按钮是按 aria-label 定位的**
// （文案取自同一份 common 词典），不是按 `d` 反查——按 `d` 找就成了拿常量去证明常量。
const iconCmp = await evaluate(`(() => {
  const label = ${JSON.stringify(EXPECT.copy)}
  const button = [...document.querySelectorAll('button[aria-label]')]
    .find((b) => b.getAttribute('aria-label') === label && b.closest('.dsh-oi-menu') === null)
  const pageSvg = button?.querySelector('svg') ?? null
  const menuSvg = document.querySelector('.dsh-oi-menu__icon svg')
  if (pageSvg === null || menuSvg === null) {
    return { skipped: 'page-copy-button-missing', hasButton: button !== undefined, hasMenuSvg: menuSvg !== null }
  }
  const ds = (svg) => [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))
  return {
    pageViewBox: pageSvg.getAttribute('viewBox'),
    menuViewBox: menuSvg.getAttribute('viewBox'),
    pathCount: ds(pageSvg).length,
    same: JSON.stringify(ds(pageSvg)) === JSON.stringify(ds(menuSvg)),
  }
})()`)
check('「复制」图标与页面上真实那枚复制按钮逐字相同（viewBox + 全部 path[d]）', iconCmp,
  (v) => (v.same === true && v.pageViewBox === v.menuViewBox && v.pathCount > 0)
    || `上游图标已漂移或菜单画的是别的矢量：${JSON.stringify(v)}`)

// 功能 6 的菜单样式快照，留到断言 8 与功能 2 的比。
const styleSix = await evaluate(`(() => {
  const root = document.querySelector('.dsh-oi-menu')
  const item = root?.querySelector('.dsh-oi-menu__item') ?? null
  if (root === null || item === null) return null
  const pick = (el) => { const cs = getComputedStyle(el); const o = {}; for (const k of cs) o[k] = cs.getPropertyValue(k); return o }
  return { root: pick(root), item: pick(item) }
})()`)

const copyPoint = await itemPoint(EXPECT.copy)
if (copyPoint === null) abort('菜单里没有「复制」项，后续断言无法执行', JSON.stringify(menu1))
await leftClick(copyPoint.x, copyPoint.y)
await sleep(300)

const copied = await evaluate(`(async () => {
  let text = null
  let error = null
  try { text = await navigator.clipboard.readText() } catch (e) { error = String(e) }
  return { text, error, menus: document.querySelectorAll('.dsh-oi-menu').length }
})()`)
check('点「复制」后剪贴板逐字等于选中文本，且菜单已关', {
  match: copied.text === picked.text, menus: copied.menus,
  selected: picked.text, clipboard: copied.text, error: copied.error,
}, (v) => (v.match === true && v.menus === 0)
  || `期望剪贴板 === 选中文本且菜单关闭，实测 ${JSON.stringify(v)}`)

// ---- 3 / 4 / 5：输入框 ----

const field = await evaluate(`(() => {
  const found = [...document.querySelectorAll('textarea')]
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter((o) => o.r.width > 100 && o.r.height > 10 && !o.el.disabled && !o.el.readOnly)
    .sort((a, b) => b.r.width - a.r.width)[0]
  if (found === undefined) return null
  window.__dshOiField__ = found.el
  found.el.focus()
  found.el.setSelectionRange(0, found.el.value.length)
  const cs = getComputedStyle(found.el)
  return {
    placeholder: found.el.getAttribute('placeholder'),
    value: found.el.value,
    rect: [Math.round(found.r.x), Math.round(found.r.y), Math.round(found.r.width), Math.round(found.r.height)],
    padLeft: parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth),
    font: cs.font,
  }
})()`)
if (field === null) abort('页面上找不到可写的 textarea', '会话页应当有输入框；先确认测试栈打开的是会话页。')

// 先清空草稿（真实按键，不改 value）：受控 textarea 直接写 value 会被 React 下一帧盖回去。
if (field.value !== '') {
  await press('Delete', 'Delete', 46)
}
const emptied = await evaluate('window.__dshOiField__.value')
if (emptied !== '') abort('清不掉输入框里的草稿', `实测 value=${JSON.stringify(emptied)}`)

const typed = await conn.send('Input.insertText', { text: DRAFT })
if (typed.error !== undefined) abort('Input.insertText 失败', JSON.stringify(typed.error))
await sleep(200)

// 右键要落在选区上：Chrome 在文本控件里右键选区之外会先把光标收拢过去。用控件自己的
// 字体量出第 PICK 段中点的横坐标，量不准也只是落在相邻字符上，仍在选区内。
const fieldPoint = await evaluate(`(() => {
  const el = window.__dshOiField__
  el.focus()
  el.setSelectionRange(${PICK[0]}, ${PICK[1]})
  const r = el.getBoundingClientRect()
  const c = document.createElement('canvas').getContext('2d')
  c.font = ${JSON.stringify(field.font)}
  const mid = (${PICK[0]} + ${PICK[1]}) / 2
  const dx = c.measureText(el.value.slice(0, mid)).width
  return {
    value: el.value, start: el.selectionStart, end: el.selectionEnd,
    x: Math.round(r.x + ${field.padLeft} + dx),
    y: Math.round(r.y + r.height / 2),
  }
})()`)
check('输入框里打进草稿并选中一段（真实 Input.insertText，受控组件跟得上）', {
  value: fieldPoint.value, start: fieldPoint.start, end: fieldPoint.end,
}, (v) => (v.value === DRAFT && v.start === PICK[0] && v.end === PICK[1])
  || `期望 value=${DRAFT} 选区=${JSON.stringify(PICK)}，实测 ${JSON.stringify(v)}`)

await rightClick(fieldPoint.x, fieldPoint.y)
const menu3 = await readMenu()
check('输入框选区上右键：「复制」+「粘贴」两项', menu3,
  (v) => (v.count === 1 && v.owner === boot.instanceId
    && JSON.stringify(v.items) === JSON.stringify([EXPECT.copy, EXPECT.paste]))
    || `期望 [${EXPECT.copy}, ${EXPECT.paste}]，实测 ${JSON.stringify(v)}`)

// 哨兵写进剪贴板：期望值必须逐字可算，会话正文里那段是什么取决于打开的是哪个会话。
const seeded = await evaluate(`(async () => {
  try { await navigator.clipboard.writeText(${JSON.stringify(SENTINEL)}); return await navigator.clipboard.readText() }
  catch (e) { return { skipped: String(e) } }
})()`)
if (seeded !== SENTINEL) abort('写不进剪贴板哨兵，粘贴断言无法执行', JSON.stringify(seeded))

const pastePoint = await itemPoint(EXPECT.paste)
if (pastePoint === null) abort('菜单里没有「粘贴」项，后续断言无法执行', JSON.stringify(menu3))
await leftClick(pastePoint.x, pastePoint.y)
await sleep(400)

const pasted = await evaluate(`(() => {
  const el = window.__dshOiField__
  return { value: el.value, caret: el.selectionStart, menus: document.querySelectorAll('.dsh-oi-menu').length }
})()`)
const expectValue = DRAFT.slice(0, PICK[0]) + SENTINEL + DRAFT.slice(PICK[1])
check('点「粘贴」后选区被剪贴板内容替换，光标落在插入尾部', {
  ...pasted, expectValue, expectCaret: PICK[0] + SENTINEL.length,
}, (v) => (v.value === expectValue && v.caret === PICK[0] + SENTINEL.length && v.menus === 0)
  || `期望 value=${JSON.stringify(expectValue)} caret=${PICK[0] + SENTINEL.length}，实测 ${JSON.stringify(v)}`)

// 清空草稿：测试栈的会话不该被留下一条脚本写的待发消息。
await evaluate('(() => { const el = window.__dshOiField__; el.focus(); el.setSelectionRange(0, el.value.length); return true })()')
await press('Delete', 'Delete', 46)
const cleared = await evaluate('window.__dshOiField__.value')
check('测完清空草稿', { value: cleared },
  (v) => v.value === '' || `输入框里还留着 ${JSON.stringify(v.value)}`)

await rightClick(fieldPoint.x, fieldPoint.y)
const menu5 = await readMenu()
check('空输入框、无选区时右键：只有「粘贴」', menu5,
  (v) => (v.count === 1 && JSON.stringify(v.items) === JSON.stringify([EXPECT.paste]))
    || `期望 [${EXPECT.paste}]，实测 ${JSON.stringify(v)}`)
check('Esc 关掉菜单', await escapeMenu(), (v) => v === 0 || `Esc 之后还剩 ${v} 个菜单`)

// ---- 6：不可输入、无选区 → 不接管 ----

await evaluate(`(() => {
  window.getSelection().removeAllRanges()
  window.__dshOiField__.blur()
  window.__dshOiCtxProbe__.last = null
  return true
})()`)
await rightClick(picked.x, picked.y)
const untouched = await evaluate(`(() => ({
  menus: document.querySelectorAll('.dsh-oi-menu').length,
  probe: window.__dshOiCtxProbe__.last,
}))()`)
check('非可输入区域且无选区：不弹菜单，也不吃掉原生菜单', untouched,
  (v) => (v.menus === 0 && v.probe !== null && v.probe.defaultPrevented === false)
    || `期望 menus=0 且插件跑完时 defaultPrevented=false，实测 ${JSON.stringify(v)}`)

// ---- 7 / 8：侧边栏的行归功能 2 ----

const row = await evaluate(`(() => {
  // 先把正文选区放回去：这条断言问的正是「有选中文本时右键侧边栏，谁赢」。
  const s = window.getSelection()
  s.removeAllRanges()
  s.addRange(window.__dshOiSel__.range)
  const el = document.querySelector('[class*="_sessionRow"]')
  if (el === null) return null
  const r = el.getBoundingClientRect()
  return { selected: s.toString(), x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }
})()`)
if (row === null) abort('侧边栏里没有会话行', '功能 2 的对照断言无法执行；先确认测试栈里至少有一个会话。')

await rightClick(row.x, row.y)
const menu7 = await readMenu()
check('有选中文本时右键侧边栏的行：开出来的是功能 2 的行菜单', {
  ...menu7, selected: row.selected, expect: boot.rowLabels,
}, (v) => (v.count === 1 && JSON.stringify(v.items) === JSON.stringify(boot.rowLabels))
  || `期望 ${JSON.stringify(boot.rowLabels)}，实测 ${JSON.stringify(v.items)}`)

const styleTwo = await evaluate(`(() => {
  const root = document.querySelector('.dsh-oi-menu')
  const item = root?.querySelector('.dsh-oi-menu__item') ?? null
  if (root === null || item === null) return null
  const pick = (el) => { const cs = getComputedStyle(el); const o = {}; for (const k of cs) o[k] = cs.getPropertyValue(k); return o }
  return { root: pick(root), item: pick(item) }
})()`)
check('Esc 关掉行菜单（不点任何一项）', await escapeMenu(), (v) => v === 0 || `Esc 之后还剩 ${v} 个菜单`)

if (styleSix === null || styleTwo === null) {
  abort('取不到两个菜单的 computed style', `six=${styleSix !== null} two=${styleTwo !== null}`)
}
const diff = (a, b) => Object.keys(a)
  .filter((k) => !GEOMETRY_KEYS.has(k) && a[k] !== b[k])
  .map((k) => `${k}: ${a[k]} / ${b[k]}`)
const rootDiff = diff(styleSix.root, styleTwo.root)
const itemDiff = diff(styleSix.item, styleTwo.item)
check('两个菜单的 computed style 逐键相同（root / item，排除随项数与文案变化的几何量）', {
  rootKeys: Object.keys(styleSix.root).length, itemKeys: Object.keys(styleSix.item).length,
  rootDiff, itemDiff,
}, (v) => (v.rootDiff.length === 0 && v.itemDiff.length === 0)
  || `样式不一致：root ${JSON.stringify(v.rootDiff)} item ${JSON.stringify(v.itemDiff)}`)

// ---- 10：文案来自词典 ----

check(`菜单文案取自词典且两项同语言（active locale = ${boot.lang}）`, {
  lang: boot.lang, copy: boot.copy, paste: boot.paste, shown: menu3.items,
}, (v) => (v.copy === EXPECT.copy && v.paste === EXPECT.paste
  && JSON.stringify(v.shown) === JSON.stringify([v.copy, v.paste]))
  || `期望菜单显示 [tCommon('copy'), tOwn('selection.paste')] = [${EXPECT.copy}, ${EXPECT.paste}]，实测 ${JSON.stringify(v)}`)

// ---- 11：dispose ----

await evaluate(`(() => {
  window.__dshOperationImprove__.selectionMenu.dispose()
  const s = window.getSelection()
  s.removeAllRanges()
  s.addRange(window.__dshOiSel__.range)
  window.__dshOiCtxProbe__.last = null
  return true
})()`)
await rightClick(picked.x, picked.y)
const afterDispose = await evaluate(`(() => ({
  menus: document.querySelectorAll('.dsh-oi-menu').length,
  probe: window.__dshOiCtxProbe__.last,
}))()`)
check('selectionMenu.dispose() 之后：选区上右键不再弹菜单，也不再 preventDefault', afterDispose,
  (v) => (v.menus === 0 && v.probe !== null && v.probe.defaultPrevented === false)
    || `期望 menus=0 且 defaultPrevented=false，实测 ${JSON.stringify(v)}`)

// ---- 清场：dispose 掉的是页面自己那份实例，不刷新的话页面就一直缺着功能 6 ----

await reloadAndWait(conn, { mountMs: 6000 })
const restored = await evaluate(`(() => {
  const h = window.__dshOperationImprove__
  return {
    handle: h !== undefined,
    hasSelectionMenu: typeof h?.selectionMenu?.dispose === 'function',
    freshInstance: h?.instanceId !== ${JSON.stringify(boot.instanceId)},
    probeGone: window.__dshOiCtxProbe__ === undefined,
    menus: document.querySelectorAll('.dsh-oi-menu').length,
  }
})()`)
check('清场：刷新后页面重新长出一份实例，探针随文档一起没了', restored,
  (v) => (v.handle && v.hasSelectionMenu && v.freshInstance && v.probeGone && v.menus === 0)
    || `页面没有恢复干净：${JSON.stringify(v)}`)

conn.ws.close()
browser.ws.close()
report()
