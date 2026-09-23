# 012 右键菜单让位：摘掉单选与批量的归档动作

- 目标：侧边栏右键菜单不再提供归档——单选会话没有「归档会话」，会话多选没有批量归档；归档只从行右侧「...」或 hover 按钮进。**"让位"没有对应的上游右键菜单**：0.1.7 的 dsh-client-ui-workspace 里没有任何 contextmenu / onContextMenu 监听（0.1.6 源码同样为 0），桌面壳 resources/app/lib 也只有 tray.js 设了托盘原生菜单，没有 webContents 的 context-menu 处理。验收方式：`npm run verify` 全绿，且 `session batch right-click hands the menu back` 与镜像那条真子集断言实际执行（不是 skip）。
- 范围：做——菜单项与派发、随之无用的词条与 glyph、三条验证脚本、相关文档。不做——复现上游的「停止并归档此会话？」确认对话框与 activity 列表（已明确选择让位而不是抄），不改功能 1 的多选本身。

## 进展

- 单选会话菜单从 4 项变 3 项（置顶翻转 / 重命名 / 分叉会话），归档行的末项仍是「取消归档」。验证：`npm run verify` 的 `contextmenu single (session)` 读数 `["置顶会话","重命名","分叉会话"]`；`session menu mirrors the row's own menu` 用「上游四项减末项归档」的真子集判据，逐项比 `viewBox` / `width` / `height` / 全部 `path[d]` 全等。
- 会话多选右键**整个不接管**：`buildItems` 对 `kind === 'session' && many` 返回空列表，监听器把 `preventDefault()` / `stopPropagation()` 挪到了「有项可弹」之后。验证：`session batch right-click hands the menu back` 读数 `{selected:2, menus:0, defaultPrevented:false}`——只断言"没弹"会放过一个更糟的实现（拦下默认行为再什么都不做），所以两条一起判。
- 死代码一并清掉：`run()` 的 archive 分支、`MENU_ICONS.archive` 与那枚逐字拷贝的 `IconArchiveOutlineRegular`、`batch.archiveSessions` / `confirm.archiveSessions` 两条词条（zh + en）。验证：`grep -rn "MENU_ICONS\." src/` 里已无 `archive`（只剩 `unarchive`）；`grep -rn "archiveSessions" src/ tests/` 为空；`npm test` 34/34。
- 批量分支只剩工作区：`contextmenu batch (workspaces)` 读数 `["删除 2 个工作区"]`，`batch action dispatches service` 断言 `kind === 'workspace'` 且两次 `workspaces.delete` 打在两个不同 id 上。工作区那条断言现在把菜单留给下一条断言点（不关不清选择集）。
- 全套读数（在提交的那份产物上重跑）：`verify 27/27 · selection 20/20 · timestamps 10/10 · dot 21/21 · row-states 24/24 · chat-history 16/16 · settings 20/20 · npm test 34/34`；测试栈已 down。

## 决策与理由

- 让位而不是补完：上游的归档项在被 host 拒（`workspace/session-active`）之后还要弹「停止并归档此会话？」并带 `{ stopActivity: true }` 重试；插件原先只发第一次且 `run()` 不 catch，对有进行中工作的会话是静默没反应。抄完这条链要连对话框与 activity 列表一起复现，用户决定不抄，改成不提供这一项。
- 「取消归档」留着：它不带 options、不会被拒、不是破坏性操作，那一份复制本来就是完整的；摘掉它只会把一条没问题的动作也赶走。
- 空菜单必须连默认行为一起交回：`preventDefault` 在拿到项之后才调，否则会话多选右键就成了"点了什么都不发生"。
- 镜像断言写成"上游减归档"而不是写死三项：写死字面量会把"有意少一项"和"漏抄一项"混成一个失败信号。

## 测试cases

`verify-live.mjs`：删掉 `single archive skips the confirmation`；`contextmenu batch` 改为 `session batch right-click hands the menu back`；工作区批量两条重排（先开菜单再点派发）；单选与镜像两条改判据。`verify-selection-menu-live.mjs`：行菜单项数 4→3、期望文案去掉 `menu.archiveSession`。`verify-settings-live.mjs` / 其余套件不涉及本功能。单测新增项无（清单相关的 `tests/catalog.test.mjs` 属 011）。

## 未完成项与下一步

- 无遗留。会话多选按让位收尾：保留选中、计数与高亮，不给任何批量动作（工作区多选不受影响）。

## 坑

- 「不弹菜单」和「不拦默认行为」是两件事，只测前者会留下一个更糟的实现：preventDefault 之后返回，右键变成什么都发生不了。也别把这条读成"弹出上游的右键菜单"——上游行上没有 contextmenu 监听，不拦的结果就是浏览器默认（Electron 不给页面装菜单，普通文本上通常什么都不弹）。
- 摘掉一项动作会连带留下三处无人引用的东西（图标常量、两条词条、`run()` 的分支）。它们不会报错，只会在下次 grep 时被人当成还在用的功能。
