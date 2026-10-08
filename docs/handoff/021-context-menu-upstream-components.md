# 021 右键菜单改用上游组件

- 目标：把功能 2 单选会话行的右键菜单从「本地手抄项集合」换成「渲染上游那一格 slot 的条目」，上游加选项本地不改代码；功能 2 其余几处与功能 6 一并把外壳换成上游 `Menu`。验收：会话单选菜单与该行自己的「...」菜单逐项全等，`npm run verify` 与其余七套 live 验证全绿。
- 范围：`src/shared/` 的菜单层与图标层、`src/context-menu-feature/`、`src/selection-menu/`、`src/row-states/`、`src/find/`、`src/client/index.js`、`scripts/verify-live.mjs`（整份重写）、`scripts/verify-selection-menu-live.mjs`。功能 1、3-5、7-11 与 host 半边不动。上游 `ui-workspace` / `ui-primitives` 本身不动。

## 进展

**为什么只能从 slot 读条目，不能 import 上游组件**：插件能 import 的平台模块只有 9 个 seed 词（`packages/client/web/src/seed.ts`），`@deepseek-ai/dsh-client-ui-workspace` 既不在 seed 表也不在任何包的 `dsh.client.external`，`require` 它会抛 `client-modules: require("…") missed the module table`。而那四个条目是 `ctx.slots` 上注册进来的 React 组件（`ui-workspace/src/client/index.ts:285-290`），`ctx.slots.entriesOfSlot('sidebar.workspaces.session.menu.item')` 读的是渲染器自己读的那份账。所以本插件的做法是照抄 `ui-renderer` 的语义把条目渲染出来，而不是抄一份它们的实现。

- **外壳层** [src/shared/menu.jsx](../../src/shared/menu.jsx) 新建：一棵模块级常驻 React root（`createRoot` 建一次跨菜单复用），卡片是上游 `Menu`。定位走 `getAnchorRect`：上游 `Menu` 的 `anchor` 必填且要在自己子树里就地渲染，右键没有触发元素，而 `getAnchorRect` 正是组件为此留的口子（`Menu.tsx:146-151`），上游 `WorkspacePicker.tsx:61` 就是这么用的；`anchor` 给一枚零尺寸 `<span>` 占位，真实位置全由 `getAnchorRect` 给的零尺寸矩形提供，夹边与每帧重算走上游那份实现。`listClassName` 传 `dsh-oi-menu dsh-oi-menu--<owner>`：卡片由 `MenuSurface` 内部 `createPortal` 挂到 `document.body` 下，`listClassName` 是唯一能作用于 portaled list 的样式钩子，**owner 只能编成类名**（按属性查不到卡片）。`MENU_CSS` 从一百行缩成两条——卡片的 `z-index: 2147483000`，外加**常驻容器脱流**（`.dsh-oi-menu__host { position: fixed; width: 0; height: 0 }`，见「坑」里那条整页跳动）。`data-menu-material="translucent"` 与全部尺寸/描边档位都由上游 `MenuSurface` 自带。
- **条目层** [src/shared/slot-rows.jsx](../../src/shared/slot-rows.jsx) 新建：照抄 `scoped-slots.tsx` 三段语义——props 拼装顺序（kit → entry inject → slot inject → hookContext → owner props，后覆盖前）、`hooks` 舱拆成 `useXxx`（函数值当工厂、其余 HostObservable 当选择器）、list slot 先 `priority` 后 `order`。slot 级 inject 里 `menuOpenState` 必须写成 `() => () => hookContext` **双层柯里化**（渲染器把工厂返回值当 hook 用），`shortcuts` 直接给 `deps.shortcuts.catalog`。hook 绑定自己实现（上游用 `use-sync-external-store/shim/with-selector`，那个包不是 seed 词也不在本插件依赖里；`react` 自带的 `useSyncExternalStore` 没有 selector 形态，所以照它的算法补一层按引用缓存的 `getSnapshot`）。
- **功能 2** [src/context-menu-feature/index.js](../../src/context-menu-feature/index.js) 重写：会话单选整份换成 `SessionMenuRows`（零本地代码）；工作区单选/多选仍是 data `items` 但外壳是上游 `Menu`、图标是上游 React 组件；`run()` 只剩新会话 / 重命名 / 删除三支。`inject` 增 `'shortcuts'`，句柄增 `services`。
- **功能 6** [src/selection-menu/index.js](../../src/selection-menu/index.js) 换外壳与图标（`IconCopyOutlineRegular` 本体 + 自绘 paste），删 `anchor` 参数。
- **删除** `src/shared/context-menu.js`（286 行）与 `src/shared/menu-icons.js`（76 行）。多选高亮那两段规则从 `MENU_CSS` 尾部搬进 `ROW_STATES_CSS`（两者现在同属一张表，多选那条靠「写在后面」赢，不再靠跨表顺序）。[src/find/index.js](../../src/find/index.js) 改从 `menu.jsx` 取 `closeContextMenu` / `OWNER_ATTR` / `ROOT_CLASS`。
- **验证策略改写**：[scripts/verify-live.mjs](../../scripts/verify-live.mjs) 从「注入 bundle + 记账 Proxy」整份重写成「驱动页面自带实例 + 自建可丢弃靶子」。起因有两条且各自都致命：产物顶层 require 的四个模块全是平台 seed，桩被调到即抛；更要紧的是会话那一支菜单的条目要从真 `slots` 服务里读出来，而注入实例拿到的是脚本手搓的 ctx，两边都读不到那一格条目表。用户拍板了两处（策略=真实实例+靶子，靶子=脚本自建并清理）。新增 [scripts/lib/fixtures.mjs](../../scripts/lib/fixtures.mjs)：Node 侧 `mkdirSync` 造目录（页面 JS 造不出目录，host 的 `workspaces.create` 只接受已存在路径）、页面侧 `workspaces.create`，收尾 `delete` + `rmSync`。靶子**只有工作区**：会话建出来是 blank 的，而 `ui-workspace/src/client/tree.ts:238-256` 的 `sessionVisible()` 首行就挡掉 blank 会话，blank 只由真发消息翻掉、公开 API 没开关——新建会话永远没有侧栏行，当不了靶子。会话那一支改用两条路：可逆的真操作（置顶后取消置顶、重命名后改回原名；测试栈 home 是真 home 的 `rsync` 副本且每次 `stack:up` 重同步）与打桩（给句柄 `services.uiWorkspace` 那个实例挂 own property 拦 `forkSession` / `archiveSession` / `unarchiveSession`；上游 inject 的动作回调是调用时属性查找，桩拦得住且零副作用，打桩期间不 call through）。据此删掉两条 archived-view 断言（要看到归档行得开上游「视图选项 → 显示已归档」，那要求先真归档，留下一条永远删不掉的脏会话），`locale wired` 从改 `document.documentElement.lang`（那只是 `syncDocumentLanguage` 的单向镜像，`translate()` 读的是 `snapshot.active`）改成走设置页那枚 Language 行切到另一档、再切回原档。[scripts/verify-selection-menu-live.mjs](../../scripts/verify-selection-menu-live.mjs) 按新的 DOM 契约改选择器（`div[role="menu"].dsh-oi-menu` + `button[role="menuitem"]`，owner 认类名），行菜单断言从 3 项改 4 项。`verify-find-live.mjs` 与 `lib/find-page.mjs` 无需改（卡片仍带 `.dsh-oi-menu` 类，host 容器是另一个 token）。

## 决策与理由

1. **收下上游的「归档会话」**。归档被 host 拒时（`workspace/session-active`）要弹「停止并归档此会话？」并带 `{stopActivity:true}` 重试，这条链是上游 `ArchiveSessionMenuItem` 写自己的 store、由 `shell.overlay` 的 `SessionArchiveConfirmDialog` 接手——当初抄不起的正是它。既然菜单整份跟上游，这一项没有理由再缺席。
2. **fork 之后不再自动打开子会话**（用户拍板）。原先那段「轮询侧栏 3 秒找子会话的行并点它」随本地 fork 实现一起去掉：菜单既然是上游那份，行为就该是上游那份，差一步就又要跟着改。
3. **多选那份手搭菜单不一起换条目来源，但换外壳**：工作区多选只有「删除 N 个工作区」，上游没有覆盖工作区行的 slot（那一份是 `ProjectRowItem` 里写死的 data `items`），所以那几项仍是本地拼的——换的只是卡片与图标。
4. **自己起 React root 而不接进上游渲染器**。`renderSlot` 只认它自己声明过的 slot，没有对外的「在任意位置渲染任意节点」入口；而菜单是事件驱动的（一次 `contextmenu` 拿坐标、打开、选中后消失），本来就不在任何一棵已有树里。
5. **卡片归属编成类名而不是属性**。两份实例并存时选错就是点击打在另一份实例的真服务上（早先发生过一次归档掉 8 个真实会话），而卡片在 `document.body` 下、不在本插件 DOM 子树里，`data-dsh-oi-owner` 查不到它。
6. **语法检查用构建而不是 `node --check`**：`node --check` 不认 `.jsx` 扩展名（报 `ERR_UNKNOWN_FILE_EXTENSION`），两个新文件都是 `.jsx`（esbuild 的 `jsx:'automatic'` 两者都吃）。`.js` 文件用 `node --check` 时必须先 `export PATH="$HOME/.dsh/desktop-bin/node-shim:$PATH"`，否则命令不存在会假报 FAIL。

## 坑

- **常驻容器把整页顶出一条滚动条**（用户实测发现，八套里原先没有一条断言能抓住它）：`createRoot` 的容器 `.dsh-oi-menu__host` 是 `append` 在 `body` 末尾的普通 block，而上游 `Menu` 把 `anchor` **原地**渲染进这棵树、外面还包一层带行盒的 `<span>`（实测高 18px）。菜单一开 `body` 内容高度就从 857 涨到 875、顶过视口 → 冒出竖直滚动条 → `documentElement.clientWidth` 1600→1595，会话区 1318→1313，右侧导航列跟着横向收窄，用户看到的是一右键整页跳。`MENU_CSS` 给容器 `position: fixed` + 零尺寸即彻底脱流（fixed 元素不进滚动溢出区），并由 `verify` 新增的 `opening the menu does not shift the page geometry` 守住「开前 / 开着 / 关后三份几何快照一个数都不许变」。
- **五个真机 bug 全部是静默异常**：capture 阶段的 `contextmenu` handler 里抛错，页面 catch 不到、控制台无痕，症状是「菜单根本没出来」。逐个是：函数没有 `.slot` 属性（要 `sessionMenuEntries(slots)` 而不是 `deps.slots.entriesOfSlot(SessionMenuRows.slot)`）；`publish is not a function`（`createRoot().render()` 在 React 18 里是异步的，组件还没渲染模块级出口还不存在——改成 `subscribers` Set + `useSyncExternalStore`，读模块级 `current`）；`props is not defined`；`useMenuOpenState is not a function or its return value is not iterable`（少一层柯里化）；`closing.restoreFocus is not a function`（存的是元素）。**探针必须自己 hook `console.error` 与 `window.addEventListener('error')` 才看得见这一类。**
- **`disposeContextMenu` 这个名字被局部变量遮蔽过一次**：功能 2 的 disposer 原本就叫这个名字，遮住了 `menu.jsx` 的 import，于是整份实例的 `dispose()` 永远拆不掉那棵 React 树，而功能 6 还在用它。局部那个改名 `disposeFeatureMenu`，整份 `dispose()` 的顺序必须是 功能 2 → 功能 6 → `disposeContextMenu()`。
- **锚点零尺寸但 `anchor` 不能省**：上游要从中量尺寸、也要在关闭后尝试归位焦点，所以必须给一个真实节点。零尺寸 `<span>` 布局不受影响，里面没有 button 时 `refocusAnchor` 找不到目标是空操作（上游 `Menu.tsx:209-216` 自己就这么容错的）。
- **「滚侧栏就关菜单」那条旧判据不再成立，方向恰好相反**：菜单钉在视口坐标上，上游的定位 effect 在 capture 阶段的 scroll 上只**重算位置**、从不关闭。断言改成「滚动时菜单跟着挪」——确切说是「位置不变也不关」，因为菜单锚的是视口坐标，侧栏滚动不影响它。
- **测试栈是 detached 起的且随父 shell 死**：每次 bash 是独立 shell、容器 `bwrap --unshare-pid --die-with-parent`，所以 `stack:up` 与后续脚本必须写在同一条 bash 命令里。
- **`npm` 不在 node-shim 里**（只有 `node`）；构建默认失败，须 `DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop`。
- **往 `PRELUDE` 这类模板串里写注释，反引号会当场截断整份脚本**（`SyntaxError: Unexpected identifier`，Node 侧加载就炸，整套白跑）。这条与 [docs/verify.md 功能 10 那条坑](../verify.md#功能-10-的验证) 同源，本轮再踩一次；改完 `node --check scripts/verify-live.mjs` 只要一秒，跑栈之前必做。
- **打桩要挂在 `services.uiWorkspace` 那个实例的 own property 上**，不是包一层代理：上游 inject 的动作回调（`archiveInjected` 等）是调用时做属性查找，所以 own property 就拦得住，句柄上的 getter 返回的又正好是同一个实例。**打桩期间不要 call through**——`forkSession` 会留一条 `ISessions` 删不掉的会话，`archiveSession` 会让后续取行取到归档行。
- **切语言只能走设置页那枚 Language 行**：改 `document.documentElement.lang` 是零影响的（单向镜像），而 `LocaleRuntime.setLocale` 既不在 cordis-client-runner 的 8 个 SERVICE_API 服务 key 里、调试句柄也没暴露。真实路径是 `button[aria-haspopup="dialog"][aria-label === t('trigger')]` → `div[role="dialog"][data-shortcut-modal="settings"]` → 通用设置段里那枚 `button[aria-haspopup="menu"]` → portal 菜单点另一档。**切完必须切回原档**，设置项会写 host 偏好。
- **一条 `verify` 会把下一个脚本的现场挪走**：它收尾时页面停在「新会话」那条断言开出来的空白会话上，`verify:selection` 自己 `Page.reload` 也回不去（应用恢复的就是上次打开的那个会话），表现为「右键不弹菜单」的 FAIL + ABORT——看着像功能 6 坏了。功能 6 因此开头自己挑会话（见 [docs/verify.md](../verify.md#功能-6-的验证)）。判别这类的办法是先 `stack:up` 单独跑一遍：单独跑必过、连着跑才红，就是现场问题不是代码问题。
- **`[data-conversation-scroll]` 在 0.2.1-alpha.1 的页面上不存在**：会话区锚点要用 `data-chat-node-key`（`verify:timestamps` 同源）。`verify` 那条「无关滚动不影响菜单」现在退到了脚本自建的合成滚动容器（观测值 `source:"synthetic"`），比的是合成容器而不是真的会话区滚动。

## 交付落点

- 新增 [src/shared/menu.jsx](../../src/shared/menu.jsx)、[src/shared/slot-rows.jsx](../../src/shared/slot-rows.jsx)、[scripts/lib/fixtures.mjs](../../scripts/lib/fixtures.mjs)。
- 删除 `src/shared/context-menu.js`、`src/shared/menu-icons.js`。
- 改写 [src/context-menu-feature/index.js](../../src/context-menu-feature/index.js)、[src/selection-menu/index.js](../../src/selection-menu/index.js)、[src/row-states/index.js](../../src/row-states/index.js)（多选高亮迁入）、[src/find/index.js](../../src/find/index.js)、[src/client/index.js](../../src/client/index.js)（`inject` 增 `shortcuts`、句柄增 `services`、dispose 顺序）。
- 重写 [scripts/verify-live.mjs](../../scripts/verify-live.mjs)，改 [scripts/verify-selection-menu-live.mjs](../../scripts/verify-selection-menu-live.mjs)（新的 DOM 契约 + 挑会话与挑选区各带一道命中测试，见「坑」里跨脚本串台那条）。
- 文档：[README.md](../../README.md)、[docs/shared-api.md](../../docs/shared-api.md)、[docs/verify.md](../../docs/verify.md)、[docs/feature-1-2-sidebar-menu.md](../../docs/feature-1-2-sidebar-menu.md)、[docs/feature-6-selection-menu.md](../../docs/feature-6-selection-menu.md)、[docs/feature-10-row-states.md](../../docs/feature-10-row-states.md)、[docs/feature-11-find.md](../../docs/feature-11-find.md)。

## 验证

`npm test` 46/46；`npm run check:catalog` PASS（dsh=0.2.1-alpha.1，19 卡 / 81 字段逐键与上游 schema 一致）。同一份构建、同一套测试栈连跑八套 live：`verify` 29、`verify:selection` 20、`verify:timestamps` 10、`verify:dot` 21、`verify:chat-history` 16、`verify:settings` 30、`verify:find` 19 全绿（合计 145 条，`failed=0 skipped=0`），**`verify:row-states` 为 passed=27 failed=4 total=31**。

那四条失败全是多选高亮的对比度判据（描边 vs 侧边栏底、描边 vs 填充、填充 vs 普通行底），根因不在本次改动：那段 CSS 与[交接 019](./019-multiselect-highlight-outline.md) 收口时逐字相同（`git show HEAD:src/shared/context-menu.js` 与 [src/row-states/index.js](../../src/row-states/index.js) 对照，只换了注释里的表归属）。变的是现场——harness 到 0.2.1-alpha.1 之后 `dsh-any-background@0.3.6` 不再被兼容性预检否决，页面主题成了它的 `custom-color`，侧边栏底换成 `hsl(40,34%,31%)` 的半透明层，描边对它的比值因此从 019 那轮的 6.52×/7.47× 掉到 2.43~2.63×。口径怎么定归[交接 022](./022-multiselect-contrast-baseline.md)，本轮不动判据。

`verify` 这套本身修掉三处，都是脚本侧而非插件侧：

- **收尾关菜单的竞态**：`closeAll()` 原来同步返回，而关闭是一次 React 卸载，紧接着读 `mine().length === 0` 恒为 1，「滚动不改位置」那两条主判据全过却被收尾判红。改成 `async` + 轮询到卡片真消失（最多 600ms），26 处调用点统一 `await`。
- **主题杠杆取错了 token**：`withScheme()` 拿 `--dsw-alias-border-l3` 当「档位真的在动」的证据，但那枚被 `dsh-any-background` 的 81 条 `!important` 钉成深色档的值，深浅两档恒读 `rgba(255,255,255,0.16)`；卡片跟的那枚 `--dsw-elevation-stroke-color` 才是分档的（实测深色 `rgba(255,255,255,0.16)` / 浅色 `rgba(255,255,255,0.2)`）。证据换成后者。
- **一次性摘属性撑不过 `pair()`**：`data-ds-dark-theme` 每帧被写回深色（实测摘掉后 700ms 内 47 次），所以按[功能 5 的 C 组](../verify.md#功能-5-的验证)那套挂 MutationObserver 守卫，`run()` 全程钉住，结束摘钩并复原属性原值（原来复原成空串，把 `dsh-any-background` 这个来源标记抹掉了）。

`[cleanup] 靶子没收干净` 那条误报警一并修掉：判据还在要求 `cleaned.archived === true`，而靶子只剩工作区、`cleanupFixtures` 返回的是 `{deleted, removed}`。

用户实测发现的**一右键整页跳**是插件侧缺陷，已修（见「坑」第一条）：`MENU_CSS` 给常驻容器加 `position: fixed` + 零尺寸。修复前后的对照读数——修复前菜单开着时 `clientWidth` 1600→1595、会话区 1318→1313、容器高 18px；修复后三份快照（开前 / 开着 / 关后）完全一致，容器 `{w:0, h:0, pos:"fixed"}`。新增那条 `opening the menu does not shift the page geometry` 就是守这个的。

功能 6 连着踩了两个**探针自身的坑**（插件行为都对）：一是它拿 `document.body` 里第一个够长的文本当正文，会话一空就选中 composer 上那枚模型名按钮的标签；二是它按 range 的矩形取中点当右键坐标，而会话列上方有吸顶的 `_header_…` 覆盖带，点被接走、Chrome 当场折叠选区。A/B 对照：新栈上 `elementFromPoint` 是 `STRONG.`（`cards:1`），`verify` 之后是 `DIV._header_1pq26_10`（`cards:0`）。现在挑正文要求「在 `[data-chat-node-key]` 的消息行里」且「点位命中这段文本自己的盒子」，挑不到就换下一条会话。

## 验收方式

- **八套按串行顺序跑**：`npm run stack:up` 之后依次 `verify` → `verify:timestamps` → `verify:dot` → `verify:selection` → `verify:settings` → `verify:chat-history` → `verify:row-states` → `verify:find`（本轮实测 29/10/21/20/30/16/31/19，除 row-states 那四条外全部 `failed=0 skipped=0`）。每套单独跑都能过，跨脚本串台只在串行时出现——功能 6 那两道命中测试就是为此而加，只单跑等于没验到。
- **回归证法（几何那条是不是空守）**：把 [src/shared/menu.jsx](../../src/shared/menu.jsx) 里 `MENU_CSS` 的 `.dsh-oi-menu__host` 那条 `position: fixed` 删掉、重建、重跑 `npm run verify`——`opening the menu does not shift the page geometry` 必须红并报出 `clientWidth` 差一个滚动条宽。它绿着才说明这条断言没内容。
- **上游加选项时该红的地方**：`session menu mirrors the row's own menu` 钉的是上游恰好 4 项，上游加第 5 项时这条会红，届时改判据里的 4，插件代码不用动（条目从 `slots.entriesOfSlot` 现读）。
- 状态改「完成」的依据是用户确认「没问题」；没被这次确认覆盖的是现场口径，它归[交接 022](./022-multiselect-contrast-baseline.md)。
