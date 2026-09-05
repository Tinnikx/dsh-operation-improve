# 003 功能 9 历史来源改读会话右侧导航列

- 目标：对话历史不再来自「插件生效后记录的发送」，而是直接读 0.1.2-rc.1 会话页右侧导航列里的用户提问列表——装插件前的提问也能翻。获取过程不阻塞主线程（懒读 + 纯内存，不做网络/轮询/重型计算）。验收：`npm run verify:chat-history` 在测试栈全绿，历史断言的期望值取自脚本对导航列与消息流的独立读取。
- 范围：`src/chat-history/`（index.js 重写、nav-rail.js 新建、composer.js 多行保真与异步选区修复、history-store.js 瘦身为纯函数）、`scripts/verify-chat-history-live.mjs` 重写、文档同步。localStorage 记录层整体移除（启动时清一次遗留键）。不做：真实发送链路（本设计无发送检测，不需要）。

## 进展

1. **导航列调查**（测试栈 +  fiber 反查实测）：
   - 右侧「轮次导航」列的组件 props 携带 `items: [{ turn, prompt, response, anchor }]`——全部轮次（含装插件前的提问），`prompt` 是 50 字截断预览，`anchor.kind === 'loaded'` 时 `anchor.key` 是消息流行的 `data-chat-flow-key`，行内 `[class*="_bubble"]` 持有全文。
   - 上游数据流：`turnOutline` 投影（全轮次、预览）与已挂载窗口的条目在 `mergeTurnRailItems` 合并；未挂载轮次只有预览。
   - 导航列 tick 按钮数会随轮次压缩采样，不能用来对条数——条数一律走 fiber 的 `items`。
2. **实现**：历史 = 开始导航那一刻读导航列（fiber 内存读取），loaded 轮次取气泡全文、其余退化为预览；localStorage 记录层删除。三个文件各司其职：`nav-rail.js`（读取）、`composer.js`（输入框原语）、`history-store.js`（纯函数：isPristine + resolveTurnTexts）。
3. **验证（全部实跑）**：
   - `node --test tests/*.test.mjs` → 28/28 通过（chat-history 9 条）。
   - `node scripts/verify-chat-history-live.mjs`（测试栈）→ **14/14 通过，退出码 0**。被测会话 10 轮、全部为装插件前的提问；oracle 比对（条数 + 每条文本含全文升级）一致；含一条 600 字符多行报错文本的全文回翻。
   - `node scripts/build.mjs` → 通过。

## 决策与理由

- **导航列为索引、消息流气泡为全文**：用户点名从导航列取；导航列条目完整但只有 50 字预览，全文从 loaded 锚点指的消息流气泡补。取不到全文（行未挂载）退化为预览——长提问的重发保真度让位于「轮次完整」。
- **开始导航时才读一次，导航期间复用**：读取是纯内存操作（fiber props + DOM 文本），无网络无轮询，满足不阻塞约束；退出导航即弃，下次重读，没有缓存失效问题。
- **写入按 DOM 落定形态校准 pristine 基准**：Lexical 会规范化写入内容（实测 `execCommand('insertText')` 把多行抹平、选区同步是异步）。writeText 因此是「selectAll → 50ms 让拍 → 逐段 insertText + 合成 Shift+Enter」，并在写完后读回 DOM 作为 pristine 基准；写入串成 Promise 队列。

## 测试 cases

- 单元测试 9 条（`tests/chat-history-store.test.mjs`）：isPristine 4 条 + resolveTurnTexts 5 条（全文优先、预览退化、unloaded 不查全文、空条目丢弃、保序去空白）。
- 端到端 14 条（`scripts/verify-chat-history-live.mjs`，测试栈实跑）：句柄、历史与导航列条数一致、历史文本与独立 oracle 一致（含全文升级）、↑↓ 导航全序列、越界、脏内容/多行光标门控、会话切换换历史、不写 localStorage、dispose、刷新恢复。

## 未完成项与下一步

无遗留。

## 坑

- **导航列的 `prompt` 恒为 50 字预览**：长提问必须走 loaded 锚点 → 消息流气泡取全文；上游把预览截断做进了数据层（`mergeTurnRailItems`），fiber 里找不到未截断的源。
- **tick 数会压缩**：轮次一多导航列的 tick 按钮就被采样，验证脚本若拿 DOM tick 数对条目数会误报——条目数只能看 fiber 的 `items`。
- **`execCommand('insertText')`/`insertHTML` 都抹平换行**（实测三写法全灭）；CDP `Input.insertText` 保留换行但插件在页内用不了 CDP。页内保真写法：逐段 `insertText` + 段间合成 Shift+Enter，逐段部分同步即可。
- **selectAll 的选区同步是异步的**：同步连写会打在旧选区上（文本被追加而不是替换），连按 ↑ 时导航被自己写的文本误判「用户改过」而退出——写入必须 50ms 让拍 + 落定后读回校准。
- **选会话不能按名字**：测试栈副本随真实 home 漂移；运行中的会话（行 fiber 的 `node.running`）输入框不可用；部分会话视图挂载很慢。验证脚本要按「历史 ≥2 且 composer 在且两次读数一致」挑会话。
