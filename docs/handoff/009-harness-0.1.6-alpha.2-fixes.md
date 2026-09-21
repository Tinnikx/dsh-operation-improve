# 009 harness 0.1.6-alpha.2 适配实现

- 目标：按 [harness-v0.1.6-alpha.2-adaptation-report.md](../../harness-v0.1.6-alpha.2-adaptation-report.md) 的修复方向落地——功能 9 当前会话改 DOM 派生、功能 2 fork 后打开改 DOM click、功能 4 死锚点处置、验证脚本剩余三处漂移（dot C 组 / selection 预检 / timestamps 谓词）。验收方式：`npm test` + 构建 + 0.1.6-alpha.2 测试栈上全量 verify 脚本实跑全绿，README「当前已兼容版本」补 0.1.6-alpha.2。
- 扩项（用户追加授权）：① 功能 6 给 contenteditable 补空态判据——空 composer 无选区右键也弹「只给粘贴」；② 定位侧栏列表清空现象（008 观察项，本轮复现第二次）并修复；③ 功能 9 的历史源补消息流兜底——上游 `TurnNavigator.tsx:129` 对 `< 2` 轮直接 `return null`，单条提问的会话没有导航列，↑ 因此拿不到历史；rail 缺席/为空时退到 `[data-chat-flow-kind="user"]` 行的气泡全文。三项完成才收 009。
- 状态：完成（用户 2026-09-21 确认）。验收读数即「进展」一节的全量套件行（八个脚本/测试全绿 + settings 自动重启链路端到端复验）；「未完成项 / 遗留」列的是不阻塞收口的边界与上游事项。
- 背景：008 完成检测，判定 2/9 不兼容、其余兼容；用户批准按报告修复（本报告登记时为 008 的续接交接）。

## 进展

- **功能 9**（`src/chat-history/index.js` 重写）：`installChatHistory()` 不再收 `sessions` 服务——当前会话从 DOM 派生（`[class*="_sessionRow"][aria-selected="true"]` 与 `_searchResultRow` 的选中行 + `rowId` fiber 反查），keydown 时 `syncSession()` 比对现读值、变了才退导航态，`snapshot().sessionId` 同样现读。单测 28/28，`verify:chat-history` 14/14。
- **功能 2**（`src/context-menu-feature/index.js`）：fork 后的 `sessions.open(childId)` 换成 `openSessionRow()`——侧栏轮询行 id 等于 childId 的行并 `click()`（3 秒窗口、150ms 间隔），超时 `console.warn` 出声放弃。`verify` 的 fork 断言改为 DOM 级双分支：桩返回真实未选中行的 id → 该行随后 `aria-selected`；不存在的 id → 出声且零导航。25/25。
- **功能 4**：常驻规则补 `[data-chat-flow-key]` 锚点（保留 `[data-time-hover-root]` 兼容 0.1.5）；验证脚本按锚点在不在场分两个 world（hover-root 走 0→1 前后差，upstream-always-on 走「恒 1 + 规则在表里」），dispose 复原判据同步分 world。`verify:timestamps` 10/10。
- **dot C 组**：`flip()` 挂 MutationObserver 守卫翻主题撑到截图结束、`unflip()` 还原（「同一次求值内摘读还原」撑不住截图往返）。20/20。
- **selection**：输入框段整体重写——composer（Lexical contenteditable）走真实 DOM Range 选区测 range 路径；field 路径改用合成单行 `<textarea>`（页面上不再有现成可写大控件）；新增空 composer 无选区「不弹也不吃事件」的 0.1.6 世界判据。19/19。
- **实跑中新发现的漂移（报告未列）**：菜单 metrics 断言撞出 0.1.6 上游默认档三处变化——圆角 12→20px、去描边、阴影换 `--dsw-elevation-prominent`（含 `--dsw-elevation-stroke-color` 那条 0.5px 描边），`MENU_CSS` 逐项跟齐；「不压正文」断言撞出带 `M/D ` 前缀的标签（实测 67–74px）超出 56px 留白，`--dsh-oi-ts-gutter` 默认提到 80px；Started 重算的 oracle 没复刻日期前缀（跨午夜必差），补为日期感知。
- 全量读数（最终产物两轮连跑 + 补跑，测试栈 0.1.6-alpha.2）：`npm test` 28/28；`verify` 25/25；`verify:timestamps` 10/10；`verify:dot` 20/20；`verify:selection` 20/20；`verify:chat-history` 16/16；`verify:row-states` 24/24；`verify:settings` 17/17。README「当前已兼容版本」已补 0.1.6-alpha.2。
- **扩项① 功能 6 空态粘贴（完成，实跑绿）**：`src/selection-menu/index.js` 加 `probeEditable`（contenteditable 判据照表单控件语义：其内有非折叠选区给「复制+粘贴」，空态给「只粘贴」，快照 `{ kind:'editable' }`）；`clipboard.js` Snapshot/restore/pasteInto 跟上。`verify:selection` 空 composer 断言改为「只给粘贴 + 吃掉事件 + Esc 收尾」。
- **扩项③ 功能 9 单轮兜底（完成，实跑绿）**：`nav-rail.js` 加 `findFlowPrompts()`（`[data-chat-flow-kind="user"]` 行气泡全文），`readHistory()` rail 优先、读空退兜底——上游 `TurnNavigator.tsx` 对 `<2` 轮不渲染导航列，单条提问此前 ↑ 拿不到。`verify:chat-history` 加「真实单轮会话 ↑ 调出提问、再按不越界」两条。
- **扩项② 侧栏列表清空（定位完成，处置落地并复验）**：根因在 harness 0.1.6-alpha.2 的 host-HMR——`session-query-sqlite` 配置一变即热重挂，连带摘除 `sessionController` 且可能静默挂起，此后所有 `session/*` RPC 报 `gateway/service-unavailable`，新页面目录恒空、只有重启进程可靠（触发者是 verify:settings 的真实写入；裸写 patch 文件同样复现，改无关条目无事；取证与最小复现见 [docs/harness-hmr-session-defect.md](../harness-hmr-session-defect.md)）。仓内处置：功能 8「会话检索」卡整卡改 `'restart'` 口径 + 说明要求保存后立刻重启（`verify:settings` 断言 10 随之改判「重启级标记恰好是会话检索全卡 6 键」）；test-stack 加 `restart` 命令（npm 别名 `stack:restart`）；`verify:settings` 收尾对默认目标自动重启——复跑链 settings 17/17 → 自动重启 → 侧栏探针 28 行 → selection 20/20。缺陷本体在上游，本仓无法根治。
- 套件连跑时 verify:selection 第 1 段实测一次偶发（选区在右键前被 React 重渲染掐掉，同产物单跑必过）：第 1/2 段加「重选重试一次」加固后再跑 20/20。

## 决策与理由

- 008 的「完成」以用户批准报告修复方向为确认信号：检测任务的交付物就是那份报告，修复本体路由到本交接。
- 功能 9 未装报告方向里提的侧栏 MutationObserver：本功能只在 keydown 时起作用，会话在两次按键之间怎么换都不需要即时知道——派生改为按键与 snapshot 两个时刻的现读，行为等价且少一个观察整棵侧栏子树的成本。报告的方向句保留为「可用方案」而不是唯一解。
- 功能 6 空 composer 的行为差异起初记为「超出报告授权、待拍板」；用户已拍板扩项进 009——给 contenteditable 补空态判据，恢复「可输入的空控件无选区也给粘贴」这条文档契约在 0.1.6 输入框上的成立。
- 菜单 metrics 三处跟着 0.1.6 上游默认档改了：`verify` 的逐键比对断言把「对齐上游」写成硬判据，旧值在 0.1.6 页面上必红。这同时意味着 0.1.5 页面上圆角会差 8px（README 的旧版本行本轮没有重跑）。

## 未完成项 / 遗留

- 变更未提交（等用户指令）。
- 0.1.2-rc.1 / 0.1.1-rc.2 两行兼容声明本轮未在对应版本上重跑——功能 9 的 DOM 派生、功能 6 的 contenteditable 判据与 `MENU_CSS` 新值在旧版本上的表现是推理出来的，不是实测。
- 跨年 `Y/M/D ` 前缀标签仍容不进 80px 留白（实测拿不到跨年会话）。
- harness 热重挂缺陷本体在上游：报缺陷材料已备齐（docs/harness-hmr-session-defect.md），是否提交给上游等用户决定；其余会话栈条目（`session-reference` 等 4 个）未逐条实测，警示范围只钉在 `session-query-sqlite`。
- verify:settings 中途 abort 的路径不经过收尾自动重启，需手动 `npm run stack:restart`（已写进 verify.md 功能 8 段）。
