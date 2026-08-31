/**
 * 功能 2：侧边栏右键菜单。
 *
 * 单选（右键落在未被多选的行上）：菜单项逐项对齐该行「...」菜单——工作区
 * rename / delete，会话 rename / fork / archive，顺序、文案、图标、动作都一样，
 * 上游没有分隔线这里也不加。
 *
 * 多选：只保留批量破坏性操作——同为 session 给「归档」，同为 workspace 给「删除」。
 * `sessions` 没有 delete 方法，所以多选会话永远不出现「删除」。
 *
 * 文案不落在这个文件里，全部经 `t` / `tOwn` 取自词典（来源与理由见
 * [../shared/locale.js](../shared/locale.js)）。**取值必须发生在打开菜单的那一刻**，
 * 那正是它跟随语言切换的机制：`t` 调用时才读 active locale，而 `buildItems` 与
 * `run` 都在事件回调里跑。
 *
 * 二次确认也跟着上游走：删除工作区上游弹对话框，这里就 `confirm`；归档会话上游**不问**，
 * 这里单选也不问。批量两项上游没有对应入口，一律 `confirm`——一次点掉多行没有撤销。
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

    event.preventDefault()
    event.stopPropagation()

    const batch = store.getKind() === row.kind && store.has(row.kind, id) && store.size() > 1
    const targets = batch ? store.getIds() : [id]
    const items = buildItems(row.kind, targets)
    if (items.length === 0) return

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
    if (many) {
      return [{ id: 'archive', label: tOwn('batch.archiveSessions', { n: targets.length }), icon: MENU_ICONS.archive, danger: true }]
    }
    return [
      { id: 'rename', label: t('rename'), icon: MENU_ICONS.edit },
      { id: 'fork', label: t('menu.fork'), icon: MENU_ICONS.branch },
      // 上游这一项**没有** `danger`，跟着不标：单选菜单是照着那个「...」菜单对齐的，
      // 多标一层红字就是又一处只有这里才有的说法。批量那条才标红。
      { id: 'archive', label: t('menu.archiveSession'), icon: MENU_ICONS.archive },
    ]
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
    if (actionId === 'archive') {
      // 上游的「归档会话」点下去直接归档，没有二次确认；单选这条对齐它。批量没有上游
      // 对应入口，仍然问一次。
      if (targets.length > 1 && !ask(tOwn('confirm.archiveSessions', { n: targets.length }))) return
      for (const target of targets) await workspaces.archiveSession(target)
      store.clear()
      return
    }
    if (actionId === 'fork') {
      // 上游 fork 完会把子会话打开，标题也带序号，两处都跟上。
      const childId = await sessions.fork({ sessionId: targets[0], increaseTitle: true })
      sessions.open(childId)
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
