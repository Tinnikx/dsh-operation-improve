# 功能 1、2：侧边栏多选与右键菜单

`src/multi-select/index.js`（功能 1）、`src/context-menu-feature/index.js`（功能 2）。菜单本体、选择状态、行识别、词典都来自[基础层](./shared-api.md)。

- 功能 1：`ctrl`/`cmd` + 点击多选工作区行或会话行，限制同级（会话与工作区不能混选）。
- 功能 2：侧边栏行的右键菜单。**会话单选整份就是该行原有「...」菜单的那几个条目**（本插件把它们从上游 slot 读出来自己渲染，上游加选项本地自动跟上）；工作区单选对齐「...」的那两项并另加一项「新会话」（对齐的是行 hover 时那枚按钮，不在「...」里）；多选只有工作区给批量删除，会话多选不给任何动作。

两者都在侧边栏挂**捕获阶段**监听（要抢在 React 合成事件之前拦下 `ctrl` 点击与右键），菜单卡片挂 `document.body`（`z-index: 2147483000`），高亮走 `[data-dsh-oi-selected]` 属性——不复用行自己的 `_selected` 类，那是「当前会话」的语义。

## 多选高亮长什么样

**主题强调色实色描边 + 24% 淡填充**，两条通道分工明确：描边承重，填充只做氛围。强调色取主题 token `--dsw-alias-brand-primary-new-colorprimary-new-color`，描边色再向文字色混 30%，圆角不覆盖、沿用上游的 `--dsw-radius-md`。

这个形状不是审美偏好，是被测出来的：底色填充无论调到多深，对相邻底色的对比度天花板都在 1.2~1.4×（普通行 1.18~1.41×）——填充不足以单独承担识别，描边才有 3~5× 的量级。

**深浅两档都有硬断言**（`npm run verify:row-states`，两档各算一遍）：

| 量 | 判据 | 实测 浅 / 深 |
| --- | --- | --- |
| 描边 vs 侧边栏底色 | ≥ 3:1 | 6.52× / 7.47× |
| 描边 vs 描边内侧填充 | ≥ 3:1 | 4.85× / 5.28× |
| 填充 vs 普通行底色 | ≥ 1.15× | 1.34× / 1.41× |

混 30% 那一步是为「换主题换色相」兜底：主题可以给出任意强调色（包括与侧边栏同族的浅蓝这类几乎同色的值），纯色描边在浅色档遇到浅强调色会掉到 1.25×，混完升到 2.42×，主流强调色全在 3.7× 以上。实测推导与最坏情形扫描见 [docs/handoff/019-multiselect-highlight-outline.md](handoff/019-multiselect-highlight-outline.md)。

「当前会话被批量圈选」时多选描边与功能 10 的青色竖条同现——两者的层叠归属见 [docs/feature-10-row-states.md](feature-10-row-states.md)。

## 菜单项与服务映射

单选会话的菜单整份就是该行自己那个「...」菜单里的条目，由本插件从上游 slot 读出来自己渲染；单选工作区的是照着那个「...」对齐的：项、顺序、文案、图标、是否标红、点下去做什么六样一样，上游没有分隔线这里也不加。文字不写在插件里，右键那一刻从词典里取（来源见 [src/shared/locale.js](../src/shared/locale.js)）；卡片与条目组件见[菜单外壳与条目来源](#菜单外壳与条目来源)。

| 场景 | 文案键 | 词典 | 调用 |
| --- | --- | --- | --- |
| 单选 workspace | `actions.newSession`（排第一）+ `rename` / `delete.workspace` | 上游 `workspace` | `uiWorkspace.startSession(workspaceId)` / `workspaces.rename` / `workspaces.delete` |
| 单选 session | 由上游 slot 条目提供，本插件不拼项：`menu.pinSession` / `menu.unpinSession`（按置顶态翻转）+ `rename` + `menu.fork` + `menu.archiveSession` / `menu.unarchiveSession`（按归档态翻转） | 上游 `workspace` | 上游各条目自己的实现（`pinSession` / `requestSessionRename` / `forkSession` / `archiveSession`） |
| 多选 workspace | `batch.deleteWorkspaces` | 本插件 | `workspaces.delete` 逐个 |
| 多选 session | **无**——本插件不弹菜单，也不拦默认行为（上游行上没有右键菜单，结果是浏览器默认，通常什么都不弹） | — | — |
| 选中文本（功能 6） | `copy` | 上游 `common` | `writeClipboard(text)` |
| 可输入落点（功能 6） | `selection.paste` | 本插件 | `readText()` + 派发 `ClipboardEvent('paste')` |

**会话单选那一行就是上游的四个条目**（[src/shared/slot-rows.jsx](../src/shared/slot-rows.jsx) 渲染），所以「点下去做什么」也不再是本插件抄的：置顶走 `workspaces.pinSession`/`unpinSession`，重命名弹上游 `SessionRenameDialog`（`shell.overlay` slot），分叉走 `sessions.fork({increaseTitle:true})`，归档走 `workspaces.archiveSession`，被 host 拒时由上游弹「停止并归档此会话？」并带 `{stopActivity:true}` 重试。**这一支本插件不再有任何一行自己的会话逻辑。**

**`fork` 之后不自动打开子会话**。上游那条条目也不打开，本插件曾经轮询侧栏点行补上这一步（fork 成功后子行进列表是异步的，轮询窗口 3 秒），现在去掉了：菜单既然是上游那份，行为就该是上游那份，差一步就又要跟着改。

**工作区单选多出的「新会话」不是漂移，是补齐**。上游把新建会话放在行 hover 时那枚与「...」并列的 icon button 上（同一个 `rowActions` 槽，文案 `actions.newSession`、图标 `IconNewChatOutlineRegular`），它根本不在「...」菜单里，逐项对齐「...」对齐不到它。点它走 `UiWorkspaceService.startSession(workspaceId)`（`ctx.get('uiWorkspace')`），与上游按钮同一条路径：复用一个空白会话而不是每次 `sessions.create`，并在同工作区已有会话时展开该组。本插件的展开靠点行本身（行 `onClick` 就是 `onToggle`），只在 `aria-expanded === 'false'` 时点——已展开再点一次会把它收起来。两处缺席是同一件事：「未分组」那一行反查不到 `workspaceId`（上游给的是 `undefined`），压根不接管那次右键；`uiWorkspace` 服务还没注册时整项不出现，免得给一个点下去没有回应的入口。

**功能 6 一个 harness 服务都不调**，两项都只落在浏览器的剪贴板与编辑管线上，所以它没有二次确认、也没有可打桩的破坏性动作（验证脚本因此不注入 ctx，见[验证 · 功能 6](./verify.md#功能-6-的验证)）。「复制」借 harness **common** 词典的 `copy`——消息气泡上那枚复制按钮用的就是这一条，自己再写一遍就是给同一个动作起第二个名字；common 里没有 `paste`，所以「粘贴」和批量那两项一样自注册在本插件的 namespace 下。

**单选各项必须借上游的词条，不能自己写一份**。同一条操作在这个菜单和行上那个「...」菜单里必须是同一个词——fork 在上游叫「分叉会话」，自己写成「复刻会话」就是给同一个动作起了第二个名字；而借词条同时买到了跟随语言切换，因为 `t` 在调用时才读 active locale。批量两项上游没有对应说法（上游没有多选），只能自注册。

**会话那几项的文案、图标与「按行状态翻转」都由上游条目自己算**：置顶项在未置顶时是「置顶会话」+ 空心图钉、已置顶是「取消置顶」+ 实心图钉；归档项与取消归档项共用一个 slot，按归档态换文案、图标与方法；归档行不渲染置顶项。判据取自上游条目各自的快照绑定，所以别的入口改了置顶/归档态，这一行不用改代码就跟着变。

**归档这一项整条链都在上游**：会话有进行中的工作时第一次 `archiveSession` 会被 host 拒（`WorkspaceArchiveError`，`rpcError.code === 'workspace/session-active'`），上游捕获后弹「停止并归档此会话？」列出将被停的回合 / 子代理 / 后台任务 / 定时提醒，确认了才带 `{ stopActivity: true }` 重试。这个对话框与那份 activity 列表正是当初抄不起的部分——插件只发第一次调用又不 catch 的写法，对这类会话是静默没反应。

连带后果：会话多选没有批量归档（`sessions` 契约上也没有 delete），选中、计数与高亮照常，右键那一层整个交回页面。置顶不是破坏性操作，没有批量版。

**工作区单选那三项的动作**：`uiWorkspace.startSession(workspaceId)` / `workspaces.rename(id, title)` / `workspaces.delete(id)`，前两项与上游按钮/对话框同一条路径。重命名用 `window.prompt`，提示语取上游那个对话框的标题（`rename.workspace.title`），初值与 `{name}` 取自 [`rowTitle`](../src/shared/row-probe.js) 的 `group.label`——**不能退回整行 `textContent`**，工作区行里连着会话条数。删除与批量删除都要确认：单选那条拼上游对话框的标题（`delete.workspace`）与正文（`delete.desc`，带 `{name}`），`confirm` 只收一段文本，两者之间补一个空行；批量那一项上游没有对应入口，也一律问一次——一次点掉多行没有撤销。两个对话框都可通过 `installContextMenu({ confirm, prompt })` 注入替换。

## 菜单外壳与条目来源

卡片是上游 `@deepseek-ai/dsh-client-ui-primitives` 的 `Menu`，由本插件 `createRoot` 出的常驻 React 树渲染并 portal 到 `document.body`；共享层的机制见[基础层](./shared-api.md#srcsharedmenujsx)。所以外壳这一层没有任何可漂移的东西：图标是上游组件本体、尺寸档位是上游 `Menu.module.css` 的默认档、描边色那两半由上游 `MenuSurface` 自己凑齐（`data-menu-material="translucent"` 与 `--dsw-elevation-stroke-color`），本插件的 `MENU_CSS` 只剩一条 `z-index`——侧栏那两处「...」菜单渲染 `Menu` 时也没传 `compact`/`dense`，档位天然同档。

**会话单选的条目整份来自上游 slot `sidebar.workspaces.session.menu.item`**，插件自渲染那四个条目（置顶 / 重命名 / 分叉 / 归档，order 各差 100），上游往这个 slot 注册新条目本地自动跟上，那份渲染见 [src/shared/slot-rows.jsx](../src/shared/slot-rows.jsx)。工作区与多选那几项上游没有对应的 slot，仍是 data 行：上游的 `ProjectRowItem` 只把 rename / delete 挂在「...」上，「新会话」放在行 hover 的第二枚按钮里，而多选是本插件的概念。

条目集合因此分两类：**会话单选跟随上游**（项、顺序、文案、图标、置顶/归档态翻转、快捷键提示、点下去做什么，全部是上游的实现），**工作区单选与多选是本插件自己拼的**（文案借上游 `workspace` 与本插件词典，图标用上游组件）。这一支的漂移哨兵是 `verify:find` 与 `verify:selection` 里那两条「工作区菜单 === 上游「...」的两项 + 词典里的新会话」逐项比对。

## 已知限制

- 工作区单选与多选那几项的文案借上游 `workspace` 与本插件词典的键。上游改键名不会让页面崩，只会让菜单上出现一行 `menu.fork` 这样的键名本身，并在控制台 `console.warn` 一次；`verify` 里那两条「菜单项 === 上游词典给的文本」的断言会先撞上这种改动。
- `paste` 那一枚是自绘的，上游图标集里没有剪贴板/粘贴矢量可跟。它没有哨兵：上游哪天加了自己的粘贴图标，这一项仍画着自绘那版，两处矢量会不一致而没有断言拦。判据只能是人眼。
- 会话单选那几项跟随上游 slot，上游加选项、改文案、改图标、加第三种行状态都自动跟上，本插件不用改代码（见[菜单外壳与条目来源](#菜单外壳与条目来源)）。工作区单选与多选那几项是本插件拼的，漂移表现是「和那个『...』菜单不一样」，哨兵只有 `verify` 里那几条逐项比对，脱离测试栈跑不到。
- 会话多选没有批量动作（见[菜单项与服务映射](#菜单项与服务映射)）：选中两条会话后右键，本插件不弹菜单、也不 `preventDefault`。留着多选是为了高亮与计数，不是为了一个不存在的批量操作。
- `fork` 之后不自动打开子会话（见[菜单项与服务映射](#菜单项与服务映射)）。上游那条条目也不打开，菜单既然整份跟上游，行为就跟上游。
- 多选高亮靠 `MutationObserver` 在列表重渲染后重刷，列表极频繁变动时会有一帧的高亮延迟。
- `rowId` 的 fiber 反查失效时两项功能一起静默失灵，见[基础层 · 已知限制](./shared-api.md#已知限制)。
