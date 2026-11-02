/**
 * 功能 13：滚到顶部时自动加载更早的消息。
 *
 * 上游把「加载更早」按钮渲染在会话列的最顶端（`ChatView.tsx` 里
 * `hasMore && <div className={css.older}><button…`）：列本身是
 * `div[data-chat-flow]`，`.older` 是它的第一个子元素。按钮随 `hasMore` 常驻，
 * 滚在底部时被滚动容器裁掉，只有回到 `scrollTop = 0` 才看得见。点击走
 * `useChatNavigation.loadEarlier`，提交后 `viewport.preserve()` 把原先可见的那一行
 * 钉在原位，新补的一页出现在它上方——于是按钮被顶出视口，用户需要再往上滚才会
 * 再次看见它。本功能就在「按钮可见」的这一刻替用户点一次。
 *
 * 只认视口里真的看得见的那一枚按钮：`IntersectionObserver` 的根是视口，祖先滚动
 * 容器的裁剪会自动计入交叉矩形，所以滚在底部时 `isIntersecting` 为假，打开会话不
 * 会主动翻历史。页面短到一页装得下时，加载完按钮仍在视口里，会继续加载下一
 * 页——直到历史到头（按钮随 `hasMore` 卸载）或内容顶满视口。
 *
 * **失败不重试**。上游 `loadOlder()` 把异常吞进 `console.error`，失败时按钮照常
 * 留在原地、恢复可点；如果只按「可见就点」会变成失败重试死循环。因此一次点击
 * 后要么看到内容变多，要么在按钮重新可用且没有新内容时停下，直到用户把按钮滚出
 * 视口再滚回来才重新允许自动点。
 *
 * 选择器只锚两个上游事实：滚动容器上的 `[data-conversation-scroll]`（上游在
 * `ConversationContent.tsx` 渲染，`useChatViewport` 也按它找滚动节点）与会话列上的
 * `[data-chat-flow]`。不按文案锚（统计页也有一枚同文案的「加载更早」），也不按
 * CSS Module 类名锚（编译后的前缀随构建变）。列的第一个子元素直接是按钮的父级时
 * 才认——统计页没有这个结构。
 */

const SCROLL_SELECTOR = '[data-conversation-scroll]'
const FLOW_SELECTOR = '[data-chat-flow]'
/** 点过之后等按钮回到可用状态的最长时间；超过仍可用且内容没变即判为失败。 */
const SETTLE_MS = 400

/**
 * 在会话滚动容器里找「加载更早」按钮。
 *
 * @returns {{ scroller: HTMLElement, button: HTMLButtonElement }|null}
 */
function findControl() {
  for (const scroller of document.querySelectorAll(SCROLL_SELECTOR)) {
    if (!(scroller instanceof HTMLElement)) continue
    for (const column of scroller.querySelectorAll(FLOW_SELECTOR)) {
      if (!(column instanceof HTMLElement)) continue
      const older = column.firstElementChild
      if (!(older instanceof HTMLElement)) continue
      const button = older.firstElementChild
      if (button instanceof HTMLButtonElement && button.type === 'button') {
        return { scroller, button }
      }
    }
  }
  return null
}

/**
 * 安装滚到顶部自动加载。
 *
 * @returns {{ dispose: () => void, refresh: () => void,
 *   snapshot: () => { attached: boolean, visible: boolean, disabled: boolean|null,
 *     loading: boolean, stalled: boolean } }}
 *   `dispose` 幂等；`refresh` 让验证脚本在切会话后立刻重扫，不必等下一批 DOM
 *   变化；`snapshot` 是脚本与控制台读状态的入口。
 */
export function installAutoLoadOlder() {
  let disposed = false
  /** 当前观察的那枚按钮；React 换掉按钮或切走会话后会被替换。 */
  /** @type {HTMLButtonElement|null} */
  let button = null
  /** 按钮所属的会话滚动容器，`scrollHeight` 与「内容有没有变多」都读它。 */
  /** @type {HTMLElement|null} */
  let scroller = null
  /** 本次自动点击的基准；非空表示正在等这一页落地。 */
  /** @type {{ firstKey: string|null, height: number, at: number }|null} */
  let attempt = null
  /** 上一页没有带来新内容，用户把按钮滚出视口之前不再自动点。 */
  let stalled = false
  let settleTimer = 0
  let queued = false
  let frame = 0

  /** 按钮的第一个节点行 key；新补的一页一定插在它之前，用它判「内容真的变多」。 */
  function firstKey() {
    if (scroller === null) return null
    const row = scroller.querySelector('[data-chat-node-key]')
    return row === null ? null : row.getAttribute('data-chat-node-key')
  }

  /** 视口判定与 IntersectionObserver 同口径：被滚动容器裁掉时矩形的边为负。 */
  function visible() {
    if (button === null || !button.isConnected) return false
    const rect = button.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
      && rect.bottom > 0 && rect.top < window.innerHeight
      && rect.right > 0 && rect.left < window.innerWidth
  }

  function clearAttempt() {
    attempt = null
    window.clearTimeout(settleTimer)
    settleTimer = 0
  }

  /** 一次加载已经结束：内容变多就继续（按钮还看得见时），否则判定失败停下。 */
  function finishAttempt() {
    if (attempt === null || button === null || scroller === null) return
    if (button.disabled) return
    const grown = firstKey() !== attempt.firstKey || scroller.scrollHeight > attempt.height
    if (grown) {
      clearAttempt()
      // 让滚动锚定先落位，再决定要不要接着点。
      frame = window.requestAnimationFrame(() => {
        frame = 0
        maybeClick()
      })
      return
    }
    if (performance.now() - attempt.at < SETTLE_MS) return
    clearAttempt()
    stalled = true
  }

  function maybeClick() {
    if (disposed || button === null || attempt !== null || stalled || button.disabled) return
    if (!visible()) return
    attempt = { firstKey: firstKey(), height: scroller?.scrollHeight ?? 0, at: performance.now() }
    button.click()
    window.clearTimeout(settleTimer)
    // 加载没有触发任何 DOM 变化时（例如点击被上游守卫吞掉），靠这个兜底收尾。
    settleTimer = window.setTimeout(finishAttempt, SETTLE_MS)
  }

  /** DOM 变了：按钮换了就重新挂观察；加载在飞就检查这一页有没有落地。 */
  function sync() {
    if (disposed) return
    const found = findControl()
    if (found?.button !== button) {
      if (button !== null) observer.unobserve(button)
      button = found?.button ?? null
      scroller = found?.scroller ?? null
      stalled = false
      clearAttempt()
      if (button !== null) observer.observe(button)
    }
    finishAttempt()
  }

  /** 把一批 mutation 合并到下一帧处理；流式输出时每帧最多扫一次。 */
  function scheduleSync() {
    if (queued || disposed) return
    queued = true
    frame = window.requestAnimationFrame(() => {
      queued = false
      frame = 0
      sync()
    })
  }

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.target !== button) continue
      if (!entry.isIntersecting) {
        // 离开视口：失败标记作废，下次滚回来重新允许自动点。加载还在飞时不拆基准，
        // 否则它落地前又滚回来会再点一次（上游会拦，但这一页就没人收尾了）。
        stalled = false
        if (button?.disabled === false) clearAttempt()
        continue
      }
      maybeClick()
    }
  }, { threshold: 0 })

  const mutations = new MutationObserver(scheduleSync)
  // 除了节点/文本变化，还要盯 `disabled`：一次加载结束时上游只把这一个属性翻回
  // false，没有子节点插入；不看它，短会话（按钮仍留在视口里）就接不上下一页，
  // 很慢的失败也会一直挂在「加载中」。
  mutations.observe(document.body, {
    childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled'],
  })

  sync()

  return {
    dispose: () => {
      if (disposed) return
      disposed = true
      mutations.disconnect()
      observer.disconnect()
      window.clearTimeout(settleTimer)
      if (frame !== 0) window.cancelAnimationFrame(frame)
      clearAttempt()
      button = null
      scroller = null
    },
    refresh: sync,
    snapshot: () => ({
      attached: button !== null && button.isConnected,
      visible: visible(),
      disabled: button?.disabled ?? null,
      loading: attempt !== null,
      stalled,
    }),
  }
}
