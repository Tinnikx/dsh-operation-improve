# 029 harness 0.2.2-alpha.3 适配 + 移除侧边栏插件右键菜单

- 目标：插件在 harness 0.2.2-alpha.3 上构建、加载、十套 live 验证通过；侧边栏工作区行与会话行的插件右键菜单全部移除，右键交还官方原生菜单；同时核对 13 项功能里哪些官方已有等价实现，给出证据表。
- 范围：`src/`、`scripts/`、`package.json`、README 与 `docs/`、`lib/` 构建产物、`handoff.md`。不改 harness 本体，不改真 home 的 profile 配置。

## 进展

- 已确认 desktop 打包树版本 `0.2.2-alpha.3`：读 `../dsh-desktop/dist/desktop/dsh-linux-x64/resources/app/node_modules/@deepseek-ai/dsh/package.json`。
- 已确认 alpha.3 新增 `@deepseek-ai/dsh-client-ui-context-menu`，且 `dsh-client-ui-workspace` 的 `ProjectRow` / `SessionNodeItem` 都通过 `getTriggerProps()` 绑定了官方右键菜单；工作区行另有 `[data-context-menu-trigger]` 的「...」按钮。官方没有 ctrl/cmd 多选。
- 已确认本插件功能 2 在 document 捕获阶段接管 `contextmenu` 并 `preventDefault`，会把官方菜单挡掉；用户确认按「删除全部侧边栏插件右键菜单」处理。
- 测试栈首跑失败：`node scripts/test-stack.mjs up` 报「副本的 dsh.profile.bundles 里没有本插件」，退出码 1。根因是真 home `~/.dsh/profiles/web/package.json` 的 bundles 名单已不含本插件（依赖与 cordis.patch.yml 区段仍在）。`rescopeManifest()` 已改为缺项就补，不再退出。
- 已删 `src/context-menu-feature/index.js`、`src/shared/slot-rows.jsx`，客户端不再安装右键监听；`src/client/index.js` 的 `inject` 减到 `['workspaces','sessions','locale','slots']`。
- `scripts/verify-live.mjs` 重写为 5 条选择断言 + 3 条右键交还官方 + 1 条卸载断言；`verify:selection` 删掉功能 2 断言；`verify:find` 的 Esc 让位改由功能 6 的选区菜单验证。两套首跑各红 1 条，修正后全绿。
- README 锚定 0.2.2-alpha.3，十套 197 条全绿；适配报告已写。

## 决策与理由

- 移除范围选「全部侧边栏行菜单」而不是只删工作区行：官方 alpha.3 对两类行都提供了原生菜单，插件继续接管只会挡住官方实现；代价是功能 1 的批量删除入口消失（官方没有多选），用户已确认接受。
- 真 home 的 profile 不动：修改用户配置属于仓库外副作用，测试栈改为在副本里补齐 bundles 项。

## 测试cases

## 验证

- `node --test tests/*.test.mjs`：tests 46 / pass 46 / fail 0（`tmp/adapt-a3/tests.log`）。
- `node scripts/check-catalog-schema.mjs`：PASS 19 卡 / 83 字段（`dsh=0.2.2-alpha.3`，`tmp/adapt-a3/catalog.log`）。
- 构建：`DSH_ESBUILD_ROOT=… node scripts/build.mjs` → `lib/client.js + lib/index.js built`。
- 十套 live 在同一 bash 调用里起栈后串行跑，合计 197 条，全部 `failed=0 skipped=0`：timestamps 10、dot 21、selection 18、chat-history 16、find 19、row-states 35、provider-band 29、auto-load-older 8、verify 9、settings 32（`tmp/adapt-a3/summary.txt` 与各套日志）。
- `verify` 套件的右键读数：工作区行、会话行、多选后右键均为 `{defaultPrevented:true, plugin:0, official:1}`，多选选择集仍为 2 项；`dispose()` 后 `styleGone/handleGone/highlightsGone` 全为 true，官方菜单仍在。
- `verify:find` 的 Esc 让位读数：`{"inside":true,"prevented":true}`，一次 Esc 收菜单、条留着，二次 Esc 收条。
- 官方功能重叠审计表与逐条证据写进 [harness-v0.2.2-alpha.3-adaptation-report.md](../../harness-v0.2.2-alpha.3-adaptation-report.md)。

## 追加：三击选中延迟（查找高亮样式按需挂载）

- 现象：装上插件后，在正文里快速三击选中整段，选区出现的观感比不装插件慢一档。
- 定位：在测试栈上用 `Input.dispatchMouseEvent` 发 `clickCount:3`，读 Event Timing 的 click `duration`（含处理与下一帧呈现）。整张插件样式表在场时中位 72ms，摘掉整张表后 56ms；逐段拆分后只有 `FIND_CSS` 里两条 `::highlight()` 贡献这 16ms（单留这两条规则就是 72ms，只留查找条其余样式是 56ms）。JS 监听器逐项 dispose 没有可重复的差值。
- 改法：`::highlight()` 两条规则从常驻的 `FIND_CSS` 拆成 `FIND_HIGHLIGHT_CSS`，由 `src/find/index.js` 在 `paint()` 有命中时挂到 `<head>`、无命中或 `close()`/`dispose()` 时摘掉。选区变化不再为不存在的高亮解析样式。
- 验证：`node --test tests/*.test.mjs` 46/46；`node scripts/verify-find-live.mjs` 19/19（含关条后两个注册名归零、重开后高亮重新挂载、`dispose()` 后 Ctrl+F 不再被接管）；构建成功。样式表在场/禁用的交替测法在同一会话里仍余约 8ms 差值（headless 软件渲染噪声大，绝对值随机器负载漂移），但 `::highlight` 那 16ms 已消失。
- 边界：只在 headless 测试栈上测过，没在用户桌面窗口的 GPU 渲染下复测。
- 后续实测（同一测试栈，正文 vs 消息里的粗体短标题）：三击后最后一次 `selectionchange` 在正文约 410–490ms，短标题约 250–270ms；把插件的 `timestamps`、`selectionMenu`、`find`、`multiSelect`、`chatHistory` 逐个 dispose、再移除整张样式表，正文读数仍是 410–460ms。CPU profile 里主线程耗时集中在官方 `dsh-client-ui-chat` 的 `available()`（正文 170–190ms，短标题 80–100ms），它每次选区变化都会对整段消息重算投影。结论：**按需挂载消掉的是插件自己的 16–48ms；剩下约 200ms 的体感差距来自官方文本选择交互，插件全停也在**。这段差距不在本插件能修的范围内，除非改上游 `dsh-client-ui-chat`。
- 决定：插件侧不再改（用户确认），三击正文剩下的约 200ms 作为已知上游限制挂着；上游版本变化后再复测。

## 未完成项与下一步

- 无。

## 坑

- 测试栈的 `rescopeManifest()` 原先假设真 home 的 bundles 一定含本插件；dshmarket 重写 profile 后会静默移除，表现为测试栈直接退出。
