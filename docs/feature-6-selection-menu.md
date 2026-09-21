# 功能 6：选中文本的右键菜单

会话正文、输入框等处选中文本后右键，弹一个只有「复制 / 粘贴」两项的菜单；落点可输入时只给「粘贴」。

`src/selection-menu/index.js`

```js
installSelectionMenu({ tCommon, tOwn, owner? }) -> () => void   // 幂等 disposer
```

`src/selection-menu/clipboard.js`

```js
copySelection(text) -> Promise<void>      // writeClipboard，失败只出声不抛
pasteInto(snapshot) -> Promise<void>      // 读剪贴板 → 恢复选区 → 派发 paste 事件
```

一个捕获阶段的 `contextmenu` 监听器挂在 `document` 上，命中就 `preventDefault()` 并开菜单，不命中就原样放行。菜单本体、样式、关闭条件全部来自[基础层那份组件](./shared-api.md#srcsharedcontext-menujs)，本模块**不带任何 CSS**——「与会话菜单栏样式一致」由「是同一个 `.dsh-oi-menu`、同一份规则」保证，而不是靠抄一份数值。文案与图标见[功能 1、2 · 菜单项与服务映射](./feature-1-2-sidebar-menu.md#菜单项与服务映射)。

- **侧边栏的行归功能 2，这道判据得自己写**。两个 handler 都挂在 `document` 的捕获阶段，同一个节点上的 `stopPropagation()` 拦不住彼此，所以本模块见到 `closestRow(target) !== null` 必须自己提前返回；不写就是一次右键开两次菜单，后开的（功能 6）把行菜单顶掉。
- **选区判定分三条路径**。`window.getSelection()` 看不见 `<input>` / `<textarea>` 内部的选区（Chrome 下那里恒为折叠），表单控件只能读 `selectionStart` / `selectionEnd`，`type` 还得在白名单里——`checkbox` / `color` / `date` / `number` 读这两个属性抛 `InvalidStateError`。contenteditable（0.1.6 起的 Lexical composer）走 DOM 选区，**判据照表单控件的语义**：其内有非折叠选区就给「复制+粘贴」，没有就只给「粘贴」，都不要求点击点落在选区内——控件/编辑器边界本身就是范围限定。页面别处的普通文本才需要「点击点落在选区内」那道闸。
- **普通文本那条路径必须确认点击点落在选区内**。只判「选区非空」的话，页面上还留着一段旧选区时任何位置右键都会弹出一个「复制」，复制的还是别处那段文字。判法是 `caretPositionFromPoint`（缺席回落 `caretRangeFromPoint`）取该点的 `(node, offset)`，再 `range.comparePoint(...) === 0`。**不用 `range.getClientRects()` 命中测试**：多行选区的矩形并集把行尾到容器右边缘那一片空白也算进去，点在那里并没有点在文字上。表单控件那条路径反过来**不要求**点在选区内——浏览器自己在控件里右键也保留原选区，而控件边界已经把范围限死了。
- **两项都没有时不 `preventDefault`**。空白处右键仍然是浏览器自己那套菜单；吃掉事件却不给菜单，用户就只是失去了一个功能。
- **打开菜单那一刻要快照选区**（控件记 `{ field, start, end }`，contenteditable 记 `range.cloneRange()`）。点菜单项会把焦点挪到菜单的 `<button>` 上，浏览器随之丢掉控件的选区；动作执行前按快照恢复，否则粘贴落在光标复位后的位置（通常是文本开头）。
- **粘贴必须派发真的 `paste` 事件**。落点无论是会话输入框（0.1.6 起是 Lexical contenteditable，编辑器自己在 `paste` 监听里读 `clipboardData` 走内部事务；更早版本是受控 `<textarea>`，在 `onPaste` 里读 `clipboardData`、`preventDefault()`、再走 slash-token 事务）还是别的受控组件，直接改 DOM / `value` 都会绕过整条链路，被下一次渲染或 reconcile 盖回去。没人接管（事件没被 `defaultPrevented`，普通 `<input>` 与设置页表单就是这种）时才回落 `document.execCommand('insertText')`——它走浏览器自己的编辑管线，会发 `input` 事件，受控组件跟得上。
- **两个动作都必须在 click 回调里同步开始**。那一拍还带着 user activation，`navigator.clipboard.readText()` 要的正是它；推迟一拍（`setTimeout` 之类）就会被拒。
- 复制走上游 `writeClipboard`（来自 `@deepseek-ai/dsh-client-ui-primitives`，加载器 seed 表里的模块，在 [scripts/build.mjs](../scripts/build.mjs) 里声明为 external）。消息气泡上那枚复制按钮用的就是它，同一个动作在这里得有同样的兜底行为（`navigator.clipboard` 不可用时它退到隐藏 textarea + `execCommand`）。

## 已知限制

- 「粘贴」依赖 `navigator.clipboard.readText()`。浏览器首次调用会弹权限询问，**被拒之后这一项静默无效**——菜单照常弹、点下去什么都不发生，只在控制台出一次声。
- contenteditable 判据认的是 `[contenteditable=""]` / `[contenteditable="true"]` 属性与 `isContentEditable`（0.1.6 的 Lexical composer 正是这个形态，`verify:selection` 打在真实页面上）。上游若换成只读投影 + 隐藏输入面（0.1.5 及更早那个 textarea 形态）判据换轨到表单路径，两边都换（Shadow DOM / iframe 包住编辑器）时判据整条失效——表现是 composer 上右键退回原生菜单，不报错。
- 「粘贴」图标是自绘的，没有上游原件可比。上游哪天加了自己的粘贴图标，这一枚不会自动跟上，也不会有任何断言撞上——只是这一项与别处的粘贴按钮画着两版矢量（见[图标与尺寸](./feature-1-2-sidebar-menu.md#图标与尺寸)）。
- 认的是「选区落点」而不是「有没有选区」，判法依赖 `caretPositionFromPoint` / `caretRangeFromPoint`。两个都缺席的引擎上它**放行**（宁可多弹一次菜单，也不要整条功能消失），表现是页面上留着旧选区时别处右键也会弹出一个「复制」。Electron 与 Chrome 两个都有。

## 验证

跑法、16 条断言与七处坑见[验证 · 功能 6](./verify.md#功能-6-的验证)（`npm run verify:selection`）。
