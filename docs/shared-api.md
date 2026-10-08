# 基础层 API 与调试句柄

`src/shared/` 下四个模块，功能 1、2、6 共用；调试句柄由 client 入口挂出，五个验证脚本都依赖它。

## `src/shared/selection-store.js`

```js
createSelectionStore() -> {
  getKind(): 'session' | 'workspace' | null
  getIds(): string[]
  has(kind, id): boolean
  size(): number
  toggle(kind, id): void     // kind 与当前不同 → 先清空再放入该 id
  set(kind, ids): void       // ids 为空数组 → kind 回到 null
  clear(): void
  subscribe(fn): () => void  // 每次变化后同步调用；返回幂等取消订阅
}
```

集合空时 `kind` 必定为 `null`。store 不碰 DOM，视觉由订阅者负责。

## `src/shared/menu.jsx`

```js
openContextMenu({ x, y, items?, children?, onSelect?, owner? })
closeContextMenu()                    // 关掉当前菜单（幂等）
disposeContextMenu()                  // 拆掉 React 树与容器，之后可再打开
ROOT_CLASS                            // 'dsh-oi-menu'，卡片与查询入口的类名
OWNER_ATTR                            // 'data-dsh-oi-owner'，标在本插件自己的容器与查找条上
MENU_CSS                              // 卡片一条 z-index，常驻容器一条脱流
```

卡片是上游 `@deepseek-ai/dsh-client-ui-primitives` 的 `Menu`，由本插件 `createRoot` 出的常驻 React 树渲染并 portal 到 `document.body`。`items` 是 data 行（`{ id, label, icon?, danger?, disabled?, separatorBefore? }`，`icon` 传 React 节点），`children` 是组件行——上游 slot 条目走这一路，键盘 walk 与子菜单互斥与 `items` 同表共用。`onSelect` 只对 data 行触发，组件行的关闭归条目自己（上游四个条目的写法）。

**右键坐标经 `getAnchorRect` 交给上游定位**，本插件不复制任何定位代码：上游 `Menu` 是 anchor 驱动的受控组件，右键没有触发元素，而 `getAnchorRect` 正是它为「触发器不在自己子树里」留的口子（见 [../src/shared/menu.jsx](../src/shared/menu.jsx) 的头注释）。视口夹边、每帧与 scroll/resize 重算、`Esc` / 外部 `pointerdown` / `blur` 关闭、键盘 walk 全部走上游那份实现。

**常驻容器必须脱离文档流。** `openContextMenu` 懒建一枚 `div.dsh-oi-menu__host` 并 `append` 到 `document.body` 末尾，`createRoot` 只建一次、跨菜单复用；`MENU_CSS` 因此带一条 `.dsh-oi-menu__host { position: fixed; width: 0; height: 0 }`。原因：上游把 `anchor` **原地**渲染进这棵树，外层那枚包装自带行盒（实测 18px），容器留在流里时菜单一开就把 `body` 内容高度顶过视口，冒出一条竖直滚动条——`documentElement.clientWidth` 少掉滚动条宽度，会话区与右侧导航列横向收窄，用户看到的就是整页跳动。`position: fixed` 的元素不进滚动溢出区，零尺寸也不占位。这条由 `verify` 的 `opening the menu does not shift the page geometry` 守着。

同时只存在一张卡片，再次 `open` 先关旧的。`owner` 是开菜单的实例 id，以 `dsh-oi-menu--<id>` 这个**类名**编进卡片（`listClassName` 是唯一能作用于 portaled list 的样式钩子）；卡片在 `document.body` 下、不在本插件的 DOM 子树里，按属性查不到它，所以判归属只能认这个类名。

## `src/shared/slot-rows.jsx`

```js
SESSION_MENU_SLOT                                   // 'sidebar.workspaces.session.menu.item'
sessionMenuEntries(slots) -> readonly StoredEntry[]
SessionMenuRows({ deps, sessionId, displayTitle, hookContext })
```

会话单选时把上游注册在这个 slot 上的全部条目渲染成菜单行，所以**上游加选项本地自动有**，本插件不抄项集合。条目按 `options.order` 排序（照抄上游渲染器那两行排序，不另发明规则）。`deps` 要 `slots`、`locale`（`bind(ns)` 给条目投影词典）、`shortcuts`（`catalog` 是条目上快捷键提示的源）、`workspaces`。

渲染侧照抄上游 `ui-renderer` 的两段语义：`inject` 里 `hooks` 舱的**函数值**当工厂调用、其余（`HostObservable`）绑成 `useXxx` 供条目调用；条目外面包一层错误边界，一个条目崩了只少它自己那一行，不带走整张菜单。slot 级注入的 `menuOpenState` 是**双层柯里化**的 `() => () => hookContext`——少一层，条目里的 `useMenuOpenState()` 就是在对数组调调用。

## `src/shared/row-probe.js`

```js
rowKind(el): 'session' | 'workspace' | null   // 按类名判定
closestRow(target): { element, kind } | null  // 从事件目标向上找行
rowId(el, kind): string | null                // React fiber 反查，失败返回 null
rowTitle(el, kind): string                    // 同上，取上游对话框的初值字段，失败返回 ''
allRows(scope): HTMLElement[]
```

`rowId` 走 React fiber 反查（读行元素上的 `__reactFiber$*` 字段往上找承载 id 的 props），已在真实页面实测可用；**任何反查失败都返回 `null`，调用方必须当作「这一行不可操作」跳过，不得抛错打断页面**。`rowTitle` 同一条路径，取的是上游那两个对话框各自的初值字段（会话 `row.title`、工作区 `group.label`），反查不到退回行内标题 span 的文本，**绝不退回整行 `textContent`**——会话行里连着状态点与相对时间，那串塞进重命名输入框就是「改点什么3 分钟前」。

## `src/shared/locale.js`

```js
installLocale(ctx) -> { t(key, params?), tCommon(key, params?), tOwn(key, params?), dispose() }
UPSTREAM_NS   // 'workspace'，上游 ui-workspace 拥有
COMMON_NS     // 'common'，harness 的公共词典
OWN_NS        // '@Tinnikx/dsh-operation-improve'
```

`t` 查上游 `workspace` 词典，`tCommon` 查 harness 的 common 词典（「复制」就在这一份里），`tOwn` 查本插件注册的那份（zh / en 两个 locale）。三者都是**调用时**才读 active locale，`params` 按 `{name}` 模板替换。`t` 与 `tCommon` 查不到时 `console.warn` 一次并原样返回键名。`dispose()` 幂等，摘掉本插件的词典注册——不摘就会在下一次 `apply()` 撞上「同一个 namespace 的同一个 locale 注册两次」而抛。`ctx.locale` 由 `inject` 声明，漏掉它会让 `installLocale` 在启动时炸。

`OWN_NS` 与包名逐字相同。改包名时它跟着改；托管区段的标记不跟着改，理由见[功能 8](./feature-8-harness-config.md#标记不跟包名走)。

## 调试句柄

`apply()` 往 `window.__dshOperationImprove__` 挂一份实例把手，给 CDP 与控制台观察状态、也停得掉这一份实例，无需读私有闭包：

```js
{
  instanceId,                       // 本份实例的 id，也写在它开出的每个菜单的 data-dsh-oi-owner 上
  selection,                        // 选择状态 store 本体
  timestamps,                       // { dispose, snapshot, refresh }
  chatHistory,                      // { dispose, snapshot }
  find,                             // { dispose, open, close, snapshot }
  multiSelect:   { dispose() },
  contextMenu:   { dispose() },     // 摘监听器，并关掉可能开着的菜单
  selectionMenu: { dispose() },     // 同上，功能 6
  harnessConfig: { dispose() },     // 摘掉功能 8 在 settings.general.item 上的注册
  locale:        { t, tCommon, tOwn, dispose() },
  services: {
    workspaces, sessions, slots,     // 页面里那几份真服务的只读引用
    get uiWorkspace(),               // getter 而非快照：服务可能是后装上的
  },
  stylesheet:    { dispose() },
  dispose(),                        // 停掉整份实例并摘掉本句柄
}
```

**每一项带监听或带注册的功能都必须列在这里，且要有一条整体 `dispose()`**。这是验证脚本的硬需求而不是便利设施：插件装进 profile 后页面自带一份实例，只暴露一部分等于让脚本停不干净，代价见[验证 · 端到端](./verify.md#端到端)。每条 `dispose` 都幂等，所以句柄上调过之后 `ctx.effect` 卸载时再调一次是安全的。功能 5 与功能 7 不在表里——它们只是 `stylesheet` 那张表里的几条规则。

`services` 是验证脚本建靶子的入口：菜单项的动作是真服务，脚本要建一组可丢弃的工作区与会话当靶子，破坏性项只对靶子点。`uiWorkspace` 做成 getter 是因为它是上游那条 `super(ctx, 'uiWorkspace')` 装上的，插件 apply 前后都可能装；快照会让脚本拿到一个已经不在服务表上的旧对象。

`locale` 上的三个 translate 函数同样是硬需求：验证脚本不自己造 ctx，菜单文案要从**页面真实 locale 服务**借一份，写死字面量等于把断言绑死在 zh 上，上游改文案还会被断言拦住——两个方向都不是文案断言要看的。

## 已知限制

- `rowId` 依赖 React 内部的 `__reactFiber$*` 字段，React 版本变化会失效。失效时表现为所有行都反查不到 id，功能整体静默失灵（不报错）；退路是按顺序对齐（拿行在列表里的序号去索引会话列表），代价是列表一乱序就错位。
