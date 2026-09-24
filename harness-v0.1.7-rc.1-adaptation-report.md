# harness v0.1.7-rc.1 适配报告

检测与适配日期 2026-09-24。目标版本两处对上：desktop dist 打包的 `@deepseek-ai/dsh` 的 `package.json` 与 `lib/bin.js --version` 都是 **0.1.7-rc.1**（`dsh-app-boot` 的 `getDshRuntimeVersion()` 同读数）。测试栈跑的就是 dist 那份构建。

本轮口径沿用上一轮的用户决定：**单版本锚定，只对齐最新 harness，不保留旧版本兼容路径**。

## 比对材料

`dsh-desktop/node_modules/.pnpm/` 里 alpha.2 与 rc.1 两版发布物并存（51 个 `dsh-client-ui-*` 包两版齐全，共 267 个同名 `@deepseek-ai/dsh*` 包），所以本轮的上游变化面是**两版发布物直接对读**出来的，不依赖 dev 仓源码（它停在 0.1.6-alpha.2），也不依赖 release notes。比对方式：逐包 `diff -rq -x node_modules -x .bin -x package.json`，只留包自身内容的差异。

结果：**267 个包里 54 个自身代码有差异**，其余只换 `package.json` 的版本与依赖范围。

## rc.1 相对 alpha.2 的变化（落在本插件镜像面上的部分）

本插件把上游的菜单项集合、图标矢量、菜单样式档、活跃标记结构与配色、会话行 DOM 契约、逐行时间锚点、清单字段值域**逐字镜像**进代码（镜像的理由见 [docs/feature-1-2-sidebar-menu.md](docs/feature-1-2-sidebar-menu.md) 与 [docs/feature-8-harness-config.md](docs/feature-8-harness-config.md)）。逐面核对结论：

| 镜像面 | rc.1 与 alpha.2 | 证据 |
| --- | --- | --- |
| 菜单样式档（功能 2、6） | 相同 | `Menu.module.css` 无差异；`padding:3px` / `border-radius:16px` / `min-width:144px` / 行 `min-height:34px` / `13px`·`20px` / `gap:6px` / 图标 `14px` 逐项在位 |
| 七枚 Regular 图标（功能 2、6） | 相同 | `ui-primitives` 产物里 `IconEditOutlineRegular` 等七枚的 viewBox、全部 `path[d]`、根 `fill:"none"` 与 `strokeWidth:1` 逐一相等 |
| 会话行「...」项集合与 order（功能 2） | 相同 | `ui-workspace` 产物全量 token diff 只命中 4 处，全是译文「子代理→子智能体」；order 100=置顶、200=重命名、300=分叉、400=归档/取消归档两版相等，归档与置顶行的状态翻转逻辑字节一致 |
| StateDot ongoing（功能 5） | 相同 | `svg` 渲染段 identical（`viewBox:"0 0 24 24"`、`g`→两条 `circle`、`cx/cy/r=12/12/9.5`）；`StateDot.module.css` 无差异（底环 `opacity:.25`、`dsh-state-dot-spin` / dash 动画、`stroke-width:2`、`dasharray 12 150`） |
| 侧栏行 DOM 契约（功能 1、2、10） | 相同 | `ui-workspace` 产物里 `_sessionRow` 27、`aria-selected` 2、`_searchResultRow` 8、`_projectRow` 11、`_drop` 8 计数两版相等 |
| 设计令牌（功能 5、8 面板借色） | 纯插入 | `ui-theme` 新增 6 个 `--dsw-alias-file-diff-*` 令牌名 ×明暗 2 份 = 12 条声明；令牌总数 367→373，改名 0、删除 0、共有令牌改值 0；`#151517` 4=4、`#fff` 5=5 |
| 逐行时间锚点（功能 4） | 相同 | `ChatNodeSeat` 渲染段 diff 为 identical；`flowKey = groupPart === void 0 \|\| groupPart === "response" ? routedNode.key : JSON.stringify([routedNode.key, groupPart])` 两版逐字相同；`_timeStart` / `_timeEnd` 段、`formatMessageClock` 与四处调用点、`callTime` 上下文全同 |
| 轮次导航列与气泡（功能 9） | 相同 | `TurnNavigator` 整段落在 diff 空档；`mergeTurnRailItems` 产出的 `{turn, prompt, response, anchor}` 形状相同；`_bubble` 上下文 IDENT |
| 思考区（功能 7） | 相同 | `[class*='_thinkBody']` 那条规则与 `ReasoningRow` 渲染段一致，上游仍不给它 `max-height` / `overflow` |

变化**不在**镜像锚点上、但改变了运行环境的两条，记下来供后续回归看：

- 会话流展示策略改名：`TRANSCRIPT_VIEW_MODES` 由 `compact/detailed/expanded` 变为 `compact/standard/detailed/verbose`，默认档从 `expanded` 侧改为 `standard`，`detailed.stepGrouping` 由 `none` 改 `history`，并新增 `settledReasoningPreview`。七套验证都在 rc.1 的默认档下跑绿（功能 4 的 `[baseline]` 读数 kinds 齐全，见下文）。
- 工具行新增 `phase:"preparing"` 根块（有 `time`、无 `callTime`、`visibility:"hidden"`；alpha.2 产物里 `"preparing"` 作为 phase 命中 0 次）。功能 4 的取值链是 `data?.root?.callTime` → … 的依次回落，读不到时间就不贴标签，且那一行本身不可见——实测无异常，但**没造出正在 preparing 的现场去验它**（见「未做」）。

## 新增的插件兼容性预检（rc.1 唯一实质性新机制，与本插件直接相关）

`dsh-app-boot` 在 post-patch-composition、pre-loader 这条缝上加了版本兼容门：`prepareProfileEntries` / `prepareProfilePatches` 对每条 profile 行调 `evaluatePluginCompatibility(manifest, exemptions)`，比对基准是 `getDshRuntimeVersion()`。判据（读 rc.1 产物 `lib/index.js` 实装）：

- 清单里**没有 `peerDependencies` 键** → 直接返回 `undefined`，放行。
- 有该键 → 只挑 `@deepseek-ai/dsh` 与 `@deepseek-ai/dsh-*` 的 peer，按 `semver.satisfies(runtime, range, {includePrerelease: true})` 判；`workspace:^` / `workspace:~` / `workspace:*` 折算成当前运行时。全部满足才放行。
- 有任何一枚不满足 → 该行加 `disabled: true` 并在 stderr 打 `pluginCompatibilityWarning`；例外要按 `包名@精确版本 → 精确运行时` 写进 profile 的 `compatibility.json`。

**对本插件的结论：放行，且放行理由要记住**——本包 [package.json](package.json) 没有 `peerDependencies` 键，走的是第一条。这同时是一个静默失效陷阱：**将来只要给本包加一条排除当前运行时的 dsh peer（例如精确 pin 某个旧版本），这一行就会被加 `disabled`，表现为插件整个没了而页面不报错**。跟「注册 id 对不上就 loaded without registering」是同一类没有提示的失效，所以登记在此。

可重放的判据（不依赖日志——`harness.log` 每次 `up` 会被截断，且 profile 预备只在第一次启动那一趟发声）。下面是那份一次性探针的内容，落在 gitignore 的 `tmp/` 里，**不在仓库**；要复现照抄即可（第二个清单换成任意一份 profile 里装着的第三方包）：

```js
// node tmp/preflight-check.mjs
import { readFileSync } from 'node:fs'
import { evaluatePluginCompatibility, getDshRuntimeVersion }
  from '<dsh-desktop>/dist/desktop/dsh-linux-x64/resources/app/node_modules/@deepseek-ai/dsh-app-boot/lib/index.js'

console.log(getDshRuntimeVersion())
for (const url of ['./package.json', './tmp/preflight-probe/profiles/web/node_modules/@nanmicoder/dsh-agent-teams/package.json']) {
  const issue = evaluatePluginCompatibility(JSON.parse(readFileSync(url, 'utf8')))
  console.log(issue === undefined ? '放行' : `否决 ${JSON.stringify(issue.peers)}`)
}
```

实测读数：

```
runtime = 0.1.7-rc.1
本插件: @Tinnikx/dsh-operation-improve@0.1.2
  peerDependencies 键存在=false  dsh peer 条数=0
  判定 = 放行（undefined）
第三方（日志里被跳过的那条）: @nanmicoder/dsh-agent-teams@0.1.20
  peerDependencies 键存在=true  dsh peer 条数=21
  判定 = 否决：{"@deepseek-ai/dsh-agent":"0.1.5-rc.1 || 0.1.2-rc.1 || 0.1.2-alpha.5 || 0.1.2-alpha.2",… exempted=false
```

同一条否决在本机测试栈第一次启动的日志里以 `dsh: skipping profile bundle "@nanmicoder/dsh-agent-teams": Error: Plugin @nanmicoder/dsh-agent-teams@0.1.20 is incompatible with dsh 0.1.7-rc.1: peerDependencies {…}. Running it may cause crashes or data loss.` 出现过；两版配置 schema 对读也能看到后果——alpha.2 的 dump 里有这个条目，rc.1 的 dump 里它整条消失（`rc1 消失条目: ['@nanmicoder/dsh-agent-teams']`）。副本的 profile 目录里没有 `compatibility.json`，即没有任何例外授权被写过。

## 功能 8 清单的 schema 对读

把 58 个镜像字段按 rc.1 与 alpha.2 的 `--dump-config-schema` 逐键对读（`dsh --profile web --dump-config-schema`，在 `tmp/schema-probe-home` 这份 throwaway 副本上跑），约束节点（`type` / `minimum` / `maximum` / `default` / `enum` / `anyOf`）**58/58 逐字相同**；可解析配置字段总数 alpha.2=374、rc.1=366，差异全部来自被预检否决的那条第三方条目（-10 键）。

键名增删（全 profile 面）：

- **rc.1 新增 2 枚**：`@deepseek-ai/dsh-plugin-manager` 的 `githubConnectionTimeoutMs`（`min 1000`、默认 `5000`）与 `idleTimeoutMs`（`min 1000`、默认 `600000`）。
- rc.1 移除 10 枚，全在被否决的 `@nanmicoder/dsh-agent-teams` 条目里，与本插件无关。

## 本轮改动

### 1. 功能 8 收进第 14 张卡「插件安装与 pnpm 预算」

按 [docs/feature-8-harness-config.md](docs/feature-8-harness-config.md) 「不在清单里的 entry」的口径逐条核：

- **口径 #1（只能手改 `cordis.patch.yml`）**：这五枚键在 51 个 client-ui 包的前半边里命中数为 0，插件管理页也没给 `dsh-plugin-manager` 注册 `plugins.bundle.config` 表单——面板是唯一入口。
- **口径 #2（有活的消费者）**：五枚都在 `dsh-plugin-manager/lib/index.js` 的 `this.xxx = config.xxx` 里被读，用在每一趟安装 / 查询路径上；条目本身在 `dsh-base/cordis.patch.yml` 里是 `disabled: !!js "!ctx.get('profileContext')"`，profile 启动下活着，bundle 层没给它设过任何 config 值（默认值来自上游 zod）。
- **口径 #3（数字或布尔）**：五枚全是 `integer`。
- **口径 #4（无 `__jsExpr`）**：该 entry 的 config 字段全是标量。

新文件 [src/harness-config/catalog-operations.js](src/harness-config/catalog-operations.js)（第三组），[src/harness-config/catalog-entries.js](src/harness-config/catalog-entries.js) 的装配与三处「两组」说法同步改为三组。清单规模：13 卡 / 58 字段 → **14 卡 / 63 字段**。

同一次改动里收了 `ui-plugin-manager` 的 `registryProbe*` 三枚**不收**的判定：那是 client 侧条目的 config，而 `window.__DSH_BOOT__` 的条目只带 `id` / `url` / `rev` / `inject`（实测读数），profile 用户 patch 层的 config 会不会流进 client 树**没有查实**，口径 #2 要求「真有活消费者」，证据不足不收。这条写在 [docs/feature-8-harness-config.md](docs/feature-8-harness-config.md) 与 `catalog-operations.js` 表头。

### 2. 功能 4 的 `turn-process` 理由订正（行为不变）

`src/timestamps/index.js` 的 `UPSTREAM_TIME_KINDS` 注释与 [docs/feature-4-timestamps.md](docs/feature-4-timestamps.md) 写着「turn-process 折叠行尾端本来就带着开始时刻」，这句**在 rc.1 与 alpha.2 的产物里都不成立**：

- 静态：两版 `TurnProcessNodeView` 的 children 都是 `label` + 可选 chevron，该文件里没有任何 `formatMessageClock` 调用落在这一行上；`label` 的字面是 `message.turnProcess.took` = 「用时 {duration}」。
- 实测（rc.1 测试栈，去掉插件自己贴的标签后读该行文本）：`已完成工作 用时 3分58秒`，正则 `\d{1,2}:\d{2}` 命中 0；同一份页面上 `user` 与 `turn-tail` 各命中 1（后者读数 `用量 516K 08:39`）。

所以渲染的是**时长**，不是开始时刻。排除 `turn-process` 这件事本身保留（它是整轮过程的折叠汇总，不对应单个节点动作），改的是理由。上一轮报告 [harness-v0.1.7-alpha.2-adaptation-report.md](harness-v0.1.7-alpha.2-adaptation-report.md) 里同一句（「上游自带时间的行新增一类：turn-process 折叠行尾端渲染开始时刻」）是错的，以本报告为准。

顺带记一条 rc.1 行为差异：这一行的渲染门槛由 `if (!turnProcess.foldable) return null` 变成 `if (turn?.start === void 0 && turn?.status !== "closed") return null`，即可折叠性不再决定它出不出现。插件不依赖 `foldable`，无改动。

## 验证结果（真实运行输出）

栈：`PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/test-stack.mjs up` →

```
[test-stack] 副本的托管区段已剥除（真 home 未动）
[test-stack] 副本的手写 bash-sandbox 项已剥除（真 home 未动）
[test-stack] harness 就绪：http://127.0.0.1:3181/ pid=3416666 本插件在名册里=true
[test-stack] Chrome 就绪：CDP 9334 pid=3416784 target=http://127.0.0.1:3181/
```

日志里 `declares no dsh.bundle` 计数 `0`。`down` 后 `status` 报 `"harnessServing": false` 且 `harnessPid: null`（没有在跑就说没有在跑）。构建要带 `DSH_ESBUILD_ROOT`（README「构建」写明，本仓库默认上一级没有 store）。

单元测试 `npm test`：`tests 34 / pass 34 / fail 0`（含清单自洽性那六条，新卡自动被同一组规则覆盖）。

七套 live 在同一 rc.1 栈上跑（改动后复跑）：

```
verify                 passed=27 failed=0 skipped=0 total=27
verify:timestamps      passed=10 failed=0 skipped=0 total=10
verify:dot             passed=21 failed=0 skipped=0 total=21
verify:selection       passed=20 failed=0 skipped=0 total=20
verify:settings        passed=22 failed=0 skipped=0 total=22   # 新增 11a/11b 两条
verify:row-states      passed=24 failed=0 skipped=0 total=24
verify:chat-history    passed=16 failed=0 skipped=0 total=16
```

新卡那两条的读数：`11a` 写 `plugin-manager.idleTimeoutMs = 45000` → 区段头 `# managed: {"plugin-manager":["idleTimeoutMs"]}`，**2111ms** 后 loader 读到 `45000`；`11b` 点「清除」→ loader 里该键为 `null`、托管区段整体消失、文件与基线 `bytesIdentical: true`。`11b` 的判据按既有 `2a` 的口径写：host 路由的 `live` 是**原始合成 config**，不含上游 zod 默认值，所以清除后是消失而不是回落 `600000`。

面板规模断言的实际读数：`preflight fields=61`（63 字段减掉 `system-prompt` 那两个走复选框的布尔）、`cards=14`。

## 向下兼容

本轮功能 1–7、9、10 的插件代码零改动，镜像面在两版之间逐字相同（见上表），所以上一轮对 alpha.2 的行为级结论不被撤消；README 按单版本锚定只列 rc.1，alpha.2 移入历史验证记录。唯一往下走偏的是新卡：`githubConnectionTimeoutMs` 与 `idleTimeoutMs` 在 alpha.2 及更早版本上是**写了没人读**的键（上游 rc.1 才加），另三枚（`outputBytes` / `lockWaitMs` / `inspectTimeoutMs`）旧版同名同约束。不报错、不写坏数据，只是那两行不起作用。

## 未做

- **没有造出 `phase:"preparing"` 的工具行现场**验功能 4 在那一行上的表现。缺的是一个能让工具调用停在 preparing 态的会话；静态判据（取值链回落 + 该行 `visibility:"hidden"`）说明最坏情况是那一行不贴时间戳。
- **没验 profile 用户 patch 层的 config 是否流进 client 树**，因此 `ui-plugin-manager` 的三枚键没收。要收需要先定这条路径。
- **没跑预检的「否决 → 授予例外 → 重载」往返**：本插件走的是「没有 `peerDependencies` 键」这条放行分支，不需要例外；`compatibility.json` 与 `setProfileVersionExemption` 的可用性与本插件无关。
- **没在真桌面客户端里看过这些功能**：验证全部走测试栈的 headless Chrome（CDP 9334）+ 独立 `DSH_HOME` + 端口 3181，与日常的 3080 无关。桌面外壳那边 rc.1 的升级另有其人验过（`dsh-desktop` 的 20 条行为门禁与打包冒烟）。
