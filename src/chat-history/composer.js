/**
 * 会话输入框（composer）的 DOM 原语。
 *
 * 上游输入框是 Lexical 编辑器：`<div contenteditable="true" role="textbox">`，
 * 空态 innerHTML 是 `<p dir="auto"><br data-lexical-managed-linebreak="true"></p>`。
 * 类名是 CSS module hash（随版本变），不作选择器；`contenteditable + role="textbox"`
 * 是稳定特征（实测全页唯一）。
 *
 * 设值走 `execCommand` + 合成按键这条带 input/keydown 事件的路径，Lexical 会同步
 * 内部状态；直接改 DOM 会在下一次 reconcile 被盖回。逐条坑见 `writeText` 的注释。
 */

/**
 * 找到 composer，找不到（设置页等无输入框的视图）返回 null。
 *
 * @returns {HTMLElement|null}
 */
export function findComposer() {
  return document.querySelector('div[contenteditable="true"][role="textbox"]')
}

/**
 * 读纯文本：每个顶层段落一行；只含一个受管 `<br>` 的空段读成空串。
 * 不用 `textContent`（段落直接拼接丢换行），也不用 `innerText`（依赖布局、尾部换行不稳定）。
 *
 * 尾部的连续空段一律丢弃：Lexical 会给末尾空行补受管 `<br>`，同一内容在不同
 * 时刻可能读出 `text` 或 `text\n`——历史导航的「未修改」判定经不起这种抖动，
 * 而提问末尾的空行本来就没有信息量。
 *
 * @param {HTMLElement} composer
 * @returns {string}
 */
export function readText(composer) {
  const lines = [...composer.children]
    .map((block) => (block.childNodes.length === 1 && block.firstChild?.nodeName === 'BR' ? '' : readNode(block)))
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()
  return lines.join('\n')
}

/** @param {Node} node */
function readNode(node) {
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue ?? ''
  let out = ''
  for (const child of node.childNodes) {
    out += child.nodeName === 'BR' ? '\n' : readNode(child)
  }
  return out
}

/**
 * 整段替换 composer 内容（`text` 为 `''` 即清空）。插入后光标落在文本末尾。
 *
 * 三个实测出来的坑：
 * - `execCommand('delete')` 在 Lexical 上不生效（内容原样不动）；清空走合成
 *   Backspace 按键——Lexical 的 keydown 命令链不看 `isTrusted`。
 * - `selectAll` 的 DOM 选区同步进 Lexical 内部模型是**异步**的：紧接着
 *   insertText 会打在旧选区上（连按 ↑ 时文本被追加而不是替换）。写完
 *   selectAll 要让一拍（50ms）再动手，本函数因此返回 Promise。
 * - `execCommand('insertText')` 与 `insertHTML` 都会把 `\n` 抹平（实测）。
 *   多行的保真写法是逐段插入、段间补合成 Shift+Enter（软换行命令链）；
 *   逐段部分同步执行，不用等。
 *
 * @param {HTMLElement} composer
 * @param {string} text
 */
export async function writeText(composer, text) {
  composer.focus()
  document.execCommand('selectAll', false)
  await new Promise((r) => setTimeout(r, 50))
  // 视图切换可能换掉 composer 节点：动手前重新确认，脱了就找当前的。
  const target = document.contains(composer) ? composer : findComposer()
  if (target === null) return
  if (text === '') {
    target.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true,
    }))
    return
  }
  const lines = text.split('\n')
  for (let i = 0; i < lines.length; i += 1) {
    if (i > 0) {
      target.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter', code: 'Enter', shiftKey: true, bubbles: true, cancelable: true,
      }))
    }
    if (lines[i] !== '') document.execCommand('insertText', false, lines[i])
  }
}

/**
 * 光标是否停在 composer 文本的最开头/最末尾——↑/↓ 是否接管为历史导航的门控。
 * 用 Range 比边界：光标之前（start）或之后（end）没有任何文字才算数；段间 `<br>` 不算文字。
 *
 * @param {HTMLElement} composer
 * @param {'start'|'end'} edge
 * @returns {boolean}
 */
export function caretAtEdge(composer, edge) {
  const selection = window.getSelection()
  if (selection === null || selection.rangeCount === 0 || !selection.isCollapsed) return false
  const anchor = selection.getRangeAt(0)
  if (!composer.contains(anchor.startContainer)) return false
  const probe = document.createRange()
  probe.selectNodeContents(composer)
  if (edge === 'start') probe.setEnd(anchor.startContainer, anchor.startOffset)
  else probe.setStart(anchor.startContainer, anchor.startOffset)
  return probe.toString() === ''
}
