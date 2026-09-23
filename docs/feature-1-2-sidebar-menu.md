# 功能 1、2：侧边栏多选与右键菜单

`src/multi-select/index.js`（功能 1）、`src/context-menu-feature/index.js`（功能 2）。菜单本体、选择状态、行识别、词典都来自[基础层](./shared-api.md)。

- 功能 1：`ctrl`/`cmd` + 点击多选工作区行或会话行，限制同级（会话与工作区不能混选）。
- 功能 2：侧边栏行的右键菜单。单选逐项对齐该行原有「...」菜单（含按行状态翻转的那两项），多选只保留批量破坏性操作。

两者都在侧边栏挂**捕获阶段**监听（要抢在 React 合成事件之前拦下 `ctrl` 点击与右键），菜单直接挂 `document.body`（`z-index: 2147483000`），高亮走 `[data-dsh-oi-selected]` 属性——不复用行自己的 `_selected` 类，那是「当前会话」的语义。

## 菜单项与服务映射

单选菜单是照着该行自己那个「...」菜单对齐的：**项、顺序、文案、图标、是否标红、点下去做什么，六样都一样**，上游没有分隔线这里也不加。文字不写在插件里，右键那一刻从词典里取（来源见 [src/shared/locale.js](../src/shared/locale.js)）；图标见[下一节](#图标与尺寸)。

| 场景 | 文案键 | 词典 | 调用 |
| --- | --- | --- | --- |
| 单选 workspace | `rename` / `delete.workspace` | 上游 `workspace` | `workspaces.rename` / `workspaces.delete` |
| 单选 session（未归档） | `menu.pinSession` / `menu.unpinSession`（按置顶态翻转，排第一）+ `rename` / `menu.fork` / `menu.archiveSession` | 上游 `workspace` | `workspaces.pinSession` / `workspaces.unpinSession` / `sessions.binding(id).session.rename` / `sessions.fork` / `workspaces.archiveSession` |
| 单选 session（已归档） | `rename` / `menu.fork` / `menu.unarchiveSession`（置顶项缺席，末项换成取消归档） | 上游 `workspace` | 同上，末项走 `workspaces.unarchiveSession` |
| 多选 workspace | `batch.deleteWorkspaces` | 本插件 | `workspaces.delete` 逐个 |
| 多选 session | `batch.archiveSessions` | 本插件 | `workspaces.archiveSession` 逐个 |
| 选中文本（功能 6） | `copy` | 上游 `common` | `writeClipboard(text)` |
| 可输入落点（功能 6） | `selection.paste` | 本插件 | `readText()` + 派发 `ClipboardEvent('paste')` |

**功能 6 一个 harness 服务都不调**，两项都只落在浏览器的剪贴板与编辑管线上，所以它没有二次确认、也没有可打桩的破坏性动作（验证脚本因此不注入 ctx，见[验证 · 功能 6](./verify.md#功能-6-的验证)）。「复制」借 harness **common** 词典的 `copy`——消息气泡上那枚复制按钮用的就是这一条，自己再写一遍就是给同一个动作起第二个名字；common 里没有 `paste`，所以「粘贴」和批量那两项一样自注册在本插件的 namespace 下。

**单选各项必须借上游的词条，不能自己写一份**。同一条操作在这个菜单和行上那个「...」菜单里必须是同一个词——fork 在上游叫「分叉会话」，自己写成「复刻会话」就是给同一个动作起了第二个名字；而借词条同时买到了跟随语言切换，因为 `t` 在调用时才读 active locale。批量两项上游没有对应说法（上游没有多选），只能自注册。

**置顶项跟着行的置顶态翻转**（未置顶 → 「置顶会话」+ 空心图钉 → `workspaces.pinSession`；已置顶 → 「取消置顶」+ 实心图钉 → `workspaces.unpinSession`）。置顶态在开菜单那一刻读 `workspaces.list.getSnapshot().pinnedSessionIds`，不订阅不缓存——和文案同一时刻求值，才跟得上别处的改动。归档行上游不渲染这一项（菜单与 hover 按钮都不），这里同样不给，判据取自同一快照的 `archivedSessionIds`。置顶不是破坏性操作，批量菜单不加。

**归档行上末项整条翻转成「取消归档」**（`menu.unarchiveSession` + `IconUnarchiveOutlineRegular` → `workspaces.unarchiveSession`）：上游那一项是同一个 slot（order 400）按归档态换文案、图标与方法，不是多出一项——归档行上挂一枚「归档会话」就是个点了没有后果的死项。该 home 里没有归档会话时这一项无从对照，`verify` 的归档行那两条会 FAIL 并点名先去归档一条会话（见[验证](./verify.md#端到端)）。

**这两处翻转都是手抄，不是从上游菜单读的**：右键那一刻插件 `preventDefault()` 掉上游自己的菜单，弹的是按 `buildItems` 现搭的一份 DOM，所以「上游在某状态下给哪几项」这件事没有任何运行时通道——上游能自动跟着状态变的，这边一律要跟着改代码。状态位本身（`pinnedSessionIds` / `archivedSessionIds`）读的是上游快照，项的**集合**不读。漂移的表现因此不是报错而是「和那个『...』菜单不一样」，哨兵只有 `verify` 里那几条逐项比对。

**会话重命名走 `sessions.binding(id)?.session.rename(title)`**，即上游 `WorkspaceBrowser` 用的那条路径，不是 `workspaces` 上的方法。`binding()` 对「既没被列出也没被 scope」的会话返回 `undefined`；侧边栏里的行按定义都在列表里，所以走到这里拿不到 binding 说明选中的 id 根本不是会话，**必须抛**而不是当成「改名没生效」静默返回。`rename()` 自己不抛，失败包在 `RpcResult.ok` 里。**会话没有 delete**，所以多选会话永远不出现批量删除——这是服务能力决定的，不是取舍。

`fork` 跟上游一样带 `increaseTitle: true`，并把返回的子会话**打开**——两个动作缺一个都是「和那个菜单看着一样、点下去不一样」。「打开」没有服务可走：`ISessions` 契约上没有 `open`（`retain` 只建引用不动 UI），唯一公开路径是应用自己的导航——插件在侧栏轮询行 id 等于子会话的那一行（fork 返回后行进列表也是异步的，轮询窗口 3 秒）并 `click()` 它。超时找不到就出声放弃：fork 本身已成功，「没帮忙打开」既不该伪装成动作失败，也不该静默。

二次确认也照着上游：删除工作区上游弹对话框，这里就 `window.confirm`，文案拼上游那个对话框的标题（`delete.workspace`）与正文（`delete.desc`，带 `{name}`），`confirm` 只收一段文本，两者之间补一个空行；**归档会话上游点下去直接归档，单选这里也不问**——它只在该会话**没有**进行中的工作时成立，见[已知限制](#已知限制)。批量两项上游没有对应入口，一律问一次——一次点掉多行没有撤销。重命名用 `window.prompt`，提示语取上游那两个对话框的标题（`rename.session.title` / `rename.workspace.title`），初值与 `{name}` 取自 [`rowTitle`](../src/shared/row-probe.js)，即上游各自对话框的初值字段（会话 `row.title`、工作区 `group.label`）——**不能退回整行 `textContent`**，会话行里连着状态点与相对时间。两个对话框都可通过 `installContextMenu({ confirm, prompt })` 注入替换（测试即这么打桩）。

## 图标与尺寸

图标是从 `@deepseek-ai/dsh-client-ui-primitives` 的图标库里**逐字拷过来的内联 SVG**（[src/shared/menu-icons.js](../src/shared/menu-icons.js)），取 Regular 档（`IconEditOutlineRegular` 等：`fill="none"` + `stroke-width="1"` 的描边制，`path` 上按声明落 `stroke` 或 `fill`）。那个包只导出 React 组件，本插件是纯 DOM 的，拿不到非 React 的取用口；拷贝的代价是上游换一版矢量这边不会有任何编译期报错，只是画着一版旧的。所以判据放在 `verify` 里：当场点开同一行真实的「...」菜单，与自己弹的那个逐项比 `viewBox` / `width` / `height` / 全部 `path[d]`。

**`paste` 那一枚是自绘的，没有上游原件，因此不受上面那条哨兵保护**。上游图标集里没有剪贴板/粘贴矢量，只能照着这一批的规格画：16×16 viewBox、`fill="none"` + `stroke-width="1"` + `stroke="currentColor"`，圆角外框加夹子。它唯一的判据是人眼——把它和 copy / edit / trash / archive 并排渲染在 16px 与 128px 两档上看描边粗细与圆角是否同族。相应地，`copy` 那一枚有真实哨兵：`verify:selection` 会去页面上找那枚真实的消息复制按钮（按 `aria-label` 定位，不按 `d` 反查——按 `d` 找就成了拿常量去证明常量），逐字比 `viewBox` 与全部 `path[d]`。

尺寸抄的是 `Menu.module.css` 的**默认档**而不是 `.compactList`：卡片 `padding: 3px`、圆角 16px、`min-width: 144px`，行 `min-height: 34px`、字号 13/20、图标 14px——侧边栏那两处「...」菜单渲染 `Menu` 时既没传 `compact` 也没传 `dense`，抄紧凑档就和被对齐的目标差一整个尺寸级。同样由 `verify` 对两个菜单读 `getComputedStyle` 逐键比对，危险项（工作区删除）的配色单独比一份——它走的是另一套 token，和普通项一起比的话把 `danger` 规则整条写错也照样过。

## 已知限制

- 右键菜单借的是上游 `workspace` 词典的键。上游改键名不会让页面崩，只会让菜单上出现一行 `menu.fork` 这样的键名本身，并在控制台 `console.warn` 一次；`verify` 里那两条「菜单项 === 上游词典给的文本」的断言会先撞上这种改动。
- 按行状态翻转的两项（置顶、归档）是手抄的翻转表，上游没有给任何运行时通道（见[菜单项与服务映射](#菜单项与服务映射)末段）。上游加第三种行状态、或改某一项的翻转口径，这边只会「和『...』菜单不一样」；归档那一半的哨兵要求测试 home 里**至少有一条归档会话**，没有就 FAIL。
- 批量那一项不看归档态：选中集合里混着已归档的行时，「归档 N 个会话」会对它们再发一次 `archiveSession`。上游没有批量入口可对照，这条没有对齐目标，属于本插件自己的口径。
- 右键菜单的图标是拷贝，尺寸是照抄，两者都没有编译期保障。上游换一版矢量或改一档尺寸，页面上只是「和那个『...』菜单不太一样」，不报错；`verify` 里逐项比对 `path[d]` 与 `getComputedStyle` 的那几条断言是唯一的哨兵，脱离测试栈跑不到（见[图标与尺寸](#图标与尺寸)）。拷贝里有一枚 `viewBox` 是 20（`IconUnarchiveOutlineRegular`，上游那枚原件自己就不是这批常见的 16），把它"统一"成 16 会被哨兵当场抓住。
- 归档一项只在会话**没有**进行中工作时与上游一致地「直接归档」。0.1.7 的上游对有进行时的会话是先发一次 `archiveSession`，被 host 拒（`workspace/session-active`）后弹「停止并归档此会话？」并列出将被停的回合 / 子代理 / 后台任务 / 定时提醒，确认才带 `{ stopActivity: true }` 重试。本插件发的是不带 options 的那一次且 `run()` 不 catch——被拒时表现为菜单关掉、什么都没发生，只在控制台留一次未处理 rejection。要不要跟那个对话框是产品决定，未跟。
- 多选高亮靠 `MutationObserver` 在列表重渲染后重刷。列表极频繁变动时会有一帧的高亮延迟。
- `rowId` 的 fiber 反查失效时两项功能一起静默失灵，见[基础层 · 已知限制](./shared-api.md#已知限制)。
