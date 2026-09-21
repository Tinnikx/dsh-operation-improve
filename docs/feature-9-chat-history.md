# 功能 9：对话历史导航

输入框为空（或内容是上下键切换进来且未修改）时，按 ↑/↓ 在输入框中翻阅本会话的历史提问。

历史来源是**右侧轮次导航列**，不做任何本地记录：装上插件之前的提问也在其中。导航列的 fiber props 携带全部轮次条目 `[{ turn, prompt, response, anchor }]`；`prompt` 是上游截断到 50 字的预览，`anchor` 为 `{ kind: 'loaded', key }` 时 `key` 指向消息流里那一行（`data-chat-flow-key`），行内气泡（`[class*="_bubble"]`）持有全文。全文只在行已挂载时可取，取不到就退化为预览。上游 `TurnNavigator` 对不足 2 轮的会话整列不渲染（`items.length < 2` 直接 `return null`）——rail 缺席或解析不出条目时退到**消息流兜底**：`[data-chat-flow-kind="user"]` 行的气泡全文，单条提问的会话因此同样能 ↑ 调出它。

`src/chat-history/history-store.js`

```js
isPristine(current, lastNavigatedValue) -> boolean
resolveTurnTexts(items, lookupFullText) -> string[]
```

纯函数层：干净判定、轮次条目解析（全文/预览的取舍与空条目丢弃）。不碰 DOM，可独立单测（`tests/chat-history-store.test.mjs`，9 条）。

`src/chat-history/nav-rail.js`

```js
findRailItems() -> Array|null     // 导航列不存在（非会话页/不足 2 轮）返回 null
bubbleTextAt(anchorKey) -> string|null
findFlowPrompts() -> string[]     // 兜底源：消息流 user 行气泡全文，文档序=最旧在前
```

导航列读取层 + rail 缺席时的兜底。认 `nav` 元素 fiber 里的轮次数组（每条带数值 `turn` 且组件带 `onNavigate`），不认 aria-label——文案随语言变。

`src/chat-history/composer.js`

```js
findComposer() -> HTMLElement|null
readText(composer) -> string
writeText(composer, text) -> Promise<void>
caretAtEdge(composer, 'start'|'end') -> boolean
```

输入框原语。上游输入框是 Lexical 编辑器（`<div contenteditable="true" role="textbox">`）。设值/清空的坑（`execCommand('delete')` 不生效、选区同步是异步、`insertText`/`insertHTML` 抹平换行）逐条写在 `writeText` 的注释里。`readText` 丢弃尾部空段——Lexical 给末尾空行补受管 `<br>`，同一内容不同时刻会读出 `text` 或 `text\n`，「未修改」判定经不起这种抖动。

`src/chat-history/index.js`

```js
installChatHistory() -> { dispose(), snapshot() }
```

编排层：会话跟踪、键盘导航、写入队列。应用没有 URL 路由（地址栏恒为 `/`），而 0.1.6 起「当前会话」也不经过任何可注入的服务——`SessionListState` 没有 `current` 字段，选择搬进 ui-workspace 的 navigation 内部 store（persist 键 `dsh.sessions.current`）。当前会话因此**从 DOM 派生**：`[class*="_sessionRow"][aria-selected="true"]`（搜索结果的选中行也算）+ fiber 反查行 id（[rowId](shared-api.md)）。`aria-selected` 是 TSX 字面量属性，与功能 10 用的是同一个跨版本稳定信号。派生是按键时刻的现算：本功能只在 keydown 时起作用，两次按键之间怎么换会话都不需要即时知道，切换判据（id 变了才退导航态）跟着每次按键做，不挂观察器。`snapshot()` 的 `sessionId` 同样现读——验证脚本在按键之外轮询它判断「会话切换已落定」。历史只在开始导航的那一刻读一次（纯内存操作：fiber props + DOM 文本；rail 优先、消息流兜底），导航期间复用，退出即弃——无网络、无轮询、不阻塞主线程。

## 上下键导航

| 条件 | 行为 |
|------|------|
| ↑ + 未在导航态 + 光标在文档开头 + 输入框为空或等于上次导航值 | 从最新一条开始回翻 |
| ↓ + 未在导航态 + 光标在文档末尾 + 同上 | 无操作（↓ 只用于回翻中的返程） |
| 导航中（↑/↓ 已接管过且内容未被修改） | ↑/↓ 继续翻页，不再查光标位置 |
| 导航中用户编辑了文本 | 退出导航态，按键交还原生行为 |
| ↑ 到最早一条 | 停在原地（不吃事件，保持原生行为） |
| ↓ 翻过最新一条 | 退出导航，清空输入框 |
| 输入框有内容且非导航值 | 不接管 |

写入完成后会按 DOM 实际落定形态读回一次作为「未修改」基准——Lexical 可能规范化写入内容，基准必须是落定形态，否则下一次按键被自己写的文本误判成「用户改过」。写入串成 Promise 队列，连按不打架。

## 已知限制

- 长提问（超过 50 字）在该轮消息行未挂载时只有预览文本（尾部带 `…`）——消息流分页/虚拟化会卸掉旧行；挂载时（如用过导航列跳转、消息流滚到过）自动换成全文。
- 设值与清空依赖 Lexical 不看 `isTrusted` 的按键命令链（合成 Shift+Enter/Backspace）。上游若开始检查，多行历史写入变形、↓ 越界不清空，但导航本身照常。
- 选区同步的 50ms 延迟：极端连按下导航可能提前退出（按「用户改过」兜底，不会写错值）。
- 两个来源都读不到条目时（消息流加载失败、或提问气泡为空的病态会话）↑ 静默不抢键；没有输入框的会话视图（只读/归档）功能不生效。
- 当前会话靠 DOM 派生：侧栏没有选中行（首页、设置页）或行上 fiber 反查不到 id 时按「没有打开的会话」处理，↑ 不接管——与 [row-probe](shared-api.md) 的失败语义一致，不抛。上游若改掉 `aria-selected`，表现就是这一条，`verify:chat-history` 的第 1、2 条断言会先撞上。
