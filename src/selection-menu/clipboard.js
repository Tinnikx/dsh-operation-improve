/**
 * 功能 6 的两个动作。
 *
 * 复制走上游 `writeClipboard`——消息气泡上那枚复制按钮用的就是它，同一个动作在这里必须
 * 有同样的兜底行为（`navigator.clipboard` 不可用时它退到隐藏 textarea + `execCommand`）。
 * 它来自 `@deepseek-ai/dsh-client-ui-primitives`，那是加载器 seed 表里的模块（与 react
 * 同一张表），运行时由注入的 `require` 提供，因此在 [build.mjs](../../scripts/build.mjs)
 * 里声明为 external。
 *
 * 粘贴**必须派发真的 `paste` 事件**：会话输入框是受控 `<textarea>`，自己在 `onPaste` 里
 * 读 `clipboardData`、`preventDefault()`、再走 slash-token 事务；直接改 `value` 会绕过
 * 整条链路，React 下一次渲染就把值盖回去。没人接管这个事件时才回落 `insertText`。
 *
 * 两个动作都在菜单项的 click 回调里同步开始，那一拍还带着 user activation——
 * `navigator.clipboard.readText()` 要的正是它。改成 `setTimeout` 之类推迟一拍就会被拒。
 */
import { writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'

/**
 * 右键那一刻的选区快照。
 *
 * 点菜单项会把焦点从输入框挪到菜单的 `<button>` 上，浏览器随之丢掉控件的选区；动作
 * 执行前必须按它恢复，否则粘贴会落在光标复位后的位置（通常是文本开头）。
 *
 * @typedef {{ kind: 'field', field: HTMLInputElement|HTMLTextAreaElement, start: number, end: number }
 *   | { kind: 'range', range: Range }} Snapshot
 */

/** 已经报过的粘贴失败原因；一次点击刷一屏没有意义。 */
const warned = new Set()

/**
 * 把文本写进系统剪贴板。
 *
 * @param {string} text
 * @returns {Promise<void>} 失败只出声，不抛——菜单已经关掉了，没有可回退的 UI
 */
export async function copySelection(text) {
  const ok = await writeClipboard(text)
  if (!ok) warnOnce('write', '[@Tinnikx/dsh-operation-improve] 复制失败：剪贴板不可写')
}

/**
 * 读系统剪贴板并粘进快照记下的位置。
 *
 * 需要 `navigator.clipboard.readText()`：浏览器首次调用会弹权限询问，被拒后这一项静默
 * 无效（只在控制台出一次声）。
 *
 * @param {Snapshot} snapshot
 * @returns {Promise<void>} 读不到剪贴板或目标已从文档里摘掉时静默返回
 */
export async function pasteInto(snapshot) {
  /** @type {string} */
  let text
  try {
    text = await navigator.clipboard.readText()
  } catch (error) {
    warnOnce('read', `[@Tinnikx/dsh-operation-improve] 粘贴失败：读不到剪贴板（${error}）`)
    return
  }
  if (text === '') return
  if (!restore(snapshot)) return

  const data = new DataTransfer()
  data.setData('text/plain', text)
  const target = snapshot.kind === 'field' ? snapshot.field : activeEditable()
  if (target === null) return

  const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })
  target.dispatchEvent(event)
  if (!event.defaultPrevented) document.execCommand('insertText', false, text)
}

/**
 * 恢复快照记下的焦点与选区。
 *
 * @param {Snapshot} snapshot
 * @returns {boolean} 目标已经不在文档里时返回 `false`
 */
function restore(snapshot) {
  if (snapshot.kind === 'field') {
    if (!snapshot.field.isConnected) return false
    snapshot.field.focus()
    snapshot.field.setSelectionRange(snapshot.start, snapshot.end)
    return true
  }
  const container = snapshot.range.commonAncestorContainer
  if (!container.isConnected) return false
  const host = container instanceof Element ? container : container.parentElement
  if (host === null) return false
  const editable = host.closest('[contenteditable=""], [contenteditable="true"]')
  if (!(editable instanceof HTMLElement)) return false
  editable.focus()
  const selection = window.getSelection()
  if (selection === null) return false
  selection.removeAllRanges()
  selection.addRange(snapshot.range)
  return true
}

/**
 * 恢复焦点之后当前正在编辑的那个元素——`paste` 事件要派发给它。
 *
 * @returns {HTMLElement|null}
 */
function activeEditable() {
  const active = document.activeElement
  return active instanceof HTMLElement && active.isContentEditable ? active : null
}

/**
 * @param {string} id
 * @param {string} message
 */
function warnOnce(id, message) {
  if (warned.has(id)) return
  warned.add(id)
  console.warn(message)
}
