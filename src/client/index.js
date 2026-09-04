/**
 * `@Tinnikx/dsh-operation-improve` — client 入口。
 *
 * 四项 DOM 增强：侧边栏的 ctrl/cmd 多选（限同级）与右键菜单，页面任意选中文本上的
 * 右键菜单，以及会话页逐行的开始时间戳。前三项共享 `src/shared/` 下的选择状态
 * store、行 id 反查、通用菜单组件与词典；最后一项成块，只读对话页的 DOM 与 fiber。
 *
 * 不占任何 slot：功能只在既有 DOM 上加监听，视觉走自插的一张样式表；
 * 所有副作用都注册到 `ctx.effect`，插件卸载即回收。
 *
 * 同一张样式表里还带两项纯样式覆盖：`src/active-dot/` 改上游活跃标记的配色，
 * `src/think-scroll/` 给展开后的思考正文一条高度上限与滚动条。两者都无监听也无
 * `dispose`——摘掉样式表就还原。
 *
 * 唯一占 slot 的是设置页「通用设置」里的「Harness 高级配置」一行（`src/client/settings/`，
 * 功能 8），它读写 host 半边挂的那条回环路由。
 */
import { createSelectionStore } from '../shared/selection-store.js'
import { MENU_CSS, closeContextMenu } from '../shared/context-menu.js'
import { installLocale } from '../shared/locale.js'
import { installMultiSelect } from '../multi-select/index.js'
import { installContextMenu } from '../context-menu-feature/index.js'
import { installSelectionMenu } from '../selection-menu/index.js'
import { installTimestamps, TIMESTAMP_CSS } from '../timestamps/index.js'
import { ACTIVE_DOT_CSS } from '../active-dot/index.js'
import { THINK_SCROLL_CSS } from '../think-scroll/index.js'
import { installHarnessConfigRow, SETTINGS_CSS } from './settings/index.jsx'

export const name = '@Tinnikx/dsh-operation-improve'
export const inject = ['workspaces', 'sessions', 'locale', 'slots']

/** 全局共享的选择状态：多选写、右键菜单读。 */
export const selection = createSelectionStore()

/**
 * 装上五项功能。
 *
 * 副作用全部注册到 `ctx.effect`，同时挂一份到 `window.__dshOperationImprove__`：
 * `{ instanceId, selection, timestamps, multiSelect, contextMenu, selectionMenu,
 * harnessConfig, locale, stylesheet, dispose }`。
 * 每个功能项都带幂等 `dispose()`，句柄自己的 `dispose()` 停掉整份实例并摘掉句柄。
 *
 * @param {any} ctx
 */
export function apply(ctx) {
  // 每份实例一个 id，标在它开出来的每个菜单上（`data-dsh-oi-owner`）。页面上并存
  // 两份实例时，光靠类名选不出「这个菜单是谁开的」，而选错就是把点击打在另一份
  // 实例的真服务上。
  const instanceId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

  const style = document.createElement('style')
  style.dataset.plugin = name
  style.textContent = [MENU_CSS, TIMESTAMP_CSS, ACTIVE_DOT_CSS, THINK_SCROLL_CSS, SETTINGS_CSS].join('\n')
  document.head.append(style)
  ctx.effect(() => () => style.remove(), '@Tinnikx/dsh-operation-improve: stylesheet')

  const disposeMultiSelect = installMultiSelect({ store: selection })
  ctx.effect(() => disposeMultiSelect, '@Tinnikx/dsh-operation-improve: multi-select')

  const locale = installLocale(ctx)
  ctx.effect(() => locale.dispose, '@Tinnikx/dsh-operation-improve: dictionaries')

  const disposeMenu = installContextMenu({
    store: selection,
    workspaces: ctx.workspaces,
    sessions: ctx.sessions,
    t: locale.t,
    tOwn: locale.tOwn,
    owner: instanceId,
  })
  const disposeContextMenu = () => {
    disposeMenu()
    closeContextMenu()
  }
  ctx.effect(() => disposeContextMenu, '@Tinnikx/dsh-operation-improve: context menu')

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

  // 调试与验证入口：让外部（CDP / 控制台）观察选择集、也**停得掉这一份实例**，
  // 无需读私有闭包。
  //
  // 五项功能全部列在这里、并给整份实例一条 `dispose()`，是验证脚本的硬需求：插件
  // 装进 profile 之后页面每次加载都自带一份实例，脚本再注入一份就是两份互不知情
  // 地抢同一批 DOM——**右键会弹出两个菜单，而 `querySelector` 拿到的是先注册的那
  // 个（native）**，脚本以为点的是自己的 spy，实际点在真服务上。只暴露一部分功能
  // 等于让脚本停不干净，那正是把真会话归档掉的路径。
  //
  // 每条 `dispose` 都幂等，所以句柄上调过之后 `ctx.effect` 再调一次是安全的。
  const globalKey = '__dshOperationImprove__'
  window[globalKey] = {
    instanceId,
    selection,
    timestamps,
    harnessConfig,
    multiSelect: { dispose: disposeMultiSelect },
    contextMenu: { dispose: disposeContextMenu },
    selectionMenu: { dispose: disposeSelectionMenu },
    // `t` / `tCommon` / `tOwn` 是菜单文案的唯一来源，暴露出来让脚本读到**页面真实 locale
    // 服务**给出的那份文本；注入式验证造的是自己的 ctx，不借这一份就只能拿桩数据对断言。
    // `dispose` 摘掉本插件的词典注册——不摘的话下一次 apply 会撞上「同一个 namespace
    // 的同一个 locale 注册两次」而抛。
    locale: { t: locale.t, tCommon: locale.tCommon, tOwn: locale.tOwn, dispose: locale.dispose },
    stylesheet: { dispose: () => style.remove() },
    dispose: () => {
      harnessConfig.dispose()
      timestamps.dispose()
      disposeSelectionMenu()
      disposeContextMenu()
      disposeMultiSelect()
      locale.dispose()
      style.remove()
      delete window[globalKey]
    },
  }
  ctx.effect(() => () => { delete window[globalKey] }, '@Tinnikx/dsh-operation-improve: debug handle')
}
