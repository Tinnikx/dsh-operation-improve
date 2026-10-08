/**
 * 功能 2：侧边栏右键菜单。
 *
 * **单选会话行的每一项都来自上游 slot，不是本地写的**：菜单项是
 * `sidebar.workspaces.session.menu.item` 这个 list slot 里注册的条目（上游
 * `ui-workspace/src/client/session-actions/`，注册点 `src/client/index.ts:285-290`，
 * 顺序 pin 100 / rename 200 / fork 300 / archive 400）。本插件按上游渲染器的语义读出条目、
 * 装好 props、渲染进 [../shared/slot-rows.jsx](../shared/slot-rows.jsx)，于是上游加一项
 * 或改一项的文案与图标，本地这份菜单自动跟着变。这几个条目带来的东西也一并是上游的：
 * 文案与快捷键提示（`workspace` 词典与 `ctx.shortcuts.catalog`）、置顶/归档态的翻转口径，
 * 以及各自的动作回调——归档那一项的完整链路（活动中的会话要先确认「停止并归档此会话？」）
 * 由上游 `shell.overlay` 里那个确认弹窗接手。
 *
 * 单选工作区行没有对应的上游 slot（上游那一份是 `ProjectRowItem` 里写死的 data `items`，
 * 只有 rename / delete 两项），所以这一支仍然是本地 data 行，但**外壳换成了上游 `Menu`**，
 * 图标取自上游 `ui-primitives` 导出的 React 图标（不再有内联 SVG 拷贝）。工作区单选多一项
 * 「新会话」：上游把它放在行 hover 时那枚与「...」并列的按钮上，不在「...」菜单里，逐项
 * 对齐「...」对齐不到它，只能在这里补（见 {@link workspaceItems}）。走的服务是同一个
 * `UiWorkspaceService.startSession(workspaceId)`，与点那枚 hover 按钮同一条路径。
 *
 * 多选：工作区给「删除 N 个工作区」。会话多选没有任何批量动作（`sessions` 契约上没有
 * delete），右键落在多选会话行上时本插件不弹菜单也不拦默认行为——上游行上本来就没有右键
 * 菜单（`ui-workspace` 里没有任何 `contextmenu` 监听），落到的是浏览器默认。
 *
 * 文案不落在这个文件里，全部经 `t` / `tOwn` 取自词典（来源与理由见
 * [../shared/locale.js](../shared/locale.js)）。取值发生在打开菜单的那一刻，那正是它跟随
 * 语言切换的机制：`t` 调用时才读 active locale，而 `workspaceItems` 与 `run` 都在事件
 * 回调里跑。
 *
 * 二次确认也跟着上游走：删除工作区上游弹对话框，这里就 `confirm`，批量那一项一律问一次
 * （一次点掉多行没有撤销）。重命名的初值取自 [rowTitle](../shared/row-probe.js)，即上游
 * 那个对话框的初值字段。
 */
import { createElement } from 'react'
import {
  IconEditOutlineRegular,
  IconNewChatOutlineRegular,
  IconTrashOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { closestRow, rowId, rowTitle } from '../shared/row-probe.js'
import { closeContextMenu, openContextMenu } from '../shared/menu.jsx'
import { SessionMenuRows, sessionMenuEntries } from '../shared/slot-rows.jsx'

/**
 * 安装右键菜单。
 *
 * @param {{
 *   store: ReturnType<import('../shared/selection-store.js').createSelectionStore>,
 *   workspaces: any,
 *   slots: any,
 *   shortcuts?: any,
 *   locale: any,
 *   getUiWorkspace?: () => ({ startSession: (workspaceId: string) => void } | undefined),
 *   t: (key: string, params?: Record<string, unknown>) => string,
 *   tOwn: (key: string, params?: Record<string, unknown>) => string,
 *   confirm?: (message: string) => boolean,
 *   prompt?: (message: string, initial: string) => (string|null),
 *   owner?: string,
 * }} deps `t` 查上游 `workspace` 词典，`tOwn` 查本插件自己的，两者都必需。
 *   `slots` / `shortcuts` / `locale` / `workspaces` 是渲染上游条目所必需的上下文：
 *   `slots.entriesOfSlot` 读条目表，`shortcuts.catalog` 是 rename / fork / archive 三个
 *   条目上那枚快捷键提示的来源（上游注册在 `ui-workspace/src/client/shortcuts.ts:96/101/115`），
 *   `locale.bind` 给条目投影它声明的词典，`workspaces.list` 是置顶/归档态那个 observable 的源。
 *   `getUiWorkspace` 取上游 `UiWorkspaceService`，只在「新会话」那一项上用；返回
 *   `undefined`（或这个依赖本身缺省）时那一项整个不出现。
 * @returns {() => void} 幂等 disposer
 */
export function installContextMenu(deps) {
  const { store, workspaces, owner, t, tOwn } = deps
  /**
   * **每次现取，不缓存**：插件 apply 与 ui-workspace 那个 Service 的注册没有先后保证，
   * apply 时取到 `undefined` 就等于这一项永久缺席；每次现取则两种加载顺序都能工作。
   *
   * @returns {{ startSession: (workspaceId: string) => void } | undefined}
   */
  const resolveUiWorkspace = () => {
    const service = deps.getUiWorkspace?.()
    return typeof service?.startSession === 'function' ? service : undefined
  }
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

    // 会话：单选走上游 slot 的全部条目，多选这一支无项可给。
    if (row.kind === 'session') {
      const children = batch ? [] : sessionRows(targets[0], row.element)
      // **没有项就整个不接管**：不 preventDefault 也不 stopPropagation。反过来先拦下默认
      // 行为再返回，右键就成了「什么都不发生」——那比弹一个没用的菜单更糟。
      if (children.length === 0) return
      event.preventDefault()
      event.stopPropagation()
      openContextMenu({ x: event.clientX, y: event.clientY, owner, children })
      return
    }

    const items = batch ? batchWorkspaceItems(targets) : workspaceItems()
    if (items.length === 0) return
    event.preventDefault()
    event.stopPropagation()
    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      owner,
      onSelect: (actionId) => { void run(actionId, targets, row.element) },
    })
  }

  /**
   * 单选会话行的菜单行：上游 slot 的全部条目。
   *
   * 那一格 slot 在上游 `ctx.slots.inject('sidebar.workspaces', …)` 注册浏览器时才被声明
   * （`ui-workspace/src/client/index.ts:268`，注释：「Declaring is claiming」），而那些条目
   * 随声明到达后陆续注册。所以条目表**此刻**可能还是空的——真机上侧栏已经渲染出行了，
   * 注册早已完成；尚未声明时读到的空表按「这一格没有条目」处理，与上游渲染器同一口径。
   *
   * @param {string} sessionId
   * @param {HTMLElement} rowElement
   * @returns {import('react').ReactNode[]}
   */
  function sessionRows(sessionId, rowElement) {
    const rows = sessionMenuEntries(deps.slots)
    if (rows.length === 0) return []
    return [createElement(SessionMenuRows, {
      deps,
      sessionId,
      displayTitle: rowTitle(rowElement, 'session'),
      // `MenuOpenState`（上游 `contract/slots.ts:83`）：条目靠它关菜单，而菜单的关闭归本
      // 模块——上游那四项在行菜单里也是调 `setMenuOpen(false)`，同一个约定。
      hookContext: [true, () => closeContextMenu()],
    })]
  }

  /**
   * 工作区单选的项：新会话 / rename / delete。
   *
   * @returns {import('react').ReactNode[]}
   */
  function workspaceItems() {
    const items = []
    // 「新建会话」摆在首位：它对应的是行 hover 时那枚与「...」并列的按钮，不是「...」
    // 里的项，所以逐项对齐「...」对齐不到它，只能在这里补（模块头）。上游那一枚是
    // hover 才出现的，本插件给它一个常驻位置——右键菜单本来就是常驻的，不存在收起。
    //
    // **未分组那一行没有这一项**：那一行的 workspaceId 是 `undefined`，本插件从 fiber
    // 反查不到、走不到这里——它压根不接管那次右键，而不是给一个点了没反应的新建入口。
    //
    // 服务缺席时同样不给那一项：宁可少一项，也不要一个点下去没有回应的入口。
    if (resolveUiWorkspace() !== undefined) {
      items.push({ id: 'newSession', label: t('actions.newSession'), icon: createElement(IconNewChatOutlineRegular) })
    }
    items.push({ id: 'rename', label: t('rename'), icon: createElement(IconEditOutlineRegular) })
    items.push({ id: 'delete', label: t('delete.workspace'), icon: createElement(IconTrashOutlineRegular), danger: true })
    return items
  }

  /**
   * 工作区多选只有删除一项。一次点掉多行没有撤销，所以一律问一次。
   *
   * @param {string[]} targets
   * @returns {import('react').ReactNode[]}
   */
  function batchWorkspaceItems(targets) {
    return [{
      id: 'delete',
      label: tOwn('batch.deleteWorkspaces', { n: targets.length }),
      icon: createElement(IconTrashOutlineRegular),
      danger: true,
    }]
  }

  /**
   * @param {string} actionId
   * @param {string[]} targets
   * @param {HTMLElement} rowElement
   */
  async function run(actionId, targets, rowElement) {
    const current = rowTitle(rowElement, 'workspace')
    if (actionId === 'newSession') {
      // 上游那枚 hover 按钮是两步：先展开分组再 `startSession(workspaceId)`。展开那一步
      // 不补的话，这一行仍是折叠的，用户看不到自己刚开的会话。展开就是点行本身（行的
      // `onClick` 就是 `onToggle`），已展开时不再点——那会把它收起来。开新会话本身完全交给
      // 服务：复用空白会话还是新建、失败如何 warn，都在它里面，这一层不碰会话数据。
      if (rowElement.getAttribute('aria-expanded') === 'false') rowElement.click()
      resolveUiWorkspace().startSession(targets[0])
      return
    }
    if (actionId === 'rename') {
      // prompt 只有一行字，取的是上游那个对话框的标题而不是输入框的 aria label。
      const next = askText(t('rename.workspace.title'), current)
      if (next === null || next.trim() === '') return
      await workspaces.rename(targets[0], next.trim())
      return
    }
    // 单选走上游删除对话框的原文（标题 + 正文），`window.confirm` 只收一段文本，
    // 两者之间补一个空行。批量上游没有对应说法，退到本插件自己的词条。
    const message = targets.length > 1
      ? tOwn('confirm.deleteWorkspaces', { n: targets.length, group: t('group.ungrouped') })
      : `${t('delete.workspace')}\n\n${t('delete.desc', { name: current })}`
    if (!ask(message)) return
    for (const target of targets) await workspaces.delete(target)
    store.clear()
  }

  document.addEventListener('contextmenu', onContextMenu, true)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    document.removeEventListener('contextmenu', onContextMenu, true)
  }
}