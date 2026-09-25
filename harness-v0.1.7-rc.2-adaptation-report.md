# harness v0.1.7-rc.2 适配报告

检测与适配日期 2026-09-25。目标版本三处对上：desktop dist 打包的 `@deepseek-ai/dsh` 的 `package.json`、`lib/bin.js --version`、`dsh-app-boot` 的 `getDshRuntimeVersion()` 读数都是 **0.1.7-rc.2**。测试栈跑的就是 dist 那份构建。

本轮口径沿用上一轮的用户决定：**单版本锚定，只对齐最新 harness，不保留旧版本兼容路径**。

## 比对材料

`dsh-desktop/node_modules/.pnpm/` 里 rc.1 与 rc.2 两版发布物并存，所以本轮的上游变化面是**两版发布物直接对读**出来的，不依赖 dev 仓源码，也不依赖 release notes。比对方式：逐包 `diff -rq`，排除 `node_modules` / `.bin` / `package.json` / `README*` / `LICENSE` / `*.md`，只留包自身内容的差异。

结果：包名集合 rc.1=267、rc.2=273，**267 个同名包全部可比，其中 110 个自身代码有差异**（rc.1 轮同口径是 54），其余 157 个只换文档。rc.2 新增 6 枚包、移除 0：`dsh-client-shortcuts`、`dsh-client-ui-shortcuts`、`dsh-experimental-auto-review`、`dsh-llm-deepseek-account`、`dsh-llm-deepseek-api-key`、`dsh-util-code-language`。

**排除表要跟着上游走**：rc.2 全量换了 `README.i18n.yaml` 的双语配对记录格式（从两个 git blob hash 改成逐标题分节哈希），沿用 rc.1 那张只排 `package.json` 的表会得出「267/267 全有差异」的假信号——文档面必须一起排，否则噪声吃掉全部信号。任何一轮先拿一个已知无变化的小包（本轮 `dsh-util-time`）看差异落在哪个文件上，再定排除表。

## rc.2 相对 rc.1 的变化（落在本插件镜像面上的部分）

本插件把上游的菜单项集合、图标矢量、菜单样式档、活跃标记结构与配色、会话行 DOM 契约、逐行时间锚点、清单字段值域**逐字镜像**进代码（镜像的理由见 [docs/feature-1-2-sidebar-menu.md](docs/feature-1-2-sidebar-menu.md) 与 [docs/feature-8-harness-config.md](docs/feature-8-harness-config.md)）。九个镜像面逐面核对，**八个相同、一个漂移**：

| 镜像面 | rc.2 与 rc.1 | 证据 |
| --- | --- | --- |
| 菜单样式档（功能 2、6） | **漂移** | 见下段 |
| 七枚 Regular 图标（功能 2、6） | 相同 | 7/7 逐字节，`path[d]` / viewBox / 根 `fill:"none"` / `strokeWidth:1` 全等；rc.2 只新增一枚无关的 `IconArchiveOffOutlineRegular` |
| 会话行「...」项集合与 order（功能 2） | 相同 | pin 100 / rename 200 / fork 300 / archive 400 逐字节 |
| StateDot ongoing（功能 5） | 相同 | `StateDot.module.css` 与组件体字节级相同 |
| 侧栏行 DOM 契约（功能 1、2、10） | 相同 | `_sessionRow` / `aria-selected` / `_projectRow` 等渲染段计数两版相等 |
| 逐行时间锚点（功能 4） | 相同 | `ChatNodeSeat` 属性段 md5 相同；`flowKey` 表达式逐字相同；`_timeStart` / `_timeEnd` 规则相同 |
| 轮次导航列与气泡（功能 9） | 相同 | `TurnNavigator` 与 `mergeTurnRailItems` 无差异 |
| 思考区（功能 7） | 相同 | `_thinkBody` 那条规则相同，上游仍不给它 `max-height` / `overflow` |
| 会话流展示档位表（影响验证现场） | 相同 | `TRANSCRIPT_VIEW_MODES` 档位表无差异 |

**漂移的那一面是菜单样式档**。上游 `dsh-client-ui-primitives/lib/Menu.module.css` 改了三处值，插件侧 [src/shared/context-menu.js](src/shared/context-menu.js) 的 `MENU_CSS` 已跟着对齐（硬编码数字保留硬编码，与镜像面其余项同一写法）：

| 项 | rc.1 → rc.2 上游 | 插件侧 |
| --- | --- | --- |
| 卡片 `padding` | `3px` → `4px` | 3px → 4px |
| 行 `border-radius` | `8px` → `var(--dsw-radius-md)`（= 12px） | 8px → 12px |
| 图标 `color` | `--dsw-alias-label-tertiary` → `--dsw-alias-menu-icon` | 跟着换成新 token |

卡片圆角走 `--dsw-radius-lg` 仍是 16px，`min-width:144px`、行 `min-height:34px`、`13px`·`20px` 字号行高、`gap:6px`、图标 `14px`、`.separator` 全部不变。

现场证据：`verify` 的 metrics 断言是当场点开同一行真实「...」菜单逐项比 `getComputedStyle`。对齐前红两条并报出 `list.padding: 本插件 "3px" / 上游 "4px"`、`item.borderRadius` 8px vs 12px、`icon.color` `rgb(129,133,140)` vs `rgb(53,54,56)`；对齐后 `verify 27/27`（见「验证结果」）。

设计令牌面：`dsh-client-ui-theme` 的 token 名 373 → **395**，新增 22 枚、**删除 0、改名 0**（`--dsw-radius-xs/sm/md/lg/xl/panel` = 4/8/12/16/20/28px、`--dsw-alias-menu-icon`、`--dsw-menu-surface-fill`、`--dsw-focus-ring-color/-width`、`--dsw-font-family-brand`(Montserrat)、以及 onboarding / settings / toast / tooltip 若干）。同名 token 的值序列有变化的 5 枚：`--dsw-specific-menu`（改成指向新的 `--dsw-menu-surface-fill`，深色那档值也换）、`--dsw-mask-blur`（`blur(2px)` → `none`）、`--dsw-elevation-stroke-color`（多出一条 `l3`）、`--dsw-alias-bg-document-preview`、`--dsw-alias-label-document-preview`。插件借色全走 token 引用，`--dsw-specific-menu` 仍存在，所以 `MENU_CSS` 与 `FIND_CSS` 的 `var()` 链自动跟着新值，无需改动。

## rc.2 的三项新机制

1. **快捷键注册表**（新包 `dsh-client-shortcuts` / `dsh-client-ui-shortcuts`）：按 `code` + 修饰键集合建精确索引，派发监听挂 `window` **冒泡**相位（同一文件里另有一枚 capture 监听只记录 dead-key 与输入法语义），`gesture.defaultPrevented || gesture.composing` 即弃权并重新读 `event.defaultPrevented`；可配置命令强制带修饰键。默认绑定按 runtime 分档，`desktop:macos/windows/linux` 用一套修饰键、`web:macos/windows` 用另一套。
2. **菜单开始显示键帽**：`MenuItemButton` 新增 `shortcut` prop，`Menu.module.css` 新增 `.shortcut` / `.shortcutKeys` 与一份新的 `ShortcutKeys.module.css`。上游会话「...」的 rename / fork / archive 三项挂上了组合键（pin 没有），归档行显示「取消归档」时不挂。
3. **主题焦点环**：新增 `focus.css`——`:focus-visible { outline-color / outline-width }` 给全局 2px 业务色，`html[data-input-modality=pointer]` 下非 `:read-write` 元素转透明，另给 `[data-dsh-automatic-focus]:focus { outline: none }`；上游 `Menu.module.css` 同步加了 `.item:focus-visible { background: hover 色; outline: none }`。

## 与功能 11 的交集（本轮登记，行为未改）

上游把「分叉会话」绑成 `session.fork` → code `KeyF`，`desktop` 档修饰键 `["primary","alt"]`、`web:macos` / `web:windows` 档 `["primary","shift"]`（`web:linux` 没有默认绑定）。功能 11 的抢键判据是 `(ctrl || meta) && !altKey && key 是 f/F`，**不排 shift**，因此在这两个 web runtime 档上会吞掉上游的分叉键。纯 `Ctrl/Cmd+F` 上游没有任何注册（`CSS.highlights`、`::highlight(`、`attachShadow`、`key === "f"` 四条在 273 包搜索面上命中全为 0），插件的捕获阶段 `preventDefault + stopPropagation`（[src/find/index.js](src/find/index.js) 第 326、340 行）天然先于上游那枚冒泡监听，抢占依旧成立。

用户决定维持现状不改判据，此处只登记。想在这两档上共存，改一处即可：判据里加一条 `!event.shiftKey`。

另两项上游观感变化同样**只登记、不镜像**：键帽列（插件菜单项右侧不显示组合键）与 `.item:focus-visible`（插件项在键盘导航下吃主题那 2px 焦点环，而不是上游的 hover 底色 + 无环）。两项都不改变任何动作，也落在现有断言的覆盖范围之外。

## 兼容性预检在本轮咬到的东西

`dsh-app-boot` 的预检（rc.1 引入的机制）这轮否决了一条第三方插件：`dsh-any-background@0.3.1` 的 peer 上限只到 `0.1.7-rc.1`，在 rc.2 上被加 `disabled`，测试栈日志第一行即

```
dsh: skipping profile bundle "dsh-any-background": Error: Plugin dsh-any-background@0.3.1 is incompatible with dsh 0.1.7-rc.2: peerDependencies {…}. … Exact-version exemption: not active.
```

**对本插件的结论：放行**，走的是「清单里没有 `peerDependencies` 键」那条分支（探针读数 `peerDependencies 键存在=false`、`dsh peer 条数=0`、判定 `undefined`）。profile 层没有 `compatibility.json`，即没有任何例外授权被写过（`profiles/web/node_modules/@nanmicoder/dsh-agent-teams/compatibility.json` 那份是包自带的 `recommendedHost` 声明，不是例外）。

陷阱随之登记：**将来只要给本包加一条排除当前运行时的 dsh peer，这一行就会被静默 `disabled`，表现为插件整个没了而页面不报错**——与「注册 id 对不上就 loaded without registering」同一类没有提示的失效。

## 功能 8 清单的 schema 对读

`npm run check:catalog` 在 rc.2 上 **PASS**：清单声明的 16 卡 / 77 字段逐键对上游 `--dump-config-schema`，`type` / `default` 相等且上游边界不更松。

全 profile 面的键位变化（同 profile 两版 dump 对读，独立复算过一遍）：可解析配置字段 rc.1=390 → rc.2=423，**新增 34 / 移除 1 / 共有键约束变化 1**。被否决的 `dsh-any-background` 的 configRef 是 `unknownConfig`、贡献 0 字段，所以这 34 / 1 / 1 全是上游自身变化。新增 34 枚按 entry 分布：`llm-deepseek-account` 18、`ui-settings-account` 9、`time-context` 2、`schedule` 2、`session-log-deepseek` 1、`deepseek-account` 1、`shortcuts` 1；移除的那枚是 `agent-preset-registry.modeSelectionEnabled`；约束变化那枚是 `llm-deepseek.models`（default 里模型条目多了 `toolUpdate: "addition-only"`）。

## 本轮改动

### 1. 菜单样式档三值对齐（唯一的镜像面漂移）

见上表。改的是 [src/shared/context-menu.js](src/shared/context-menu.js) 的 `MENU_CSS`，功能 6 的选区菜单与功能 2 的批量菜单共用这一份，判据由 `verify` 的 metrics 断言当场比。[docs/feature-1-2-sidebar-menu.md](docs/feature-1-2-sidebar-menu.md) 的镜像清单同一次改动里跟上。

### 2. 功能 8 收进两张新卡（14 卡 63 字段 → 16 卡 77 字段）

按 [docs/feature-8-harness-config.md](docs/feature-8-harness-config.md) 「不在清单里的 entry」那四条口径，把 rc.2 新增的 34 枚候选**逐条核完**，结果收两张：

- **第 15 卡「DeepSeek 模型接入（账号登录）」** = 新 entry `llm-deepseek-account` 的 13 枚数值键。判据：上游把 DeepSeek 接入拆成两条 entry，`llm-deepseek` 现在由 `dsh-llm-deepseek-api-key` 提供（API key 那一路），`llm-deepseek-account` 是账号登录那一路；两条在 `dsh-base/cordis.patch.yml` 里同时挂着且都没有 config 块，两半边的 `Config` 都从 `@deepseek-ai/dsh-llm-deepseek` 原样 import，18 枚同名键的约束逐字相同，读值走同一个 `resolveAdapterOptions(plainOptions(config))`，取值时机与第 12 卡一致。只写上一张卡的话，用账号登录的 profile 写下去落不到它正在用的那条 entry 上。
- **第 16 卡「会话日志上传预算」** = `session-log-deepseek.maxBytes`（integer、`min 1`、默认 `8388608`）。判据：`const { maxBytes } = config` 在 `apply` 里解构、用在每一趟上传；两条 patch 层都没有给这条 entry 写过 config。

其余 21 枚按口径拦下并把证据写进 [docs/feature-8-harness-config.md](docs/feature-8-harness-config.md)：`time-context.refreshIntervalMs` 与 `schedule.deliveryHistory{Days,Records}` 撞口径 #2（`dsh-web-app/cordis.patch.yml` 给这两行 `disabled: true`，rc.2 全部 patch 层没有任何一层重新启用，写下去到不了任何会话）；`deepseek-account.balanceTimeoutMs` 撞口径 #4（该 entry 的 bundle config 挂着 `desktopPlatform: !!js "…"`，面板重述会把求值结果当字面量写回，把「按启动环境判定」冻成「按保存那次判定」）；`shortcuts.stopSequenceMs` 与 `ui-settings-account.bonusAckRetry*` / `developerTools` 沿用 `registryProbe*` 那条未查实缺口；`llm-deepseek-account.{baseURL,thinking,reasoningEffort,models,retryPolicy}`、`time-context.timeZone`、`ui-settings-account.{version,step,purpose,process,completion,usage}` 撞口径 #3（值不是数字或布尔）。

现场取证（新增 12a–12d 四条）：写 `llm-deepseek-account.maxTokens = 128000` → **只有账号那条**读到 128000，同一次读数里 `llm-deepseek.live.maxTokens` 是 `null`，区段头点名 `llm-deepseek-account`，**约 2.1s**；清除后 loader 里消失且文件逐字节回基线。`session-log-deepseek.maxBytes = 262144` 同理。面板规模读数 `fields=75`（77 减 `system-prompt` 那两枚走复选框的布尔）、`cards=16`。

`src/harness-config/catalog-limits.js` 里 `IMAGE_OFFLOAD_BYTE_QUANTUM` 的归属注释同一次改动里改成「两条 entry 共用的同一个 `Config` 对象」。

### 3. 三条验证脚本自身的缺陷（都不是插件功能回归）

1. [scripts/verify-live.mjs](scripts/verify-live.mjs) 的归档视图还原按**双态开关**写，而 rc.2 上游把它改成三态选择（`viewOptions.hideArchived` / `showArchived` / `onlyArchived`），再点已选中项是空操作 → 归档态留在打开，串台到后面整套。改成按目标态各点自己的目标项。
2. [scripts/verify-row-states-live.mjs](scripts/verify-row-states-live.mjs) 主题测试还原时**无条件** `setAttribute('data-ds-dark-theme','')`，把浅色页抬成深色，随后降级态断言拿着浅色信号色比 → 假失败。改成只写回自己摘掉的那一样，复位判据取「开局那一档」。触发条件是 rc.2 否决了第三方背景插件后页面回落到标准浅色主题。
3. [scripts/verify-find-live.mjs](scripts/verify-find-live.mjs) 取查询词按**整页原始文本**数重复次数，而插件只搜可见域 → 挑出「 PTC」这类只有 1 条可见命中的词，「Enter 跳下一条 期望 index=1」自相矛盾；「当前项滚进了视口」又查在任何跳转之前（`open()` 不滚动，只有 `step()` 滚）。改成在可见域里要 ≥2 命中，视口断言移到 Enter 之后。插件行为本身两处都正确（单命中时 `nextIndex` 环绕回 0 是承诺的语义）。

这三类失败共同的取证线索：红的那条与被改的功能无关，且第一条红会带崩后面几条——先读第一条红的自述文案。

### 4. 注释与文档里的假事实订正

- [src/chat-history/nav-rail.js](src/chat-history/nav-rail.js) 写着「消息流会分页/虚拟化」，rc.1 与 rc.2 都只有分页（`hasMore` / `loadOlder`），`useVirtualizer` 虚拟的是这条导航列本身。
- 上一轮报告 [harness-v0.1.7-rc.1-adaptation-report.md](harness-v0.1.7-rc.1-adaptation-report.md) 里两处读数口径不准（本轮静态复核发现，两版同此）：`formatMessageClock` 的**真实调用点是 2 处**（`MessageIconActions` 与 `TurnTriggerNodeView` 各一处），「四处」是 grep 命中数含声明；preparing 行的 `visibility` **默认是 `visible`**，只有「step/turn 已关闭而调用仍停在 preparing」那种被打断的情形才 hidden。以本报告为准。
- rc.2 一处会影响功能 4 可见节点集合的上游变化：`isVisibleChatNode` 把带 `tool-addition` / `tool-removal` 块的 `context` 节点从过滤名单放了出来。这类行以前不出现在消息流里，现在会出，且不在 `UPSTREAM_TIME_KINDS` 排除集内，插件按取值链 `data?.time` 给它贴开始时刻。**没有造出现场**：测试栈这份 home 上 `data-chat-flow-kind="context"` 的行计数为 0，所以只有静态判据。记进 [docs/feature-4-timestamps.md](docs/feature-4-timestamps.md)。

## 验证结果（真实运行输出）

栈：`PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/test-stack.mjs up` →

```
[test-stack] 副本的托管区段已剥除（真 home 未动）
[test-stack] 副本的手写 bash-sandbox 项已剥除（真 home 未动）
[test-stack] harness 就绪：http://127.0.0.1:3181/ pid=6638 本插件在名册里=true
[test-stack] Chrome 就绪：CDP 9334 pid=6701 target=http://127.0.0.1:3181/
```

日志里 `declares no dsh.bundle` 计数 `0`（本插件确实注册了 bundle）；`down` 后 `status` 报 `"harnessServing": false` 且 `harnessPid: null`。构建要带 `DSH_ESBUILD_ROOT`（[README.md](README.md) 「构建」写明）。

单元：`npm test` → `tests 44 / pass 44 / fail 0`（含清单自洽那几条，两张新卡自动被同一组规则覆盖）。

清单门禁：`npm run check:catalog` → `dsh=0.1.7-rc.2`、`逐键比对 catalog 16 卡 / 77 字段 vs 上游 schema`、`PASS 全部字段与上游 schema 一致（type/default 相等，上游边界不更松）`。

八套 live 在同一个 rc.2 栈、同一个构建上**一次连跑**（日志 `tmp/rc2m-*.log`）：

```
verify                 passed=27 failed=0 skipped=0 total=27
verify:timestamps      passed=10 failed=0 skipped=0 total=10
verify:dot             passed=21 failed=0 skipped=0 total=21
verify:selection       passed=20 failed=0 skipped=0 total=20
verify:settings        passed=26 failed=0 skipped=0 total=26   # 新增 12a–12d 四条
verify:row-states      passed=24 failed=0 skipped=0 total=24
verify:chat-history    passed=16 failed=0 skipped=0 total=16
verify:find            passed=19 failed=0 skipped=0 total=19
```

合计 **163 条，failed=0 skipped=0**。两条新卡那四条的读数：`12a` 写 `llm-deepseek-account.maxTokens = 128000` → 区段头 `# managed: {"llm-deepseek-account":["maxTokens"]}`、**2090ms** 后 loader 读到 `128000`，同一次读数里 `llm-deepseek` 侧是 `null`；`12b` 点「清除」→ loader 里 `maxTokens` 为 `null`、文件 `bytesIdentical: true`。`12c` 写 `session-log-deepseek.maxBytes = 262144` → 区段头点名该 entry、**2095ms** 后 loader 读到 `262144`；`12d` 同样摘干净回基线。面板规模 `state=ready errors=[] fields=75`、`cards=16`。

菜单样式档那三条的对齐判据不是自证：`verify` 的 metrics 断言当场点开真实「...」菜单逐项比 `getComputedStyle`，对齐前红两条（`list.padding "3px"` vs 上游 `"4px"`、`item.borderRadius` 8px vs 12px、`icon.color rgb(129,133,140)` vs `rgb(53,54,56)`），对齐后该套 27/27。

## 向下兼容

本轮功能 1–7、9、10、11 的插件代码里，只有 `MENU_CSS` 的三个观感值随上游改变，其余镜像面在两版之间逐字相同（见镜像面对读表），所以上一轮对 rc.1 的行为级结论不被撤消；[README.md](README.md) 按单版本锚定只列 rc.2，rc.1 移入历史验证记录。

往下走偏的两处都在功能 8 的新卡上，且都是「写了没人读」的方向：`llm-deepseek-account` 这条 entry 在 rc.1 的 schema dump 的 entries 里**根本不存在**（rc.1 只有 `llm-deepseek`），`session-log-deepseek` 在 rc.1 的 config 只有 `enabled` 一枚、`maxBytes` 是 rc.2 才加的。这两点由两版 dump 对读得出，**没有在 rc.1 栈上实测过落盘后果**（本仓不验旧版本）。harness 的 config 校验是 loose-validation（告警走 stderr），所以更旧版本上的具体表现不在此断言。

## 未做

- **没有造出带 `tool-addition` / `tool-removal` 块的 `context` 行现场**，验功能 4 在新放行的那类行上贴出的标签。缺的是会产生工具增删的会话；判据目前是静态的（取值链第 6 条 + `contextMessage()` 的 `data.time`）。
- **`Ctrl/Cmd+Shift+F` 与上游分叉键的交集维持现状**，没做让位，也没在 `web:macos` / `web:windows` 两档上实测过两者同时在场时的先后。
- **没验上游键帽与焦点环在插件菜单上的观感差异**，两项按用户决定只登记。
- **没验用户 patch 层的 config 是否流进 client 树**（沿用上一轮的缺口），因此 `shortcuts.stopSequenceMs` 与 `ui-settings-account` 那几枚没收。
- **没在真 Electron 桌面客户端里跑过**：验证全部走 headless Chrome（CDP 9334）+ 独立 `DSH_HOME` + 端口 3181，与日常的 3080 无关。因此桌面外壳那层测不到——功能 11 的 `accelerator` 抢键、macOS `cmd+F`、流式时抢滚动都依赖 `before-input-event`，CDP 派发不经过它；本轮的快捷键交集分析也全部是静态读产物。
