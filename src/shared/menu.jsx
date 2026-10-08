/**
 * 共享右键菜单层：本插件开出来的每一处菜单（功能 2 的侧栏行菜单、功能 6 的选中文本
 * 菜单）都由这一个 React root 渲染，外壳是上游 `@deepseek-ai/dsh-client-ui-primitives`
 * 的 `Menu`。
 *
 * **为什么要自己起一个 React root**：上游 `Menu` 是 React 组件，而本插件的菜单是事件驱动
 * 的——从一次 `contextmenu` 事件拿到坐标、打开、选中某项后消失，不在任何一棵已有的
 * React 树里。上游渲染器（`ui-renderer`）没有对外的「在任意位置渲染任意节点」入口，
 * `renderSlot` 只认它自己声明过的 slot。所以这里 `createRoot` 一棵自己的树。组件来自
 * 平台 seed 模块 `@deepseek-ai/dsh-client-ui-primitives`（`packages/client/web/src/seed.ts`
 * 的 9 个 seed 词之一，`scripts/build.mjs` 的 EXTERNALS 已列），`react` 与
 * `react-dom/client` 同样来自 seed，都不打进本插件的 bundle。
 *
 * **为什么用 `getAnchorRect` 而不摆一个锚点元素**：上游 `Menu` 的 `anchor` 必填，且要求它
 * 在组件自己的 DOM 子树里就地渲染（`Menu.tsx:126`「the trigger element (rendered in
 * place)」），而右键没有触发元素。`getAnchorRect` 正是组件为此留的口子
 * （`Menu.tsx:146-151`：「portal mode only … Required when the wrapper isn't itself laid
 * out at the trigger — render-prop anchors, effect-positioned proxies」），上游
 * `WorkspacePicker.tsx:61` 就是这么用的。于是菜单钉在鼠标点，定位、视口夹边、每帧与
 * scroll/resize 重算全部走上游那份实现，本插件不复制任何定位代码。
 *
 * `anchor` 仍要给一个真实节点（组件要从中量尺寸、也要在关闭后尝试归位焦点），所以渲染
 * 一枚零尺寸的 `<span>` 占位。真实位置一律由 `getAnchorRect` 提供；它里面没有 button，
 * `refocusAnchor` 找不到归位目标时是空操作（上游 `Menu.tsx:209-216` 自己就是这么写的容错）。
 *
 * **锚点所在的容器必须脱离文档流**（见下方 `MENU_CSS` 的 `.dsh-oi-menu__host`）：上游把
 * `anchor` 原地渲染进那棵 React 树，外层还包一枚带行盒的 `<span>`（实测高 18px）。容器
 * 留在 `body` 流里，菜单一开 `body` 内容高度就涨过视口、冒出一条竖直滚动条，
 * `documentElement.clientWidth` 少掉滚动条宽度，会话区与右侧导航列跟着横向收窄。
 *
 * **owner 标记**：卡片由 `MenuSurface` 内部 `createPortal` 挂到 `document.body` 下，因此
 * 样式类只能经 `listClassName` 这一条钩子进（`Menu.tsx:163-165`：唯一能作用于 portaled
 * list 的样式钩子）。两份插件实例并存时，外部要能分辨「这张卡片是谁开的」——认错就是把
 * 点击打在另一份实例的真服务上（已经发生过一次归档掉 8 个真实会话）。所以实例 id 既以
 * `data-dsh-oi-owner` 标在本插件自己的容器上，也编成一个类名标在卡片上：卡片在
 * `document.body` 下、不在本插件的 DOM 子树里，按属性查不到它。
 */
import { createElement, useCallback, useRef, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Menu } from '@deepseek-ai/dsh-client-ui-primitives'

/** 菜单卡片的类名，同时是「本插件的菜单」的查询入口。 */
export const ROOT_CLASS = 'dsh-oi-menu'

/** 开菜单的那一份实例的 id。标在本插件的容器上与查找条上（卡片另有一条类名，见 {@link ownerClass}）。 */
export const OWNER_ATTR = 'data-dsh-oi-owner'

/**
 * 两张卡片的层级，加上常驻容器脱流。
 *
 * **浮层层级**：本插件的浮层要压在应用自己的浮层之上——会话行菜单与查找条都开在侧栏上方，
 * 而应用的面板在 `z-index` 1000 量级（上游 `.portal` 实测 1100）。**只能走 `listClassName`**：
 * 卡片在 `document.body` 下，套一层自己的包裹节点不影响它。
 *
 * **容器脱流**：容器留在文档流里时，上游渲染进来的那枚锚点包装自带行盒（实测高 18px），
 * 菜单一开就把 `body` 的内容高度顶过视口，冒出的竖直滚动条让 `documentElement.clientWidth`
 * 少 5px，会话区与右侧导航列跟着横向收窄。`position: fixed` 之后它不进滚动溢出区，
 * 零尺寸也不占位；卡片是 portal 出去的、自带定位，不受这里影响。
 */
export const MENU_CSS = `
.${ROOT_CLASS}__host {
  position: fixed;
  top: 0;
  left: 0;
  width: 0;
  height: 0;
}

.${ROOT_CLASS} {
  z-index: 2147483000;
}
`

/** 实例 id 到卡片类名的映射。id 形如 `m1a2b3-x9y8z7`，是合法的 CSS 标识符片段。 */
function ownerClass(owner) {
  return `${ROOT_CLASS}--${owner}`
}

/** 一次打开的菜单的全部输入。`id` 每次打开递增，用来让 React 换掉整棵子树。 */
let current = null
let openSeq = 0

/** 常驻的 root；模块级单例，插件卸载时才拆。 */
let host = null
/** 订阅 `current` 的那棵树。每次开关换一次，值只在开与关之间换。 */
const subscribers = new Set()

/**
 * 关掉当前打开的菜单（没有则什么都不做）。幂等。
 */
export function closeContextMenu() {
  if (current === null) return
  const closing = current
  current = null
  for (const notify of subscribers) notify()
  if (closing.restoreFocus !== undefined) closing.restoreFocus.focus()
}

/** 拆掉 React 树与容器。插件卸载时随 `closeContextMenu` 一起走，之后可再打开。 */
export function disposeContextMenu() {
  closeContextMenu()
  if (host === null) return
  host.root.unmount()
  host.container.remove()
  host = null
  subscribers.clear()
}

/**
 * 开一处菜单。已有一处菜单打开时先关掉它——功能 2 与功能 6 的 `contextmenu` 都挂在
 * `document` 捕获阶段，一次右键只有先跑的那个会走到这里，但重复调用仍要收敛到一张卡片。
 *
 * @param {object} options
 * @param {number} options.x 鼠标点的视口横坐标，菜单钉在这里
 * @param {number} options.y 鼠标点的视口纵坐标
 * @param {import('react').ReactNode} [options.items] data 行
 * @param {import('react').ReactNode} [options.children] 组件行；上游 slot 条目走这里
 * @param {(id: string) => void} [options.onSelect] data 行的选中回调；组件行不经过这里
 * @param {string} [options.owner] 开菜单的实例 id
 * @returns {() => void} 关掉这一处菜单；已被别的菜单顶掉时是空操作
 */
export function openContextMenu({ x, y, items, children, onSelect, owner }) {
  const previous = document.activeElement
  current = {
    id: ++openSeq,
    x,
    y,
    items,
    children,
    onSelect,
    owner,
    // 右键本身不夺焦点，但点菜单项会把焦点带走；关掉之后还给打开前那个元素。
    restoreFocus: previous instanceof HTMLElement ? previous : undefined,
  }
  ensureHost()
  for (const notify of subscribers) notify()
}

/**
 * 懒建常驻的 React 树。
 *
 * root 只建一次、跨菜单复用：每次开关都 `createRoot`/`unmount` 会让 React 在同一帧里
 * 建树又拆树，而菜单是一开一关的高频路径。
 */
function ensureHost() {
  if (host !== null) return
  const container = document.createElement('div')
  container.className = `${ROOT_CLASS}__host`
  document.body.append(container)
  host = { container, root: createRoot(container) }
  host.root.render(createElement(Root))
}

/**
 * 树的顶层：`current` 为空时什么都不渲染。
 *
 * 菜单的开合就是 `current` 这一份值，模块外的 `openContextMenu` / `closeContextMenu`
 * 改它、由 `subscribers` 通知这棵树——不另设一份 state，两处真相就会走散。
 *
 * **为什么是外部 store 而不是 `useState` 加一个模块级的 `setState` 出口**：树是懒建的，
 * 而 `createRoot().render()` 在 React 18 里是异步的——首次打开菜单的那一次，
 * 组件还没渲染，出口还不存在，事件回调就撞上 `undefined`。订阅式没有这个时间窗：读的是
 * 模块级的 `current`，订阅在那棵树渲染之后才建上，而建树与通知都在 `ensureHost` 之后。
 *
 * @returns {import('react').ReactNode}
 */
function Root() {
  const spec = useSyncExternalStore(subscribe, readCurrent)
  return spec === null ? null : createElement(MenuLayer, { key: spec.id, spec })
}

/**
 * 订阅菜单的开关。
 *
 * @param {() => void} notify
 * @returns {() => void} 退订
 */
function subscribe(notify) {
  subscribers.add(notify)
  return () => { subscribers.delete(notify) }
}

/** 树上看到的那份菜单。 */
function readCurrent() {
  return current
}

/**
 * 一处钉在视口坐标上的上游菜单。
 *
 * 坐标直接取自 props 并放进 ref：`getAnchorRect` 每帧被上游调用一次，读到的必须是**打开
 * 那一刻**的坐标，而菜单开着期间不该因为别的原因重算一次树。
 *
 * @param {{ spec: object }} props
 * @returns {import('react').ReactNode}
 */
function MenuLayer({ spec }) {
  const { x, y, items, children, onSelect, owner } = spec
  const point = useRef({ x, y })
  point.current = { x, y }

  const getAnchorRect = useCallback(() => {
    const { x: px, y: py } = point.current
    // 零尺寸矩形 + 默认的 `side: 'bottom'` 让上游把卡片画在点下方；夹边走它的 clamp。
    return {
      x: px, y: py, left: px, top: py, right: px, bottom: py, width: 0, height: 0,
    }
  }, [])

  const close = useCallback(() => closeContextMenu(), [])

  return createElement(Menu, {
    open: true,
    anchor: createElement('span', { className: `${ROOT_CLASS}__anchor`, 'aria-hidden': true }),
    items: items ?? [],
    getAnchorRect,
    portal: true,
    listClassName: owner === undefined ? ROOT_CLASS : `${ROOT_CLASS} ${ownerClass(owner)}`,
    onSelect: onSelect === undefined ? undefined : (id) => { onSelect(id); close() },
    onClose: close,
    children,
  })
}