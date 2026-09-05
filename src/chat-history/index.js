/**
 * 功能 9：对话历史导航。
 *
 * 输入框为空（或内容是上下键切换进来且未修改）时，按 ↑/↓ 在输入框中翻阅本会话的
 * 历史提问。历史来源是右侧轮次导航列（见 [nav-rail.js](./nav-rail.js)）——装上
 * 插件之前的提问也在其中，不做任何本地记录。
 *
 * 上游事实（0.1.2-rc.1 实测）：
 * - 应用没有 URL 路由，地址栏恒为 `/`；当前会话从 `sessions` 服务的
 *   `list.getSnapshot().current` 读，切换靠 `list.subscribe` 通知。
 * - 输入框是 Lexical 编辑器（contenteditable div），原语在 [composer.js](./composer.js)。
 * - 轮次导航列的 fiber 携带全部轮次条目；读取是纯内存操作，且只在开始导航
 *   的那一刻进行——无网络、无轮询、不阻塞主线程。
 *
 * 纯函数层（干净判定与条目解析）在 [history-store.js](./history-store.js)。
 */
import { isPristine, resolveTurnTexts } from './history-store.js'
import { bubbleTextAt, findRailItems } from './nav-rail.js'
import {
  caretAtEdge,
  findComposer,
  readText,
  writeText,
} from './composer.js'

/**
 * 安装对话历史导航。
 *
 * @param {any} sessions 插件 ctx 的 sessions 服务（`inject` 声明保证存在）
 * @returns {{ dispose: () => void, snapshot: () => { sessionId: string|null, history: string[], index: number } }}
 */
export function installChatHistory(sessions) {
  let disposed = false

  /** 当前会话 ID，随 sessions 服务通知刷新；null 表示没有打开的会话。 */
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

  function readCurrentSession() {
    const current = sessions.list.getSnapshot()?.current
    return typeof current === 'string' ? current : null
  }

  /** 会话切换：退出导航态，下一份历史等到开始导航时再读。 */
  function onSessionMaybeChanged() {
    if (disposed) return
    const nextId = readCurrentSession()
    if (nextId === sessionId) return
    sessionId = nextId
    entries = []
    navIndex = -1
    lastNavigatedValue = null
  }

  /** 从轮次导航列读当前会话的历史提问（开始导航时才调，纯内存读取）。 */
  function readHistory() {
    const items = findRailItems()
    if (items === null) return []
    return resolveTurnTexts(items, bubbleTextAt)
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (disposed) return
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
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

  // `subscribe` 的返回形态上游没承诺：函数与 { dispose } 都认；都没有就靠 disposed 闸。
  const subscription = sessions.list.subscribe(onSessionMaybeChanged)
  const unsubscribe = typeof subscription === 'function'
    ? subscription
    : (subscription !== null && typeof subscription === 'object' && typeof subscription.dispose === 'function'
      ? () => subscription.dispose()
      : null)

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
    unsubscribe?.()
    document.removeEventListener('keydown', onKeyDown, true)
  }

  return {
    dispose,
    snapshot: () => ({
      sessionId,
      history: readHistory(),
      index: navIndex,
    }),
  }
}
