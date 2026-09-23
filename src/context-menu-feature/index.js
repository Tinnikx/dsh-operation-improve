/**
 * 功能 2：侧边栏右键菜单。
 *
 * 单选（右键落在未被多选的行上）：菜单项逐项对齐该行「...」菜单——工作区
 * rename / delete，会话 pin / rename / fork，顺序、文案、图标、动作都一样，
 * 上游没有分隔线这里也不加。置顶项跟着行的置顶态翻转（pin ↔ unpin），归档行的末项是
 * 「取消归档」；归档行上游不渲染置顶项，这里同样不给。两个状态都在开菜单那一刻读
 * `workspaces.list.getSnapshot()`。**项的集合没有任何运行时通道**——被对齐的那份「...」
 * 菜单是点按钮开的，上游在侧边栏行上没有任何 `contextmenu` 监听，插件弹的是自己按
 * `buildItems` 现搭的 DOM；上游新增一类行状态或改某一项的翻转口径，这一份都要跟着改。
 *
 * **归档这一项是例外，故意不给**（单选与批量都不给）：上游那一项不是「调一次服务」——
 * 会话有进行中的工作时第一次 `archiveSession` 被 host 拒（`workspace/session-active`），
 * 上游捕获后弹「停止并归档此会话？」列出将被停的回合 / 子代理 / 后台任务 / 定时提醒，
 * 确认了才带 `{ stopActivity: true }` 重试。只抄前半句的结果是对有进行中的会话静默失效，
 * 所以这一项让位给行自己的「...」。**取消归档照给**：它不带 options、不会被拒，抄一半
 * 就是完整的。连带后果说清楚：会话多选没有任何批量动作了（`sessions` 契约上没有
 * delete），只剩选中、计数与高亮；右键落在多选会话行上时本插件不弹菜单，也**不拦**默认
 * 行为——注意上游行上本来就没有右键菜单（`dsh-client-ui-workspace` 里没有任何 `contextmenu`
 * 监听，桌面壳只给托盘设了原生菜单），落到的是浏览器默认，通常是"什么都不弹"。
 *
 * 多选：工作区给「删除 N 个工作区」。
 *
 * 文案不落在这个文件里，全部经 `t` / `tOwn` 取自词典（来源与理由见
 * [../shared/locale.js](../shared/locale.js)）。**取值必须发生在打开菜单的那一刻**，
 * 那正是它跟随语言切换的机制：`t` 调用时才读 active locale，而 `buildItems` 与
 * `run` 都在事件回调里跑。
 *
 * 二次确认也跟着上游走：删除工作区上游弹对话框，这里就 `confirm`，批量那一项一律问一次
 * （一次点掉多行没有撤销）；取消归档上游不问，这里也不问。
 *
 * 重命名的初值与删除确认里的 `{name}` 都取自
 * [rowTitle](../shared/row-probe.js)，即上游那两个对话框各自的初值字段。
 */
import { closestRow, rowId, rowTitle } from '../shared/row-probe.js'
import { openContextMenu } from '../shared/context-menu.js'
import { MENU_ICONS } from '../shared/menu-icons.js'

/**
 * 安装右键菜单。
 *
 * @param {{
 *   store: ReturnType<import('../shared/selection-store.js').createSelectionStore>,
 *   workspaces: any,
 *   sessions: any,
 *   t: (key: string, params?: Record<string, unknown>) => string,
 *   tOwn: (key: string, params?: Record<string, unknown>) => string,
 *   confirm?: (message: string) => boolean,
 *   prompt?: (message: string, initial: string) => (string|null),
 *   owner?: string,
 * }} deps `t` 查上游 `workspace` 词典，`tOwn` 查本插件自己的，两者都必需。
 *   `owner` 原样传给 `openContextMenu`，标在菜单元素上供调用方确认归属。
 * @returns {() => void} 幂等 disposer
 */
export function installContextMenu(deps) {
  const { store, workspaces, sessions, owner, t, tOwn } = deps
  const ask = deps.confirm ?? ((m) => window.confirm(m))
  const askText = deps.prompt ?? ((m, v) => window.prompt(m, v))

  /** @param {MouseEvent} event */
  const onContextMenu = (event) => {
    const row = closestRow(event.target)
    if (row === null) return
    const id = rowId(row.element, row.kind)
    if (id === null) return

    const batch = store.getKind() === row.kind && store.has(row.kind, id) && store.size() > 1
    const targets = batch ? store.getIds() : [id]
    const items = buildItems(row.kind, targets)
    // **没有项就整个不接管**：不 preventDefault 也不 stopPropagation。反过来先拦下默认
    // 行为再返回，右键就成了「什么都不发生」——那比弹一个没用的菜单更糟。会话多选正是
    // 这种情形：它唯一的批量动作（归档）已让位给上游的「...」（见头注释）。
    if (items.length === 0) return

    event.preventDefault()
    event.stopPropagation()

    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      owner,
      anchor: row.element,
      onSelect: (actionId) => {
        void run(actionId, row.kind, targets, row.element)
      },
    })
  }

  /**
   * @param {'session'|'workspace'} kind
   * @param {string[]} targets
   */
  function buildItems(kind, targets) {
    const many = targets.length > 1
    if (kind === 'workspace') {
      if (many) {
        return [{ id: 'delete', label: tOwn('batch.deleteWorkspaces', { n: targets.length }), icon: MENU_ICONS.trash, danger: true }]
      }
      return [
        { id: 'rename', label: t('rename'), icon: MENU_ICONS.edit },
        { id: 'delete', label: t('delete.workspace'), icon: MENU_ICONS.trash, danger: true },
      ]
    }
    // 会话多选不给任何项：批量归档让位给上游（理由见头注释），而 `sessions` 契约上没有
    // delete，这里无事可做。调用方拿到空列表就不接管这次右键。
    if (many) return []
    // 置顶项跟着上游走：排在最前（order 100），已置顶换成实心图 + 「取消置顶」，
    // 归档行上游不渲染这一项（「...」里和 hover 按钮都是），这里同样不给。
    const snapshot = workspaces.list.getSnapshot()
    const pinned = snapshot.pinnedSessionIds.includes(targets[0])
    const archived = snapshot.archivedSessionIds.includes(targets[0])
    const items = []
    if (!archived) {
      items.push({
        id: pinned ? 'unpin' : 'pin',
        label: t(pinned ? 'menu.unpinSession' : 'menu.pinSession'),
        icon: pinned ? MENU_ICONS.pinFill : MENU_ICONS.pinOutline,
      })
    }
    items.push({ id: 'rename', label: t('rename'), icon: MENU_ICONS.edit })
    items.push({ id: 'fork', label: t('menu.fork'), icon: MENU_ICONS.branch })
    // 归档行给「取消归档」，未归档行**不给**「归档会话」：上游那一项在被 host 拒时还要
    // 弹「停止并归档此会话？」并带 `stopActivity` 重试，这一份抄不起（头注释）。
    // 取消归档不带 options、不会被拒，抄过来是完整的。上游这两项都没有 `danger`，跟着不标。
    if (archived) {
      items.push({ id: 'unarchive', label: t('menu.unarchiveSession'), icon: MENU_ICONS.unarchive })
    }
    return items
  }

  /**
   * 重命名一个会话，走上游 `WorkspaceBrowser` 用的那条路径。
   *
   * `binding()` 对「既没被列出也没被 scope」的会话返回 `undefined`；侧边栏里的行按定义
   * 都在列表里，所以走到这里拿不到 binding 说明选中的 id 根本不是会话，**必须抛**而不是
   * 当成「改名没生效」静默返回。`rename()` 自己不抛，失败包在 `RpcResult.ok` 里。
   *
   * @param {string} sessionId
   * @param {string} title 已 trim 的新标题
   */
  async function renameSession(sessionId, title) {
    const session = sessions.binding(sessionId)?.session
    if (session === undefined) throw new Error(`unknown session "${sessionId}"`)
    const result = await session.rename(title)
    if (!result.ok) throw new Error(result.error.message)
  }

  /**
   * @param {string} actionId
   * @param {'session'|'workspace'} kind
   * @param {string[]} targets
   * @param {HTMLElement} rowElement
   */
  async function run(actionId, kind, targets, rowElement) {
    const current = rowTitle(rowElement, kind)
    if (actionId === 'rename') {
      // prompt 只有一行字，取的是上游那个对话框的标题而不是输入框的 aria label。
      const title = kind === 'session' ? t('rename.session.title') : t('rename.workspace.title')
      const next = askText(title, current)
      if (next === null || next.trim() === '') return
      if (kind === 'session') await renameSession(targets[0], next.trim())
      else await workspaces.rename(targets[0], next.trim())
      return
    }
    if (actionId === 'delete') {
      // 单选走上游删除对话框的原文（标题 + 正文），`window.confirm` 只收一段文本，
      // 两者之间补一个空行。批量上游没有对应说法，退到本插件自己的词条。
      const message = targets.length > 1
        ? tOwn('confirm.deleteWorkspaces', { n: targets.length, group: t('group.ungrouped') })
        : `${t('delete.workspace')}\n\n${t('delete.desc', { name: current })}`
      if (!ask(message)) return
      for (const target of targets) await workspaces.delete(target)
      store.clear()
      return
    }
    if (actionId === 'fork') {
      // 上游 fork 完会把子会话打开，标题也带序号，两处都跟上。
      const childId = await sessions.fork({ sessionId: targets[0], increaseTitle: true })
      await openSessionRow(childId)
      return
    }
    if (actionId === 'pin') {
      await workspaces.pinSession(targets[0])
      return
    }
    if (actionId === 'unpin') {
      await workspaces.unpinSession(targets[0])
      return
    }
    if (actionId === 'unarchive') {
      // 与上游一致：取消归档不是破坏性操作，不问，直接把行放回正常视图。
      await workspaces.unarchiveSession(targets[0])
    }
  }

  /**
   * 在侧栏点开指定会话的行——0.1.6 起这是唯一的「打开」路径：`sessions.open` 已从
   * `ISessions` 契约移除，`retain` 只建引用不动 UI，导航归 view 自己。
   *
   * fork 刚返回时子会话行进侧栏列表还是异步的，所以要等它出现而不是找一次。
   * 超时找不到就放弃并出声：fork 本身已经成功，「没帮忙打开」不该伪装成动作失败，
   * 但静默会让用户以为菜单项坏了。
   *
   * @param {string} sessionId
   * @returns {Promise<void>}
   */
  async function openSessionRow(sessionId) {
    const DEADLINE_MS = 3000
    const INTERVAL_MS = 150
    const deadline = Date.now() + DEADLINE_MS
    for (;;) {
      for (const row of document.querySelectorAll('[class*="_sessionRow"], [class*="_searchResultRow"]')) {
        if (!(row instanceof HTMLElement)) continue
        if (rowId(row, 'session') === sessionId) {
          row.click()
          return
        }
      }
      if (Date.now() >= deadline) {
        console.warn(`[@Tinnikx/dsh-operation-improve] fork 后没在侧栏找到子会话 ${sessionId} 的行，未自动打开（fork 已成功）`)
        return
      }
      await new Promise((r) => setTimeout(r, INTERVAL_MS))
    }
  }

  document.addEventListener('contextmenu', onContextMenu, true)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    document.removeEventListener('contextmenu', onContextMenu, true)
  }
}
