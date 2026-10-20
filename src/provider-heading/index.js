/**
 * 模型下拉里的厂商分组标题：常态下的区分带。
 *
 * 纯样式，无 JS：样式表由 `src/client/index.js` 统一插入与回收，这里只导出文本。
 *
 * 上游 `MenuGroup`（`ui-primitives/src/MenuGroup.tsx`）把厂商名渲染成
 * `[data-menu-group-heading]`：`11px/16px 500`、`color: var(--dsw-alias-label-tertiary)`、
 * 底色透明，**只有被滚动钉住时**（`[data-stuck]`）才吃
 * `--dsw-alias-menu-group-header-fill`。而模型行常态也不上色（只有 hover / 选中才有底），
 * 所以这一行与下面的模型行在底色上没有任何差别，只靠 11px 小字与 13px 正文这一档字级区分。
 *
 * 本段把区分**常态化**：一条贯通的淡色带 + 底部 1px 横线。**承重的是那条横线**（实测
 * 「横线对带」浅 4.15 / 深 5.42）；填充只做氛围——菜单卡片是 ~45% 半透明叠毛玻璃，底
 * 随背后内容逐段漂移，填充自身的屏幕贡献用同位 A/B 量出来只有 4~5 级（浅色档 0~1 级）。
 * 也就是说「带 vs 底」这个比值本身不可信，量填充贡献要关掉它再截同一位置对比（见
 * [docs/feature-12-provider-heading-band.md](../../docs/feature-12-provider-heading-band.md)）。
 *
 * 锚点全部是上游 JSX 里的字面量：`[data-menu-group]` 与 `[data-menu-group-heading]` 是
 * `MenuGroup.tsx` 写死的属性（不用构建期哈希类名，那玩意逐版本变）。
 * `:has(> [role="menuitemradio"])` 把命中范围收在**模型下拉**：同一个 `MenuGroup` 还被
 * `ui-commands` 的 `popupSelect` 外壳（斜杠命令面板）用着，那里的行是 `role="option"`，
 * 不是本次要改的对象。它顺带把特异性抬到 (0,3,1)，稳过上游那条
 * `html:not([data-platform='darwin']) .heading { border-radius: … }` 的 (0,2,1)——同分靠
 * 插入顺序本就赢（插件样式表 append 在上游 link 之后），但钉死比靠顺序可靠。
 *
 * **不给负边距**：色块与模型行同宽即可（上游钉住时那层底色也是这个几何），文字位置
 * 逐像素不动。想铺满卡片得吃 `margin-inline: -4px`，但那样只抵消得了左侧——卡片右侧
 * 为滚动条留了 5px 槽，实测 rightGap 仍剩 5px，色块会左右不对称。
 */

/** 常态填充：上游那枚「分组标题填充」兑淡到 60%，留出与钉住态的级差。 */
const BAND_FILL = 'color-mix(in srgb, var(--dsw-alias-menu-group-header-fill) 60%, var(--dsw-alias-bg-base))';

/** 底部横线：文字色兑 55% 透明。40% 实测只有 2.6/3.2，70% 会与模型行的选中底色抢注意力。 */
const BAND_RULE = 'color-mix(in srgb, var(--dsw-alias-label-primary) 55%, transparent)';

export const PROVIDER_HEADING_CSS = `
section[data-menu-group]:has(> [role="menuitemradio"]) > [data-menu-group-heading] {
  /* 上游给非 macOS 的那条 border-radius 试图形容这枚标题是"药丸"；常态带要的是通条，
     故抹平圆角。 */
  border-radius: 0;
  background-color: ${BAND_FILL};
  /* 用 background-image 画横线而不是 border-bottom：标题高度由上游的 padding 决定，
     加边框会把那一行顶高 1px，全列表跟着抖。 */
  background-image: linear-gradient(to bottom,
    transparent 0 calc(100% - 1px),
    ${BAND_RULE} calc(100% - 1px));
}

/* 钉住态：上游那条 \`background: var(--dsw-alias-menu-group-header-fill)\` 是**简写**，
   会连 background-image 一起重置。上面那条规则特异性 (0,3,1) 高于它的 (0,2,0)，
   所以只要那枚属性在，上游原本的吸顶提示就被整条盖掉——开一条更专的规则把它取回来，
   并且只改填充：横线在两种状态下都在。 */
section[data-menu-group]:has(> [role="menuitemradio"]) > [data-menu-group-heading][data-stuck] {
  background-color: var(--dsw-alias-menu-group-header-fill);
}
`;
