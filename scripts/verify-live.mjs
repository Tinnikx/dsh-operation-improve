/**
 * 实测驱动：把构建出的 client bundle 注入运行中的 DSH 页面，跑功能 1/2 的断言。
 *
 * 走裸 CDP（无 puppeteer 依赖）。**脚本自己不起浏览器**，只复用一个已经加载了
 * DSH 页面的 CDP 实例（默认 127.0.0.1:9333）。页面里的插件加载器已经启动完毕，
 * 所以脚本不走 `__ModuleLoader__`，而是用一个假 loader 截下 registration、取出
 * factory 的 exports，手动 apply 一个最小 ctx（`effect` 收集 disposer，
 * `workspaces`/`sessions` 换成 spy），这样断言的是**真实 DOM 上的行为**，
 * 同时不去动用户真实的会话数据。
 *
 * CDP 连接与断言框架来自 [lib/cdp.mjs](lib/cdp.mjs)，与 `verify-timestamps-live.mjs` 共用：
 * 判据语义（skip 也算失败、非零退出）只有一份实现，改一处不会漏掉另一处。
 *
 * 失败语义（这一条是重点）：**没测到 = 失败**。窗口太窄时侧边栏是折叠的，
 * 一条 `[role="treeitem"]` 都查不到，早先的版本会把每条断言记成 skipped
 * 然后以退出码 0 结束——看起来通过，实际什么都没验证。现在前置检查不满足
 * 直接非零退出，任何 skipped 也计为失败。
 *
 * **注入之前必须先停掉页面自带的那份实例**。插件装在 profile 里，页面每次加载都会
 * 自己 apply 一份；不停掉就是两份实例抢同一批 DOM，而这个脚本会真的点菜单项——
 * 点到的是 native 那一份，服务不是 spy 而是真的。理由与三道闸见清场那一段。
 *
 * **默认打的是测试栈（3181）而不是日常那个 harness（3080）**，见
 * [lib/cdp.mjs](lib/cdp.mjs) 的 `resolveTarget`。先 `node scripts/test-stack.mjs up`。
 *
 * 用法：node scripts/verify-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过 Page.reload（同页连跑两次结果不可信）
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

/** 跑满全部断言所需的最小行数：批量分支两种 kind 各要 2 行。 */
const NEED = { sessions: 2, workspaces: 2 }

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

// 先刷新页面：同一个页面里连跑两次会留下上一次的样式、监听器与残留菜单，
// 断言就会打在旧实例上。刷新是唯一干净的起点。
if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
}

// 展开所有折叠的工作区，让会话行也够 2 条，批量分支才测得到。
await evaluate(`(async () => {
  for (const r of document.querySelectorAll('[role="treeitem"]')) {
    if (String(r.className).includes('_projectRow') && r.getAttribute('aria-expanded') === 'false') r.click()
  }
  await new Promise((r) => setTimeout(r, 1500))
  return true
})()`)

// ---- 前置检查：窗口够不够宽、侧边栏是不是展开的 ----------------------------
// 窄窗口下侧边栏折叠，treeitem 为 0，后续每条断言都会退化成「没东西可点」。
// 那不是通过，是没测。这里直接中止。
const viewport = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
  const of = (k) => rows.filter((el) => String(el.className).includes(k)).length
  return { width: innerWidth, height: innerHeight, total: rows.length,
    sessions: of('_sessionRow'), workspaces: of('_projectRow') }
})()`)
console.log('[preflight]', JSON.stringify(viewport))

if (viewport.total === 0) {
  abort(
    '侧边栏处于折叠态，一条 [role="treeitem"] 都查不到——实测未发生。',
    `观测：innerWidth=${viewport.width} innerHeight=${viewport.height} treeitem=0\n` +
    '原因：窗口宽度不足（约 <1200px 时侧边栏收起）。\n' +
    '处理：用 --window-size=1600,1000 重起 Chrome 实例后再跑，见 README「验证」。',
  )
}
if (viewport.sessions < NEED.sessions || viewport.workspaces < NEED.workspaces) {
  abort(
    '侧边栏行数不足以跑满批量分支——部分断言将无法执行，拒绝以「跳过」收场。',
    `观测：会话行 ${viewport.sessions}（需 ≥${NEED.sessions}）、工作区行 ${viewport.workspaces}（需 ≥${NEED.workspaces}）\n` +
    `innerWidth=${viewport.width}\n` +
    '处理：确认窗口宽度足够、工作区已展开，且该 profile 下至少有 2 个工作区与 2 个会话。',
  )
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')

// ---- 清场：停掉页面自带的那份实例 --------------------------------------------
// 插件装进 profile 之后，页面每次加载都会自己 `apply` 一份。不停掉就注入，页面上
// 会有两份互不知情的实例抢同一批 DOM：右键弹**两个**菜单，而捕获阶段的监听器按
// 注册顺序触发，native 那份先 append，于是 `document.querySelector('.dsh-oi-menu')`
// 拿到的是 native 的菜单——脚本以为点的是自己的 spy，**实际点在真服务上**，批量
// 归档那条断言会真的归档掉用户的会话（已经发生过一次，8 个真实会话）。
//
// 所以这里要么把 native 停干净，要么中止；**绝不带着两份实例往下点**。
const cleaned = await evaluate(`(async () => {
  const native = window.__dshOperationImprove__
  let how = 'absent'
  let borrowed = false
  if (native !== undefined && native !== null) {
    if (typeof native.dispose !== 'function') return { how: 'no-dispose' }
    // 先借出上游词典的 translate。native 实例是这个页面上唯一拿得到真实 locale
    // 服务的地方，而它下一行就要停掉；注入实例的 ctx 是脚本自己造的，不借这一份，
    // 文案断言比对的就是桩数据，验不出「菜单文本来自上游 workspace 词典」。
    // 借出的是 bind 出来的闭包，词典注册被 dispose 摘掉也不影响它读上游那份。
    if (native.locale !== undefined && typeof native.locale.t === 'function') {
      window.__dshOiT__ = native.locale.t
      borrowed = true
    }
    native.dispose()
    how = 'disposed'
  }
  if (window.__dshOiTest__ !== undefined) {
    window.__dshOiTest__.disposers.forEach((d) => { try { d() } catch (error) { void error } })
    delete window.__dshOiTest__
  }
  for (const el of document.querySelectorAll('.dsh-oi-menu')) el.remove()
  for (const el of document.querySelectorAll('[data-dsh-oi-selected]')) el.removeAttribute('data-dsh-oi-selected')
  for (const el of document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]')) el.remove()
  await new Promise((r) => setTimeout(r, 300))
  return { how, borrowed, lang: document.documentElement.lang,
    handle: typeof window.__dshOperationImprove__,
    styles: document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]').length,
    menus: document.querySelectorAll('.dsh-oi-menu').length,
    highlights: document.querySelectorAll('[data-dsh-oi-selected]').length }
})()`)
console.log('[clean]', JSON.stringify(cleaned))
if (cleaned.how === 'no-dispose') {
  abort(
    '页面自带的实例停不掉——它的调试句柄上没有 `dispose()`，说明 profile 里装的是旧版本的构建产物。',
    '带着两份实例往下跑，右键会弹两个菜单，脚本点到的是 native 那一份，'
    + '批量归档会真的归档掉用户的会话。\n'
    + '处理：重新构建并让 profile 用上新的 lib/client.js（`node scripts/build.mjs` 后刷新页面），'
    + '或 `dsh plugin --profile web remove @Tinnikx/dsh-operation-improve` 之后重跑。',
  )
}
if (cleaned.how === 'disposed' && cleaned.borrowed !== true) {
  abort(
    '页面自带的实例没有 `locale.t`——profile 里装的构建产物早于「菜单文案改走 harness 词典」那一版。',
    '拿不到上游 translate，文案断言只能对着桩数据比，验不出菜单文本是否与 harness 一致。\n'
    + '处理：`node scripts/build.mjs` 后刷新页面重跑。',
  )
}
if (cleaned.handle !== 'undefined' || cleaned.styles !== 0 || cleaned.menus !== 0 || cleaned.highlights !== 0) {
  abort(
    '清场没清干净——页面上还留着本插件的实例、样式表、菜单或高亮，之后的断言分不清是谁的产物。',
    `观测：${JSON.stringify(cleaned)}\n处理：整页 reload 后重跑（去掉 DSH_OI_NO_RELOAD=1）。`,
  )
}

// 用一个假的 __ModuleLoader__ 截下 registration，拿到 factory 的 exports。
//
// `ctx.locale` 是半桩半真：上游 namespace 的 translate 是清场时从 native 实例借来的
// **真函数**（真词典、真 active locale），本插件自己那个 namespace 走桩——它的词典
// 随 native 实例一起被摘掉了，桩按插件自己交上来的那份 dict 查，locale 取
// `<html lang>`（locale 服务把 active locale 同步在这个属性上）。
const boot = `
(() => {
  const BUNDLE = ${JSON.stringify(bundle)};
  const real = window.__ModuleLoader__
  let captured = null
  window.__ModuleLoader__ = { load: (r) => { captured = r } }
  try { (0, eval)(BUNDLE) } finally { window.__ModuleLoader__ = real }
  if (captured === null) return { ok: false, reason: 'bundle did not register' }
  const exports = captured.factory((name) => { throw new Error('unexpected external require: ' + name) })
  const disposers = []
  const calls = []
  const spy = (label) => new Proxy({}, { get: (_t, method) => (...args) => {
    calls.push({ label, method: String(method), args })
    return Promise.resolve(undefined)
  } })
  // sessions 不能是纯 spy：插件的 rename 走 \`sessions.binding(id)?.session.rename()\`，
  // 而 Proxy 的通用分支返回 Promise，\`?.session\` 就是 undefined，rename 那条路径永远
  // 走不到。这里给 binding / fork 两个真实形状的桩，其余方法照旧记账。
  // \`__dshOiSessionStub__\` 让断言当场切换分支（binding 缺席、rename 失败）。
  window.__dshOiSessionStub__ = { binding: 'ok', renameResult: { ok: true }, forkChildId: 'child-session-id' }
  const sessions = new Proxy({}, { get: (_t, prop) => {
    const method = String(prop)
    if (method === 'binding') {
      return (id) => {
        calls.push({ label: 'sessions', method: 'binding', args: [id] })
        if (window.__dshOiSessionStub__.binding !== 'ok') return undefined
        return { session: { rename: (title) => {
          calls.push({ label: 'session', method: 'rename', args: [title] })
          return Promise.resolve(window.__dshOiSessionStub__.renameResult)
        } } }
      }
    }
    if (method === 'fork') {
      return (arg) => {
        calls.push({ label: 'sessions', method: 'fork', args: [arg] })
        return Promise.resolve(window.__dshOiSessionStub__.forkChildId)
      }
    }
    return (...args) => {
      calls.push({ label: 'sessions', method, args })
      return Promise.resolve(undefined)
    }
  } })
  // 菜单项的动作是 \`void run(...)\`，失败只以未处理的 rejection 现身。收下来才断言得了
  // 「binding 拿不到就抛」——不收的话那条断言只能看到「什么都没发生」，而那正是要防的
  // 静默吞掉。preventDefault 是为了不让它污染页面控制台。
  const rejections = []
  const onRejection = (event) => {
    const reason = event.reason
    rejections.push(reason instanceof Error ? reason.message : String(reason))
    event.preventDefault()
  }
  window.addEventListener('unhandledrejection', onRejection)
  disposers.push(() => { window.removeEventListener('unhandledrejection', onRejection) })
  const dicts = {}
  const activeLocale = () => (document.documentElement.lang || 'en').toLowerCase().split('-')[0]
  const render = (template, params) => params === undefined
    ? template
    : template.replace(/\\{(\\w+)\\}/g, (m, k) => (k in params ? String(params[k]) : m))
  const ctx = {
    effect: (cb) => { const d = cb(); if (typeof d === 'function') disposers.push(d) },
    workspaces: spy('workspaces'),
    sessions,
    locale: {
      register: (ns, d) => { dicts[ns] = d; return () => { delete dicts[ns] } },
      bind: (ns) => (key, params) => {
        if (!(ns in dicts)) return window.__dshOiT__(key, params)
        const d = dicts[ns]
        const entries = d[activeLocale()] ?? d.en ?? {}
        return render(entries[key] ?? key, params)
      },
    },
  }
  exports.apply(ctx)
  const handle = window.__dshOperationImprove__
  if (handle === undefined || typeof handle.instanceId !== 'string') {
    return { ok: false, reason: 'applied instance exposes no instanceId' }
  }
  window.__dshOiTest__ = { exports, disposers, calls, rejections, dicts, registeredId: captured.id, instanceId: handle.instanceId }
  return { ok: true, id: captured.id, name: exports.name, inject: exports.inject, instanceId: handle.instanceId,
    ownDictLocales: Object.keys(dicts).length === 0 ? [] : Object.keys(dicts[Object.keys(dicts)[0]]) }
})()
`

const applied = await evaluate(boot)
console.log('[boot]', JSON.stringify(applied))
if (applied.ok !== true) abort('bundle 注入失败', JSON.stringify(applied))

const PICK = `
  const pick = () => {
    const rows = [...document.querySelectorAll('[role="treeitem"]')]
    const of = (k) => rows.filter((el) => String(el.className).includes(k))
    const s = of('_sessionRow'), w = of('_projectRow')
    const want = window.__dshOiPreferKind__
    if (want === 'workspace' && w.length >= 2) return { kind: 'workspace', rows: w }
    if (s.length >= 2) return { kind: 'session', rows: s }
    if (w.length >= 2) return { kind: 'workspace', rows: w }
    return { kind: null, rows: [] }
  }
`

const { check, report } = createChecker()

// 文案的两个来源都到位：`locale` 必须列进 `inject`（漏了的话 cordis 会在 `ctx.locale`
// 上给 undefined，插件启动就炸），本插件自己那份词典必须两个 locale 都有——缺一个不
// 报错，只会让那个语言下的批量项静默落回英文。
check('locale wired', {
  inject: applied.inject,
  ownDictLocales: applied.ownDictLocales,
}, (v) => {
  if (!Array.isArray(v.inject) || !v.inject.includes('locale')) {
    return `inject 里没有 locale：${JSON.stringify(v.inject)}`
  }
  const locales = [...(v.ownDictLocales ?? [])].sort()
  if (locales.join(',') !== 'en,zh') return `本插件词典的 locale 是 ${JSON.stringify(locales)}，应为 ["en","zh"]`
  return true
})

check('stylesheet inserted', await evaluate(
  `!!document.querySelector('style[data-plugin="@Tinnikx/dsh-operation-improve"]')`,
), (v) => v === true || '样式表没插进 <head>')

// 侧边栏行盘点 + fiber 反查是否有效。
check('rows found', await evaluate(`(() => {
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
  const probe = rows.map((el) => {
    const cls = typeof el.className === 'string' ? el.className : ''
    const kind = cls.includes('_sessionRow') ? 'session' : cls.includes('_projectRow') ? 'workspace' : null
    let fiber = null
    for (const k of Object.keys(el)) if (k.startsWith('__reactFiber$')) fiber = el[k]
    let id = null, depth = 0
    while (fiber && depth < 24 && id === null) {
      const p = fiber.memoizedProps
      if (p && typeof p === 'object') {
        const cands = kind === 'session'
          ? [p.sessionId, p.node && p.node.id, p.row && p.row.id, p.item && p.item.id, p.session && p.session.id]
          : [p.workspaceId, p.group && p.group.workspaceId, p.workspace && p.workspace.id, p.node && p.node.workspaceId, p.project && p.project.id]
        for (const c of cands) if (typeof c === 'string' && c) { id = c; break }
      }
      fiber = fiber.return; depth += 1
    }
    return { kind, id, hasId: id !== null }
  })
  return { total: rows.length, sessions: probe.filter(p => p.kind === 'session').length,
    workspaces: probe.filter(p => p.kind === 'workspace').length,
    resolved: probe.filter(p => p.hasId).length, sample: probe.slice(0, 4) }
})()`), (v) => {
  if (v.total === 0) return '一条行都没有，实测未发生'
  if (v.sessions < NEED.sessions) return `会话行只有 ${v.sessions}，不足 ${NEED.sessions}`
  if (v.workspaces < NEED.workspaces) return `工作区行只有 ${v.workspaces}，不足 ${NEED.workspaces}`
  if (v.resolved === 0) return 'fiber 反查一个 id 都没拿到，功能整体失灵'
  if (v.resolved < v.total - 1) return `${v.total} 行中只反查出 ${v.resolved} 个 id，超出容忍（允许 1 行拿不到）`
  return true
})

// 功能 1：ctrl+点击两行，断言选择集与高亮。
check('ctrl-click multi-select', await evaluate(`(() => {
  ${PICK}
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const { kind, rows } = pick()
  if (kind === null) return { skipped: 'need >= 2 same-kind rows' }
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', {
    bubbles: true, cancelable: true, ctrlKey: true, view: window,
  }))
  fire(rows[0]); fire(rows[1])
  const size2 = sel.size()
  const highlighted = document.querySelectorAll('[data-dsh-oi-selected]').length
  fire(rows[1])
  const sizeAfterToggleOff = sel.size()
  fire(rows[1])
  return { usedKind: kind, kind: sel.getKind(), size: size2, highlighted,
    sizeAfterToggleOff, finalSize: sel.size(),
    serviceCallsDuringSelect: window.__dshOiTest__.calls.length }
})()`), (v) => {
  if (v.size !== 2) return `ctrl+点击两行后 size=${v.size}，应为 2`
  if (v.highlighted !== 2) return `高亮 ${v.highlighted} 个，应为 2`
  if (v.sizeAfterToggleOff !== 1) return `再点一次应摘除，size=${v.sizeAfterToggleOff}，应为 1`
  if (v.kind !== v.usedKind) return `kind=${v.kind}，应为 ${v.usedKind}`
  if (v.serviceCallsDuringSelect !== 0) return `选择期间调了 ${v.serviceCallsDuringSelect} 次服务，应为 0`
  return true
})

check('ctrl-click suppresses row navigation', await evaluate(`(() => {
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const sessionRow = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!sessionRow) return { skipped: 'no session row' }
  const before = document.querySelectorAll('[aria-selected="true"]').length
  const beforeUrl = location.href
  const evt = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window })
  sessionRow.dispatchEvent(evt)
  const wsRow = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_projectRow'))
  if (!wsRow) return { skipped: 'no workspace row' }
  const expandedBefore = wsRow.getAttribute('aria-expanded')
  wsRow.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  return new Promise((r) => setTimeout(() => r({
    defaultPrevented: evt.defaultPrevented,
    ariaSelectedCountUnchanged: document.querySelectorAll('[aria-selected="true"]').length === before,
    urlUnchanged: location.href === beforeUrl,
    workspaceExpandUnchanged: wsRow.getAttribute('aria-expanded') === expandedBefore,
  }), 120))
})()`), (v) => {
  if (v.defaultPrevented !== true) return 'ctrl+点击没有 preventDefault，行自身的 onClick 会照跑'
  if (v.ariaSelectedCountUnchanged !== true) return 'aria-selected 计数变了，说明会话被真的打开了'
  if (v.urlUnchanged !== true) return 'URL 变了，导航没被挡住'
  if (v.workspaceExpandUnchanged !== true) return 'aria-expanded 变了，工作区被真的展开/收起了'
  return true
})

// 同级约束：接着 ctrl+点击一个不同 kind 的行，选择集必须清空重来。
check('kind switch clears', await evaluate(`(() => {
  ${PICK}
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const { kind, rows } = pick()
  if (kind === null) return { skipped: 'need >= 2 same-kind rows' }
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  fire(rows[0]); fire(rows[1])
  const sizeBefore = sel.size()
  const other = kind === 'session' ? '_projectRow' : '_sessionRow'
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes(other))
  if (!row) return { skipped: 'no row of the other kind' }
  fire(row)
  return { fromKind: kind, sizeBefore, kind: sel.getKind(), size: sel.size() }
})()`), (v) => {
  if (v.sizeBefore !== 2) return `切换前应有 2 个选中，实际 ${v.sizeBefore}`
  if (v.size !== 1) return `切 kind 后应只剩新点的那 1 个，实际 ${v.size}`
  if (v.kind === v.fromKind) return `kind 没切过去，仍是 ${v.kind}`
  return true
})

// 功能 2 单选：右键一个会话行。
//
// **文案不比对字面量，比对上游词典当场给出的那串文本**。写死「分叉会话」等于把断言
// 绑在 zh 上，切到 en 跑就红；而写死之后上游改文案，插件跟着变、断言反而拦住——两个
// 方向都不是这条断言要看的。它要看的是「菜单上这一项 === `workspace` 词典里的那一
// 项」，顺带确认那一项确实解析出了译文（等于键名本身说明查找链全落空了）。
check('contextmenu single (session)', await evaluate(`(() => {
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { skipped: 'no session row' }
  const evt = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, view: window })
  row.dispatchEvent(evt)
  const menu = document.querySelector('.dsh-oi-menu')
  const items = menu ? [...menu.querySelectorAll('.dsh-oi-menu__item')].map(b => b.textContent) : null
  const rect = menu ? menu.getBoundingClientRect() : null
  return { defaultPrevented: evt.defaultPrevented, items, lang: document.documentElement.lang,
    upstream: { rename: window.__dshOiT__('rename'), fork: window.__dshOiT__('menu.fork'),
      archive: window.__dshOiT__('menu.archiveSession') },
    inViewport: rect ? (rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1) : null }
})()`), (v) => {
  if (v.defaultPrevented !== true) return '没有 preventDefault，浏览器原生菜单会弹出来'
  if (v.items === null) return '菜单没渲染出来'
  if (v.items.length !== 3) return `单选会话应有 3 项，实际 ${JSON.stringify(v.items)}`
  for (const key of ['rename', 'fork', 'archive']) {
    if (v.upstream[key] === undefined) return `断言自己没取到 ${key}`
  }
  if (v.upstream.rename === 'rename') return '上游词典查不出 rename，菜单会显示键名本身'
  if (v.upstream.fork === 'menu.fork') return '上游词典查不出 menu.fork，菜单会显示键名本身'
  if (v.upstream.archive === 'menu.archiveSession') return '上游词典查不出 menu.archiveSession'
  if (v.items[0] !== v.upstream.rename) return `重命名项是 ${JSON.stringify(v.items[0])}，上游词典给的是 ${JSON.stringify(v.upstream.rename)}`
  if (v.items[1] !== v.upstream.fork) return `fork 项是 ${JSON.stringify(v.items[1])}，上游词典给的是 ${JSON.stringify(v.upstream.fork)}`
  if (v.items[2] !== v.upstream.archive) return `归档项是 ${JSON.stringify(v.items[2])}，上游词典给的是 ${JSON.stringify(v.upstream.archive)}`
  if (v.inViewport !== true) return '菜单溢出视口，翻转逻辑失效'
  return true
})

check('escape closes', await evaluate(`(() => {
  const openedBefore = document.querySelector('.dsh-oi-menu') !== null
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  return { openedBefore, menuGone: document.querySelector('.dsh-oi-menu') === null }
})()`), (v) => {
  if (v.openedBefore !== true) return '按 Esc 之前菜单就不在，这条没测到关闭行为'
  if (v.menuGone !== true) return 'Esc 没能关掉菜单'
  return true
})

// 单选工作区：另外两项同样必须逐字等于上游词典。这条和上一条合起来覆盖单选的全部
// 四项——四项都对上，「同一个动作在两个菜单里叫两个名字」就不可能再发生。
check('contextmenu single (workspace)', await evaluate(`(() => {
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_projectRow'))
  if (!row) return { skipped: 'no workspace row' }
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 260, view: window }))
  const menu = document.querySelector('.dsh-oi-menu')
  const items = menu ? [...menu.querySelectorAll('.dsh-oi-menu__item')].map(b => b.textContent) : null
  const result = { items, lang: document.documentElement.lang,
    upstream: { rename: window.__dshOiT__('rename'), del: window.__dshOiT__('delete.workspace') } }
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
  return result
})()`), (v) => {
  if (v.items === null) return '菜单没渲染出来'
  if (v.items.length !== 2) return `单选工作区应有 2 项，实际 ${JSON.stringify(v.items)}`
  if (v.upstream.rename === 'rename') return '上游词典查不出 rename，菜单会显示键名本身'
  if (v.upstream.del === 'delete.workspace') return '上游词典查不出 delete.workspace'
  if (v.items[0] !== v.upstream.rename) return `重命名项是 ${JSON.stringify(v.items[0])}，上游词典给的是 ${JSON.stringify(v.upstream.rename)}`
  if (v.items[1] !== v.upstream.del) return `删除项是 ${JSON.stringify(v.items[1])}，上游词典给的是 ${JSON.stringify(v.upstream.del)}`
  return true
})

// 确认框的正文同样出自词典。**桩 confirm 恒返回 false**，所以这条断言点的是「删除
// 工作区」而一次服务调用都不发出——量的是弹出来的那段文本，不是它之后的动作。
// 单选删除拼的是上游删除对话框的标题与正文，`{name}` 填的是行文本。
check('confirm copy comes from the dictionary', await evaluate(`(() => {
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_projectRow'))
  if (!row) return { skipped: 'no workspace row' }
  // 插件取的是 fiber 上的 \`group.label\`，而工作区行标题 span 渲染的就是那个 label——
  // 这里从 DOM 读同一个值，比对才不依赖 fiber 内部字段。
  const titleSpan = row.querySelector('[class*="_title"]')
  const name = titleSpan === null ? '' : (titleSpan.textContent ?? '').trim()
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 260, view: window }))
  const menus = document.querySelectorAll('.dsh-oi-menu')
  const owner = menus.length === 1 ? menus[0].getAttribute('data-dsh-oi-owner') : null
  const realConfirm = window.confirm
  let asked = null
  window.confirm = (m) => { asked = m; return false }
  const before = window.__dshOiTest__.calls.length
  const item = menus.length === 1 ? menus[0].querySelectorAll('.dsh-oi-menu__item')[1] : null
  if (item !== null) item.click()
  return new Promise((resolve) => setTimeout(() => {
    window.confirm = realConfirm
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
    resolve({ menus: menus.length, owner, mine: window.__dshOiTest__.instanceId, asked, name,
      callsAfterDecline: window.__dshOiTest__.calls.length - before,
      upstream: { title: window.__dshOiT__('delete.workspace'), desc: window.__dshOiT__('delete.desc', { name }) } })
  }, 80))
})()`), (v) => {
  if (v.menus !== 1) return `页面上有 ${v.menus} 个菜单，已拒绝点击`
  if (v.owner !== v.mine) return `菜单归属对不上：owner=${v.owner} 而本次注入的是 ${v.mine}`
  if (v.asked === null) return '点删除没弹确认框'
  if (typeof v.name !== 'string' || v.name === '') return '行标题读成了空串，`{name}` 填不进去，这条等于没比'
  if (v.callsAfterDecline !== 0) return `确认框选了「取消」却还是发出了 ${v.callsAfterDecline} 次服务调用`
  if (v.upstream.desc === 'delete.desc') return '上游词典查不出 delete.desc'
  if (v.asked !== `${v.upstream.title}\n\n${v.upstream.desc}`) {
    return `确认框正文是 ${JSON.stringify(v.asked)}，上游词典拼出来的是 ${JSON.stringify(v.upstream.title + '\n\n' + v.upstream.desc)}`
  }
  return true
})

// ---- 与行自己那个「...」菜单对齐 ---------------------------------------------
//
// 右键菜单是纯 DOM 手写的，图标是从 `ui-primitives` 拷过来的常量（那个包只导出 React
// 组件，见 [../src/shared/menu-icons.js](../src/shared/menu-icons.js)），尺寸是照抄
// `Menu.module.css` 的默认档。两处都会漂：上游换一版矢量、改一档尺寸，这边不会有任何
// 编译期报错，只是画着一版旧的。所以判据不是「和某个字面量相等」，而是**当场点开同一行
// 真实的「...」菜单，与自己弹的那个逐项比**。
const ROWMENU = `
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const portalMenus = () => [...document.querySelectorAll('div[role="menu"]')]
    .filter((el) => !el.classList.contains('dsh-oi-menu'))
  // 行右侧的操作区平时是隐形的，但 click() 不看可见性。「...」是操作区里的第一个按钮
  // （工作区行的第二个是「新建会话」，点错会真的开一个会话），所以只认第一个，并要求
  // 它确实多弹出了一个 portal 菜单。
  const openRowMenu = async (row) => {
    const actions = row.querySelector('[class*="rowActions"]')
    if (actions === null) return { menu: null, why: 'row has no actions slot' }
    const buttons = [...actions.querySelectorAll('button')]
    if (buttons.length === 0) return { menu: null, why: 'actions slot has no button' }
    const before = portalMenus().length
    buttons[0].click()
    await sleep(300)
    const menus = portalMenus()
    if (menus.length !== before + 1) {
      return { menu: null, why: 'the first action button opened ' + (menus.length - before) + ' portal menus' }
    }
    return { menu: menus[menus.length - 1], why: null }
  }
  const closeRowMenu = async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await sleep(250)
  }
  const describe = (menu) => [...menu.querySelectorAll('button[role="menuitem"]')].map((b) => {
    const svg = b.querySelector('svg')
    return {
      label: (b.textContent || '').trim(),
      viewBox: svg === null ? null : svg.getAttribute('viewBox'),
      width: svg === null ? null : svg.getAttribute('width'),
      height: svg === null ? null : svg.getAttribute('height'),
      paths: svg === null ? null : [...svg.querySelectorAll('path')].map((p) => p.getAttribute('d')),
    }
  })
  const metrics = (menu) => {
    const item = menu.querySelector('button[role="menuitem"]')
    const icon = item === null ? null : item.children[0]
    const l = getComputedStyle(menu)
    const i = item === null ? null : getComputedStyle(item)
    const c = icon === null || icon === undefined ? null : getComputedStyle(icon)
    return {
      list: { boxSizing: l.boxSizing, minWidth: l.minWidth, maxWidth: l.maxWidth, padding: l.padding,
        borderRadius: l.borderRadius, borderTopWidth: l.borderTopWidth, boxShadow: l.boxShadow },
      item: i === null ? null : { minHeight: i.minHeight, padding: i.padding, columnGap: i.columnGap,
        borderRadius: i.borderRadius, fontSize: i.fontSize, lineHeight: i.lineHeight,
        fontFamily: i.fontFamily, fontWeight: i.fontWeight, textAlign: i.textAlign, color: i.color },
      icon: c === null ? null : { width: c.width, height: c.height, color: c.color },
    }
  }
  // 危险项（工作区的「删除」）的配色单独取一份：它走的是另一套 token，和普通项一起比
  // 的话，把 danger 规则整条写错也照样过。
  const dangerRow = (menu, index) => {
    const item = menu.querySelectorAll('button[role="menuitem"]')[index]
    if (item === undefined) return null
    const icon = item.children[0]
    return {
      color: getComputedStyle(item).color,
      iconColor: icon === undefined ? null : getComputedStyle(icon).color,
    }
  }
  const pair = async (row, x, y) => {
    const opened = await openRowMenu(row)
    if (opened.menu === null) { await closeRowMenu(); return { why: opened.why } }
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, view: window }))
    const mineMenus = document.querySelectorAll('.dsh-oi-menu')
    const one = mineMenus.length === 1 ? mineMenus[0] : null
    const result = {
      why: null,
      menus: mineMenus.length,
      owner: one === null ? null : one.getAttribute('data-dsh-oi-owner'),
      mine: window.__dshOiTest__.instanceId,
      upstreamItems: describe(opened.menu),
      myItems: one === null ? null : describe(one),
      upstreamMetrics: metrics(opened.menu),
      myMetrics: one === null ? null : metrics(one),
      upstreamDanger: dangerRow(opened.menu, 1),
      myDanger: one === null ? null : dangerRow(one, 1),
    }
    await closeRowMenu()
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
    await sleep(150)
    result.upstreamClosed = !document.body.contains(opened.menu)
    result.mineClosed = document.querySelector('.dsh-oi-menu') === null
    return result
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
    return mine === upstream ? null : `${path}: 本插件 ${JSON.stringify(mine)} / 上游 ${JSON.stringify(upstream)}`
  }
  for (const key of Object.keys(upstream)) {
    const diff = styleDiff(mine[key], upstream[key], path === '' ? key : `${path}.${key}`)
    if (diff !== null) return diff
  }
  return null
}

/** 两条断言共用一次页面交互：菜单只点开一次，比对两个维度。 */
const sessionPair = await evaluate(`(async () => {
  ${ROWMENU}
  window.__dshOperationImprove__.selection.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')].find((el) =>
    String(el.className).includes('_sessionRow') && el.querySelector('[class*="rowActions"] button') !== null)
  if (!row) return { why: 'no session row carries the ... button' }
  return await pair(row, 200, 200)
})()`)

check('session menu mirrors the row\'s own menu', sessionPair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.menus !== 1) return `页面上有 ${v.menus} 个本插件菜单`
  if (v.owner !== v.mine) return `菜单归属对不上：owner=${v.owner} 而本次注入的是 ${v.mine}`
  if (v.upstreamItems.length !== 3) {
    return `上游「...」菜单有 ${v.upstreamItems.length} 项（本条按 3 项对齐）：${JSON.stringify(v.upstreamItems.map((i) => i.label))}`
  }
  if (v.myItems.some((i) => i.paths === null || i.paths.length === 0)) {
    return `有菜单项没有图标：${JSON.stringify(v.myItems.map((i) => ({ label: i.label, paths: i.paths })))}`
  }
  if (JSON.stringify(v.myItems) !== JSON.stringify(v.upstreamItems)) {
    return '逐项（顺序 / 文案 / viewBox / 尺寸 / path）比对不等：\n'
      + `  本插件 ${JSON.stringify(v.myItems)}\n  上游   ${JSON.stringify(v.upstreamItems)}`
  }
  if (v.upstreamClosed !== true || v.mineClosed !== true) return '收尾没关掉菜单，会污染后续断言'
  return true
})

check('menu metrics match the primitives default tier', sessionPair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.myMetrics === null) return '本插件菜单没渲染出来'
  const diff = styleDiff(v.myMetrics, v.upstreamMetrics)
  if (diff !== null) return `计算样式不等 —— ${diff}`
  if (v.upstreamMetrics.list.minWidth === 'auto' || v.upstreamMetrics.item === null) {
    return `上游菜单的计算样式读成了 ${JSON.stringify(v.upstreamMetrics)}，这条等于没比`
  }
  return true
})

const workspacePair = await evaluate(`(async () => {
  ${ROWMENU}
  window.__dshOperationImprove__.selection.clear()
  // 「未分组」那一行没有 actions，只有一个「新建会话」按钮；要的是有两个按钮的真实工作区行。
  const row = [...document.querySelectorAll('[role="treeitem"]')].find((el) =>
    String(el.className).includes('_projectRow')
    && el.querySelectorAll('[class*="rowActions"] button').length >= 2)
  if (!row) return { why: 'no workspace row carries both the ... and + buttons' }
  return await pair(row, 200, 260)
})()`)

check('workspace menu mirrors the row\'s own menu', workspacePair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.menus !== 1) return `页面上有 ${v.menus} 个本插件菜单`
  if (v.owner !== v.mine) return `菜单归属对不上：owner=${v.owner} 而本次注入的是 ${v.mine}`
  if (v.upstreamItems.length !== 2) {
    return `上游「...」菜单有 ${v.upstreamItems.length} 项（本条按 2 项对齐）：${JSON.stringify(v.upstreamItems.map((i) => i.label))}`
  }
  if (JSON.stringify(v.myItems) !== JSON.stringify(v.upstreamItems)) {
    return '逐项（顺序 / 文案 / viewBox / 尺寸 / path）比对不等：\n'
      + `  本插件 ${JSON.stringify(v.myItems)}\n  上游   ${JSON.stringify(v.upstreamItems)}`
  }
  if (v.upstreamClosed !== true || v.mineClosed !== true) return '收尾没关掉菜单，会污染后续断言'
  return true
})

check('danger row keeps upstream colouring', workspacePair, (v) => {
  if (v.why != null) return `没测到：${v.why}`
  if (v.upstreamDanger === null || v.myDanger === null) return '取不到删除项，这条等于没比'
  const diff = styleDiff(v.myDanger, v.upstreamDanger)
  if (diff !== null) return `删除项配色不等 —— ${diff}`
  if (v.myDanger.color === v.myMetrics.item.color) {
    return `删除项和普通项同色（${v.myDanger.color}），danger 规则没生效`
  }
  return true
})

// ---- 单选的四个动作各自打在什么上 ----------------------------------------------
//
// 这四条比文案断言更靠后一层：文案对了不代表点下去做的是同一件事。桩把服务全换成
// spy，所以点击是安全的，但**点之前照样验菜单归属**——理由见批量那条。
check('session rename dispatches session.rename', await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__dshOperationImprove__.selection.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { bail: 'no session row' }
  const titleSpan = row.querySelector('[class*="_title"]')
  const titleText = titleSpan === null ? '' : (titleSpan.textContent || '').trim()
  const rowText = (row.textContent || '').trim()
  const openMine = () => {
    row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, view: window }))
    const menus = document.querySelectorAll('.dsh-oi-menu')
    if (menus.length !== 1) return null
    if (menus[0].getAttribute('data-dsh-oi-owner') !== window.__dshOiTest__.instanceId) return null
    return menus[0]
  }
  const realPrompt = window.prompt
  const realConfirm = window.confirm
  let confirmCalled = false
  window.confirm = () => { confirmCalled = true; return false }
  let asked = null
  window.prompt = (message, initial) => { asked = { message, initial }; return '  改过的标题  ' }
  const restore = () => { window.prompt = realPrompt; window.confirm = realConfirm }
  const menu = openMine()
  if (menu === null) { restore(); return { bail: 'menu ownership check failed' } }
  const before = window.__dshOiTest__.calls.length
  // rejections 是整轮累积的，只能取增量。
  const beforeRejections = window.__dshOiTest__.rejections.length
  menu.querySelectorAll('.dsh-oi-menu__item')[0].click()
  await sleep(200)
  const calls = window.__dshOiTest__.calls.slice(before)
  window.prompt = () => null
  const cancelMenu = openMine()
  const before2 = window.__dshOiTest__.calls.length
  if (cancelMenu !== null) cancelMenu.querySelectorAll('.dsh-oi-menu__item')[0].click()
  await sleep(200)
  const cancelledCalls = window.__dshOiTest__.calls.length - before2
  restore()
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
  const renameCall = calls.find((c) => c.method === 'rename')
  return { asked, titleText, rowText, confirmCalled, cancelledCalls, cancelMenu: cancelMenu !== null,
    calls: calls.map((c) => c.label + '.' + c.method),
    renameArg: renameCall === undefined ? null : renameCall.args[0],
    bindingArg: (calls.find((c) => c.method === 'binding') || { args: [null] }).args[0],
    rejections: window.__dshOiTest__.rejections.length - beforeRejections,
    upstreamTitle: window.__dshOiT__('rename.session.title') }
})()`), (v) => {
  if (v.bail !== undefined) return `没测到：${v.bail}`
  if (v.asked === null) return '点重命名没弹输入框'
  if (v.upstreamTitle === 'rename.session.title') return '上游词典查不出 rename.session.title'
  if (v.asked.message !== v.upstreamTitle) {
    return `输入框标题是 ${JSON.stringify(v.asked.message)}，上游词典给的是 ${JSON.stringify(v.upstreamTitle)}`
  }
  if (v.asked.initial !== v.titleText) {
    return `初值是 ${JSON.stringify(v.asked.initial)}，行标题是 ${JSON.stringify(v.titleText)}`
  }
  if (v.rowText !== v.titleText && v.asked.initial === v.rowText) {
    return `初值取成了整行文本 ${JSON.stringify(v.rowText)}（状态与相对时间都在里面）`
  }
  if (v.confirmCalled !== false) return '重命名弹了二次确认，上游没有'
  if (v.calls.join(',') !== 'sessions.binding,session.rename') {
    return `应先 binding 再 rename，实际 ${JSON.stringify(v.calls)}`
  }
  if (typeof v.bindingArg !== 'string' || v.bindingArg.length === 0) return `binding 拿到的不是真实 id：${JSON.stringify(v.bindingArg)}`
  if (v.renameArg !== '改过的标题') return `rename 收到的标题是 ${JSON.stringify(v.renameArg)}，应是 trim 过的「改过的标题」`
  if (v.cancelMenu !== true) return '取消分支的菜单没打开，那一半没测到'
  if (v.cancelledCalls !== 0) return `输入框点了取消却还是发出了 ${v.cancelledCalls} 次服务调用`
  if (v.rejections !== 0) return `重命名过程中出现了 ${v.rejections} 次未处理的 rejection`
  return true
})

// binding 拿不到时必须抛。侧边栏里的行按定义都在会话列表里，所以走到这一步说明选中的
// id 根本不是会话——静默返回的表现是「点了重命名，输入框填了，什么也没发生」。
check('rename without a binding fails loudly', await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__dshOperationImprove__.selection.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { bail: 'no session row' }
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, view: window }))
  const menus = document.querySelectorAll('.dsh-oi-menu')
  if (menus.length !== 1 || menus[0].getAttribute('data-dsh-oi-owner') !== window.__dshOiTest__.instanceId) {
    return { bail: 'menu ownership check failed' }
  }
  const realPrompt = window.prompt
  window.prompt = () => '随便什么'
  window.__dshOiSessionStub__.binding = 'missing'
  const beforeCalls = window.__dshOiTest__.calls.length
  const beforeRejections = window.__dshOiTest__.rejections.length
  menus[0].querySelectorAll('.dsh-oi-menu__item')[0].click()
  await sleep(200)
  window.__dshOiSessionStub__.binding = 'ok'
  window.prompt = realPrompt
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
  return { rejections: window.__dshOiTest__.rejections.slice(beforeRejections),
    calls: window.__dshOiTest__.calls.slice(beforeCalls).map((c) => c.label + '.' + c.method) }
})()`), (v) => {
  if (v.bail !== undefined) return `没测到：${v.bail}`
  if (v.calls.join(',') !== 'sessions.binding') return `应止步于 binding，实际 ${JSON.stringify(v.calls)}`
  if (v.rejections.length !== 1) return `应抛一次，实际抛了 ${v.rejections.length} 次：${JSON.stringify(v.rejections)}`
  if (!v.rejections[0].includes('unknown session')) return `抛出来的不是「拿不到 binding」：${JSON.stringify(v.rejections[0])}`
  return true
})

// fork 的两个动作都要跟上游：标题带序号（`increaseTitle`），完了把子会话打开。
check('fork increases the title and opens the child', await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__dshOperationImprove__.selection.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { bail: 'no session row' }
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, view: window }))
  const menus = document.querySelectorAll('.dsh-oi-menu')
  if (menus.length !== 1 || menus[0].getAttribute('data-dsh-oi-owner') !== window.__dshOiTest__.instanceId) {
    return { bail: 'menu ownership check failed' }
  }
  const realConfirm = window.confirm
  let confirmCalled = false
  window.confirm = () => { confirmCalled = true; return false }
  const before = window.__dshOiTest__.calls.length
  // rejections 是整轮累积的（上一条断言就故意制造了一次），只能取增量。
  const beforeRejections = window.__dshOiTest__.rejections.length
  menus[0].querySelectorAll('.dsh-oi-menu__item')[1].click()
  await sleep(200)
  window.confirm = realConfirm
  const calls = window.__dshOiTest__.calls.slice(before)
  return { confirmCalled, calls: calls.map((c) => c.label + '.' + c.method),
    forkArg: (calls.find((c) => c.method === 'fork') || { args: [null] }).args[0],
    openArg: (calls.find((c) => c.method === 'open') || { args: [null] }).args[0],
    menuClosed: document.querySelector('.dsh-oi-menu') === null,
    rejections: window.__dshOiTest__.rejections.length - beforeRejections }
})()`), (v) => {
  if (v.bail !== undefined) return `没测到：${v.bail}`
  if (v.confirmCalled !== false) return 'fork 弹了二次确认，上游没有'
  if (v.calls.join(',') !== 'sessions.fork,sessions.open') return `应先 fork 再 open，实际 ${JSON.stringify(v.calls)}`
  if (v.forkArg === null || typeof v.forkArg.sessionId !== 'string' || v.forkArg.sessionId.length === 0) {
    return `fork 的 sessionId 不是真实 id：${JSON.stringify(v.forkArg)}`
  }
  if (v.forkArg.increaseTitle !== true) return `fork 没带 increaseTitle: true：${JSON.stringify(v.forkArg)}`
  if (v.openArg !== 'child-session-id') return `open 收到的不是 fork 返回的子会话 id：${JSON.stringify(v.openArg)}`
  if (v.menuClosed !== true) return '执行后菜单没关'
  if (v.rejections !== 0) return `fork 过程中出现了 ${v.rejections} 次未处理的 rejection`
  return true
})

// 上游的「归档会话」点下去直接归档。这条锁的是**没有**二次确认——多问一次不会报错，
// 只会让同一个动作在两个入口上手感不同。
check('single archive skips the confirmation', await evaluate(`(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  window.__dshOperationImprove__.selection.clear()
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { bail: 'no session row' }
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 200, view: window }))
  const menus = document.querySelectorAll('.dsh-oi-menu')
  if (menus.length !== 1 || menus[0].getAttribute('data-dsh-oi-owner') !== window.__dshOiTest__.instanceId) {
    return { bail: 'menu ownership check failed' }
  }
  const realConfirm = window.confirm
  let confirmCalled = false
  // 恒返回 false：真被问了，动作也不会发生，观测值一样分得清。
  window.confirm = () => { confirmCalled = true; return false }
  const before = window.__dshOiTest__.calls.length
  const beforeRejections = window.__dshOiTest__.rejections.length
  menus[0].querySelectorAll('.dsh-oi-menu__item')[2].click()
  await sleep(200)
  window.confirm = realConfirm
  const calls = window.__dshOiTest__.calls.slice(before)
  return { confirmCalled, calls: calls.map((c) => c.label + '.' + c.method),
    arg: (calls[0] || { args: [null] }).args[0],
    menuClosed: document.querySelector('.dsh-oi-menu') === null,
    rejections: window.__dshOiTest__.rejections.length - beforeRejections }
})()`), (v) => {
  if (v.bail !== undefined) return `没测到：${v.bail}`
  if (v.confirmCalled !== false) return '单选归档弹了二次确认，上游点下去就直接归档'
  if (v.calls.join(',') !== 'workspaces.archiveSession') return `应只调一次 archiveSession，实际 ${JSON.stringify(v.calls)}`
  if (typeof v.arg !== 'string' || v.arg.length === 0) return `参数不是真实 id：${JSON.stringify(v.arg)}`
  if (v.menuClosed !== true) return '执行后菜单没关'
  if (v.rejections !== 0) return `归档过程中出现了 ${v.rejections} 次未处理的 rejection`
  return true
})

check('outside pointerdown closes', await evaluate(`(() => {
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { skipped: 'no session row' }
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 120, clientY: 120, view: window }))
  const opened = document.querySelector('.dsh-oi-menu') !== null
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 900, clientY: 500 }))
  return { opened, closed: document.querySelector('.dsh-oi-menu') === null }
})()`), (v) => {
  if (v.opened !== true) return '菜单没打开，无从验证外部点击关闭'
  if (v.closed !== true) return '点击外部没关掉菜单'
  return true
})

// 滚动关闭的边界：只有**锚点跟着动**的那次滚动才关菜单。
//
// 捕获阶段挂在 window 上的 scroll 监听器会收到页面里任何一个容器的滚动事件，
// 而会话区流式输出时每来一段就自动滚到底一次——无差别关闭的表现就是「一边输出
// 一边右键，菜单弹出来立刻消失」。这条断言滚的是不含锚点行的容器（优先真实会话
// 区，它正是自动滚到底的那个），菜单必须还在。
check('unrelated scroll keeps the menu open', await evaluate(`(async () => {
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { skipped: 'no session row' }
  const scrollable = (el) => {
    const cs = getComputedStyle(el)
    return (cs.overflowY === 'auto' || cs.overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 8
  }
  // 页面停在首页时没有会话区，回落到任意一个不含锚点的滚动容器，再不济自造一个：
  // 判据是「这个容器不含锚点」，容器是谁不影响结论，但要如实记进观测值。
  let source = 'conversation'
  let box = document.querySelector('[data-conversation-scroll]')
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
  await new Promise((r) => setTimeout(r, 150))
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 240, view: window }))
  const opened = document.querySelector('.dsh-oi-menu') !== null
  let events = 0
  const spy = () => { events += 1 }
  box.addEventListener('scroll', spy)
  // 流式输出期间应用做的就是这件事：内容长一段，容器往下滚一次。
  const step = Math.max(1, Math.floor((box.scrollHeight - box.clientHeight) / 4))
  for (let i = 1; i <= 3; i += 1) {
    box.scrollTop = step * i
    await new Promise((r) => setTimeout(r, 150))
  }
  box.removeEventListener('scroll', spy)
  const stillOpen = document.querySelector('.dsh-oi-menu') !== null
  const moved = box.scrollTop > 0
  if (synthetic !== null) synthetic.remove()
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
  return { source, cls: String(box.className).slice(0, 40), opened, moved, scrollEvents: events, stillOpen,
    cleanedUp: document.querySelector('.dsh-oi-menu') === null }
})()`), (v) => {
  if (v.opened !== true) return '菜单没打开，无从验证滚动'
  if (v.moved !== true) return `容器 scrollTop 没动（source=${v.source}）——滚动实测未发生`
  if (v.scrollEvents < 3) return `容器只打出 ${v.scrollEvents} 条 scroll 事件（滚了 3 次）——滚动实测未发生`
  if (v.stillOpen !== true) {
    return `滚动不含锚点的容器（source=${v.source}）把菜单关掉了——会话区流式输出时右键菜单会自己消失`
  }
  if (v.cleanedUp !== true) return '收尾没关掉菜单，会污染后续断言'
  return true
})

// 另一半：锚点行所在的那个容器滚动时，菜单必须关——菜单是 fixed 定位，容器一滚
// 锚点就跑了，留着的菜单指向的是另一行。
check('anchor container scroll closes the menu', await evaluate(`(async () => {
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (!row) return { skipped: 'no session row' }
  let box = null
  for (let n = row.parentElement; n !== null; n = n.parentElement) {
    const cs = getComputedStyle(n)
    if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') { box = n; break }
  }
  if (box === null) return { skipped: '锚点行没有 overflow-y 可滚的祖先容器' }
  const room = box.scrollHeight - box.clientHeight
  const origin = box.scrollTop
  box.scrollTop = 0
  await new Promise((r) => setTimeout(r, 150))
  row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 200, clientY: 240, view: window }))
  const opened = document.querySelector('.dsh-oi-menu') !== null
  // 侧边栏内容不够长时滚不动，退回合成事件：scroll 不冒泡，但 dispatchEvent 照样
  // 走完从 window 下来的捕获路径，判据一致，只是要如实记下用的是哪种。
  const mode = room > 8 ? 'real' : 'synthetic'
  if (mode === 'real') box.scrollTop = Math.min(room, 120)
  else box.dispatchEvent(new Event('scroll'))
  await new Promise((r) => setTimeout(r, 200))
  const closed = document.querySelector('.dsh-oi-menu') === null
  // 复位必须等它落定再返回：滚动事件是异步派发的，漏出去就会落到下一条断言刚打开
  // 的那个菜单上，把它关掉——那是本断言的收尾在污染别人，不是被测行为出错。
  box.scrollTop = origin
  let last = -1
  let settled = 0
  for (let waited = 0; settled < 3 && waited < 1500; waited += 100) {
    await new Promise((r) => setTimeout(r, 100))
    if (box.scrollTop === last) settled += 1
    else { settled = 0; last = box.scrollTop }
  }
  return { mode, room, cls: String(box.className).slice(0, 40), opened, closed, restoredTo: box.scrollTop }
})()`), (v) => {
  if (v.opened !== true) return '菜单没打开，无从验证滚动关闭'
  if (v.closed !== true) return `滚动锚点所在容器（${v.cls}，mode=${v.mode}）没关掉菜单`
  return true
})

// 功能 2 多选：两行同 kind 选中后右键，菜单只剩批量项。
//
// 批量项上游没有对应词条，文案出自插件自己注册的那份词典，所以断言比对的是**它交上来
// 的模板**套上 n=2 的结果——验的是「用了哪个键、数量填对了没有」，而不是某个语言下的
// 字面量。`OWN` 取词典的方式与插件运行时一致：active locale 缺席就落 en。
const OWN = `
  const ownText = (key, n) => {
    const dicts = window.__dshOiTest__.dicts['@Tinnikx/dsh-operation-improve']
    const lang = (document.documentElement.lang || 'en').toLowerCase().split('-')[0]
    const entries = dicts[lang] ?? dicts.en
    return entries[key].replace('{n}', String(n))
  }
`
check('contextmenu batch', await evaluate(`(() => {
  ${PICK}
  ${OWN}
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const { kind, rows } = pick()
  if (kind === null) return { skipped: 'need >= 2 same-kind rows' }
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  fire(rows[0]); fire(rows[1])
  rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 300, clientY: 300, view: window }))
  const menu = document.querySelector('.dsh-oi-menu')
  const items = menu ? [...menu.querySelectorAll('.dsh-oi-menu__item')].map(b => b.textContent) : null
  return { usedKind: kind, selected: sel.size(), items,
    expected: ownText(kind === 'session' ? 'batch.archiveSessions' : 'batch.deleteWorkspaces', 2) }
})()`), (v) => {
  if (v.selected !== 2) return `应有 2 个选中，实际 ${v.selected}`
  if (v.items === null) return '菜单没渲染出来'
  if (v.items.length !== 1) return `多选菜单应只剩 1 个批量项，实际 ${JSON.stringify(v.items)}`
  if (v.items[0] !== v.expected) {
    return v.usedKind === 'session'
      ? `多选会话应为批量归档项 ${JSON.stringify(v.expected)}（sessions 无 delete 方法），实际 ${JSON.stringify(v.items)}`
      : `多选工作区应为批量删除项 ${JSON.stringify(v.expected)}，实际 ${JSON.stringify(v.items)}`
  }
  return true
})

// 批量操作真的会调服务（confirm 打桩为 true，服务是 spy，不会动真数据）。
//
// **点之前先验菜单的归属**。这是三道闸里的最后一道，也是唯一一道不靠推理的：清场
// 保证 native 已经停掉，数量检查保证页面上只有一个菜单，而这里直接读菜单元素上的
// `data-dsh-oi-owner`，要求它逐字等于本次注入实例的 `instanceId`。两者不等就说明
// 这个菜单是别人开的——它的 `workspaces` 不是 spy 而是真服务，点下去就是真归档。
// 任何一条不满足都记 FAIL 并原路返回，**一个 click 都不发**。
check('batch action dispatches service', await evaluate(`(() => {
  const realConfirm = window.confirm
  window.confirm = () => true
  const before = window.__dshOiTest__.calls.length
  const mine = window.__dshOiTest__.instanceId
  // 该点出哪个方法由**选择集的 kind** 决定，不由标签文字决定：文案跟着 harness 语言
  // 走，拿它当判据等于让断言在英文界面下悄悄挑错分支。点击会清空选择集，所以先读。
  const kind = window.__dshOperationImprove__.selection.getKind()
  const menus = document.querySelectorAll('.dsh-oi-menu')
  const owner = menus.length === 1 ? menus[0].getAttribute('data-dsh-oi-owner') : null
  const bail = (extra) => {
    window.confirm = realConfirm
    return { menus: menus.length, owner, mine, kind, label: null, calls: [], args: [],
      menuClosed: null, selectionCleared: null, ...extra }
  }
  if (menus.length !== 1) return bail({})
  if (owner === null || owner !== mine) return bail({})
  const item = menus[0].querySelector('.dsh-oi-menu__item')
  const label = item.textContent
  item.click()
  return new Promise((resolve) => setTimeout(() => {
    window.confirm = realConfirm
    const calls = window.__dshOiTest__.calls.slice(before)
    resolve({ menus: 1, owner, mine, kind, label, calls: calls.map(c => c.label + '.' + c.method), args: calls.map(c => c.args[0]),
      menuClosed: document.querySelector('.dsh-oi-menu') === null,
      selectionCleared: window.__dshOperationImprove__.selection.size() === 0 })
  }, 120))
})()`), (v) => {
  if (v.menus !== 1) {
    return v.menus === 0
      ? '菜单没打开，无从验证批量操作'
      : `页面上有 ${v.menus} 个菜单——存在第二份实例，点下去会打在真服务上，已拒绝点击`
  }
  if (v.owner === null) {
    return '菜单没有 data-dsh-oi-owner——它不是本次注入的实例开的（或 profile 里是旧产物），已拒绝点击'
  }
  if (v.owner !== v.mine) {
    return `菜单归属对不上：owner=${v.owner} 而本次注入的实例是 ${v.mine}——`
      + '这个菜单背后的服务不是 spy 而是真的，已拒绝点击'
  }
  if (v.calls.length !== 2) return `应对 2 个目标各调一次，实际 ${JSON.stringify(v.calls)}`
  if (v.kind !== 'session' && v.kind !== 'workspace') return `选择集的 kind 读不出来：${JSON.stringify(v.kind)}`
  const expected = v.kind === 'session' ? 'workspaces.archiveSession' : 'workspaces.delete'
  if (!v.calls.every((c) => c === expected)) return `批量 ${v.kind} 应调 ${expected}：${JSON.stringify(v.calls)}`
  if (v.args.length !== 2 || v.args.some((a) => typeof a !== 'string' || a.length === 0)) {
    return `参数不是两个真实 id：${JSON.stringify(v.args)}`
  }
  if (v.args[0] === v.args[1]) return `两次调用传了同一个 id：${JSON.stringify(v.args)}`
  if (v.menuClosed !== true) return '执行后菜单没关'
  if (v.selectionCleared !== true) return '执行后选择集没清空'
  return true
})

// 另一半批量分支：强制用工作区行，菜单必须是 `batch.deleteWorkspaces` 套 n=2 的那一条。
check('contextmenu batch (workspaces)', await evaluate(`(() => {
  ${PICK}
  ${OWN}
  window.__dshOiPreferKind__ = 'workspace'
  const sel = window.__dshOperationImprove__.selection
  sel.clear()
  const { kind, rows } = pick()
  window.__dshOiPreferKind__ = undefined
  if (kind !== 'workspace') return { skipped: 'need >= 2 workspace rows' }
  const fire = (el) => el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, view: window }))
  fire(rows[0]); fire(rows[1])
  rows[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 340, clientY: 340, view: window }))
  const menu = document.querySelector('.dsh-oi-menu')
  const items = menu ? [...menu.querySelectorAll('.dsh-oi-menu__item')].map(b => b.textContent) : null
  const result = { usedKind: kind, selected: sel.size(), items, expected: ownText('batch.deleteWorkspaces', 2) }
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 1500, clientY: 800 }))
  sel.clear()
  return result
})()`), (v) => {
  if (v.selected !== 2) return `应有 2 个工作区选中，实际 ${v.selected}`
  if (v.items === null) return '菜单没渲染出来'
  if (v.items.length !== 1) return `应只剩 1 个批量项，实际 ${JSON.stringify(v.items)}`
  if (v.items[0] !== v.expected) return `应为 ${JSON.stringify(v.expected)}，实际 ${JSON.stringify(v.items)}`
  return true
})

// 卸载：所有副作用被摘掉。
check('dispose cleans up', await evaluate(`(() => {
  window.__dshOiTest__.disposers.forEach(d => d())
  const row = [...document.querySelectorAll('[role="treeitem"]')]
    .find((el) => String(el.className).includes('_sessionRow'))
  if (row) row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 150, clientY: 150, view: window }))
  return {
    styleGone: document.querySelector('style[data-plugin="@Tinnikx/dsh-operation-improve"]') === null,
    handleGone: window.__dshOperationImprove__ === undefined,
    highlightsGone: document.querySelectorAll('[data-dsh-oi-selected]').length === 0,
    menuNotOpened: document.querySelector('.dsh-oi-menu') === null,
  }
})()`), (v) => {
  if (v.styleGone !== true) return '样式表没被摘掉'
  if (v.handleGone !== true) return '调试句柄没被摘掉'
  if (v.highlightsGone !== true) return '高亮属性还留在 DOM 上'
  if (v.menuNotOpened !== true) return 'contextmenu 监听器没摘干净，卸载后仍能弹菜单'
  return true
})

conn.ws.close()
report()
