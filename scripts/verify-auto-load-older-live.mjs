/**
 * 功能 13 的端到端验证：滚到会话顶部时自动加载更早的消息。
 *
 * 不注入 bundle、不造 ctx，验的是页面自带实例：功能只读 DOM、不调服务，没有要打桩
 * 的破坏性动作。
 *
 * 断言清单（8 条）：
 *  1. 页面有 autoLoadOlder 句柄且 snapshot 返回 { attached, visible, disabled, loading, stalled }
 *  2. 打开长会话并停在底部：按钮在场但被裁掉，等 1.5s 行数不变（不会一打开就翻历史）
 *  3. 真实滚轮到顶、按钮进入视口：行数与 scrollHeight 都变大，scrollTop 落在新内容上
 *     （上游 `viewport.preserve()` 把原先可见的那一行钉住，不会把读者扔到顶部）
 *  4. 这次加载的点击计数确实增加（加载是本功能点的，不是别处触发的）
 *  5. 加载落地后按钮又被顶出视口，再等 1s 行数不变（可见才点，不是常驻点击）
 *  6. 再滚到顶：继续加载下一页；历史到头时按钮随 `hasMore` 卸载
 *  7. 按钮是否在场与 `snapshot.attached` 一致
 *  8. 收尾：静置 1s 不再长高
 *
 * 「带加载更早的会话」从测试栈副本的存储文件按大小挑，逐个打开确认——测试副本随用户
 * 真实 home 漂移，写死 id 会在下一次同步后失效。找不到就让脚本响亮失败，并提示先起
 * 测试栈。
 *
 * 脚本给按钮的 `click` 挂了一个计数器（属性上打标记，重读时补挂）：行数变多只说明
 * 「有东西加载了」，计数器才区分得出是**本功能点的**。加载本身仍走上游真 handler。
 *
 * CDP 连接与断言框架来自 [lib/cdp.mjs](lib/cdp.mjs)。默认打测试栈（3181），先
 * `node scripts/test-stack.mjs up`。
 * 用法：node scripts/verify-auto-load-older-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过开头那次 Page.reload
 */
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'
import { dismissOnboarding } from './lib/onboarding.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))
const REPO = new URL('..', import.meta.url).pathname
const TEST_HOME = join(REPO, 'tmp/dsh-oi-test-home')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 从测试栈副本里按存储文件大小挑候选会话，大的会话才可能有多页历史。
 *
 * @returns {string[]} 会话 id，按文件从大到小
 */
function storageCandidates() {
  const root = join(TEST_HOME, 'sessions')
  const found = []
  let workspaces = []
  try {
    workspaces = readdirSync(root)
  } catch {
    return []
  }
  for (const workspace of workspaces) {
    const dir = join(root, workspace)
    let entries = []
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const sessionDir = join(dir, entry)
      for (const file of ['session.v4.jsonl.zstd', 'session.jsonl.zstd']) {
        try {
          const { size } = statSync(join(sessionDir, file))
          found.push({ id: entry.startsWith('session-') ? entry : `session-${entry}`, size })
          break
        } catch {
          // 没有这个文件就换下一种命名，两种都没有说明这个目录不是会话目录。
        }
      }
    }
  }
  return found.sort((a, b) => b.size - a.size).slice(0, 8).map((item) => item.id)
}

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

/** 页面侧统一读数：视口、按钮矩形、行数、按钮点击计数、插件快照。 */
const state = () => evaluate(`(() => {
  const h = window.__dshOperationImprove__
  const s = document.querySelector('[data-conversation-scroll]')
  let button = null
  for (const scroller of document.querySelectorAll('[data-conversation-scroll]')) {
    for (const column of scroller.querySelectorAll('[data-chat-flow]')) {
      const candidate = column.firstElementChild?.firstElementChild
      if (candidate instanceof HTMLButtonElement && candidate.type === 'button') { button = candidate; break }
    }
  }
  // 给按钮挂点击计数；React 换掉元素时下一次读数会补挂。计数只用于区分「谁点的」，
  // click 仍原样交给上游。
  if (button !== null && button.dataset.oiAutoLoadProbe !== '1') {
    const original = button.click
    button.click = function (...args) {
      window.__dshOiAutoLoadClicks = (window.__dshOiAutoLoadClicks ?? 0) + 1
      return original.apply(this, args)
    }
    button.dataset.oiAutoLoadProbe = '1'
  }
  const rect = button?.getBoundingClientRect() ?? null
  return {
    rows: s === null ? 0 : s.querySelectorAll('[data-chat-node-key]').length,
    scrollTop: s === null ? null : Math.round(s.scrollTop),
    scrollHeight: s === null ? null : s.scrollHeight,
    clientHeight: s === null ? null : s.clientHeight,
    clicks: window.__dshOiAutoLoadClicks ?? 0,
    button: button === null ? null : {
      text: (button.textContent ?? '').trim(),
      disabled: button.disabled,
      top: rect === null ? null : Math.round(rect.top),
      bottom: rect === null ? null : Math.round(rect.bottom),
    },
    snapshot: h?.autoLoadOlder?.snapshot() ?? null,
  }
})()`)

/** 打开会话后等视图落定：行数连续两次读数一致。 */
async function openAndSettle(id) {
  const opened = await evaluate(`(async () => {
    const h = window.__dshOperationImprove__
    if (h?.services?.uiWorkspace === undefined) return false
    try { await h.services.uiWorkspace.openSession(${JSON.stringify(id)}) } catch (error) { return String(error) }
    return true
  })()`)
  if (opened !== true) return null
  let prev = null
  for (let i = 0; i < 30; i += 1) {
    await sleep(300)
    const now = await state()
    if (now.snapshot === null) continue
    if (prev !== null && now.rows > 0 && now.rows === prev.rows && now.scrollHeight === prev.scrollHeight) return now
    prev = now
  }
  return prev
}

/**
 * 用真实滚轮往上滚，直到内容变多（本功能点了按钮）或撞到顶部。
 *
 * 滚动本身不能把「到顶」当唯一停点：按钮一可见，本功能就点、上游就把锚点顶回新
 * 内容上方，250ms 的采样可能已经看不到 `scrollTop = 0`。所以行数/高度变化也算到达。
 */
async function wheelUpUntilLoad(before) {
  for (let i = 0; i < 16; i += 1) {
    await conn.send('Input.dispatchMouseEvent', {
      type: 'mouseWheel', x: 800, y: 400, deltaX: 0, deltaY: -3000, pointerType: 'mouse',
    })
    await sleep(250)
    const now = await state()
    if (now.rows !== before.rows || now.scrollHeight !== before.scrollHeight || now.scrollTop === 0) {
      return { reachedTop: now.scrollTop === 0, last: now }
    }
  }
  return { reachedTop: false, last: await state() }
}

/** 等一次加载落地：行数或 scrollHeight 变大；返回 { before, after, waitedMs }。 */
async function waitForGrowth(before, timeoutMs) {
  const started = Date.now()
  let after = before
  while (Date.now() - started < timeoutMs) {
    await sleep(250)
    after = await state()
    if (after.rows !== before.rows || after.scrollHeight !== before.scrollHeight) break
  }
  return { before, after, waitedMs: Date.now() - started }
}

// ---- 环境准备 ----

await conn.send('Network.enable', {})
await conn.send('Network.setCacheDisabled', { cacheDisabled: true })
if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
  await dismissOnboarding(evaluate)
}

const boot = await evaluate(`(() => {
  const h = window.__dshOperationImprove__
  if (h === undefined) return { fatal: 'no-handle' }
  return {
    feature: typeof h.autoLoadOlder?.dispose === 'function',
    snapshot: typeof h.autoLoadOlder?.snapshot === 'function',
  }
})()`)
if (boot.fatal !== undefined) {
  abort('页面上没有本插件的实例句柄', 'window.__dshOperationImprove__ 不存在：插件没装进 profile，或 apply 中途崩了（看页面 console）。')
}
if (boot.feature !== true || boot.snapshot !== true) {
  abort('页面加载的是旧产物', '句柄上没有 autoLoadOlder：先 node scripts/build.mjs，再重跑。')
}

const { check, report } = createChecker()

// ---- 1：句柄存在 ----

const snap0 = await state()
check('autoLoadOlder 句柄存在且 snapshot 字段齐全', snap0.snapshot,
  (v) => (v !== null && typeof v === 'object'
    && ['attached', 'visible', 'disabled', 'loading', 'stalled'].every((k) => k in v))
    || `期望五个字段，实测 ${JSON.stringify(v)}`)

// ---- 选会话：按存储大小挑，逐个打开找「按钮在场且停在底部」的那个 ----

const candidateIds = storageCandidates()
if (candidateIds.length === 0) {
  abort('测试栈副本里没有可扫描的会话存储', `${join(TEST_HOME, 'sessions')} 不存在或为空：先 node scripts/test-stack.mjs up。`)
}

let target = null
for (const id of candidateIds) {
  const opened = await openAndSettle(id)
  if (opened === null || opened.button === null) continue
  // 打开就停在顶部的会话会立刻触发本功能（那时按钮确实可见），不能当「底部静置」的靶子。
  if (opened.snapshot?.visible === true) continue
  target = { id, opened }
  break
}
if (target === null) {
  abort('找不到停在底部且带「加载更早」的会话', `已试 ${candidateIds.length} 个最大的会话。`
    + '测试副本里需要至少一个消息数超过一页、且打开后滚到底部的会话；先起测试栈再重跑。')
}
console.log(`[target] ${target.id} rows=${target.opened.rows} scrollTop=${target.opened.scrollTop} clicks=${target.opened.clicks}`)

// ---- 2：底部不主动加载 ----

const beforeIdle = target.opened
await sleep(1500)
const idle = await state()
check('打开长会话停在底部：1.5s 内行数不变', { before: beforeIdle.rows, after: idle.rows, visible: idle.snapshot?.visible },
  (v) => (v.before === v.after && v.visible === false)
    || `期望行数不变且按钮不可见，实测 ${JSON.stringify(v)}`)

// ---- 3：滚到顶，自动加载一页 ----

const beforeLoad = await state()
const wheel = await wheelUpUntilLoad(beforeLoad)
const first = await waitForGrowth(beforeLoad, 8000)
check('滚到顶后自动加载：行数与内容高度都变大', {
  reachedTop: wheel.reachedTop,
  rowsBefore: beforeLoad.rows, rowsAfter: first.after.rows,
  heightBefore: beforeLoad.scrollHeight, heightAfter: first.after.scrollHeight,
  topBefore: beforeLoad.scrollTop, topAfter: first.after.scrollTop,
  waitedMs: first.waitedMs,
},
(v) => (v.rowsAfter > v.rowsBefore && v.heightAfter > v.heightBefore && v.topAfter > 0)
  || `期望行数/高度变大且锚点前移（scrollTop>0），实测 ${JSON.stringify(v)}`)
check('这次加载是本功能点的按钮', { clicksBefore: beforeLoad.clicks, clicksAfter: first.after.clicks },
  (v) => (v.clicksAfter > v.clicksBefore)
    || `按钮点击计数没有增加（${v.clicksBefore} → ${v.clicksAfter}）：加载不是本功能触发的`)

// ---- 4：加载落地后不继续点 ----
// 这一页把按钮顶出视口；再等 1s，行数不应再变——证明触发条件是「可见」，不是「存在」。

const settled = await state()
await sleep(1000)
const afterSettle = await state()
check('加载落地后按钮移出视口，1s 内不再加载', {
  settledRows: settled.rows, rowsAfterWait: afterSettle.rows,
  visible: settled.snapshot?.visible, buttonTop: settled.button?.top ?? null,
},
(v) => (v.settledRows === v.rowsAfterWait && v.visible === false)
  || `期望行数不变且按钮不可见，实测 ${JSON.stringify(v)}`)

// ---- 5：再滚到顶，继续加载；到头后按钮卸载 ----

const beforeSecond = await state()
let second = { loaded: false, buttonGone: beforeSecond.button === null, before: beforeSecond, after: beforeSecond }
if (beforeSecond.button !== null) {
  await wheelUpUntilLoad(beforeSecond)
  const grown = await waitForGrowth(beforeSecond, 8000)
  second = {
    loaded: grown.after.rows !== beforeSecond.rows || grown.after.scrollHeight !== beforeSecond.scrollHeight,
    buttonGone: grown.after.button === null,
    before: beforeSecond,
    after: grown.after,
  }
}
check('第二次滚到顶：继续加载下一页，或历史已到头（按钮卸载）', {
  loaded: second.loaded, buttonGone: second.buttonGone,
  rowsBefore: second.before.rows, rowsAfter: second.after.rows,
  clicksAfter: second.after.clicks,
},
(v) => (v.loaded === true || v.buttonGone === true)
  || `第二次滚到顶既没加载也没卸载按钮：${JSON.stringify(v)}`)

const finished = await state()
check('按钮生命周期与 snapshot.attached 一致', {
  hasButton: finished.button !== null, attached: finished.snapshot?.attached, rows: finished.rows,
},
(v) => (v.hasButton === v.attached)
  || `按钮在场=${v.hasButton} 与 snapshot.attached=${v.attached} 不一致`)

// ---- 6：收尾，不再有自发加载 ----

await sleep(1000)
const quiet = await state()
check('收尾：静置 1s 行数不变', { rows: quiet.rows, previous: finished.rows },
  (v) => v.rows === v.previous || `期望行数不变，实测 ${JSON.stringify(v)}`)

report()
