/**
 * 实测驱动：在运行中的 DSH 页面上驱动**页面自己那份插件实例**，跑功能 1 的断言，
 * 并确认侧边栏行的右键由官方菜单接管。
 *
 * 走裸 CDP（无 puppeteer 依赖），复用 [lib/cdp.mjs](lib/cdp.mjs) 的连接器与断言框架
 * ——判据语义（skip 也算失败、非零退出）只有一份实现，改一处不会漏掉另一处。
 *
 * **不注入 bundle，而是驱动真实例 + 自建可丢弃的靶子**。插件装在 profile 里，页面每次
 * 加载都自带一份实例；选择集读的是那份实例的 `selection` store，多选高亮读的是它画在
 * 行上的 `data-dsh-oi-selected`。靶子由 [lib/fixtures.mjs](lib/fixtures.mjs) 建，
 * 收尾删干净。
 *
 * 失败语义（这一条是重点）：**没测到 = 失败**。窄窗口时侧边栏是折叠的，一条
 * `[role="treeitem"]` 都查不到；前置检查不满足直接非零退出，任何 skipped 也计为失败。
 *
 * **默认打的是测试栈（3181）而不是日常那个 harness（3080）**，见
 * [lib/cdp.mjs](lib/cdp.mjs) 的 `resolveTarget`。先 `node scripts/test-stack.mjs up`。
 *
 * 用法：node scripts/verify-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过 Page.reload（同页连跑两次结果不可信）
 */
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'
import { createFixtures, cleanupFixtures, requireInstance } from './lib/fixtures.mjs'
import { dismissOnboarding } from './lib/onboarding.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
  await dismissOnboarding(evaluate)
}

// 展开所有折叠的工作区，让会话行够数。靶子工作区是随后才建的，它自己折着时由
// {@link PRELUDE} 里的 `fxWorkspaceRow` 展开。
await evaluate(`(async () => {
  for (const r of document.querySelectorAll('[role="treeitem"]')) {
    if (String(r.className).includes('_projectRow') && r.getAttribute('aria-expanded') === 'false') r.click()
  }
  await new Promise((r) => setTimeout(r, 1200))
  return true
})()`)

const instanceId = await requireInstance(evaluate)
console.log('[instance]', instanceId)

// ---- 前置检查：窗口够不够宽 --------------------------------------------------
const viewport = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
  const of = (k) => rows.filter((el) => String(el.className).includes(k))
  return {
    innerWidth: window.innerWidth,
    sidebar: document.querySelectorAll('[class*="_sidebar"]').length,
    treeitems: rows.length,
    sessions: of('_sessionRow').length,
    workspaces: of('_projectRow').length,
  }
})()`)
if (viewport.treeitems === 0 || viewport.sessions === 0 || viewport.workspaces < 2) {
  abort(
    '侧边栏没渲染出可操作的行（需要至少两个工作区行与一条会话行）。',
    `观测：${JSON.stringify(viewport)}\n`
    + '处理：窗口放宽到侧边栏展开（实测需 innerWidth ≥ 900），确认测试栈的 profile 里'
    + '装着本插件，然后不带参数重跑。',
  )
}

const fixtures = await createFixtures(evaluate)
console.log('[fixtures]', JSON.stringify(fixtures))

/**
 * 靶子行 + 页面侧读数。全部收敛到 `fx` 上，页面一次拿到 id。
 */
const PRELUDE = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const h = window.__dshOperationImprove__
  const fx = { workspaceId: ${JSON.stringify(fixtures.workspaceId)} }
  const rows = () => [...document.querySelectorAll('[role="treeitem"]')]
  const kindOf = (el) => String(el.className).includes('_sessionRow') ? 'session'
    : String(el.className).includes('_projectRow') ? 'workspace' : null
  /** 与 [../src/shared/row-probe.js] 同一套 fiber 反查。 */
  const idOf = (el, kind) => {
    let fiber = null
    for (const k of Object.keys(el)) if (k.startsWith('__reactFiber$')) { fiber = el[k]; break }
    const cands = kind === 'session'
      ? ['sessionId', 'node.id', 'row.id', 'item.id', 'session.id']
      : ['workspaceId', 'group.workspaceId', 'workspace.id', 'node.workspaceId', 'project.id']
    let depth = 0
    while (fiber && depth < 24) {
      const p = fiber.memoizedProps
      if (p && typeof p === 'object') {
        for (const path of cands) {
          const v = path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), p)
          if (typeof v === 'string' && v.length > 0) return v
        }
      }
      fiber = fiber.return; depth += 1
    }
    return null
  }
  const marked = (el) => el.getAttribute('data-dsh-oi-selected') !== null
  const pluginMenus = () => [...document.querySelectorAll('div[role="menu"]')]
    .filter((el) => el.classList.contains('dsh-oi-menu'))
  const officialMenus = () => [...document.querySelectorAll('div[role="menu"]')]
    .filter((el) => !el.classList.contains('dsh-oi-menu'))
  const state = () => ({ kind: h.selection.getKind(), ids: h.selection.getIds(), size: h.selection.size() })
  /** 靶子工作区行；折着的先展开，让会话行露出来。 */
  const fxWorkspaceRow = async () => {
    let el = rows().find((r) => kindOf(r) === 'workspace' && idOf(r, 'workspace') === fx.workspaceId) ?? null
    if (el !== null && el.getAttribute('aria-expanded') === 'false') {
      el.click(); await sleep(900)
      el = rows().find((r) => kindOf(r) === 'workspace' && idOf(r, 'workspace') === fx.workspaceId) ?? null
    }
    return el
  }
  const otherWorkspaceRow = () => rows().find((r) => kindOf(r) === 'workspace'
    && idOf(r, 'workspace') !== null && idOf(r, 'workspace') !== fx.workspaceId) ?? null
  /**
   * 会话侧挑侧栏上现有的那一行：非当前会话、非 blank。blank 会话永远不渲染行
   * （ui-workspace/src/client/tree.ts 的 sessionVisible()），公开 API 里也没有开关。
   */
  const pickSessionRow = () => rows().find((el) => kindOf(el) === 'session'
    && el.getAttribute('aria-selected') !== 'true'
    && idOf(el, 'session') !== null) ?? null
  const clickWith = (el, ctrl) => {
    el.dispatchEvent(new MouseEvent('click', {
      bubbles: true, cancelable: true, composed: true, button: 0, ctrlKey: ctrl, metaKey: false,
    }))
  }
  /**
   * 派发一次右键并回传观测值。
   *
   * 合成事件必须带 clientX/clientY：官方菜单用事件坐标定位，缺了会把卡片放在 (0,0)。
   */
  const rightClick = async (el) => {
    const rect = el.getBoundingClientRect()
    const evt = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, composed: true, button: 2, buttons: 2,
      clientX: Math.round(rect.left + 48), clientY: Math.round(rect.top + rect.height / 2),
    })
    el.dispatchEvent(evt)
    await sleep(400)
    return {
      defaultPrevented: evt.defaultPrevented,
      plugin: pluginMenus().length,
      official: officialMenus().length,
    }
  }
  /** 关掉任何开着的菜单：先点空白处，再补一次 Esc。 */
  const closeMenus = async () => {
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(250)
  }
`

const { check, report } = createChecker()

// 功能 1：单击带 ctrl/cmd 的行进入多选。
check('ctrl-click selects one workspace row', await evaluate(`(async () => {
  ${PRELUDE}
  await closeMenus()
  h.selection.clear()
  const row = await fxWorkspaceRow()
  if (row === null) return { bail: '靶子工作区行不在 DOM 里' }
  clickWith(row, true)
  await sleep(150)
  return { ...state(), marked: marked(row), id: idOf(row, 'workspace') }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.kind !== 'workspace') return `选择集 kind=${JSON.stringify(v.kind)}，应为 workspace`
  if (v.size !== 1) return `选择集有 ${v.size} 项，应为 1`
  if (v.marked !== true) return '行上没有 data-dsh-oi-selected 高亮'
  if (v.ids[0] !== v.id) return `选择集 id=${JSON.stringify(v.ids)} 与行反查 id=${JSON.stringify(v.id)} 不一致`
  return true
})

// 功能 1：同 kind 的第二次 ctrl-click 是追加。
check('ctrl-click adds a same-level row', await evaluate(`(async () => {
  ${PRELUDE}
  const first = await fxWorkspaceRow()
  const second = otherWorkspaceRow()
  if (first === null || second === null) return { bail: '工作区行不足两条' }
  clickWith(second, true)
  await sleep(150)
  return { ...state(), firstMarked: marked(first), secondMarked: marked(second),
    firstId: idOf(first, 'workspace'), secondId: idOf(second, 'workspace') }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.kind !== 'workspace') return `选择集 kind=${JSON.stringify(v.kind)}，应为 workspace`
  if (v.size !== 2) return `选择集有 ${v.size} 项，应为 2`
  if (v.firstMarked !== true || v.secondMarked !== true) return '两条选中行没有同时带高亮'
  if (!v.ids.includes(v.firstId) || !v.ids.includes(v.secondId)) return '选择集里的 id 与两条行对不上'
  return true
})

// 功能 1：换 kind 时选择集重来（不是拒绝，也不是混选）。
check('switching kind restarts the selection', await evaluate(`(async () => {
  ${PRELUDE}
  const ws = await fxWorkspaceRow()
  const session = pickSessionRow()
  if (ws === null || session === null) return { bail: '缺工作区行或会话行' }
  clickWith(session, true)
  await sleep(150)
  return { ...state(), wsMarked: marked(ws), sessionMarked: marked(session), sessionId: idOf(session, 'session') }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.kind !== 'session') return `选择集 kind=${JSON.stringify(v.kind)}，应为 session`
  if (v.size !== 1) return `选择集有 ${v.size} 项，应为 1`
  if (v.wsMarked !== false) return '切到会话后旧工作区行仍带高亮'
  if (v.sessionMarked !== true) return '会话行没有高亮'
  if (v.ids[0] !== v.sessionId) return '选择集 id 与会话行对不上'
  return true
})

// 功能 1：再点一次已选中的行 = 取消这一项。
check('ctrl-click again toggles the row off', await evaluate(`(async () => {
  ${PRELUDE}
  const session = pickSessionRow()
  if (session === null) return { bail: '没有可点的会话行' }
  clickWith(session, true)
  await sleep(150)
  return { ...state(), marked: marked(session) }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.size !== 0) return `取消后选择集仍有 ${v.size} 项`
  if (v.kind !== null) return `空选择集的 kind=${JSON.stringify(v.kind)}，应为 null`
  if (v.marked !== false) return '取消后行上仍带高亮'
  return true
})

// 功能 1：不带修饰键的普通点击清空选择集（并照常导航）。
check('plain click clears the selection', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  const ws = await fxWorkspaceRow()
  const session = pickSessionRow()
  if (ws === null || session === null) return { bail: '缺工作区行或会话行' }
  clickWith(ws, true)
  clickWith(session, true)
  await sleep(120)
  const before = state()
  clickWith(ws, false)
  await sleep(300)
  return { before, after: state(), marked: marked(ws) }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.before.size === 0) return '普通点击之前没建出选择集，这条等于没测'
  if (v.after.size !== 0) return `普通点击后选择集仍有 ${v.after.size} 项`
  if (v.after.kind !== null) return `普通点击后 kind=${JSON.stringify(v.after.kind)}，应为 null`
  if (v.marked !== false) return '普通点击后行上仍带高亮'
  return true
})

// 侧边栏工作区行的右键归官方：插件不弹卡片，官方菜单是唯一一张。
check('right-click workspace row leaves the official menu in charge', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  await closeMenus()
  const ws = await fxWorkspaceRow()
  if (ws === null) return { bail: '靶子工作区行不在 DOM 里' }
  return await rightClick(ws)
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.plugin !== 0) return `本插件仍弹了 ${v.plugin} 张菜单`
  if (v.official < 1) return '官方右键菜单没出现——拦截器可能还没摘干净'
  return true
})

// 会话行同理。
check('right-click session row leaves the official menu in charge', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  await closeMenus()
  const session = pickSessionRow()
  if (session === null) return { bail: '没有可右键的会话行' }
  return await rightClick(session)
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.plugin !== 0) return `本插件仍弹了 ${v.plugin} 张菜单`
  if (v.official < 1) return '官方右键菜单没出现——拦截器可能还没摘干净'
  return true
})

// 带着多选右键也不会出现插件自己的批量卡片，选择集保持不动。
check('right-click with a multi-selection opens no plugin batch menu', await evaluate(`(async () => {
  ${PRELUDE}
  await closeMenus()
  h.selection.clear()
  const first = await fxWorkspaceRow()
  const second = otherWorkspaceRow()
  if (first === null || second === null) return { bail: '工作区行不足两条' }
  clickWith(first, true)
  clickWith(second, true)
  const before = state()
  const menu = await rightClick(second)
  return { before, after: state(), ...menu }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.before.size !== 2) return `右键前选择集有 ${v.before.size} 项，应为 2`
  if (v.plugin !== 0) return `批量卡片仍在：${v.plugin} 张`
  if (v.official < 1) return '官方右键菜单没出现'
  if (v.after.size !== 2) return `右键后选择集变成 ${v.after.size} 项`
  return true
})

// 收尾在 dispose **之前**：删除工作区靠的是句柄上的 `services`，dispose 之后句柄就没了。
const cleaned = await cleanupFixtures(evaluate)
console.log('[cleanup]', JSON.stringify(cleaned))
if (cleaned.deleted !== true || cleaned.removed !== true) {
  console.warn(`[cleanup] 靶子没收干净：${JSON.stringify(cleaned)}——靶子工作区的记录与目录都应当删掉。`)
}

// 卸载：选择监听、高亮与调试句柄都被摘掉；右键仍然由官方菜单接住。
check('dispose removes the plugin and keeps the official menu', await evaluate(`(async () => {
  ${PRELUDE}
  await closeMenus()
  h.selection.clear()
  // 靶子已经在上面收尾删掉了，这里随便挑一条现成的工作区行。
  const ws = otherWorkspaceRow()
  const session = pickSessionRow()
  if (ws === null || session === null) return { bail: '缺工作区行或会话行' }
  clickWith(ws, true)
  await sleep(120)
  const before = { ...state(), marked: marked(ws) }
  h.dispose()
  await sleep(300)
  const after = {
    styleGone: document.querySelector('style[data-plugin="@Tinnikx/dsh-operation-improve"]') === null,
    handleGone: window.__dshOperationImprove__ === undefined,
    highlightsGone: document.querySelectorAll('[data-dsh-oi-selected]').length === 0,
  }
  const menu = await rightClick(session)
  return { before, after, menu }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.before.size !== 1) return '卸载前没建出选择集，这条等于没测'
  if (v.after.styleGone !== true) return '样式表没被摘掉'
  if (v.after.handleGone !== true) return '调试句柄没被摘掉'
  if (v.after.highlightsGone !== true) return '高亮属性还留在 DOM 上'
  if (v.menu.plugin !== 0) return `卸载后仍弹了 ${v.menu.plugin} 张插件菜单`
  if (v.menu.official < 1) return '卸载后官方右键菜单没出现'
  return true
})

conn.ws.close()
report()
