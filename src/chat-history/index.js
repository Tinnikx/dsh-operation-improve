/**
 * 功能 9：对话历史导航。
 *
 * 输入框为空（或内容是上下键切换进来且未修改）时，按 ↑/↓ 在输入框中翻阅本会话的
 * 历史提问。历史来源是右侧轮次导航列（见 [nav-rail.js](./nav-rail.js)）——装上
 * 插件之前的提问也在其中，不做任何本地记录。上游对不足 2 轮的会话不渲染导航列，
 * rail 读不出条目时退到消息流的 user 行气泡：单条提问的会话同样能 ↑ 调出它。
 *
 * 上游事实（0.1.6-alpha.2 起）：
 * - 应用没有 URL 路由，地址栏恒为 `/`。「当前会话」不经过任何可注入的服务：
 *   `SessionListState` 没有 `current` 字段，选择搬进 ui-workspace 的 navigation
 *   内部 store（persist 键 `dsh.sessions.current`），插件读不到也写不进。
 *   当前会话因此从 DOM 派生：侧栏里 `aria-selected="true"` 的会话行 +
 *   fiber 反查行 id（[rowId](../shared/row-probe.js)）。`aria-selected` 是
 *   TSX 里的字面量属性，功能 10 已验证它跨版本稳定。
 * - 派生是**按键时刻的现算**而不是订阅：本功能只在 keydown 时起作用，会话在两次
 *   按键之间怎么换都不需要即时知道——按键时读到的 DOM 恒是最新事实。切换的判据
 *   （id 变了才退导航态）也跟着每次按键做，省掉一个观察侧栏子树的 MutationObserver。
 * - 输入框是 Lexical 编辑器（contenteditable div），原语在 [composer.js](./composer.js)。
 * - 轮次导航列的 fiber 携带全部轮次条目；读取是纯内存操作，且只在开始导航
 *   的那一刻进行——无网络、无轮询、不阻塞主线程。
 *
 * 纯函数层（干净判定与条目解析）在 [history-store.js](./history-store.js)。
 */
import { rowId } from '../shared/row-probe.js'
import { isPristine, resolveTurnTexts } from './history-store.js'
import { bubbleTextAt, findFlowPrompts, findRailItems } from './nav-rail.js'
import {
  caretAtEdge,
  findComposer,
  readText,
  writeText,
} from './composer.js'

/**
 * 从侧栏读出当前会话 id。没有选中的会话行、或行上反查不到 id 时返回 `null`
 * （首页、设置页，以及 fiber 形状变了的情况——后者与 `row-probe` 的失败语义一致：
 * 当作「没有打开的会话」，不抛）。
 *
 * @returns {string|null}
 */
function readCurrentSession() {
  const rows = document.querySelectorAll(
    '[class*="_sessionRow"][aria-selected="true"], [class*="_searchResultRow"][aria-selected="true"]',
  )
  for (const row of rows) {
    if (!(row instanceof HTMLElement)) continue
    const id = rowId(row, 'session')
    if (id !== null) return id
  }
  return null
}

/**
 * 安装对话历史导航。不依赖任何 harness 服务——当前会话与历史都从 DOM 读。
 *
 * @returns {{ dispose: () => void, snapshot: () => { sessionId: string|null, history: string[], index: number } }}
 */
export function installChatHistory() {
  let disposed = false

  /** 上一次按键时看到的会话 id，用于「会话切换就退导航态」的比对基准。 */
  let sessionId = readCurrentSession()
  /** 导航用的历史：开始导航时从导航列读出，导航期间复用，退出即弃（下次重读）。 */
  /** @type {string[]} */
  let entries = []
  /** 上下键游标：-1 表示不在导航状态，0..N-1 表示历史中的位置。 */
  let navIndex = -1
  /** 上一次上下键切换时设入输入框的值，用于判定「未修改」。 */
  /** @type {string|null} */
  let lastNavigatedValue = null
  /** 写入队列：连按时各次写入按序完成后再按 DOM 落定形态校准 pristine 基准。 */
  let writeChain = Promise.resolve()

  /** 会话切换（含第一次读到）：退出导航态，下一份历史等到开始导航时再读。 */
  function syncSession() {
    const nextId = readCurrentSession()
    if (nextId === sessionId) return
    sessionId = nextId
    entries = []
    navIndex = -1
    lastNavigatedValue = null
  }

  /**
   * 读当前会话的历史提问（开始导航时才调，纯内存读取）。
   * rail 优先；上游对不足 2 轮的会话不渲染导航列，rail 缺席或解析不出条目时
   * 退到消息流的 user 行气泡（{@link findFlowPrompts}）。
   */
  function readHistory() {
    const items = findRailItems()
    if (items !== null) {
      const texts = resolveTurnTexts(items, bubbleTextAt)
      if (texts.length > 0) return texts
    }
    return findFlowPrompts()
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (disposed) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    syncSession()
    if (sessionId === null) return
    const composer = findComposer()
    if (composer === null) return
    if (document.activeElement !== composer) return

    const currentText = readText(composer)

    // 导航中用户改了文本：退出导航态，本次按键交还原生行为。
    if (navIndex !== -1 && !isPristine(currentText, lastNavigatedValue)) {
      navIndex = -1
      lastNavigatedValue = null
      return
    }

    // Lexical 多段落下 ↑/↓ 是原生行间移动——只在未处于导航态时才用光标位置
    // 门控（光标已在文档开头才接管 ↑、末尾才接管 ↓）。导航中插入文本后光标落在
    // 文本末尾，此时继续翻页不能再要位置。
    if (navIndex === -1) {
      if (event.key === 'ArrowUp' && !caretAtEdge(composer, 'start')) return
      if (event.key === 'ArrowDown' && !caretAtEdge(composer, 'end')) return
    }

    if (!isPristine(currentText, lastNavigatedValue)) return

    if (event.key === 'ArrowUp') {
      if (navIndex === -1) {
        entries = readHistory()
        if (entries.length === 0) return
        navIndex = entries.length - 1
      } else if (navIndex > 0) {
        navIndex -= 1
      } else {
        return
      }
    } else {
      if (navIndex === -1) return
      if (navIndex < entries.length - 1) {
        navIndex += 1
      } else {
        // 翻过最新一条：退出导航并清空输入框。
        navIndex = -1
        lastNavigatedValue = ''
        event.preventDefault()
        event.stopPropagation()
        writeChain = writeChain.then(() => writeText(composer, ''))
        return
      }
    }

    // 只有真的发生导航才吃事件：空历史或已到顶端时 ↑ 保持原生行为。
    event.preventDefault()
    event.stopPropagation()
    const value = entries[navIndex]
    lastNavigatedValue = value
    // Lexical 可能规范化写入内容（换行折叠等）：pristine 判定以 DOM 实际落定
    // 形态为准，写入完成后读回一次；写入串成队列，连按不打架。
    writeChain = writeChain.then(async () => {
      await writeText(composer, value)
      if (disposed) return
      const current = findComposer()
      if (current !== null) lastNavigatedValue = readText(current)
    })
  }

  document.addEventListener('keydown', onKeyDown, true)

  // 本功能不读不写 localStorage；`dsh-oi-chat-history:*` 是早期实现留下的死键，
  // 启动时清掉。
  try {
    const doomed = []
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (key !== null && key.startsWith('dsh-oi-chat-history:')) doomed.push(key)
    }
    for (const key of doomed) localStorage.removeItem(key)
  } catch {
    // localStorage 不可用（隐私模式之类）：历史本就只读导航列，清理失败无影响。
  }

  const dispose = () => {
    if (disposed) return
    disposed = true
    document.removeEventListener('keydown', onKeyDown, true)
  }

  return {
    dispose,
    snapshot: () => ({
      sessionId: readCurrentSession(),
      history: readHistory(),
      index: navIndex,
    }),
  }
}
