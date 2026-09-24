/**
 * `verify-find-live.mjs` 的页面侧片段：oracle 命中计数、可搜文本读取、两个探针。
 *
 * 这些字符串在**被测页面里求值**。oracle 与插件是两份独立实现——同一套判据各写一遍，
 * 对不上就是断言要报的失败，不是脚本借用被测代码自证。
 */

/**
 * 页面侧公用函数：`__dshOiFindTexts(mode)` 返回文档序的文本节点内容数组。
 *
 * 两种口径：`visible` 与插件逐条对齐（跳过项、可见性、折叠），`raw` 只保留「跳过本插件
 * 自己的东西」——两者的差值就是「在 DOM 里但用户看不见」的那部分文本，折叠判据靠它才有
 * 可比性。判据由脚本**独立写一遍**：插件改了判据而这里没跟上，断言报的是数不一致，不是
 * 拿被测代码自证。
 */
export const FIND_PAGE_HELPERS = `(() => {
  const SKIP = '.dsh-oi-find, .dsh-oi-menu, .dsh-oi-ts, script, style, noscript, textarea, input, select, option'
  const COLLAPSED = '[data-variant="think"]:not([data-expanded]), [aria-expanded="false"]'
  window.__dshOiFindTexts = (mode) => {
    const out = []
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
      const el = node.parentElement
      if (el === null) continue
      if (el.closest(SKIP) !== null) continue
      if (mode !== 'raw') {
        if (el.closest(COLLAPSED) !== null) continue
        if (!el.checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true, contentVisibilityAuto: true })) continue
        if (el.getClientRects().length === 0) continue
      }
      const text = node.nodeValue
      if (text === null || text === '') continue
      out.push(text)
    }
    return out
  }
  window.__dshOiFindPageText = () => window.__dshOiFindTexts('visible').join(' ')
  // 运行中的会话：流式追加会让「插件命中数」与「oracle 命中数」抢时序，挑会话时避开。
  window.__dshOiFindIsRunning = (row) => {
    const fiberKey = Object.keys(row).find((k) => k.startsWith('__reactFiber$'))
    if (fiberKey === undefined) return false
    let fiber = row[fiberKey]
    while (fiber !== null) {
      if (typeof fiber.memoizedProps?.node?.running === 'boolean') return fiber.memoizedProps.node.running
      fiber = fiber.return
    }
    return false
  }
  return true
})()`

/**
 * oracle 命中数：`(query, mode) => number`。不重叠计数，大小写不敏感——与插件的
 * `findOffsets` 同一语义，逐条命中累加。`mode` 见 {@link FIND_PAGE_HELPERS}。
 */
export const ORACLE_SOURCE = `(query, mode) => {
  if (query === '') return 0
  const needle = query.toLowerCase()
  let n = 0
  for (const text of window.__dshOiFindTexts(mode ?? 'visible')) {
    const hay = text.toLowerCase()
    let at = hay.indexOf(needle)
    while (at !== -1) {
      n += 1
      at = hay.indexOf(needle, at + needle.length)
    }
  }
  return n
}`

/**
 * `Ctrl`/`F` 的 `defaultPrevented` 探针。必须**在插件之后**注册：同为 window 捕获时
 * 注册序决定调用序，后注册的那次读到的才是插件处理之后的状态。
 */
export const PROBE_INSTALL = `(() => {
  if (window.__dshOiFindProbe !== undefined) return true
  window.__dshOiFindProbe = []
  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'f' || event.key === 'F')) {
      window.__dshOiFindProbe.push(event.defaultPrevented)
    }
  }, true)
  return true
})()`

/** 上游 DOM 改动计数器：只数 `childList`，且排除插件自己的查找条子树。 */
export const MUTATION_INSTALL = `(() => {
  window.__dshOiFindMutations = 0
  const bar = document.querySelector('.dsh-oi-find')
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (bar !== null && record.target instanceof Node && bar.contains(record.target)) continue
      window.__dshOiFindMutations += record.addedNodes.length + record.removedNodes.length
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.__dshOiFindMutationStop = () => observer.disconnect()
  return true
})()`
