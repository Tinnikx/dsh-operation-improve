# 功能 12：模型下拉里的厂商分组标题区分带

点 composer 上方的「请选择模型」进入模型面板后，`github-copilot` / `trae` 这类**厂商分组标题**要与它下面的模型行一眼分得开。**一行 JS 都不跑**，实现是[那张样式表](../src/client/index.js)里的一段 CSS（[src/provider-heading/index.js](../src/provider-heading/index.js)）。

## 现状的根因

厂商名由上游 `MenuGroup`（`ui-primitives/src/MenuGroup.tsx`）渲染成 `[data-menu-group-heading]`：`11px/16px 500`、`color: var(--dsw-alias-label-tertiary)`、`background: transparent`，**只有被滚动钉住时**（`[data-stuck]`）才吃 `--dsw-alias-menu-group-header-fill`。

而**模型行常态也不上色**（`ModelSelect.module.css` 的 `.option` 是 `background: transparent`，只有 hover 与选中态才给底色），于是常态下这一行与下面的模型行在底色上**按构造就没有差别**——两侧都是透明。区分只剩 11px 小灰字与 13px 正文这一档字级差。本插件此前一条规则都没碰它。

```css
section[data-menu-group]:has(> [role="menuitemradio"]) > [data-menu-group-heading] {
  border-radius: 0;
  background-color: color-mix(in srgb, var(--dsw-alias-menu-group-header-fill) 60%, var(--dsw-alias-bg-base));
  background-image: linear-gradient(to bottom, transparent 0 calc(100% - 1px),
    color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent) calc(100% - 1px));
}
```

## 承重信号是那条横线，不是填充

菜单底是**半透明**的（深色 `rgba(67,69,74,.45)` 叠在毛玻璃上），任何不透明填充的对比度都被自己的 alpha 拉回「接近底」的亮度区间。下表是**候选筛选**用的读数（屏幕像素，主导桶均值）——**它们不能当判据**，理由紧接着一节：

| 填充 | 深色 带/底 | 浅色 带/底 |
| --- | --- | --- |
| 无（两侧都透明） | 1.00 | 1.00 |
| `--dsw-alias-menu-group-header-fill` 原件 | 1.08 | 1.05 |
| 它混 34% `--dsw-alias-bg-base` | 1.23 | 1.07 |
| 它混 60% `--dsw-alias-bg-base`（**采用**） | **1.25** | **1.07** |
| `--dsw-alias-bg-base` 原件（最亮） | 1.51 | 1.11 |
| `--dsw-alias-bg-module-platform` / `--dsw-alias-bg-multi-select` | 1.00 / 1.33 | 1.03 / 1.03 |

**浅色档的填充存在物理上限**：浅色菜单底实测 `rgb(242,243,243)`，往亮走封顶 1.11（纯白也才 1.11）；要过 1.15 只能往暗走，而那会把 11px 标题文字对底从 3.34 压到 2.7 以下，跌穿可读门槛。深色底 `rgb(53,54,58)` 离纯黑很远，往暗走空间充裕。

所以两档的承重信号都落在那条 1px 横线上——实测「横线对带」浅 4.15 / 深 5.42，强度取 `--dsw-alias-label-primary` 兑 55% 透明（40% 只有 2.57/3.23，70% 到 6.63/6.57 会与模型行的选中底色抢注意力）。

## 「带 vs 底」这个比值本身不可用

上表那些对比度是**候选筛选**用的，不能当判据。菜单卡片是 ~45% 半透明叠毛玻璃，**底的颜色随背后内容逐段漂移**：实测同一张深色卡片沿纵列从 `rgb(38,39,42)` 漂到 `rgb(56,58,62)`（约 18 级）。而填充自身的屏幕贡献只有 4~5 级（浅色档 0~1 级）——用一个跑几十级的基准去除一个几级的信号，量出来的比值只反映取样点撞在哪。

这与[功能 10](feature-10-row-states.md) 在第三方纹理主题上踩的坑同源：**底不是一个颜色时，「对底对比度」就不是一个有意义的数**。

正确的问法是**同位 A/B**：同一位置截两次，中间只把这一层填充关掉，差值即它的真实贡献（基准与被测点同 y，漂移项对消）。实测：

| 档 | 开着 | 关掉 | 差 |
| --- | --- | --- | --- |
| 深色 | `rgb(44,44,49)` | `rgb(48,49,53)` | **`-4,-5,-4`**（可见） |
| 浅色 | `rgb(245,245,246)` | `rgb(245,246,246)` | `0,-1,0`（几乎为零） |

前提是同一现场连拍逐像素稳定——实测 0/93744 个采样点变化（`screenshots are reproducible` 那条断言钉的就是它）。不先证这一点，量到的差可能只是渲染抖动。

**浅色档的填充就是这样：屏幕上几乎看不见**，它的区分完全靠那条横线。这是经用户确认后的取舍（另一条路是往暗调填充，代价是文字对底跌到 2.7 以下），不是配方没调好。

## 四条不能随手改的

1. **选择器带 `:has(> [role="menuitemradio"])`**。同一个 `MenuGroup` 还被 `ui-commands` 的 `popupSelect` 外壳（斜杠命令面板）用着，那里的行是 `role="option"`——不加这个限定，斜杠命令面板会一起变色。它顺带把特异性抬到 (0,3,1)，稳过上游那条 `html:not([data-platform='darwin']) .heading` 的 (0,2,1)：实测标题 `border-radius` 从上游的 `12px` 变 `0px`。

2. **横线走 `background-image` 而不是 `border-bottom`**。标题高度由上游的 `padding` 决定；加边框会把那一行顶高 1px，整张列表跟着抖。实测标题高度加规则前后都是 `22px`。

3. **钉住态必须显式补一条更专的规则**。上游 `[data-stuck]` 那条用的是 `background` **简写**，会连 `background-image` 一起重置；而常态那条特异性 (0,3,1) 高于它的 (0,2,0)，于是只要不加处理，**上游原本的吸顶提示会被常态规则整条盖掉**——滚到顶时标题底色不再变化，而横线也被抹掉。补的那条只改 `background-color`，两种状态下横线都在：

   ```css
   section[data-menu-group]:has(> [role="menuitemradio"]) > [data-menu-group-heading][data-stuck] {
     background-color: var(--dsw-alias-menu-group-header-fill);
   }
   ```

4. **不加 `margin-inline: -4px`**。想铺满卡片得吃卡片那 4px 内边距，但卡片右侧为滚动条另留了 5px 槽——实测加了之后左侧贴齐、右侧仍差 5px，色块左右不对称。不加负边距时色块与模型行**逐像素等宽**（左差 0、右差 0），文字位置也一个像素不动。

## 已知限制

1. **浅色档的填充在屏幕上几乎不可见**（同位 A/B 实测差 0~1 级），该档的区分**完全靠那条横线**。深色档两样都有。
2. **依赖卡片内边距与模型行的几何**。判据钉的是「色块与模型行的左右边缘各差 ≤0.6px」，上游改卡片 padding 或行内缩进就会红。
3. **只覆盖模型下拉**。上游 `MenuGroup` 的另一处使用者（斜杠命令面板，行是 `role="option"`）刻意不动；那里将来若要同样处理，得各自决定。
4. **`data-stuck` 是上游的字面量属性**，跨版本稳定，但它属于「钉住」这套 JS 观察机制（`observeStickyMenuGroups`）——上游换掉那套机制时本条静默失效。
5. **判据依赖同位 A/B**：填充贡献那两条要截两次图并切换一次样式，比其他断言慢（每档多两次截图 + 一次 600ms 稳定性连拍）。

## 与上游的关系

不改上游源码。锚点 `[data-menu-group]` / `[data-menu-group-heading]` / `[data-stuck]` 全是 `MenuGroup.tsx` 与 `MenuSurface` 里的字面量属性，不用构建期哈希类名。上游给同类信息发的那枚 token（`--dsw-alias-menu-group-header-fill`）被复用了两次：常态兑淡后当填充、钉住态原样吃——语义同源，只改观感强度。
