/**
 * 实测驱动：在运行中的 DSH 页面上驱动**页面自己那份插件实例**，跑功能 1/2 的断言。
 *
 * 走裸 CDP（无 puppeteer 依赖），复用 [lib/cdp.mjs](lib/cdp.mjs) 的连接器与断言框架
 * ——判据语义（skip 也算失败、非零退出）只有一份实现，改一处不会漏掉另一处。
 *
 * **不注入 bundle，而是驱动真实例 + 自建可丢弃的靶子**。插件装在 profile 里，页面每次
 * 加载都自带一份实例；会话那一支菜单的条目要从真 `slots` 服务里读出来才渲染得出来，
 * 而注入一份实例只会得到脚本手搓的 ctx——两边都读不到那一格条目表。菜单项的动作因此
 * 是**真服务**（`workspaces.delete`、`sessions.fork`、`archiveSession`……），所以破坏性项
 * 只对脚本自己建的靶子点，靶子由 [lib/fixtures.mjs](lib/fixtures.mjs) 在收尾删干净。
 *
 * 失败语义（这一条是重点）：**没测到 = 失败**。窄窗口时侧边栏是折叠的，一条
 * `[role="treeitem"]` 都查不到，早先的版本会把每条断言记成 skipped 然后以退出码 0 结束
 * ——看起来通过，实际什么都没验证。现在前置检查不满足直接非零退出，任何 skipped 也计
 * 为失败。
 *
 * **默认打的是测试栈（3181）而不是日常那个 harness（3080）**，见
 * [lib/cdp.mjs](lib/cdp.mjs) 的 `resolveTarget`。先 `node scripts/test-stack.mjs up`。
 *
 * 用法：node scripts/verify-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过 Page.reload（同页连跑两次结果不可信）
 */
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'
import { createFixtures, cleanupFixtures, requireInstance } from './lib/fixtures.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
}

// 展开所有折叠的工作区，让会话行够数。靶子工作区是随后才建的，它自己折着时由
// {@link fxWorkspaceRow} 展开。
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
if (viewport.treeitems === 0 || viewport.sessions === 0) {
  abort(
    '侧边栏没渲染出可操作的行。',
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
  const ownerClass = 'dsh-oi-menu--' + h.instanceId
  const svc = h.services
  const t = h.locale.t
  const ownText = (key, n) => h.locale.tOwn(key, { n })
  /** 本插件开的那张卡片：portal 到 body 下，归属只能靠类名认。 */
  const mine = () => [...document.querySelectorAll('div[role="menu"]')].filter((el) =>
    el.classList.contains('dsh-oi-menu') && el.classList.contains(ownerClass))
  const upstreamMenus = () => [...document.querySelectorAll('div[role="menu"]')].filter((el) =>
    !el.classList.contains('dsh-oi-menu'))
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
  /** 靶子工作区行；折着的先展开，让会话行露出来。 */
  const fxWorkspaceRow = async () => {
    let el = rows().find((r) => kindOf(r) === 'workspace' && idOf(r, 'workspace') === fx.workspaceId) ?? null
    if (el !== null && el.getAttribute('aria-expanded') === 'false') {
      el.click(); await sleep(900)
      el = rows().find((r) => kindOf(r) === 'workspace' && idOf(r, 'workspace') === fx.workspaceId) ?? null
    }
    return el
  }
  /**
   * 会话菜单要点的行：靶子里**没有**会话——sessions.create 建出来的会话是 blank，
   * 而 blank 会话永远不渲染行（ui-workspace/src/client/tree.ts:238-256 的 sessionVisible()），
   * 公开 API 里也没有开关。所以会话侧改成挑侧栏上现有的那一行：非当前会话、非归档、能反查到 id。
   * 这几格选中它测到的都是真交互；不可逆的那些（分叉、归档）由调用方打桩。
   */
  const pickSessionRow = () => rows().find((el) => kindOf(el) === 'session'
    && el.getAttribute('aria-selected') !== 'true'
    && idOf(el, 'session') !== null
    && svc.sessions.list.getSnapshot().byId[idOf(el, 'session')]?.blank !== true) ?? null
  const sessionIdOf = (el) => (el === null ? null : idOf(el, 'session'))
  /** 同一 kind 的第二行（靶子之外），批量分支要两行。 */
  const otherRow = (kind) => rows().find((r) => kindOf(r) === kind
    && (kind === 'session' ? r !== pickSessionRow() : idOf(r, 'workspace') !== fx.workspaceId)) ?? null
  /**
   * 派发右键事件并回传事件对象本身。
   *
   * 直接返回 dispatchEvent 的返回值（布尔）的话，调用方读到的 evt.defaultPrevented
   * 就是 undefined，「有没有拦下原生菜单」这条断言会永远红。
   */
  const rightClick = (el, x, y) => {
    const evt = new MouseEvent('contextmenu', {
      bubbles: true, cancelable: true, clientX: x, clientY: y, view: window,
    })
    el.dispatchEvent(evt)
    return evt
  }
  const labels = (menu) => [...menu.querySelectorAll('button[role="menuitem"]')]
    .map((b) => (b.textContent ?? '').trim())
  const itemByLabel = (menu, label) => [...menu.querySelectorAll('button[role="menuitem"]')]
    .find((b) => (b.textContent ?? '').trim().startsWith(label)) ?? null
  /**
   * 收尾用：把本插件开着的卡片都关掉，**并等到它真的从 DOM 上消失**。
   *
   * 两处都发 Esc——只发 document 时收不干净。关闭是 React 卸载，同步读到的还是那 1 张，
   * 所以调用方判 mine().length === 0 之前必须 await closeAll()。
   */
  const closeAll = async () => {
    for (const target of [document, window]) {
      target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    }
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
    for (let n = 0; n < 12 && mine().length > 0; n += 1) await sleep(50)
  }
  const pinnedIds = () => svc.workspaces.list.getSnapshot().pinnedSessionIds
  const archivedIds = () => svc.workspaces.list.getSnapshot().archivedSessionIds
  const sessionRow = (id) => svc.sessions.list.getSnapshot().byId[id]
  /**
   * catalog 里某个命令的 aria-keyshortcuts 期望值；查不到或为空一律折成 null，
   * 这样菜单上 getAttribute 的结果可以直接逐字比。
   *
   * **web runtime 下这三行本来就是空的**：shortcuts/src/client/registry.ts:129 的
   * aria: enabled ? … : undefined，而 bindingIssue（shortcuts/src/configuration.ts:102-112）
   * 会把浏览器不放行的组合判成 reserved / unsupported-browser。所以判据只能是「对齐 catalog」，
   * 不能是「非空」。
   */
  const lookupShortcut = (id) => svc.shortcuts.catalog.getSnapshot().find((r) => r.id === id) ?? null
  const ariaOf = (row) => (row === null || row.aria === undefined || row.aria === null ? null : row.aria)
  /** 换掉实例上的一个方法做打桩：动作回调在调用时才读它，所以这一招能拦下且不改数据。 */
  const stubMethod = (obj, key, impl) => {
    const own = Object.getOwnPropertyDescriptor(obj, key)
    obj[key] = impl
    return () => {
      if (own === undefined) delete obj[key]
      else Object.defineProperty(obj, key, own)
    }
  }
`

const { check, report } = createChecker()

// 文案的两个来源都到位：`locale` 必须列进 `inject`（漏了 cordis 在 `ctx.locale` 上给
// undefined，插件启动就炸），本插件自己那份词典必须每个语言都有——缺一个不报错，只会让
// 那个语言下的批量项静默落回英文。
//
// 「切语言」走真 UI：设置面板里那枚 Language 行。**不能去改 `document.documentElement.lang`**
// ——它只是 `locale/src/client/index.ts:148-153` 的单向镜像，`translate()` 读的是
// `snapshot.active`，改镜像什么都不会发生（实测两档读出同一句话）。
const localeProbe = await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const h = window.__dshOperationImprove__
  const own = ['batch.deleteWorkspaces', 'confirm.deleteWorkspaces', 'selection.paste']
  const upstream = ['rename', 'menu.fork', 'menu.archiveSession', 'menu.unarchiveSession',
    'menu.pinSession', 'menu.unpinSession', 'actions.newSession', 'delete.workspace',
    'rename.session.title', 'field.sessionName']
  const read = () => ({ html: document.documentElement.lang,
    own: own.map((k) => h.locale.tOwn(k, { n: 2 })), upstream: upstream.map((k) => h.locale.t(k)) })
  const fns = ['t', 'tCommon', 'tOwn'].filter((k) => typeof h.locale[k] !== 'function')
  if (fns.length > 0) return { bail: '句柄上缺 translate 函数：' + JSON.stringify(fns) }
  // 面板里 General 是 account(-10) 之后的第一格（ui-settings-general/src/client/index.ts:233）。
  const navCell = (label) => [...document.querySelectorAll('[data-shortcut-modal="settings"] nav button')]
    .find((b) => (b.textContent ?? '').includes(label)) ?? null
  const trigger = [...document.querySelectorAll('button[aria-haspopup="dialog"][aria-expanded]')]
    .find((b) => (b.getAttribute('aria-label') ?? '').length > 0) ?? null
  if (trigger === null) return { bail: '侧栏页脚没有设置面板的触发按钮' }
  const openPanel = async () => {
    trigger.click()
    for (let n = 0; n < 20; n += 1) {
      await sleep(120)
      const panel = document.querySelector('[data-shortcut-modal="settings"]')
      if (panel !== null) return panel
    }
    return null
  }
  const panel = await openPanel()
  if (panel === null) return { bail: '点了设置按钮但面板没出现' }
  const general = navCell('通用') ?? navCell('General')
  if (general === null) return { bail: '设置面板里找不到「通用设置」那一格' }
  general.click()
  await sleep(400)
  const selector = [...panel.querySelectorAll('button[aria-haspopup="menu"]')]
    .find((b) => ['中文', 'English'].includes((b.textContent ?? '').trim())) ?? null
  if (selector === null) {
    const rows = [...panel.querySelectorAll('button[aria-haspopup="menu"]')].map((b) => (b.textContent ?? '').trim())
    return { bail: '通用设置里没有 Language 那一行，看到的菜单按钮是 ' + JSON.stringify(rows) }
  }
  const before = read()
  const activeLabel = (selector.textContent ?? '').trim()
  // 另一档的显示名：枚举里另一项（中文 / English）。
  const otherLabel = activeLabel === '中文' ? 'English' : '中文'
  selector.click()
  await sleep(400)
  const choice = [...document.querySelectorAll('div[role="menu"] button[role="menuitem"]')]
    .find((b) => (b.textContent ?? '').trim() === otherLabel) ?? null
  if (choice === null) {
    const seen = [...document.querySelectorAll('div[role="menu"] button')].map((b) => (b.textContent ?? '').trim())
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    return { bail: 'Language 菜单里没有 ' + JSON.stringify(otherLabel) + '，看到的是 ' + JSON.stringify(seen) }
  }
  choice.click()
  await sleep(900)
  const after = read()
  // 切回去：设置项会写 host 偏好，不复原就污染副本里的下一次跑。
  const backLabel = activeLabel
  const backSelector = [...panel.querySelectorAll('button[aria-haspopup="menu"]')]
    .find((b) => (b.textContent ?? '').trim() === otherLabel) ?? null
  let restored = null
  if (backSelector !== null) {
    backSelector.click()
    await sleep(400)
    const back = [...document.querySelectorAll('div[role="menu"] button[role="menuitem"]')]
      .find((b) => (b.textContent ?? '').trim() === backLabel) ?? null
    if (back !== null) { back.click(); await sleep(900) }
    restored = read()
  }
  // 关掉面板，别把它留给后面的断言。
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(300)
  const panelGone = document.querySelector('[data-shortcut-modal="settings"]') === null
  const misses = []
  for (const [name, row] of [['起手', before], ['切过去', after], ['切回来', restored]]) {
    if (row === null || row === undefined) continue
    row.own.forEach((text, i) => { if (text === own[i]) misses.push(name + ' 本插件:' + own[i]) })
    row.upstream.forEach((text, i) => { if (text === upstream[i]) misses.push(name + ' 上游:' + upstream[i]) })
  }
  return { bail: null, keys: { own, upstream }, activeLabel, otherLabel,
    before, after, restored, misses, panelGone,
    fns, kinds: { before: before.html, after: after.html, restored: restored === null ? null : restored.html } }
})()`)

check('locale wired', localeProbe, (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.misses.length > 0) return `词典查不出这些键（查不到会返回键名本身）：${v.misses.join(' ')}`
  if (v.restored === null) return '没能把语言切回去——这条污染了 profile 的偏好，没测到「切回去」'
  // `t` 是调用时读 active locale，所以两档读出同一句话 = 切换根本没发生（或者词典只注册了一份）。
  if (v.before.own[0] === v.after.own[0]) {
    return `切到 ${JSON.stringify(v.otherLabel)} 之后本插件文案没变（${JSON.stringify(v.after.own[0])}）——词典只注册了一份`
  }
  if (v.before.upstream[0] === v.after.upstream[0]) {
    return `切过去之后上游文案没变（${JSON.stringify(v.after.upstream[0])}）——locale 没进 inject`
  }
  if (v.restored.own[0] !== v.before.own[0] || v.restored.upstream[0] !== v.before.upstream[0]) {
    return '切回原语言之后读数没复原——复原动作没生效'
  }
  if (v.kinds.before === v.kinds.after) {
    return `document lang 在切换前后都是 ${JSON.stringify(v.kinds.before)}，镜像没跟着走`
  }
  if (v.panelGone !== true) return '设置面板没关掉，会挡住后面的断言'
  return true
})

check('stylesheet inserted', await evaluate(
  `!!document.querySelector('style[data-plugin="@Tinnikx/dsh-operation-improve"]')`,
), (v) => v === true || '样式表没插进 <head>')

check('rows found', await evaluate(`(async () => {
  ${PRELUDE}
  const probe = rows().map((el) => {
    const kind = kindOf(el)
    return { kind, id: kind === null ? null : idOf(el, kind) }
  })
  const fxWs = await fxWorkspaceRow()
  const sess = pickSessionRow()
  return { total: probe.length, sessions: probe.filter((p) => p.kind === 'session').length,
    workspaces: probe.filter((p) => p.kind === 'workspace').length,
    resolved: probe.filter((p) => p.id !== null).length,
    fxWorkspaceRow: fxWs !== null, sessionRow: sess !== null,
    sessionTitle: sess === null ? null : (sessionRow(sessionIdOf(sess))?.displayTitle ?? null),
    current: document.querySelectorAll('[role="treeitem"][aria-selected="true"]').length,
    needOthers: { session: otherRow('session') !== null, workspace: otherRow('workspace') !== null } }
})()`), (v) => {
  if (v.total === 0) return '一条行都没有，实测未发生'
  if (v.resolved === 0) return 'fiber 反查一个 id 都没拿到，功能整体失灵'
  if (v.resolved < v.total - 1) return `${v.total} 行中只反查出 ${v.resolved} 个 id，超出容忍（允许 1 行拿不到）`
  if (v.fxWorkspaceRow !== true) return '靶子工作区行不在侧边栏里，后面的断言无法只对靶子操作'
  if (v.sessionRow !== true) return '侧栏里挑不出可操作的会话行（非 blank、非当前、有 id），会话侧全部断言无从下手'
  if (typeof v.sessionTitle !== 'string' || v.sessionTitle === '') return '挑中的会话行标题读成空串'
  if (v.current !== 1) return `侧栏里有 ${v.current} 个当前会话行（应有 1 个），挑不出「非当前」的那一行`
  if (v.needOthers.session !== true || v.needOthers.workspace !== true) {
    return '靶子之外没有第二行同 kind 的行，批量分支测不到'
  }
  return true
})

// 功能 1：ctrl+点击两行，断言选择集与高亮。
check('ctrl-click multi-select', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, ctrlKey: true, view: window,
  }))
  const picked = pickSessionRow()
  const other = otherRow('session')
  sel.clear()
  if (picked === null || other === null) return { bail: '侧栏里没有两行可 ctrl+点击的会话' }
  fire(picked); fire(other)
  await sleep(80)
  const size2 = sel.size()
  const highlighted = document.querySelectorAll('[data-dsh-oi-selected]').length
  fire(other)
  const sizeAfterToggleOff = sel.size()
  fire(other)
  return { bail: null, kind: sel.getKind(), size: size2, highlighted, sizeAfterToggleOff, finalSize: sel.size(),
    holdsPicked: sel.has('session', sessionIdOf(picked)) }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.kind !== 'session') return `kind=${JSON.stringify(v.kind)}，应为 session`
  if (v.size !== 2) return `ctrl+点击两行后 size=${v.size}，应为 2`
  if (v.highlighted !== 2) return `高亮 ${v.highlighted} 个，应为 2`
  if (v.sizeAfterToggleOff !== 1) return `再点一次应摘除，size=${v.sizeAfterToggleOff}，应为 1`
  if (v.finalSize !== 2) return `第三次点回 size=${v.finalSize}，应为 2`
  if (v.holdsPicked !== true) return '选择集里没有点的那一行，选择没落在点上'
  return true
})

check('ctrl-click suppresses row navigation', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  sel.clear()
  const picked = pickSessionRow()
  const wsRow = await fxWorkspaceRow()
  if (picked === null || wsRow === null) return { bail: '侧栏里挑不出可点的会话行或靶子工作区行' }
  const before = document.querySelectorAll('[aria-selected="true"]').length
  const beforeUrl = location.href
  const wsExpandedBefore = wsRow.getAttribute('aria-expanded')
  const evt = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window })
  picked.dispatchEvent(evt)
  wsRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  await sleep(200)
  const result = {
    bail: null,
    defaultPrevented: evt.defaultPrevented,
    ariaSelectedCountUnchanged: document.querySelectorAll('[aria-selected="true"]').length === before,
    urlUnchanged: location.href === beforeUrl,
    workspaceExpandUnchanged: wsRow.getAttribute('aria-expanded') === wsExpandedBefore,
  }
  sel.clear()
  return result
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.defaultPrevented !== true) return 'ctrl+点击没有 preventDefault，行自身的 onClick 会照跑'
  if (v.ariaSelectedCountUnchanged !== true) return 'aria-selected 计数变了，说明会话被真的打开了'
  if (v.urlUnchanged !== true) return 'URL 变了，导航没被挡住'
  if (v.workspaceExpandUnchanged !== true) return 'aria-expanded 变了，工作区被真的展开/收起了'
  return true
})

check('kind switch clears', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  const picked = pickSessionRow()
  const other = otherRow('session')
  const wsRow = await fxWorkspaceRow()
  if (picked === null || other === null || wsRow === null) return { bail: '侧栏里凑不出两行会话加靶子工作区行' }
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  sel.clear()
  fire(picked); fire(other)
  const sizeBefore = sel.size()
  fire(wsRow)
  const result = { bail: null, sizeBefore, kind: sel.getKind(), size: sel.size() }
  sel.clear()
  return result
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.sizeBefore !== 2) return `切换前应有 2 个选中，实际 ${v.sizeBefore}`
  if (v.size !== 1) return `切 kind 后应只剩新点的那 1 个，实际 ${v.size}`
  if (v.kind !== 'workspace') return `kind=${JSON.stringify(v.kind)}，切到工作区行后应是 workspace`
  return true
})

// 功能 2 单选：右键一个会话行。
//
// **判据是逐项等于上游那一份**。会话菜单的每一项都是 `sidebar.workspaces.session.menu.item`
// 这一格 slot 里注册的条目（上游 `ui-workspace`），本插件渲染的就是它们本身——所以两份
// 菜单按定义应当逐项相等（文案 / 图标 / 顺序）。归档项在菜单里，上游那四项原样在。
check('contextmenu single (session)', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  sel.clear()
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  const evt = rightClick(row, 200, 220)
  await sleep(350)
  const menus = mine()
  const menu = menus.length === 1 ? menus[0] : null
  const rect = menu === null ? null : menu.getBoundingClientRect()
  return { bail: null, defaultPrevented: evt.defaultPrevented, menus: menus.length,
    items: menu === null ? null : labels(menu),
    icons: menu === null ? null : [...menu.querySelectorAll('button[role="menuitem"] svg')]
      .map((s) => (s.getAttribute('viewBox') ?? '') + '|' + (s.getAttribute('width') ?? '') + '|' + (s.getAttribute('height') ?? '')),
    lang: document.documentElement.lang,
    expected: { pin: t('menu.pinSession'), unp: t('menu.unpinSession'), rename: t('rename'),
      fork: t('menu.fork'), archive: t('menu.archiveSession') },
    material: menu === null ? null : menu.getAttribute('data-menu-material'),
    zIndex: menu === null ? null : getComputedStyle(menu).zIndex,
    inViewport: rect === null ? null : (rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1) }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.defaultPrevented !== true) return '没有 preventDefault，浏览器原生菜单会弹出来'
  if (v.menus !== 1) return `本插件的菜单有 ${v.menus} 张，应为 1`
  if (v.items === null) return '菜单没渲染出来'
  if (v.items.length !== 4) return `会话单选菜单应有上游那 4 项（pin/rename/fork/archive），实际 ${JSON.stringify(v.items)}`
  const e = v.expected
  if (v.items[0] !== e.pin && v.items[0] !== e.unp) {
    return `首项应是置顶翻转（${JSON.stringify([e.pin, e.unp])} 之一），实际 ${JSON.stringify(v.items[0])}`
  }
  if (v.items[1] !== e.rename) return `第二项应是重命名 ${JSON.stringify(e.rename)}，实际 ${JSON.stringify(v.items[1])}`
  if (v.items[2] !== e.fork) return `第三项应是分叉 ${JSON.stringify(e.fork)}，实际 ${JSON.stringify(v.items[2])}`
  if (v.items[3] !== e.archive) return `末项应是归档 ${JSON.stringify(e.archive)}，实际 ${JSON.stringify(v.items[3])}`
  if (v.icons.some((s) => s === '||')) return `有条目没有图标：${JSON.stringify(v.icons)}`
  if (v.material !== 'translucent') return `卡片 data-menu-material=${JSON.stringify(v.material)}，应为 translucent`
  if (v.zIndex !== '2147483000') return `卡片 z-index=${JSON.stringify(v.zIndex)}，本插件的浮层要压过应用自己的`
  if (v.inViewport !== true) return '菜单溢出视口，夹边失效'
  return true
})

check('escape closes', await evaluate(`(async () => {
  ${PRELUDE}
  const openedBefore = mine().length > 0
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await sleep(200)
  return { openedBefore, menuGone: mine().length === 0 }
})()`), (v) => {
  if (v.openedBefore !== true) return '按 Esc 之前菜单就不在，这条没测到关闭行为'
  if (v.menuGone !== true) return 'Esc 没能关掉菜单'
  return true
})

// 常驻容器参与布局的代价是整页横向跳动：菜单一开，上游渲染进来的锚点包装自带 18px 行盒，
// body 内容高度顶过视口，冒出的竖直滚动条把 documentElement.clientWidth 收窄一个滚动条宽，
// 会话区与右侧导航列跟着挪。判据取「开与关之间这份几何一个数都不许变」——用户看到的就是这个。
check('opening the menu does not shift the page geometry', await evaluate(`(async () => {
  ${PRELUDE}
  const conv = document.querySelector('[data-conversation-scroll]')
  if (conv === null) return { bail: '会话区不在页面上，几何比对等于没测' }
  const read = () => {
    const box = conv.getBoundingClientRect()
    const host = document.querySelector('.dsh-oi-menu__host')
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
      innerHeight: window.innerHeight,
      convWidth: Math.round(box.width),
      convLeft: Math.round(box.left),
      host: host === null ? null : (() => {
        const b = host.getBoundingClientRect()
        return { w: Math.round(b.width), h: Math.round(b.height), pos: getComputedStyle(host).position }
      })(),
    }
  }
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  const before = read()
  rightClick(row, 200, 240)
  await sleep(350)
  const opened = mine().length === 1
  const during = read()
  await closeAll()
  const after = read()
  return { bail: null, opened, before, during, after }
})()`), (v) => {
  if (v.bail != null) return '没测到：' + v.bail
  if (v.opened !== true) return '菜单没开成一张卡片，几何比对等于没测'
  if (v.during.host === null) return '菜单开了但 .dsh-oi-menu__host 不在 DOM 里，这条等于没测'
  if (v.during.host.pos !== 'fixed') {
    return '常驻容器 position=' + v.during.host.pos + '，没脱流——它留在 body 文档流里'
  }
  if (v.during.host.w !== 0 || v.during.host.h !== 0) {
    return '常驻容器占 ' + v.during.host.w + '×' + v.during.host.h + 'px，菜单开着时它占了位'
  }
  if (v.during.clientWidth !== v.before.clientWidth) {
    return '菜单开着时 documentElement.clientWidth 从 ' + v.before.clientWidth + ' 变成 '
      + v.during.clientWidth + '（scrollHeight ' + v.before.scrollHeight + ' → ' + v.during.scrollHeight
      + '，视口高 ' + v.before.innerHeight + '）——竖直滚动条冒出，整页横向跳动'
  }
  if (v.during.convWidth !== v.before.convWidth || v.during.convLeft !== v.before.convLeft) {
    return '菜单开着时会话区从 ' + v.before.convLeft + '+' + v.before.convWidth
      + ' 变成 ' + v.during.convLeft + '+' + v.during.convWidth + '——会话区在跟着抖'
  }
  if (v.after.clientWidth !== v.before.clientWidth || v.after.convWidth !== v.before.convWidth) {
    return '关掉菜单后几何没回到基线：' + JSON.stringify({ before: v.before.clientWidth, after: v.after.clientWidth })
  }
  return true
})

// 单选工作区：三项必须逐字等于上游词典。这条和上一条合起来覆盖单选的全部项——都对上，
// 「同一个动作在两个菜单里叫两个名字」就不可能再发生。首项「新会话」不在上游那个「...」
// 菜单里（上游把它放在行 hover 的第二枚按钮上），它是补齐的那一项。
check('contextmenu single (workspace)', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  sel.clear()
  const row = await fxWorkspaceRow()
  if (row === null) return { bail: '靶子工作区行不在 DOM 里' }
  const evt = rightClick(row, 200, 280)
  await sleep(350)
  const menus = mine()
  const menu = menus.length === 1 ? menus[0] : null
  return { bail: null, defaultPrevented: evt.defaultPrevented, menus: menus.length,
    items: menu === null ? null : labels(menu),
    danger: menu === null ? null : (() => {
      const bs = [...menu.querySelectorAll('button[role="menuitem"]')]
      const last = bs[bs.length - 1]
      return { color: getComputedStyle(last).color,
        icon: last.querySelector('svg') === null ? null : getComputedStyle(last.querySelector('svg')).color,
        // 前面那两项的正常色：.danger 相对它们才叫「变了色」。
        normalColor: bs.length > 1 ? getComputedStyle(bs[bs.length - 2]).color : null }
    })(),
    expected: { newSession: t('actions.newSession'), rename: t('rename'), del: t('delete.workspace') } }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.defaultPrevented !== true) return '没有 preventDefault，浏览器原生菜单会弹出来'
  if (v.menus !== 1) return `本插件的菜单有 ${v.menus} 张，应为 1`
  if (v.items === null) return '菜单没渲染出来'
  if (JSON.stringify(v.items) !== JSON.stringify([v.expected.newSession, v.expected.rename, v.expected.del])) {
    return `应是 [新会话, 重命名, 删除工作区]，实际 ${JSON.stringify(v.items)}`
  }
  if (v.danger === null) return '取不到末项'
  // `.danger`（`Menu.module.css:226-239`）同时给文字和图标上 error 档，所以两者同色才是
  // 危险配色的样子；两者不同色说明只染了一个，而且这里没有第二份可以对照，只能查同色。
  if (v.danger.icon === null) return '删除项没有图标'
  if (v.danger.icon !== v.danger.color) {
    return `删除项的文字 ${JSON.stringify(v.danger.color)} 与图标 ${JSON.stringify(v.danger.icon)} 不同色——危险配色只落了一半`
  }
  if (v.danger.color === v.normalColor) return '删除项没有危险配色，与前面两项同色'
  return true
})

// 删除工作区走上游那个对话框的原文；点「取消」不该发出任何服务调用。靶子工作区不能真
// 删——`window.confirm` 打桩为 false，所以这一条只验确认框文案与服务调用计数。
check('delete workspace confirms with the upstream wording', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  sel.clear()
  const row = await fxWorkspaceRow()
  if (row === null) return { bail: '靶子工作区行不在 DOM 里' }
  rightClick(row, 200, 280)
  await sleep(300)
  const menus = mine()
  if (menus.length !== 1) { await closeAll(); return { bail: '菜单没打开' } }
  const menu = menus[0]
  const titleText = (row.querySelector('[class*="_title"]')?.textContent ?? '').trim()
  const realConfirm = window.confirm
  let asked = null
  window.confirm = (m) => { asked = m; return false }
  const item = itemByLabel(menu, t('delete.workspace'))
  if (item === null) { window.confirm = realConfirm; await closeAll(); return { bail: '菜单里没有删除项' } }
  item.click()
  await sleep(250)
  window.confirm = realConfirm
  const alive = rows().some((r) => kindOf(r) === 'workspace' && idOf(r, 'workspace') === fx.workspaceId)
  await closeAll()
  return { bail: null, asked, titleText, stillThere: alive, expected: { title: t('delete.workspace'), desc: t('delete.desc', { name: titleText }) } }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.asked === null) return '点删除没弹确认框'
  if (typeof v.titleText !== 'string' || v.titleText === '') return '行标题读成空串，`{name}` 填不进去，这条等于没比'
  if (v.expected.desc === 'delete.desc') return '上游词典查不出 delete.desc'
  if (v.asked !== `${v.expected.title}\n\n${v.expected.desc}`) {
    return `确认框正文是 ${JSON.stringify(v.asked)}，上游词典拼出来的是 ${JSON.stringify(v.expected.title + '\n\n' + v.expected.desc)}`
  }
  if (v.stillThere !== true) return '确认框选了取消，工作区还是被删了'
  return true
})

// ---- 与行自己那个「...」菜单对齐 ---------------------------------------------
//
// 卡片与每一项都是上游组件，判据因此是**两份菜单逐项相等**（文案 / 图标的 viewBox 与
// 尺寸 / 每条 path 的 d / 顺序）。图标不再是本仓拷贝的 SVG 字符串，而是上游 React 图标
// 渲染出来的 DOM，所以比对仍然落在真实产物上。
const ROWMENU = `
  const describe = (menu) => [...menu.querySelectorAll('button[role="menuitem"]')].map((b) => {
    const svg = b.querySelector('svg')
    return {
      label: (b.textContent ?? '').trim(),
      viewBox: svg === null ? null : svg.getAttribute('viewBox'),
      width: svg === null ? null : svg.getAttribute('width'),
      height: svg === null ? null : svg.getAttribute('height'),
      paths: svg === null ? null : [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')),
    }
  })
  const metrics = (menu) => {
    const item = menu.querySelector('button[role="menuitem"]')
    const icon = item === null ? null : item.querySelector('svg')
    const l = getComputedStyle(menu)
    const i = item === null ? null : getComputedStyle(item)
    const c = icon === null ? null : getComputedStyle(icon)
    return {
      list: { boxSizing: l.boxSizing, minWidth: l.minWidth, maxWidth: l.maxWidth, padding: l.padding,
        borderRadius: l.borderRadius, borderTopWidth: l.borderTopWidth, boxShadow: l.boxShadow },
      material: menu.getAttribute('data-menu-material'),
      stroke: l.getPropertyValue('--dsw-elevation-stroke-color').trim(),
      item: i === null ? null : { minHeight: i.minHeight, padding: i.padding, columnGap: i.columnGap,
        borderRadius: i.borderRadius, fontSize: i.fontSize, lineHeight: i.lineHeight,
        fontFamily: i.fontFamily, fontWeight: i.fontWeight, textAlign: i.textAlign, color: i.color },
      icon: c === null ? null : { width: c.width, height: c.height, color: c.color },
    }
  }
  const dangerRow = (menu, index) => {
    const item = menu.querySelectorAll('button[role="menuitem"]')[index]
    if (item === undefined) return null
    const icon = item.querySelector('svg')
    return { color: getComputedStyle(item).color, iconColor: icon === null ? null : getComputedStyle(icon).color }
  }
  const closeRowMenu = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(250)
  }
  const openRowMenu = async (row) => {
    const actions = row.querySelector('[class*="rowActions"]')
    if (actions === null) return { menu: null, why: 'row has no actions slot' }
    const buttons = [...actions.querySelectorAll('button')]
    if (buttons.length === 0) return { menu: null, why: 'actions slot has no button' }
    const before = upstreamMenus().length
    buttons[0].click()
    await sleep(350)
    const menus = upstreamMenus()
    if (menus.length !== before + 1) {
      return { menu: null, why: 'the first action button opened ' + (menus.length - before) + ' portal menus' }
    }
    return { menu: menus[menus.length - 1], why: null }
  }
  const pair = async (row, x, y, myDangerIndex = 1) => {
    const opened = await openRowMenu(row)
    if (opened.menu === null) { await closeRowMenu(); return { why: opened.why } }
    rightClick(row, x, y)
    await sleep(350)
    const mineMenus = mine()
    const one = mineMenus.length === 1 ? mineMenus[0] : null
    const result = {
      why: null,
      mine: h.instanceId,
      menus: mineMenus.length,
      owner: one === null ? null : (one.classList.contains(ownerClass) ? h.instanceId : null),
      upstreamItems: describe(opened.menu),
      myItems: one === null ? null : describe(one),
      upstreamMetrics: metrics(opened.menu),
      myMetrics: one === null ? null : metrics(one),
      upstreamDanger: dangerRow(opened.menu, 1),
      myDanger: one === null ? null : dangerRow(one, myDangerIndex),
    }
    await closeRowMenu()
    await closeAll()
    await sleep(200)
    result.upstreamClosed = !document.body.contains(opened.menu)
    result.mineClosed = mine().length === 0
    return result
  }
  /**
   * 切分档跑一段读数。
   *
   * 切的是 body[data-ds-dark-theme] 这个属性，不是 setTheme：
   * 描边分档规则就挂在这个属性上（ui-theme/src/styles/gradient-shadow-text.css:23-25，
   * 深色档把 --dsw-elevation-stroke-color 从 l4 降到 l3），而 token 值本身来自样式表，
   * 不在主题快照那 79 枚 token 里，所以属性是唯一也是足够的杠杆。
   *
   * **不能走真服务**：setTheme 写完 host 偏好后，adopt()（ui-theme/index.ts:259）会在同一次
   * 调用里同步把持久化的偏好读回来，而副本里持久的那一档被 dsh-any-background 钉成它的
   * custom-color 主题，于是 rev 一 publish 就被顶回去（实测 light@6 → custom-color@7）。
   * 走设置面板 Appearance 那三枚 cube 也是同一条路，所以它们在本栈里同样切不动。
   *
   * **run() 期间要用 MutationObserver 把属性钉住**：测试栈副本里 dsh-any-background 每帧把
   * data-ds-dark-theme 写回深色（实测摘掉之后 700ms 内写回 23 次），而 pair() 要 sleep 数百
   * 毫秒才读到卡片的描边色——不钉住的话两档读到的是同一个深色值。
   *
   * landed 读的是带 [data-menu-material] 的探针元素上那枚 --dsw-elevation-stroke-color，
   * **不是** --dsw-alias-border-l3：后者被 dsh-any-background 的 81 条 !important 钉成深色档的值，
   * 实测深浅两档都读出 rgba(255,255,255,0.16)，拿它当「杠杆在动」的证据必然失效。
   * theme.overrideTokens 同样压不过那些 !important（实测覆盖深浅两档后读数不变）。
   */
  const withScheme = async (wantDark, run) => {
    const body = document.body
    const had = body.getAttribute('data-ds-dark-theme')
    const apply = () => {
      if (wantDark) { if (!body.hasAttribute('data-ds-dark-theme')) body.setAttribute('data-ds-dark-theme', '') }
      else if (body.hasAttribute('data-ds-dark-theme')) body.removeAttribute('data-ds-dark-theme')
    }
    let hits = 0
    const guard = new MutationObserver(() => {
      hits += 1
      if (hits < 400) apply()
    })
    guard.observe(body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
    apply()
    const probe = document.createElement('div')
    probe.setAttribute('data-menu-material', 'translucent')
    body.append(probe)
    const landed = getComputedStyle(probe).getPropertyValue('--dsw-elevation-stroke-color').trim()
    probe.remove()
    const result = await run()
    guard.disconnect()
    if (had === null) body.removeAttribute('data-ds-dark-theme')
    else body.setAttribute('data-ds-dark-theme', had)
    return { ...result, landed, guardHits: hits }
  }
`

/**
 * 逐键比对两份计算样式，指出第一处不等。
 *
 * @param {any} mine @param {any} upstream @param {string} path
 * @returns {string|null} 全等返回 null
 */
function styleDiff(mine, upstream, path = '') {
  if (mine === null || upstream === null) {
    return mine === upstream ? null : `${path || '(root)'}: 本插件 ${JSON.stringify(mine)} / 上游 ${JSON.stringify(upstream)}`
  }
  if (typeof upstream !== 'object') {
    return mine === upstream ? null : `${path || '(root)'}: 本插件 ${JSON.stringify(mine)} / 上游 ${JSON.stringify(upstream)}`
  }
  for (const key of Object.keys(upstream)) {
    const diff = styleDiff(mine[key], upstream[key], path === '' ? key : `${path}.${key}`)
    if (diff !== null) return diff
  }
  return null
}

const sessionPair = await evaluate(`(async () => {
  ${PRELUDE}
  ${ROWMENU}
  const row = pickSessionRow()
  if (row === null) return { why: '侧栏里挑不出可操作的会话行' }
  return pair(row, 200, 220)
})()`)

check('session menu mirrors the row\'s own menu', sessionPair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.menus !== 1) return `页面上有 ${v.menus} 张本插件的卡片`
  if (v.owner !== v.mine) return `菜单归属对不上：owner=${JSON.stringify(v.owner)}`
  if (v.myItems === null) return '本插件的菜单没渲染出来'
  if (v.upstreamItems.length !== 4) {
    return `上游「...」菜单有 ${v.upstreamItems.length} 项（这条按 4 项逐项相等）：`
      + JSON.stringify(v.upstreamItems.map((i) => i.label))
  }
  if (JSON.stringify(v.myItems) !== JSON.stringify(v.upstreamItems)) {
    return '两份菜单逐项（顺序 / 文案 / viewBox / 尺寸 / path）比对不等：\n'
      + `  本插件 ${JSON.stringify(v.myItems)}\n  上游   ${JSON.stringify(v.upstreamItems)}`
  }
  if (v.upstreamClosed !== true || v.mineClosed !== true) return '收尾没关掉菜单，会污染后续断言'
  return true
})

// 两份菜单是同一个组件渲染的，比的其实是「本插件没把档位改坏」：那份 `listClassName` 只带
// z-index，若哪条规则把尺寸或描边改掉了，这条会红。留着作为回归闸。
check('menu metrics match the primitives default tier', sessionPair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.myMetrics === null) return '本插件的菜单没渲染出来'
  if (v.myMetrics.material !== v.upstreamMetrics.material) {
    return `data-menu-material 本插件 ${v.myMetrics.material} / 上游 ${v.upstreamMetrics.material}`
  }
  const diff = styleDiff(v.myMetrics, v.upstreamMetrics)
  if (diff !== null) return `计算样式不等 —— ${diff}`
  if (v.upstreamMetrics.list.minWidth === 'auto' || v.upstreamMetrics.item === null) {
    return `上游菜单的计算样式读成了 ${JSON.stringify(v.upstreamMetrics)}，这条等于没比`
  }
  return true
})

const strokePairs = await evaluate(`(async () => {
  ${PRELUDE}
  ${ROWMENU}
  h.selection.clear()
  const row = pickSessionRow()
  if (row === null) return { why: '侧栏里挑不出可操作的会话行' }
  const out = {}
  for (const [name, dark] of [['dark', true], ['light', false]]) {
    out[name] = await withScheme(dark, () => pair(row, 200, 220))
  }
  return out
})()`)

check('menu stroke colour matches upstream in both themes', strokePairs, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  for (const name of ['dark', 'light']) {
    const p = v[name]
    if (p === undefined) return `${name} 档没测到结果`
    if (p.why != null) return `${name} 档没测到：${p.why}`
    if (p.myMetrics === null) return `${name} 档本插件菜单没渲染出来`
    if (p.myMetrics.stroke !== p.upstreamMetrics.stroke) {
      return `${name} 档描边色本插件 ${p.myMetrics.stroke} / 上游 ${p.upstreamMetrics.stroke}——那枚 token 要属性与自报声明两半都在才解析得对`
    }
  }
  // 两档必须真的落在不同 token 档位上，否则下面那句「两档读数不同」没有意义。
  if (v.dark.landed === v.light.landed) {
    return `两轮都在 [data-menu-material] 上读到 --dsw-elevation-stroke-color = ${v.dark.landed}`
      + `（深浅两档的 guardHits=${v.dark.guardHits}/${v.light.guardHits}），档位杠杆没生效，这条等于没测`
  }
  // 两档的差异本身就是「分档真的在发生」的证据：两档读出同一个值，说明其中一档没生效。
  if (v.dark.myMetrics.stroke === v.light.myMetrics.stroke) {
    return `两档读出同一个描边色 ${v.dark.myMetrics.stroke}，主题的分档没生效，这条等于没测`
  }
  return true
})

const workspacePair = await evaluate(`(async () => {
  ${PRELUDE}
  ${ROWMENU}
  h.selection.clear()
  // 「未分组」那一行没有 actions；要的是有两个按钮的真实工作区行——靶子工作区正是。
  const row = await fxWorkspaceRow()
  if (row === null) return { why: '靶子工作区行不在 DOM 里' }
  if (row.querySelectorAll('[class*="rowActions"] button').length < 2) {
    return { why: '靶子工作区行上没有「...」与「+」两枚按钮' }
  }
  const result = await pair(row, 200, 280, 2)
  return { ...result, newSessionLabel: t('actions.newSession'),
    expandedBefore: row.getAttribute('aria-expanded') }
})()`)

// 工作区单选有 3 项，上游「...」只有 2 项——多出来的首项正是上游放在行 hover 第二枚按钮上的
// 那个「新会话」，对齐「...」对齐不到它，只能在这里补。所以判据是「上游那 2 项逐字不变 +
// 首项逐字等于词典里的 actions.newSession」，而不是三对二的两两相等。
check('workspace menu mirrors the row\'s own menu', workspacePair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.menus !== 1) return `页面上有 ${v.menus} 张本插件的卡片`
  if (v.owner !== v.mine) return `菜单归属对不上：owner=${JSON.stringify(v.owner)}`
  if (v.upstreamItems.length !== 2) {
    return `上游「...」菜单有 ${v.upstreamItems.length} 项（本条按 2 项对齐）：${JSON.stringify(v.upstreamItems.map((i) => i.label))}`
  }
  if (v.myItems === null) return '本插件的菜单没渲染出来'
  if (v.myItems.length !== 3) {
    return `本插件应有 3 项（新建会话 + 上游那 2 项），实际 ${JSON.stringify(v.myItems.map((i) => i.label))}`
  }
  if (v.myItems[0].label !== v.newSessionLabel) {
    return `首项应是「${v.newSessionLabel}」，实际 ${JSON.stringify(v.myItems[0].label)}——它必须摆在上游那 2 项前面`
  }
  const tail = v.myItems.slice(1)
  if (JSON.stringify(tail) !== JSON.stringify(v.upstreamItems)) {
    return '末两项与上游「...」逐项（顺序 / 文案 / viewBox / 尺寸 / path）比对不等：\n'
      + `  本插件 ${JSON.stringify(tail)}\n  上游   ${JSON.stringify(v.upstreamItems)}`
  }
  if (v.upstreamClosed !== true || v.mineClosed !== true) return '收尾没关掉菜单，会污染后续断言'
  return true
})

check('danger row keeps upstream colouring', workspacePair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.upstreamDanger === null || v.myDanger === null) return '取不到删除项，这条等于没比'
  if (v.myItems === null || v.myItems.length !== 3) return '本插件的工作区菜单不是 3 项，删除项下标对不上，这条等于没比'
  const diff = styleDiff(v.myDanger, v.upstreamDanger)
  if (diff !== null) return `删除项配色不等 —— ${diff}`
  if (v.myDanger.color === v.myMetrics.item.color) return '删除项没有危险配色'
  if (v.myDanger.iconColor === null) return '删除项没有图标'
  if (v.myDanger.iconColor !== v.myDanger.color) return '删除项的图标没有跟文字一起转成危险色'
  return true
})

// ---- 工作区「新会话」这一项 --------------------------------------------------
//
// 判据是**状态 diff**而不是服务记账：`uiWorkspace.startSession` 是真服务，插件不再有机会
// 替它记账。可观测的结果是靶子工作区成为当前打开的那个（上游 `openSession` 写主区引用，
// 侧栏行随之带上选中态）。折叠的靶子工作区还会被先展开——那是上游那枚 hover 按钮的两步
// 里的一步，本插件照做，所以它也是被测行为的一部分。
const newSessionProbe = await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  const row = await fxWorkspaceRow()
  if (row === null) return { why: '靶子工作区行不在 DOM 里' }
  const before = { expanded: row.getAttribute('aria-expanded'),
    mainSelected: svc.sessions.list.getSnapshot().ids.length }
  // 折着的先收回去，让「展开那一步」真的发生。
  if (before.expanded === 'true') {
    row.click(); await sleep(900)
    const collapsed = await fxWorkspaceRow()
    if (collapsed === null) return { why: '收起后靶子工作区行不见了' }
    rightClick(collapsed, 200, 280)
  } else {
    rightClick(row, 200, 280)
  }
  await sleep(350)
  const menus = mine()
  if (menus.length !== 1) return { why: '菜单没打开' }
  const menu = menus[0]
  const first = itemByLabel(menu, t('actions.newSession'))
  if (first === null) { await closeAll(); return { why: '菜单里没有「新会话」这一项' } }
  first.click()
  await sleep(1200)
  const after = rows().find((r) => kindOf(r) === 'workspace' && idOf(r, 'workspace') === fx.workspaceId)
  const out = {
    why: null,
    expandedBefore: before.expanded,
    expandedAfter: after === null ? null : after.getAttribute('aria-expanded'),
    menuClosed: mine().length === 0,
    active: document.querySelectorAll('[aria-selected="true"]').length,
    mainSessions: before.mainSelected,
  }
  await closeAll()
  return out
})()`)

check('workspace new session opens a session in that workspace', newSessionProbe, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.expandedBefore === 'false' && v.expandedAfter !== 'true') {
    return `点的是折叠的工作区行（aria-expanded=${v.expandedBefore}），执行后是 ${JSON.stringify(v.expandedAfter)}——没展开就看不到刚开的会话`
  }
  if (v.menuClosed !== true) return '执行后菜单没关'
  return true
})

// ---- 单选的四个动作各自打在什么上 ----------------------------------------------
//
// 靶子里没有会话（blank 会话不渲染行），所以这一段点的是侧栏上现有的那一行。四个动作按各自
// 能验到的最强口径分开处理：
//
// - 重命名**真往返**：改一个新标题、再改回原标题。可逆，且能顺带验上游 `SessionRenameDialog`
//   的每一个面（`role="dialog"` / `aria-label` / `input[data-modal-autofocus]` / footer 两枚按钮）。
// - 置顶**真往返**：点一次置顶、再点一次取消，靠 `workspaces.list` 的 `pinnedSessionIds` 判读。
// - 分叉与归档**打桩**：上游那两条回调是 `uiWorkspace.forkSession` / `archiveSession`
//   （`ui-workspace/src/client/index.ts:210-218`、`:186-199`），fork 会凭空多出一个子会话、
//   归档会把行从侧栏里拿走——都会污染后面的断言。打桩挂在句柄那份实例上（`services.uiWorkspace`
//   与上游 inject 闭包用的是同一个对象），所以拦得住回调又不改任何数据。
check('session rename opens the upstream dialog and renames', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  const id = sessionIdOf(row)
  const origin = sessionRow(id)?.displayTitle ?? null
  if (typeof origin !== 'string' || origin === '') return { bail: '挑中的那一行读不出会话标题' }
  // 一次改名：右击 → 点菜单里的重命名 → 看对话框 → 改输入框 → 点 footer 主按钮 → 等落库。
  const renameTo = async (title) => {
    const live = rows().find((el) => kindOf(el) === 'session' && idOf(el, 'session') === id) ?? null
    if (live === null) return { bail: '改名期间那一行从侧栏里不见了' }
    rightClick(live, 200, 220)
    await sleep(400)
    const menus = mine()
    if (menus.length !== 1) { await closeAll(); return { bail: '菜单没打开' } }
    const entry = itemByLabel(menus[0], t('rename'))
    if (entry === null) { await closeAll(); return { bail: '菜单里没有重命名项' } }
    entry.click()
    await sleep(600)
    // **按 aria-label 挑对话框**，不要用 querySelector('[role="dialog"]') 取第一个：
    // 页面上同时可能挂着别的对话框（设置、确认归档…），取第一个会读到不相干的那一张，
    // 然后报「对话框里没有那个输入框」——功能其实是好的，探针已经这么验过。
    const wantLabel = t('rename.session.title')
    const dialogs = [...document.querySelectorAll('[role="dialog"]')]
    const dialog = dialogs.find((d) => d.getAttribute('aria-label') === wantLabel) ?? null
    if (dialog === null) {
      await closeAll()
      return { bail: '点重命名没弹上游那个对话框',
        labels: dialogs.map((d) => d.getAttribute('aria-label')) }
    }
    const input = dialog.querySelector('input[data-modal-autofocus]')
    if (input === null) { await closeAll(); return { bail: '对话框里没有那个输入框' } }
    const face = {
      label: dialog.getAttribute('aria-label'),
      inputLabel: input.getAttribute('aria-label'),
      initial: input.value,
      buttons: [...dialog.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim()),
    }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, title)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await sleep(120)
    // 提交走 footer 的主按钮（点它而不是 Enter：Enter 在 IME 组字期间不提交，派发合成事件
    // 走不到真实的 composition 状态，用它会把「提交语义」测成时序竞态）。
    const confirm = [...dialog.querySelectorAll('button')].find((b) => (b.textContent ?? '').trim() === t('rename'))
    if (confirm === undefined) { await closeAll(); return { bail: '对话框的 footer 里没有提交按钮' } }
    confirm.click()
    await sleep(1200)
    await closeAll()
    return { bail: null, face, now: sessionRow(id)?.displayTitle ?? null,
      // 提交后那张卡片自身也要消失（按 aria-label 找，不是「页面上还有没有对话框」——
      // 别的对话框还开着是正常的）。
      dialogGone: !dialog.isConnected }
  }
  // 新标题带上 fixture 前缀：万一留下残骸，一眼能认出是脚本动过的行。
  const next = ${JSON.stringify('dsh-oi-verify-renamed-')} + Date.now().toString(36).slice(-5)
  const forward = await renameTo(next)
  if (forward.bail != null) return forward
  const back = await renameTo(origin)
  if (back.bail != null) return { bail: '改回原标题时：' + back.bail }
  return { bail: null, origin, next, face: forward.face, afterForward: forward.now,
    dialogGone: forward.dialogGone, afterBack: back.now,
    expected: { title: t('rename.session.title'), field: t('field.sessionName'),
      cancel: t('cancel'), rename: t('rename') } }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.expected.title === 'rename.session.title') return '上游词典查不出 rename.session.title'
  if (v.expected.field === 'field.sessionName') return '上游词典查不出 field.sessionName'
  if (v.expected.cancel === 'cancel') return '上游词典查不出 cancel'
  if (v.face.label !== v.expected.title) {
    return `对话框标题是 ${JSON.stringify(v.face.label)}，上游词典给的是 ${JSON.stringify(v.expected.title)}`
  }
  if (v.face.inputLabel !== v.expected.field) {
    return `输入框 aria-label 是 ${JSON.stringify(v.face.inputLabel)}，上游词典给的是 ${JSON.stringify(v.expected.field)}`
  }
  if (v.face.initial !== v.origin) {
    return `输入框初值是 ${JSON.stringify(v.face.initial)}，会话当前标题是 ${JSON.stringify(v.origin)}——没喂进去`
  }
  if (!v.face.buttons.includes(v.expected.cancel) || !v.face.buttons.includes(v.expected.rename)) {
    return `footer 没有「${v.expected.cancel}」与「${v.expected.rename}」两枚按钮：${JSON.stringify(v.face.buttons)}`
  }
  if (v.afterForward !== v.next) {
    return `改完之后会话标题是 ${JSON.stringify(v.afterForward)}，期望 ${JSON.stringify(v.next)}`
  }
  if (v.dialogGone !== true) return '提交之后对话框没关'
  if (v.afterBack !== v.origin) {
    return `改回原标题失败：现在是 ${JSON.stringify(v.afterBack)}，原值 ${JSON.stringify(v.origin)}——复原没做成功，副本里那行被留下了改动`
  }
  return true
})

// 用户已决定放弃「fork 之后自动打开子会话」：上游那条 fork 条目只调
// `uiWorkspace.forkSession`，子会话出现在侧栏即可，不再要求本插件点开它。
check('fork dispatches the upstream command for the clicked session', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  const id = sessionIdOf(row)
  const ui = svc.uiWorkspace
  if (ui === undefined || typeof ui.forkSession !== 'function') {
    return { bail: '句柄上没有 services.uiWorkspace.forkSession，打桩点找错了' }
  }
  const before = svc.sessions.list.getSnapshot().ids.length
  const seen = []
  const restore = stubMethod(ui, 'forkSession', (sessionId) => { seen.push(sessionId) })
  rightClick(row, 200, 220)
  await sleep(400)
  const menus = mine()
  if (menus.length !== 1) { restore(); await closeAll(); return { bail: '菜单没打开' } }
  const entry = itemByLabel(menus[0], t('menu.fork'))
  // 顺带证一件只有真 slot 注入才成立的事：条目拿到的 useShortcuts 是真 catalog。
  const shortcut = entry === null ? null : entry.getAttribute('aria-keyshortcuts')
  if (entry === null) { restore(); await closeAll(); return { bail: '菜单里没有分叉项' } }
  entry.click()
  await sleep(500)
  const menuClosed = mine().length === 0
  await closeAll()
  const idsUnchanged = svc.sessions.list.getSnapshot().ids.length === before
  restore()
  await sleep(300)
  return { bail: null, id, seen, shortcut, menuClosed, idsUnchanged,
    want: ariaOf(lookupShortcut('session.fork')),
    restored: typeof ui.forkSession === 'function' }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.seen.length !== 1) {
    return `点分叉后 uiWorkspace.forkSession 收到 ${v.seen.length} 次调用（${JSON.stringify(v.seen)}），应为 1 次`
  }
  if (v.seen[0] !== v.id) {
    return `打桩收到的是 ${JSON.stringify(v.seen[0])}，点的是 ${JSON.stringify(v.id)}——打到别的会话上了`
  }
  if ((v.shortcut ?? null) !== v.want) {
    return `分叉项的 aria-keyshortcuts 是 ${JSON.stringify(v.shortcut ?? null)}，`
      + `catalog 里 session.fork 那一行是 ${JSON.stringify(v.want)}`
  }
  if (v.idsUnchanged !== true) return '会话列表长度变了——打桩没拦住这条回调'
  if (v.menuClosed !== true) return '执行后菜单没关'
  if (v.restored !== true) return '打桩没撤干净，后面的断言会打在桩上'
  return true
})

// 归档项按行状态翻转（`ArchiveSessionMenuItem`，`session-actions/ArchiveSession.tsx:31-49`）：
// 未归档时是「归档会话」且带 `session.archive` 快捷键，归档时换成没有快捷键的「取消归档」。
// 真归档会把行从侧栏拿走，所以这里打桩验「点它落到 host 的哪个调用上」。
check('archive entry follows the row state and dispatches the host call', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  const id = sessionIdOf(row)
  if (archivedIds().includes(id)) return { bail: '挑中的那一行已经归档，菜单里那一项会是「取消归档」' }
  const ui = svc.uiWorkspace
  if (ui === undefined || typeof ui.archiveSession !== 'function' || typeof ui.unarchiveSession !== 'function') {
    return { bail: '句柄上没有 services.uiWorkspace.archiveSession / unarchiveSession，打桩点找错了' }
  }
  const seen = []
  const restoreArchive = stubMethod(ui, 'archiveSession', (sessionId) => { seen.push(['archive', sessionId]) })
  const restoreUnarchive = stubMethod(ui, 'unarchiveSession', (sessionId) => { seen.push(['unarchive', sessionId]) })
  rightClick(row, 200, 220)
  await sleep(400)
  const menus = mine()
  if (menus.length !== 1) { restoreArchive(); restoreUnarchive(); await closeAll(); return { bail: '菜单没打开' } }
  const menu = menus[0]
  const items = labels(menu)
  const entry = itemByLabel(menu, t('menu.archiveSession'))
  const shortcut = entry === null ? null : entry.getAttribute('aria-keyshortcuts')
  if (entry === null) {
    restoreArchive(); restoreUnarchive(); await closeAll()
    return { bail: '菜单里没有「归档会话」这一项', items }
  }
  entry.click()
  await sleep(500)
  const menuClosed = mine().length === 0
  await closeAll()
  const rowStillThere = rows().some((el) => kindOf(el) === 'session' && idOf(el, 'session') === id)
  const stillUnarchived = !archivedIds().includes(id)
  restoreArchive(); restoreUnarchive()
  await sleep(300)
  return { bail: null, id, items, seen, shortcut, menuClosed, rowStillThere, stillUnarchived,
    unarchive: t('menu.unarchiveSession'), want: ariaOf(lookupShortcut('session.archive')),
    restored: typeof ui.archiveSession === 'function' && typeof ui.unarchiveSession === 'function' }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if ((v.shortcut ?? null) !== v.want) {
    return `归档项的 aria-keyshortcuts 是 ${JSON.stringify(v.shortcut ?? null)}，`
      + `catalog 里 session.archive 那一行是 ${JSON.stringify(v.want)}`
  }
  if (v.items.length !== 4) return `菜单应当 4 项，实际 ${JSON.stringify(v.items)}`
  if (v.items.some((l) => l.includes(v.unarchive))) {
    return `未归档的行上出现了「取消归档」${JSON.stringify(v.unarchive)}：${JSON.stringify(v.items)}`
  }
  if (v.seen.length !== 1 || v.seen[0][0] !== 'archive') {
    return `点归档后打桩收到 ${JSON.stringify(v.seen)}，应为一次 archive`
  }
  if (v.seen[0][1] !== v.id) return `打桩收到的是 ${JSON.stringify(v.seen[0][1])}，点的是 ${JSON.stringify(v.id)}`
  if (v.stillUnarchived !== true || v.rowStillThere !== true) return '打桩没拦住：归档真的发生了，会污染后面的断言'
  if (v.menuClosed !== true) return '执行后菜单没关'
  if (v.restored !== true) return '打桩没撤干净，后面的断言会打在桩上'
  return true
})

// 三个带快捷键提示的条目各读一次 catalog。上游注册的是 `session.rename`/`session.fork`/
// `session.archive`（`ui-workspace/src/client/shortcuts.ts:96-121`），pin 没有——所以判据是
// 「逐字对齐 catalog 那一行、置顶项为空」。这同时证了 slot 级注入是按条目分发的，而不是
// 所有条目共用一份。
//
// **判据不要求那三项非空**：web runtime 下 `bindingIssue`（`shortcuts/src/configuration.ts:102-112`）
// 会把它们判成 reserved / unsupported-browser，`registry.ts:129` 于是给出 `aria: undefined`、
// `keys: []`。测试栈跑的是 web runtime，所以空是正确结果，判据必须跟着环境走。
check('shortcut hints come from the injected catalog', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  rightClick(row, 200, 220)
  await sleep(400)
  const menus = mine()
  if (menus.length !== 1) { await closeAll(); return { bail: '菜单没打开' } }
  const items = [...menus[0].querySelectorAll('button[role="menuitem"]')].map((b) => ({
    label: (b.textContent ?? '').trim(), aria: b.getAttribute('aria-keyshortcuts') }))
  await closeAll()
  // catalog 那一行是唯一判据：**逐字对齐**，不要求非空。
  //
  // 曾经写成「这三项必须带 aria-keyshortcuts」，在 web runtime 下永远红：
  // shortcuts/src/client/registry.ts:120-131 的 aria: enabled ? … : undefined，
  // 而 bindingIssue（shortcuts/src/configuration.ts:102-112）会把 web 下不被浏览器
  // 放行的组合判成 reserved / unsupported-browser，于是 enabled=false、keys=[]。
  // 换句话说测试栈（web runtime）里它们本来就该没有提示——判据必须跟着环境走。
  return { bail: null, items,
    expected: { rename: t('rename'), fork: t('menu.fork'), archive: t('menu.archiveSession') },
    catalog: {
      rename: ariaOf(lookupShortcut('session.rename')),
      fork: ariaOf(lookupShortcut('session.fork')),
      archive: ariaOf(lookupShortcut('session.archive')),
      hasPinRow: lookupShortcut('session.pin') !== null,
    } }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.items.length !== 4) return `菜单应当 4 项，实际 ${JSON.stringify(v.items.map((i) => i.label))}`
  for (const key of ['rename', 'fork', 'archive']) {
    const item = v.items.find((i) => i.label.startsWith(v.expected[key])) ?? null
    if (item === null) return `菜单里没有 ${JSON.stringify(v.expected[key])} 这一项`
    const want = v.catalog[key]
    if ((item.aria ?? null) !== want) {
      return `${JSON.stringify(item.label)} 的 aria-keyshortcuts 是 ${JSON.stringify(item.aria ?? null)}，`
        + `catalog 里 session.${key} 那一行是 ${JSON.stringify(want)}`
    }
  }
  // 置顶项：上游没注册 `session.pin`，所以既不该有 aria，catalog 里也压根没有这一行。
  if (v.items[0].aria !== null && v.items[0].aria !== '') {
    return `置顶项也带上了快捷键 ${JSON.stringify(v.items[0].aria)}——上游没给 pin 注册快捷键，注入串了`
  }
  if (v.catalog.hasPinRow) return 'catalog 里竟然有 session.pin 那一行，判据的前提变了'
  return true
})

check('pin toggles the pinned set and puts it back', await evaluate(`(async () => {
  ${PRELUDE}
  h.selection.clear()
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  const id = sessionIdOf(row)
  const before = pinnedIds().includes(id)
  const press = async (wantLabel) => {
    const live = rows().find((el) => kindOf(el) === 'session' && idOf(el, 'session') === id) ?? null
    if (live === null) return { bail: '操作期间那一行从侧栏里不见了' }
    rightClick(live, 200, 220)
    await sleep(400)
    const menus = mine()
    if (menus.length !== 1) { await closeAll(); return { bail: '菜单没打开' } }
    const entry = itemByLabel(menus[0], wantLabel)
    if (entry === null) { await closeAll(); return { bail: '菜单里没有「' + wantLabel + '」这一项' } }
    const label = (entry.textContent ?? '').trim()
    const aria = entry.getAttribute('aria-keyshortcuts')
    entry.click()
    await sleep(900)
    const menuClosed = mine().length === 0
    await closeAll()
    return { bail: null, label, aria, menuClosed }
  }
  const on = await press(t('menu.pinSession'))
  if (on.bail != null) return on
  const afterOn = pinnedIds().includes(id)
  const off = await press(t('menu.unpinSession'))
  if (off.bail != null) return off
  return { bail: null, id, before, onLabel: on.label, offLabel: off.label, afterOn,
    // 两个标签都记下来，判据逐字比绝对文案而不是比「翻没翻」。
    wantOn: t('menu.pinSession'), wantOff: t('menu.unpinSession'),
    afterOff: pinnedIds().includes(id), menuClosed: on.menuClosed && off.menuClosed,
    // 置顶项上游没注册快捷键，菜单里也不该有提示。
    aria: on.aria === null ? null : on.aria }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.before) return '靶子会话本来就在置顶集合里，这轮没法验「点一下就置顶」'
  if (v.onLabel !== v.wantOn) return `第一项的标签是 ${JSON.stringify(v.onLabel)}，不是 ${JSON.stringify(v.wantOn)}`
  if (v.afterOn !== true) return '点「置顶会话」之后那个 id 仍不在置顶集合里'
  if (v.offLabel !== v.wantOff) {
    return `第二项的标签是 ${JSON.stringify(v.offLabel)}，不是 ${JSON.stringify(v.wantOff)}`
  }
  if (v.afterOff !== v.before) return `点「${v.offLabel}」之后置顶集合是 ${v.afterOff}，复原失败（before=${v.before}）`
  if (v.aria !== null && v.aria !== '') return `置顶项带着快捷键 ${JSON.stringify(v.aria)}，上游没给 pin 注册`
  if (v.menuClosed !== true) return '执行后菜单没关'
  return true
})

check('outside pointerdown closes', await evaluate(`(async () => {
  ${PRELUDE}
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  rightClick(row, 120, 140)
  await sleep(350)
  const opened = mine().length > 0
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 900, clientY: 500 }))
  await sleep(200)
  return { bail: null, opened, closed: mine().length === 0 }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.opened !== true) return '菜单没打开，无从验证外部点击关闭'
  if (v.closed !== true) return '外部 pointerdown 没关掉菜单'
  return true
})

// 滚动期间菜单的开合跟着上游 `Menu` 的实现走：它的定位 effect 在 capture 阶段的 scroll 上
// **重算位置**，从不主动关闭。所以这里断言的是「滚动时菜单跟着挪」，而不是旧实现那条
// 「锚点容器滚动即关闭」——菜单钉在一个视口坐标上，滚动侧栏并不会让它错位。
check('sidebar scroll repositions the menu instead of closing it', await evaluate(`(async () => {
  ${PRELUDE}
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  let box = null
  for (let n = row.parentElement; n !== null; n = n.parentElement) {
    const cs = getComputedStyle(n)
    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') { box = n; break }
  }
  if (box === null) return { bail: '靶子会话行没有 overflow-y 可滚的祖先容器' }
  const origin = box.scrollTop
  const room = box.scrollHeight - box.clientHeight
  rightClick(row, 200, 240)
  await sleep(350)
  const opened = mine().length > 0
  const before = mine()[0]?.getBoundingClientRect().top ?? null
  if (room > 8) box.scrollTop = Math.min(room, 120)
  else box.dispatchEvent(new Event('scroll'))
  await sleep(400)
  const after = mine().length > 0 ? mine()[0].getBoundingClientRect().top : null
  const stillOpen = mine().length > 0
  box.scrollTop = origin
  await sleep(400)
  const restored = mine().length > 0 ? mine()[0].getBoundingClientRect().top : null
  await closeAll()
  return { bail: null, opened, mode: room > 8 ? 'real' : 'synthetic', room, before, after, restored, stillOpen,
    closedAfterRestore: mine().length === 0 }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.opened !== true) return '菜单没打开，无从验证滚动'
  if (v.stillOpen !== true) return `滚动侧栏（mode=${v.mode}）把菜单关掉了——上游 Menu 只重算位置、不主动关闭`
  if (v.before === null || v.after === null) return '取不到菜单位置，这条等于没测'
  if (v.after !== v.before) return `菜单跟着侧栏挪了（${v.before} → ${v.after}）——菜单钉的是视口坐标，不该动`
  if (v.restored !== v.before) return '侧栏滚回去之后菜单位置没回去'
  if (v.closedAfterRestore !== true) return '收尾没关掉菜单，会污染后续断言'
  return true
})

// 会话区流式输出时页面一直在滚自己的容器。菜单钉在视口坐标上，那个滚动不该影响它。
check('unrelated scroll keeps the menu open', await evaluate(`(async () => {
  ${PRELUDE}
  const row = pickSessionRow()
  if (row === null) return { bail: '侧栏里挑不出可操作的会话行' }
  const scrollable = (el) => {
    const cs = getComputedStyle(el)
    return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 8
  }
  let box = document.querySelector('[data-conversation-scroll]')
  let source = 'conversation'
  if (box === null || !scrollable(box) || box.contains(row)) {
    box = [...document.querySelectorAll('*')].find((el) => scrollable(el) && !el.contains(row)) ?? null
    source = box === null ? 'synthetic' : 'other'
  }
  let synthetic = null
  if (box === null) {
    synthetic = document.createElement('div')
    synthetic.style.cssText = 'position:fixed;left:-9999px;top:0;width:100px;height:60px;overflow-y:auto'
    const filler = document.createElement('div')
    filler.style.height = '900px'
    synthetic.append(filler)
    document.body.append(synthetic)
    box = synthetic
  }
  box.scrollTop = 0
  await sleep(150)
  rightClick(row, 200, 240)
  await sleep(350)
  const opened = mine().length > 0
  let events = 0
  const spy = () => { events += 1 }
  box.addEventListener('scroll', spy)
  const step = Math.max(1, Math.floor((box.scrollHeight - box.clientHeight) / 4))
  for (let i = 1; i <= 3; i += 1) {
    box.scrollTop = step * i
    await sleep(150)
  }
  box.removeEventListener('scroll', spy)
  const stillOpen = mine().length > 0
  const moved = box.scrollTop > 0
  if (synthetic !== null) synthetic.remove()
  await closeAll()
  return { bail: null, source, opened, moved, scrollEvents: events, stillOpen, cleanedUp: mine().length === 0 }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.opened !== true) return '菜单没打开，无从验证滚动'
  if (v.moved !== true) return `容器 scrollTop 没动（source=${v.source}）——滚动实测未发生`
  if (v.scrollEvents < 3) return `容器只打出 ${v.scrollEvents} 条 scroll 事件（滚了 3 次）——滚动实测未发生`
  if (v.stillOpen !== true) return `滚动不含菜单的容器（source=${v.source}）把菜单关掉了`
  if (v.cleanedUp !== true) return '收尾没关掉菜单，会污染后续断言'
  return true
})

// ---- 功能 2 多选 -------------------------------------------------------------
//
// 批量项的文案出自插件自己的词典，所以比对的是 `tOwn` 当场给出的那串文本。菜单归属靠类名
// 认：卡片在 body 下，两份实例并存时点错就是删掉真工作区。
check('session batch right-click hands the menu back', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  sel.clear()
  const fxRow = pickSessionRow()
  const other = otherRow('session')
  if (fxRow === null || other === null) return { bail: '没有两行会话（挑中的那行与另一行）' }
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  fire(fxRow); fire(other)
  await sleep(80)
  const evt = rightClick(fxRow, 300, 300)
  await sleep(350)
  const result = { bail: null, selected: sel.size(), menus: mine().length, defaultPrevented: evt.defaultPrevented }
  sel.clear()
  return result
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.selected !== 2) return `应有 2 个选中，实际 ${v.selected}（多选本身还得工作，否则这条测不到东西）`
  if (v.menus !== 0) return `会话多选右键还弹出 ${v.menus} 张卡片`
  if (v.defaultPrevented !== false) return '默认行为被拦了：没有菜单又不让页面自己处理，右键成了"点了没反应"'
  return true
})

check('contextmenu batch (workspaces)', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  sel.clear()
  const fxRow = await fxWorkspaceRow()
  const other = otherRow('workspace')
  if (fxRow === null || other === null) return { bail: '没有两行工作区（靶子行与另一行）' }
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  fire(fxRow); fire(other)
  await sleep(80)
  rightClick(fxRow, 340, 340)
  await sleep(350)
  const menus = mine()
  const menu = menus.length === 1 ? menus[0] : null
  return { bail: null, selected: sel.size(), menus: menus.length,
    items: menu === null ? null : labels(menu),
    expected: ownText('batch.deleteWorkspaces', 2) }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.selected !== 2) return `应有 2 个工作区选中，实际 ${v.selected}`
  if (v.menus !== 1) return `本插件的卡片有 ${v.menus} 张，应为 1`
  if (v.items === null) return '菜单没渲染出来'
  if (v.items.length !== 1) return `应只剩 1 个批量项，实际 ${JSON.stringify(v.items)}`
  if (v.items[0] !== v.expected) return `应为 ${JSON.stringify(v.expected)}，实际 ${JSON.stringify(v.items)}`
  return true
})

// 点掉批量删除**会把靶子工作区真的删掉**，所以这条必须排在所有需要靶子工作区的断言之后。
// 确认框先打桩为 false 看它拦住了，再放行看删除落地。两轮都只点脚本自己的靶子菜单项，
// 且动手前先核对卡片归属——页面上可能有另一份实例的菜单，点错就是删掉真工作区。
check('batch delete removes the selected workspaces', await evaluate(`(async () => {
  ${PRELUDE}
  const sel = h.selection
  const realConfirm = window.confirm
  const beforeIds = svc.workspaces.list.getSnapshot().items.map((i) => i.workspaceId)
  let asked = null
  const stub = (answer) => { window.confirm = (m) => { asked = m; return answer } }
  /** 选中靶子工作区 + 另一行再右键，取回这张属于本实例的菜单；不是本实例的一律拒绝。 */
  const openOnFixture = async () => {
    sel.clear()
    const row = await fxWorkspaceRow()
    const other = otherRow('workspace')
    if (row === null || other === null) return { why: '靶子工作区行或第二行不见了' }
    const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
    fire(row); fire(other)
    await sleep(120)
    rightClick(row, 340, 340)
    await sleep(400)
    const menus = mine()
    if (menus.length !== 1) return { why: '菜单没打开（' + menus.length + ' 张）' }
    if (!menus[0].classList.contains(ownerClass)) return { why: '菜单不属于这份实例，已拒绝点击' }
    const item = menus[0].querySelector('button[role="menuitem"]')
    if (item === null) return { why: '菜单里没有批量项' }
    return { menu: menus[0], item, label: (item.textContent ?? '').trim(), row }
  }
  // 第一轮：取消。
  stub(false)
  const first = await openOnFixture()
  if (first.why != null) { window.confirm = realConfirm; return { bail: first.why, asked: null } }
  first.item.click()
  await sleep(500)
  const survivedIds = svc.workspaces.list.getSnapshot().items.map((i) => i.workspaceId)
  // 第二轮：放行，真删。
  stub(true)
  const second = await openOnFixture()
  if (second.why != null) { window.confirm = realConfirm; return { bail: second.why, asked, survivedDecline: survivedIds.length === beforeIds.length } }
  second.item.click()
  await sleep(2000)
  window.confirm = realConfirm
  await closeAll()
  const afterIds = svc.workspaces.list.getSnapshot().items.map((i) => i.workspaceId)
  return {
    bail: null, asked: typeof asked === 'string' ? asked : null, label: second.label,
    survivedDecline: survivedIds.length === beforeIds.length && survivedIds.includes(fx.workspaceId),
    declinedKeptFixture: survivedIds.includes(fx.workspaceId),
    selectionCleared: sel.size() === 0,
    fixtureGone: !afterIds.includes(fx.workspaceId),
    otherKept: afterIds.filter((id) => !beforeIds.includes(id)).length === 0,
    menuClosed: mine().length === 0,
  }
})()`), (v) => {
  if (v.bail != null) return `没测到：${v.bail}`
  if (v.asked === null) return '点批量删除没弹确认框'
  if (typeof v.label !== 'string' || !v.label.includes('2')) return `批量项文案是 ${JSON.stringify(v.label)}，数量没对上`
  if (v.survivedDecline !== true) return '确认框选了取消，工作区还是被删了'
  if (v.declinedKeptFixture !== true) return '取消之后靶子工作区不见了'
  if (v.selectionCleared !== true) return '执行后选择集没清空'
  if (v.fixtureGone !== true) return '放行之后靶子工作区仍在——删除没落地'
  if (v.otherKept !== true) return '多删了靶子之外的工作区'
  if (v.menuClosed !== true) return '执行后菜单没关'
  return true
})

// 靶子工作区在上面那条里被真删了，所以重建一组给收尾用：`cleanupFixtures` 只认页面上
// 那一个 `__dshOiFixtures__`，指着已删的工作区收尾等于什么都没收。
const fixtures2 = await createFixtures(evaluate, 'dsh-oi-verify-b')
console.log('[fixtures:second]', JSON.stringify(fixtures2))

// 收尾在 dispose **之前**：删除工作区靠的是句柄上的 `services`，dispose 之后句柄就没了。
const cleaned = await cleanupFixtures(evaluate)
console.log('[cleanup]', JSON.stringify(cleaned))
if (cleaned.deleted !== true || cleaned.removed !== true) {
  console.warn(`[cleanup] 靶子没收干净：${JSON.stringify(cleaned)}——靶子工作区的记录与目录都应当删掉。`)
}

// 卸载：所有副作用被摘掉。菜单的 React 树是模块级单例，dispose 之后连容器一起走。
check('dispose cleans up', await evaluate(`(async () => {
  ${PRELUDE}
  const host = document.querySelector('.dsh-oi-menu__host')
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  h.dispose()
  await sleep(300)
  if (row !== null) row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 150, clientY: 150, view: window }))
  await sleep(250)
  return {
    styleGone: document.querySelector('style[data-plugin="@Tinnikx/dsh-operation-improve"]') === null,
    handleGone: window.__dshOperationImprove__ === undefined,
    highlightsGone: document.querySelectorAll('[data-dsh-oi-selected]').length === 0,
    menuNotOpened: document.querySelector('.dsh-oi-menu') === null,
    hostGone: host !== null && document.querySelector('.dsh-oi-menu__host') === null,
    hostExisted: host !== null,
  }
})()`), (v) => {
  if (v.styleGone !== true) return '样式表没被摘掉'
  if (v.handleGone !== true) return '调试句柄没被摘掉'
  if (v.highlightsGone !== true) return '高亮属性还留在 DOM 上'
  if (v.menuNotOpened !== true) return 'contextmenu 监听器没摘干净，卸载后仍能弹菜单'
  if (v.hostExisted !== true) return 'React 容器从没建起来，这条等于没测'
  if (v.hostGone !== true) return '菜单的 React 容器没被摘掉'
  return true
})

conn.ws.close()
report()
