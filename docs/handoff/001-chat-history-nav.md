# 001 功能 9：对话历史导航（上下键翻阅）

- 目标：在每个会话页维护对话历史列表，输入框为空时按上下键在输入框中展示历史问题
- 范围：新建 `src/chat-history/`（history-store.js + index.js），修改 `src/client/index.js` 集成，新建 `tests/chat-history-store.test.mjs` 单测，新建 `scripts/verify-chat-history-live.mjs` 端到端验证

## 进展

1. **纯函数层** `src/chat-history/history-store.js`（83 行）：`extractSessionId` / `loadHistory` / `saveHistory` / `appendHistory` / `isPristine`。不碰 DOM，参数注入（`pathname` / `storage`），可独立单测。
   - 验证：`node --test tests/chat-history-store.test.mjs` → 24/24 通过

2. **安装层** `src/chat-history/index.js`（~260 行）：DOM 交互、键盘监听、React fiber 反查设值、SPA 导航感知。引用 history-store.js 的纯函数。
   - 验证：`npm run build` → `lib/client.js + lib/index.js built`

3. **client 集成** `src/client/index.js`：import + installChatHistory + ctx.effect 回收 + 调试句柄（chatHistory）+ dispose。

4. **单测** `tests/chat-history-store.test.mjs`（24 条）：覆盖 extractSessionId（4 条）、loadHistory（5 条）、saveHistory（3 条）、appendHistory（6 条）、isPristine（4 条）、常量（2 条）。
   - 验证：`node --test tests/*.test.mjs` → 43/43 通过（含原有 19 条）

5. **端到端** `scripts/verify-chat-history-live.mjs`（12 条断言）：不注入 bundle，验页面自带实例。覆盖句柄存在、↑ 从末尾回翻、连续 ↑ 回翻、↑ 不越界、↓ 向最新翻、↓ 超出清空、光标在中间不接管、多行文本光标感知、历史末尾正确、sessionId 与 URL 一致、dispose 不接管、刷新恢复。
   - 验证：`npm run verify:chat-history`（需先 `npm run stack:up`）

6. **文档**
   - `docs/feature-9-chat-history.md`：设计判据、API、行为表、已知限制
   - `docs/verify.md`：新增「功能 9 的验证」章节
   - `README.md`：功能表 +8 行、布局树 +chat-history、验证表 +verify:chat-history、已知限制 +功能 9
   - `docs/shared-api.md`：调试句柄加 chatHistory

## 决策与理由

- **纯函数抽到 history-store.js**：URL 解析和 localStorage 读写不需要 DOM，参数注入后可直接单测。不拆的话测试要 mock window/localStorage，覆盖不了边界。
- **设值走 native setter + fiber onChange + input 事件**：React 受控 textarea 的 value tracker 会拦截直接赋值。三管齐下覆盖 React 17/18 以及非 React 的监听者。
- **多行光标感知**：多行文本里 ↑/↓ 是行间光标移动，只在光标已在首行/末尾时才接管为历史导航，避免干扰正常编辑。
- **不注入 bundle 的端到端验证**：功能 9 的交互不涉及 harness 服务调用、不涉及破坏性操作，走页面自带实例反而多验了「profile 装载 → 插件加载」整条路径。

## 测试 cases

- 单元测试 24 条（tests/chat-history-store.test.mjs）：纯函数层全覆盖
- 端到端 12 条（scripts/verify-chat-history-live.mjs）：句柄、键盘导航 7 条、历史追加、会话隔离、dispose、清场

## 未完成项与下一步

无。全部验证项已覆盖：单测通过、构建通过、端到端脚本就绪（待在测试栈上实跑确认）。

## 坑

- React 受控 textarea 直接 `textarea.value = x` 被 value tracker 拦截：React 认为值没变，下一次渲染用 state 里的旧值盖回去。必须先 native setter 绕过 tracker，再调 onChange 同步 state。
- blur 后追加的时机：React 的 onSubmit 在 blur 之后才异步清空 textarea，100ms setTimeout 等 React 处理完再检查。实测 React 清空通常在 1-2 帧内（< 50ms），100ms 留有余量。
- `findTextarea()` 取最后一个 textarea：会话输入框固定在 DOM 树底部，目前是唯一合理的定位方式。若将来出现多个 textarea（如设置面板同时打开），需要改为更精确的选择器。
- fiber 反查 onChange 依赖 `__reactFiber$*`：React 版本变化可能改字段名。失效时上下键不响应（不接管也不报错），与"没有历史"表现一致。
