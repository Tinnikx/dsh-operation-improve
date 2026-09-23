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
    rowPin: [h.locale?.t?.('menu.pinSession') ?? null, h.locale?.t?.('menu.unpinSession') ?? null],
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
const pickBodySelection = () => evaluate(`(() => {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let node = null
  while ((node = walker.nextNode()) !== null) {
    const raw = node.nodeValue ?? ''
    if (raw.trim().length < 20) continue
    const host = node.parentElement
    if (host === null) continue
    if (host.closest('[class*="_sessionRow"], [class*="_projectRow"], textarea, input, [contenteditable], .dsh-oi-menu') !== null) continue
    const box = host.getBoundingClientRect()
    if (box.top < 80 || box.bottom > window.innerHeight - 120 || box.width < 80) continue
    // 折叠组里的行有布局盒但没有渲染可见性（rect 非零而选区 API 取不到文本）。
    // 真实用户选不到invisible 的文字——探针必须同样只挑**可见**的正文。
    if (!host.checkVisibility({ visibility: true, opacity: false })) continue
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

// 连跑多脚本时实测过一次偶发：选中后、右键前的间隙里 React 重渲染把选区掐掉，菜单数变 0
// ——那是探针踩空，不是功能坏了（同产物单跑必过）。重选一次再判定；两次都空才记 FAIL。
let picked = null
let menu1 = null
for (let attempt = 0; attempt < 2; attempt += 1) {
  picked = await pickBodySelection()
  if (picked === null) break
  await rightClick(picked.x, picked.y)
  menu1 = await readMenu()
  if (menu1.count === 1) break
  await escapeMenu()
  await sleep(300)
}
if (picked === null) {
  abort('页面上找不到可用于选区的会话正文', '要求：≥20 字的文本节点、不在侧边栏/输入框里、'
    + '前 12 个字符在同一行内、整体落在视口内。先在测试栈里打开一个有正文的会话。')
}
if (menu1 === null) menu1 = { count: 0, owner: null, items: [] }
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

// ---- 3 / 4 / 5：输入框的两条路径 ----
//
// 0.1.6 起会话输入框是 Lexical contenteditable，页面里没有那个隐藏 textarea。
// 插件的命中路径因此分开测：**contenteditable 判据**打真实的 composer——有选区给
// 「复制+粘贴」，空态无选区给「粘贴」（照表单控件语义，不要求点击点落在选区内）；
// **field 路径**打一个合成的单行 `<textarea>`——probeField 是通用 DOM 逻辑，
// 页面上不再有现成的可写控件不等于这条路径该失去覆盖。

/** 读 composer 的纯文本（尾部空行不算内容，与功能 9 的读法同口径）。 */
const readComposer = () => evaluate(`(() => {
  const ce = document.querySelector('div[contenteditable="true"][role="textbox"]')
  return ce === null ? null : (ce.innerText ?? '').replace(/\\n+$/, '')
})()`)

/** 清空 composer：selectAll + 真实 Delete（`execCommand('delete')` 在 Lexical 上不生效）。 */
async function clearComposer() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await evaluate(`(() => {
      const ce = document.querySelector('div[contenteditable="true"][role="textbox"]')
      if (ce === null) return false
      ce.focus()
      document.execCommand('selectAll', false)
      return true
    })()`)
    await sleep(150) // selectAll 的选区同步进 Lexical 是异步的
    await press('Delete', 'Delete', 46)
    await sleep(150)
    if ((await readComposer()) === '') return
  }
  abort('composer 清空失败', 'selectAll + Delete 三次后仍有内容。')
}

const composerFound = await evaluate(`(() => {
  const ce = document.querySelector('div[contenteditable="true"][role="textbox"]')
  if (ce === null) return false
  ce.focus()
  return document.activeElement === ce
})()`)
if (!composerFound) abort('页面上找不到可聚焦的 composer', '会话页应有 `div[contenteditable="true"][role="textbox"]`；先确认测试栈打开的是会话页。')
await clearComposer()

const typedDraft = await conn.send('Input.insertText', { text: DRAFT })
if (typedDraft.error !== undefined) abort('Input.insertText 失败', JSON.stringify(typedDraft.error))
await sleep(200)

// 在 composer 的文本节点上选出草稿的第 PICK 段，量出选区中点。**用 Range 的
// client rect**（旧 textarea 用 canvas measureText 是因为表单控件的选区没有
// Range；contenteditable 有）。
const composerSel = await evaluate(`(() => {
  const ce = document.querySelector('div[contenteditable="true"][role="textbox"]')
  if (ce === null) return null
  const walker = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode()) !== null) {
    const at = (node.nodeValue ?? '').indexOf(${JSON.stringify(DRAFT)})
    if (at === -1) continue
    const range = document.createRange()
    range.setStart(node, at + ${PICK[0]})
    range.setEnd(node, at + ${PICK[1]})
    const s = window.getSelection()
    s.removeAllRanges()
    s.addRange(range)
    const r = range.getBoundingClientRect()
    if (r.width === 0) continue
    window.__dshOiSelComposer__ = range.cloneRange()
    return {
      text: s.toString(),
      x: Math.round(r.x + r.width / 2),
      y: Math.round(r.y + r.height / 2),
    }
  }
  return null
})()`)
if (composerSel === null) abort('composer 里选不出草稿片段', `插入后文本为 ${JSON.stringify(await readComposer())}`)
check('composer 里打进草稿并选中一段（真实 Input.insertText + DOM Range 选区）', composerSel,
  (v) => v.text === DRAFT.slice(PICK[0], PICK[1])
    || `期望选区文本 ${JSON.stringify(DRAFT.slice(PICK[0], PICK[1]))}，实测 ${JSON.stringify(v)}`)

await rightClick(composerSel.x, composerSel.y)
const menu3 = await readMenu()
check('composer 选区上右键：「复制」+「粘贴」两项', menu3,
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
  const ce = document.querySelector('div[contenteditable="true"][role="textbox"]')
  if (ce === null) return null
  const s = window.getSelection()
  let before = null
  if (s !== null && s.rangeCount > 0) {
    const probe = document.createRange()
    probe.selectNodeContents(ce)
    probe.setEnd(s.getRangeAt(0).startContainer, s.getRangeAt(0).startOffset)
    before = probe.toString()
  }
  return { text: (ce.innerText ?? '').replace(/\\n+$/, ''), before }
})()`)
const expectValue = DRAFT.slice(0, PICK[0]) + SENTINEL + DRAFT.slice(PICK[1])
check('点「粘贴」后 composer 选区被剪贴板内容替换，光标落在插入尾部', {
  ...pasted, expectValue, expectBefore: expectValue.slice(0, PICK[0] + SENTINEL.length),
}, (v) => (v.text === expectValue && v.before === v.expectBefore)
  || `期望 text=${JSON.stringify(expectValue)} 光标前=${JSON.stringify(v.expectBefore)}，实测 ${JSON.stringify(v)}`)

// 清空草稿：测试栈的会话不该被留下一条脚本写的待发消息。
await clearComposer()

await evaluate('(() => { window.getSelection().removeAllRanges(); return true })()')
const emptyComposerPoint = await evaluate(`(() => {
  const ce = document.querySelector('div[contenteditable="true"][role="textbox"]')
  if (ce === null) return null
  const r = ce.getBoundingClientRect()
  return { text: (ce.innerText ?? '').replace(/\\n+$/, ''), x: Math.round(r.x + 40), y: Math.round(r.y + r.height / 2) }
})()`)
if (emptyComposerPoint === null) abort('清完草稿后 composer 不见了', '后续断言无法执行。')
await evaluate('(() => { window.__dshOiCtxProbe__.last = null; return true })()')
await rightClick(emptyComposerPoint.x, emptyComposerPoint.y)
const menuEmpty = await readMenu()
const emptyPrevented = await evaluate('(() => { const p = window.__dshOiCtxProbe__.last; return p === null ? null : p.defaultPrevented })()')
check('空 composer、无选区时右键：只有「粘贴」（contenteditable 空态判据）', {
  menu: menuEmpty, prevented: emptyPrevented, text: emptyComposerPoint.text,
}, (v) => (v.text === '' && v.menu.count === 1 && v.menu.owner === boot.instanceId
    && JSON.stringify(v.menu.items) === JSON.stringify([EXPECT.paste]) && v.prevented === true)
    || `期望 composer 为空、menus=1 items=[${EXPECT.paste}] 且 defaultPrevented=true，实测 ${JSON.stringify(v)}`)
check('Esc 关掉空态菜单', await escapeMenu(), (v) => v === 0 || `Esc 之后还剩 ${v} 个菜单`)

// composer 粘贴后那段文本仍是选中态：textarea 段右键前必须把文档选区收掉——
// Chrome 在控件里右键选区之外会先收拢光标，带着残留选区测 field 路径，读到的
// 就是 collapsed 的选区（旧世界同一件事是靠重新 selectAll 挡住的）。
await press('Escape', 'Escape', 27)
await evaluate('(() => { document.activeElement?.blur(); window.getSelection().removeAllRanges(); return true })()')
const taSetup = await evaluate(`(() => {
  const ta = document.createElement('textarea')
  // 单行高度：右键坐标取垂直中心，80px 高的框里文字只在最上面一行，点中间会
  // 落在选区之外——Chrome 立刻收拢光标，field 路径读到的选区就空了。
  ta.style.cssText = 'position:fixed;left:45%;top:45%;width:320px;height:26px;z-index:2147483647'
  ta.value = ${JSON.stringify(DRAFT)}
  document.body.append(ta)
  window.__dshOiField__ = ta
  ta.focus()
  ta.setSelectionRange(${PICK[0]}, ${PICK[1]})
  const cs = getComputedStyle(ta)
  const r = ta.getBoundingClientRect()
  const c = document.createElement('canvas').getContext('2d')
  c.font = cs.font
  const dx = c.measureText(ta.value.slice(0, (${PICK[0]} + ${PICK[1]}) / 2)).width
  return {
    value: ta.value, start: ta.selectionStart, end: ta.selectionEnd,
    x: Math.round(r.x + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + dx),
    y: Math.round(r.y + r.height / 2),
  }
})()`)
check('合成 textarea：打进草稿并选中一段（field 路径的前置状态）', taSetup,
  (v) => (v.value === DRAFT && v.start === PICK[0] && v.end === PICK[1])
    || `期望 value=${DRAFT} 选区=${JSON.stringify(PICK)}，实测 ${JSON.stringify(v)}`)

await rightClick(taSetup.x, taSetup.y)
const menuField = await readMenu()
check('textarea 选区上右键：「复制」+「粘贴」两项（field 路径）', menuField,
  (v) => (v.count === 1 && v.owner === boot.instanceId
    && JSON.stringify(v.items) === JSON.stringify([EXPECT.copy, EXPECT.paste]))
    || `期望 [${EXPECT.copy}, ${EXPECT.paste}]，实测 ${JSON.stringify(v)}`)

const pastePointField = await itemPoint(EXPECT.paste)
if (pastePointField === null) abort('菜单里没有「粘贴」项，field 粘贴断言无法执行', JSON.stringify(menuField))
await leftClick(pastePointField.x, pastePointField.y)
await sleep(400)
const pastedField = await evaluate('(() => { const ta = window.__dshOiField__; return { value: ta.value, caret: ta.selectionStart, menus: document.querySelectorAll(".dsh-oi-menu").length } })()')
check('textarea 点「粘贴」后选区被替换，光标落在插入尾部（field 动作链）', {
  ...pastedField, expectValue, expectCaret: PICK[0] + SENTINEL.length,
}, (v) => (v.value === expectValue && v.caret === v.expectCaret && v.menus === 0)
  || `期望 value=${JSON.stringify(expectValue)} caret=${PICK[0] + SENTINEL.length}，实测 ${JSON.stringify(v)}`)

// 空 field 无选区：旧世界「只给粘贴」的判据，现在打在合成 textarea 上。
const taEmpty = await evaluate(`(() => {
  const ta = window.__dshOiField__
  ta.focus()
  ta.value = ''
  ta.setSelectionRange(0, 0)
  const r = ta.getBoundingClientRect()
  window.__dshOiCtxProbe__.last = null
  return { x: Math.round(r.x + 40), y: Math.round(r.y + r.height / 2) }
})()`)
await rightClick(taEmpty.x, taEmpty.y)
const menu5 = await readMenu()
check('空 textarea、无选区时右键：只有「粘贴」（field 路径）', menu5,
  (v) => (v.count === 1 && JSON.stringify(v.items) === JSON.stringify([EXPECT.paste]))
    || `期望 [${EXPECT.paste}]，实测 ${JSON.stringify(v)}`)
check('Esc 关掉菜单', await escapeMenu(), (v) => v === 0 || `Esc 之后还剩 ${v} 个菜单`)
await evaluate('(() => { const ta = window.__dshOiField__; ta.remove(); delete window.__dshOiField__; return true })()')

// ---- 6：不可输入、无选区 → 不接管 ----

await evaluate(`(() => {
  window.getSelection().removeAllRanges()
  if (document.activeElement !== null && document.activeElement !== document.body) document.activeElement.blur()
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
// 置顶项排第一，文本随行的置顶态在「置顶会话 / 取消置顶」之间翻转——这里只验它是
// 这两者之一（用真词典的值），后面三项与词典逐字相等。
check('有选中文本时右键侧边栏的行：开出来的是功能 2 的行菜单', {
  ...menu7, selected: row.selected, expect: boot.rowLabels, pinLabels: boot.rowPin,
}, (v) => (v.count === 1 && v.items.length === 4
    && v.pinLabels.includes(v.items[0])
    && JSON.stringify(v.items.slice(1)) === JSON.stringify(boot.rowLabels))
  || `期望 [置顶翻转, ${JSON.stringify(boot.rowLabels)}]，实测 ${JSON.stringify(v.items)}`)

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
