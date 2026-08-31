/**
 * 功能 6：选中文本的右键菜单。
 *
 * 页面任意位置选中一段文本后在选区上右键，弹出与侧边栏那个菜单同一套外观的菜单
 * （复用 [openContextMenu](../shared/context-menu.js) 与同一份 `MENU_CSS`，本模块**不带
 * 任何样式**）。有选中文本给「复制」，落点可输入再给「粘贴」；可输入的空控件上即使
 * 没有选中文本也弹，只给「粘贴」。两项都没有时**不 `preventDefault`**，把原生菜单留给
 * 浏览器——空白处右键仍然是浏览器自己那套。
 *
 * **选区判定分两条互斥的路径**：`window.getSelection()` 看不见 `<input>` / `<textarea>`
 * 内部的选区（Chrome 下那里恒为折叠），表单控件只能读 `selectionStart` / `selectionEnd`。
 *
 * **必须确认点击点落在选区内**。只判「选区非空」的话，页面上还留着一段旧选区时，任何
 * 位置右键都会弹出一个「复制」——复制的还是别处那段文字。
 *
 * **侧边栏的行归功能 2**。两个 handler 都挂在 `document` 的捕获阶段，同一个节点上的
 * `stopPropagation()` 拦不住彼此，所以这道判据得自己写，否则一次右键会开两次菜单，后
 * 开的（本模块）把行菜单顶掉。
 *
 * 文案：「复制」取 harness common 词典的 `copy`，「粘贴」取本插件词典
 * （来源与理由见 [../shared/locale.js](../shared/locale.js)）。取值发生在打开菜单那一刻，
 * 语言切换自动跟随。
 */
import { closestRow } from '../shared/row-probe.js'
import { openContextMenu } from '../shared/context-menu.js'
import { MENU_ICONS } from '../shared/menu-icons.js'
import { copySelection, pasteInto } from './clipboard.js'

/**
 * 支持 `selectionStart` / `selectionEnd` 的 `<input>` type。其余（`checkbox`、`color`、
 * `date`、`number` 等）读这两个属性会抛 `InvalidStateError`，不能进这条路径。
 */
const TEXT_INPUT_TYPES = new Set(['text', 'search', 'url', 'tel', 'password', ''])

/**
 * 安装选中文本的右键菜单。
 *
 * @param {{
 *   tCommon: (key: string, params?: Record<string, unknown>) => string,
 *   tOwn: (key: string, params?: Record<string, unknown>) => string,
 *   owner?: string,
 * }} deps `tCommon` 查 harness 的 common 词典（「复制」），`tOwn` 查本插件的（「粘贴」）。
 *   `owner` 原样传给 `openContextMenu`，标在菜单元素上供调用方确认归属。
 * @returns {() => void} 幂等 disposer
 */
export function installSelectionMenu(deps) {
  const { tCommon, tOwn, owner } = deps

  /** @param {MouseEvent} event */
  const onContextMenu = (event) => {
    if (closestRow(event.target) !== null) return
    const target = event.target instanceof Element ? event.target : null
    if (target === null) return

    const hit = probeField(target) ?? probeSelection(target, event.clientX, event.clientY)
    if (hit === null) return

    const items = []
    if (hit.text !== '') items.push({ id: 'copy', label: tCommon('copy'), icon: MENU_ICONS.copy })
    if (hit.editable) items.push({ id: 'paste', label: tOwn('selection.paste'), icon: MENU_ICONS.paste })
    if (items.length === 0) return

    event.preventDefault()
    event.stopPropagation()

    openContextMenu({
      x: event.clientX,
      y: event.clientY,
      items,
      owner,
      anchor: hit.anchor,
      onSelect: (actionId) => {
        if (actionId === 'copy') void copySelection(hit.text)
        else if (actionId === 'paste') void pasteInto(hit.snapshot)
      },
    })
  }

  document.addEventListener('contextmenu', onContextMenu, true)

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    document.removeEventListener('contextmenu', onContextMenu, true)
  }
}

/**
 * 落在 `<input>` / `<textarea>` 上的那条路径。
 *
 * 这里**不要求点击点落在选区内**：表单控件里右键任意位置，浏览器自己也保留原选区，
 * 而控件的边界本身已经把范围限死了。
 *
 * @param {Element} target
 * @returns {null | { text: string, editable: boolean, anchor: Element,
 *   snapshot: import('./clipboard.js').Snapshot }} 不是可读写选区的表单控件时返回 `null`
 */
function probeField(target) {
  const field = target.closest('input, textarea')
  if (field === null) return null
  if (field instanceof HTMLInputElement && !TEXT_INPUT_TYPES.has(field.type)) return null
  if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement)) return null
  if (field.disabled) return null

  const start = field.selectionStart ?? 0
  const end = field.selectionEnd ?? 0
  return {
    text: field.value.slice(start, end),
    editable: !field.readOnly,
    anchor: field,
    snapshot: { kind: 'field', field, start, end },
  }
}

/**
 * 普通文本那条路径。
 *
 * @param {Element} target
 * @param {number} x
 * @param {number} y
 * @returns {null | { text: string, editable: boolean, anchor: Element,
 *   snapshot: import('./clipboard.js').Snapshot }} 无选区、或点击点不在选区内时返回 `null`
 */
function probeSelection(target, x, y) {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0 || selection.isCollapsed) return null
  const range = selection.getRangeAt(0)
  const text = selection.toString()
  if (text === '') return null
  if (!containsPoint(range, x, y)) return null

  const container = range.commonAncestorContainer
  const anchor = container instanceof Element ? container : container.parentElement
  if (anchor === null) return null

  const editable = target.closest('[contenteditable=""], [contenteditable="true"]') !== null
  return { text, editable, anchor, snapshot: { kind: 'range', range: range.cloneRange() } }
}

/**
 * 视口坐标 (x, y) 是否落在 `range` 内。
 *
 * 用 caret 位置而不是 `range.getClientRects()` 命中测试：多行选区的矩形并集会把行尾到
 * 容器右边缘那一片空白也算进去，点在那里并没有点在文字上。
 *
 * `caretPositionFromPoint` 是标准接口，`caretRangeFromPoint` 是 WebKit 血统的旧名；
 * Electron 与 Chrome 两个都有，别的引擎可能只有其中一个，两个都没有时放行（宁可多弹
 * 一次菜单，也不要在某个引擎上整条功能消失）。
 *
 * @param {Range} range
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function containsPoint(range, x, y) {
  /** @type {{ offsetNode: Node, offset: number } | null} */
  let caret = null
  if (typeof document.caretPositionFromPoint === 'function') {
    caret = document.caretPositionFromPoint(x, y)
  } else if (typeof document.caretRangeFromPoint === 'function') {
    const r = document.caretRangeFromPoint(x, y)
    if (r !== null) caret = { offsetNode: r.startContainer, offset: r.startOffset }
  } else {
    return true
  }
  if (caret === null) return false
  // comparePoint 对「不在同一棵树里」的节点抛 WrongDocumentError；选区跨 shadow root
  // 或点在别的文档里时会走到，当成没命中即可。
  try {
    return range.comparePoint(caret.offsetNode, caret.offset) === 0
  } catch {
    return false
  }
}
