# 013 harness 0.1.7-rc.1 适配

- 目标：用 desktop dist 打包的 0.1.7-rc.1 判定本插件的兼容性，漂移处完成适配，产出适配报告与 README 兼容锚定。验收方式：`scripts/test-stack.mjs up` 跑在 rc.1 dist 上 + 七套 `verify:*` 的真实输出 + `npm test`。
- 范围：做——两版发布物对读、测试栈实跑、按归因改插件与验证脚本、README 与报告。不做——harness 上游缺陷的上报以外动作、与本轮归因无关的重构。

## 进展

- 目标版本确认：dist `@deepseek-ai/dsh` 的 `package.json` 与 `lib/bin.js --version` 都是 0.1.7-rc.1，`getDshRuntimeVersion()` 同读数。验证：`node-shim node <dist>/lib/bin.js --version`。
- 比对材料比往轮强：`dsh-desktop/node_modules/.pnpm/` 里 alpha.2 与 rc.1 两版发布物并存，267 个同名 `@deepseek-ai/dsh*` 包可逐包 `diff -rq`（排除 `node_modules` / `.bin` / `package.json`），**54 个包自身代码有差异**。不依赖 dev 仓源码（停在 0.1.6-alpha.2）也不依赖 release notes。
- 镜像面逐面核完，**全部逐字相同**：菜单样式档、七枚 Regular 图标、会话「...」项集合与 order、StateDot ongoing 结构与数值、侧栏行 DOM 契约计数、设计令牌（纯插入 12 条声明）、`data-chat-node-key` / `data-chat-flow-key` 渲染段、`TurnNavigator` 与 `_bubble`、`_thinkBody`。功能 1–7、9、10 的插件代码因此零改动。验证：见报告的对读表。
- 改变运行环境但不碰锚点的两条上游变化已记进报告备后续回归：transcript 展示模式改名并换默认档（`compact/standard/detailed/verbose`）、工具行新增 `phase:"preparing"` 根块。
- **rc.1 新增的插件兼容性预检**：`evaluatePluginCompatibility` 只看被加载清单的 `@deepseek-ai/dsh*` `peerDependencies`；没有该键直接放行。本包没有该键 → 放行，代价是**将来加一条排除运行时的 dsh peer 会让整行被静默 `disabled`**。第三方 `@nanmicoder/dsh-agent-teams@0.1.20` 在本机第一次启动日志里就被否决。验证：报告里内联的那份一次性判据（直接调 `evaluatePluginCompatibility` 打本包与第三方两份清单）+ 两版 `--dump-config-schema` 里该条目从有到无。
- 功能 8 的 58 个镜像字段对两版 schema 逐键对读：约束节点 58/58 相同。rc.1 全 profile 面只新增 2 枚键，都在 `@deepseek-ai/dsh-plugin-manager` 上。
- **收进第 14 张卡「插件安装与 pnpm 预算」**（用户决定）：`plugin-manager` 的 `outputBytes` / `lockWaitMs` / `inspectTimeoutMs` / `githubConnectionTimeoutMs` / `idleTimeoutMs`，四条收录口径逐条核过（页面前半边 0 命中、条目在 profile 启动下活着且五键都有现读点、全 integer、无 `__jsExpr`）。新增 [src/harness-config/catalog-operations.js](../src/harness-config/catalog-operations.js) 作第三组。清单 13 卡 58 字段 → **14 卡 63 字段**。`ui-plugin-manager` 的 `registryProbe*` 三枚**不收**并写明缺的证据（client 侧条目，`__DSH_BOOT__` 不带 config，用户 patch 层是否流进 client 树未查实）。验证：`npm test` 34/34（新卡被同一组自洽规则覆盖）；`npm run verify:settings` 22/22，新增 11a/11b——写 `plugin-manager.idleTimeoutMs=45000` 后 loader 2111ms 读到 45000、区段头点名该卡，清除后键消失且文件逐字节回基线；面板规模读数 `fields=61`、`cards=14`。
- **功能 4 的 `turn-process` 理由订正**（行为不变，用户选的口径）：注释与 [docs/feature-4-timestamps.md](../docs/feature-4-timestamps.md) 说该行「尾端本来就带着开始时刻」，静态（两版该行 children 只有 label + chevron，无 `formatMessageClock`）与实测（rc.1 上该行文本 `已完成工作 用时 3分58秒`，时钟正则命中 0；同页 `user` / `turn-tail` 各命中 1）都不成立——它是时长。排除理由改成「整轮折叠汇总行，不对应单个节点动作」。上一轮报告同一句订正为本报告。

## 收尾验证方式（本轮读数）

- 单元：`npm test` → `tests 34 / pass 34 / fail 0`。
- live 七套在同一 rc.1 栈：`verify 27` / `verify:timestamps 10` / `verify:dot 21` / `verify:selection 20` / `verify:settings 22` / `verify:row-states 24` / `verify:chat-history 16`，合计 140 条，`failed=0 skipped=0`。
- 栈卫生：`up` 报 `本插件在名册里=true`、日志 `declares no dsh.bundle` 计数 0；`down` 后 `status` 报 `harnessServing: false` 与 `harnessPid: null`。

## 遗留

- `phase:"preparing"` 那行的功能 4 表现没有现场验证（静态判据说明最坏是不贴标签）。
- profile 用户 patch 层的 config 会不会流进 client 树没查实，`ui-plugin-manager` 三枚键的收录因此挂起。
- 预检的「否决 → `compatibility.json` 授予例外 → 重载」往返未实测，本插件不需要它。
- 全部验证在 headless Chrome + 独立 `DSH_HOME` + 3181 上跑，没在真桌面客户端里看过。
- [AGENTS.md](../../AGENTS.md) 指向的 `rationale.md` 在仓库里不存在（引用断链），本轮未动，等用户定：补文件还是改引用。
