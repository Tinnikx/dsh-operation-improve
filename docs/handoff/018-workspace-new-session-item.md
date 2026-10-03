# 018 工作区行右键菜单补上「新会话」

- 目标：工作区行（`_projectRow`）右键时，菜单首项是「新会话」，点下去在该工作区开一条新会话并展开该组；行为与上游那枚 hover 按钮一致。验收：`npm run verify` 里 `workspace new session dispatches uiWorkspace.startSession` 与 `workspace menu drops new session without the service` 两条断言通过，且镜像与配色那几条不回归。
- 范围：只动工作区行单选的菜单。会话行菜单、多选菜单、功能 1 与其余七项功能都不在范围内。上游那枚 hover 按钮本身不动。

## 进展

- 上游把「新建会话」放在工作区行 hover 时的**第二个图标按钮**上（`ProjectRowItem` 的 `rowActions`，与「...」并列），不在「...」菜单里；文案 `actions.newSession`（「新会话」/ "New session"）、aria `actions.newSession.aria`、图标 `IconNewChatOutlineRegular`。**所以工作区单选菜单是上游菜单的超集，「逐项全等」这条口径在这里不成立**，镜像断言相应改成「末两项逐字等于上游那两项 + 首项单独比图标/文案/位置」。验证方式：`scripts/verify-live.mjs` 的 `workspace menu mirrors the row's own menu` 比对 `myItems.slice(1)` 与 `upstreamItems`，并单独断言 `myItems[0]` 的 `viewBox`/`width`/`height`/三条 `path[d]`。
- 动作走 `UiWorkspaceService.startSession(workspaceId)`（`ctx.get('uiWorkspace')`），不是 `sessions.create`：它复用空白会话（`connectWorkspace` → `reuseOrCreateBlank`），与上游按钮逐字同一条路。验证方式：新增断言 `workspace new session dispatches uiWorkspace.startSession` 点首项后要求 `calls` 里**只有** `uiWorkspace.startSession`，参数逐字等于该行 `data-row-key` 去掉 `workspace:` 前缀。实测该 home 里取到的行 id `1f2b6cea-…` 与发出去的参数一致。
- 上游 `onCreate` 是两步：先 `setGroupExpanded(group.key, true)` 再 `startSession`。本插件用「点行本身」代替展开（行 `onClick` 即 `onToggle`），且**只在 `aria-expanded === 'false'` 时点**——上游 `onToggle` 在折叠态被点时会顺手记一次 `COLLAPSED_SESSION_LIMIT`，已展开再点就变成收起来。验证方式：断言里 `expandedBefore === 'false'` 时执行后必须变 `'true'`。实测这一 home 的首行本来就是展开的（`expandedBefore` 为 `'true'`），所以这条判据在本轮没被真正走到，**它只验了「已展开时不点」那一半**。
- 服务缺席时整项不出现：`getUiWorkspace()` 返回 undefined 或没有 `startSession` 时 `buildItems` 少 push 一条，菜单回到「重命名 / 删除工作区」。验证方式：`workspace menu drops new session without the service` 把 `window.__dshOiUiWorkspaceStub__.enabled` 置 false 后重开菜单，断言项数 2、首项是重命名，并断言翻这个开关本身 0 次服务调用。
- `ctx.get('uiWorkspace')` 可用而**不必**把它加进 `export const inject`：`ReflectService.get` 直查 store（`@deepseek-ai/cordis/src/reflect.ts:233`，类型注释原文「Read a service from the store without the inject requirement」），只有属性读取 `ctx.foo` 才走 inject 要求。上游 `new UiWorkspaceService(ctx, …)` 的 `super(ctx, "uiWorkspace")` 已经把它 provide 进 store，上游自己也走 `ctx.get("chatFileMentions")` 这条路。
- 图标逐字取自 `@deepseek-ai/dsh-client-ui-primitives@0.2.0-rc.2` 的 `NewChatOutlineArtwork`（16×16、viewBox `0 0 16 16`、三条 path），加进 `src/shared/menu-icons.js` 的 `MENU_ICONS.newChat`。注意它与本仓已有那批图标不同：`width`/`height` 是 `16`（不是 14），靠 `context-menu.js` 的 `__icon` 规则压到 14px；`stroke-width="1"` 在上游是 `strokeWidth` prop 落到 svg 根上的属性，落地后同名。

## 决策与理由

- **只加在工作区行，不加会话行**：上游那枚按钮只在 `_projectRow` 上，会话行加一个「新建会话」没有任何上游对应物，等于凭空发明一个入口。
- **位置钉在首项**：它不是破坏性操作，混进标红那堆里会误导；也对应上游操作区里它排在「...」之前的直觉。
- **deps 传 `getUiWorkspace?: () => service | undefined` 而不是 service 本身**：本插件的 `apply` 与上游 Service 注册没有先后保证，缓存成常量会在注册之前取到 `undefined` 然后整项永远不出现。每次 `buildItems` 现取一次，代价可忽略。
- **走 `startSession` 而不是 `sessions.create`**：前者复用空白会话，后者每次都新建一条，是两种行为；对齐上游就只能走前者。

## 测试cases

- `PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/test-stack.mjs restart` 起测试栈（3181 / CDP 9334）。
- `node scripts/verify-live.mjs`：`passed=28 failed=1 skipped=0 total=29`。28 条通过，含本次新增的两条。
- 唯一 FAIL 是 `menu metrics match the primitives default tier`，**与本次改动无关**：`git stash` 后在 HEAD 上重跑，基线同样是 `passed=26 failed=1`、同样这一条失败（差异只是本次多两条通过）。
- `node --test tests/*.test.mjs`：46 pass / 0 fail（仓里没有覆盖 context-menu 的单测，这条只保证没弄坏别的）。
- 用户在自己的 home 上人验过：右键工作区行点「新会话」真开了会话，确认后索引行改「完成」。

## 未验证项与下一步

1. 折叠态工作区行点「新会话」是否展开该组：`expandedBefore` 在测试 home 的首行上是 `'true'`，判据没走到。要覆盖可先折叠那一行再点。
2. 「未分组」那一行不给这一项——它反查不到 workspaceId，整条路径压根不接管那次右键。未在 live 上验过（该 home 里没有未分组行）。

## 坑

- **给 boot 模板字符串写注释，反引号必须转义成 `\\``**，否则 `SyntaxError: Unexpected identifier 'ctx'`；`node --check scripts/verify-live.mjs` 能当场抓到。
- **上游的「新建会话」按钮在 `rowActions` 的第二位**，脚本里点开上游「...」菜单的动作只认 `button[0]` 就是为了别闭着眼点到它。给这一项写断言时也别照抄那个位置习惯。
- **`verify-live.mjs` 的会话侧断言索引（`[1]`=rename、`[2]`=fork）不受本次影响**，但工作区侧删除项下标从 1 挪到了 2；`ROWMENU` 的 `pair` 因此改成 `pair(row, x, y, myDangerIndex = 1)`，两边危险项下标不再假设相同。
- **测试栈是 detached 起的**：`node scripts/test-stack.mjs up` 那个 shell 退出后进程仍在，但 harness 与 Chrome 都可能被系统回收（实测出现过 `harnessPid: null` + `ECONNREFUSED 9334`）。在**同一个 shell**里 `restart` 紧接跑验证脚本最稳；跨 shell 跑要先 `status` 确认。
- **页面里的 `--dsw-*` token 只有前端挂载后才解析**（`BODY` 上才有 `--dsw-elevation-prominent: 0 0 0 .5px #fff3, …`）。新建一个挂在 `document.body` 上的空 `div` 在应用挂载前读到的全是空串——量样式类的东西必须先 `reloadAndWait` 再等挂载。
- **`menu metrics match the primitives default tier` 那条 FAIL 是 0.2.0-rc.2 的主题漂移，不是本条引入的**，机制与修法见 [017-timestamps-no-overlap-band.md](017-timestamps-no-overlap-band.md) 的「主题漂移：菜单浮层描边分档」一节。**本条当时对那条 token 的读数是错的**：写的是「由 `--dsw-alias-border-l1` 给」，实际 rc.2 是 `[data-menu-material]` 作用域内改指 l3（深色），浅色那档主题根本没重发、仍吃 `body` 上的 l4，而上游菜单自己那条 `_list` 规则写死 l1、再被深色那条覆盖成 l3——**是照抄更早一版的解析值，不是上游给的值**。量 token 读到值只说明「此刻是谁的值」，要先去看**声明在哪个选择器里**才能定性。