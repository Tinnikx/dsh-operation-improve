# harness v0.2.0-rc.2 适配报告

锚定版本从 0.1.7-rc.2 → **0.2.0-rc.2**（desktop dist `@deepseek-ai/dsh` 的 `package.json`、`lib/bin.js --version`、`getDshRuntimeVersion()` 三处一致）。沿用单版本锚定口径，不保留旧版本兼容路径。

## 比对材料

本机 `.pnpm` store 只剩 0.2.0-rc.2，rc.1 / 0.1.7-rc.2 的旧发布物不在本地。改用两份材料做两版上游对读：

- **全量包版本**：从 dsh-desktop git 历史的 lockfile（commit `12a135fa90b03ce0d701aa7d829af73c06d495c0` 的 `pnpm-lock.yaml`，即 0.1.7-rc.2 锁定态）抽出 291 个 `@deepseek-ai` 包名→版本（273 个在 0.1.7-rc.2），存 `tmp/upstream/old-versions.json`。
- **旧版包体**：从 npm registry 下载这 273 个 0.1.7-rc.2 包 tarball 解包到 `tmp/upstream/old/<name>/`，与 desktop dist（0.2.0-rc.2）逐包 diff（脚本 `tmp/upstream/diff-packages.mjs`，排除 `node_modules`/`.bin`/`package.json`/`README*`/`LICENSE*`/`*.md`/`*.i18n.yaml`）。
- **config schema 两版 dump**：`tmp/upstream/schema-0.1.7-rc.2.json` / `schema-0.2.0-rc.2.json`，对读脚本 `tmp/upstream/schema-delta.mjs` → `tmp/upstream/schema-delta.json`。

**排除表仍要跟着上游走**：沿用 rc.2 那张「排 `*.md` / `*.i18n.yaml`」的文档面排除表才拿到干净读数。本轮读数：273 包可比、**81 个代码面有差异**（rc.1→rc.2 是 110）、192 相同、dist 缺失 0。0.2.0-rc.2 新增 5 包（`dsh-client-product-analytics`、`dsh-client-ui-settings-session-log`、`dsh-experimental-schedule-bundle`、`dsh-host-product-telemetry-otel`、`dsh-otel`），移除 7（都是 `libreoffice-kit-*`/`node-addon-system-*` 平台二进制，非 linux-x64 dist，噪声）。

## rc.2 相对 rc.1 的变化（落在本插件镜像面上的部分）

**九个镜像面全部无漂移**（功能 1-7、9-11 代码零改动）：

1. **菜单样式档**：只 `.scrollable` 的 token 名变（`--dsh-frame-top-clearance` → `--dsh-frame-overlay-top`），插件 [src/shared/context-menu.js](src/shared/context-menu.js) 的 `MENU_CSS` 不镜像这处 → 无漂移。
2. **七枚 Regular 图标**（primitives）：逐字节相同。
3. **会话行「...」菜单项集合与 order**：`pin`(100)/`rename`/`fork`/`archive` 集合与顺序相同。`rename` 挂的快捷键 `KeyR+["primary","alt"]` → `KeyG+["primary","alt"]`，但插件不镜像键帽。上游 `client.js` 的 `displayTitle`→`title?.trim()??""`、`forkSession(sessionId,onCreated)` 加回调、新增 `session.untitled` 词条——插件 rename 用 `rowTitle(rowElement,kind)`（侧栏行 DOM 文本）不是 displayTitle，fork 走 host 侧 `ctx.sessions.fork` 不是 client `uiWorkspace.forkSession`，均不影响。
4. **StateDot ongoing**：`StateDot.module.css` 逐字节相同。
5. **侧栏行 DOM 契约**：`_sessionRow` 26/26、`aria-selected` 2/2、`_projectRow` 11/11、`ongoing` 2/2 全同。
6. **逐行时间锚点**（功能 4）：`ChatNodeSeat` 5/5、`flowKey` 3/3、`timeStart` 4/4、`timeEnd` 4/4、`data-chat-node-key` 1/1 全同。`data-chat-flow-kind` 裸计数 14→19 但取值集合 `user`/`steering` 不变。chat `client.js` 的 diff 全是样式 + `formatLiveRunDuration` 合并进 `buildElapsedFragments`（是「用时 X」标签不是「开始时刻」）。
7. **TurnNavigator** 22/22、`mergeTurnRailItems` 2/2、`hasMore` 8/8、`loadOlder` 11/11、`useVirtualizer` 4/4 全同。
8. **`_thinkBody`** 规则逐字相同（`_thinkBody{padding:4px 0 4px calc(22px + var(--dsh-content-font-delta,0px));min-width:0}`，上游仍不给 `max-height`/`overflow`，功能 7 限高仍成立）。
9. **`TRANSCRIPT_VIEW_MODES`** 档位表逐字相同。

## rc.2 的新机制（登记，不镜像）

菜单分组 `MenuGroup`、快捷键键帽渲染、遥测接入（`dsh-otel`/`product-analytics`/`host-product-telemetry-otel`）、run duration 标签重构、rename 快捷键 `KeyR`→`KeyG`。

## 与功能 11 的交集（本轮登记，行为未改）

抢键判据 `(ctrl||meta) && !alt && (key==='f'||'F')`（`find/index.js:326`）不变；`"KeyF"` 1/1、`"session.fork"` 2/2、`primary` 63/63 不变（`shift` 11→10 是 rename 键位改动带走的）。交集维持原状。

## 兼容性预检在本轮咬到的东西

第三方插件 `@yilinxiao/dsh-mcp-lazy@0.5.1` 被预检**否决**：它的 peer `@deepseek-ai/dsh-subprocess`/`dsh-tools` 上限只到 `rc.6`，运行时是 `0.2.0-rc.2` → 静默 `disabled`。这解释了 entry 数 190→189 里的 `mcp-lazy-manager` 移除：是「被预检移除的第三方 configRef 贡献」，不是上游删的。

**对本插件的结论：放行**——本插件在名册里（`本插件在名册里=true`），`declares no dsh.bundle`=0（注册了 bundle）。

## 功能 8 清单的 schema 对读

`npm run check:catalog` 对 0.2.0-rc.2 **PASS**（改卡前 16 卡 / 77 字段逐键对上游 `--dump-config-schema` 一致，type/default 相等、上游边界不更松）→ 现有清单无漂移。

schema delta（`tmp/upstream/schema-delta.json`）：15 新增 / 4 移除 / 1 约束变化，远小于上轮 34-1-1。移除的 4 字段全在 `schedule.*`/`time-context.*`——正是上一轮被口径 #2 拦下没进清单的，清单不受影响。约束变化 1：`ui-theme.fontSize` min/max 12-17 → 10-22（不涉清单）。

### 新增 15 字段的收录判定

- **`desktop-product-telemetry`**（12）+ **`product-analytics`**（2）：`dsh-web-app/cordis.patch.yml` 里 `disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"` → **web profile 下 disabled，14 个字段全部撞口径 #2（写了没人读）**。
- **`session-telemetry-otel.maxRequestBytes`**（1）：**撞口径 #4，不收**。它的 config 块里真有 `__jsExpr`（`mode: !!js process.env.DSH_TELEMETRY_MODE || 'FEEDBACK_ONLY'`、`exporter.url: !!js ...`）。一旦收 `maxRequestBytes`，[profile.js](src/harness-config/profile.js) `:267` 的 `restated: Object.entries(outside).filter(([key]) => !keys.includes(key))` 会把 `mode`/`exporter` 连同重述一起写回，[patch-file.js](src/harness-config/patch-file.js) `serializeLines` 把 `{__jsExpr:...}` 当普通对象输出成字面量映射——静默改行为。口径 #4 判的是「entry 的 **config 块**里没有 `__jsExpr`」（不是单字段、也不管 `disabled` 级）：`bash-sandbox`/`plugin-manager` 能收是因为它们的 `__jsExpr` 挂在 `disabled:`（config 的兄弟键，永不被重述）。
- **`cordis-host-runner.clientInspectTimeoutMs`**（1）：**收**。`dsh-web-app` 里这条 entry 只有 `name`、无 config 块（config 内 `__jsExpr`=0），活消费者在 `dsh-cordis-host-runner/lib/index.js:1588`（`this.resolved.clientInspectTimeoutMs` 传进 `new CordisInspectRegistryService(ctx, ...)`）。纯 integer（上游 `z.number().step(1).min(1).max(2147483647).default(1e4)`，JSON schema `type:["integer","null"]`），无 settings 命名空间。

## 本轮改动

### 功能 8 收进一张新卡（16 卡 77 字段 → 17 卡 78 字段）

新增 [catalog-operations.js](src/harness-config/catalog-operations.js) 的 `cordis-host-runner` 卡（单字段 `clientInspectTimeoutMs`，`type:'integer'`、`default:10000`、`min:1`、`max:MAX_TIMER_DELAY_MS`、`effect:'immediate'`），上界复用 [catalog-limits.js](src/harness-config/catalog-limits.js) 的 `MAX_TIMER_DELAY_MS`（=2147483647，与上游 `maximum` 相等）。

**没做**：`session-telemetry-otel`、`desktop-product-telemetry`、`product-analytics` 三组字段只登记不收（口径 #4 / #2）。镜像面九处零改动。

## 验证结果（真实运行输出）

- `npm run check:catalog`：**PASS 全部字段与上游 schema 一致**（17 卡 / 78 字段）。
- `npm test`：**44 pass / 0 fail**。
- `npm run build`：`lib/client.js + lib/index.js built`。
- `npm run verify:settings`（真面板、真 harness、真 patch 文件）：**passed=26 failed=0**，断言 10 报 `{"cards":17,...}` 确认面板渲染出含新卡在内的 17 张卡；写盘→热重载→`live` 跟上→清除→跨字段拦下→卸载保留值全链路绿。

## 向下兼容

单版本锚定，不保留旧版本兼容路径。锚定版本即 0.2.0-rc.2。

## 未做

- `session-telemetry-otel.maxRequestBytes` 若要收，需先改造 `serializeLines` 支持 `__jsExpr` 表达式往返（把表达式原样写回而不是冻成字面量），才能绕开口径 #4。本轮不动。
- `schedule.*`/`time-context.*` 那 4 个被移除字段与 `desktop-product-telemetry`/`product-analytics` 14 个 desktop-only 字段继续不进清单。
