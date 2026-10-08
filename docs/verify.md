# 验证

九项功能的验证方式。七个 `npm run verify:*` 脚本连的都是同一套[测试栈](#测试栈)，判据与退出码共用 [scripts/lib/cdp.mjs](../scripts/lib/cdp.mjs)。

## node 在哪

本仓库环境的默认 PATH 上没有 `node`。两条都可用，任选其一（下文命令统一写第一条）：

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH        # 产品自带，v24.19.0
PATH=$HOME/.nvm/versions/node/v24.14.0/bin:$PATH   # nvm，v24.14.0
```

## 测试栈

**验证脚本一律打测试栈，不打日常在用的那个 harness。** 端到端断言里有「批量删除工作区」，它会真的发出 click；服务是 spy、闸也有三道，但闸是兜底不是许可证，真数据不该出现在被点击的那一侧。

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:up       # 起
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:status   # 看
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:down     # 停
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:restart  # 重启（跑完 verify:settings 用）
```

`PATH` 前缀在走 `npm run` 时同样不能省：这台机器上的 `npm` 是 nvm v16 那份，它 spawn 的 `node` 直接取自 PATH。

`up` 做三件事：`rsync -a --delete` 把 `~/.dsh` 同步成仓库内的 `tmp/dsh-oi-test-home`（排除 `.credentials.yaml`，首次全量、之后增量）；用产品自带的 node 起一个 `DSH_HOME` 指向副本的 harness，端口 3181；起一个独占 `--user-data-dir` 的 headless Chrome，CDP 9334，带上窗口宽度与 hover 那两个 `--blink-settings`。三个脚本不带参数就打这套地址（默认值在 [scripts/lib/cdp.mjs](../scripts/lib/cdp.mjs) 的 `resolveTarget`）。

harness 带 token 认证：`up` 从 harness 日志提取 `?token=`，先给就绪探针换 cookie，再把 token 拼进 Chrome 的启动 URL（303 落 cookie，之后页面照常跑在 `/` 上）。不带 token 打开的首页是 401 认证屏——就绪探针能过（它带 token），但页面上没有侧边栏也没有输入框，所有 verify 脚本都会在错误页面上空跑。

**副本不能省，也不能让两个 harness 共用一个 `DSH_HOME`**：同一个 home 上的两个 harness 各持一份启动时读进内存的 workspace 状态，谁都不看对方的写入——一边归档掉的会话在另一边照样列着，且后写的静默盖掉前一个。拿真 home 起第二个 harness，等于用测试去改用户正在看的那份列表。

**副本里那条插件软链必须重新指过**。`pnpm add link:` 在 profile 的 `node_modules` 里留的是相对软链，起点是 home 自己；`rsync` 原样搬运目标字符串，副本里那条就从 `/tmp/` 往上数四层指到不存在的 `/tmp/dev/...`——**插件静默消失**，页面照样 200、照样出界面，只是七项功能一个都没有。`syncHome()` 因此在 rsync 之后把它改写成指向本仓库的绝对软链（scoped 包名要先 `mkdir` 出 `node_modules/@Tinnikx/`，并清掉可能残留的旧的无 scope 软链），同时把副本 profile 的 `package.json` 里 `dependencies` 与 `dsh.profile.bundles` 两处改写成 `@Tinnikx/dsh-operation-improve`——**只改副本，真 `~/.dsh` 一个字节不动**。`startHarness()` 再断言首页名册里有 `@Tinnikx/dsh-operation-improve`。

`resolveTarget` 见到 `:3080` 直接 `abort` 并打出起测试栈的办法。确实要对着 3080 调试只读断言：`DSH_OI_ALLOW_3080=1`。

本脚本用 `fetch` 与顶层 `await`，而这台机器默认 PATH 上的 `node` 是 nvm 的 v16；版本不够时它在第一行就 `die`。**这不是洁癖**：v16 上 `fetch` 是 `undefined`，探测端口的那次调用抛 ReferenceError 被吞成「端口被占」，脚本于是报一句和事实相反的话就退出。

harness 入口按「离用户实际跑的那份最近」挑：desktop dist 打包的 CLI 第一，真 home 与外层工作区的 npm 依赖兜底（`harnessBin()`）。`DSH_TEST_BIN=<绝对 bin.js 路径>` 强制指定入口，用于对着别的 harness 构建回跑整套件。

`rsync` 会把真 home 里的日常改动一起搬进副本——`verify:settings` 要求「没有托管区段、`bash-sandbox.timeoutMs` 出自 bundle 层」的干净基线。`syncHome()` 因此在 rsync 之后**只归置副本**：剥掉标记区段，并删掉区段外的手写 `bash-sandbox` 项（用户日常用面板或手写过配置的话，这两样会随真 home 进来）。真 `~/.dsh` 一个字节不动；副本上那句「用过设置面板后要手动删区段」的老规矩由此作废。

**副本上的主题是谁给的，决定一切写死「浅色 / 深色」读数的判据量到什么。** `rsync` 把真 home 的插件名册一起搬进来，`dsh-any-background` 在列（0.3.6），加载与否由 harness 的兼容性预检决定。放行时页面主题是它的 `custom-color`：侧边栏底是 `hsl(40,34%,31%)` 的半透明层，强调色另有一支蓝，`--dsw-alias-*` 上有 81 条 `!important` 覆盖，`data-ds-dark-theme` 每帧被写回深色。否决时回落到标准深浅两档，那 81 条覆盖不在，属性也不会有人抢。两种现场里同一份断言量到的对比度不是同一个数，属性杠杆的可用方式也不同——写死档位的判据换 harness 版本时先确认这份 home 上主题是谁给的（否决那一半见[交接 015](handoff/015-harness-0.1.7-rc.2-adaptation.md)）。

## 单元测试

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm test
```

**参数必须写成 glob，不能给目录**：`npm test` 里那条命令是 `node --test tests/*.test.mjs`，写成 `node --test tests/` 在这个版本上报 `pass 0 / fail 1`，那是参数处理，不是测试失败。

[catalog.test.mjs](../tests/catalog.test.mjs) 兜的是精选清单**抄下来之后的自洽**：每条跨字段规则引用的键必须在同一张卡里、把全部字段的清单默认值合成一份 config 不许触发任何规则、每个数值字段的默认值必须过自己的 `min`/`max`、`atMost` 与 `lessThan` 的等号语义不许互换、只改一个键时另一个键要按清单默认值参与规则。它证明不了「抄得对」（上游 schema 不在这台机器的依赖里，见[功能 8 已知限制](./feature-8-harness-config.md#已知限制)），但挡得住抄错方向、边界写反、默认值自己打自己这三类。

其中 [patch-file.test.mjs](../tests/patch-file.test.mjs) 的六条断言全部对**字节**，输入是 [fixtures/web-cordis.patch.yml](../tests/fixtures/web-cordis.patch.yml)——真实 web profile 用户 patch 层的逐字副本（含中文行内注释、`file-reference-local`、`agent-teams`、手写的 `session-query-sqlite`）。覆盖：加区段后区段外逐字节不变、改一个字段只有区段内那一个数变、清掉最后一个字段后文件逐字节回到原文、区段清空后补裸 `[]`、落盘换掉整个 inode、有开标记没闭标记时拒绝改写。**判据不能是「解析出来一样」**：那样写的话，把别人行尾的注释吞掉的实现也照样通过。

[find-matches.test.mjs](../tests/find-matches.test.mjs) 兜的是功能 11 的偏移与游标语义：不重叠计数、`ordinal` 按行归组、到上限截断并报 `truncated`、`Enter` 到端点环绕、重算后按 `(key, ordinal)` 重锚（该条没了取文档序其后第一条，后面全没有再往前）。其中**小写会改变长度的那条**（U+0130「İ」降成两个 code unit）是这条测试存在的头号理由：偏移一旦来自 lowercase 串就不再是原文下标，拿去 `Range.setStart` 直接抛 `IndexSizeError`，而这条在真实会话页上造不出来，只有脱离 DOM 才测得到。

## 端到端

端到端验证走 CDP 注入——对着**运行中的真实页面**驱动页面自己那份插件实例，菜单断言读的是真实 DOM 上的上游组件产物。走裸 CDP（无 puppeteer 依赖），连接器与断言框架来自 [scripts/lib/cdp.mjs](../scripts/lib/cdp.mjs)，与另外六个验证脚本共用——判据语义（skip 也算失败、非零退出）只有一份实现。**默认打测试栈（3181 / CDP 9334）**，见 `lib/cdp.mjs` 的 `resolveTarget`，不打日常在用的那个 harness。

**早先的版本是注入 bundle 的**（截下 `window.__ModuleLoader__` 的 registration、手动 apply 一个 ctx、服务换成记账 Proxy），插件换成上游组件后这条路整体走不通：产物顶层 require 的四个模块（`react` / `react/jsx-runtime` / `react-dom/client` / `@deepseek-ai/dsh-client-ui-primitives`）全是平台 seed，桩被调到即抛；更要紧的是会话那一支菜单的条目要从真 `slots` 服务里读出来才渲染得出来，而注入实例拿到的是脚本手搓的 ctx，两边都读不到那一格条目表。

**所以现在驱动真实实例 + 自建可丢弃的靶子**。插件装在 profile 里，页面每次加载都自带一份实例（见[加载方式](../README.md#加载方式)），脚本要的就是那一份。会话那一支菜单的条目因此是**上游真组件**，点下去也是**真服务**（`workspaces.delete`、`sessions.fork`、`archiveSession`……），所以：

- **文案不绑死在中文上**：菜单文本比的是句柄上 `locale.t` / `tOwn` 当场给出的那串字符串，切换语言后同一套断言仍成立（换语言跑一遍见下文）。
- **置顶与归档两个集合直接从服务读**：`svc.workspaces.list.getSnapshot()` 的 `pinnedSessionIds` / `archivedSessionIds`，不用再从行上的按钮反推状态。
- **破坏性项只对靶子点**：脚本在开始时建一个可丢弃的工作区（见[scripts/lib/fixtures.mjs](../scripts/lib/fixtures.mjs)），删除工作区与批量删除只对它点；那条之后重建一个，收尾 `cleanupFixtures` 删工作区、`rmSync` 掉目录。
- **靶子只有工作区，没有会话**：`sessions.create` 建出来的会话是 blank 的，而 `ui-workspace/src/client/tree.ts:238-256` 的 `sessionVisible()` 首行就是 `if (session.blank && session.id !== current) return false`——blank 只由真发一条消息翻掉（`session-controller/src/client/sessions/manager.ts:278-292`），公开 API 里没有开关。新建会话永远没有侧栏行，当不了靶子。会话那一支改用两条路：**可逆的真操作**（置顶后取消置顶、重命名后改回原名，测试栈 home 是真 home 的 `rsync` 副本，每次 `stack:up` 重同步）+ **打桩**（给句柄 `services.uiWorkspace` 上那个实例挂 own property 拦下 `forkSession` / `archiveSession` / `unarchiveSession`；上游 inject 的动作回调是调用时属性查找，所以桩拦得住且零副作用，打桩期间不 call through）。

点击任何菜单项之前有三道闸，任何一道不满足都原路返回、**一个 click 都不发**：

1. **数量**：点击前数本插件菜单卡片的个数，不等于 1 就原路返回。页面上残留 N 份实例时右键会开出 N+1 张卡片，这道闸兜住没停干净的情况。
2. **归属**：读卡片类名里那个 `dsh-oi-menu--<id>` 片段，要求 `<id>` 逐字等于句柄上的 `instanceId`。前两道都靠推理（「只有一个所以是我的」），这道直接问菜单是谁开的。卡片在 `document.body` 下、不在本插件的 DOM 子树里，所以归属只能认这个类名（`listClassName` 是唯一能作用于 portaled list 的样式钩子，见[基础层](./shared-api.md#srcsharedmenujsx)）。

被点击的那一侧根本不该是真数据，靶子就是那道隔离——三道闸只保证「点的是本实例的卡片」，它不保证「这张卡片背后是假数据」。

**fork 只验创建，不验打开**。上游那条条目 fork 之后**不**自动打开子会话，本插件跟随上游（原先那段侧栏轮询点行的逻辑已删，见[功能 1、2 · 菜单项与服务映射](./feature-1-2-sidebar-menu.md#菜单项与服务映射)）。所以断言是「打桩记下了源会话 id、且 `sessions.list` 的条数没变」——真 fork 会给测试栈副本留下一条永远删不掉的会话（`ISessions` 没有 delete），收益不抵脏数据。

**归档那一项验的是「菜单末项按态翻」，不是「点下去真归档」。** 上游的「归档会话」与「取消归档」是同一个 slot（order 400）按归档态换文案、图标与调用的方法，而归档态只能靠真操作改变。所以判据拆成两半：未归档行上菜单末项是「归档会话」、全文没有「取消归档」，点它 → 打桩记下 id、且真服务一个没调（**这一条不许 call through**）；归档行那一半**不测**（要看到归档行得开上游「视图选项 → 显示已归档」，拿到的又是打桩状态下的假象）。

**重命名走真往返**：点菜单里那条「重命名」后断言弹的是上游 `SessionRenameDialog`（`div[role="dialog"]` + `input[data-modal-autofocus]` + 初值逐字等于该会话 `displayTitle` + footer 恰好「取消 / 重命名」两枚按钮），然后写一个带 `dsh-oi-verify-` 前缀的新标题提交、确认 `displayTitle` 变了，再开一次对话框改回原名提交、确认复原。往返都落在副本上，净效果为零。

**「对齐上游」那几条断言要点开的是页面自己的菜单，而它挂在真服务上。**「...」是行右侧操作区里的第一个按钮，工作区行的第二个是「新建会话」——闭着眼点操作区就会真的开一个会话。所以打开的动作只认 `button[0]`，并要求它恰好多弹出一个 portal 菜单（数量不对就当没测到）；对着它只读 `viewBox` / `width` / `height` / 全部 `path[d]` 与 `getComputedStyle`，一个菜单项都不点，关闭走 `Escape`。

**单选会话那份菜单与上游逐项全等**（`session menu mirrors the row's own menu`）：本插件渲染的就是那四个 slot 条目本身，所以判据是两份菜单的 `label` / `viewBox` / `width` / `height` / 全部 `path[d]` / 顺序**逐项相等**，并要求上游「...」那一份恰好 4 项（项数变了就 FAIL，而不是自动放行——上游真加一项时这一条会红，届时该改的是这条判据里的 4，不是插件）。配套的 `session batch right-click hands the menu back` 测的是另一半契约：多选会话右键后**没有**本插件卡片，且 `defaultPrevented` 为 `false`（只断言"没弹"会放过一个更糟的实现：拦下默认行为再什么都不做）。它也不是"要弹出上游的菜单"——侧边栏行上没有任何 `contextmenu` 监听，不拦的结果就是浏览器默认。

**工作区单选菜单反过来了：它是上游的超集**，因为「新会话」在上游根本不在「...」菜单里（它是行 hover 操作区的第二枚图标按钮，上文「点开的是页面自己的菜单」那段说的就是别闭着眼点第二枚）。上游没有覆盖工作区行的 slot，所以这三项是本插件拼的（外壳与图标仍是上游组件）。判据拆成两段：`workspace menu mirrors the row's own menu` 要求本插件 3 项、**首项逐字等于词典里的 `actions.newSession`**、末两项与上游那两项逐项全等；`workspace new session opens a session in that workspace` 点首项后看**状态 diff**——靶子工作区被展开、菜单关掉、侧栏多出一条会话。**位置钉死为首项**是决定不是细节：它不是破坏性操作，混进标红那一堆里会误导，要换位置得连同理由一起改代码。早先还有第三条 `workspace menu drops new session without the service`（服务未注册时整项不出现），现在**没有**：`uiWorkspace` 是真服务，脚本拿不掉它，那一项也就没法在真实例上缺席——入口缺席那一半改由 `resolveUiWorkspace()` 每次现取保证（服务可能被替换，见[功能 1、2](./feature-1-2-sidebar-menu.md)）。

**浮层描边色分列两条判据**（`menu metrics match the primitives default tier` 里 `styleDiff` 之前那两步）：一条比菜单根元素上的 `data-menu-material`，一条比那枚 token `--dsw-elevation-stroke-color` **解析后的值**。卡片现在就是上游 `MenuSurface` 渲染的（`data-menu-material` 与 `--dsh-menu-anchor` 都由它自己带），本插件的 `MENU_CSS` 只剩一条 `z-index`——所以那两条判据现在守的是「本插件没把档位改坏」，回归证法是把 `listClassName` 之外再往那张卡片上压一条改档位的规则，看它是否变红。**不能靠 `list.boxShadow` 反推**——它那串里混着两档同值的层，深浅两档只有深色露馅，混进去那条换个主题跑就会静悄悄地放过。

**常驻容器不进文档流，由一条几何断言守着**（`opening the menu does not shift the page geometry`）：上游把 `anchor` **原地**渲染进本插件那棵常驻 React 树，外层包装自带 18px 行盒。容器留在 `body` 流里时，菜单一开就把内容高度顶过视口、冒出一条竖直滚动条，`documentElement.clientWidth` 少掉一个滚动条宽（实测 1600→1595），会话区与右侧导航列跟着横向收窄（实测 1318→1313）——用户看到的是一次右键整页跳。判据取「开前 / 开着 / 关后」三份快照并要求一个数都不变，另读容器自己的 `position` 与盒子尺寸（`fixed` + 0×0）。机制与契约在[基础层](./shared-api.md#srcsharedmenujsx)。

**只测启动那一档主题仍然不够**，因为缺两半各在一档里露馅，而测试栈只起深色。故另立 `menu stroke colour matches upstream in both themes`：`withScheme()` 摘掉或挂上 body 的 `data-ds-dark-theme`，在守卫窗口内各跑一遍两份菜单，逐档比 `data-menu-material` 与那枚解析后的描边色，并额外要求**两档读出的值不同**——相同即说明其中一档没生效。守卫与[功能 5 的 C 组](#功能-5-的验证)同一套机制：测试栈副本里的 `dsh-any-background` 每帧把这个属性写回深色（实测摘掉之后 700ms 内被写回 47 次），而 `pair()` 要跨数百毫秒才读到卡片，一次性翻转撑不住。两档差异的证据 `landed` 读的是带 `[data-menu-material]` 的探针元素上的 `--dsw-elevation-stroke-color`（实测深色 `rgba(255,255,255,0.16)` / 浅色 `rgba(255,255,255,0.2)`），**不能**读 `--dsw-alias-border-l3`：那枚被 `dsh-any-background` 的 81 条 `!important` 钉成深色档的值，深浅两档恒读同一个数，拿它当「杠杆在动」的证据必然假失败。`theme.overrideTokens` 也压不过那些 `!important`（实测覆盖深浅两档后读数一个都不变），所以它不是杠杆。

**归档行单独比一条**这条已经删掉了。它原来的做法是「先把靶子会话真归档，再打开上游『视图选项 → 显示已归档』，在归档行上比菜单」——靶子会话不再存在，而真归档留下一条删不掉的脏会话（`ISessions` 没有 delete），所以换成上面「打桩 + 逐项全等」那条。留在打开态的视图开关还有副作用：会让后续取行取到归档行，也会让 `verify:chat-history` 的会话挑选取到打不开的归档行（表现为 ABORT「找不到恰好一条提问的会话」）。

这也是为什么 `apply()` 挂出去的 [`window.__dshOperationImprove__`](./shared-api.md#调试句柄) 必须列全每一项带监听或带注册的功能并带一条整体 `dispose()`，外加一个 `services`：脚本靠 `dispose()` 收尾（最后一条断言要验「卸载后连 React 容器一起摘掉」），靠 `services` 建靶子。句柄上少暴露一项，脚本就有一条断言退化成「没测到」。

`scripts/verify-live.mjs` **自己不起浏览器**，只连一个已经加载了 DSH 页面的 CDP 实例。不带参数时打的是测试栈：

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:up
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify
```

要打别的目标就绕开 npm script 直接给参数：`node scripts/verify-live.mjs [port] [urlPrefix]`（`npm run verify -- 9334 …` 也行，但 `--` 容易漏）。

脚本每次先 `Page.reload` 回到一份干净页面，再展开所有折叠的工作区好让会话行够数，然后取句柄、建靶子。`DSH_OI_NO_RELOAD=1` 可跳过刷新——但页面状态是上一轮留下的（靶子行、视图开关、菜单都可能还在），结果不如刷新过的可信。

## 怎么看出「测了」而不是「跳过了」

**判据是退出码，不是屏幕上有没有红字。** 脚本把「没测到」与「测失败」同等对待：

- 开头打印一行 `[instance] <instanceId>`，接着是 `[fixtures] {"workspaceId":…,"title":…,"cwd":…}`。句柄或靶子建不起来直接 `abort` 并点名处理办法（重新构建 + reload + 让测试栈重同步 profile），不会带着「没靶子」继续跑。
- 侧边栏没渲染出可操作的行（窄窗口时一条 `[role="treeitem"]` 都没有）时前置检查中止，点名窗口宽度（实测需 `innerWidth ≥ 900`）。
- 每条断言前缀是 `[PASS]` / `[FAIL]` / `[SKIP]`，结尾固定打印 `passed=N failed=N skipped=N total=N`。
- **`failed + skipped > 0` 一律非零退出**，全绿时最后一行是 `[OK] 全部断言实际执行且通过。`

所以确认「真的测了」只需两步：`echo $?` 为 0，且末行 summary 是 `passed=N failed=0 skipped=0 total=N`（N 是断言条数，最近一轮八套的实测读数记在[交接 021 的完整记录](handoff/021-context-menu-upstream-components.md)）。只看见一堆 `[PASS]` 而没核对计数与退出码是不够的——早先的版本没有断言、只打印观测值，前置条件不满足时会把每条记成 skip 然后以退出码 0 收场，看起来通过、实际什么都没验证。

判据与退出码由 [scripts/lib/cdp.mjs](../scripts/lib/cdp.mjs) 提供，七个验证脚本共用：`check(label, value, expect)` 的 `expect` 返回 `true` 记 PASS、返回字符串记 FAIL 并把它当失败原因；观测值带 `skipped` 字段记 SKIP。**SKIP 与 FAIL 一样导致非零退出**——一个全是 skip 却退 0 的脚本比没有脚本更糟。环境不满足（窗口过窄、会话页没打开、起点不足）时直接 `abort()` 并点名「实测未发生」，同样非零退出。

`evaluate()` 每次求值新开一条临时 CDP 连接、用完即关，长驻连接只留给要收事件的 `Page.reload`。**不能全程共用一条**：断言里会点击会话行，切会话销毁执行上下文后，那条连接上的每次 `Runtime.evaluate` 都被协议层永久拒为 `-32000 Inspected target navigated or closed`，整轮验证崩在半路，证据链就此断掉。

**多人共用一个常驻 Chrome 时，`Page.reload` 会互相踩**：别人的脚本重载页面，这边正在跑的 `Runtime.evaluate` 就收到协议层的 `Inspected target navigated or closed`，与被测代码无关。脚本把协议层 `res.error` 和页面异常分开报出来，撞上就重跑；另一侧的表现是自己 apply 的实例被重载冲掉，`dispose` 那条断言会拿到别人残留的 DOM。串行跑，或用 `DSH_OI_NO_RELOAD=1` 跳过自己的重载。

## 文案跟不跟语言切换，只能换一种语言再跑一遍

菜单文案的断言比对的是**上游词典当场给出的那串文本**，不是写死的「分叉会话」——所以它在任何语言下都成立，但也因此单跑一次证明不了「切了语言文案会跟着变」。换语言的办法是改测试栈那份 home 的 `locale.preference`（`zh` / `en`），**harness 不用重启，刷新页面即生效**（`verify` 自己会 `Page.reload`）：

```
sed -i 's/^  preference: zh$/  preference: en/' tmp/dsh-oi-test-home/settings.yaml
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify     # 改回 zh 再跑一遍
```

判据是每条断言观测值里的 `lang` 字段（`zh-CN` / `en`）与 `items`。**改的必须是副本那份**：真 home 那份是用户自己的界面语言。而 `npm run stack:up` 会 `rsync --delete` 把副本盖回真 home 的内容，改完不要再 `up`。

## 功能 4 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:timestamps
```

`verify-timestamps-live.mjs` 同样先点开一个够长的会话（选取门槛 28 条节点行、≥1 个 Think 行、≥1 枚上游时间标签，不满足一律 `abort`——「标签等于上游 Started」与「单调不减」两条谓词要 **≥20 条带标签的行**，而上游自带时间的四类与空行都不贴标签，按 20 选会话会经常刚好够不上，这是实测出来的边界）。十条断言：装饰完整性、文本格式、**标签等于上游 Started**、跨 step 时间单调不减、每枚标签落在本行第一行上、不压正文、Think 行水平带上有本 step 的时间、上游四类改常驻、空闲无自激重建、dispose 复原。八处只有这个脚本才守得住的坑：

- **Chrome 必须带 hover 那两个 `--blink-settings`**（[测试栈](#测试栈)起的那个自带）。headless 默认 `(hover: none)`，上游那条藏时间的规则整条不生效，装载前量到的恒是 `opacity: 1`，「改成常驻」的断言会在功能完全没生效的情况下报绿。`Emulation.setEmulatedMedia({features:[{name:'hover'}]})` **办不到**——实测下发返回 `{}` 无错，而 `matchMedia('(hover: hover)').matches` 纹丝不动地保持 `false`；Chrome 只认它支持的那几个 `prefers-*` / `color-*` 特性，多余的静默忽略。脚本因此改成读 `matchMedia` 的前置检查，不满足就 abort 并让人重起测试栈。
- **常驻断言按 world 走**，由 `data-time-hover-root` 锚点在不在场判定，不猜版本号。当前 harness 恒为 `upstream-always-on`：上游自带时间常驻，装载前就是 1，前后差测不出东西，断言是「恒为 1 + 插件那条 `[data-chat-node-key]` 双保险规则确实在注入的样式表里」，标签上写明 world。dispose 后的复原比对同样按 world 走（回到各自世界的基线，而不是恒回 0）。
- **行集合与反查锚点是 `data-chat-node-key`，不是 `data-chat-flow-key`**。flow-key 在分段行上是 `JSON.stringify([nodeKey, part])`，分组壳（`ChatGroupSeat`）也带 flow-key 却聚合多个节点——拿它当锚点，「装饰完整性」会把分组壳算成缺标签的行、「不压正文」会拿零高度的隐藏行做几何。node-key 恒等于节点 `key`，反查自校验以它为准。
- **重算时钟的 oracle 必须日期感知**。跨午夜再跑时会话是「昨天」的，标签带着 `M/D ` 前缀，只按 `HH:mm:ss` 重算的 oracle 永远差那截前缀——这个缺口在 0.1.6 适配轮实测撞上，oracle 因此复刻 `formatClockSeconds` 的分支规则（独立实现，不复用被测代码）。
- **插件若已装进 profile，页面自带一份实例**，不先停掉就注入会得到两份互不知情的实例、每行两枚标签（实测 160 = 2×80）。清场因此调 `window.__dshOperationImprove__.timestamps.dispose()` 而不只是删 DOM：光删 DOM，原生那份的 `MutationObserver` 下一帧就把标签贴回来。
- **dispose 之后要等一拍再量 `opacity`**。上游那枚时间标签带 opacity 过渡，摘掉样式表后同步读回来的恒是过渡前的 `1`。
- **单调性只能跨 step 判定，不能整列判**。同一个 step 内部本来就可以逆序：`model-retry` 携带的是重试事件时刻，而它后面那条 `assistant-step` 显示的是**该 step 的起点**，起点必然更早。实测 step 138 起于 11:42:39、重试发生在 11:42:57，两行各自都对。同 step 的逆序被显式计数报出来（`sameStepCount`），免得这条放宽把真正的反查串行一起放过去。

**装载前后的几何本来就不同**（右侧留白），所以这个脚本没有「零布局位移」这条断言；几何基线只用于 dispose 之后的复原比对，同时守着「留白被收回」。基线用「相对滚动内容」的坐标而不是视口坐标——视口坐标随 `scrollTop` 整体平移，页面自己滚一下就会把全部行报成位移。

脚本结尾打一行 `[coverage]` 列出本轮实际见到与未见到的 kind。未见到的**不记成 skip**（它们不在本轮的断言计划里，记 skip 会让脚本永远非零退出），而是记在[功能 4 的已知限制](./feature-4-timestamps.md#已知限制)里。

脚本给本次注入的实例打一个 `nonce`，并在关键断言前校验它还在。页面被别人中途重载时**中止而不是记为 FAIL**：把环境问题写成功能缺陷比不测更糟。

## 功能 5 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:dot
```

`verify-active-dot-live.mjs` 和 `verify:selection`、`verify:settings` 一样**不注入 bundle、也不 apply 自造的 ctx**（七个脚本里只有这五个这样——再加 `verify:chat-history` 与本节的功能 10），验的是页面自带那份实例的实际效果。这一条被验的是一张纯样式表，而页面自带的那份实例已经把它插进 `<head>` 了。断言读的就是那张表的效果，走的是「`npm run build` 的产物 → profile 装载 → 页面自己的实例插入」这条真实路径。基线靠**摘掉那张表**取得（`disabled = true`，测完还原），同一个 DOM 上一摘一装，前后两组读数才可比。探针是脚本现搭的同构 spinner（`svg[data-state='ongoing']` 里 `g` 包两条 `circle`），class 从页面真实样式表里反查——**spinner 根类必须与 track 同一个 CSS module**（页面里还有别的组件也叫 `.spinner`，拿错类的表现是探针渲染成别的几何，采样点落空）。不去等一个真的活跃会话：那要在测试栈里真跑一轮模型调用，代价与风险都远大于它能多验到的东西（同一个组件、同一条 CSS 规则）。

**对比度读的是截图像素，但底色是脚本垫出来的名义值。** 前景那半必须由浏览器渲染——`fill × opacity` 的合成交给它，脚本自己算一遍就等于验证脚本重写了一次被测逻辑。底色那半则不能取自页面：装了壁纸主题的页面整个 UI 是半透明的，标记压着的是一张逐像素变化的照片（实测同一列上下极差 187），`--dsw-alias-bg-base` 本身就解析成 `rgba(108, 96, 97, .28)` 且不随主题变，从格子到 `html` 一层不透明背景都没有。那种页面上不存在「一个底色」，任何单点采样都是偶然值。所以探针自带一块名义底色（深色取页面的 `--dsw-static-neutral-bluish-950` = `rgb(21, 21, 23)`，浅色取白——`--dsw-static-white` 在壁纸主题下被改成了透明，不能用），`Page.captureScreenshot` 把格子连同这块底色一起截下来，两个颜色取自同一张图。量的是「这个配色在标准主题底色上有多少对比度」，与用户装了什么主题无关。

`conn.send()` 回的是整条 CDP 消息，截图数据在 `res.result.data` 上；读成 `res.data` 得到 `undefined`，表现是页面侧 `img.decode()` 抛 `EncodingError`，看不出是取错了字段。出图像素与 CSS 坐标的换算系数按**整个 clip 的宽**（探针 2× 边长）算，按单边算会在 dpr≠1 时把所有采样点推出画布，读回 `rgb(0,0,0)` 的透明像素——「底色均匀」「环点与底色不同色」会一本满足地为假成立。

- **亮弧不能用行内 `stroke-dasharray: none` 拉成整环**——dash 动画逐帧驱动这个属性，**动画值优先于行内样式**，拉不动。可做的是在 `isolate()` 里把 `g` 的旋转与 arc 的 dash 两条动画 `pause()` 并钉在 `currentTime = 0`，此时弧恒在「3 点钟起顺时针 72°」的扇区里，亮环采样点按该扇区中点算；底环是完整圆环，冻结与否都采得到。截图完 `restoreIsolation()` 里 `play()` 还原。
- **两条环靠 `visibility` 互相摘除来隔离采样对象**（几何隔离，不碰 `color × opacity` 的合成，浏览器仍然自己算）。

21 条断言全过时的读数见[功能 5 · 实测读数](./feature-5-active-dot.md#实测读数)。

**C 组（切主题后截图）的翻主题要由守卫观察者撑住**：主题控制器在两帧内把 `data-ds-dark-theme` 写回 body，一次性翻转撑不过 `Page.captureScreenshot` 的往返。脚本的 `flip()` 在翻转后挂一个 MutationObserver，应用每写回一次就立刻翻回来（连同探针垫底色一起重刷），`unflip()` 摘除并还原；读数与两张截图都发生在守卫窗口内。「同一次 evaluate 里摘读还原」（[功能 10](#功能-10-的验证)第一条坑）只够读 computed style，撑不住截图。

## 功能 6 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:selection
```

同样**不注入 bundle、不 apply 自造 ctx**，验的是页面自带的那份实例：功能 6 一个 harness 服务都不调，没有需要打桩的破坏性动作，走页面自己的实例反而把「构建产物 → profile 装载 → 真实词典」整条路径一起验了。20 条断言覆盖三条命中路径（会话正文的选区、0.1.6 Lexical composer 的 contenteditable 判据——有选区「复制+粘贴」、空态「只给粘贴」、Esc 收尾，合成 `<textarea>` 的 field 路径——选区「复制+粘贴」、空态「只给粘贴」）、两项动作的实际效果、不该命中的两种情形（非可输入且无选区、侧边栏行）、样式一致、图标一致、以及 `dispose` 之后不再接管。

- **脚本自己挑会话、挑选区，两道命中测试**：选区探针只认页面上已经渲染出来的正文，而跨脚本串台会把现场挪走——接在 `npm run verify` 之后跑时，页面停在那条「新会话」断言开出来的空白会话上（实测会话区只剩 78 字、composer 都不在），`Page.reload` 恢复的就是同一个会话。所以开头按 `data-chat-node-key` 的行数（≥8）与 composer 在场逐条试点会话（跳过运行中的，两次读数一致才算落定），挑不到正文就换下一条，全挑不到才 `abort` 点名实测未发生。挑正文有两道硬判据：**必须落在消息行内**——只按「够长 + 可见 + 不在侧栏行与输入框里」筛，会话一空就会挑到 composer 上那枚模型名按钮的标签（实测 `SPAN._7KE1Ra_triggerLabel`），插件对它不弹菜单是对的；**算出来的点必须真命中这段文本自己的盒子**——会话列上方那层吸顶 `_header_…` 覆盖带会把点接走，打在选区之外 Chrome 当场折叠选区，插件于是正确地不弹、不 `preventDefault`。对照读数：新栈上 `elementFromPoint` 是 `STRONG.`（选区活着、`cards:1`），verify 之后是 `DIV._header_1pq26_10`（`hitInsideRangeAncestor:false`、按下即折叠、`cards:0`）。观测值里带上 `host` 与 `hitAt`，下次再红就自己说清点打在什么上面。
- **手势必须走 CDP 的 `Input.dispatchMouseEvent`，不能用合成事件**。合成的 `.click()` 不带 user activation，而 `navigator.clipboard.readText()` 要的正是它——用合成事件时粘贴那条断言会在功能完好的情况下报失败。
- **`Browser.grantPermissions` 只在 browser 级别那条连接上存在**，页面连接答 `'Browser.grantPermissions' wasn't found`。更要紧的是**那条连接必须一直开着**：授权跟着授权的那个 CDP client 走，ws 一关 Chrome 就把覆盖撤回，之后 `readText()` 报 `NotAllowedError: Read permission denied`——症状看着像没授权成功，其实是授过又收回了（`grantPermissions` 本身答的是 `{}`）。
- **粘贴的哨兵由脚本自己写进剪贴板**，所以「粘完应该是什么」是算得出来的常量，而不是拿页面上另一处读数去对页面上这一处。
- **contextmenu 探针挂在插件之后**（同为捕获阶段，后注册后触发），才读得到插件处理完之后的 `defaultPrevented`；探针自己随后也 `preventDefault()`，免得 headed Chrome 弹出原生菜单挡住后面的手势。
- **图标断言按 `aria-label` 找页面上那枚真实的复制按钮**，不按 `d` 反查——按 `d` 找就成了拿常量去证明常量。`aria-label` 取自同一份 common 词典，所以它在两种语言下都定位得到。
- **右键必须落在选区内**，Chrome 在选区之外右键会先折叠选区。composer（contenteditable）那条路径直接对 DOM Range 取 `getBoundingClientRect()`；合成 `<textarea>` 没有 Range 可用，用控件自己的计算字体在 canvas 上 `measureText(value.slice(0, mid))` 求中点横坐标，并且框必须是**单行高度**——80px 高的框里文字只占最上面一行，点垂直中心等于点在选区外（实测把选区折叠成了只剩「粘贴」）。草稿写入一律走真实手势（`Delete` 键 + `Input.insertText`）；field 段开始前要 Escape + blur + `removeAllRanges()` 收掉 composer 粘贴留下的选区。
- **选区探针只挑真正可见的正文**。折叠组里的行有布局盒但没有渲染可见性：`getBoundingClientRect()` 非零、`range.getClientRects()` 也量得到，可 `window.getSelection().addRange()` 之后 `toString()` 恒为空——选区 API 取不到 invisible 文字，真实用户也选不到。判据用 `host.checkVisibility({visibility:true, opacity:false})`，光看矩形会整轮踩空（右键永远 count=0，且现象酷似功能坏了）。
- **样式一致比的是 `getComputedStyle` 的完整枚举**（root 与 item 各 862 键），排除的是一张显式的几何键名单而不是正则：`font-size` 里也有 `size`，按模式排除会把字号一起放过。
- 脚本最后一步 `Page.reload`：第 11 条断言把页面自带的实例 `dispose()` 掉了，不重载就等于给下一个人留一个功能缺失的页面。重载后再断言新实例确实回来了。

**语言跟随只能换一种语言再跑一遍**，办法与[上面那条](#文案跟不跟语言切换只能换一种语言再跑一遍)一样。判据是观测值里的 `lang` 与 `items`：zh 下是 `["复制","粘贴"]`、空输入框 `["粘贴"]`，en 下是 `["Copy","Paste"]`、`["Paste"]`。

## 功能 7 的验证

没有 `npm run verify:*` 脚本，判据在 `.scratch/think-scroll-check.mjs`（七条断言，同样连测试栈的 CDP；`.scratch/` 在 `.gitignore` 里，这个文件不在版本库，新克隆的仓库跑不了，得照判据重写一份）：

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node .scratch/think-scroll-check.mjs
```

它也不注入 bundle，验的是页面自带那份实例插进去的样式表。判据全部取自真实页面上上游自己渲染的 think 块——不造 fixture、不注入文本，因为测试栈那个会话里正好既有超过 60vh 的思考、也有远不到的，两类同页；缺任一类就 `abort`（「限高分支实测未发生」）。

**对照组只中和本规则那两条声明，不能整张样式表 `disabled`**。同一张表里还有功能 4 那条 `[data-chat-flow-key]` 的 80px 右侧留白，摘掉它正文列变宽、文字重排少一行，于是放得下的思考也「长高」一个 `line-height`——看着像本规则的副作用，实际是留白的账。

## 功能 8 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:settings
```

三十条断言，全部打[测试栈](#测试栈)（`DSH_HOME=<repo>/tmp/dsh-oi-test-home`、harness 3181、CDP 9334）。它**不注入 bundle**，驱动的是页面自带那份实例渲染出来的真面板：打开设置 → 展开这一行 → 用真实输入事件改值 → 让输入框失焦，然后同时读三处——patch 文件的字节、host 路由回的 `live`、面板自己的 DOM。覆盖：手写值即当前值且标 `manual`、DOM 里根本没有保存按钮、只失焦就写出区段且区段外逐字节不变、不重启 harness 就热重载生效、写 `snippetChars` 时 restate 住 bundle 层的 `path`/`openAt`、手写行连行尾注释原样保留、跨字段规则被前端拦下且文件一个字节没动（两条：`defaultLimit > maxLimit`，以及 `imageOffloadByteQuantum` 压过 `maxRequestFilesBytes` 那条 `atMost`）、余量**等于**保留时长也被拦（`lessThan` 的等号不在合法那一侧）、点「清除」撤掉被拒的草稿、卸载本插件后区段与效力都还在、点「清除」不做别的操作就把键摘掉、托管键清空后区段整体消失且文件逐字节回到基线、没人设过的字段只淡化控件且默认值只在 `placeholder` 里（设过之后恢复、清空之后重新淡化）、bundle 字段的徽标显示来源包名而手写与系统默认的文案不变、每张卡都渲染生效方式标记。

- **点「清除」之后，判据是「逼一次重载之后键摘没摘掉」，不是「loader 立刻就空」**。harness 偶发会漏接清除那一次 profile patch 重载：面板把文件写回基线是对的（`bytesIdentical:true`），loader 里那枚键却还留着，要到下一次任何改动触发真重载时才顺带消失。宿主侧对 reload 失败只有一行 `ctx.logger.warn`，不落测试栈日志，机制无从证明——所以脚本不推测上游为什么漏，改成用 `clearAndConfirm()` 逼一次真重载（借陪跑键 `schedule.deliveryHistoryRecords` 触发，不碰被验的那张卡）再读 `live`，并把用了几次 `pokes` 记进观测值。这几枚「清除」断言因此各自能扛住宿主那一次偶发漏接，而不是靠运气红绿。

- **本脚本会真的往 patch 文件里写字节**，所以它比别的 verify 脚本更依赖测试栈那道隔离。开头先做两道前置检查：基线里已经有托管区段就 `abort`（上一轮中途失败留下的脏基线，或[从真 home 同步进来的那一段](#测试栈)），基线里没有手写的 `session-query-sqlite` 块也 `abort`——「手写行共存」那组断言要靠它，副本里被删掉时应该说出来而不是静默少测一项；缺了就由脚本从仓库夹具补种一份。
- **夹具里的手写块必须带全 `path`/`openAt`**。手写行与托管行一样按 id 整体替换 config：缺了 `path: ":memory:"`，检索就从内存库翻到真实文件——面板没坏，是块本身写得不完整，这正是「重述」要解决的事的另一面。
- **测试值从基线算出来，一个都不写死**。副本来自真 `~/.dsh`，那边的手写值随时会被改，写死就是让脚本慢慢烂掉——而且烂法是「面板明明对着、断言却报红」。手写块的值由 host 路由自己的 `outside` 给出，托管的 `maxLimit` 在 `50` 与手写值之间二选一（不同于手写、且不小于目录默认 20，否则提交 cap 那一刻跨字段规则自己先炸）；「原样保留」比的是从基线里抓出来的那两行原文，不是抄一遍注释。
- **输入必须走 focus + native setter + `input` 事件**。React 的受控 input 认的是 value tracker，直接 `el.value = x` 不触发 `onChange`——状态没变而画面变了，断言会对着一个不存在的草稿报绿；focus 也不能省，面板的写入点在 `onBlur` 上，没聚焦过的元素调 `blur()` 不派发事件，整批断言会一起卡在等一次永远不会发生的写入上。
- **「生效了」的判据是 host 路由回的 `live`，不是界面上的数**。`live` 来自 `ctx.loader.entries()`，即 loader 真正跑着的那份 config；界面上的值是本次 `GET` 的快照，写完立刻回显不能证明热重载成功。`watchUserPatches` 有防抖，所以是轮询而不是睡一个定长。
- **「这一次自动保存落定」的判据是待提交计数归零或报错，不是 `data-state`**。后者在 payload 一到手就是 `ready`，写请求还在飞的时候读字段会读到旧快照。
- **淡化读的是控件的 `opacity`，不是 `color`，且要连整行与标签一起读**。灰显是一条 CSS 规则的效果，断言 `data-default` 挂上了只能证明标记在；按颜色比会在把标签色压成同一个值的主题下永远相等——测试栈里那份主题正是如此，实测两行的标签色同为 `rgb(255, 255, 255)`。同时断言行与标签的 `opacity` 是 `1`：只淡控件是要求的一部分，规则写宽一格（挂到行上）不会有别的断言报错。
- **「卸载不清空」在一份副本上真卸载**：`rsync` 出 `/tmp/dsh-oi-uninstall-home`，从 profile manifest 的 `bundles` 与 `dependencies` 里摘掉本插件，用 harness 自己那套 `loadProfile` + `composeEntries` 算该 home 的生效配置，再起一个真 harness（3182）确认它照样起得来。**不能在测试栈本身上卸载**——那会把 CDP 那一侧的页面一起掀掉，后面的断言就没得跑了。
- **「插件确实没了」要按 entry 的 `name`（包名）判，不是 `id`**。entry 的 id 由 bundle 自己定，按包名找 id 永远找不到，那条断言就会在插件明明还在的时候报绿。
- **跑完必须重启 harness，脚本对默认目标自动做**。本脚本写的正是 `session-query-sqlite`——harness 0.1.6-alpha.2 对它的热重挂有缺陷：连带摘除 `sessionController` 且静默挂起，此后侧栏会话列表恒空、撤销写入也不恢复，只有进程重启可救（根因与最小复现见 [harness-hmr-session-defect.md](harness-hmr-session-defect.md)）。脚本在收尾处对默认目标 spawn `test-stack.mjs restart`（npm 别名 `stack:restart`），非默认目标只出声提示。**中途 `abort` 的路劲不经过收尾**：settings 半途死过一次，之后也要手动 `stack:restart` 再跑别的会话相关脚本。

一轮完整跑的读数见[功能 8 · 实测读数](./feature-8-harness-config.md#实测读数)。

## 功能 9 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:chat-history
```

十六条断言，全部打[测试栈](#测试栈)（`DSH_HOME=/tmp/dsh-oi-test-home`、harness 3181、CDP 9334）。它**不注入 bundle**，验的是页面自带实例：功能 9 不调用任何 harness 服务，没有需要打桩的破坏性动作。

历史断言的 oracle 是脚本自己对导航列与消息流的独立读取（fiber 里的轮次条目 + loaded 锚点行的气泡全文）——被测会话的提问全部先于插件存在，不从插件侧取任何期望值。导航的期望值取自被测会话的真实提问，不写死。oracle 与插件按同一契约收尾：**气泡读不到全文且 `prompt` 预览也为空的轮次不计**（那种轮次没有可插入的内容，插件本来就丢弃；上游导航列自己会显示成「第 N 轮」占位）——过滤规则是 oracle 独立实现的数据层判据，不是抄被测代码。不这样收口，一条空提问的轮次就会把「条数一致」与「逐条文本一致」两条一起打红，而那与功能对错无关（0.1.7 轮实测如此）。

覆盖：句柄与 snapshot、历史条数与导航列条目一致、历史文本与独立读取一致、↑ 从最新回翻、连续 ↑、按满停在最早一条、↓ 返程、↓ 越界清空并退出、有未提交内容且光标在文中不接管、多行且光标在非文档开头不接管、**单条提问的会话**（上游导航列对 <2 轮不渲染，脚本用「user 行气泡恰一条且导航列读空」找真实单轮会话）↑ 从消息流兜底调出提问且再按不越界、切会话后历史换成那个会话的、不写 localStorage、dispose 后不再接管、刷新后长出新实例。

- **选会话不能按名字**：测试栈副本随真实 home 漂移，且部分会话的视图没有输入框（只读/归档）或挂载很慢。脚本逐行点开侧边栏会话，等「历史 ≥2 且 composer 在、且两次读数一致（视图落定）」；**运行中的会话直接跳过**（node 的 `running` 字段，行 fiber 反查）——运行中的会话页输入框不可用。
- **导航列 tick 数不作数**：轮次多时 tick 会被压缩采样，条数比对一律走 fiber 里的 `items`。
- **设值断言读 `innerText`**；脚本侧清空用 `selectAll` + 真实 Delete 键（`execCommand('delete')` 在 Lexical 上不生效），`selectAll` 与 Delete 之间要让一拍——选区同步进 Lexical 是异步的。插件侧的写入坑更多，见[功能 9 文档](./feature-9-chat-history.md)。
- **多行内容用 CDP `Input.insertText` 一次插入 `'line1\nline2'`**（真实输入管线保留换行；`execCommand('insertText')` 会抹平）。
- **会话切换靠点侧边栏行**：应用没有 URL 路由，URL 恒为 `/`。插件侧的「当前会话」也是从侧栏派生（`aria-selected` 行 + fiber 反查 id），脚本判定「切换已落定」同样读 `snapshot().sessionId`——两边读的是同一个 DOM 信号，换会话那条断言因此也顺带复证了派生路径。
- 不覆盖：多设备/多浏览器——历史只读当前页面状态，没有可跨的东西。


## 功能 10 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:row-states
```

31 条断言，全部打[测试栈](#测试栈)。与功能 5 同构：**不注入 bundle**，验的是页面自带样式表（构建 → profile → 页面 端到端）；探针是脚本现搭的会话行，class 从页面真实样式表反查 hash 前缀，并带上游的 `selected` / `dropAfter` 类——与上游规则形成**真实的特异性竞争**，这正是本次改动的全部内容。不等真的运行中会话：同一个 `data-state` 字面量、同一条 `:has()` 规则，跑一轮真模型调用的代价远大于多验到的东西。

**颜色断言读 computed style 而不是截图像素**：这里验的是「哪条规则赢、值是不是设计 token」，特异性胜负在 computed value 上已经见分晓。时间色的期望值取自页面自己的别名 token 解析结果，不硬编码；**多选的期望值则由断言自己合成**——多选底色是半透明色，脚本按 alpha 把它混到侧边栏底色上再比（见下方「合成」一条）。

覆盖：端到端装载、表内顺序契约（ROW_STATES 段先于多选段）、上游竞争规则在场、选中底色/竖条/字重/时间提亮、对照行无装饰、运行中底色/静默底边/彗尾动画与 mask/辉光、选中+运行中 .14 叠加、选中+多选时青色竖条保留、多选描边在场、拖拽目标行彗尾让位、三行错峰相位、主题来回切换、`prefers-reduced-motion` 彗尾熄灭与复燃、清场复位。

多选的可辨性单独验**两个数**（深浅两档各算一遍，见「翻主题」那条）：

| 量 | 判据 | 实测 浅 / 深 |
| --- | --- | --- |
| 描边 vs 侧边栏底色 | ≥ 3:1（WCAG 非文本） | 6.52× / 7.47× |
| 描边 vs 描边内侧填充 | ≥ 3:1 | 4.85× / 5.28× |
| 填充 vs 普通行底色 | ≥ 1.15× | 1.34× / 1.41× |

描边是承重信号、填充只是氛围，所以前两条是硬阈值，第三条只要求「方向对、量级够」——底色填充的天花板就在 1.4× 附近（见 [handoff 019](handoff/019-multiselect-highlight-outline.md)），把它抬到 3:1 不可能。

- **半透明色的「实际渲染值」只能在脚本里合成**：叠一层背景图再读 `background-color`，读到的永远是最底层的底色，叠在上面的层不进这个属性。脚本按 alpha 手工混 `f.rgb[i]*f.a + s.rgb[i]*(1-f.a)`，并且**认两种写法**——`rgb()/rgba()` 的 0~255 分量，与 `color(srgb f f f / a)` 的 0~1 分量（`color-mix()` 在 computed value 里就是后者）。同理，从 `box-shadow` 里抠描边色不能按空白切（`color(srgb …)` 内部有空格），要按 `0px` / `inset` 这些阴影独有的 token 定位。
- **侧边栏底色要每次现读**：缓存下来的值属于当时那档主题，浅色档就会拿浅色描边去对深色底色比，算出一个根本不存在的低对比度。

- **翻主题必须在同一次 evaluate 里摘属性、读数、还原**：0.1.6-alpha.2 起应用的主题控制器在两帧内就把 `data-ds-dark-theme` 写回 body，跨两次 evaluate 的窗口里属性已经回来了——第一轮实跑的两条「浅色底色」假失败就是这么来的（功能 5 的 C 组要跨住截图往返，用的是守卫观察者方案，见[功能 5 的验证](#功能-5-的验证)）。
- **写在 `evaluate(\`…\`)` 模板串里的页面侧代码，反斜杠与反引号要各写两层**：模板串先处理一遍，`\d` 会变成字面字母 `d`（正则只匹得到小数点，`Number('.')` 得 NaN，断言拿到 `null`），中文注释里一个反引号就截断整个模板串（`SyntaxError: missing ) after argument list`）。跑栈前先 `node --check <file>` 就能抓到后者。
- **`mask-composite` 的 computed 值是逐图层的列表**（`"exclude, exclude"`），断言取第一段而不是全等。
- **时间提亮在第三方主题下可能验不到「变亮」**：测试栈副本把 `label-secondary` 与 `label-tertiary` 都解析成白色，断言因此降级为「挂上了正确的 token」；标准主题下两色不同，这条仍然区分得开。
- 0.1.6 的 `prefers-reduced-motion` 经 `Emulation.setEmulatedMedia` 可用（功能 4 那条「Chrome 只认它支持的那几个 `prefers-*`」的坑在这里是反例：这个特性受支持，`(hover: none)` 才是不受支持的那个）。
- 不覆盖：真实运行中会话的整列观感（错峰相位在真实列表里的兄弟序号与探针容器不同，只验「互不相同」的语义）；壁纸主题下的实际对比度（同功能 5 的限制）。

## 功能 11 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:find
```

19 条断言，全部打[测试栈](#测试栈)。与功能 9 同构：**不注入 bundle**，验的是页面自带实例——本功能不调用任何 harness 服务，也没有需要打桩的破坏性动作。断言本体与判据在 [feature-11-find.md](./feature-11-find.md#实测读数)。

命中数的 oracle 是脚本自己的一份 `TreeWalker`（[lib/find-page.mjs](../scripts/lib/find-page.mjs)），两种口径：`visible` 与插件逐条对齐（跳过项、可见性、折叠），`raw` 只保留「跳过本插件自己的东西」。两者之差就是「在 DOM 里但用户看不见」的那部分文本——折叠判据靠它才有可比性，不是拿被测代码自证。

- **查询词不写死，从页面真实文本里挑**：取出现 ≥3 次、不含换行的 4 字窗口。挑会话同理不能按名字（副本随真实 home 漂移），逐行点开等「已渲染文本 ≥400 字且两次读数一致」，**运行中的会话直接跳过**——流式追加会让插件的命中数与 oracle 抢时序。
- **换查询词要先整段选中输入框**（`el.select()` 再 CDP `Input.insertText`）。`insertText` 替换的是选区，不选就是往后追加：实测「改成前三字」变成了 `" age ag"`，那条断言报的是查询词不对，不是功能不对。
- **`Ctrl` + `F` 是否被接管只能自己装探针**：`defaultPrevented` 在 CDP 侧读不到，脚本在 window 捕获上再挂一个 `keydown` 监听记录它。这条探针**必须后注册**——同相位下注册序决定调用序，后注册才跑在插件之后，读到的才是插件处理的结果。
- **`Esc` 让位那条要真实右键**（`Input.dispatchMouseEvent`），并且分两次按：第一次期望 `{menu:false, bar:true}`，第二次期望 `{bar:false}`。只断言「条最终关了」会放过一个更糟的实现——菜单和条一起被一次按键收掉。
- **折叠判据的 fixture 是「已完成工作」这类整组折叠的过程块**，不是收起的思考行。实测思考行全都长在 `[hidden]` 的组里（`content-visibility: hidden`，元素仍有 layout 盒），而组标题本身也在同一个隐藏容器里——点不到，「展开后命中出现」在这份页面上做不出来。因此第 15 条只验「不可见正文不计入命中」（`raw>0` 且 `visible===0` 且插件 0 条），重算改由**切会话**来验（第 16 条）：条开着时换会话，判据是每条 Range 的 `startContainer.isConnected` 为真——悬空 Range 的 `size` 照样对得上，只比数字会放过它。
- **取词一律从不可见正文的中后段取**：折叠时组标题会显示一段摘要预览，取开头的词会同时命中摘要，`visible===0` 的前提就没了。
- **token 定义在 `document.body` 上，不在 `:root`**：`getComputedStyle(document.documentElement)` 读回来全是空串，这条断言因此读 `document.body`。写错的 token 不报错，只会静默落到 `var()` 的兜底值上。
- 不覆盖：shell 层 accelerator 抢键（CDP 的按键派发不经 `before-input-event`）、macOS 的 `cmd` + `F`、真桌面客户端的观感与流式时的抢滚动。
