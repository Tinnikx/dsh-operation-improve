/**
 * 侧边栏行的识别与 id 反查 —— 共享基础层。
 *
 * DOM 侧的稳定信号见 RESEARCH.md：行没有 id 类的 data 属性，只有
 * `[class*="_sessionRow"]` / `[class*="_projectRow"]` 与 `role="treeitem"`。
 * 因此 id 走 React fiber 反查（方案 1）：从行元素上的 `__reactFiber$*` 向上
 * 走 `return` 链，找第一个 props 里带得出 id 的祖先。
 *
 * fiber 字段是 React 内部实现，随版本可能失效——所有反查失败都返回
 * `null`，调用方必须当作「这一行不可操作」处理，不得抛错打断页面。
 */

/** @param {Element} el @returns {'session'|'workspace'|null} */
export function rowKind(el) {
  const cls = el.className
  const name = typeof cls === 'string' ? cls : ''
  if (name.includes('_sessionRow') || name.includes('_searchResultRow')) return 'session'
  if (name.includes('_projectRow')) return 'workspace'
  return null
}

/**
 * 从事件目标向上找最近的一行。
 *
 * @param {EventTarget|null} target
 * @returns {{ element: HTMLElement, kind: 'session'|'workspace' }|null}
 */
export function closestRow(target) {
  if (!(target instanceof Element)) return null
  /** @type {Element|null} */
  let node = target
  while (node !== null) {
    const kind = rowKind(node)
    if (kind !== null && node instanceof HTMLElement) return { element: node, kind }
    node = node.parentElement
  }
  return null
}

/** 行元素上的 React fiber（字段名带随机后缀）。 @param {Element} el */
function fiberOf(el) {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$')) return /** @type {any} */ (el)[key]
  }
  return null
}

/**
 * 反查一行对应的业务 id。
 *
 * @param {HTMLElement} el 行元素
 * @param {'session'|'workspace'} kind
 * @returns {string|null} 反查不到时返回 null
 */
export function rowId(el, kind) {
  let fiber = fiberOf(el)
  let depth = 0
  while (fiber !== null && fiber !== undefined && depth < 24) {
    const id = idFromProps(fiber.memoizedProps, kind)
    if (id !== null) return id
    fiber = fiber.return
    depth += 1
  }
  return null
}

/**
 * 从一层 fiber 的 props 里取 id。
 *
 * 覆盖 `ui-workspace` 产物里出现的形状：会话行的 `node.id` / `row.id` /
 * `sessionId`，工作区行的 `group.workspaceId` / `workspace.id` / `workspaceId`。
 *
 * @param {any} props
 * @param {'session'|'workspace'} kind
 * @returns {string|null}
 */
function idFromProps(props, kind) {
  if (props === null || typeof props !== 'object') return null
  const candidates = kind === 'session'
    ? [props.sessionId, props.node?.id, props.row?.id, props.item?.id, props.session?.id]
    : [props.workspaceId, props.group?.workspaceId, props.workspace?.id, props.node?.workspaceId, props.project?.id]
  for (const value of candidates) {
    if (typeof value === 'string' && value.length > 0) return value
  }
  return null
}

/**
 * 反查一行的标题，用作重命名的初值与删除确认里的 `{name}`。
 *
 * 取的正是上游两个对话框各自的初值字段：会话是 `row.title`（原始标题，不是补过默认
 * 名的 `displayTitle`），工作区是 `group.label`。反查不到就退回行内标题 span 的文本。
 *
 * **绝不退回整行的 `textContent`**：会话行里连着状态点与相对时间，那串塞进重命名
 * 输入框就是「改点什么3 分钟前」。拿不到标题时宁可给空串，让输入框空着。
 *
 * @param {HTMLElement} el 行元素
 * @param {'session'|'workspace'} kind
 * @returns {string} 反查不到时返回空串
 */
export function rowTitle(el, kind) {
  let fiber = fiberOf(el)
  let depth = 0
  while (fiber !== null && fiber !== undefined && depth < 24) {
    const props = fiber.memoizedProps
    if (props !== null && typeof props === 'object') {
      const candidates = kind === 'session'
        ? [props.node?.title, props.row?.title, props.session?.title]
        : [props.group?.label, props.workspace?.title, props.node?.label]
      for (const value of candidates) {
        if (typeof value === 'string' && value.length > 0) return value
      }
    }
    fiber = fiber.return
    depth += 1
  }
  const span = el.querySelector('[class*="_title"]')
  return span === null ? '' : (span.textContent ?? '').trim()
}

/**
 * 遍历当前页面里所有侧边栏行。
 *
 * @param {ParentNode} scope
 * @returns {HTMLElement[]}
 */
export function allRows(scope) {
  return [...scope.querySelectorAll('[role="treeitem"], [class*="_searchResultRow"]')]
    .filter((el) => el instanceof HTMLElement && rowKind(el) !== null)
}
