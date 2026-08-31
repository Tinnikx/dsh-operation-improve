/**
 * 功能 1：ctrl/cmd + 点击多选（限同级）。
 *
 * 在 document 上挂**捕获阶段**的 click 监听：React 18 的事件委托挂在 root 容器上，
 * 捕获阶段先于它拿到事件，`stopPropagation()` 能挡住行自身的 `onOpen` / `onToggle`。
 * 选择集与同级约束交给 selection-store；高亮用 `data-dsh-oi-selected` 属性，
 * 不复用行自己的 `_selected` 类（那是「当前会话」的语义）。
 */
import { closestRow, rowId, allRows } from '../shared/row-probe.js'

/**
 * 安装多选行为。
 *
 * @param {{
 *   store: ReturnType<import('../shared/selection-store.js').createSelectionStore>,
 *   onChange?: () => void,
 * }} deps
 * @returns {() => void} 幂等 disposer
 */
export function installMultiSelect(deps) {
  const { store } = deps

  /** @param {MouseEvent} event */
  const onClick = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return
    const row = closestRow(event.target)
    if (row === null) return
    const id = rowId(row.element, row.kind)
    if (id === null) return
    event.preventDefault()
    event.stopPropagation()
    store.toggle(row.kind, id)
  }

  // 不带修饰键的普通点击 = 常规导航，清掉多选，避免选择集悬空。
  /** @param {MouseEvent} event */
  const onPlainClick = (event) => {
    if (event.ctrlKey || event.metaKey || event.button !== 0) return
    if (store.size() === 0) return
    const row = closestRow(event.target)
    if (row === null) return
    store.clear()
  }

  document.addEventListener('click', onClick, true)
  document.addEventListener('click', onPlainClick, false)

  const unsubscribe = store.subscribe(() => paint(store))
  paint(store)

  // 行由 React 重渲染，重挂的节点没有高亮属性，所以列表结构一变就重刷一次。
  const observer = new MutationObserver(() => {
    if (store.size() > 0) paint(store)
  })
  observer.observe(document.body, { childList: true, subtree: true })

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    document.removeEventListener('click', onClick, true)
    document.removeEventListener('click', onPlainClick, false)
    observer.disconnect()
    unsubscribe()
    store.clear()
    for (const el of allRows(document)) el.removeAttribute('data-dsh-oi-selected')
  }
}

/**
 * 把选择集刷到 DOM 高亮上。行是 React 重渲染出来的，所以每次变化整体重刷。
 *
 * @param {ReturnType<import('../shared/selection-store.js').createSelectionStore>} store
 */
export function paint(store) {
  const kind = store.getKind()
  for (const el of allRows(document)) {
    const k = kind === null ? null : kind
    const id = k === null ? null : rowId(el, /** @type {'session'|'workspace'} */ (k))
    const selected = id !== null && store.has(/** @type {any} */ (k), id)
    if (selected) el.setAttribute('data-dsh-oi-selected', '')
    else el.removeAttribute('data-dsh-oi-selected')
  }
}
