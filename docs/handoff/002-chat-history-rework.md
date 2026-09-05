# 002 功能 9 返工：适配真实应用（sessions 服务 + Lexical 输入框）

- 目标：让功能 9 在 0.1.2-rc.1 的真实页面上真正工作——当前会话来自 `ctx.sessions` 订阅（应用无 URL 路由），输入框适配 Lexical contenteditable，发送检测改「手势臂 + mutation 清空消费」。验收：`npm run verify:chat-history` 在测试栈上全绿，单测全过，构建通过。
- 范围：重写 `src/chat-history/`（index.js 重写、composer.js 新建、history-store.js 删 URL 解析）、`src/client/index.js` 传入 sessions、`scripts/verify-chat-history-live.mjs` 重写、`scripts/test-stack.mjs` 的 Chrome 启动 URL 带 token、文档同步。不做：真实发送的自动端到端覆盖（真发会写会话副本；链路经一次性手工诊断确认）。

## 进展

1. **诊断实锤 001 从未在页面上活过**（三处致命假设错误）：
   - `installChatHistory` 里局部 `let history` 遮蔽 `window.history`，`history.pushState.bind(history)` 必抛 TypeError。带 token 起真实页面，console 实测 `failed to apply loader entry … Cannot read properties of undefined (reading 'bind')`，且上游把整个 UI 换成「Failed to load plugins」错误屏——侧边栏、输入框全部不渲染。
   - 上游应用没有 URL 路由：6.7MB client bundle 里仅有的 `pushState` 调用是本插件自己的；点会话行 URL 恒为 `/`。当前会话只能读 `sessions.list.getSnapshot().current`（实测服务表面：`list.subscribe`/`getSnapshot`，snapshot 含 `current`/`phase`/`byId`）。
   - 输入框是 Lexical contenteditable（`div[contenteditable="true"][role="textbox"]`，实测全页唯一），不是 textarea。
2. **重写 `src/chat-history/`**：composer.js（findComposer/readText/writeText/caretAtEdge）、index.js（sessions 订阅、键盘导航、发送检测）、history-store.js（删 extractSessionId）。`src/client/index.js` 传 `ctx.sessions`。
3. **修测试栈**：`test-stack.mjs` 的 Chrome 启动 URL 带 token（无 token 是 401 认证屏，curl 实测）。另有上一会话加的就绪探针 token 化。
4. **重写 `scripts/verify-chat-history-live.mjs`**：14 条断言，模拟发送 = synthetic pointerdown 臂 + 真实 Delete 键清空；开头清 localStorage 再 reload 保证可重跑。
5. **验证（全部实跑）**：
   - `node --test tests/*.test.mjs` → 39/39 通过（删了 4 条 extractSessionId 用例）。
   - `node scripts/build.mjs` → 构建通过。
   - `node scripts/verify-chat-history-live.mjs`（测试栈）→ **15/15 通过，退出码 0**（含一句柄断言外的 14 条行为断言；脚本开头有一句柄检查，summary 计 15）。
   - `node scripts/verify-active-dot-live.mjs`（基建回归）→ 18/20，2 条失败是功能 5 自己的深色主题对比度断言（底色采样读成白底下深色主题，fill 颜色本身正确）——与本次改动无关，见「未完成项」。

## 决策与理由

- **当前会话走 `sessions` 服务订阅而不是 fiber/URL**：服务是 inject 声明的依赖，表面有 `subscribe`/`getSnapshot`，是应用自己读当前会话的同一条路径。通知不含变化内容，回调里比对后再重载。
- **设值走 `execCommand('insertText')`、清空走合成 Backspace**：Lexical  reconcile 会盖回直接 DOM 修改；`execCommand('delete')` 实测不生效；合成 Backspace 走 Lexical 自己的 keydown 命令链（不看 `isTrusted`）。三路对比实测见 tmp 诊断脚本（一次性，未入库）。
- **发送检测 = 手势臂 + mutation 清空**：发送后 Lexical 当帧清空、焦点不动（实测），blur 路径不存在；手势臂覆盖 Enter（无 shift、非 IME 合成）与「pointerdown 落到 composer 外」（发送按钮在 composer 外），800ms 窗口消费。手动全选删除无臂、切会话清臂，两个主要误报路径都兜住。
- **导航中跳过光标门控**：导航设值后光标落在文本末尾，连续 ↑ 若仍要「光标在文档开头」就翻不动第二页。门控只在未处于导航态时生效；导航中靠 pristine 判定（用户改了文本即退出导航态）。
- **verify 脚本不真发消息**：真 Enter 会把消息写进会话副本。模拟路径驱动的全是插件真实代码（臂 + mutation 消费 + 追加），「真发送会清空」这一前提由手工诊断确认。

## 测试 cases

- 单元测试 20 条（`tests/chat-history-store.test.mjs`）：纯函数层（loadHistory/saveHistory/appendHistory/isPristine/常量）。
- 端到端 15 条（`scripts/verify-chat-history-live.mjs`，测试栈实跑）：句柄、会话非空、三次模拟发送后历史有序、↑ 回翻三连、顶端不越界、↓ 返程三连、越界清空退出、脏内容不接管、多行光标门控、会话隔离、dispose、刷新恢复。

## 未完成项与下一步

无本任务遗留。发现一个**与本次改动无关**的既有漂移，建议另起交接：`verify:dot` 的深色主题对比度两条断言失败（18/20）——暗格底采样读成 `rgb(255,255,255)`（深色主题下取了浅色名义底），实测 fill `rgb(34,211,238)` 正确。怀疑是主题基线检测与当前主题（壁纸主题?）的适配问题，需要功能 5 的视角复查。

## 坑

- **「构建通过 + 纯函数单测」对 DOM 编排层零覆盖**：001 的三处致命错误（变量遮蔽、URL 路由不存在、textarea 不存在）全部是「装上页面就崩/就不触发」级别，任何一条端到端断言都能挡住。
- **测试栈的进程会被执行环境在命令结束时回收**：`detached + unref` 也保不住，`stack:up` 与 verify 必须放在同一条 shell 命令里跑，否则 verify 拿到 ECONNREFUSED。
- **就绪探针能过 ≠ 页面可用**：harness token 认证下，探针带 token 拿 200，Chrome 裸开首页却是 401。两侧的认证路径要一起改。
- **Lexical 的 DOM 假设不能照搬 textarea 经验**：没有 `.value`、没有 `selectionStart`、`execCommand('delete')` 不生效、`insertParagraph`/`insertLineBreak` 行为与预期不符（多行要用一次 `insertText` 带 `\n`）。每条原语都要实测。
- **/tmp 在两次 bash 调用之间不共享**：诊断产物（抓取的 bundle 等）要放仓库 `tmp/` 下。
