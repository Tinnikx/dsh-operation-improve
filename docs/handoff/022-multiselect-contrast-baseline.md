# 022 功能 10 多选对比度判据的现场口径

- 要解决的问题：`verify:row-states` 里四条多选高亮的对比度判据在当前测试栈现场不达阈值（判据 ≥3:1，实测 2.43~2.63），要定一条口径：判据守的是「标准主题上的可辨性」还是「用户实际主题上的可辨性」。三种走法各自要动不同的东西，选哪种归用户定。
- 范围：判据在 [scripts/verify-row-states-live.mjs](../../scripts/verify-row-states-live.mjs)（`多选描边 vs 侧边栏底色` / `多选描边 vs 描边内侧填充` / `多选填充 vs 普通行底色`，深浅两档各一遍）；被测样式在 [src/row-states/index.js](../../src/row-states/index.js) 的 `[role="treeitem"][data-dsh-oi-selected]` 段；现场归置在 [scripts/test-stack.mjs](../../scripts/test-stack.mjs) 的 `syncHome()`。读数表在 [docs/verify.md · 功能 10 的验证](../verify.md#功能-10-的验证)。

## 现场事实（实测，harness 0.2.1-alpha.1）

- 四条红的读数：描边 vs 侧边栏底色（浅色档）2.62、描边 vs 描边内侧填充（深色档）2.63 /（浅色档）2.43、填充 vs 普通行底色（浅色档）1.08。深色档的「描边 vs 侧边栏底色」这条**过**（其余档位仍绿，整套 27/31）。
- 被测样式与[交接 019](./019-multiselect-highlight-outline.md) 收口时逐字相同：那两段规则只是从 `MENU_CSS` 尾部搬进 `ROW_STATES_CSS`（同表内靠「写在后面」赢，跨表顺序的依赖已解除），描边 70% 强调色混 `label-primary`、填充 24% 都没动。
- 变的是现场：真 home 装的 `dsh-any-background` 在副本里是 `0.3.6`（`tmp/dsh-oi-test-home/profiles/web/package.json` 的 `dependencies` 与 `dsh.profile.bundles` 两处都在列）。harness 的兼容性预检决定它加载与否——0.1.7-rc.2 那轮 `0.3.1` 被否决（[交接 015](./015-harness-0.1.7-rc.2-adaptation.md) 记了这次），0.2.1-alpha.1 上 `0.3.6` 放行。
- 放行后的现场读数：页面主题是它的 `custom-color`（`services.theme.getTheme()` 的 `preference` 与 `active.id` 都是这一串），侧边栏底 `hsl(40,34%,31%)`、浅档那层是 `rgba(106,88,52,0.49)` 的半透明；`body` 上挂着 81 条 `!important` 的 token 覆盖；`body[data-ds-dark-theme]` 每帧被它写回深色（实测摘掉属性后 700ms 内写回 47 次）。
- `--dsw-alias-border-l3` 在这份现场里深浅两档恒读同一个 `rgba(255,255,255,0.16)`，`theme.overrideTokens` 也压不过那些 `!important`（实测覆盖后读数一个都不变）——所以这两样都不能当「档位杠杆在动」的证据，能用的是 `[data-menu-material]` 上的 `--dsw-elevation-stroke-color`（实测深色 `rgba(255,255,255,0.16)` / 浅色 `rgba(255,255,255,0.2)`）。

## 三种走法与各自代价

1. **归置现场**：`syncHome()` 在副本里剥掉 `dsh-any-background`（那里已有剥托管区段与手写 `bash-sandbox` 项的先例），读数回到 019 的基线。代价：从此没有任何断言守着「用户实际主题下的可辨性」，而他日常那个 harness 装的就是这个插件。
2. **改 CSS**：让描边在任意底色上都过 3:1（按底色亮度在深/浅两枚描边里挑，或加一层垫圈）。这是功能 10 的活，要重做观感验收，超出 021 的范围。
3. **重定阈值**：承认这份现场，把 3:1 降到实测能过的数。等于放弃 019 定的 WCAG 非文本 3:1 承诺。

判据的定义域本来是哪一个，[docs/verify.md 的功能 5 那一节](../verify.md#功能-5-的验证)有同类的既有做法可参考：功能 5 的对比度是探针自带名义底色测的，「量的是这个配色在标准主题底色上有多少对比度，与用户装了什么主题无关」。

## 未验证

- 没在「预检否决该插件」的栈上重跑过这套件，也就是没有直接对照证明 019 的读数一定是在标准主题下量到的（依据只有交接 015 那句「rc.2 起不再加载，页面回落到标准主题」）。
- 真桌面 Electron 客户端上的多选观感从没测过（八套 live 全打 web 测试栈）。
