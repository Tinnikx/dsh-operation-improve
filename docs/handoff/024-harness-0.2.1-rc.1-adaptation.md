# 024 harness 0.2.1-rc.1 适配

- 目标：把锚定版本从 0.2.1-alpha.1 抬到 **0.2.1-rc.1**，功能 1-11 全部实跑通过。验收方式：`npm test` 零 fail、`npm run check:catalog` PASS、八套 `verify:*` 连跑 `failed=0 skipped=0`。本轮完成后，锚定版本从 0.2.1-alpha.1 改为 0.2.1-rc.1 并发布 0.1.6。
- 范围：上游版本漂移导致的本插件行为变化（分叉项断链、设置入口改道）与验证现场变化；不顺手重构、不动与本轮无关的代码。

## 进展

- **版本与材料**：desktop dist 的 `@deepseek-ai/dsh` = `0.2.1-rc.1`（`~/.dsh/desktop-bin/node-shim/node <bin> --version` 与 `bin.js` 同级 `package.json` 三处一致；本机 `.pnpm` 同时存有 alpha.3 / alpha.4 / rc.1）。比对材料：alpha.1 那 298 个 `@deepseek-ai` 包解包在 `tmp/upstream/a1/`（脚本 `tmp/upstream/fetch-a1.sh`，版本取自 dsh-desktop 在 `030f611` 的 `pnpm-lock.yaml`），rc.1 取本机 `.pnpm` 现装 dist。
- **config schema delta**（`tmp/upstream/schema-delta-a1-rc1.mjs`，材料 `tmp/schema-a1.json` 与 `tmp/schema-rc1.json`，同一测试栈 home、同一 `web` profile dump）：entry 198 → 205、字段 487 → 518（新增 66 / 移除 35 / 变化 2）。绝大部分新增来自真 home 名册里的第三方/实验 bundle，**不在本插件镜像面上**；落在镜像面上的只有 `llm-deepseek-account` 一条（`models` 移除，新增 `modelsTimeoutMs` / `modelsMaxAgeMs` / `modelOverrides`），其中前两枚数值键收进清单，第三枚是对象不收。
- **一条真断裂（功能 2）**：rc.1 的 `ForkSessionMenuItem` 取标准 keyed hook `useSessionAccess(sessionId, 'session/fork')`（`dsh-client-ui-workspace/src/client/session-actions/ForkSession.tsx:17`），该 hook 由 `dsh-client-ui-session` 在 `ctx.slots.provideRoot({ keyedHooks: { sessionAccess } })` 发布，解到 `ctx.remoteAccess.source('session', id, action)`（`dsh-client-ui-session` 的 `state.ts` `resource()→cached()`，身份稳定）。本插件在 [src/shared/slot-rows.jsx](../../src/shared/slot-rows.jsx) 里自建 standard face，原先只有 `useWorkspaces`，于是这一项渲染时抛 `TypeError: useSessionAccess is not a function`，被自己的 `EntryBoundary` 吃掉 → **「分叉会话」整项从右键菜单消失**。
- **一条真漂移（功能 8 入口）**：rc.1 侧栏页脚只剩一枚「账号菜单」按钮（`aria-label` = 中「账号菜单」/ 英 `Account menu`，`aria-haspopup="menu"`）；点它弹出的菜单项为 `[设置, 意见反馈, 登录]`（`dsh-client-ui-settings-account/src/client/locales.ts`），点「设置」才打开 `[data-shortcut-modal="settings"]`。原先「页脚那枚按钮直接开设置面板」的选择器因此失效，`verify-live` 的切语言、`verify-settings` 的开面板都改走这两步。
- **会话单选菜单自动多一项**：rc.1 在 `sidebar.workspaces.session.menu.item` 新增第 5 条 `session-id`（order 450，`SessionIdMenuItem` + `IconCopyOutlineRegular`，文案 `menu.sessionId` = 「复制 Session ID」）。本插件照上游 slot 账本渲染，实测**自动跟上**；实测顺序 `[置顶会话, 重命名, 分叉会话, 归档会话, 复制 Session ID]`。
- **测试栈现场新变量**：副本没有凭据，rc.1 页面加载会依次弹「预览版说明」（继续）与「配置 API 密钥」（稍后配置）两步 `OnboardingModal`。它们是模态层，按时序独占 `Escape` 并把焦点钉在输入框上——`verify` 的 `escape closes` 因此在收掉之前是红的（菜单被 `isBehindModal` 拦下不处理 Esc）。

## 决策与理由

1. **standard face 补 `useSessionAccess` 而不是绕过 fork 项**：绕过（本地补一项自己的分叉入口或过滤掉这一条）会让菜单与上游「...」菜单不再逐项一致，而逐项一致正是功能 2 的设计口径。取法与已有的 `uiWorkspace` 同一路：`ctx.get('remoteAccess')` → `source('session', id, action)` 这个 `HostObservable<boolean>` → 选择器 hook（`sessionAccessHook(deps)` + 恒 false 的 `DENIED_ACCESS` 兜底）。
2. **菜单项 4 → 5 是上游账本变化，本插件不改代码，只改验证期望**：`verify` 与 `verify-selection` 里「会话单选菜单应有上游那 N 项」的判据、以及逐项比对的对齐长度随之更新。
3. **功能 8 收 rc.1 账号侧的两枚数值键**：`llm-deepseek-account.modelsTimeoutMs`（number / default 5000 / min 5e-324 / max 2147483647）与 `modelsMaxAgeMs`（integer / default 600000 / min 0 / max 9007199254740991）都过收录口径——只有 cordis entry config、无 settings 命名空间、账号 provider 的 `resolveAccountOptions` 真的读它们、值是数字、entry config 里没有 `__jsExpr`。同一批新增里 `modelOverrides` 是对象（口径 #3 不收），其余或撞口径（`tool-fs.*` preset 平面、`session-persistence-jsonl.listConcurrency` 带 `__jsExpr`、`ui-theme.*` 有 settings 命名空间、`webserver.tls` 对象 + `__jsExpr`）或来自非镜像面上的第三方 bundle。 `modelsTimeoutMs` 的 `min: 1` 是面板防呆（上游只要求正数，亚毫秒超时没有意义）；两张卡的 `default` 与上游相等，`max` 都是上游硬抛的界。清单因此从 19 卡 / 81 字段变成 19 卡 / 83 字段，`verify:settings` 补 12e/12f 证明新字段只写到账号那条 entry。
4. **副本剥除从「只剥主题插件」升格为「只留 base harness + 本插件」**：真 home 名册挂着 14 个非 base 的第三方/实验 bundle，`ds-bot` 占住上游单槽 `sidebar.workspaces` 致侧栏工作区树 0 行——单剥一个主题插件挡住的是同一类问题的一个个例。白名单 = `@deepseek-ai/dsh-base` / `@deepseek-ai/dsh-web-app` / `@Tinnikx/dsh-operation-improve`；`DSH_OI_KEEP_EXTRA_PLUGINS=1` 整段跳过、`DSH_OI_KEEP_THEME_PLUGIN=1` 只额外保留 `dsh-any-background`。
5. **引导框在每个 reload 之后统一收掉**：抽成 [scripts/lib/onboarding.mjs](../../scripts/lib/onboarding.mjs) 的 `dismissOnboarding()`，八套里除 `verify-settings`（按字节比对 `cordis.patch.yml`，点「继续」会写已读标记）外全部调用。理由见上文第 5 条真漂移段，属于「现场修正」，不是判据放水。

## 测试 cases

验收命令与实测读数（同栈同构建一次连跑，日志在 `tmp/upstream/rc1-*.log`）：

- `npm test` → **pass 46 / fail 0**。
- `npm run check:catalog` → **PASS**，`dsh=0.2.1-rc.1`，19 卡 / 83 字段逐键对上游 schema（type/default 相等，上游边界不更松）。
- 八套 live 连跑，**合计 182 条，failed=0 skipped=0**：
  - `verify` 29/0/0/29、`verify:timestamps` 10/0/0/10、`verify:dot` 21/0/0/21、`verify:selection` 20/0/0/20
  - `verify:settings` 32/0/0/32、`verify:chat-history` 16/0/0/16、`verify:row-states` 35/0/0/35、`verify:find` 19/0/0/19

## 未完成项与下一步

- `verify:row-states` 的第三方现场复跑（`DSH_OI_KEEP_THEME_PLUGIN=1`）本轮**未跑**：它验的是那条 SKIP 守卫，需显式换现场，与适配主路径正交。

## 坑

- **`fetch-a1.sh` 里 tarball 文件名不能带 `/`**：`$spec` 是 `@deepseek-ai/<name>@<version>`，直接当文件名会写进不存在的子目录，curl 静默失败（`-sfL` 不报错，只是退出码非零），表现为「downloaded: 0 / extracted: 0」。
- **`a1-specs.txt` 要连 lockfile 键里的 `(...)` 哈希一起剥**：pnpm 的键形如 `'@deepseek-ai/dsh@0.2.1-alpha.1(844b3fc…)'`，只剥 `(@deepseek-ai…)` 那种 peer 后缀会留下裸括号，`sh -c` 直接语法错。
- **`npm run build` 必须带 `DSH_ESBUILD_ROOT`**：不带会 `Error: esbuild not found under /home/kaixiang/dev/co-creation-project (set DSH_ESBUILD_ROOT)`——本机 esbuild 在 dsh-desktop 侧，用 `DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop`。
- **所有 verify 与 `npm test` 都要带 `PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH`**：默认 PATH 上的 node 是 nvm v16，`fetch` 未定义，CDP 连接器第一行就抛 `ReferenceError: fetch is not defined`。
- **仓库里没有 lint 脚本**（`npm run lint` 不存在）。
