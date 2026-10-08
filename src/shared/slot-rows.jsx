/**
 * 把上游 `sidebar.workspaces.session.menu.item` 这个 slot 的条目渲染进本插件的菜单。
 *
 * 会话行右键菜单的每一项都**不是本地手写的**：它们是上游 `ui-workspace` 注册进这个
 * list slot 的 React 组件（`packages/client/ui-workspace/src/client/session-actions/`，
 * 注册点 `src/client/index.ts:285-290`）。本模块按上游渲染器（`ui-renderer`）的语义把它们
 * 读出来、装好 props、渲染出来，于是上游给这个 slot 加一项、或改一项的文案与图标，
 * 本地这份菜单自动跟着变，本插件不用改一行。
 *
 * **为什么只能这么取，而不能直接 import 上游组件**：插件能 import 的平台模块只有 9 个
 * seed 词（`packages/client/web/src/seed.ts`），`@deepseek-ai/dsh-client-ui-workspace`
 * 不在其中，也没有任何包的 `dsh.client.external` 声明它，所以 `require` 它会抛
 * `client-modules: require("…") missed the module table`。而 `ctx.slots` 是注入进来的服务，
 * `entriesOfSlot` 读的正是渲染器自己读的那份账（`ui-renderer/src/client/registry.ts:416`
 * 转调 `SlotCore.entriesOfSlot`，实现在 `ui-slots/src/index.ts:1352`）。
 *
 * 本模块照抄的是 `ui-renderer/src/client/scoped-slots.tsx` 的三段语义：
 *   - 条目 props 的拼装顺序（`:622`）：kit → entry inject → slot inject → hookContext 合成
 *     → owner props，**后者覆盖前者**；
 *   - inject 的 `hooks` 舱拆成 `useXxx` 绑定（`:183-202` `bindInjectSources`、`:238-249`
 *     `bindSlotHookFactories`）：键名首字母大写成 `use` 开头；函数值是工厂，其余是
 *     HostObservable，直接绑成选择器 hook；
 *   - 顺序（`ui-slots/src/index.ts:1282`）：list slot 先 `priority` 后 `order`，同级保持
 *     注册序。`entriesOfSlot` 给的是账本序，所以这里再排一次。
 *
 * **条目 inject 原样调用，不碰它闭包里的东西**：上游那四个 inject 里的 `archiveSession`
 * 与 `requestSessionRename` 写的是上游自己的 store，而它们的确认弹窗由应用框架渲染——
 * `ui-layout/src/client/AppFrame.tsx:249` 的 `renderSlot('shell.overlay', {})` 一直挂着
 * `SessionRenameDialog` 与 `SessionArchiveConfirmDialog`。所以「归档活动中的会话要先确认
 * 停掉活动」那条完整链路（当初抄不起的那部分）原样可用，不依赖菜单渲染在哪棵树上。
 *
 * **hook 绑定自己实现**而不是抄上游的 `bind.ts`：上游用
 * `use-sync-external-store/shim/with-selector`，那个包不是 seed 词、也不在本插件的依赖里。
 * `react` 自带的 `useSyncExternalStore` 没有选择器形态，所以这里照它的算法补一层按引用
 * 缓存的 `getSnapshot`——选择器每次调用都可能返回新引用，直接喂给 `useSyncExternalStore`
 * 会因为「快照每次都变」而无限重渲染。
 *
 * `entry.locale` 声明的词典走 `ctx.locale.bind` 现取：上游渲染器靠 `localeSeat`
 * （`scoped-slots.tsx:302`）在每个 `revision` 换一份 `t` 引用来触发重渲染，而本插件的
 * 菜单按「打开那一刻的文案」渲染即可，不需要靠引用变化驱动换语言——用户关掉重开就是新的。
 */
import { Component, Fragment, createElement, useCallback, useMemo, useRef, useSyncExternalStore } from 'react'

/** 上游会话行菜单的 slot 名。 */
export const SESSION_MENU_SLOT = 'sidebar.workspaces.session.menu.item'

/**
 * 此刻那一格 slot 上有几条条目。
 *
 * 读账本而不是读渲染结果：菜单还没开时就要知道「有没有项可给」——没有项就不接管这次
 * 右键（见 `onContextMenu`）。上游那四个条目随 `sidebar.workspaces` 的注册到达后才在
 * 那一格里，真实页面加载完成时早已就位。
 *
 * @param {any} slots 注入进来的 `SlotRegistry`
 * @returns {readonly object[]} 按账本序的条目
 */
export function sessionMenuEntries(slots) {
  return slots.entriesOfSlot(SESSION_MENU_SLOT)
}

/**
 * 选择器版 `useSyncExternalStore`，缓存选择结果到引用稳定为止。
 *
 * @param {{ getSnapshot: () => any, subscribe: (fn: () => void) => () => void }} source
 * @param {(value: any) => any} selector
 * @param {(a: any, b: any) => boolean} isEqual
 * @returns {any}
 */
function useSelector(source, selector, isEqual) {
  const cache = useRef(null)
  const subscribe = useCallback((fn) => source.subscribe(fn), [source])
  const getSnapshot = useCallback(() => {
    const next = selector(source.getSnapshot())
    const held = cache.current
    if (held !== null && isEqual(held, next)) return held
    cache.current = next
    return next
  }, [source, selector, isEqual])
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * 一个 HostObservable 绑成选择器 hook（对应上游 `observableHook`）。
 *
 * 每次调用**新建**一个 hook 而不按 source 缓存：缓存要跨组件实例共享 hook，而本插件这些
 * hook 只在一条菜单里用一次，`useRef` 缓存的 `getSnapshot` 已经挡住了重渲染。
 *
 * @param {{ getSnapshot: () => any, subscribe: (fn: () => void) => () => void } | undefined} source
 * @returns {(selector: (value: any) => any) => any}
 */
function observableHook(source) {
  if (source === undefined) return () => undefined
  return (selector) => useSelector(source, selector, Object.is)
}

/** `hooks` 舱的键名变成 prop 名：`pinned` → `usePinned`。 */
function hookPropName(name) {
  return `use${name[0]?.toUpperCase() ?? ''}${name.slice(1)}`
}

/**
 * 把一份 inject face 拆成 props 与工厂两半。对应上游 `cachedSlotInject`
 * （`scoped-slots.tsx:208-235`）。
 *
 * @param {object | undefined | null} face
 * @returns {{ props: object, factories: Record<string, Function> }}
 */
function splitInject(face) {
  const props = {}
  const factories = {}
  if (face === undefined || face === null) return { props, factories }
  for (const [key, value] of Object.entries(face)) {
    if (key !== 'hooks') {
      props[key] = value
      continue
    }
    for (const [name, member] of Object.entries(value ?? {})) {
      if (typeof member === 'function') factories[name] = member
      else props[hookPropName(name)] = observableHook(member)
    }
  }
  return { props, factories }
}

/**
 * 一个条目的错误边界。
 *
 * 上游把每个条目 occurrence 包在 `SlotErrorBoundary` 里（`scoped-slots.tsx:404-420`）：一个
 * 条目崩了只是它自己消失并报一行 `console.error`，菜单里其余条目照常可用。菜单是功能 2
 * 唯一的交互入口，让一个条目的异常把整棵树带走是不可接受的，所以照抄这道边界。
 */
class EntryBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { crashed: false }
  }

  static getDerivedStateFromError() {
    return { crashed: true }
  }

  componentDidCatch(error) {
    console.error(`[@Tinnikx/dsh-operation-improve] menu item crashed in '${SESSION_MENU_SLOT}':`, error)
  }

  render() {
    if (this.state.crashed) return null
    return this.props.children
  }
}

/**
 * 一条菜单项：装好 props 渲染上游组件。
 *
 * @param {object} props
 * @param {object} props.entry `StoredEntry`：`component` / `options` / `inject` / `locale`
 * @param {object} props.standard 根标准源，投影成 `useXxx`
 * @param {object} props.slotInject slot 级 inject face
 * @param {unknown} props.hookContext 传给 slot 级 hook 工厂的不透明上下文
 * @param {(ns: string) => Function} props.translate 词典绑定
 * @param {object} props.ownerProps slot 的 owner props，这一格是 `{sessionId, displayTitle}`
 * @returns {import('react').ReactNode}
 */
function SlotRow({ entry, standard, slotInject, hookContext, translate, ownerProps }) {
  const Comp = entry.component
  const { props: injected, factories: entryFactories } = splitInject(entry.inject?.())
  const { props: slotProps, factories: slotFactories } = splitInject(slotInject)
  const contextual = {}
  for (const [name, factory] of Object.entries({ ...slotFactories, ...entryFactories })) {
    contextual[hookPropName(name)] = factory(standard, hookContext)
  }
  const kit = {}
  if (entry.locale !== undefined) kit.t = translate(entry.locale)
  if (entry.store !== undefined) {
    kit.useStore = observableHook(entry.store)
    kit.actions = entry.store.actions
  }
  return createElement(EntryBoundary, null,
    createElement(Comp, { ...kit, ...injected, ...slotProps, ...contextual, ...ownerProps }))
}

/** 条目表按元素比较：`entriesOfSlot` 每次调用新建数组，比引用会永远判成「变了」。 */
function sameEntries(a, b) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/**
 * 上游 slot 的全部条目，按上游顺序渲染成 `Menu` 的组件行。
 *
 * `Menu` 的 `children` 与 data `items` 同在一张列表里（`Menu.tsx:154-157`），共享键盘
 * 游走、子菜单互斥与选中后归焦，所以两种行混排不需要额外处理。
 *
 * 条目表随 `ctx.slots` 的通知刷新：上游那四个注册随浏览器那一格声明的生灭而来去（上游注释
 * 说「the entries leave with it」），菜单开着时增删要立刻反映出来。
 *
 * @param {object} props
 * @param {any} props.deps 功能 2 那一组依赖，整份传给条目渲染：`slots` 读表、`shortcuts`
 *   是快捷键提示的源、`locale` 给词典、`workspaces.list` 是置顶/归档态的源
 * @param {string} props.sessionId 目标会话，条目按它读状态、也按它执行动作
 * @param {string} props.displayTitle 行上显示的标题，重命名对话框的初值
 * @param {unknown} props.hookContext 菜单开关这一对（`MenuOpenState`）
 * @returns {import('react').ReactNode}
 */
export function SessionMenuRows({ deps, sessionId, displayTitle, hookContext }) {
  const readEntries = useCallback(() => [...deps.slots.entriesOfSlot(SESSION_MENU_SLOT)]
    .sort((a, b) => (a.options?.priority ?? 0) - (b.options?.priority ?? 0)
      || (a.options?.order ?? 0) - (b.options?.order ?? 0)), [deps])

  const source = useMemo(() => ({
    getSnapshot: readEntries,
    subscribe: (fn) => deps.slots.subscribe(SESSION_MENU_SLOT, fn),
  }), [deps, readEntries])

  const entries = useSelector(source, readEntries, sameEntries)

  const standard = useMemo(() => ({ useWorkspaces: observableHook(deps.workspaces?.list) }), [deps])
  const slotInject = useMemo(() => ({
    hooks: {
      // 上游 `menuOpenStateFactory`（`ui-workspace/src/client/contract/slots.ts:101`）是
      // **双层**的：`(_standard, state) => () => state`。渲染器把工厂的返回值当 hook 用
      // （`scoped-slots.tsx:249`：`bound['use' + Cap(name)] = factory(standard, hookContext)`），
      // 所以这里也必须返回函数而不是 hookContext 本身——少了这一层，条目里的
      // `useMenuOpenState()` 就是在对一个数组调调用。
      menuOpenState: () => () => hookContext,
      shortcuts: deps.shortcuts?.catalog,
    },
  }), [deps, hookContext])
  const translate = useCallback((ns) => deps.locale.bind(ns), [deps])

  const ownerProps = useMemo(() => ({ sessionId, displayTitle }), [sessionId, displayTitle])

  return createElement(Fragment, null, entries.map((entry) => createElement(SlotRow, {
    key: `${entry.registrant ?? ''}:${entry.options?.id ?? ''}`,
    entry,
    standard,
    slotInject,
    hookContext,
    translate,
    ownerProps,
  })))
}