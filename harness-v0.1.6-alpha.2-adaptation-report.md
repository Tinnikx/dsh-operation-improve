# harness v0.1.6-alpha.2 适配检测报告

检测日期 2026-09-20/21。目标版本经两路 CLI 实测：dev 仓 `apps/cli/lib/bin.js --version` 与 desktop dist 的 `@deepseek-ai/dsh --version` 都是 **0.1.6-alpha.2**。测试栈（独立 `DSH_HOME=tmp/dsh-oi-test-home`、端口 3181、CDP 9334）跑的就是这份构建；harness 日志在 `tmp/dsh-oi-stack/harness.log`。

本轮是**检测**，不是适配完成：README 的「当前已兼容版本」不加 0.1.6-alpha.2，直到功能 2/9 的修复落地并全绿。

## 结论一览

| 功能 | 判定 | 依据 |
| --- | --- | --- |
| 1 多选 | ✓ 兼容 | 行识别与 `data-dsh-oi-selected` 路径在 0.1.6 实跑正常（`verify:row-states` 的叠加断言 + 侧栏实机截图）；注入式 `verify` 因脚本桩崩坏未跑完（见「验证脚本漂移」） |
| 2 右键菜单 | ✗ 不兼容（一处） | 菜单本体正常；**fork 动作调 `sessions.open(childId)`，0.1.6 的 `ISessions` 契约已无 `open`**（`packages/api/session-controller/src/client/contract/sessions.ts` 全表面核对），点击必抛。改名/归档路径的服务（`binding().rename`、`workspaces.archiveSession`、`sessions.fork`）仍在契约上 |
| 4 时间戳 | ✓ 兼容（一处死代码） | `[data-chat-flow-key]` 行标记与 fiber 路径完好（8 个会话实测 flowRows 20–117）；「上游三类改常驻」的锚点 `data-time-hover-root` 在 0.1.6 已消失，但上游自己改成常驻（`_timeStart/_timeEnd` computed opacity 恒 1），插件那条 `!important` 规则变成永不误触的死代码 |
| 5 活跃标记配色 | ✓ 兼容 | `verify:dot` A/B 组 18/18 过（深青、四档 opacity、对比度提升、兄弟状态不误伤全中）；C 组 2 条失败是脚本漂移（见下） |
| 6 选区菜单 | ✓ 兼容（待脚本适配复证） | 插件的命中判定走 `isContentEditable`，0.1.6 composer 仍是 `div[contenteditable][role="textbox"]`（实测在场）；脚本预检找 `textarea` 的假设失效导致未跑完 |
| 7 思考区限高 | ✓ 兼容 | `[data-variant='think'] [class*='_thinkBody']` 结构在 0.1.6 页面实测在场 |
| 8 Harness 高级配置 | ✓ 兼容 | `verify:settings` 17/17 全绿（真面板、真 patch 字节、真卸载重装） |
| 9 历史导航 | ✗ 不兼容（根因明确） | 0.1.6 的 `SessionListState` 形状为 `{ids, byId, phase, subagentsByParent, jobsBySession}`——**`current` 字段被移除**，「当前会话」搬进 ui-workspace 的 navigation 内部 store（persist 键 `dsh.sessions.current`，无服务令牌可注入）。插件读 `sessions.list.getSnapshot().current` 恒 undefined → snapshot `sessionId:null`、↑ 不接管（实测复现） |
| 10 行状态样式 | ✓ 兼容 | `verify:row-states` 24/24 全绿（0.1.6 构建上实跑） |

## 修复方向（待批准后另开实现）

- **功能 9 的当前会话**：改从 DOM 派生——`[class*="_sessionRow"][aria-selected="true"]` + `rowId()` fiber 反查 + 侧栏子树 MutationObserver。与插件既有架构同构（功能 10 已验证 `aria-selected` 是 TSX 字面量、跨版本稳定）。
- **功能 2 的 fork 后打开**：`sessions.open` 没了，且 `sessions.retain(id, {source:'mainView'})` 只建引用不动 UI。可行路径是 DOM 级：fork 返回 childId 后在侧栏找到该 id 的行并 click，走应用自己的 onOpen→navigation。
- **功能 4 的死锚点**：`TIMESTAMP_CSS` 的常驻规则补 `[data-chat-flow-kind]` 新锚点（保留旧锚点兼容 0.1.5），或删除该规则并记录「0.1.6 起上游自己常驻」。

## 验证脚本漂移（与插件兼容性问题分开）

- `verify`（功能 1/2）与 `verify:timestamps` 的注入桩：产物顶层 require `react`/`react/jsx-runtime`/`@deepseek-ai/dsh-client-ui-primitives`（功能 8 起），桩表已补（被调到即抛的设计）。
- `verify:dot` C 组：0.1.6 主题控制器两帧内写回 `data-ds-dark-theme`，跨 evaluate 翻主题失效，需改成同一次求值内摘读还原（`verify:row-states` 同款修法）。
- `verify:selection` 预检找 `textarea`：0.1.6 无隐藏 textarea，改找 contenteditable composer。
- `verify:timestamps` 的 `good()` 谓词里 `upstreamTimes` 选择器挂 `data-time-hover-root`，随锚点修复同步更新。

## 环境事件（本轮前置，用户授权）

- dev 仓重建：`tsc -b --force`（host+client）+ `build:lib` + `build:web` 全绿；`build:native-system` 因产品 node 缺 Node-API 头文件未跑，实测不需要。
- 17 个 git 未跟踪的孤儿构建残留挪至 `/tmp/deepseek-harness-stale-pkgs-20260920`（含卡住 tsdown 的 `workflow-worker-thread`）。
- 观察项：侧栏会话列表曾在套件连跑后整体清空且刷新不恢复、重启 harness 恢复。009 轮已定位：harness 0.1.6-alpha.2 的 host-HMR 热重挂缺陷，触发者是 verify:settings 对 `session-query-sqlite` 的写入——根因链、最小复现与处置见 [docs/harness-hmr-session-defect.md](docs/harness-hmr-session-defect.md)。
