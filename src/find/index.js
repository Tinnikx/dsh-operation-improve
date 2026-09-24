/**
 * 功能 11：`Ctrl`/`cmd` + `F` 页内查找。
 *
 * 查找条挂在 `document.body`，词级高亮走 **CSS Custom Highlight API**（`CSS.highlights`
 * 两个名字 + `::highlight()`），全程**不改动上游 DOM**——这是本功能的硬契约，
 * `verify:find` 用一条「整轮下来 `childList` mutation 计数为 0」当场钉它。为什么不能
 * 用 `<mark>` 包住命中：那会拆掉 React 管的文本节点，并且每一次包裹都要喂给功能 1 与
 * 功能 4 那两个观察 `document.body` 的 `MutationObserver`。
 *
 * 命中域是**整页已渲染的文本**（含侧栏行标题），跳过四类：本插件自己的浮层与标签、
 * 不渲染成文本的标签（`script` / `style` / 表单控件——`input` 与 `textarea` 的值不在
 * DOM 里，`::highlight` 画不到）、不可见文本（`display: none` / `visibility: hidden` /
 * 零矩形）、折叠起来的正文。判据细节见 {@link rowKeyFor}。
 *
 * 会话页已加载的节点恒在 DOM（`dsh-client-ui-chat` 虚拟的是右侧轮次导航列，不是消息
 * 行），所以「本会话已加载的全部文本」都在命中域内；未加载的历史分页不在页面里，搜不到。
 *
 * **命中集与游标会随 DOM 变化重算**：观察者只在条开着的时候挂（`open()` 起、
 * `close()` 停），rAF 去抖，与功能 4 同构。重算后按 `(key, ordinal)` 把游标锚回同一条
 * 命中，见 [matches.js](./matches.js) 的 {@link reanchor}——绝对序号不承诺连续。
 *
 * 监听相位：本模块的 `keydown` 挂在 **`window` 捕获**。共享右键菜单的 `Esc` 也挂在
 * `window` 捕获，但那条是每次打开菜单时才注册，注册序在本模块之后——同相位下注册序
 * 决定调用序，所以本模块先看到事件，`document.querySelector('.dsh-oi-menu')` 这时还
 * 读得到那份尚未摘掉的菜单。
 */
import { closeContextMenu, OWNER_ATTR } from '../shared/context-menu.js'
import { buildMatchList, nextIndex, reanchor } from './matches.js'

const ROOT_CLASS = 'dsh-oi-find'
const MENU_CLASS = 'dsh-oi-menu'
/** 功能 4 贴的时间戳标签：搜「12」不该命中它们。 */
const LABEL_CLASS = 'dsh-oi-ts'

/** 高亮注册名。名字是文档级全局的，两份实例互顶，认领时机见 {@link paint}。 */
const HIGHLIGHT_ALL = 'dsh-oi-find'
const HIGHLIGHT_ACTIVE = 'dsh-oi-find-active'

/** 命中上限：长会话里搜「e」必破万，构造 range 与 `Highlight` 都按条付费。 */
const MATCH_LIMIT = 1000

/** 不计入命中域的容器与本插件自己的东西。 */
const SKIP_SELECTOR = `.${ROOT_CLASS}, .${MENU_CLASS}, .${LABEL_CLASS}, script, style, noscript, textarea, input, select, option`

/** 命中的归属行；两个属性都是功能 4 已经在依赖的渲染契约。 */
const ROW_KEY_SELECTOR = '[data-chat-node-key], [data-chat-flow-key]'

/**
 * 折叠契约。`data-variant="think"` + `data-expanded` 是思考行收起的样子（收起时容器
 * 只有 24px 高且 `overflow: hidden`，正文在 DOM 里但用户看不见）；`aria-expanded`
 * 为假的那一支兜住正文嵌在触发器容器里的其他 disclosure。
 */
const COLLAPSED_SELECTOR = '[data-variant="think"]:not([data-expanded]), [aria-expanded="false"]'

/**
 * 安装页内查找。
 *
 * @param {{ tOwn: (key: string, params?: Record<string, unknown>) => string, owner?: string }} deps
 *   `tOwn` 查本插件词典（查找条上全部文案）；`owner` 标在条上供脚本确认归属，与
 *   [context-menu.js](../shared/context-menu.js) 同一套判据。
 * @returns {{ dispose: () => void, open: () => void, close: () => void,
 *   snapshot: () => { supported: boolean, open: boolean, query: string, total: number,
 *     truncated: boolean, index: number, key: string|null, activeText: string } }}
 *   `dispose` 幂等。`snapshot` 是验证与控制台的观察入口，不必翻私有闭包。
 */
export function installFind(deps) {
  const { tOwn, owner } = deps

  const supported = typeof globalThis.Highlight === 'function'
    && typeof globalThis.CSS !== 'undefined'
    && globalThis.CSS.highlights !== undefined
  if (!supported) {
    console.warn(
      '[@Tinnikx/dsh-operation-improve] 这个运行时没有 CSS Custom Highlight API，'
      + '页内查找不会生效。本插件不靠改 DOM 画高亮，缺这个 API 就没有不动上游的画法。',
    )
    const noop = () => {}
    return { dispose: noop, open: noop, close: noop, snapshot: () => ({ supported: false, open: false, query: '', total: 0, truncated: false, index: -1, key: null, activeText: '' }) }
  }

  /** @type {HTMLElement|null} 非空即「条已在 DOM 上」。 */
  let bar = null
  /** @type {HTMLInputElement|null} */
  let input = null
  /** @type {HTMLElement|null} */
  let status = null
  /** @type {MutationObserver|null} 只在条开着的时候存在。 */
  let observer = null
  let queue = false

  let query = ''
  /** @type {Array<{ key: string, ordinal: number, start: number, end: number, ref: Text }>} */
  let matches = []
  /** @type {Range[]} 与 matches 同序同长。 */
  let ranges = []
  let truncated = false
  /** matches 下标；-1 表示还没有当前项。 */
  let cursor = -1
  let disposed = false

  const allSet = new globalThis.Highlight()
  const activeSet = new globalThis.Highlight()

  /** 这一份文本能不能进命中域，以及它归属于哪一行。不可搜返回 `null`。 */
  function rowKeyFor(el) {
    if (el.closest(SKIP_SELECTOR) !== null) return null
    if (el.closest(COLLAPSED_SELECTOR) !== null) return null
    if (!el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true, contentVisibilityAuto: true })) return null
    // display:none 的后代矩形为空；display: contents 的元素本身仍有子盒矩形，所以这里
    // 用 getClientRects() 而不是 getBoundingClientRect() 的宽高。
    if (el.getClientRects().length === 0) return null
    const row = el.closest(ROW_KEY_SELECTOR)
    if (row === null) return 'page'
    return row.getAttribute('data-chat-node-key') ?? row.getAttribute('data-chat-flow-key') ?? 'page'
  }

  /** 走一遍整页文本节点，产出文档序的候选。一个元素可以有多个文本子节点，判据按元素缓存。 */
  function collect() {
    /** @type {Array<{ key: string, text: string, ref: Text }>} */
    const out = []
    /** @type {Map<Element, string|null>} */
    const cache = new Map()
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const el = node.parentElement
      if (el === null) continue
      let key = cache.get(el)
      if (key === undefined) {
        key = rowKeyFor(el)
        cache.set(el, key)
      }
      if (key === null) continue
      const text = node.nodeValue
      if (text === null || text === '') continue
      out.push({ key, text, ref: node })
    }
    return out
  }

  function recompute(keepAnchor) {
    const prev = matches
    const prevCursor = cursor
    if (query === '') {
      matches = []
      ranges = []
      cursor = -1
      truncated = false
    } else {
      const built = buildMatchList(collect(), query, MATCH_LIMIT)
      matches = built.matches
      truncated = built.truncated
      ranges = matches.map(toRange)
      if (ranges.length === 0) cursor = -1
      else if (keepAnchor && prevCursor >= 0) cursor = Math.max(reanchor(prev, matches, prevCursor), 0)
      else cursor = 0
    }
    paint()
    renderStatus()
  }

  /** @param {{ start: number, end: number, ref: Text }} m */
  function toRange(m) {
    const range = document.createRange()
    range.setStart(m.ref, m.start)
    range.setEnd(m.ref, m.end)
    return range
  }

  function paint() {
    // 每次都重新认领这两个名字：两份实例并存时后装上的一方会占住注册名，不认领就是
    // 这一份在往一个已经不上屏的集合里画。
    CSS.highlights.set(HIGHLIGHT_ALL, allSet)
    CSS.highlights.set(HIGHLIGHT_ACTIVE, activeSet)
    allSet.clear()
    activeSet.clear()
    for (const range of ranges) allSet.add(range)
    if (cursor >= 0 && cursor < ranges.length) activeSet.add(ranges[cursor])
  }

  function renderStatus() {
    if (status === null) return
    if (query === '') status.textContent = ''
    else if (matches.length === 0) status.textContent = tOwn('find.noResults')
    else status.textContent = tOwn('find.count', {
      index: String(cursor + 1),
      total: truncated ? `${MATCH_LIMIT}+` : String(matches.length),
    })
  }

  function step(direction) {
    if (ranges.length === 0) return
    cursor = nextIndex(cursor, ranges.length, direction)
    paint()
    renderStatus()
    const el = matches[cursor].ref.parentElement
    if (el !== null) el.scrollIntoView({ block: 'center', behavior: 'instant' })
  }

  /** 选区预填：与浏览器一致，页面上有一段单行选区时拿它当查询词。 */
  function pickedSelection() {
    const selection = window.getSelection()
    if (selection === null || selection.isCollapsed || selection.rangeCount === 0) return null
    const text = selection.toString()
    if (text === '' || text.includes('\n') || text.length > 128) return null
    return text
  }

  function ensureBar() {
    if (bar !== null) return
    bar = document.createElement('div')
    bar.className = ROOT_CLASS
    bar.setAttribute('role', 'search')
    if (owner !== undefined) bar.setAttribute(OWNER_ATTR, owner)

    input = document.createElement('input')
    input.type = 'text'
    input.className = `${ROOT_CLASS}__input`
    input.spellcheck = false
    input.setAttribute('aria-label', tOwn('find.placeholder'))
    input.placeholder = tOwn('find.placeholder')
    input.value = query
    input.addEventListener('input', () => {
      query = input.value
      recompute(false)
    })
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return
      event.preventDefault()
      event.stopPropagation()
      step(event.shiftKey ? 'prev' : 'next')
    })
    bar.append(input)

    status = document.createElement('span')
    status.className = `${ROOT_CLASS}__count`
    status.setAttribute('aria-live', 'polite')
    bar.append(status)

    bar.append(makeButton(`${ROOT_CLASS}__btn`, 'find.prev', '\u2191', () => step('prev')))
    bar.append(makeButton(`${ROOT_CLASS}__btn`, 'find.next', '\u2193', () => step('next')))
    bar.append(makeButton(`${ROOT_CLASS}__btn`, 'find.close', '\u00d7', close))
  }

  /**
   * @param {string} className
   * @param {string} labelKey
   * @param {string} glyph
   * @param {() => void} onClick
   */
  function makeButton(className, labelKey, glyph, onClick) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = className
    const label = tOwn(labelKey)
    button.title = label
    button.setAttribute('aria-label', label)
    button.textContent = glyph
    button.addEventListener('click', onClick)
    return button
  }

  function startObserver() {
    if (observer !== null) return
    observer = new MutationObserver((records) => {
      for (const record of records) {
        // 条自己的改动（计数文本）不该触发重扫，否则就是自激环。
        if (bar !== null && record.target instanceof Node && bar.contains(record.target)) continue
        queueRecompute()
        return
      }
    })
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  }

  function stopObserver() {
    if (observer === null) return
    observer.disconnect()
    observer = null
  }

  /** 一帧最多重扫一次：一次 React 渲染会打出几十条 mutation。 */
  function queueRecompute() {
    if (queue || disposed) return
    queue = true
    requestAnimationFrame(() => {
      queue = false
      if (!disposed && bar !== null) recompute(true)
    })
  }

  function open() {
    if (disposed) return
    closeContextMenu()
    const picked = pickedSelection()
    if (picked !== null && picked !== query) query = picked
    ensureBar()
    if (bar.parentElement !== document.body) document.body.append(bar)
    recompute(picked === null)
    startObserver()
    input.focus()
    input.select()
  }

  function close() {
    stopObserver()
    if (bar === null) return
    bar.remove()
    bar = null
    unregisterHighlights()
  }

  /**
   * 摘掉两个注册名。集合本身先清空，删名只删自己那份——另一份实例可能已经认领了这个
   * 名字，删它就是替别人把高亮摘掉。
   */
  function unregisterHighlights() {
    allSet.clear()
    activeSet.clear()
    if (CSS.highlights.get(HIGHLIGHT_ALL) === allSet) CSS.highlights.delete(HIGHLIGHT_ALL)
    if (CSS.highlights.get(HIGHLIGHT_ACTIVE) === activeSet) CSS.highlights.delete(HIGHLIGHT_ACTIVE)
  }

  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (disposed) return
    if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.key === 'f' || event.key === 'F')) {
      event.preventDefault()
      event.stopPropagation()
      open()
      return
    }
    if (event.key !== 'Escape' || bar === null) return
    // 右键菜单开着时把这一次 Esc 让给菜单；菜单关闭后按第二次才收查找条。
    if (document.querySelector(`.${MENU_CLASS}`) !== null) return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  window.addEventListener('keydown', onKeyDown, true)

  const dispose = () => {
    if (disposed) return
    disposed = true
    close()
    window.removeEventListener('keydown', onKeyDown, true)
    // 条没开过时 close() 是空操作，这里补一次：装上又卸掉也不留注册名。
    unregisterHighlights()
  }

  return {
    dispose,
    open,
    close,
    snapshot: () => ({
      supported: true,
      open: bar !== null,
      query,
      total: matches.length,
      truncated,
      index: cursor,
      key: cursor >= 0 ? matches[cursor].key : null,
      activeText: cursor >= 0 && ranges[cursor] !== undefined ? ranges[cursor].toString() : '',
    }),
  }
}

/**
 * 查找条与两层高亮；由 client 入口插进那张共享样式表。
 *
 * 外观照抄应用自己的浮层档（与 `MENU_CSS` 同一批 token：surface 用
 * `--dsw-specific-menu` 打底、边界由 `--dsw-elevation-prominent` 撑），因为这条
 * 横条是页面的一部分，不该长得像浏览器自己的 UI。
 *
 * 两条 `::highlight()` 的**先后是绘序**：规范里叠放顺序跟随规则在文档里出现的顺序，
 * 当前项必须画在全部命中之上，所以 active 在后。调换顺序的表现是当前项看不出区别。
 */
export const FIND_CSS = `
.${ROOT_CLASS} {
  --dsw-oi-find-surface: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #2c2c2e));
  box-sizing: border-box;
  position: fixed;
  z-index: 2147483000;
  top: 12px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px;
  border-radius: 12px;
  background-color: var(--dsw-alias-bg-layer-1, #2c2c2e);
  background-image: linear-gradient(var(--dsw-oi-find-surface), var(--dsw-oi-find-surface));
  --dsw-elevation-stroke-color: var(--dsw-alias-border-l1, rgba(128,128,128,0.3));
  box-shadow: var(--dsw-elevation-prominent, 0 8px 24px rgba(0, 0, 0, 0.28));
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 13px;
  line-height: 20px;
  user-select: none;
}
.${ROOT_CLASS}__input {
  box-sizing: border-box;
  width: 208px;
  min-width: 0;
  height: 26px;
  padding: 2px 8px;
  border: 0.5px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.35));
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.18));
  color: var(--dsw-alias-label-primary, inherit);
  font: inherit;
  outline: none;
}
.${ROOT_CLASS}__input:focus-visible {
  border-color: var(--dsw-specific-input-major, var(--dsw-alias-state-business-primary, #4d6bfe));
}
.${ROOT_CLASS}__count {
  min-width: 62px;
  padding: 0 4px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  color: var(--dsw-alias-label-tertiary, inherit);
  white-space: nowrap;
}
.${ROOT_CLASS}__btn {
  box-sizing: border-box;
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--dsw-alias-label-secondary, inherit);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.${ROOT_CLASS}__btn:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.18)); }
::highlight(${HIGHLIGHT_ALL}) {
  background-color: color-mix(in srgb, var(--dsw-alias-state-warn-label, #d9a441) 42%, transparent);
}
::highlight(${HIGHLIGHT_ACTIVE}) {
  background-color: var(--dsw-alias-state-warn-label, #d9a441);
  text-decoration-line: underline;
}
`
