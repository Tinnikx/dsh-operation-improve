# 016 harness 0.2.0-rc.2 适配

锚定版本从 0.1.7-rc.2 → **0.2.0-rc.2**。九个镜像面零漂移（功能 1-7、9-11 代码零改动）；功能 8 清单收进一张新卡（16 卡 77 字段 → 17 卡 78 字段）。完整报告见 [harness-v0.2.0-rc.2-adaptation-report.md](../../harness-v0.2.0-rc.2-adaptation-report.md)。

## 进展

- **比对材料**：本机 `.pnpm` 只剩 0.2.0-rc.2，旧版包体改从 npm registry 拉 273 个 0.1.7-rc.2 tarball 解包到 `tmp/upstream/old/<name>/` 与 desktop dist 逐包 diff（脚本 `tmp/upstream/diff-packages.mjs`）。读数：81 个代码面有差异（rc.1→rc.2 是 110）、192 相同、dist 缺失 0。config schema 两版 dump 存 `tmp/upstream/schema-0.1.7-rc.2.json` / `schema-0.2.0-rc.2.json`。
- **九镜像面全同**：菜单样式档（只 `.scrollable` token 名变，插件不镜像这处）、七枚 Regular 图标、会话行「...」项集合与 order（rename 键 KeyR→KeyG 但键帽不镜像）、StateDot、侧栏行 DOM 契约、逐行时间锚点、TurnNavigator、`_thinkBody`、`TRANSCRIPT_VIEW_MODES`。功能 1-7、9-11 代码零改动。
- **功能 8 清单**：改卡前 `npm run check:catalog` 对 0.2.0-rc.2 PASS（16 卡 77 字段无漂移）。schema delta 15 新增 / 4 移除 / 1 约束变化。
- **新增字段收录判定**（这是本轮的核心口径教训）：
  - `desktop-product-telemetry`(12) + `product-analytics`(2)：web profile 下 `disabled: !!js "ctx.get('profileContext')?.name !== 'desktop'"` → 撞口径 #2，不收。
  - `session-telemetry-otel.maxRequestBytes`(1)：**撞口径 #4，不收**。它的 config 块里有 `__jsExpr`（`mode: !!js ...`、`exporter.url: !!js ...`），收了会在写回时把 `mode`/`exporter` 冻成字面量映射。
  - `cordis-host-runner.clientInspectTimeoutMs`(1)：**收**。config 内 `__jsExpr`=0、活消费者在 `dsh-cordis-host-runner/lib/index.js:1588`、纯 integer、无 settings 命名空间。

## 收尾验证读数

- `npm run check:catalog`：**PASS**（17 卡 / 78 字段对上游 schema 一致）。
- `npm test`：**44 pass / 0 fail**。
- `npm run build`：`lib/client.js + lib/index.js built`。
- `npm run verify:settings`：**passed=26 failed=0**，断言 10 报 `{"cards":17}` 确认面板渲染 17 张卡；写盘→热重载→清除→跨字段拦下→卸载保留值全链路绿。

## 验收方式

`PATH=$HOME/.dsh/desktop-bin/node-shim:$HOME/.nvm/versions/node/v24.14.0/bin:$PATH DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop node scripts/test-stack.mjs up` 起栈后**在同一个 bash 调用里**接着 `npm run verify:settings`（跨调用栈会被回收，见「坑」）。

## 决策与理由（本轮用户定的两条）

1. **收 1 张新卡而非 2 张**（用户在 ask_user_question catalog-count-fix 选「收 1 张（正确口径）」）。上一个问里 AI 曾误报 `session-telemetry-otel` 与 `cordis-host-runner` 都合格、用户一度选「收 2 张」；重新核到底后发现只有 `cordis-host-runner` 真合格，向用户纠正后按 1 张走。**理由**：口径 #4 判的是「entry 的 **config 块**里没有 `__jsExpr`」，`session-telemetry-otel` 的 config 块真有，收它会让 `restated` 把同条 config 的 `!!js` 冻成字面量、静默改行为。
2. 沿用单版本锚定口径，不保留旧版本兼容路径。

## 坑

- **口径 #4 的精确边界**：判的是 `config:` 块内有无 `__jsExpr`，**不管 `disabled:` 级**。`bash-sandbox`/`plugin-manager` 能收是因为它们的 `!!js` 挂在 `disabled:`（config 的兄弟键，`findConfig().config` 拿不到、`restated` 也永不碰它）。`session-telemetry-otel` 的 `!!js` 在 `config:` 块内，所以被拦。
- **`restated` 的写回粒度**（[profile.js](src/harness-config/profile.js) `:267`）：`restated: Object.entries(outside).filter(([key]) => !keys.includes(key))`——收一条 entry 的任一字段，该 entry `outside` 里所有非托管键都会被重述进区段。托管键本身逐字段写、不重述；但同条 config 的兄弟键会被重述。这就是 `session-telemetry-otel` 被拦的机制。
- **verify 脚本必须与 `test-stack.mjs up` 同一个 bash 调用**：每次 `bash` 工具调用是全新 shell，跨调用后台进程会被回收，`verify:settings` 会 `ECONNREFUSED 127.0.0.1:9334`。
- **兼容性预检否决第三方插件** `@yilinxiao/dsh-mcp-lazy@0.5.1`（peer 上限 rc.6 vs 运行时 0.2.0-rc.2）→ 静默 disabled，这是 entry 数 190→189 里 `mcp-lazy-manager` 移除的真因，不是上游删的。

## 交付落点

- [src/harness-config/catalog-operations.js](../../src/harness-config/catalog-operations.js)：新增 `cordis-host-runner` 卡（单字段 `clientInspectTimeoutMs`），`import { MAX_TIMER_DELAY_MS } from './catalog-limits.js'`。
- [harness-v0.2.0-rc.2-adaptation-report.md](../../harness-v0.2.0-rc.2-adaptation-report.md)：完整适配报告。
