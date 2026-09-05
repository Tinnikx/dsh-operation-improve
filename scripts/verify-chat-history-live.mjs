/**
 * 功能 9 的端到端验证：在运行中的 DSH 页面上验证对话历史导航。
 *
 * 不注入 bundle、不 apply 自造 ctx，验的是页面自带实例：功能 9 不调用任何 harness
 * 服务，没有需要打桩的破坏性动作。
 *
 * 断言清单（14 条）：
 *  1. 页面有 chatHistory 句柄且 snapshot 返回 { sessionId, history, index }
 *  2. 打开一个多轮会话后：历史非空，且条目数与导航列条目数一致
 *  3. 历史文本与独立读取的导航列条目一致（loaded 轮次对得上气泡全文）
 *  4. 空输入框按 ↑：显示最新一条提问
 *  5. 连续 ↑：回翻到更早一条
 *  6. 按满 ↑：停在最早一条且不越界
 *  7. ↓ 向最新方向翻一条
 *  8. ↓ 超出末尾：退出导航并清空输入框
 *  9. 输入框有未提交内容且光标在文中：↑ 不接管（文本不变）
 * 10. 多行内容：光标在非文档开头时 ↑ 不接管
 * 11. 会话隔离：切到另一个会话，历史换成那个会话的
 * 12. 不写 localStorage（历史只读导航列，无任何本地记录）
 * 13. dispose 后 ↑ 不再接管
 * 14. 清场：刷新后页面重新长出新实例
 *
 * 历史断言的 oracle 是脚本自己对导航列与消息流的独立读取——被测会话的提问全部
 * 先于插件存在（安装前的提问必须也能翻出来），不从插件的存储侧取任何期望值。
 *
 * CDP 连接与断言框架来自 [lib/cdp.mjs](lib/cdp.mjs)。
 *
 * 默认打测试栈（3181），先 `node scripts/test-stack.mjs up`。
 * 用法：node scripts/verify-chat-history-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过开头那次 Page.reload
 *
 * 机制前提（0.1.2-rc.1 实测）：
 * - 应用没有 URL 路由，会话切换靠点侧边栏行（URL 恒为 `/`）。
 * - 输入框是 Lexical contenteditable：设值断言读 innerText；清空用 selectAll +
 *   真实 Delete 键（`execCommand('delete')` 在 Lexical 上不生效）。
 * - 导航列条目在 `nav` 的 fiber props.items 里（prompt 是 50 字预览，loaded 锚点
 *   指向消息流气泡的全文）。
 */
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

/** composer 选择器片段（页面侧 eval 共用）。 */
const COMPOSER = `document.querySelector('div[contenteditable="true"][role="textbox"]')`

// ---- 辅助：真实键盘事件 ----

/** 发一次真实按键（按下 + 抬起）。 */
async function press(key, code, vk) {
  for (const type of ['rawKeyDown', 'keyUp']) {
    const res = await conn.send('Input.dispatchKeyEvent', {
      type, key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk,
    })
    if (res.error !== undefined) abort('Input.dispatchKeyEvent 失败', JSON.stringify(res.error))
  }
  await sleep(150)
}

// ---- 辅助：composer 读写（页面侧） ----

const readComposerText = () => evaluate(`(() => {
  const ce = ${COMPOSER}
  return ce === null ? null : (ce.innerText ?? '').replace(/\\n+$/, '')
})()`)

const focusComposer = () => evaluate(`(() => {
  const ce = ${COMPOSER}
  if (ce === null) return false
  ce.focus()
  // 程序化 focus 在空 composer 上未必落出 selection；没有就显式塌到开头，
  // 否则「光标在文档开头」门控拿不到确定状态。
  const sel = window.getSelection()
  if (sel.rangeCount === 0 || !ce.contains(sel.anchorNode)) {
    sel.setBaseAndExtent(ce, 0, ce, 0)
  }
  return document.activeElement === ce
})()`)

/** 程序化清空（selectAll + 真实 Delete 键——Lexical 只认按键管线）。 */
async function clearComposer() {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await evaluate(`(() => {
      const ce = ${COMPOSER}
      if (ce === null) return false
      ce.focus()
      document.execCommand('selectAll', false)
      return true
    })()`)
    await sleep(150) // selectAll 的选区同步是异步的，等它落定再删
    await press('Delete', 'Delete', 46)
    await sleep(150)
    if ((await readComposerText()) === '') return
  }
  abort('composer 清空失败', 'selectAll + Delete 三次后仍有内容。')
}

/** CDP 插入文本（真实输入路径，Lexical 会同步内部状态）。 */
async function insertText(text) {
  const res = await conn.send('Input.insertText', { text })
  if (res.error !== undefined) abort('Input.insertText 失败', JSON.stringify(res.error))
  await sleep(200)
}

const readSnapshot = () => evaluate(`(() => {
  const h = window.__dshOperationImprove__
  return h?.chatHistory?.snapshot() ?? null
})()`)

// ---- 辅助：导航列的独立读取（oracle，与插件实现分开写） ----

/** 脚本自己的导航列条目读取：fiber items + loaded 锚点的气泡全文。 */
const readRailIndependently = () => evaluate(`(() => {
  for (const nav of document.querySelectorAll('nav')) {
    const fiberKey = Object.keys(nav).find((k) => k.startsWith('__reactFiber$'))
    if (fiberKey === undefined) continue
    let fiber = nav[fiberKey]
    let depth = 0
    while (fiber && depth < 12) {
      const props = fiber.memoizedProps
      if (props && typeof props === 'object' && Array.isArray(props.items)
          && typeof props.onNavigate === 'function'
          && props.items.every((it) => it && typeof it === 'object' && typeof it.turn === 'number')) {
        return props.items.map((it) => {
          let full = null
          const a = it.anchor
          if (a && a.kind === 'loaded' && typeof a.key === 'string') {
            const row = document.querySelector('[data-chat-flow-key="' + CSS.escape(a.key) + '"]')
            const bubble = row?.querySelector('[class*="_bubble"]')
            const t = bubble?.innerText?.trim()
            full = t || null
          }
          return { turn: it.turn, prompt: it.prompt ?? '', full }
        })
      }
      fiber = fiber.return
      depth += 1
    }
  }
  return null
})()`)

// ---- 环境准备 ----

if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
}
await conn.send('Page.enable')

const boot = await evaluate(`(() => {
  const h = window.__dshOperationImprove__
  if (h === undefined) return { fatal: 'no-handle' }
  return {
    instanceId: h.instanceId,
    hasChatHistory: typeof h.chatHistory?.dispose === 'function',
    hasSnapshot: typeof h.chatHistory?.snapshot === 'function',
  }
})()`)
if (boot.fatal !== undefined) {
  abort('页面上没有本插件的实例句柄', 'window.__dshOperationImprove__ 不存在：插件没装进 profile，或 apply 中途崩了（看页面 console）。')
}
if (!boot.hasChatHistory || !boot.hasSnapshot) {
  abort('页面加载的是旧产物', `观测：hasChatHistory=${boot.hasChatHistory} hasSnapshot=${boot.hasSnapshot}。`
    + '先 node scripts/build.mjs，再重跑。')
}

const { check, report } = createChecker()

// ---- 1：chatHistory 句柄存在 ----

const snap0 = await readSnapshot()
check('chatHistory 句柄存在且 snapshot 返回对象', snap0,
  (v) => (v !== null && typeof v === 'object' && 'sessionId' in v && 'history' in v && 'index' in v)
    || `期望 { sessionId, history, index }，实测 ${JSON.stringify(v)}`)

// ---- 2-3：打开多轮会话，历史与导航列一致 ----
// 选会话不能按名字：测试栈副本随用户真实 home 漂移，且部分会话的视图没有输入框
// （或挂载很慢）。逐行点开，等「历史 ≥2 且 composer 在、且两次读数一致（视图落定）」。

/** 侧边栏会话行的元数据（跳过「新会话」与运行中的会话——运行中的会话页输入框不可用）。 */
const listSessionRowMeta = () => evaluate(`(() => {
  for (const r of document.querySelectorAll('[role="treeitem"]')) {
    if (String(r.className).includes('_projectRow') && r.getAttribute('aria-expanded') === 'false') r.click()
  }
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'))
    .filter((r) => !(r.textContent ?? '').includes('新会话'))
  return rows.map((row) => {
    let running = null
    const fiberKey = Object.keys(row).find((k) => k.startsWith('__reactFiber$'))
    if (fiberKey !== undefined) {
      let fiber = row[fiberKey]
      while (fiber && running === null) {
        if (typeof fiber.memoizedProps?.node?.running === 'boolean') running = fiber.memoizedProps.node.running
        fiber = fiber.return
      }
    }
    return { running, title: (row.textContent ?? '').trim().slice(0, 24) }
  })
})()`)

/** 点开第 index 条会话行（跳过「新会话」）。 */
const clickSessionRow = (index) => evaluate(`(() => {
  for (const r of document.querySelectorAll('[role="treeitem"]')) {
    if (String(r.className).includes('_projectRow') && r.getAttribute('aria-expanded') === 'false') r.click()
  }
  const rows = [...document.querySelectorAll('[role="treeitem"]')]
    .filter((el) => String(el.className).includes('_sessionRow'))
    .filter((r) => !(r.textContent ?? '').includes('新会话'))
  const row = rows[${index}]
  if (!row) return false
  row.click()
  return (row.textContent ?? '').trim().slice(0, 30)
})()`)

const probeState = () => evaluate(`(() => {
  const snap = window.__dshOperationImprove__?.chatHistory?.snapshot() ?? null
  return {
    sessionId: snap?.sessionId ?? null,
    history: snap?.history ?? null,
    composer: document.querySelector('div[contenteditable="true"][role="textbox"]') !== null,
  }
})()`)

let baseHistory = null
let baseSession = null
{
  const meta = await listSessionRowMeta()
  console.log(`[session-pick] ${meta.length} 行，非运行中：${meta.filter((m) => m.running !== true).length} 行`)
  for (let rowIndex = 0; rowIndex < Math.min(meta.length, 12) && baseHistory === null; rowIndex += 1) {
    if (meta[rowIndex].running === true) continue // 运行中的会话页输入框不可用
    if ((await clickSessionRow(rowIndex)) === false) break
    let prev = null
    for (let i = 0; i < 26; i += 1) {
      await sleep(500)
      const state = await probeState()
      if (state.composer && Array.isArray(state.history) && state.history.length >= 2
          && prev !== null && prev.sessionId === state.sessionId
          && JSON.stringify(prev.history) === JSON.stringify(state.history)) {
        baseHistory = state.history
        baseSession = state.sessionId
        break
      }
      prev = state
    }
  }
}
if (baseHistory === null) {
  abort('找不到「历史 ≥2 且带输入框」的落定会话', '测试栈副本里需要一个多轮且非运行中的会话。')
}

const railOracle = await readRailIndependently()
check('历史非空且条数与导航列条目一致', { history: baseHistory.length, rail: railOracle?.length },
  (v) => v.history >= 2 && v.history === v.rail
    || `期望 history===导航列条目数 且 ≥2，实测 ${JSON.stringify(v)}`)

check('历史文本与导航列条目独立读取一致', { plugin: baseHistory, oracle: railOracle },
  (v) => {
    if (!Array.isArray(v.oracle) || v.oracle.length === 0) return 'oracle 读不到导航列条目'
    if (v.oracle.length !== v.plugin.length) return `条数不符：插件 ${v.plugin.length} vs oracle ${v.oracle.length}`
    for (let i = 0; i < v.oracle.length; i += 1) {
      const expected = (v.oracle[i].full ?? v.oracle[i].prompt ?? '').trim()
      if (v.plugin[i] !== expected) {
        return `第 ${i + 1} 条不符：插件=${JSON.stringify(v.plugin[i])} oracle=${JSON.stringify(expected)}`
      }
    }
    return true
  })

// ---- 4-8：↑/↓ 导航（期望值取自被测会话的真实提问） ----

await clearComposer()
if (!(await focusComposer())) abort('composer 不存在或无法聚焦', '需要一个带输入框的会话页。')
await sleep(100)

await press('ArrowUp', 'ArrowUp', 38)
await sleep(200)
const lastIdx = baseHistory.length - 1
const up1 = { text: await readComposerText(), snap: await readSnapshot() }
check('空输入框按 ↑：显示最新一条提问', { text: up1.text, index: up1.snap?.index },
  (v) => v.text === baseHistory[lastIdx] && v.index === lastIdx
    || `期望 text=${JSON.stringify(baseHistory[lastIdx])} index=${lastIdx}，实测 ${JSON.stringify(v)}`)

await press('ArrowUp', 'ArrowUp', 38)
await sleep(200)
check('连续 ↑：回翻到更早一条', { text: await readComposerText() },
  (v) => v.text === baseHistory[lastIdx - 1]
    || `期望 ${JSON.stringify(baseHistory[lastIdx - 1])}，实测 ${JSON.stringify(v)}`)

// 连按到顶端并多按一次（历史可能多于 2 条）：应停在最早一条不越界
for (let i = 0; i < baseHistory.length; i += 1) {
  await press('ArrowUp', 'ArrowUp', 38)
  await sleep(120)
}
check('按满 ↑ 后停在最早一条', { text: await readComposerText() },
  (v) => v.text === baseHistory[0]
    || `期望 ${JSON.stringify(baseHistory[0])}，实测 ${JSON.stringify(v)}`)

// ---- 7-8：↓ 返程 ----

await press('ArrowDown', 'ArrowDown', 40)
await sleep(200)
check('↓：向最新方向翻一条', { text: await readComposerText() },
  (v) => v.text === baseHistory[1]
    || `期望 ${JSON.stringify(baseHistory[1])}，实测 ${JSON.stringify(v)}`)

for (let i = 0; i < baseHistory.length; i += 1) {
  await press('ArrowDown', 'ArrowDown', 40)
  await sleep(120)
}
const downEnd = { text: await readComposerText(), snap: await readSnapshot() }
check('↓ 超出末尾：退出导航并清空输入框', { text: downEnd.text, index: downEnd.snap?.index },
  (v) => v.text === '' && v.index === -1 || `期望空串且 index=-1，实测 ${JSON.stringify(v)}`)

// ---- 9：有未提交内容且光标在文中，↑ 不接管 ----

await clearComposer()
await focusComposer()
await insertText('user-typed-text')
await evaluate(`(() => {
  const ce = ${COMPOSER}
  const walker = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT)
  const node = walker.nextNode()
  if (node === null) return false
  window.getSelection().setBaseAndExtent(node, 3, node, 3)
  return true
})()`)
await sleep(100)
await press('ArrowUp', 'ArrowUp', 38)
await sleep(200)
check('有未提交内容且光标在文中：↑ 不接管', { text: await readComposerText() },
  (v) => v.text === 'user-typed-text' || `期望文本不变，实测 ${JSON.stringify(v)}`)

// ---- 10：多行内容，光标在非文档开头，↑ 不接管 ----

await clearComposer()
await focusComposer()
await insertText('line1\nline2')
const multiBefore = await readComposerText()
await evaluate(`(() => {
  const ce = ${COMPOSER}
  const walker = document.createTreeWalker(ce, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walker.nextNode()) !== null) {
    const at = node.nodeValue.indexOf('line2')
    if (at !== -1) {
      window.getSelection().setBaseAndExtent(node, at, node, at)
      return true
    }
  }
  return false
})()`)
await sleep(100)
await press('ArrowUp', 'ArrowUp', 38)
await sleep(200)
check('多行：光标在第二行开头时 ↑ 不接管', { before: multiBefore, after: await readComposerText() },
  (v) => v.before === 'line1\nline2' && v.after === 'line1\nline2'
    || `期望前后都是 line1\\nline2，实测 ${JSON.stringify(v)}`)

await clearComposer()

// ---- 11：会话隔离 ----

const switched = await (async () => {
  // 逐行点会话，换到「sessionId 变了且历史不同、composer 在」为止
  for (let rowIndex = 0; rowIndex < 12; rowIndex += 1) {
    if ((await clickSessionRow(rowIndex)) === false) break
    for (let i = 0; i < 26; i += 1) {
      await sleep(500)
      const state = await probeState()
      if (state.composer && state.sessionId !== null && state.sessionId !== baseSession
          && Array.isArray(state.history) && state.history.join('') !== baseHistory.join('')) {
        return state
      }
    }
  }
  return null
})()
if (switched === null) abort('切换会话失败', '侧边栏没能打开另一个「历史不同且带输入框」的会话。')
check('切到另一个会话：历史换成那个会话的', { sessionId: switched.sessionId, history: switched.history },
  (v) => v.sessionId !== null && v.sessionId !== baseSession
    && Array.isArray(v.history) && v.history.join('') !== baseHistory.join('')
    || `期望换了 sessionId 且历史不同，实测 ${JSON.stringify(v)}`)

// ---- 12：不写 localStorage ----

const leftoverKeys = await evaluate(`(() => {
  const keys = []
  for (let i = 0; i < localStorage.length; i += 1) {
    const k = localStorage.key(i)
    if (k !== null && k.startsWith('dsh-oi-chat-history:')) keys.push(k)
  }
  return keys
})()`)
check('不写 localStorage（历史只读导航列）', { keys: leftoverKeys },
  (v) => v.keys.length === 0 || `期望无 dsh-oi-chat-history 键，实测 ${JSON.stringify(v)}`)

// ---- 13-14：dispose 与清场 ----

// 切换后的视图可能还在挂载：等 composer 出来再测。
let composerReady = false
for (let i = 0; i < 20; i += 1) {
  await sleep(500)
  if (await focusComposer()) { composerReady = true; break }
}
if (!composerReady) abort('切换后的会话视图没有输入框', 'dispose 断言需要一个带输入框的会话页。')
await evaluate(`(() => {
  window.__dshOperationImprove__.chatHistory.dispose()
  return true
})()`)
await sleep(100)
await press('ArrowUp', 'ArrowUp', 38)
await sleep(200)
check('dispose 后 ↑ 不再接管（值仍为空）', { text: await readComposerText() },
  (v) => v.text === '' || `期望空串（无接管），实测 ${JSON.stringify(v)}`)

await reloadAndWait(conn, { mountMs: 6000 })
const restored = await evaluate(`(() => {
  const h = window.__dshOperationImprove__
  return {
    handle: h !== undefined,
    hasChatHistory: typeof h?.chatHistory?.dispose === 'function',
    freshInstance: h?.instanceId !== ${JSON.stringify(boot.instanceId)},
  }
})()`)
check('清场：刷新后页面重新长出新实例', restored,
  (v) => v.handle && v.hasChatHistory && v.freshInstance
    || `页面没有恢复干净：${JSON.stringify(v)}`)

conn.ws.close()
report()
