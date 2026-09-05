/**
 * 功能 9 的纯函数层——干净判定与轮次条目解析，不碰 DOM。
 *
 * 导出后可独立单测，`installChatHistory` 内部也引用同一份。
 */

/**
 * 判断输入框当前内容是否「干净」（是空的，或就是上一次导航设入且未被修改的值）。
 *
 * @param {string} current 当前值
 * @param {string|null} lastNavigatedValue 上一次上下键切换设入的值
 * @returns {boolean}
 */
export function isPristine(current, lastNavigatedValue) {
  if (current === '') return true
  if (lastNavigatedValue !== null && current === lastNavigatedValue) return true
  return false
}

/**
 * 把轮次导航列的条目解析成历史文本（按 turn 升序，最旧在前）。
 *
 * 每条：`anchor.kind === 'loaded'` 且查得到气泡全文的用全文（长提问在导航列里只有
 * 50 字预览，全文只能从消息流的挂载行取）；否则退化为上游给的 `prompt` 预览。
 * 两端都拿不到文本的条目被丢弃（没有可导航的内容）。
 *
 * @param {Array<{ turn: number, prompt?: unknown, anchor?: unknown }>} items 导航列 fiber 里的条目
 * @param {(anchorKey: string) => string|null} lookupFullText 按 anchor.key 查消息流气泡全文；查不到返回 null
 * @returns {string[]}
 */
export function resolveTurnTexts(items, lookupFullText) {
  const out = []
  for (const item of items) {
    let text = null
    const anchor = item.anchor
    if (anchor !== null && typeof anchor === 'object'
        && anchor.kind === 'loaded' && typeof anchor.key === 'string') {
      text = lookupFullText(anchor.key)
    }
    if (text === null || text === undefined || text.trim() === '') {
      text = typeof item.prompt === 'string' ? item.prompt : ''
    }
    const trimmed = text.trim()
    if (trimmed !== '') out.push(trimmed)
  }
  return out
}
