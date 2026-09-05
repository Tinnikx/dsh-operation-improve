/**
 * 会话页右侧轮次导航列的读取层。
 *
 * 上游的会话页右侧有一条轮次导航（每个 tick 一个「跳转到第 N 轮」按钮），它的
 * fiber props 里带着 `items: [{ turn, prompt, response, anchor }]`：
 * - `prompt` 是上游截断到 50 字的预览（长提问带省略号）；
 * - `anchor` 为 `{ kind: 'loaded', key }` 时，`key` 是消息流里那一行的
 *   `data-chat-flow-key`，行内气泡（`[class*="_bubble"]`）持有全文；
 * - `anchor.kind` 为其他值（如 `unloaded`）时该行不在 DOM——消息流会分页/虚拟化，
 *   全文取不到就退化为预览。
 *
 * 读取全部是内存操作（fiber props + DOM 文本），只在开始导航时才读——无网络、无轮询。
 */

/**
 * 读轮次导航列的条目数组。遍历页面的 `nav` 元素，认 fiber props 里的轮次数组
 * （`items` 里每条都带数值 `turn`、且组件带 `onNavigate`）——不认 aria-label，
 * 文案随语言变。
 *
 * @returns {Array<any>|null} 导航列不存在（非会话页）返回 null，存在但无轮次返回 []
 */
export function findRailItems() {
  for (const nav of document.querySelectorAll('nav')) {
    const items = readFiberItems(nav)
    if (items !== null) return items
  }
  return null
}

/** @param {Element} el */
function readFiberItems(el) {
  let fiberKey = null
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$')) { fiberKey = key; break }
  }
  if (fiberKey === null) return null
  /** @type {any} */
  let fiber = el[fiberKey]
  let depth = 0
  while (fiber !== null && fiber !== undefined && depth < 12) {
    const props = fiber.memoizedProps
    if (props !== null && typeof props === 'object'
        && Array.isArray(props.items) && typeof props.onNavigate === 'function'
        && props.items.every((it) => it !== null && typeof it === 'object' && typeof it.turn === 'number')) {
      return props.items
    }
    fiber = fiber.return
    depth += 1
  }
  return null
}

/**
 * 按 anchor.key 查消息流里那一行的气泡全文。行不在 DOM（未挂载）或气泡为空时返回 null。
 *
 * @param {string} anchorKey
 * @returns {string|null}
 */
export function bubbleTextAt(anchorKey) {
  const row = document.querySelector(`[data-chat-flow-key="${CSS.escape(anchorKey)}"]`)
  const bubble = row?.querySelector('[class*="_bubble"]')
  const text = bubble?.innerText?.trim()
  return text === undefined || text === '' ? null : text
}
