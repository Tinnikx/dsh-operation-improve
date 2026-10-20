# 025 模型下拉里的厂商分组标题加区分带

- 目标：点输入框上方「请选择模型」进入模型面板后，`github-copilot` / `trae` 这类**厂商分组标题**要与下面的模型行一眼分得开。验收方式：`npm run verify:provider-band` 29/29 全绿（含浅/深两档读数），且把 `BAND_FILL` / `BAND_RULE` 改成 `transparent` 后它会红。
- 范围：新增 [src/provider-heading/index.js](../../src/provider-heading/index.js) 与其样式表槽位，加上验证脚本、文档、README。不动上游 `ui-model-selection` / `ui-primitives` 源码，不动同组件在斜杠命令面板里的表现，不动模型行、搜索框、菜单卡片本身。

## 现状与形状

上游把厂商标题渲染成 `MenuGroup` 的 `[data-menu-group-heading]`（`ui-primitives/src/MenuGroup.tsx`）：`11px/16px 500`、`color: var(--dsw-alias-label-tertiary)`、`background: transparent`，仅在被滚动钉住时（`[data-stuck]`）才吃 `--dsw-alias-menu-group-header-fill`。模型行常态也是透明的（`ModelSelect.module.css` 的 `.option`），所以两侧底色**按构造就相同**，区分只剩字级。**本插件此前一条规则都没碰它。**

形状由用户拍板：**整体色块 + 底部 1px 横线**。填充只做氛围（半透明菜单底把它压在 1.07~1.25），承重信号是那条 1px 横线（实测 4.15 / 5.42）。

## 进展

- **落点取证**：`MenuGroup` 只有两处使用——`ui-model-selection/.../ModelSelect.tsx`（模型下拉，行是 `[role="menuitemradio"]`）与 `ui-commands/.../PopupSelectView.tsx`（`popupSelect` 外壳，行是 `[role="option"]`）。斜杠命令面板走 `ui-input-trigger/MenuView.tsx` 的 `role="listbox"`，**不用** `MenuGroup`。因此选择器带 `> [role="menuitemradio"]` 限定，规则只命中模型下拉；合成探针实测该限定成立（option 那组底色仍 `rgba(0,0,0,0)`、无 gradient）。
- **填充取值**：`color-mix(in srgb, var(--dsw-alias-menu-group-header-fill) 60%, var(--dsw-alias-bg-base))`。上游同名 token 语义同源（浅 `rgba(248,249,250,.94)` / 深 `rgba(48,49,54,.94)`），兑 60% 页面底色是留出与钉住态的级差。
- **横线强度**：`color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent)`，实测「横线对带」浅 4.15 / 深 5.42。40% 只有 2.57/3.23，70%（6.63/6.57）会与该面板里模型行的选中底色抢注意力。
- **两档主题都测**：浅档靠摘 `data-ds-dark-theme` 造，跨 `Page.captureScreenshot` 往返会被应用写回，脚本挂 `MutationObserver` 把每次写回立刻翻回来（同功能 10 的守卫机制）。
- **判据改成「同位 A/B」**：第一版拿「带 vs 底」比值当判据，被实测否掉——底自己沿纵列漂 18 级（深色 `rgb(38,39,42)` → `rgb(56,58,62)`），而填充贡献只有 4~5 级。改成同位置截两次、只关填充，差值就是真实贡献（深 `−4/−5/−4`、浅 `0/−1/0`）。

## 决策与理由

1. **不加负边距，色块与模型行同宽**：曾试 `margin-inline: -4px` 想铺满卡片，实测只抵消得了左侧——卡片右侧为滚动条另留 5px 槽，`rightGap` 仍剩 5px，色块左右不对称。不加时与模型行逐像素等宽（左差 0、右差 0），文字位置不动。
2. **抹平圆角**：上游有 `html:not([data-platform='darwin']) .heading { border-radius: var(--dsw-radius-md) }` 的 (0,2,1)，不压过它色块就是一枚飘在菜单里的圆角药丸。本规则写成 (0,3,1) 的 `section[data-menu-group]:has(> [role="menuitemradio"]) > [data-menu-group-heading]`——实测 `12px → 0px`。
3. **钉住态显式补一条更专的规则**：上游 `[data-stuck]` 那条用 `background` **简写**，会重置 `background-image`；而常态规则特异性更高，不补就会把上游的吸顶提示整条盖掉、横线一起没。补的那条只改 `background-color`，两种状态下横线都在。
4. **只做色块 + 横线，不改字色字号**：11px 标题 / 13px 行是上游的视觉语法，本仓库既定约束是「配色字号行距内边距留给上游」。
5. **浅色档接受「靠横线」**：浅色填充在屏幕上几乎不可见（同位 A/B 差 0~1 级），是物理上限（往亮走封顶 1.11，往暗走会把文字对底压到 2.7 以下）。经用户确认，不走「往暗调填充」那条路。

## 测试 cases

验收命令与实测读数（同一测试栈、同一构建）：

- `npm run verify:provider-band` → **29/29，failed=0 skipped=0**。两档读数：填充的同位 A/B 贡献 深 `−4/−5/−4`、浅 `0/−1/0`；横线对带 深 5.42× / 浅 4.15×；文字对带 深 7.06× / 浅 3.58×；带平色性 96.3% / 96.6%；同位连拍稳定性 0/93744 采样点变化。
- 回归：`verify:row-states` 35/35、`verify:timestamps` 10/10、`verify:dot` 21/21、`verify:selection` 20/20、`verify:chat-history` 16/16、`verify:find` 19/19、`npm test` 46/46、`check:catalog` PASS（0.2.1-rc.2，19 卡 / 83 字段）。
- 判据会红的证法：把 `BAND_FILL` 与 `BAND_RULE` 都改成 `transparent` → 7 条 FAIL。
- 选择器边界的证法：合成两组同结构分组（`role="menuitemradio"` vs `role="option"`），前者有填充+横线、后者底色仍 `rgba(0,0,0,0)` 且无 gradient。

## 未完成项与下一步

- **等用户确认观感**（截图 `tmp/provider-band-{dark,light}-{rest,stuck}.png`）后才把索引行改为「完成」。
- 浅色档若日后要更强的区分，只能是改形状（加粗/双横线），不是调填充——浅色填充已在物理上限。

## 坑

- **「带 vs 底」这个比值不能用，第一版就栽在这里**。菜单卡片 ~45% 半透明叠毛玻璃，底随背后内容逐段漂移：实测同一张深色卡片沿纵列从 `rgb(38,39,42)` 漂到 `rgb(56,58,62)`（约 18 级），而填充贡献只有 4~5 级（浅色 0~1 级）。拿跑几十级的基准去除几级的信号，量出来的数只反映取样点撞在哪。正解是**同位 A/B**：同一位置截两次、中间只关掉这一层填充。
- **取样带的 y 不能取卡片顶边**。模型面板卡片顶部是搜索框（实测占 y+4..y+28、宽 240），取 `card.y+1` 读到的是搜索框的底，基准被抬高一档 → 判据假红。取标题正上方那一行（夹在搜索框与标题之间、同列同材质）。
- **卡片不能用 `document.querySelector('[data-menu-material]')` 取第一张**。页面上任何别的浮层开着都会先被选中，clip 就按错的卡片裁，标题整个落在截图外——采样桶为空，判据崩在解码那一步（`Cannot read properties of null (reading 's')`）。取 `heading.closest('[data-menu-material]')`。顺带把「桶为空」改成显式 `decodeFailed`，而不是让它静默返回 0 造出一组自洽的假读数。
- **上游 `[data-stuck]` 那条用的是 `background` 简写**，会连 `background-image` 一起重置；而常态那条特异性更高，不补一条更专的规则就会把上游的吸顶提示整条盖掉、横线一起没。
- **横线的同源比对要认两种颜色写法**：Chromium 把 `color-mix()` 算成 `color(srgb r g b / a)` 而不是 `rgb()`。只认 `rgb()` 会抓到 gradient 最前面那档全透明的 stop，判据恒红（报「横线是全透明的」，而屏幕上横线明明在）。
- **模板字符串里的注释不能写反引号**：`sample()` 的页面侧源码是一段模板字符串，我在其中的 `//` 注释里写了 `` `sr.y + 1` ``，直接把模板字符串提前闭合，脚本以 `SyntaxError: missing ) after argument list` 起不来。
- **`verify`（功能 1、2）的既有不稳定与本条无关，但会干扰判断**：同一产物连跑会间歇性红 1~3 条（「置顶会话」项缺失、批量删除、批量右键）。A/B 已证：换回改动前的 `lib/client.js` 连跑 6 次同样红 6 次，失败条目逐字相同。另：沙箱里跑它必须给 `TMPDIR`（沙箱每条 bash 调用一张独立 `/tmp`，脚本建的靶子目录与 harness 的 `realpath` 对不上会直接 abort）。
