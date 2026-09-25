# 015 harness 0.1.7-rc.2 适配

- 目标：用 desktop dist 打包的 0.1.7-rc.2 判定本插件兼容性，漂移处完成适配，产出适配报告与 README 兼容锚定。验收方式：`scripts/test-stack.mjs up` 跑在 rc.2 dist 上 + 八套 `verify:*` 的真实输出 + `npm test` + `npm run check:catalog`。
- 范围：做——两版发布物对读、测试栈实跑、按归因改插件与验证脚本、README 与报告。不做——harness 上游缺陷的上报以外动作、与本轮归因无关的重构。
- 本轮口径沿用用户决定：**单版本锚定，只对齐最新 harness，不保留旧版本兼容路径**。

## 进展

- 目标版本确认：dist `@deepseek-ai/dsh` 的 `package.json` 与 `lib/bin.js --version` 都是 **0.1.7-rc.2**，`getDshRuntimeVersion()` 同读数（探针 `tmp/preflight-check-rc2.mjs` 打 `runtime = 0.1.7-rc.2`）。验证：`~/.dsh/desktop-bin/node-shim/node <dist>/@deepseek-ai/dsh/lib/bin.js --version`。
- 比对材料：`.pnpm` 里 rc.1 与 rc.2 并存，唯一包名 rc.1=267 / rc.2=273，**267 个同名包全部可比，110 个代码面有差异**（上一轮 alpha.2→rc.1 是 54），157 个只换文档。rc.2 新增 6 枚包、移除 0：`dsh-client-shortcuts`、`dsh-client-ui-shortcuts`、`dsh-experimental-auto-review`、`dsh-llm-deepseek-account`、`dsh-llm-deepseek-api-key`、`dsh-util-code-language`。验证：`bash /tmp/cmp-code.sh`（逐包 `diff -rq`，排除 `node_modules` / `.bin` / `package.json` / `README*` / `LICENSE` / `*.md`）。
  **踩坑**：本轮第一版脚本按 rc.1 的排除表只排 `package.json`，得出「267/267 全有差异」的假结果——rc.2 全量换了 `README.i18n.yaml` 的双语配对记录格式（从两个 git blob hash 改成逐标题分节哈希）。文档面必须一起排除，否则噪声吃掉全部信号。
- 九个镜像面逐面核完，**八个相同、一个漂移**：
  - 相同：七枚 Regular 图标（7/7 逐字节，`path[d]`/viewBox/`fill:"none"`/`strokeWidth:1` 全等；rc.2 只新增一枚无关的 `IconArchiveOffOutlineRegular`）、StateDot ongoing（`StateDot.module.css` 与组件体字节级相同）、会话「...」项集合与 order（pin 100 / rename 200 / fork 300 / archive 400 逐字节）、侧栏行 DOM 契约、逐行时间锚点（`ChatNodeSeat` 属性段 md5 相同、`flowKey` 表达式逐字相同、`_timeStart`/`_timeEnd` 规则相同）、`TurnNavigator` 与 `mergeTurnRailItems`、`_thinkBody`（上游仍不给 `max-height`/`overflow`）、`TRANSCRIPT_VIEW_MODES` 档位表。
  - **漂移：菜单样式档**（功能 2、6 镜像）。上游 `Menu.module.css` 改了 `padding: 3px→4px`、行 `border-radius: 8px→var(--dsw-radius-md)`=12px、图标色 `--dsw-alias-label-tertiary→--dsw-alias-menu-icon`；卡片圆角走 `--dsw-radius-lg` 仍是 16px，`min-width:144px` / `min-height:34px` / `13px·20px` / `gap:6px` / 图标 14px / `.separator` 不变。插件侧 `src/shared/context-menu.js` 的 `MENU_CSS` 三处值已对齐（硬编码数字保留硬编码，与镜像其余项同一写法）。
  - 现场证据：`verify` 的 metrics 断言是当场点开同一行真实「...」菜单逐项比 `getComputedStyle`，改动前红两条并报出 `list.padding: 本插件 "3px" / 上游 "4px"`、`item.borderRadius` 8px vs 12px、`icon.color` `rgb(129,133,140)` vs `rgb(53,54,56)`；改后 `verify 27/27`。
- 设计令牌：`dsh-client-ui-theme` token 名 373 → **395**，新增 22 枚、**删除 0、改名 0**（`--dsw-radius-xs/sm/md/lg/xl/panel` = 4/8/12/16/20/28px、`--dsw-alias-menu-icon`、`--dsw-menu-surface-fill`、`--dsw-focus-ring-color/-width`、`--dsw-font-family-brand`(Montserrat)、onboarding/settings/toast/tooltip 若干）。同名 token 的**值序列有变化的 5 枚**：`--dsw-specific-menu`（改成指向新 `--dsw-menu-surface-fill`，深色那档值也换）、`--dsw-mask-blur`（`blur(2px)`→`none`）、`--dsw-elevation-stroke-color`（多出一条 `l3`）、`--dsw-alias-bg-document-preview`、`--dsw-alias-label-document-preview`。插件借色全走 token 引用，`--dsw-specific-menu` 仍存在故 `MENU_CSS` 与 `FIND_CSS` 的 `var()` 链自动跟着新值，无需改。
- **rc.2 新机制（与插件直接相关三条）**：
  1. **快捷键注册表**（新包 `dsh-client-shortcuts` / `dsh-client-ui-shortcuts`）：`code` + 修饰键集合的精确索引，派发监听挂 `window` **冒泡**，`gesture.defaultPrevented || composing` 即弃权；可配置命令强制带修饰键。插件功能 11 的捕获阶段 `preventDefault + stopPropagation` 天然先于它。
  2. **菜单开始显示键帽**：`MenuItemButton` 新增 `shortcut` prop，`Menu.module.css` 新增 `.shortcut` / `.shortcutKeys` + 新 `ShortcutKeys.module.css`。上游会话「...」的 rename / fork / archive 三项挂上了组合键（**pin 没有**），归档行显示「取消归档」时不挂。
  3. **主题焦点环**：新增 `focus.css`——`:focus-visible{outline-color/width}` 全局 2px 业务色，`html[data-input-modality=pointer]` 下非 `:read-write` 元素转透明，另给 `[data-dsh-automatic-focus]:focus{outline:none}`；上游 `Menu.module.css` 同步加了 `.item:focus-visible{background:hover 色; outline:none}`。
- 兼容性预检（rc.1 引入的机制）本轮咬到了东西：`dsh-any-background@0.3.1` 在 rc.2 上被否决（peer 上限只到 `0.1.7-rc.1`），日志一行 `dsh: skipping profile bundle "dsh-any-background"`。本包没有 `peerDependencies` 键 → 放行（探针读数 `peerDependencies 键存在=false`）。profile 层没有 `compatibility.json`（插件 `node_modules` 里那份是包自带的 `recommendedHost` 声明，不是例外授权）。
- 功能 8 清单：`npm run check:catalog` 在 rc.2 上 **PASS**，逐键 16 卡 / 77 字段与上游 `--dump-config-schema` 一致。同 profile 两版对读：可解析配置字段 rc.1=390 → rc.2=423，**新增 34 / 移除 1 / 共有键约束变化 1**（`llm-deepseek.models` 的 default 里模型条目多了 `toolUpdate:"addition-only"`）；被否决的 `dsh-any-background` 的 configRef 是 `unknownConfig`，贡献 0 字段，所以这 34/1/1 全是上游变化。
- **按用户决定「全部候选都核并收卡」，四条口径逐条核完后收两张**（14 卡 63 字段 → **16 卡 77 字段**）：
  - 第 15 卡「DeepSeek 模型接入（账号登录）」= 新 entry `llm-deepseek-account` 的 13 枚数值键。判据：上游把接入拆成两条 entry，`llm-deepseek` 现在由 `dsh-llm-deepseek-api-key` 提供，两条在 `dsh-base/cordis.patch.yml` 同时挂着且都没有 config 块；两半边的 `Config` 都从 `@deepseek-ai/dsh-llm-deepseek` 原样 import，18 枚同名键**约束逐字相同**，读值走同一个 `resolveAdapterOptions(plainOptions(config))`，取值时机与第 12 卡一致。
  - 第 16 卡「会话日志上传预算」= `session-log-deepseek.maxBytes`（integer、`min 1`、默认 `8388608`）。判据：`const { maxBytes } = config` 在 `apply` 里解构、用在每一趟上传；两条 patch 层都没有给这条 entry 写过 config。
  - **不收并写明证据**（写进 [docs/feature-8-harness-config.md](../../docs/feature-8-harness-config.md) 「不在清单里的 entry」）：`time-context.refreshIntervalMs` 与 `schedule.deliveryHistory{Days,Records}` 口径 #2（`dsh-web-app/cordis.patch.yml` 给这两行 `disabled: true`，全仓没有任何一层重新启用）；`deepseek-account.balanceTimeoutMs` 口径 #4（该 entry 的 bundle config 挂着 `desktopPlatform: !!js "…"`，面板重述会把求值结果当字面量写回，把「按启动环境判定」冻成「按保存那次判定」）；`shortcuts.stopSequenceMs` 与 `ui-settings-account.bonusAckRetry*` / `developerTools` 沿用 `registryProbe*` 那条未查实缺口；`llm-deepseek-account.{baseURL,thinking,reasoningEffort,models,retryPolicy}`、`time-context.timeZone`、`ui-settings-account.{version,step,purpose,process,completion,usage}` 口径 #3。
  - 现场取证（新增 12a–12d 四条，`verify:settings` **26/26**）：写 `llm-deepseek-account.maxTokens=128000` → **只有账号那条**读到 128000，同一次读数里 `llm-deepseek.live.maxTokens` 是 `null`，区段头点名 `llm-deepseek-account`，2120ms；清除后 loader 里消失且文件逐字节回基线。`session-log-deepseek.maxBytes=262144` 一对同理（2086ms / 清除回基线）。面板规模读数 `fields=75`（77 减 `system-prompt` 两枚走复选框的布尔）、`cards=16`。
- 三条**验证脚本自身的缺陷**在本轮暴露并修掉（都不是插件功能回归）：
  1. `verify-live.mjs` 的归档视图还原按双态开关写，而 rc.2 上游把它改成三态选择（`viewOptions.hideArchived` / `showArchived` / `onlyArchived`），再点已选中项是空操作 → 归档态留在打开，串台到后面整套。改成按目标态点各自的目标项。
  2. `verify-row-states-live.mjs` 主题测试还原时**无条件** `setAttribute('data-ds-dark-theme','')`，把浅色页抬成深色，随后降级态断言拿着浅色信号色比 → 假失败。改成只写回自己摘掉的那一样，复位判据取「开局那一档」。触发条件是 rc.2 否决了第三方背景插件后页面回落到标准浅色主题。
  3. `verify-find-live.mjs` 取查询词按**整页原始文本**数重复次数，而插件只搜可见域 → 挑出「 PTC」这类只有 1 条可见命中，「Enter 跳下一条 期望 index=1」自相矛盾；「当前项滚进了视口」又查在任何跳转之前（`open()` 不滚动，只有 `step()` 滚）。改成在可见域里要 ≥2 命中，视口断言移到 Enter 之后。插件行为本身两处都正确（单命中时 `nextIndex` 环绕回 0 是承诺的语义）。
- 一处**注释与文档的假事实**顺手订正：`src/chat-history/nav-rail.js` 写「消息流会分页/虚拟化」，rc.1 与 rc.2 都只有分页（`hasMore`/`loadOlder`），`useVirtualizer` 虚拟的是导航列本身。
- 上一轮报告里两处读数口径订正（本轮静态复核发现，两版同此）：`formatMessageClock` 的**真实调用点是 2 处**（`MessageIconActions` 与 `TurnTriggerNodeView` 各一处），「四处」是 grep 命中数含声明；preparing 行的 `visibility` **默认是 `visible`**，只有「step/turn 已关闭而调用仍停在 preparing」那种被打断的情形才 hidden。
- rc.2 一处会影响功能 4 可见节点集合的上游变化：`isVisibleChatNode` 把带 `tool-addition`/`tool-removal` 块的 `context` 节点从过滤名单放了出来。这类行以前不出现在消息流里，现在会出，且不在 `UPSTREAM_TIME_KINDS` 排除集内，插件按取值链 `data?.time` 给它贴开始时刻。**没有造出现场**：测试栈这份 home 上 `data-chat-flow-kind="context"` 的行计数为 0，所以只有静态判据。记进 [docs/feature-4-timestamps.md](../../docs/feature-4-timestamps.md)。

## 收尾验证读数

栈：`PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/test-stack.mjs up` → `harness 就绪：http://127.0.0.1:3181/ pid=6638 本插件在名册里=true`、`Chrome 就绪：CDP 9334`；日志 `declares no dsh.bundle` 计数 `0`；本轮收尾已 `down`，`status` 如实报 `harnessServing:false`。

单元：`npm test` → `tests 44 / pass 44 / fail 0`（含清单自洽那几条，两张新卡自动被同一组规则覆盖）。

`npm run check:catalog` → `dsh=0.1.7-rc.2`、`逐键比对 catalog 16 卡 / 77 字段 vs 上游 schema`、`PASS`。

八套 live 在**同一个栈、同一个构建**（`lib/` 08:06 那份，晚于最后一次 `src/` 改动 08:05）上一次连跑，日志 `tmp/rc2m-*.log`：`verify 27` / `verify:timestamps 10` / `verify:dot 21` / `verify:selection 20` / `verify:settings 26` / `verify:row-states 24` / `verify:chat-history 16` / `verify:find 19`，八套全部 `failed=0 skipped=0`，合计 **163 条**。补跑那两套的单跑读数（`tmp/rc2g-*.log`，同一构建）与连跑一致。

报告已落地：[harness-v0.1.7-rc.2-adaptation-report.md](../../harness-v0.1.7-rc.2-adaptation-report.md)，读数全部取自上面那次连跑与两条独立复算（34-1-1 键位变化、两张新卡在 rc.1 dump 里的存在性）。README 锚定段那句「16 卡 / 77 字段」与实测 `cards=16` / `fields=75`（77 减两枚走复选框的布尔）一致。

## 验收方式

- 功能回归：`PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/test-stack.mjs up` 起在 rc.2 dist 上，再连跑八套（`verify` … `verify:find`），看每套末尾 `failed=0 skipped=0`，合计 163 条。
- 清单对齐：`PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run check:catalog` → `dsh=0.1.7-rc.2`、`16 卡 / 77 字段`、`PASS`；`npm test` → `44 / pass 44 / fail 0`。
- 镜像面漂移这一处单独复核：`verify` 的 metrics 断言当场点开真实「...」菜单逐项比 `getComputedStyle`，把 `src/shared/context-menu.js` 的 `padding` 改回 `3px` 就会红——不靠注释自证。
- 结论与未做五条见 [harness-v0.1.7-rc.2-adaptation-report.md](../../harness-v0.1.7-rc.2-adaptation-report.md)；`context` 工具增删行的现场、`Ctrl/Cmd+Shift+F` 让位、上游键帽与焦点环观感、patch 层 config 流入 client 树、真 Electron 桌面客户端这五项本轮没做，接手时按报告的「未做」判范围。

## 决策与理由（本轮用户定的三条）

- **`Ctrl/Cmd+Shift+F` 交集维持现状，只在报告里登记**：rc.2 上游把「分叉会话」绑成 `primary+shift+F`（`web:macos` / `web:windows` 档；桌面档是 `primary+alt+F`，`web:linux` 无默认绑定），而功能 11 的抢键判据 `(ctrl||meta) && !altKey && key 是 f/F` 不排 shift，在这两个 runtime 上会吞掉上游的分叉键。纯 `Ctrl/Cmd+F` 上游没有任何注册（`CSS.highlights` / `::highlight(` / `attachShadow` / `key === "f"` 四条在 73 包搜索面仍全为 0 命中），插件抢占依旧成立。用户选择不改判据；报告里要写清这处交集、以及在 mac/windows 浏览器档上想共存只需 `find/index.js` 加一条 `!event.shiftKey`。
- **上游新增的两处观感只登记、不镜像**：键帽列（插件菜单项右侧不显示组合键）与 `.item:focus-visible`（插件项在键盘导航下吃主题那 2px 焦点环，而不是上游的 hover 底色 + 无环）。两项都不改变任何动作，也不在现有断言覆盖范围内。
- **rc.2 的 34 枚新配置字段全部逐条核口径并收卡**（不是只登记候选）：结果收两张、其余按四条口径分别拦下并写明证据，见「进展」。

## 坑

- **两版发布物对读时排除表要跟着上游走**：rc.2 换了 `README.i18n.yaml` 的记录格式，只排 `package.json` 会得出「267/267 全有差异」的假信号。任何一轮先拿一个已知无变化的小包（本轮 `dsh-util-time`）看差异到底落在哪个文件，再定排除表。
- **`--dump-config-schema` 的 `status` 字段回答不了「这条 entry 在 web 组合里到底实例化没有」**：已知活的 `session-query-sqlite` 与已知 `disabled: true` 的 `compaction-basic` 在两版 dump 里都是 `status=schema`。挂载状态只能读 patch 文件（`dsh-base` / `dsh-web-app` 的 `cordis.patch.yml`），别拿 dump 的 status 当挂载证据——`time-context` 与 `schedule` 差点被当成可收。
- **验证脚本里「还原」类步骤必须按自己摘掉的东西写回**：`verify-row-states` 无条件补 `data-ds-dark-theme`，在浅色页上等于偷偷换了主题，红的是下游八竿子打不着的降级态断言。同理 `verify-live` 的归档视图按双态来回点，在 rc.2 的三态选择上变成空操作并把状态留给下一套。这类失败的特征是「红的那条与被改的功能无关，且第一条红会带崩后面几条」——先读第一条红的自述文案（脚本自己就写了「会串台到后面的套件」）。
- **取词的域必须与被测功能的命中域同一个**：按整页原始文本数重复次数挑出来的词，在插件的可见命中域里可能只有 1 条，跳转类断言就变成自相矛盾（`total=1` 却期望 `index=1`）。判据要用被测实现自己的域算子（这里复用 `ORACLE_SOURCE(gram,'visible')`）。
- **改了 `src/` 必须重建再验**：`check:catalog` 与 `npm test` 直接 import `src/`，而面板读的是 `lib/client.js`。本轮加完两张卡后第一次跑 `verify:settings` 仍报 `fields=61`，就是因为没重跑 `npm run build`。构建要带 `DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop`。
- **第三方主题插件被预检否决会改变测试现场的默认值**：`dsh-any-background` 在 rc.2 起不再加载，页面回落到标准主题，浅/深色与 `--dsw-alias-*` 解析结果都跟着变。凡是断言里写死「浅色/深色」的读数，换版本时先确认这份 home 上主题到底是谁给的。

## 交付落点

本轮改动分三个提交落地：三套验证脚本自身缺陷、rc.2 适配本体（`MENU_CSS` 三值 + 功能 8 两张新卡 + 12a–12d 哨兵 + 注释/文档订正 + `lib/` 重建）、报告与 README 锚定与版本 0.1.3。工作树干净，未 push。

一次性探针留在 gitignore 的 `tmp/`（`preflight-check-rc2.mjs`、`probe-setarch.mjs`、`probe-viewmenu.mjs`、`probe-reduced.mjs`、`probe-context-rows.mjs`、`probe-panel-scale.mjs`、`run-suite-rc2.sh`），不在仓库；八套全量连跑的原始日志是 `tmp/rc2m-*.log`，测试栈副本 `tmp/dsh-oi-test-home` 保留供下轮增量。
