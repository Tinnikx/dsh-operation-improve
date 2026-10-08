/**
 * `@Tinnikx/dsh-operation-improve` — client 入口。
 *
 * DOM 增强：侧边栏的 ctrl/cmd 多选（限同级）与右键菜单，页面任意选中文本上的
 * 右键菜单，会话页逐行的开始时间戳，对话历史导航（上下键翻阅历史问题），以及
 * `Ctrl`/`cmd` + `F` 的页内查找条。多选、两处右键菜单与行 id 反查共享
 * `src/shared/` 下的选择状态 store、上游菜单外壳与词典；其余几项各自成块，只读
 * 页面已有的 DOM 与 fiber。
 *
 * 不占任何 slot：功能只在既有 DOM 上加监听，视觉走自插的一张样式表；
 * 所有副作用都注册到 `ctx.effect`，插件卸载即回收。
 *
 * 同一张样式表里还带三项纯样式覆盖：`src/active-dot/` 改上游活跃标记的配色，
 * `src/think-scroll/` 给展开后的思考正文一条高度上限与滚动条，`src/row-states/`
 * 强化侧边栏会话行的选中态并给运行中的行加扫光边框。三者都无监听也无
 * `dispose`——摘掉样式表就还原。FIND_CSS 的约束在表内自己那两行：两条
 * `::highlight()` 的先后就是叠放绘序，当前项要画在全部命中之上。
 *
 * 唯一占 slot 的是设置页「通用设置」里的「Harness 高级配置」一行（`src/client/settings/`，
 * 功能 8），它读写 host 半边挂的那条回环路由。
 */
import { createSelectionStore } from '../shared/selection-store.js'
import { MENU_CSS, closeContextMenu, disposeContextMenu } from '../shared/menu.jsx'
import { installLocale } from '../shared/locale.js'
import { installMultiSelect } from '../multi-select/index.js'
import { installContextMenu } from '../context-menu-feature/index.js'
import { installSelectionMenu } from '../selection-menu/index.js'
import { installTimestamps, TIMESTAMP_CSS } from '../timestamps/index.js'
import { ACTIVE_DOT_CSS } from '../active-dot/index.js'
import { THINK_SCROLL_CSS } from '../think-scroll/index.js'
import { ROW_STATES_CSS } from '../row-states/index.js'
import { installFind, FIND_CSS } from '../find/index.js'
import { installHarnessConfigRow, SETTINGS_CSS } from './settings/index.jsx'
import { installChatHistory } from '../chat-history/index.js'

export const name = '@Tinnikx/dsh-operation-improve'
/**
 * `shortcuts` 是会话行菜单那三个条目（重命名 / 分叉 / 归档）上快捷键提示的源，上游注册在
 * `ui-workspace/src/client/shortcuts.ts:96/101/115`，走的是 `ctx.shortcuts.catalog` 这一格。
 * 它不在 `cordis-client-runner` 声明的 SERVICE_API（`api-catalog.ts:85-398` 只列了
 * layout / locale / sessions / slots / theme / timer / uiWorkspace / workspaces）里，但那是
 * 给**其它插件**看的白名单；本插件自己 inject 什么由自己的 `inject` 决定。
 */
export const inject = ['workspaces', 'sessions', 'locale', 'slots', 'shortcuts']

/** 全局共享的选择状态：多选写、右键菜单读。 */
export const selection = createSelectionStore()

/**
 * 装上五项功能。
 *
 * 副作用全部注册到 `ctx.effect`，同时挂一份到 `window.__dshOperationImprove__`：
 * `{ instanceId, selection, timestamps, chatHistory, find, multiSelect, contextMenu,
 * selectionMenu, harnessConfig, locale, services, stylesheet, dispose }`。
 * 每个功能项都带幂等 `dispose()`，句柄自己的 `dispose()` 停掉整份实例并摘掉句柄。
 *
 * @param {any} ctx
 */
export function apply(ctx) {
  // 每份实例一个 id。菜单卡片在 `document.body` 下，所以它以类名 `dsh-oi-menu--<id>`
  // 标在那张卡片上；查找条这类还在本插件 DOM 子树里的浮层则用 `data-dsh-oi-owner`。
  // 页面上并存两份实例时，选不出「这个菜单是谁开的」就可能把点击打在另一份实例的
  // 真服务上。
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const style = document.createElement('style')
  style.dataset.plugin = name
  style.textContent = [ROW_STATES_CSS, MENU_CSS, TIMESTAMP_CSS, ACTIVE_DOT_CSS, THINK_SCROLL_CSS, SETTINGS_CSS, FIND_CSS].join('\n')
  document.head.append(style)
  ctx.effect(() => () => style.remove(), '@Tinnikx/dsh-operation-improve: stylesheet')

  const disposeMultiSelect = installMultiSelect({ store: selection })
  ctx.effect(() => disposeMultiSelect, '@Tinnikx/dsh-operation-improve: multi-select')

  const locale = installLocale(ctx)
  ctx.effect(() => locale.dispose, '@Tinnikx/dsh-operation-improve: dictionaries')

  const disposeMenu = installContextMenu({
    store: selection,
    workspaces: ctx.workspaces,
    // 渲染上游 slot 条目要用的三格上下文：`slots.entriesOfSlot` 读条目表，
    // `shortcuts.catalog` 是条目上那枚快捷键提示的源，`locale.bind` 给条目投影词典。
    slots: ctx.slots,
    shortcuts: ctx.shortcuts,
    locale: ctx.locale,
    // 上游 `UiWorkspaceService`——工作区行「新会话」那一项走的 `startSession`，与行
    // hover 时那枚按钮同一个服务。**不列进 `inject`**：那个名字由上游的
    // `super(ctx, "uiWorkspace")` 定，不在本插件的类型面上；`ctx.get` 对未列进 inject
    // 的名字照样返回（见 cordis `ReflectService.get`），拿不到也只是那一项缺席。
    getUiWorkspace: () => ctx.get('uiWorkspace'),
    t: locale.t,
    tOwn: locale.tOwn,
    owner: instanceId,
  })
  // 功能 2 的停用只关菜单、不拆 React 树：那棵树是模块级单例，功能 6 还在用它。
  const disposeFeatureMenu = () => {
    disposeMenu()
    closeContextMenu()
  }
  ctx.effect(() => disposeFeatureMenu, '@Tinnikx/dsh-operation-improve: context menu')

  const disposeSelection = installSelectionMenu({
    tCommon: locale.tCommon,
    tOwn: locale.tOwn,
    owner: instanceId,
  })
  const disposeSelectionMenu = () => {
    disposeSelection()
    closeContextMenu()
  }
  ctx.effect(() => disposeSelectionMenu, '@Tinnikx/dsh-operation-improve: selection menu')

  const timestamps = installTimestamps()
  ctx.effect(() => timestamps.dispose, '@Tinnikx/dsh-operation-improve: timestamps')

  const harnessConfig = installHarnessConfigRow(ctx)
  ctx.effect(() => harnessConfig.dispose, '@Tinnikx/dsh-operation-improve: harness config row')

  const chatHistory = installChatHistory()
  ctx.effect(() => chatHistory.dispose, '@Tinnikx/dsh-operation-improve: chat history')

  const find = installFind({ tOwn: locale.tOwn, owner: instanceId })
  ctx.effect(() => find.dispose, '@Tinnikx/dsh-operation-improve: find in page')

  // 调试与验证入口：让外部（CDP / 控制台）观察选择集、也**停得掉这一份实例**，
  // 无需读私有闭包。
  //
  // 每一项功能都列在这里、并给整份实例一条 `dispose()`，是验证脚本的硬需求：插件
  // 装进 profile 之后页面每次加载都自带一份实例，脚本再注入一份就是两份互不知情
  // 地抢同一批 DOM——**右键会弹出两个菜单，而 `querySelector` 拿到的是先注册的那
  // 个（native）**，脚本以为点的是自己的 spy，实际点在真服务上。只暴露一部分功能
  // 等于让脚本停不干净，那正是把真会话归档掉的路径。
  //
  // 每条 `dispose` 都幂等，所以句柄上调过之后 `ctx.effect` 再调一次是安全的。
  //
  // `services` 是真服务的只读引用，不随 dispose 消失：实测脚本建靶子要用它，而靶子
  // 归 harness 管，不归这份实例管。
  const globalKey = '__dshOperationImprove__'
  window[globalKey] = {
    instanceId,
    selection,
    timestamps,
    chatHistory,
    harnessConfig,
    find,
    multiSelect: { dispose: disposeMultiSelect },
    contextMenu: { dispose: disposeFeatureMenu },
    selectionMenu: { dispose: disposeSelectionMenu },
    // `t` / `tCommon` / `tOwn` 是菜单文案的唯一来源，暴露出来让脚本读到**页面真实 locale
    // 服务**给出的那份文本；注入式验证造的是自己的 ctx，不借这一份就只能拿桩数据对断言。
    // `dispose` 摘掉本插件的词典注册——不摘的话下一次 apply 会撞上「同一个 namespace
    // 的同一个 locale 注册两次」而抛。
    locale: { t: locale.t, tCommon: locale.tCommon, tOwn: locale.tOwn, dispose: locale.dispose },
    // 真服务的只读引用：实测脚本要自建可丢弃的靶子工作区（点「删除工作区」「批量删除」
    // 这类项只对靶子点，跑完删干净），会话那一支则靠这些真服务读状态与反查标题，
    // 而页面上拿得到真服务的唯一入口就是这个句柄。
    // **只引用，不接管**：dispose 不碰它们，那是 harness 自己的生命周期。
    services: {
      workspaces: ctx.workspaces,
      sessions: ctx.sessions,
      slots: ctx.slots,
      // 会话行菜单那三枚快捷键提示的源，断言「提示取自上游 catalog」时要用它对齐
      // `session.rename` / `session.fork` / `session.archive` 三个 id 各自那一行。
      shortcuts: ctx.shortcuts,
      // 主题服务：验证脚本要对比浅色/深色两档的菜单描边色，而描边档位来自 `body`
      // 上的**内联** CSS 变量（`ThemePresenter.apply()` 写上去的），改
      // `data-ds-dark-theme` 属性推不动它——只有真服务 `setTheme` 会重写那些变量。
      // getter 而非快照，也因此不必把 `theme` 加进 `inject`：本插件自己不读它。
      get theme() { return ctx.get('theme') },
      // getter 而非快照：服务是可能被替换的（`uiWorkspace` 由上游那条 `super(ctx,
      // 'uiWorkspace')` 装上，插件 apply 前后都可能装）。快照会让靶子脚本拿到一个
      // 已经不在服务表上的旧对象。
      get uiWorkspace() { return ctx.get('uiWorkspace') },
    },
    stylesheet: { dispose: () => style.remove() },
    dispose: () => {
      find.dispose()
      chatHistory.dispose()
      harnessConfig.dispose()
      timestamps.dispose()
      disposeSelectionMenu()
      disposeFeatureMenu()
      // 功能 2 与功能 6 都停了，才轮到拆那棵共用的 React 树——顺序反了会在
      // dispose 途中留下一张开着的卡片。
      disposeContextMenu()
      disposeMultiSelect()
      locale.dispose()
      style.remove()
      delete window[globalKey]
    },
  }
  ctx.effect(() => () => { delete window[globalKey] }, '@Tinnikx/dsh-operation-improve: debug handle')
}
