# 功能 1：侧边栏多选

`src/multi-select/index.js`。选择状态、行识别从[基础层](./shared-api.md)来。

`ctrl`/`cmd` + 点击工作区行或会话行进入多选，限制同级：同一时刻选择集里只有一种 kind，换 kind 时整组重来（不是拒绝混选，也不是两类混选）。

监听挂在侧边栏的**捕获阶段**，要抢在 React 合成事件之前拦下带修饰键的点击。高亮走 `[data-dsh-oi-selected]` 属性——不复用行自己的 `_selected` 类，那是「当前会话」的语义。

侧边栏行的右键菜单由 harness 自带的 `ui-workspace` 提供，本插件不接管 `contextmenu`；多选只保留选中态与计数，不弹批量菜单。

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

## 选择状态

`toggle(kind, id)` 在 kind 与当前不同时**切换**到新 kind 并重置集合；同 kind 下重复点同一行是取消。集合空时 `kind` 回到 `null`。普通点击会清空选择集。语义与单测见 [src/shared/selection-store.js](../src/shared/selection-store.js) 与 [tests/selection-store.test.mjs](../tests/selection-store.test.mjs)。

## 已知限制

- 多选现在只用于高亮与计数，任何批量动作都要走 harness 原生菜单或逐行操作。
- 多选高亮靠 `MutationObserver` 在列表重渲染后重刷，列表极频繁变动时会有一帧的高亮延迟。
- `rowId` 的 fiber 反查失效时功能静默失灵，见[基础层 · 已知限制](./shared-api.md#已知限制)。
