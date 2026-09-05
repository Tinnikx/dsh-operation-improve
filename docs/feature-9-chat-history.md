# 功能 9：对话历史导航

输入框为空（或内容是上下键切换进来且未修改）时，按 ↑/↓ 在输入框中翻阅本会话的历史提问。

历史来源是**右侧轮次导航列**，不做任何本地记录：装上插件之前的提问也在其中。导航列的 fiber props 携带全部轮次条目 `[{ turn, prompt, response, anchor }]`；`prompt` 是上游截断到 50 字的预览，`anchor` 为 `{ kind: 'loaded', key }` 时 `key` 指向消息流里那一行（`data-chat-flow-key`），行内气泡（`[class*="_bubble"]`）持有全文。全文只在行已挂载时可取，取不到就退化为预览。

`src/chat-history/history-store.js`

```js
isPristine(current, lastNavigatedValue) -> boolean
resolveTurnTexts(items, lookupFullText) -> string[]
```

纯函数层：干净判定、轮次条目解析（全文/预览的取舍与空条目丢弃）。不碰 DOM，可独立单测（`tests/chat-history-store.test.mjs`，9 条）。

`src/chat-history/nav-rail.js`

```js
findRailItems() -> Array|null     // 导航列不存在（非会话页）返回 null
bubbleTextAt(anchorKey) -> string|null
```

导航列读取层。认 `nav` 元素 fiber 里的轮次数组（每条带数值 `turn` 且组件带 `onNavigate`），不认 aria-label——文案随语言变。

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
installChatHistory(sessions) -> { dispose(), snapshot() }
```

编排层：会话跟踪（`sessions.list` 的 `getSnapshot().current` + `subscribe`——应用没有 URL 路由，地址栏恒为 `/`）、键盘导航、写入队列。历史只在开始导航的那一刻从导航列读一次（纯内存操作：fiber props + DOM 文本），导航期间复用，退出即弃——无网络、无轮询、不阻塞主线程。

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
- 导航列不渲染的会话页（如内容加载失败）历史为空，↑ 静默不抢键；没有输入框的会话视图（只读/归档）功能不生效。
