# harness 0.1.6 热重挂缺陷：改 session-query-sqlite 会杀死会话服务

2026-09-21 在 0.1.6-alpha.2（dev 仓构建，测试栈实跑）上定位。完整过程读数在当时的 `tmp/sidebar-empty-investigation.md`（临时件，不入库）；这里是缺陷本体与复现步骤。

## 症状

profile 的 `cordis.patch.yml` 里 `session-query-sqlite` 条目发生任何配置变更后 1–3 秒：侧栏工作区行仍在且 `aria-expanded="true"`，会话行全空；`Page.reload` 不恢复，**连撤销写入都不恢复**，只有重启 harness 进程可救。宿主日志零输出，进程存活、CPU 空闲——挂起型而非崩溃型。新开的页面（不加载任何插件代码）同样空，渲染层与本插件均排除。

## 根因链（源码锚点为 dev 仓 0.1.6-alpha.2）

1. `dsh web --profile web` 的 base bundle 挂了 host HMR（`packages/bundle/base/package.json` 依赖 `@deepseek-ai/dsh-hmr`），它 watch profile 的 patch 文件（`packages/boot/hmr/src/index.ts` 的 `watchConfig → refresh`），内容一变即调 `reconcileProfilePatches` 对根 Include 做 `entry.update` 热重挂（`packages/boot/app-boot/src/index.ts`）。
2. `sessionController` 静态注入 `sessionQuery`（`packages/api/session-controller/src/index.ts` 的 `static inject`）。热重挂 `session-query-sqlite` 时 `sessionController` 被摘除且**不再重新提供**，reconcile 静默挂起、无超时无日志——此后本进程代内 `ctx.get('sessionController')` 恒非对象。
3. 客户端每个 `session/*` RPC 收到 `gateway/service-unavailable`（`packages/api/gateway/src/index.ts` 的 `prepareInvocation`）；`manager.refreshList()` 走错误分支置 `listState='error'`，`SessionListState.ids` 恒空，**而列表的 error 态没有上屏**——这就是「页面正常渲染、无错误界面、只是空」。工作区行走 `workspaceController`，不受影响，故形态恒为「工作区在、会话全无」。

## 最小复现（确定性，实测两轮）

健康测试栈（`npm run stack:up`，侧栏 28 行）上任选其一：

- 走插件路由：`POST /operation-improve/harness-config`，body `{"ops":[{"id":"session-query-sqlite","field":"defaultLimit","op":"set","value":31}]}` → 返回 200 后 2 秒内新开页面 0 会话行。
- 绕过插件：直接向 `profiles/web/cordis.patch.yml` 追加一段合法重述的 `session-query-sqlite` 条目覆盖 → 3 秒后新开页面 0 行，控制台出现 `control stream failed: ... active Service "sessionController" is unavailable`。

对照：改**无关**条目（`file-reference-local`）无影响——致死的是这个条目本身。触发面不止本插件：用户手改该条目、`dsh plugin` 改 profile 走的是同一个 watcher。

## 对本仓库的影响与处置

- 功能 8 的「会话检索」卡按 `'restart'` 口径标注并写明该缺陷（[catalog-model.js](../src/harness-config/catalog-model.js)）——止损，不是治病：手写文件同样触发。
- `verify:settings` 全量实跑必写该条目，跑完测试栈需重启 harness 才能继续跑会话相关脚本（见 [verify.md](verify.md) 功能 8 段）。
- 其余会话栈条目（`session-reference`、`session-title`、`session-title-llm`、`session-projection-cache`）是否同样致命**未逐条实测**；警示范围目前只钉在 `session-query-sqlite`。

## 上游期望的修复方向（报缺陷时附）

热重挂对含下游的服务做原子级联重建，失败可观测（现在零日志）；reconcile 挂起要有超时/告警；侧栏消费 `list.state==='error'` 时给出「加载失败/重试」界面而不是静默空列表。
