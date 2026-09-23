# 011 harness 0.1.7-alpha.2 检测与适配 + 向下兼容报告

- 目标：用 desktop dist 打包的 0.1.7-alpha.2 全功能检测兼容性；对不兼容处完成适配实现并让全部 live 验证套件在新版全绿；产出适配报告与向下兼容报告（适配后旧版 0.1.6-alpha.2 / 0.1.2-rc.1 / 0.1.1-rc.2 的行为状态逐条交代）。验收方式：`scripts/test-stack.mjs up` 跑在 0.1.7 dist 上 + 七个 verify:* 套件的真实输出；向下兼容证据为同一插件构建回跑 0.1.6 harness 的套件输出。
- 范围：做——测试栈指向 0.1.7、故障归因（区分 0.1.7 引入 vs 既有）、按归因修插件与验证脚本、README 兼容列表与报告。不做——harness 上游缺陷的上报以外动作、与本轮失败无关的重构。

## 进展

- 目标版本确认：desktop dist `@deepseek-ai/dsh` `--version` = 0.1.7-alpha.2；dev 仓源码停在 0.1.6-alpha.2，本地无 0.1.7 源码，比对材料为 dist 内未压缩构建产物。验证：`node-shim node <dist>/lib/bin.js --version`。
- 静态契约核对（0.1.7 dist）：`sessions.fork/binding/retain` 签名不变、`sessions.open` 仍不存在；`workspaces.rename/delete/archiveSession` 在；`writeClipboard` 在；DOM 锚点 `_sessionRow`/`aria-selected`/`data-chat-flow-key`/`data-chat-flow-kind`/`_thinkBody`/`data-variant="think"`/Lexical composer 全在，`data-time-hover-root` 仍缺席（与 0.1.6 判定一致）。验证：对 dist lib 的 grep 清单。
- 测试栈已指向 0.1.7：`harnessBin()` 首选 desktop dist 的 `lib/bin.js`，回落原两档。验证：`up` 成功，`/proc/<pid>/cmdline` 含 dist 路径，`本插件在名册里=true`，日志无 `declares no dsh.bundle`。
- 0.1.7 首轮套件结果（七项）：
  - verify:row-states（功能 10）24/24 全绿。
  - verify（功能 1/2）22/25：上游会话行「...」菜单新增「置顶会话」项未被镜像；菜单默认档计算样式漂移（minWidth 144px/padding 3px/radius 16px/行高 34px/字号 13px/图标 14px，本插件仍停在旧档）；重命名/分叉/归档图标矢量已被上游重绘。
  - verify:timestamps（功能 4）7/10：`assistant-step` 的 reasoning 子行（flow key 形如 `14:assistant-step9:1` + `reasoning` 段）未被装饰（64 行缺标签）；测试会话内 think 锚点为 0；tool-call 行 4 枚标签与正文矩形相交。
  - verify:dot（功能 5）ABORT：上游 StateDot 由 8 格追逐 svg[rect] 改为旋转弧线 spinner（track+arc），插件覆盖选择器 `svg[data-state='ongoing'] rect` 落空。
  - verify:selection（功能 6）19/20：页面复制按钮图标矢量与拷贝自旧版的菜单图标不再逐字相同。
  - verify:chat-history（功能 9）14/16：导航列 10 条含一条空 `prompt` 条目，本插件历史解析得 9 条，条数与逐条文本断言失败。
  - verify:settings（功能 8）ABORT：真 home 的 `cordis.patch.yml` 现含真实托管区段（用户日常用面板写入），同步副本后基线不干净——测试夹具问题，非插件问题。

- 适配实现完成（用户批准口径：只锚定 0.1.7，不保留旧版兼容路径）：功能 2 置顶项 + 样式档 + 图标重拷、功能 5 spinner 重定向、功能 4 node-key 锚点 + turn-process 归上游、功能 6/9 与测试工具按归因各自收口；README 兼容列表改单版本锚定并写明旧版降级口径。验证：见[收尾验证方式](#收尾验证方式本轮读数)。

- 功能 8 清单内容对 0.1.7 schema 逐项核过（首轮只验行为，`verify:settings` 不比对键名）。两处结论：`spill-policy` 的 `maxInlineBytes` 在 0.1.7 整包 0 命中（改名 `maxInlineTokens`，bundle 层给 12500），面板那一行写的是没人读的键；`session-reference.referenceContextFraction` 少镜像 `max: 1`（上游 `.min(0).max(1)` + 构造函数硬抛，0.1.6 同样缺）。其余 50 键、13 个 entry id、preset 的 disabled 名单两版一致。验证：发行包里各包 `Config = z.object({…})` 与 `dsh-base/cordis.patch.yml` 对读；`GET /operation-improve/harness-config` 的 `state['spill-policy'].live` = `{"maxInlineTokens":12500}`；`npm run verify:settings` 17/17（`preflight fields=50`、13 张卡）。
- 清单收了六个够格新键（用户决定）：`llm-deepseek` 的 `imageOffloadByteQuantum` / `inlineImageOffloadByteQuantum` / `imageOffloadCountQuantum` / `fileRefreshMarginSeconds` / `fileQuotaCleanupBatch`，`session-reference` 的 `maxReferenceBytes`。原来三条「拿 `min` 镜像不相邻键默认值」的写法随之改成四条 `crossRules`（三条 `atMost` + 一条 `lessThan`），`checkCrossRules` 为此新增 `atMost`——上游是 `if (a > b) throw`，等号合法，不能拿 `lessThan` 顶替。清单 52 → 58 个字段。验证：`npm test` 34/34（新增 `tests/catalog.test.mjs` 六条：规则引用的键必须在本卡、全默认值不自相冲突、默认值过自己的边界、`atMost`/`lessThan` 等号语义、合成值参与、`integer-list` 边界）；`npm run verify:settings` 20/20（4c 拦 `imageOffloadByteQuantum = 上限 + 1`、4c-b 撤销后错误清零且文件没动、4d 拦 `fileRefreshMarginSeconds == fileExpiresAfterSeconds`，`preflight fields=56`）。这六键在 0.1.6 源码里同名同默认值同约束，收它们不增加旧版失配。
- 功能 2 归档行的末项翻转补上（`menu.archiveSession` ↔ `menu.unarchiveSession`，同一个 order 400 slot）。根因是结构性的：插件在右键那一刻 `preventDefault()` 掉上游菜单、自己按 `buildItems` 搭 DOM，只有状态位读上游快照，项的集合没有任何运行时通道，所以这类漂移只能靠哨兵。原先连哨兵都取不到归档行（默认视图筛掉 + 注入桩 `archivedSessionIds` 恒空）。验证：`npm run verify` 28/28，新增两条为 `archived session row mirrors the row's own menu`（上游三项与本插件逐项等值，末项 `viewBox 0 0 20 20` / 两条 `path` / `d` 总长 1842）与 `archived row dispatches the workspaces unarchive command`（`workspaces.unarchiveSession`，参数与行 `data-row-key` 去前缀相等，rejection 0）；归档行 8 条来自副本。

## 决策与理由

- 故障归因先于修复：把 `DSH_TEST_BIN` 作为 `harnessBin()` 的环境变量覆盖口，同一插件构建回跑 0.1.6 harness，区分「0.1.7 引入的漂移」与「既有缺陷」，避免把既有 bug 记到新版本账上，也构成向下兼容报告的观测基础。
- verify:settings 基线归置放进了 `syncHome`：副本剥托管区段 + 剥区间外手写 `bash-sandbox` 项（断言 9 的 bundle 来源探针前提）；真 home 含用户日常写入的托管区段与手写 `- id: bash-sandbox config: timeoutMs: 6000000`，一律不动。验证：新 `up` 输出两行「已剥除（真 home 未动）」，verify:settings 17/17 全绿。
- 功能 9 的空条目口径：0.1.6 源码 `mergeTurnRailItems` 同样收录空 `prompt` 轮次，插件「无可导航文本即丢弃」的契约跨版本一致——失败源于测试会话里出现了一条空 prompt 轮次（数据），不是 0.1.7 代码漂移。修向为验证脚本 oracle 侧同口径过滤，插件不动。

## 归因结论（0.1.7 引入 vs 其他）

- 0.1.7 引入：功能 5（StateDot 8 格 rect 追逐 → spinner 弧线重设计，0.1.6 源码 `<rect>` + chase 注释在、0.1.7 CSS 全换）；功能 2 的「置顶会话」（0.1.6 dev 仓无 `PinSession*`，0.1.7 新增且 `workspaces.pinSession/unpinSession` 在服务契约上）；功能 2/6 的菜单样式档与图标矢量（0.1.6 `Menu.module.css` min-width 218px = 插件现值，0.1.7 为 144px 一档）。
- 数据/环境所致：功能 9 两条（见上）；功能 4 的 think=0 与 64 条 reasoning 子行缺装饰疑似同类（0.1.6 已有 turn-process 结构，flow key 出现 `["…","reasoning"]` 新分段待实活确认）。
- 无法回跑 0.1.6 做行为级归因：真 home 会话数据已被日常 0.1.7 harness 写入，副本在 0.1.6 下检索不到（verify:chat-history 在 0.1.6 上 ABORT「找不到恰好一条提问的会话」）。向下兼容报告只能给「代码面」结论 + 此环境事实，不能给 0.1.6 全套件实跑证据。

## 未完成项与下一步

- **待我定：上游的「停止并归档」确认要不要跟**。0.1.7 归档有进行中工作的会话时，第一次 `archiveSession(id)` 被 host 拒（`workspace/session-active`），上游捕获后弹「停止并归档此会话？」列出将被停的回合 / 子代理 / 后台任务 / 定时提醒，确认才带 `{ stopActivity: true }` 重试。本插件单选发的就是不带 options 的那一次且 `run()` 无 catch——被拒表现为菜单关掉、什么都没发生，只在控制台留一次未处理 rejection。跟就要复现那个对话框与 activity 列表。
- 0.1.6 host-HMR 会话摘除缺陷在 0.1.7 是否消失：未确认（`stack:restart` 缓解掩盖观察窗口；一次满载栈上 settings「自动保存 20 秒未落定」ABORT 后 row-states 仍全绿，单例不构成结论）。要证实需在写入 session-query-sqlite 后跳过重启直接查侧栏。
- 真 home `cordis.patch.yml` 里的手写 `bash-sandbox timeoutMs: 6000000` 已报告用户，处置由用户定。
- 功能 4 `[coverage]` 未见到的 kind 列表本轮未逐项复核（沿用功能 4 文档的已知限制口径）。

上面三条都在本轮范围之外：要么是需要用户点头的产品决定，要么是旧版本环境已不可得而留下的证据缺口。本轮范围内的活（检测、归因、适配、清单对齐与收键、七套件与单测全绿、文档与报告）没有遗留项。

## 收尾验证方式（本轮读数）

```
stack:up → pid 命令行含 desktop dist bin；副本两行「已剥除（真 home 未动）」；名册=true；无 dsh.bundle 警告
verify 28/28 · row-states 24/24 · dot 21/21 · timestamps 10/10 · selection 20/20 · chat-history 16/16 · settings 20/20
npm test 34/34
```

完整判定表、处置与向下兼容矩阵在 [harness-v0.1.7-alpha.2-adaptation-report.md](../../harness-v0.1.7-alpha.2-adaptation-report.md)。

## 坑

- 真 home 会被日常使用写入托管区段，测试副本忠实同步后 verify:settings 的「基线干净」前提永久不成立；只清副本，不碰真 home。
- 0.1.6 轮起 StateDot 的 class 前缀哈希跨版本变化，但 `data-state` 字面量稳定——本轮失效的是组件结构本身（rect 网格→spinner），只挂 data-state 不再够。
- 「行为验证全绿」不等于「清单对齐」：`verify:settings` 比的是面板显示值与 host 现算值，两边同源，抄错的键名它永远看不见。对 0.1.7 发行包重读 schema 只有三个落点——各包 `lib/*.js` 里的 `Config = z.object({…})`（**沙箱两张卡的 schema 不在 `dsh-*-sandbox` 包里，在 `dsh-bash-local` / `dsh-pwsh-local` 的 `static Config`，sandbox 包只是继承它的执行器**，按包名去 grep 会误判成"上游删了键"）、`dsh-base/cordis.patch.yml` 的 bundle 层默认值、`dsh-web-app/cordis.patch.yml` 的 `disabled: true` 名单。
- 右键菜单不会自己跟上上游的行状态：插件在右键那一刻 `preventDefault()` 掉上游菜单、自己按 `buildItems` 搭 DOM，读上游的只有状态位（`getSnapshot()`），项的集合没有任何通道。凡是「按状态翻转」的项都要手抄一份，且**默认视图筛掉归档行**意味着 `verify` 取第一条会话行时永远测不到那一半——连桩里的 `archivedSessionIds` 都是恒空。新加一类行状态时，先让哨兵能看见它。
- 「显示已归档」是全站共享的视图偏好，手动为调试打开后忘了关，会让后面的套件串台：`verify:chat-history` 的会话挑选取到打不开的归档行（上游 `guardedOpen` 拦下），ABORT 成「找不到恰好一条提问的会话」。归档那两条断言因此自己开、测完自己关。
