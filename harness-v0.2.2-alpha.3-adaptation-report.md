# harness v0.2.2-alpha.3 适配报告

锚定版本从 0.2.2-alpha.2 → **0.2.2-alpha.3**（desktop dist `@deepseek-ai/dsh` 的 `package.json` version 为 `0.2.2-alpha.3`，`check-catalog-schema.mjs` 打印的 `dsh=0.2.2-alpha.3` 与 `scripts/lib/harness-bin.mjs` 的 `resolveHarnessBin()` 取的是同一份）。沿用单版本锚定口径，不保留旧版本兼容路径。

## 上游变化（落在本插件上的部分）

- **侧边栏行有了原生右键菜单**。`@deepseek-ai/dsh-client-ui-workspace/lib/client.js` 的 `ProjectRow`（`getTriggerProps` 在 2230 行）与 `SessionNodeItem`（2529 行）都把 `{kind:'workspace'|'session', value:{…}}` 交给 `@deepseek-ai/dsh-client-ui-context-menu` 的 `getTriggerProps`，右键直接 `ctx.contextMenus.open(target, point)`。工作区菜单注册 `workspace.rename`（order 100，5956 行）与 `workspace.delete`（300，5969 行）；会话菜单在 `registerSessionMenus`（4328 行）里注册 pin 100 / rename 200 / fork 300 / id 450 / archive 600，均按 `remoteAccess.source` 权限决定是否给项。
- **`sidebar.workspaces.session.menu.item` 变成纯外部扩展位**。内置会话项不再经这个 slot 渲染，slot 声明只留给外部插件追加条目（`client.js:20`、`6083`，`slots.d.ts:200`）。本插件原先靠读它拼会话菜单的实现因此没有上游内容可读。
- **`@deepseek-ai/dsh-client-ui-context-menu` 是新包**，描述为「Typed, plugin-extensible context menus with captured targets and shared Web presentation」，客户端 `dsh.client.inject = [locale, ui-layout, shortcuts]`。`getTriggerProps` 的触发契约在 `dsh-client-ui-context-menu/lib/types/client/types.d.ts:23`：同一目标同一坐标 4px 内再次触发是 toggle。
- **`@deepseek-ai/dsh-client-ui-file-actions` 也是新包**，读 `window.dshDesktop?.fileActions`；本仓的桥没有这个成员，未接入。
- `dsh-web-app` 的 bundle 补丁新插两行客户端插件 `ui-file-actions` / `ui-context-menu`（desktop 侧升级记录 `docs/handoff/109-upgrade-0.2.2-alpha.3.md`，冒烟 58/71 → 60/73）。
- **真 home 的 `dsh.profile.bundles` 被重写过**：四个 profile 的名单里都没有本插件（`package.json` 依赖与 `node_modules` 软链还在，`cordis.patch.yml` 托管区段也在）。应用因此不会加载本插件；本轮不改真 home，测试栈在副本里把插件名补回名单。

## 本轮改动

### 功能 2 整体移除

侧边栏行右键交还 `ui-workspace` 原生菜单，删除：

- `src/context-menu-feature/index.js`（删除）
- `src/shared/slot-rows.jsx`（删除）
- `docs/feature-1-2-sidebar-menu.md` 重命名为 [docs/feature-1-sidebar-multiselect.md](docs/feature-1-sidebar-multiselect.md)，只保留功能 1

[src/client/index.js](src/client/index.js)：删掉 `installContextMenu` 的安装与 `disposeFeatureMenu`；`inject` 从五项减到 `['workspaces','sessions','locale','slots']`；调试句柄删 `contextMenu` 与 `services.slots`；`locale` 句柄只剩 `{ tCommon, tOwn, dispose }`；`services` 只留 `workspaces`、`sessions`、`get theme`、`get uiWorkspace`。`MENU_CSS`、`closeContextMenu`、`disposeContextMenu` 仍由功能 6 使用，保留。

[src/shared/locale.js](src/shared/locale.js)：删 `UPSTREAM_NS`、上游 workspace 词典绑定的 `t`，以及只服务批量菜单的 `batch.deleteWorkspaces` / `confirm.deleteWorkspaces` 词条。

### 测试栈与验证脚本

- [scripts/test-stack.mjs](scripts/test-stack.mjs)：`rescopeManifest()` 不再因为副本的 `dsh.profile.bundles` 缺本插件而中止，改成缺了就 `push(PLUGIN_NAME)`。理由：真 home 的名单会被 `dsh plugin` / dshmarket 重写，依赖还在而名单缺项是常见状态。
- [scripts/lib/fixtures.mjs](scripts/lib/fixtures.mjs)：`requireInstance()` 必需服务从 `['workspaces','sessions','slots']` 改为 `['workspaces','sessions']`。
- [scripts/verify-live.mjs](scripts/verify-live.mjs)：重写为功能 1 的五条选择断言，加三条「右键工作区行 / 会话行 / 多选后右键：`plugin=0`、官方 `div[role="menu"]` ≥ 1、选择集不变」，再加一条卸载断言。共 9 条。
- [scripts/verify-selection-menu-live.mjs](scripts/verify-selection-menu-live.mjs)：删掉功能 2 行菜单断言与两份菜单 computed style 比对；有选中文本时右键侧边栏行只断言 `plugin=0` 且选区不变。菜单触发改为合成 `contextmenu`（带 `clientX/clientY`），剪贴板动作仍走真实左键。共 18 条。
- [scripts/verify-find-live.mjs](scripts/verify-find-live.mjs)：Esc 让位改由功能 6 的选区菜单验证；正文挑选要求 range 落在视口内，否则先 `scrollIntoView({block:'center'})` 再重算（实测靠前节点 `y=-1426` 会让 `caretPositionFromPoint` 返回 null、菜单不开）。共 19 条。

### 文档

- [README.md](README.md)：功能表删功能 2，改「十一项行为」，锚定版本改 0.2.2-alpha.3，`verify` 表与已知限制跟着改。
- [docs/shared-api.md](docs/shared-api.md)：删 `slot-rows.jsx` 整节，locale 只返回 `{ tCommon, tOwn, dispose }`，句柄删 `contextMenu`。
- [docs/verify.md](docs/verify.md)：端到端一节改为驱动真实例 + fixtures，写明多选断言、右键交还官方、合成 `contextmenu` 的坐标要求、cleanup 在 dispose 之前。
- [docs/feature-6-selection-menu.md](docs/feature-6-selection-menu.md) 与 [docs/feature-4-timestamps.md](docs/feature-4-timestamps.md)：指向功能 1、2 的链接与「侧栏行归功能 2」的表述改为官方菜单。

## 官方功能重叠审计（静态阅读打包产物，未运行时验证）

功能编号沿用 README（1、4–13；没有功能 3 与 14）。

| 功能 | 官方现状 | 证据 | 结论 |
| --- | --- | --- | --- |
| 1 `ctrl`/`cmd` 多选 | 无 | `dsh-client-ui-workspace/lib/client.js:2577` 唯一修饰键判断是 `if (event.altKey\|\|event.ctrlKey\|\|event.metaKey\|\|event.shiftKey) return;`，无选择集 | 增量，保留 |
| 2 侧栏右键菜单 | 已有 | 工作区 2230 / 会话 2529 的 `getTriggerProps`；`workspace.rename` 5956、`workspace.delete` 5969；`registerSessionMenus` 4328 | 单选部分完全重复，已删；「工作区新会话」与多选批量删除随捕获阶段监听一起消失 |
| 4 逐行时间戳 | 部分 | `dsh-client-ui-chat/lib/client.js:5895` `formatMessageClock`（HH:mm）；用户行 `clock:"start"` 6214/6255/6283，助手收尾 `clock:"end"` 9049 | 官方只有消息级、分钟精度、非末条用户行 hover 才显；逐节点秒级仍是增量，但与官方 HH:mm 并存 |
| 5 活跃标记配色 | 部分（换视觉） | 同一 spinner；`index-lh_YM6sT.css` 的 `._spinnerTrack_1i3xo_47{opacity:.25}`，`[data-state=done]` 才有专属色，ongoing 无 | 同一元素改配色，属视觉覆盖 |
| 6 选中文本右键菜单 | 无（仅扩展点） | chat `client.js:862` 的 `useTextInteraction` 接管 `[data-text-interaction-source]` 的 contextmenu 并 `dispatch("selection")`；3683 渲染 `conversation.chat.text-interaction`，无内置消费者 | 增量；官方有 slot 但没复制/粘贴项 |
| 7 思考区限高 | 已有（阈值不同） | chat `client.js:4793` `ChatGroupSeat.module.css` 的 `max-height:min(400px,50vh);overflow-y:auto` | 同一手法另一阈值（插件 60vh） |
| 8 设置高级配置 | 部分 | `dsh-config-editor/lib/index.js:24` `documentPath=profileContext.patchPath`，71/75/124 的 `edit()` 内 `reconcileProfilePatches`；设置页等价入口 `settings-general/lib/client.js:771` `openDocument` | host 半边重复；内联精选面板是增量 |
| 9 ↑↓ 历史输入 | 无 | `dsh-client-ui-chat/lib/client.js:4686` 的 `SCROLL_KEYS` 只在滚动里用 ArrowUp；会话里的 ArrowUp 属 Lexical | 增量 |
| 10 会话行状态 | 已有 | workspace `client.js:2379` `SessionStatusDots`→`StateDot`，2364 `label:t("status.running")`；2452/2563 `aria-selected` | 官方已有状态点与选中态，插件是换视觉 |
| 11 `Ctrl+F` 查找 | 无 | workspace `client.js:166` 的 `"KeyF",["primary","alt"]` 是 `Ctrl/Cmd+Alt+F` 分叉会话；无 find bar | 增量；注意不是 Ctrl+F |
| 12 厂商分组标题 | 已有（区分带无） | `dsh-client-ui-model-selection/lib/client.js:1632` `MenuGroup{label:provider.name}`，CSS `._heading_121p8_19{position:sticky;top:0;…}`、`[data-stuck]{background:var(--dsw-alias-menu-group-header-fill)}` | 官方已有吸顶标题；插件只加底色与横线 |
| 13 自动加载更早 | 无（仅手动按钮） | chat `client.js:3658` `loadingOlder ? t("loading") : t("chat.loadOlder")`；60 个 client bundle 里 `IntersectionObserver` 计数 0 | 增量，依赖官方按钮 |

## 验证结果（真实运行输出）

- `node scripts/check-catalog-schema.mjs`：**PASS 全部字段与上游 schema 一致**（`dsh=0.2.2-alpha.3`、`profile=web`，19 卡 / 83 字段）。日志 `tmp/adapt-a3/catalog.log`。
- `node --test tests/*.test.mjs`：**tests 46 / pass 46 / fail 0**。日志 `tmp/adapt-a3/tests.log`。
- 构建：`DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/build.mjs` → `lib/client.js + lib/index.js built`。
- **十套 live 在同一 bash 调用里起栈后串行跑，合计 197 条，全部 `failed=0 skipped=0`、退出码 0**（`tmp/adapt-a3/run-suite.sh`，日志 `tmp/adapt-a3/`）：

| 套件 | 末行 summary |
| --- | --- |
| `verify:timestamps` | `passed=10 failed=0 skipped=0 total=10` |
| `verify:dot` | `passed=21 failed=0 skipped=0 total=21` |
| `verify:selection` | `passed=18 failed=0 skipped=0 total=18` |
| `verify:chat-history` | `passed=16 failed=0 skipped=0 total=16` |
| `verify:find` | `passed=19 failed=0 skipped=0 total=19` |
| `verify:row-states` | `passed=35 failed=0 skipped=0 total=35` |
| `verify:provider-band` | `passed=29 failed=0 skipped=0 total=29` |
| `verify:auto-load-older` | `passed=8 failed=0 skipped=0 total=8` |
| `verify`（功能 1 + 右键交还官方） | `passed=9 failed=0 skipped=0 total=9` |
| `verify:settings` | `passed=32 failed=0 skipped=0 total=32` |

关键读数：

- 功能 1 多选：`ctrl` 点击一个工作区行 → `kind='workspace'`、`size=1`、行带 `data-dsh-oi-selected`；同 kind 再点 → `size=2` 且两行同时高亮；换点会话行 → `kind='session'`、`size=1`，旧工作区高亮消失；再点同一会话 → `size=0`；普通点击 → `size=0`。
- 右键交还官方：工作区行、会话行、多选后右键会话行，均 `{defaultPrevented:true, plugin:0, official:1}`；多选后右键选择集仍为 2 项。
- 卸载：`h.dispose()` 后 `styleGone=true`、`handleGone=true`、`highlightsGone=true`，右键仍有官方菜单。
- 功能 6 的 Esc 让位：`[esc-menu] {"inside":true,"prevented":true}`，第一次 Esc 菜单关、查找条留；第二次 Esc 条关。
- 功能 8 真写副本 `cordis.patch.yml` 后自动 `restart` 成功，后续套件照常连上。

## 未做与边界

- 官方功能重叠是**静态阅读打包产物**的结论，没有逐条在运行中的应用上复现；功能 12 的 `MenuGroup` 样式、功能 5 的 spinner 选择器来自压缩产物与调用点推断。
- 没有检查第三方插件是否另外注册了 `text-interaction` 或 `contextMenu` target；测试栈的 `syncHome()` 会剥掉第三方 bundle。
- 没有逐文件对读 alpha.2 → alpha.3 的全部包。本轮的定向读集中在 `dsh-client-ui-workspace`、`dsh-client-ui-context-menu`、`dsh-client-ui-chat`、`dsh-config-editor`、`dsh-client-ui-model-selection` 与 desktop 升级记录。
- 真 home 的 profile 名单缺本插件，本轮按用户决定不改；实际应用当前不会加载本插件。
