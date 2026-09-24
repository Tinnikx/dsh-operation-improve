/**
 * 功能 11 的纯函数层：命中偏移、命中列表、跳转游标、重算后的重锚。
 *
 * 这一层不碰 DOM，也不碰 `CSS.highlights`。`ref` 是什么由调用方决定（DOM 半边放的是
 * 文本节点），本层只认 `key`（命中归属于哪一行）与「同 `key` 内第几条」这两件事。
 *
 * {@link buildMatchList} 的产出顺序 = 调用方喂进来的顺序，因此 DOM 半边可以按同一个
 * 下标在 `matches[i]` 与 `ranges[i]` 之间对齐，不必另存映射。
 */

/** `(key, ordinal)` 的稳定标识；NUL 作分隔，避免两段拼接撞车。 */
const SEP = '\u0000'
const matchId = (m) => m.key + SEP + m.ordinal

/**
 * `query` 在 `text` 里的全部命中起点（大小写不敏感、不重叠）。空查询或空文本返回空表。
 *
 * 少数字符的小写形式比本身长（U+0130「İ」降成两个 code unit），这时 lowercase 串上的
 * 下标不再等于原文下标，拿它去 `Range.setStart` 会抛 `IndexSizeError`。原文与查询都
 * 不发生长度变化时走 `indexOf`（长会话里逐位比较太贵），否则退回逐位比较——比较对象
 * 始终是原文切片，所以产出的下标恒为原文下标。
 *
 * @param {string} text
 * @param {string} query
 * @returns {number[]}
 */
export function findOffsets(text, query) {
  const out = []
  if (text === '' || query === '') return out
  const needle = query.toLowerCase()
  const haystack = text.toLowerCase()
  if (haystack.length === text.length) {
    for (let from = 0; ;) {
      const at = haystack.indexOf(needle, from)
      if (at === -1) return out
      out.push(at)
      from = at + needle.length
    }
  }
  for (let i = 0; i + query.length <= text.length; i += 1) {
    if (text.slice(i, i + query.length).toLowerCase() !== needle) continue
    out.push(i)
    i += query.length - 1
  }
  return out
}

/**
 * 把「带归属 `key` 的文本」编成命中列表。
 *
 * `ordinal` 是同一 `key` 内的序号（文档序），{@link reanchor} 靠它把游标锚回同一条命中。
 *
 * @param {Iterable<{ key: string, text: string, ref: T }>} nodes 文档序的候选文本
 * @param {string} query
 * @param {number} limit 命中总数上限，产出到数即截断
 * @returns {{ matches: Array<{ key: string, ordinal: number, start: number, end: number, ref: T }>,
 *   truncated: boolean }}
 * @template T
 */
export function buildMatchList(nodes, query, limit) {
  /** @type {Array<{ key: string, ordinal: number, start: number, end: number, ref: T }>} */
  const matches = []
  if (query === '') return { matches, truncated: false }
  /** @type {Map<string, number>} */
  const counters = new Map()
  for (const node of nodes) {
    for (const at of findOffsets(node.text, query)) {
      if (matches.length >= limit) return { matches, truncated: true }
      const ordinal = counters.get(node.key) ?? 0
      counters.set(node.key, ordinal + 1)
      matches.push({ key: node.key, ordinal, start: at, end: at + query.length, ref: node.ref })
    }
  }
  return { matches, truncated: false }
}

/**
 * 下一个 / 上一个的游标，到端点环绕（浏览器自己的查找条也环绕）。
 *
 * @param {number} current 当前下标；`-1` 表示还没有当前项
 * @param {number} total
 * @param {'next' | 'prev'} direction
 * @returns {number} `-1` 表示没有可去的命中
 */
export function nextIndex(current, total, direction) {
  if (total <= 0) return -1
  if (current < 0) return direction === 'prev' ? total - 1 : 0
  return direction === 'prev' ? (current + total - 1) % total : (current + 1) % total
}

/**
 * 重算之后把游标锚回**同一条命中**，而不是同一个下标。
 *
 * 锚点是 `(key, ordinal)`：`key` 是命中所属的行，`ordinal` 是它在该行内的文档序。行被
 * 摘走或该条命中消失时，取文档序里紧随其后的第一条（`prev` 本身就是文档序，所以往后
 * 扫），后面全没有了再往前扫。同一行内早先的命中消失会让后面的序号整体前移——那时
 * `(key, ordinal)` 失配，走的正是这条扫描分支。
 *
 * @param {ReadonlyArray<{ key: string, ordinal: number }>} prev 重算前的命中列表
 * @param {ReadonlyArray<{ key: string, ordinal: number }>} next 重算后的命中列表
 * @param {number} activeIndex `prev` 里的当前下标
 * @returns {number} `next` 里的下标；`-1` 表示 `next` 为空
 */
export function reanchor(prev, next, activeIndex) {
  if (next.length === 0) return -1
  if (activeIndex < 0 || activeIndex >= prev.length) return 0
  /** @type {Map<string, number>} 同标识取最靠前的一条 */
  const rank = new Map()
  for (let i = next.length - 1; i >= 0; i -= 1) rank.set(matchId(next[i]), i)
  const exact = rank.get(matchId(prev[activeIndex]))
  if (exact !== undefined) return exact
  for (let i = activeIndex + 1; i < prev.length; i += 1) {
    const at = rank.get(matchId(prev[i]))
    if (at !== undefined) return at
  }
  for (let i = activeIndex - 1; i >= 0; i -= 1) {
    const at = rank.get(matchId(prev[i]))
    if (at !== undefined) return at
  }
  return 0
}
