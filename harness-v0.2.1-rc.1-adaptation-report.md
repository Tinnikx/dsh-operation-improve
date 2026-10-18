# harness v0.2.1-rc.1 适配报告

锚定版本从 0.2.1-alpha.1 → **0.2.1-rc.1**（desktop dist `@deepseek-ai/dsh` 的 `package.json`、`lib/bin.js --version`、`getDshRuntimeVersion()` 三处一致；本机 `.pnpm` 同时存着 alpha.3 / alpha.4 / rc.1，`harnessBin()` 优先取 dist 那一份，因此所有 verify 与 `check:catalog` 都打在 rc.1 上）。沿用单版本锚定口径，不保留旧版本兼容路径。本轮发布 **0.1.6**。

## 比对材料

- **config schema 两版 dump + delta**：`tmp/upstream/schema-delta-a1-rc1.mjs` → `tmp/schema-delta-a1-rc1.json`（材料 `tmp/schema-a1.json` 与 `tmp/schema-rc1.json`，同一测试栈 home、同一 `web` profile dump）。
- **镜像面**：alpha.1 ↔ alpha.3 的九个镜像面对读在 `tmp/upstream/mirror-a1-a3.mjs` / `mirror-a1-a3.log`；rc.1 无法沿用同一方法（`.pnpm` 里只在 alpha.3 下留有 `dsh-client-ui-primitives`，rc.1 的客户端包是打进 dist bundle 的，没有可逐字节对读的独立包目录），因此 rc.1 的镜像面漂移改用**八套 live 实跑坐实**。
- **实测读数**：`tmp/upstream/rc1-verify*.log`（八套连跑 + 单独复跑）、`rc1-verify-settings.log`。

## rc.1 相对 alpha.1 的变化（落在本插件上的部分）

### config schema delta（`tmp/upstream/schema-delta-a1-rc1.json`）

entry 198 → 205、字段 487 → 518（**新增 66 / 移除 35 / 共有键约束变化 2**）。绝大部分新增/移除来自真 home 名册里的第三方与实验 bundle，不在本插件的镜像面上。落在镜像面上的只有 `llm-deepseek-account` 一条：`models` 被移除（配置里写了它会让条目加载失败），新增 `modelsTimeoutMs`（number / default 5000 / min 5e-324 / max 2147483647）、`modelsMaxAgeMs`（integer / default 600000 / min 0 / max 9007199254740991）与 `modelOverrides`（对象）。**本轮收前两枚数值键**，`modelOverrides` 按口径 #3（值必须是数字或布尔）不收；其余新字段或撞口径（`tool-fs.*` 落在 preset 平面、`session-persistence-jsonl.listConcurrency` 带 `__jsExpr`、`ui-theme.*` 有 settings 命名空间、`webserver.tls` 是对象且带 `__jsExpr`），或来自非镜像面上的第三方 bundle。清单现为 19 卡 / 83 字段，对 rc.1 schema 全绿。

### 一条真断裂：会话行「分叉会话」整项消失（功能 2）

rc.1 的 `ForkSessionMenuItem` 取标准 keyed hook `useSessionAccess(sessionId, 'session/fork')`（`dsh-client-ui-workspace/src/client/session-actions/ForkSession.tsx:17`）。该 hook 由 `dsh-client-ui-session` 在 `ctx.slots.provideRoot({ keyedHooks: { sessionAccess } })` 发布，解到 `ctx.remoteAccess.source('session', id, action)`——`dsh-api-remote-access` 挂的 `super(ctx, 'remoteAccess')` 服务给出的身份稳定 `HostObservable<boolean>`（`dsh-client-ui-session/src/client/state.ts` 的 `resource()→cached()`）。

本插件在 [src/shared/slot-rows.jsx](src/shared/slot-rows.jsx) 里自建 standard face 渲染上游 slot 条目（上游渲染器把整份 standard 面摊成 props 给每条条目，见 `dsh-client-ui-renderer/src/client/scoped-slots.tsx`），原先只有 `useWorkspaces`。于是这一项渲染时抛 `TypeError: useSessionAccess is not a function`，被本插件自己的 `EntryBoundary` 吃掉 → 「分叉会话」从右键菜单消失，而上游自己的「...」菜单仍有该项。

**修复**：standard face 补上 `useSessionAccess`（`sessionAccessHook(deps)` 取 `ctx.get('remoteAccess')` 的 `source('session', id, action)`，恒 false 的 `DENIED_ACCESS` 作服务缺席时兜底），`SlotRow` 把整份 standard 透传给条目组件。**不绕过 fork 项**：绕过（本地自建分叉入口或过滤掉这一条）会让菜单与上游「...」菜单不再逐项一致，而逐项一致正是功能 2 的设计口径。

### 会话单选菜单自动多一项

rc.1 在 `sidebar.workspaces.session.menu.item` 新增第 5 条 `session-id`（order 450，`SessionIdMenuItem` + `IconCopyOutlineRegular`，文案 `menu.sessionId` = 「复制 Session ID」）。本插件照上游 slot 账本现读现渲染，实测**自动跟上**，无需改代码；实测顺序 `[置顶会话, 重命名, 分叉会话, 归档会话, 复制 Session ID]`。验证期望（`verify`、`verify:selection` 里按项数逐项相等的判据）随之从 4 改成 5。

### 功能 8 设置入口改道

rc.1 侧栏页脚只剩一枚「账号菜单」按钮（`aria-label` = 中「账号菜单」/ 英 `Account menu`，`aria-haspopup="menu"`）；点它弹出的菜单项为 `[设置, 意见反馈, 登录]`（`dsh-client-ui-settings-account/src/client/{AccountMenu.tsx,locales.ts}`），点「设置」才打开 `[data-shortcut-modal="settings"]`。原先「页脚那枚按钮直接开面板」的选择器失效 → `verify` 的切语言分支与 [verify-settings-live.mjs](scripts/verify-settings-live.mjs) 的 `openPanel()` 都改走「账号菜单 → 设置」两步。

### 页面加载多两步引导框（验证现场变化）

副本没有凭据，rc.1 页面加载会依次弹「预览版说明」（按钮「继续」）与「配置 API 密钥」（按钮「稍后配置」）两步 `OnboardingModal`。两者都注册成模态层，按设计独占 `Escape`（上游 `Menu.tsx:334` 的 `isBehindModal` 让菜单在模态之上时不处理 Esc），并把焦点钉在自己的输入框上——`verify` 的 `escape closes` 因此在收掉之前必红（菜单被拦下不处理 Esc）。**修复**：抽 [scripts/lib/onboarding.mjs](scripts/lib/onboarding.mjs) 的 `dismissOnboarding()`，八套里除 `verify-settings` 外都在 reload 之后调用（`verify-settings` 按字节比对 `cordis.patch.yml`，点「继续」会把已读标记写回 host 配置，故那里只单独收凭据步）。

## 本轮改动

### 代码

- [src/shared/slot-rows.jsx](src/shared/slot-rows.jsx)：新增 `DENIED_ACCESS` 与 `sessionAccessHook(deps)`；standard face 补 `useSessionAccess`；`SlotRow` 渲染改为透传 `...standard`。
- [src/client/index.js](src/client/index.js)：`installContextMenu` deps 加 `getRemoteAccess: () => ctx.get('remoteAccess')`（不列进 `inject`）。
- [src/context-menu-feature/index.js](src/context-menu-feature/index.js)：deps 契约文档补 `getRemoteAccess`。
- 功能 8 清单（[src/harness-config/catalog-model.js](src/harness-config/catalog-model.js)）：账号卡新增 `modelsTimeoutMs`（number / default 5000 / min 1 / max 2^31-1）与 `modelsMaxAgeMs`（integer / default 600000 / min 0 / max 2^53-1），字段说明与卡注释同步到 rc.1 的账号侧三项。

### 测试栈

`scripts/test-stack.mjs` 的副本归置从「只剥第三方主题插件 `dsh-any-background`」升格为「只留 base harness + 本插件」：删掉 `COPY_THEME_PLUGINS` / `COPY_SIDEBAR_PLUGINS` 两套特判，改成白名单 `BASE_BUNDLES = ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app']` + 本插件，`stripCopyExtraPlugins()` 在 `syncHome()` 里把其余 bundle 从副本 profile 的 `dependencies` 与 `dsh.profile.bundles` 两处一并摘掉（实测剥 14 个，真 `~/.dsh` 一个字节不动）。`DSH_OI_KEEP_EXTRA_PLUGINS=1` 整段跳过、`DSH_OI_KEEP_THEME_PLUGIN=1` 只额外保留主题插件。起因是 `ds-bot` 占住上游单槽 `sidebar.workspaces`，把侧栏工作区树整个盖没（0 条 `role="treeitem"`），单剥一个主题插件挡不住同一类问题。

### 验证脚本

- 新增 [scripts/lib/onboarding.mjs](scripts/lib/onboarding.mjs)。
- [scripts/verify-live.mjs](scripts/verify-live.mjs)：切语言改走账号菜单；会话菜单期望 4 → 5（含「复制 Session ID」）；reload 后调 `dismissOnboarding`。
- [scripts/verify-settings-live.mjs](scripts/verify-settings-live.mjs)：`openPanel()` 改走账号菜单 → 设置；补 12e/12f 两断言，写 `llm-deepseek-account.modelsTimeoutMs` 只落账号那条 entry、清除后回到基线。
- [scripts/verify-selection-menu-live.mjs](scripts/verify-selection-menu-live.mjs)：行菜单期望 4 → 5。
- 其余六套（timestamps / dot / chat-history / row-states / find / active-dot 中的 timestamps、dot、chat-history、row-states、find）reload 后加 `dismissOnboarding`。

## 验证结果（真实运行输出）

- `npm run check:catalog`：**PASS 全部字段与上游 schema 一致**（`dsh=0.2.1-rc.1`，19 卡 / 83 字段）。
- `npm test`：**pass 46 / fail 0**。
- `npm run build`（带 `DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop`）：`lib/client.js + lib/index.js built`。
- **八套 live 连跑，合计 182 条，failed=0 skipped=0**（`tmp/upstream/rc1-verify*.log`）：
  - `verify` 29/0/0/29、`verify:timestamps` 10/0/0/10、`verify:dot` 21/0/0/21、`verify:selection` 20/0/0/20
  - `verify:settings` 32/0/0/32、`verify:chat-history` 16/0/0/16、`verify:row-states` 35/0/0/35、`verify:find` 19/0/0/19

## 向下兼容

单版本锚定，不保留旧版本兼容路径。锚定版本即 0.2.1-rc.1。

## 未做

- `verify:row-states` 的第三方现场复跑（`DSH_OI_KEEP_THEME_PLUGIN=1`）本轮**未跑**：它验的是那条 SKIP 守卫，需显式换现场，与适配主路径正交。
- rc.1 的九个镜像面**未做逐字节对读**：rc.1 客户端包打进 dist bundle，`.pnpm` 里没有独立包目录可对读；改用八套 live 全绿作为「镜像面未漂移」的证据。
