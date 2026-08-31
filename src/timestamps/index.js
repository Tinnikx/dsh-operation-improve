/**
 * 功能 4：会话页逐行开始时间戳。
 *
 * 数据源是 React fiber 而不是会话快照。每个节点行的外层由上游
 * `ui-conversation` 的 `ChatNodeSeat` 统一渲染成
 * `div[data-chat-flow-key][data-chat-flow-kind]`，而它内部第 7 层 fiber 的
 * `memoizedProps.node` 就是整个节点（`kind` / `key` / `data` / `location`）。这条
 * 路径不占 slot、不注册组件，与本插件其余三项功能同构。
 *
 * **反查是自校验的**：只接受 `node.key` 与行上 `data-chat-flow-key` 逐字相等的那
 * 一个。上游哪天改了层级或复用了节点，结果是这一行没有标签，而不是安上邻行的时
 * 间——错的时间戳比没有时间戳更糟。
 *
 * 时间取的是**开始**时刻，不是落地时刻——两者对工具调用和回复都可以差几十秒，
 * 推导逐条对齐上游轨迹页的 `startedAt`，见 {@link resolveTime}。
 *
 * 两处放置都做到不压正文，方式不同：
 *   - 行标签绝对定位到行自己的右上角，落在 `TIMESTAMP_CSS` 给每个节点行留出的
 *     右侧留白里，与本行第一行水平对齐。留白是有意付的宽度代价，理由见那里。
 *   - 思考标签作为末尾 flex 项插进 Think 折叠头那条 flex 行，摘要
 *     （`flex: 1 1 auto` + ellipsis）会自动让出宽度，不必量标签宽度。
 *
 * user / steering / turn-tail 三类不由这里贴标签：上游自己就在渲染时间，只是藏在
 * hover 后面，改成常驻由 `TIMESTAMP_CSS` 负责。
 */
import { formatClockSeconds } from './format-clock.js'

const LABEL_CLASS = 'dsh-oi-ts'
/** 行容器上的标记，同时是 CSS 里 `position: relative` 的挂钩。 */
const ROW_ATTR = 'data-dsh-oi-ts'

/**
 * 不由插件贴标签的三类。它们的时间由上游自己渲染（还带 `Ran for` / `TTFT` /
 * `tok/s` 读数），插件再贴一枚就是两个时间并排。
 */
const UPSTREAM_TIME_KINDS = new Set(['user', 'steering', 'turn-tail'])

/** fiber 向下搜索的深度上限；实测目标恒在第 7 层，留一倍余量。 */
const FIBER_MAX_DEPTH = 12

/**
 * 判定「这个思考行就在本行的第一行上」的容差（px）。实测各类行的首行文字距行顶
 * 4–6px，取 8 既容得下这点差，又小于任何一条行高（最矮的 24px）。
 */
const FIRST_LINE_EPS = 8

/**
 * 挑出这一行里需要单独贴标签的思考行，并给出各自的插入锚点。
 *
 * **只读不写**，调用方必须在写相位之前把整页量完，否则每行一次强制回流。
 *
 * 落在本行第一行水平带上的思考行会被剔除：行标签就在同一条水平带的右端，两枚
 * 时间一字不差地并排出现，只是噪声。步骤中段的思考行离行标签几百 px，仍然要贴。
 *
 * @param {HTMLElement} row
 * @returns {Array<{ think: HTMLElement, host: HTMLElement }>} `host` 是折叠头那条
 *   flex 行——锚点选它而不是摘要本身：展开状态下摘要不再渲染，这条行却一直在
 */
function thinkAnchors(row) {
  const out = []
  const rowTop = row.getBoundingClientRect().top
  for (const think of row.querySelectorAll('[data-variant="think"]')) {
    if (!(think instanceof HTMLElement)) continue
    const host = think.querySelector('[class*="_row"]')
    if (!(host instanceof HTMLElement)) continue
    if (think.getBoundingClientRect().top - rowTop < FIRST_LINE_EPS) continue
    out.push({ think, host })
  }
  return out
}

/**
 * 安装逐行时间戳。
 *
 * @param {{ now?: () => number }} [options] `now` 是格式化时判定「今天 / 今年」的
 *   参照时刻，注入它只为让验证脚本能造跨天场景；默认取墙上时钟。
 * @returns {{ dispose: () => void, refresh: () => void,
 *   snapshot: () => { rows: number, thinks: number, labels: Array<{ kind: string|null, key: string|null, text: string }> } }}
 *   `dispose` 幂等，会摘掉所有标签与标记；`snapshot` / `refresh` 是观察入口，供
 *   验证脚本与控制台读状态，不必翻私有闭包。
 */
export function installTimestamps(options) {
  const now = options?.now ?? (() => Date.now())

  /** 已装饰的行 → 它的行标签与思考标签。undecorate 与 snapshot 都读它。 */
  /** @type {Map<HTMLElement, { label: HTMLElement, thinks: Map<HTMLElement, HTMLElement> }>} */
  const decorated = new Map()
  let rebuildQueued = false
  let disposed = false

  /** 一帧最多重建一次：一次 React 渲染会打出很多条 mutation。 */
  const queueRebuild = () => {
    if (rebuildQueued || disposed) return
    rebuildQueued = true
    requestAnimationFrame(() => {
      rebuildQueued = false
      if (!disposed) rebuild()
    })
  }

  function rebuild() {
    // 读相位：只量不写。think 的去重判据要读矩形，而写标签会让下一次读强制回流，
    // 读写交替就是一行一次布局抖动；先把整页量完再统一写。
    /** @type {Array<{ row: HTMLElement, text: string|null, thinks: Array<{ think: HTMLElement, host: HTMLElement }> }>} */
    const plan = []
    for (const row of document.querySelectorAll('[data-chat-flow-key]')) {
      if (!(row instanceof HTMLElement)) continue
      const text = textFor(row, now())
      if (text === null) {
        plan.push({ row, text: null, thinks: [] })
        continue
      }
      plan.push({ row, text, thinks: thinkAnchors(row) })
    }

    // 写相位。
    const seen = new Set()
    for (const { row, text, thinks } of plan) {
      if (text === null) {
        undecorate(row)
        continue
      }
      decorate(row, text, thinks)
      seen.add(row)
    }
    // 滚出窗口或被换掉的行：React 会把整个行元素摘走，Map 里的条目跟着失效。
    for (const row of [...decorated.keys()]) {
      if (!seen.has(row)) undecorate(row)
    }
  }

  /**
   * 给一行装上（或原样保留）标签。
   *
   * 全程幂等——文本没变就不写 `textContent`，属性已在就不重设。稳态下一条
   * mutation 都不产生，这是自激环的第二道闸（第一道在观察者里）。
   *
   * @param {Array<{ think: HTMLElement, host: HTMLElement }>} thinks 读相位挑好的
   *   思考行；落在本行第一行水平带上的已被剔除，见 {@link thinkAnchors}
   */
  function decorate(row, text, thinks) {
    let entry = decorated.get(row)
    if (entry === undefined) {
      entry = { label: createLabel('row'), thinks: new Map() }
      decorated.set(row, entry)
    }
    if (row.getAttribute(ROW_ATTR) !== 'row') row.setAttribute(ROW_ATTR, 'row')
    if (entry.label.textContent !== text) entry.label.textContent = text
    if (entry.label.parentElement !== row) row.append(entry.label)

    const live = new Set()
    for (const { think, host } of thinks) {
      live.add(think)
      let label = entry.thinks.get(think)
      if (label === undefined) {
        label = createLabel('think')
        entry.thinks.set(think, label)
      }
      if (label.textContent !== text) label.textContent = text
      if (label.parentElement !== host) host.append(label)
    }
    for (const [think, label] of [...entry.thinks]) {
      if (live.has(think)) continue
      label.remove()
      entry.thinks.delete(think)
    }
  }

  function undecorate(row) {
    const entry = decorated.get(row)
    if (entry === undefined) return
    entry.label.remove()
    for (const label of entry.thinks.values()) label.remove()
    decorated.delete(row)
    row.removeAttribute(ROW_ATTR)
  }

  // 观察 `document.body` 而不是消息容器：切会话会整片换掉滚动容器，盯着容器就
  // 连同观察目标一起变成游离节点，从此收不到通知（start-nav 踩过，见 README）。
  //
  // 代价是插进去的标签也在观察范围内。第一道闸丢掉源自标签自身的记录，以及
  // 「增删的全是标签」的记录——**不能写成 `record.target.closest('.dsh-oi-ts')`**：
  // 标签是插到行容器上的，那条 mutation 的 target 是行容器本身，闸门根本合不上。
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (isSelfInflicted(record)) continue
      queueRebuild()
      return
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
  rebuild()

  const dispose = () => {
    if (disposed) return
    disposed = true
    observer.disconnect()
    for (const row of [...decorated.keys()]) undecorate(row)
  }

  return {
    dispose,
    refresh: () => rebuild(),
    snapshot: () => {
      let thinks = 0
      const labels = []
      for (const [row, entry] of decorated) {
        thinks += entry.thinks.size
        labels.push({
          kind: row.getAttribute('data-chat-flow-kind'),
          key: row.getAttribute('data-chat-flow-key'),
          text: entry.label.textContent ?? '',
        })
      }
      return { rows: decorated.size, thinks, labels }
    },
  }
}

/** @param {'row'|'think'} anchor */
function createLabel(anchor) {
  const label = document.createElement('span')
  label.className = LABEL_CLASS
  label.dataset.anchor = anchor
  return label
}

/** 这条 mutation 是不是插件自己写出来的。 @param {MutationRecord} record */
function isSelfInflicted(record) {
  const target = record.target
  if (target instanceof Element && target.closest(`.${LABEL_CLASS}`) !== null) return true
  if (record.type !== 'childList') return false
  const touched = [...record.addedNodes, ...record.removedNodes]
  return touched.length > 0
    && touched.every((node) => node instanceof Element && node.classList.contains(LABEL_CLASS))
}

/**
 * 这一行该显示的时间文本。
 *
 * @param {HTMLElement} row 带 `data-chat-flow-key` 的行容器
 * @param {number} nowMs 判定「今天 / 今年」的参照时刻
 * @returns {string|null} `null` 表示这一行不该有标签——上游自己渲染时间的三类、
 *   本该为空的行、反查不到节点、以及一个时间都取不到的节点，都走这条。
 */
function textFor(row, nowMs) {
  const kind = row.getAttribute('data-chat-flow-kind')
  if (kind !== null && UPSTREAM_TIME_KINDS.has(kind)) return null
  // `.flowItem:empty { display: none }`：turn-tail 在不拥有 actions 时主动放弃渲染，
  // 往本该为空的行里插任何子节点都会让它现形。自己的标签不算「内容」，否则装上
  // 之后这一行就永远不空了。
  if (!hasForeignChild(row)) return null
  const node = chatNodeOf(row)
  if (node === null) return null
  return formatClockSeconds(resolveTime(node), nowMs)
}

/** 行里有没有插件之外的元素子节点。 @param {HTMLElement} row */
function hasForeignChild(row) {
  for (const child of row.children) {
    if (!child.classList.contains(LABEL_CLASS)) return true
  }
  return false
}

/** 元素上的 React fiber（字段名带随机后缀）。 @param {Element} el */
function fiberOf(el) {
  for (const key of Object.keys(el)) {
    if (key.startsWith('__reactFiber$')) return /** @type {any} */ (el)[key]
  }
  return null
}

/**
 * 反查一行对应的 chat 节点。
 *
 * 从行元素的 fiber 向下走 child / sibling，取第一个 `memoizedProps.node` 且
 * **`key` 与行上 `data-chat-flow-key` 相等**的。key 这道校验不能省：没有它，上游
 * 一旦改了层级，反查会安静地拿到邻近节点，整页时间戳全部错位而不报错。
 *
 * @param {HTMLElement} row
 * @returns {any|null} 反查不到返回 `null`，调用方当作「这一行没有时间」跳过
 */
function chatNodeOf(row) {
  const wanted = row.getAttribute('data-chat-flow-key')
  if (wanted === null) return null
  const root = fiberOf(row)
  if (root === null || root === undefined) return null
  const stack = [{ fiber: root, depth: 0 }]
  while (stack.length > 0) {
    const { fiber, depth } = stack.pop()
    if (fiber === null || fiber === undefined || depth > FIBER_MAX_DEPTH) continue
    const node = fiber.memoizedProps?.node
    if (node !== null && node !== undefined && typeof node === 'object'
      && node.key === wanted && 'data' in node) {
      return node
    }
    if (fiber.child !== null && fiber.child !== undefined) stack.push({ fiber: fiber.child, depth: depth + 1 })
    if (fiber.sibling !== null && fiber.sibling !== undefined) stack.push({ fiber: fiber.sibling, depth })
  }
  return null
}

/**
 * 取节点的开始时间（epoch 毫秒）。
 *
 * 候选顺序逐条对齐上游轨迹页 `startedAt` 的推导
 * （`packages/client/ui-trajectory/src/client/layout.ts`），也就是详情面板里
 * 「Started」那一行显示的值：
 *
 *   - **工具调用**：结果节点的 `callTime` 才是发起时刻，`time` 是结果落地时刻，
 *     两者可以差很远（实测同一次调用相差 82 秒）。运行中的调用还没有结果，
 *     `time` 就是发起时刻，所以 `callTime` 缺席时退到 `time` 是对的。
 *   - **assistant-step**：`finalNode.timing.stepStartTime`。这一类的 `data.time`
 *     等于 `timing.completedTime`（实测相差 36 秒），**必须排在 step 起点之后**，
 *     否则整列显示的是回复写完的时刻而不是开始的时刻。历史会话里
 *     `stepStartTime` 可能是 `null`（该字段晚于会话记录引入），依次退到
 *     `location.step.start.time` 与 `firstTokenTime`。
 *   - **事件类节点**（user / context / compaction / turn-tail…）：`data.time` 就是
 *     事件发生时刻，没有「开始 / 结束」之分。
 *
 * 末两条是通用兜底：`ConversationLocation` 的 turn / step 分支携带
 * `TurnLocation` / `StepLocation`，其 `start` 就是 `SessionEvent<'turn/start'>` /
 * `SessionEvent<'step/start'>`，自带 `time`。workflow-run 是唯一 `data` 里没有任何
 * 时间字段的 kind，走的就是这条。
 *
 * 用候选路径而不是按 kind 打表：打表遇到表外的 kind 是静默无标签，候选路径至少
 * 还能靠 location 兜住。代价是顺序本身承载语义——每条候选只在「它存在」的那类
 * 节点上有意义，插入新候选前先确认它不会在别的 kind 上抢答。
 *
 * @param {any} node
 * @returns {number|undefined} 一条都取不到时 `undefined`
 */
function resolveTime(node) {
  const data = node.data
  const location = node.location
  // `finalNode` 只有 assistant-step 有；用它把 step 专属的两条兜底关在这一类里，
  // 免得 context 这种「事件时刻晚于 step 起点」的节点被安上 step 的起点。
  const isStep = data?.finalNode !== undefined && data?.finalNode !== null
  const candidates = [
    data?.root?.callTime,
    data?.root?.time,
    data?.finalNode?.timing?.stepStartTime,
    isStep ? location?.step?.start?.time : undefined,
    data?.finalNode?.timing?.firstTokenTime,
    data?.time,
    data?.command?.time,
    data?.current?.time,
    location?.step?.start?.time,
    location?.turn?.start?.time,
  ]
  for (const value of candidates) {
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/**
 * 时间戳样式表；由 client 入口与其余样式一起插入。
 *
 * 四条不能随手改的：
 *   1. **留白必须给到每一个节点行，不只是被贴了标签的那些**。挂 `[data-dsh-oi-ts]`
 *      只缩一部分行，剩下的（user / steering / turn-tail，以及取不到时间的行）保持
 *      原宽，右边缘就参差不齐。代价是正文列窄 `--dsh-oi-ts-gutter`，这是有意付的：
 *      标签放在行间距里做到过零位移，但 16px 的间距上下对称，标签离本行和离下一行
 *      都是 1px，读起来归属下一行——那正是这一版要消掉的毛病。
 *   2. **行标签对齐的是本行第一行，不是最后一行**。这是「开始时间」，而一个两千 px
 *      高的回复行，把它的起始时刻放在两千 px 之下没有意义。
 *   3. **思考标签是 flex 项，不是绝对定位**。折叠头那条行里摘要是
 *      `flex: 1 1 auto` 且带 ellipsis，插一个 `flex: 0 0 auto` 的兄弟进去，摘要自己
 *      会让出宽度；绝对定位则必然压在摘要尾巴上。`line-height` 必须与摘要的 24px
 *      对齐，否则这一行会被标签撑高。
 *   4. **上游三类的常驻必须带 `!important`**。上游那条 `@media (hover: hover)` 下的
 *      `opacity: 0` 与这里特异度相同，胜负只取决于两张样式表在 `head` 里的先后，
 *      而上游样式表由构建产物插入，顺序不由插件掌控。
 *
 * 标签一律 `pointer-events: none` + `user-select: none`：它落在正文的选区范围内，
 * 可选中就意味着复制一段回复会连时间戳一起带走。
 */
export const TIMESTAMP_CSS = `
[data-chat-flow-key] { padding-right: var(--dsh-oi-ts-gutter, 56px); }
[${ROW_ATTR}] { position: relative; }
.${LABEL_CLASS} {
  color: var(--dsw-alias-label-caption, #8b8b8b);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
  user-select: none;
}
.${LABEL_CLASS}[data-anchor='row'] {
  position: absolute;
  top: 0;
  right: 0;
  line-height: 24px;
}
.${LABEL_CLASS}[data-anchor='think'] {
  flex: 0 0 auto;
  margin-left: auto;
  padding-left: 8px;
  line-height: 24px;
}
[data-time-hover-root] [class*='_timeStart'],
[data-time-hover-root] [class*='_timeEnd'] { opacity: 1 !important; }
`
