# harness v0.1.7-alpha.2 适配报告

检测与适配日期 2026-09-23。目标版本经两路确认：desktop dist `resources/app/node_modules/@deepseek-ai/dsh` 的 `package.json` 与 `bin.js --version` 都是 **0.1.7-alpha.2**；dev 仓源码停在 0.1.6-alpha.2，本地无 0.1.7 源码，比对材料为 dist 内未压缩构建产物。测试栈跑的就是 dist 那份构建（`up` 后 `/proc/<pid>/cmdline` 含 desktop dist 路径，独立 `DSH_HOME=tmp/dsh-oi-test-home`、端口 3181、CDP 9334，日志 `tmp/dsh-oi-stack/harness.log`）。

本轮口径（用户决定）：**只适配 0.1.7-alpha.2，不保留旧版本的兼容路径**；README 的兼容列表按单版本锚定改写。

## 新 harness 行为（影响本插件的部分）

- **StateDot ongoing 重设计**：8 格 `rect` 追逐动画整族换成旋转弧线 spinner——`svg[data-state='ongoing']` 里 `g`（`dsh-state-dot-spin` 1.5s，名带构建 hash）包两条 `circle`：静默底环（track，`opacity: .25`）与亮弧（dash 驱动，`stroke-dasharray` 动画逐帧覆盖行内值）。旧覆盖选择器 `svg[data-state='ongoing'] rect` 落空。
- **会话行新增「置顶会话」**：`ui-workspace` 的 session-actions 新增 `PinSession`（菜单 order 100，排重命名之前）；`IWorkspaces` 契约新增 `pinSession` / `unpinSession`，快照新增 `pinnedSessionIds`（读面 `workspaces.list.getSnapshot()`）。归档行不渲染该项。`sessions.open` 仍不存在，fork 后 DOM 点开路径不变。
- **归档项在归档行整条翻转**：order 400 那一个 slot 是同一个组件按归档态换三样——文案 `menu.archiveSession` ↔ `menu.unarchiveSession`、图标 `IconArchiveOutlineRegular` ↔ `IconUnarchiveOutlineRegular`（后者 viewBox 是 20 而非这批常见的 16）、调用 `workspaces.archiveSession` ↔ `workspaces.unarchiveSession`。行上 hover 按钮同翻转（`aria-label` 即该文案），归档行另有 `aria-description`「已归档对话暂时无法查看，请取消归档后查看」且点击被 `notifyArchivedNotOpenable` 拦下。归档行默认被侧栏视图筛掉，「视图选项 → 显示已归档 / 仅显示已归档」是新增的视图偏好。
- **`dsh-spill-policy` 的预算键按字节改成按 token**：`Config` 从 `{ maxInlineBytes }` 变成 `{ maxInlineTokens }`，整份 0.1.7 dist 里再无 `maxInlineBytes`；bundle 层（`dsh-base/cordis.patch.yml`）给的值是 `maxInlineTokens: 12500`。语义随之变化：不写这个键 = 不启用外溢，值必须是**非负安全整数**，预算小到装不下外溢提示时上游在该条结果落地时抛错。
- **菜单默认档收紧**：`Menu.module.css` 卡片 `padding 3px` / 圆角 16px / `min-width 144px`，行 `min-height 34px` / 字号 13/20 / gap 6px / 圆角 8px，图标 14px。
- **图标库换 Regular 描边档**：`IconEditOutlineRegular` 等整批重绘为 `fill:none` + `stroke-width:1` + 子元素 `stroke/fill="currentColor"` 的描边制；会话「归档」按 size=14 渲染。
- **会话流分组**：`ChatNodeSeat` 行新增 `data-chat-node-key`（恒等于节点 `key`）；被切块的行 `data-chat-flow-key` 变为 `JSON.stringify([nodeKey, part])`（reasoning / response 分段共用一个节点、各成一行）；分组壳 `ChatGroupSeat` 只有 flow-key（也是 JSON 数组），无 kind、无 node-key。折叠组内的行 `data-turn-process-hidden="true"`，有布局盒但不可见、不可选。
- 上游自带时间的行新增一类：`turn-process` 折叠行尾端渲染开始时刻——按「上游自己渲染时间」处理。

## 不兼容点与处置（全部已实现）

| 功能 | 0.1.7 首轮判定 | 处置 |
| --- | --- | --- |
| 1 多选 | ✓ | — |
| 2 右键菜单 | ✗ 四处：未镜像「置顶会话」；**归档行末项未翻转**（照旧给「归档会话」，点下去无后果，上游那一项在归档行是「取消归档」）；样式档停旧档；图标为旧矢量 | 单选会话菜单加置顶项（`workspaces.pinSession/unpinSession`，置顶/归档态开菜单时读 `workspaces.list.getSnapshot()`）与归档行的 `unarchive` 项（`workspaces.unarchiveSession`）；`MENU_CSS` 对齐 144/16px/34/13-20/14px 一档；`menu-icons.js` 整族重拷 Regular 描边档（新增 pinOutline/pinFill/unarchive，paste 自绘改描边制）；`verify` 补归档行两条（见下文「菜单与清单的对照口径」） |
| 4 时间戳 | ✗ | 反查与行集合改锚 `data-chat-node-key`（分组壳天然排除）；留白与常驻规则同锚点，旧锚 `data-time-hover-root` 删除；`turn-process` 归入上游自带时间四类 |
| 5 活跃标记 | ✗ 覆盖失效 | 覆盖重定向：`svg[data-state='ongoing']` 的 color 深/浅两值 + `circle:first-of-type` 底环 `opacity .6`；不再接管任何动画 |
| 6 选区菜单 | ✗ 图标漂移 | 图标重拷自动生效；验证脚本选区探针补 `checkVisibility` 判据（不可见文字选区 API 取不到，真实用户也选不到） |
| 8 高级配置 | ✗ 两处清单漂移（首轮只验行为，未对 schema）：`spill-policy` 卡的 `maxInlineBytes` 在 0.1.7 已不存在（整包改名 `maxInlineTokens`，语义从字节变估算 token）；`session-reference.referenceContextFraction` 少镜像 `max: 1`，面板会放行上游硬抛的值（patch 是热的，保存那一刻整棵树起不来——0.1.6 同样缺，非本轮引入） | 该卡换键名 / 标签 / 口径（`min 1`、`default 12500` 取自 bundle 层，help 写明预算太小连外溢提示都放不下会抛错、不写该键即不启用）；补 `max: 1`。全清单 52 个字段按 0.1.7 dist 的 schema 逐键对照，结论见下文「菜单与清单的对照口径」。测试栈 `syncHome` 另增加副本基线归置（剥托管区段 + 剥区间外手写 `bash-sandbox` 项，只动副本）——真 home 含用户日常写入的托管区段后，旧的手动清理口径作废 |
| 9 历史导航 | 数据口径 | 插件契约不动（无可导航文本的轮次丢弃）；验证脚本 oracle 同契约独立过滤空条目，并兼容 `data-chat-node-key`/`data-chat-flow-key` 两种锚点行 |
| 10 行状态 | ✓ | — |

## 测试栈适配点

- `harnessBin()`：首选 desktop dist 的 `lib/bin.js`（代表用户实际在跑的行为），`DSH_TEST_BIN` 环境变量可强制指定入口做回跑归因；解析回落原两档。
- `syncHome()`：新增 `preparePatchBaseline()`——rsync 后只在**副本**上剥托管区段、删手写 `bash-sandbox` 项（verify:settings 断言 9 的 bundle 来源探针前提）。真 home 里那条 `timeoutMs: 6000000` 手写项去向已单独报告用户，未动。
- 桩面：verify(1/2) 注入 ctx 的 `workspaces` 由纯 spy 改为「记账 Proxy + `list.getSnapshot()` 桩」，置顶与归档两个集合都从真行 UI 现推（行上挂着「取消置顶」/「取消归档」按钮即该行处于该状态，id 走 fiber 反查）。归档行默认被侧栏视图筛掉，取不到时那两条断言自己点「视图选项 → 显示已归档」让行现形、比完关回去（留在打开态会让后续断言取到归档行）。

## 验证结果（真实运行输出）

环境：`stack:up` 输出 `harness 就绪：http://127.0.0.1:3181/ pid=1914978 本插件在名册里=true`、`副本的托管区段已剥除（真 home 未动）`、`副本的手写 bash-sandbox 项已剥除（真 home 未动）`；日志无 `declares no dsh.bundle`。

七套 live 验证在同一 0.1.7 测试栈上全绿（一轮完整回归 + 各套件重复跑均复现）：

```
verify                 passed=28 failed=0 skipped=0 total=28   # 含「置顶项逐字对齐」、pin 动作、归档行两项新增断言
verify:row-states      passed=24 failed=0 skipped=0 total=24
verify:dot             passed=21 failed=0 skipped=0 total=21   # spinner 版重写
verify:timestamps      passed=10 failed=0 skipped=0 total=10
verify:selection       passed=20 failed=0 skipped=0 total=20
verify:chat-history    passed=16 failed=0 skipped=0 total=16
verify:settings        passed=20 failed=0 skipped=0 total=20   # 清单改键 + 收六键后重跑：preflight fields=56、13 张卡
```

单元测试 `npm test`：`tests 34 / pass 34 / fail 0`（含清单自洽性那六条，见下文「菜单与清单的对照口径」）。

功能 5 关键读数（深色 / 截图像素）：底环覆盖前 `rgb(79,79,81)` 对比 2.23 → 覆盖后 `rgb(28,135,152)` 对比 4.31（×1.93），亮弧 `rgb(34,211,238)` 对比 10.09（亮暗 2.34×，动感保留）；浅色主题底环 2.91 / 亮弧 7.27。功能 2 的镜像与样式断言逐项等值（viewBox/width/height/path[d] 与 144px 档 computed 全对）。

## 向下兼容报告（0.1.6-alpha.2 / 0.1.2-rc.1 / 0.1.1-rc.2）

**前提**：真 home 的会话数据已由用户日常的 0.1.7 harness 写入，副本在 0.1.6 CLI 下检索不到会话（`verify:chat-history` 在 0.1.6 栈上 ABORT「找不到恰好一条提问的会话」实测坐实），**旧版行为级复跑在本机不可得**。以下为代码面结论，逐条标注依据；README 已按「单版本锚定」改写，旧版本降级为历史验证记录。

| 功能 | 在 0.1.6 上的行为 | 依据 |
| --- | --- | --- |
| 1 多选 | 不受影响 | 本轮未改 `multi-select` / `selection-store` / `row-probe` |
| 2 右键菜单 | **失效（会话单选）**：0.1.6 快照无 `pinnedSessionIds`/`archivedSessionIds` 字段，`snapshot.pinnedSessionIds.includes` 抛 TypeError，会话单选菜单弹不出来；工作区菜单与批量菜单可用，但样式档与图标相对 0.1.6 上游旧档逐项不一致（144 vs 218 一档） | dist 类型 `WorkspaceSnapshot` 0.1.7 新增字段 + 0.1.6 dev 仓 `Menu.module.css` `min-width: 218px` 实据 |
| 4 时间戳 | **整功能静默失效**：0.1.6 行上没有 `data-chat-node-key`（dev 仓 `ChatNodeSeat.tsx` 只渲染 flow-key），行集合查询、留白、常驻规则全部落空 | dev 仓源码 grep |
| 5 活跃标记 | **半失效**：`circle` 选择器在 0.1.6 的 rect 结构上匹配为零 → 基线不透明度抬升消失；color 覆盖仍生效（青色但暗） | 两版 StateDot 实现比对 |
| 6 选区菜单 | 可用；菜单里的复制/粘贴图标与 0.1.6 页面真实按钮不一致（图标哨兵断言会红） | `menu-icons.js` 来源版本 |
| 8 高级配置 | **清单反向失配**：本轮把 `spill-policy` 卡对齐到 0.1.7 的 `maxInlineTokens`，旧版只认 `maxInlineBytes` → 在 0.1.6 上那一行写下去没人读（面板管不到那件事，不报错）。其余 51 个键两版同名同值 | 0.1.6 dev 仓 `packages/spill/spill-policy/src/index.ts` 的 `maxInlineBytes` 与 0.1.7 dist 的 `maxInlineTokens` 对读 |
| 9 历史导航 | 不受影响（插件代码零改动；0.1.6 rail 合并逻辑同构，`data-chat-flow-key` 兜底锚点仍在查询列表里） | `resolveTurnTexts` 未改 + oracle 双锚点选择器 |
| 10 行状态 | 不受影响 | `row-states` CSS 未改，`aria-selected`/`_sessionRow` 两版都在 |

**结论**：本轮适配后插件对 0.1.6-alpha.2 及更早版本的兼容是**部分退化**——功能 2（会话单选）与功能 4 从「对齐」变为「失效但不伤页面」，功能 5 半效，功能 6/2 视觉漂移，功能 8 的「大块内容外溢」卡在旧版上写一个没人读的键；没有任何一条会在旧版上写坏数据或抛进用户操作路径（功能 2 的抛发生在菜单构建期，表现为不弹）。这些版本从兼容承诺中移除，README 只锚定 0.1.7-alpha.2。

## 菜单与清单的对照口径（两处漂移的共同根因）

**右键菜单不会自动同步，是结构决定的**：右键那一刻插件 `preventDefault()` 掉上游那份 React 菜单，弹的是按 `buildItems` 现搭的 DOM。上游按行状态翻转的项（置顶 ↔ 取消置顶、归档 ↔ 取消归档）没有任何运行时通道过来——只有**状态位**读上游快照（`workspaces.list.getSnapshot()`），**项的集合**不读。表现不是报错，是「和邻居那个『...』菜单不一样」。归档这一半此前连哨兵都没有：`verify` 取的是第一条会话行，而归档行默认被侧栏视图筛掉，注入桩的 `archivedSessionIds` 因此恒空。本轮补两条（自己点「视图选项 → 显示已归档」让行现形，比完关回去），实测读数：

| | 上游归档行「...」 | 本插件右键（修复后） |
| --- | --- | --- |
| 项 | 重命名 / 分叉会话 / 取消归档 | 重命名 / 分叉会话 / 取消归档 |
| 末项图标 | `0 0 20 20`，两条 `path`，`d` 总长 1842 | 逐字相等（同一读数） |
| 点末项 | — | `workspaces.unarchiveSession`，参数 `session-d5895eef-…` 与行 `data-row-key` 去掉前缀相等，菜单关闭，未处理 rejection 0 |

修复前该行的末项是「归档会话」（源码里 unconditional push，没有 unarchive 分支），点下去对已归档会话重复发 `archiveSession`。

**精选清单同样只能人肉对**（口径见 [docs/feature-8](docs/feature-8-harness-config.md) 已知限制一节）。本轮对 0.1.7 dist 里那 13 个包的 `Config = z.object({…})` 与 bundle 层默认值逐键核过——原有 52 个字段的结果，与随后按用户决定收进来的六个新键：

| 卡 | 结论 |
| --- | --- |
| spill-policy | **漂移**：键名 `maxInlineBytes` → `maxInlineTokens`（旧键整包 0 命中），已改 |
| session-reference | **缺口**：`referenceContextFraction` 少 `max: 1`（上游 `.min(0).max(1)` + 构造函数硬抛），已补。**收进 `maxReferenceBytes`**（`z.number().step(1).min(1)`，上游无默认值：设了固定按它裁切，不设则按 `max(65536, 窗口 × 4 × 占比)` 推导——`default` 提示位填的是那个推导下限，help 里点明了） |
| bash-sandbox / pwsh-sandbox | 对得上；schema 在 `dsh-bash-local` / `dsh-pwsh-local` 的 `static Config`（sandbox 执行器继承），五键与 120000/600000/64000/67108864/3000 全等 |
| llm-deepseek | 原八键与默认 256000 / 1e6 / 3e5 / 600 / 128MiB / 20MiB / 6e4 / 604800 全等。**收进五个新键**：`imageOffloadByteQuantum`（64MiB）、`inlineImageOffloadByteQuantum`（10MiB）、`imageOffloadCountQuantum`（20）、`fileRefreshMarginSeconds`（3600）、`fileQuotaCleanupBatch`（1..1000，默认 100）。原来那三条「拿 `min` 镜像不相邻键默认值」的写法随之作废，改成四条 `crossRules` 跑在合成值上（三条 `atMost` + 一条 `lessThan`），`maxRequestFilesBytes` / `maxInlineRequestImageBytes` 的 `min` 回到上游的 1、`fileExpiresAfterSeconds` 的回到 3600 |
| session-query-sqlite | 六键全等（含 `SQLITE_MAX_PAGE_LIMIT = MAX_SAFE_INTEGER - 1` 与 50 / 4 / 5 三个共享常量） |
| session-title / session-title-llm / session-projection-cache | `default` 抄的 bundle 层值 5/40/80、5/10/4096/64/60000、200/5000 与 `dsh-base/cordis.patch.yml` 逐字相等 |
| attachment-local / system-prompt / skill / repeat-tool-reminder | 九键、两布尔、128、`[3,5,8]`/500 全等 |
| 卡的身份 | 13 个 entry id 在 0.1.7 的 bundle 层都还在；web 产品 preset 接管而**不收进清单**的 disabled 名单仍恰好覆盖 `compaction-basic` / `tool-result-pruner` / `tool-ralph` / `tool-todo` / `tool-web`，没有一张卡踩在被禁的 entry 上 |

功能 8 的行为面另有一条独立证据：`verify:settings` 之外，host 路由回的 `state['spill-policy'].live` 是 `{"maxInlineTokens":12500}`，即 loader 真跑着的 config 里就是这个键（旧键写下去只会多一个没人读的键）。

## 未确认项与待决

- **0.1.6 的 host-HMR 会话摘除缺陷在 0.1.7 是否消失：未确认**。本轮 settings 的自动保存写入执行了 4+ 次，一次中途栈上观察到「自动保存 20 秒未落定」ABORT（重跑干净栈 17/17 不复现），且该 ABORT 之后 row-states 24 条仍全绿（侧栏列表未空）——单例观察不构成结论；`stack:restart` 的收尾缓解按 0.1.6 轮的处置保留不动。
- 功能 4 的 `turn-process` 行时间取的是节点 step 起点，`[coverage]` 行未逐一核对该 kind 在上游轨迹页的 `startedAt` 口径（当前测试会话可见读数与行尾上游自渲染的时刻一致）。
- 旧版行为为代码面推演，无实跑证据（原因见本节前提）。
- **待决：上游的「停止并归档」确认没被复现**。0.1.7 归档一条**有进行中工作**（进行中的回合 / 子代理 / 后台任务 / 定时提醒）的会话时，第一次 `archiveSession(id)` 会被 host 拒（`WorkspaceArchiveError`，`rpcError.code === 'workspace/session-active'`），UI 捕获后弹「停止并归档此会话？」并列出将被停的东西，确认才带 `{ stopActivity: true }` 重试。本插件单选那一项发的就是不带 options 的那一次，且 `run()` 没有 catch——被拒的表现是菜单关掉、什么都没发生，只在控制台留一次未处理 rejection。要不要跟（跟就要复现那个对话框与 activity 列表），是个产品决定，本轮没动。
- **已收（用户决定）**：上述六个键进了清单，清单从 52 个字段长到 58 个（面板 `data-field` 从 50 到 56，两个布尔走复选框）。它们**不是 0.1.7 新增**——0.1.6 源码里同名、同默认值、同约束（`packages/llm/llm-deepseek/src/config.ts`、`packages/context/session-reference/src/index.ts`），收它们不增加旧版失配。哨兵两处：`checkCrossRules` 新增 `atMost` 一种（上游写的是 `if (a > b) throw`，等号合法，不能拿 `lessThan` 顶替），[tests/catalog.test.mjs](tests/catalog.test.mjs) 六条测规则键名存在、全默认值不自炸、默认值过自己的边界、`atMost`/`lessThan` 等号语义、合成值参与；`verify:settings` 的 4c / 4c-b / 4d 在真面板上验拦截与撤销。
