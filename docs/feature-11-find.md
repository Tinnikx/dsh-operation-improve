# 功能 11：`Ctrl`/`cmd` + `F` 页内查找

按 `Ctrl`/`cmd` + `F` 在页面右上角弹一条查找条，在**当前页面已渲染的文本**里搜关键词：全部命中按词高亮，`Enter` / `Shift+Enter` 跳下一个 / 上一个（到端点环绕），`Esc` 关闭并清除高亮。不占 slot、没有 host 半边、不写 localStorage。实现见 [../src/find/index.js](../src/find/index.js)（DOM 半边）与 [../src/find/matches.js](../src/find/matches.js)（纯函数层），验证见 [verify.md](./verify.md#功能-11-的验证)。

## 判据

**快捷键与相位**。`keydown` 挂在 `window` 捕获，判据是 `(ctrlKey || metaKey) && !altKey && key 是 f/F`，命中即 `preventDefault()` + `stopPropagation()`。挂 `window` 而不是 `document` 是为了抢在共享右键菜单之前：[context-menu.js](../src/shared/context-menu.js) 的 `Esc` 监听也挂在 `window` 捕获，但那条在每次打开菜单时才注册，同相位下注册序决定调用序——本模块在页面加载时就挂着，因此先看到事件，也才读得到那份尚未摘掉的菜单（`Esc` 让位，见下）。上游与桌面壳都不占这个键：Electron shell 只绑 Ctrl+J，没有应用级菜单，Chromium 在 Electron 里没有原生查找面板。

**高亮不改 DOM**。两层 `CSS.highlights` 注册名（`dsh-oi-find` 全部命中、`dsh-oi-find-active` 当前项）配两条 `::highlight()` 规则，Range 直接指向文本节点。用 `<mark>` 包住命中会拆掉 React 管的文本节点，并且每一次包裹都要喂给功能 1 与功能 4 那两个观察 `document.body` 的 `MutationObserver`——所以本功能一条 `childList` mutation 都不许产生，`verify:find` 当场数它。注册表是文档级全局的，两份实例同名互顶，因此绘制前先认领、摘除时只删自己那份。

**当前项画在全部命中之上**靠两条 `::highlight()` 在表里的先后决定（叠放绘序跟随规则出现顺序），所以 `FIND_CSS` 里 active 那条写在后面；这条约束记在 [../src/client/index.js](../src/client/index.js) 的样式表段落里。

**命中域是整页已渲染文本**（含侧栏行标题），`TreeWalker` 从 `document.body` 走文本节点，跳四类：

1. 本插件自己的东西——`.dsh-oi-find`（条本身）、`.dsh-oi-menu`（菜单）、`.dsh-oi-ts`（功能 4 的时间戳标签，搜「12」不该命中它们）。
2. 不渲染成文本的标签：`script` / `style` / `noscript` / `textarea` / `input` / `select` / `option`。
3. 不可见：`checkVisibility({ checkVisibilityCSS: true, visibilityProperty: true, contentVisibilityAuto: true })` 为假，或 `getClientRects()` 为空。`checkVisibilityCSS` 这一项不能省——上游把折叠的过程块标成 `[hidden]`，主题给它的不是 `display: none` 而是 `content-visibility: hidden`，元素仍有 layout 盒，光看矩形判不出来（实测一条多轮会话上有 59 个这样的条目）。
4. 折叠正文：`[data-variant="think"]:not([data-expanded])` 与 `[aria-expanded="false"]` 两棵子树。第 3 条已经能兜住实测见到的那些组，这两条是给「有盒子但被 `24px` 高的收起行裁掉」的那种折叠留的余量。

命中上限 1000 条，计数显示 `1000+`：长会话里搜一个常见字母会破万，而 `Range` 与 `Highlight` 的构造都按条付费。

**重算**。观察者只在条开着的时候挂（`open()` 起、`close()` 停），`document.body` 的 `childList` + `subtree` + `characterData`，rAF 去抖，与功能 4 同构；条自己的子树产生的 mutation 直接丢掉，否则计数文本会喂自激环。触发点是流式追加、「加载更早」前插、折叠展开、切会话——一律全量重扫，不做增量。

**游标重锚按 `(rowKey, ordinal)`**：`rowKey` 是命中所属行的 `data-chat-node-key`（没有则 `data-chat-flow-key`，都没有则 `'page'`），`ordinal` 是它在该行内的文档序。该条命中消失时取文档序里紧随其后的第一条，后面全没有了再往前找。绝对序号不承诺连续——「加载更早」前插会让整体位移，硬保连续是假象。

**跳转**对命中所在元素 `scrollIntoView({ block: 'center', behavior: 'instant' })`。`instant` 是有意为之：smooth 动画会和上游的 `overflow-anchor` 抢滚动。

**`Esc` 让位给右键菜单**。菜单开着时那一次 `Esc` 只关菜单，查找条留着，第二次 `Esc` 才收条。不写这道判据的表现是一次 `Esc` 同时关掉两样东西。

**词条**全部走本插件词典的 `find.*` 六键（[../src/shared/locale.js](../src/shared/locale.js)），取值发生在装配与更新那一刻，语言切换自动跟随。

## 实测读数

`npm run verify:find` 19 条断言全绿（`passed=19 failed=0 skipped=0`，退出码 0），关键读数：

- 查询词 `" age"`（页面真实文本里出现 ≥3 次的 4 字窗口）：插件 5 条，脚本独立 oracle 5 条，`CSS.highlights.get('dsh-oi-find').size` 5，当前项集合 1 条且 `activeText` 为 `" Age"`（与查询词只差大小写）。
- 跳转：`Enter` 让 `index` 走 `0 → 1`，`Shift+Enter` 回 `0`；连按到端点 `4` 再按回 `0`（环绕）。当前项元素的矩形在视口内（`inViewport: true`）。
- 不动 DOM 契约：一轮「改词 + 两次跳转」下来，只数 `childList` 的观察者读数 `childListNodes=0`。
- token 在场：`--dsw-alias-state-warn-label` 解析为 `#dd8629`、`--dsw-specific-menu` 为 `hsla(250,34%,45%,0.88)`（定义在 `document.body` 上，不在 `:root`——读错元素等于这条从来没在判它依赖的东西）。
- `Esc` 后：条不在 DOM 上、快照报没开、两个注册名都不在注册表里。
- 菜单让位：真实右键开菜单后第一次 `Esc` 得 `{menu:false, bar:true}`，第二次得 `{bar:false}`。
- 折叠组：取自不可见正文的 12 字查询词，插件 0 条、`raw` 口径 1 条、`visible` 口径 0 条。
- 切会话（条开着）：条留着、词条不变、高亮集 11 条与快照 `total` 同数、每条 Range 的 `startContainer.isConnected` 为真、且与当前页面的 oracle 同数（11 === 11）。
- `find.dispose()` 后再按 Ctrl+F：探针读到 `defaultPrevented === false`，注册名清空。
- 观感（截图核对）：条在右上角 `380×34`，计数形如 `1 / 5`；当前项是实心橙 `rgb(221, 134, 41)`，其余命中是 42% 透明橙 `color(srgb .867 .525 .161 / .42)`——两条 `::highlight()` 的先后确实是绘序，当前项盖在全部命中之上。

## 已知限制

1. 只搜已渲染文本。会话页已加载的节点恒在 DOM（上游虚拟的是右侧轮次导航列，不是消息行），但更早的历史是按需前插的，没加载就不在页面里，搜不到；轨迹账本的表格行超过 100 条时虚拟化，那一块只覆盖挂载窗口。
2. 表单控件的值不进命中，也画不出高亮（`<input>` / `<textarea>`，含上游工具栏那个「搜索轨迹」框）。浏览器自己的查找同样不搜这些。
3. 命中集合与「第 n / 共 m」随 DOM 变化重算，只承诺 `(rowKey, ordinal)` 级重锚，不承诺绝对序号连续。
4. 命中上限 1000，到数后计数显示 `1000+`，`Enter` 只在这一千条里环绕。
5. 与上游「搜索轨迹」是两套语义：那条是**过滤**（命中之外的 record 不渲染，只覆盖当前已加载分页），本功能是**页内高亮定位**。上游框里输入时按 Ctrl+F 仍会被本功能接管。
6. 折叠起来的内容要先展开才搜得到（判据第 3、4 条），这与浏览器一致，但值得写明。
7. 只在有 CSS Custom Highlight API 的运行时上生效（Chromium ≥ 105）。缺它就出声并且整条功能不启用——本插件不靠改 DOM 画高亮，没有不动上游的替代画法。
8. 全部验证在 headless Chrome + 独立 `DSH_HOME` + 端口 3181 上，不是真桌面客户端：shell 层的 accelerator 抢键（CDP 的 `Input.dispatchKeyEvent` 不经 `before-input-event`）、macOS 的 `cmd` + `F`、流式输出时的抢滚动，这三样没验。
