# 基础层 API 与调试句柄

`src/shared/` 下四个模块，功能 1、2、6 共用；调试句柄由 client 入口挂出，六个验证脚本都依赖它。

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

## `src/shared/context-menu.js`

```js
openContextMenu({ x, y, items, onSelect?, onClose?, owner?, anchor? }) -> () => void  // 幂等 close
closeContextMenu()                                                   // 关掉当前菜单
MENU_CSS                                                             // 菜单与高亮的样式表文本
```

`items`：`{ id, label, icon?, danger?, disabled? }`，或 `{ separator: true }`。`icon` 是一段 SVG 标记，经 `innerHTML` 落地，因此**只接受本仓库的常量**（[src/shared/menu-icons.js](../src/shared/menu-icons.js)）——收调用方传进来的任意串就等于开了个注入口。同时只存在一个菜单，再次 `open` 先关旧的。关闭条件：选中一项、外部 `pointerdown`（capture）、`Esc`、滚动（capture，只认整页滚动与包含 `anchor` 的容器）、`blur`、`resize`。超出视口时自动向内翻转。

**滚动关闭必须挑容器，不能来者不拒**。捕获阶段挂在 `window` 上的 `scroll` 会收到页面里任何一个滚动容器的事件（scroll 不冒泡，但捕获阶段照样从 window 往下派发），而会话区流式输出时每来一段就自动滚到底一次——无差别关闭的表现是「一边输出一边右键，菜单弹出来立刻消失」。所以 `installContextMenu` 把右键命中的那一行当 `anchor` 传进来，只有整页滚动或**包含这一行**的容器滚动才关。`anchor` 缺省时退回无差别关闭。

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
  startNav,                         // { dispose, snapshot, refresh }
  timestamps,                       // { dispose, snapshot, refresh }
  multiSelect:   { dispose() },
  contextMenu:   { dispose() },     // 摘监听器，并关掉可能开着的菜单
  selectionMenu: { dispose() },     // 同上，功能 6
  harnessConfig: { dispose() },     // 摘掉功能 8 在 settings.general.item 上的注册
  locale:        { t, tCommon, tOwn, dispose() },
  stylesheet:    { dispose() },
  dispose(),                        // 停掉整份实例并摘掉本句柄
}
```

**每一项带监听或带注册的功能都必须列在这里，且要有一条整体 `dispose()`**。这是验证脚本的硬需求而不是便利设施：插件装进 profile 后页面自带一份实例，只暴露一部分等于让脚本停不干净，代价见[验证 · 端到端](./verify.md#端到端)。每条 `dispose` 都幂等，所以句柄上调过之后 `ctx.effect` 卸载时再调一次是安全的。功能 5 与功能 7 不在表里——它们只是 `stylesheet` 那张表里的几条规则。

`locale` 上的三个 translate 函数同样是硬需求：注入式验证造的是自己的 ctx，不从这里借一份**页面真实 locale 服务**给出的文本，文案断言就只能拿桩数据自证。

## 已知限制

- `rowId` 依赖 React 内部的 `__reactFiber$*` 字段，React 版本变化会失效。失效时表现为所有行都反查不到 id，功能整体静默失灵（不报错）；退路是按顺序对齐（拿行在列表里的序号去索引会话列表），代价是列表一乱序就错位。
