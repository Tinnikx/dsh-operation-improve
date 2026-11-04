/**
 * `@Tinnikx/dsh-operation-improve` — client 入口。
 *
 * DOM 增强：侧边栏的 ctrl/cmd 多选（限同级），页面任意选中文本上的右键菜单，
 * 会话页逐行的开始时间戳，对话历史导航（上下键翻阅历史问题），以及
 * `Ctrl`/`cmd` + `F` 的页内查找条。多选与行 id 反查共享 `src/shared/` 下的选择
 * 状态 store；选中文本菜单与其余几项各自成块，只读页面已有的 DOM 与 fiber。
 *
 * 侧边栏行的右键菜单由 harness 自带：`ui-workspace` 给工作区行与会话行都绑了
 * 原生菜单，本插件不接管侧边栏的 `contextmenu`。
 *
 * 不占任何 slot：功能只在既有 DOM 上加监听，视觉走自插的一张样式表；
 * 所有副作用都注册到 `ctx.effect`，插件卸载即回收。
 *
 * 同一张样式表里还带四项纯样式覆盖：`src/active-dot/` 改上游活跃标记的配色，
 * `src/think-scroll/` 给展开后的思考正文一条高度上限与滚动条，`src/row-states/`
 * 强化侧边栏会话行的选中态并给运行中的行加扫光边框，`src/provider-heading/`
 * 给模型下拉里的厂商分组标题一条常态区分带。四者都无监听也无
 * `dispose`——摘掉样式表就还原。排列顺序只对 `src/provider-heading/` 自己内部那两条
 * 有约束（钉住态那条必须写在常态那条之后，靠后者覆盖前者的 `background-color`），
 * 与其余各段互不干涉。功能 11 的命中高亮不在这张常驻表里：那两条 `::highlight()`
 * 由 `src/find/` 在有命中时按需挂到 `<head>`，避免常驻规则让每次选区变化多解析一轮
 * 高亮样式（实测三击选中多一个 60Hz 帧档）。
 *
 * 唯一占 slot 的是设置页「通用设置」里的「Harness 高级配置」一行（`src/client/settings/`，
 * 功能 8），它读写 host 半边挂的那条回环路由。
 */
import { createSelectionStore } from '../shared/selection-store.js'
import { MENU_CSS, closeContextMenu, disposeContextMenu } from '../shared/menu.jsx'
import { installLocale } from '../shared/locale.js'
import { installMultiSelect } from '../multi-select/index.js'
import { installSelectionMenu } from '../selection-menu/index.js'
import { installTimestamps, TIMESTAMP_CSS } from '../timestamps/index.js'
import { ACTIVE_DOT_CSS } from '../active-dot/index.js'
import { THINK_SCROLL_CSS } from '../think-scroll/index.js'
import { ROW_STATES_CSS } from '../row-states/index.js'
import { PROVIDER_HEADING_CSS } from '../provider-heading/index.js'
import { installFind, FIND_CSS } from '../find/index.js'
import { installHarnessConfigRow, SETTINGS_CSS } from './settings/index.jsx'
import { installChatHistory } from '../chat-history/index.js'
import { installAutoLoadOlder } from '../auto-load-older/index.js'

export const name = '@Tinnikx/dsh-operation-improve'
export const inject = ['workspaces', 'sessions', 'locale', 'slots']

/** 全局共享的选择状态：多选写、调试句柄读。 */
export const selection = createSelectionStore()

/**
 * 装上全部功能。
 *
 * 副作用全部注册到 `ctx.effect`，同时挂一份到 `window.__dshOperationImprove__`：
 * `{ instanceId, selection, timestamps, chatHistory, autoLoadOlder, find, multiSelect,
 * selectionMenu, harnessConfig, locale, services, stylesheet, dispose }`。
 * 每个功能项都带幂等 `dispose()`，句柄自己的 `dispose()` 停掉整份实例并摘掉句柄。
 *
 * @param {any} ctx
 */
export function apply(ctx) {
  // 每份实例一个 id。选中文本菜单的卡片在 `document.body` 下，所以它以类名
  // `dsh-oi-menu--<id>` 标在那张卡片上；查找条这类还在本插件 DOM 子树里的浮层则用
  // `data-dsh-oi-owner`。页面上并存两份实例时，选不出「这个菜单是谁开的」就可能把
  // 点击打在另一份实例的真服务上。
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const style = document.createElement('style')
  style.dataset.plugin = name
  style.textContent = [ROW_STATES_CSS, PROVIDER_HEADING_CSS, MENU_CSS, TIMESTAMP_CSS, ACTIVE_DOT_CSS, THINK_SCROLL_CSS, SETTINGS_CSS, FIND_CSS].join('\n')
  document.head.append(style)
  ctx.effect(() => () => style.remove(), '@Tinnikx/dsh-operation-improve: stylesheet')

  const disposeMultiSelect = installMultiSelect({ store: selection })
  ctx.effect(() => disposeMultiSelect, '@Tinnikx/dsh-operation-improve: multi-select')

  const locale = installLocale(ctx)
  ctx.effect(() => locale.dispose, '@Tinnikx/dsh-operation-improve: dictionaries')

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

  const autoLoadOlder = installAutoLoadOlder()
  ctx.effect(() => autoLoadOlder.dispose, '@Tinnikx/dsh-operation-improve: auto load older')

  const find = installFind({ tOwn: locale.tOwn, owner: instanceId })
  ctx.effect(() => find.dispose, '@Tinnikx/dsh-operation-improve: find in page')

  // 调试与验证入口：让外部（CDP / 控制台）观察选择集、也**停得掉这一份实例**，
  // 无需读私有闭包。
  //
  // 每一项功能都列在这里、并给整份实例一条 `dispose()`，是验证脚本的硬需求：插件
  // 装进 profile 之后页面每次加载都自带一份实例，脚本再注入一份就是两份互不知情
  // 地抢同一批 DOM——**同一处会弹出两张卡片，而 `querySelector` 拿到的是先注册的
  // 那个**，脚本以为点的是自己的 spy，实际点在真服务上。只暴露一部分功能等于让脚本
  // 停不干净，那正是把真会话归档掉的路径。
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
    autoLoadOlder,
    harnessConfig,
    find,
    multiSelect: { dispose: disposeMultiSelect },
    selectionMenu: { dispose: disposeSelectionMenu },
    // `tCommon` / `tOwn` 是插件文案的唯一来源，暴露出来让脚本读到**页面真实 locale
    // 服务**给出的那份文本；注入式验证造的是自己的 ctx，不借这一份就只能拿桩数据对断言。
    // `dispose` 摘掉本插件的词典注册——不摘的话下一次 apply 会撞上「同一个 namespace
    // 的同一个 locale 注册两次」而抛。
    locale: { tCommon: locale.tCommon, tOwn: locale.tOwn, dispose: locale.dispose },
    // 真服务的只读引用：实测脚本要自建可丢弃的靶子工作区（只对靶子做增删，跑完删
    // 干净），会话那一支则靠这些真服务读状态与反查标题，而页面上拿得到真服务的唯一
    // 入口就是这个句柄。
    // **只引用，不接管**：dispose 不碰它们，那是 harness 自己的生命周期。
    services: {
      workspaces: ctx.workspaces,
      sessions: ctx.sessions,
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
      autoLoadOlder.dispose()
      chatHistory.dispose()
      harnessConfig.dispose()
      timestamps.dispose()
      disposeSelectionMenu()
      // 选中文本菜单停了才轮到拆那棵共用的 React 树——顺序反了会在 dispose 途中
      // 留下一张开着的卡片。
      disposeContextMenu()
      disposeMultiSelect()
      locale.dispose()
      style.remove()
      delete window[globalKey]
    },
  }
  ctx.effect(() => () => { delete window[globalKey] }, '@Tinnikx/dsh-operation-improve: debug handle')
}
