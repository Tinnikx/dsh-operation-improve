/**
 * 功能 3：会话页右侧悬浮「对话起点」导航列。
 *
 * 数据源是 DOM 而不是快照：导航列住在 overlay 层，拿不到 session 域的
 * `useSession` hook（见 RESEARCH.md 三），而定位本来就要 DOM 锚点，所以两边
 * 都走 `[data-conversation-scroll]` 里的 `[class*="_userRow"]`。steering 行复用
 * 同一个组件，靠 `data-pending-steering` 排除。
 *
 * 刻度是「重建」而不是「增量更新」：会话切换会整片换掉滚动容器与消息节点，
 * 增量维护要处理节点复用与顺序变化，重建则只依赖一次查询的结果。重建由
 * `MutationObserver` 触发并压到一帧一次。
 *
 * 不干扰原有滚动与点击：导航列 `position: fixed`，容器恒为 `pointer-events: none`，
 * 只有刻度自身在列可见时可点；滚动监听是 `passive`，从不 `preventDefault`。
 *
 * 水平位置贴着会话视图 `_viewArea` 的右缘，不贴窗口右缘：外壳布局是三列
 * grid，别的插件展开右侧详情列时会话区整体左移，按窗口定位的列会被压在详情
 * 面板底下。详情列展开只改 grid 那一行 inline 样式，DOM 结构不变，`MutationObserver`
 * 收不到，所以跟随靠锚点上的 `ResizeObserver`。
 *
 * 只在会话正文真的露在最前面时才响应 hover：设置这类「页」是盖在会话区上的一层
 * 全屏遮罩，而导航列的 `z-index` 在它之上，不挡一道就会浮在设置面板上面。判据是
 * 命中测试（{@link installStartNav} 里的 `measureCovered`），不是浮层类名清单。
 */

const ROOT_CLASS = 'dsh-oi-nav'

/** 会话视图的内容区；导航列的右缘贴着它。 */
const VIEW_AREA_SELECTOR = '[class*="_viewArea"]'

/** 导航列右缘与锚点右缘之间的空隙，按视口宽度取比例。 */
const RIGHT_RATIO = 0.02

/** 鼠标进到导航列左缘多少 px 内淡入。 */
const HOT_ZONE = 72
/** 少于这么多起点就不显示——一条起点的导航列没有意义。 */
const MIN_ANCHORS = 2
/** 点击定位后，起点距容器顶部留出的空隙。 */
const SCROLL_MARGIN = 16
/** 摘要 tooltip 的截断长度。 */
const SUMMARY_MAX = 90

/**
 * 安装右侧导航列。
 *
 * @param {{ hotZone?: number, minAnchors?: number }} [options]
 *   `hotZone` 是从导航列左缘往左量的淡入距离（px），不是从窗口右缘量的。
 * @returns {{ dispose: () => void, snapshot: () => { count: number, active: number, visible: boolean, covered: boolean, summaries: string[] }, refresh: () => void }}
 *   `dispose` 幂等；`snapshot` / `refresh` 是观察入口，供验证脚本与控制台读状态，
 *   不必翻私有闭包。`covered` 为真表示会话正文被别的界面盖住，此时 hover 不点亮。
 */
export function installStartNav(options) {
  const hotZone = options?.hotZone ?? HOT_ZONE
  const minAnchors = options?.minAnchors ?? MIN_ANCHORS

  // 每次调用都建自己的 root，不复用页面上已有的 `.dsh-oi-nav`。因此**重复调用
  // 而不 dispose 上一个，页面上就会并存多列导航**，刻度总数是 user 行数的整数倍
  // （两个实例即 2 倍）。这不是首帧竞态，也不会自愈：实测清场后单次 apply 在
  // 同步帧、第一帧、第二帧、静置 1.2s 四个采样点恒为 `navs:1 ticks:5`，而不
  // dispose 就再 apply 一次得到 `navs:2 ticks:10`，静置 1.5s 后仍是 10。
  // 正常挂载路径只调用一次且 disposer 交给了 ctx.effect，所以只会在反复注入的
  // 验证脚本里出现；脚本必须在注入前清场，并断言刻度数 == user 行数。
  const root = document.createElement('div')
  root.className = ROOT_CLASS
  root.setAttribute('aria-label', '对话起点导航')
  const tooltip = document.createElement('div')
  tooltip.className = `${ROOT_CLASS}__tip`
  root.append(tooltip)
  document.body.append(root)

  /** @type {Array<{ element: HTMLElement, summary: string, tick: HTMLElement }>} */
  let anchors = []
  /** @type {Element|null} */
  let scroller = null
  /** @type {Element|null} 导航列右缘所贴的元素；随会话切换而更换。 */
  let anchorEl = null
  /** 当前所在起点的下标；-1 表示在第一条起点之前。 */
  let activeIndex = -1
  let pinned = false
  let rebuildQueued = false
  let syncQueued = false
  let disposed = false
  /** 热区的左界（视口坐标）；由 `measureGeometry` 维护。 */
  let hotEdge = 0
  /** 会话正文是否被别的界面盖住；由 `measureCovered` 维护。 */
  let covered = false
  /** 上一次 `pointermove` 落在热区内外；只用来认出「跨进热区」那一次。 */
  let wasNear = false

  /** 当前滚动容器；每次用之前重新查，会话切换会换掉它。 */
  const resolveScroller = () => document.querySelector('[data-conversation-scroll]')

  /**
   * 定位锚点：会话视图的内容区，取不到就回落到滚动容器。
   *
   * `_viewArea` 只在会话打开后存在（首页 / 新会话态没有这个节点），而回落目标
   * 与它同宽差一条滚动条槽，两者跟随详情列的方式一致——所以是回落而不是分支，
   * 下游只认「有一个锚点」。两个都取不到时 `measureGeometry` 交还给样式表。
   */
  const resolveAnchor = () => document.querySelector(VIEW_AREA_SELECTOR) ?? resolveScroller()

  /**
   * 按锚点右缘定位导航列，并量出热区左界。
   *
   * `right` 写成 px 而不是留给样式表的百分比：锚点右缘与视口右缘之间隔着别的
   * 插件撑开的详情列，宽度只有量出来才知道。锚点缺席或被 `display: none`（量出
   * 来是零宽的零矩形）时清掉 inline 值，回到样式表里的百分比。
   *
   * 参照边取 `documentElement.clientWidth` 而不是 `window.innerWidth`：`fixed` 的
   * `right` 按初始包含块解析，那个盒子**不含**文档自己的竖直滚动条，而
   * `innerWidth` 含。两者在文档不滚动时相等，一旦文档出现滚动条就差一条滚动条
   * 的宽度——实测差 15px，表现是列离锚点右缘的空隙比设定值多出这一截。
   *
   * 热区左界只在这里更新：`pointermove` 每秒上百次，在里面现读 `getBoundingClientRect`
   * 就是每次都强制同步布局。
   */
  const measureGeometry = () => {
    const rect = anchorEl === null ? null : anchorEl.getBoundingClientRect()
    const edge = document.documentElement.clientWidth
    root.style.right = rect === null || rect.width === 0 ? '' : `${edge - rect.right + edge * RIGHT_RATIO}px`
    hotEdge = root.getBoundingClientRect().left - hotZone
  }

  /**
   * 量导航列所在的那块地方，最上面的是不是会话正文。
   *
   * **判据是命中测试，不是浮层类名清单**。设置面板、插件市场这些「页」各有各的
   * 类名与挂载点，列一份清单等于每装一个新插件就漏一条；而它们盖住会话区的方式
   * 是同一种——一层 fixed 的全屏遮罩排在命中栈最前。实测设置面板打开时导航列位置
   * 的最上层是 `VOzbGW_mask`，关掉之后回到会话滚动容器内部的 `Md3f7G_scroll`。
   *
   * 命中栈里跳过导航列自己：列可见时刻度是可点的，正好挡在探测点最前面。
   *
   * 「没被盖」放行两种命中结果：落在滚动容器**内部**（列压在正文上），或落在它的
   * **祖先**上（会话区的空白背景）。只有与滚动容器互不包含的旁支节点才算盖住，
   * 那正是浮层的形状。收紧成「必须落在容器内」会把空白处误判成被盖，而这种误判
   * 不报错，只是让列在某些会话上再也不出现。
   *
   * 没有滚动容器、或列被 `data-empty` 藏起来（量出来零宽）时取不到采样点，一律
   * 算被盖住：这两种情况本来就不该点亮，而报 `false` 会让 `snapshot().covered`
   * 变成一个「能显示」的假信号。
   */
  const measureCovered = () => {
    const rect = root.getBoundingClientRect()
    if (scroller === null || rect.width === 0) {
      covered = true
      return
    }
    for (const el of document.elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)) {
      if (el.closest(`.${ROOT_CLASS}`) !== null) continue
      covered = !(scroller.contains(el) || el.contains(scroller))
      return
    }
    covered = true
  }

  /** 重量一次遮挡，被盖住就立刻收起——浮层可能正是从鼠标底下那一列弹出来的。 */
  const refreshCovered = () => {
    measureCovered()
    if (!covered) return
    pinned = false
    root.removeAttribute('data-visible')
    hideTooltip()
  }

  // 详情列展开只改外壳 grid 容器那一行 inline 样式，DOM 结构不变——实测
  // `MutationObserver(document.body, { childList: true, subtree: true })` 一次都不触发，
  // 而锚点上的 `ResizeObserver` 触发 14 次。所以跟随只能挂在这里，不能靠 rebuild。
  // 回调只写导航列自己的 inline `right`，不在观察范围内，不成环。
  const anchorResize = new ResizeObserver(() => {
    if (!disposed) measureGeometry()
  })

  /** 一帧最多重建一次：一次 React 渲染会打出很多条 mutation。 */
  const queueRebuild = () => {
    if (rebuildQueued || disposed) return
    rebuildQueued = true
    requestAnimationFrame(() => {
      rebuildQueued = false
      if (!disposed) rebuild()
    })
  }

  const queueSync = () => {
    if (syncQueued || disposed) return
    syncQueued = true
    requestAnimationFrame(() => {
      syncQueued = false
      if (!disposed) syncActive()
    })
  }

  /**
   * 重建整列刻度。
   *
   * 起点与上一次完全一致时直接返回，不碰 DOM：重建会把刻度节点整批换掉，而
   * hover、焦点与正在进行的 `scrollTo` 都挂在具体节点上，无谓的重建会让它们
   * 全部落空。判据是「元素身份 + 摘要」的逐项比对，不是条数——条数相同而内容
   * 变了（编辑消息、切到起点数相同的会话）同样必须重建。
   */
  function rebuild() {
    const next = resolveScroller()
    if (next !== scroller) {
      if (scroller !== null) scroller.removeEventListener('scroll', queueSync)
      scroller = next
      if (scroller !== null) scroller.addEventListener('scroll', queueSync, { passive: true })
    }

    // 锚点的换新要在下面的提前返回之前处理：会话切换换掉整片容器，而起点集合
    // 可能恰好一模一样（切到起点数相同的会话），那条路径不重建刻度，但列仍然
    // 得改贴到新节点上——盯着游离节点就是再也收不到尺寸变化。
    const nextAnchor = resolveAnchor()
    if (nextAnchor !== anchorEl) {
      anchorResize.disconnect()
      anchorEl = nextAnchor
      if (anchorEl !== null) anchorResize.observe(anchorEl)
      measureGeometry()
    }

    const found = scroller === null ? [] : collectAnchors(scroller)
    const unchanged = found.length === anchors.length
      && found.every((entry, i) => entry.element === anchors[i].element && entry.summary === anchors[i].summary)
    if (unchanged) {
      refreshCovered()
      syncActive()
      return
    }

    for (const item of anchors) item.tick.remove()
    anchors = found.map((entry, index) => {
      const tick = document.createElement('button')
      tick.type = 'button'
      tick.className = `${ROOT_CLASS}__tick`
      tick.dataset.index = String(index)
      tick.setAttribute('aria-label', entry.summary)
      tick.addEventListener('click', () => scrollToAnchor(index))
      tick.addEventListener('pointerenter', () => showTooltip(index))
      tick.addEventListener('pointerleave', hideTooltip)
      tick.addEventListener('focus', () => showTooltip(index))
      tick.addEventListener('blur', hideTooltip)
      root.append(tick)
      return { element: entry.element, summary: entry.summary, tick }
    })

    root.dataset.count = String(anchors.length)
    if (anchors.length < minAnchors) root.setAttribute('data-empty', '')
    else root.removeAttribute('data-empty')
    measureGeometry()
    refreshCovered()
    activeIndex = -1
    syncActive()
  }

  /** 按滚动位置刷新高亮：当前所在起点 = 最后一个已越过容器顶部的起点。 */
  function syncActive() {
    if (scroller === null || anchors.length === 0) return
    const top = scroller.getBoundingClientRect().top
    let index = -1
    for (let i = 0; i < anchors.length; i += 1) {
      if (anchors[i].element.getBoundingClientRect().top - top <= SCROLL_MARGIN + 4) index = i
      else break
    }
    if (index === activeIndex) return
    activeIndex = index
    for (let i = 0; i < anchors.length; i += 1) {
      if (i === index) anchors[i].tick.setAttribute('data-active', '')
      else anchors[i].tick.removeAttribute('data-active')
    }
  }

  /**
   * 平滑滚到第 index 个起点。
   *
   * 不用 `scrollIntoView`：它会连带滚动祖先容器（侧边栏、window），在这个
   * 布局下会把整页顶上去。直接对滚动容器算 offset 更可控。
   */
  function scrollToAnchor(index) {
    const item = anchors[index]
    if (item === undefined || scroller === null) return
    const delta = item.element.getBoundingClientRect().top - scroller.getBoundingClientRect().top
    scroller.scrollTo({ top: scroller.scrollTop + delta - SCROLL_MARGIN, behavior: 'smooth' })
  }

  /**
   * 把摘要框对齐到该刻度的垂直中心。
   *
   * 坐标用 `offsetTop` 而不是 `getBoundingClientRect()`：摘要框是导航列的绝对定位
   * 子节点，参照系是导航列自己的 padding 盒，把视口坐标填进去等于整体下移半屏。
   * 水平位置交给 CSS 的 `right: calc(100% + …)`，不在这里算。
   */
  function showTooltip(index) {
    const item = anchors[index]
    if (item === undefined) return
    tooltip.textContent = item.summary
    tooltip.style.top = `${item.tick.offsetTop + item.tick.offsetHeight / 2}px`
    tooltip.setAttribute('data-open', '')
  }

  function hideTooltip() {
    tooltip.removeAttribute('data-open')
  }

  /**
   * 鼠标贴近导航列就淡入；离开热区且不在列上就淡出。
   *
   * 热区从**导航列左缘**往左量，不是从窗口右缘：列贴的是会话视图右缘，宽窗口上
   * 离窗口右缘几十 px，右侧详情列一开更是几百 px，按窗口右缘算的固定热区够不到
   * 列本身——鼠标还没摸到刻度，列就先淡出了。整列隐藏（起点不足）时不点亮：
   * 此时 `display: none`，量出来的左缘是 0，任何位置都会落进热区，
   * `snapshot().visible` 会报一个看不见的 true。
   *
   * **命中测试只在跨进热区的那一次做**：`elementsFromPoint` 和 `getBoundingClientRect`
   * 一样强制同步布局，而 `pointermove` 每秒上百次。停在热区里期间浮层的开与关由
   * `MutationObserver` 那条路径接手，两边合起来才覆盖「先开页再移过来」与「人已经
   * 悬在列上、页从底下弹出来」两种时序。
   */
  const onPointerMove = (event) => {
    const near = event.clientX >= hotEdge && !root.hasAttribute('data-empty')
    if (near && !wasNear) measureCovered()
    wasNear = near
    if ((near || pinned) && !covered) root.setAttribute('data-visible', '')
    else root.removeAttribute('data-visible')
  }

  const onEnter = () => {
    if (covered) return
    pinned = true
    root.setAttribute('data-visible', '')
  }
  const onLeave = () => {
    pinned = false
    root.removeAttribute('data-visible')
    hideTooltip()
  }

  /** 窗口尺寸变了，列的水平位置（空隙按视口宽度取比例）、热区左界、遮挡与高亮都要重算。 */
  const onResize = () => {
    measureGeometry()
    refreshCovered()
    queueSync()
  }

  root.addEventListener('pointerenter', onEnter)
  root.addEventListener('pointerleave', onLeave)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('resize', onResize)

  // 观察 document.body 而不是消息容器：切会话时整个容器会被换掉，盯着容器
  // （或它的父节点）会连同观察目标一起变成游离节点，从此再也收不到通知——
  // 实测表现是切到新会话后刻度停在旧会话的值不动。
  //
  // 代价是导航列自己也在观察范围内，rebuild 追加刻度会落回自己的观察者，形成
  // 每帧重建的自激环（rAF 合帧只能把频率压到每帧一次，压不掉环本身）。两道闸
  // 挡掉它，缺一都不够：
  //   1. 回调丢弃源自**任何**导航列内部的 mutation。这里必须用 `.dsh-oi-nav`
  //      类选择而不是 `root.contains`：页面上可能残留上一次注入的实例，只认自己
  //      的 root 挡不住两个实例互相触发的乒乓。
  //   2. rebuild 在锚点集合未变时不碰 DOM，顺带保证刻度节点身份稳定——hover、
  //      focus 与 transition 都挂在具体节点上，无谓重建会把它们无声打断。
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      const target = record.target
      if (target instanceof Element && target.closest(`.${ROOT_CLASS}`) !== null) continue
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
    anchorResize.disconnect()
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('resize', onResize)
    if (scroller !== null) scroller.removeEventListener('scroll', queueSync)
    root.remove()
    anchors = []
  }

  return {
    dispose,
    snapshot: () => ({
      count: anchors.length,
      active: activeIndex,
      visible: root.hasAttribute('data-visible'),
      covered,
      summaries: anchors.map((a) => a.summary),
    }),
    refresh: () => rebuild(),
  }
}

/**
 * 扫出滚动容器内的 user 起点。
 *
 * steering 行复用 `_userRow`，用 `data-pending-steering` 排除；摘要取气泡的
 * 文本，取不到时回落整行文本，两者都空的行直接跳过（没有可展示的摘要，
 * 刻度就没有意义）。
 *
 * @param {Element} scroller
 * @returns {Array<{ element: HTMLElement, summary: string }>}
 */
export function collectAnchors(scroller) {
  const out = []
  for (const el of scroller.querySelectorAll('[class*="_userRow"]')) {
    if (!(el instanceof HTMLElement)) continue
    if (el.hasAttribute('data-pending-steering')) continue
    const bubble = el.querySelector('[class*="_bubble"]')
    const raw = (bubble?.textContent ?? el.textContent ?? '').replace(/\s+/g, ' ').trim()
    if (raw.length === 0) continue
    out.push({ element: el, summary: raw.length > SUMMARY_MAX ? `${raw.slice(0, SUMMARY_MAX)}…` : raw })
  }
  return out
}

/**
 * 导航列样式表；由 client 入口与菜单样式一起插入。
 *
 * 摘要框的底色取会话页的**全局背景** `--dsw-alias-bg-base`——上游 `body` 的规则就是
 * `background: var(--dsw-alias-bg-base, #fff)`，会话区根节点用的也是它。不要换成
 * `--dsw-specific-bubble`：那是 user 气泡的底色（深色主题 `#2c2c2e`，全局背景是
 * `#151517`），用它等于把摘要框做成一条「我说的话」。底色与正文同色，所以框靠
 * `--dsw-shadow-lv2` 浮起来；排版（22px 圆角、`10px 16px` 内距、16px/24px 文字）
 * 仍与会话正文一致。
 *
 * 四条不能随手改的：
 *   1. **摘要框必须是 `absolute` 而不是 `fixed`**。导航列自己带 `transform`，那让它成为
 *      `fixed` 后代的包含块，于是 `fixed` 的 `top` / `right` 会按导航列的盒子解析而不是
 *      视口——表现是摘要框飞到列的下方几百 px 处，且离右缘越远偏得越明显。
 *   2. **宽度必须显式写 `max-content`**。绝对定位、只给 `right`、`width: auto` 时，
 *      shrink-to-fit 的可用宽度是「包含块宽度 − right 偏移」，而包含块是 44px 的导航列、
 *      偏移比它还大，可用宽度成了负数，浏览器退到最小内容宽度——**中文每行只放得下
 *      一个字**。`max-content` 不看可用空间，再由 `max-width` 收口换行。
 *   3. **列宽写死成刻度的最大宽度**。宽度随内容走的话，hover 让刻度变宽就会把右对齐
 *      容器的左缘往左推，而摘要框锚在左缘上（`right: calc(100% + …)`），每次 hover 都跳。
 *   4. **`right` 只是回落值**。真实位置由 `measureGeometry` 写成 inline px，贴的是会话
 *      视图 `_viewArea` 的右缘；样式表里这个百分比只在锚点缺席（首页态）时生效。
 *      热区因此不能按窗口右缘算，见 `onPointerMove`。
 *
 * 可点击的只有刻度本身，容器**任何时候都是 `pointer-events: none`**。列不再贴着窗口
 * 右缘，那块 44px 宽的容器正压在会话内容上；容器可点就等于在正文上盖了一条吞掉点击
 * 与文本选中的透明带，而刻度之间的空隙本来就该让页面收到事件。
 */
export const NAV_CSS = `
.${ROOT_CLASS} {
  position: fixed;
  right: 2%;
  top: 50%;
  transform: translateY(-50%);
  z-index: 2147482000;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-end;
  width: 44px;
  padding: 10px 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
}
.${ROOT_CLASS}[data-visible] { opacity: 1; }
.${ROOT_CLASS}[data-empty] { display: none; }
.${ROOT_CLASS}__tick {
  width: 30px;
  height: 6px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: var(--dsw-alias-label-primary, #d0d0d0);
  opacity: 0.4;
  cursor: pointer;
  pointer-events: none;
  transition: width 120ms ease, opacity 120ms ease;
}
.${ROOT_CLASS}[data-visible] .${ROOT_CLASS}__tick { pointer-events: auto; }
.${ROOT_CLASS}__tick:hover { width: 44px; opacity: 0.85; }
.${ROOT_CLASS}__tick[data-active] {
  width: 44px;
  opacity: 1;
  background: var(--dsw-alias-brand-primary, #4d6bfe);
}
.${ROOT_CLASS}__tip {
  position: absolute;
  right: calc(100% + 10px);
  top: 0;
  transform: translateY(-50%);
  width: max-content;
  max-width: 360px;
  padding: 10px 16px;
  border-radius: 22px;
  background: var(--dsw-alias-bg-base, #151517);
  color: var(--dsw-alias-label-primary, inherit);
  box-shadow: var(--dsw-shadow-lv2, 0 8px 24px rgba(0, 0, 0, 0.28));
  font-size: 16px;
  line-height: 24px;
  white-space: normal;
  opacity: 0;
  pointer-events: none;
  transition: opacity 120ms ease;
}
.${ROOT_CLASS}__tip[data-open] { opacity: 1; }
`
