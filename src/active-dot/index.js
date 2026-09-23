/**
 * 活跃标记（上游 `StateDot state="ongoing"`）的配色覆盖。
 *
 * 纯样式，无 JS：只改颜色与静默底环的不透明度，几何、节奏与弧线动画都留给上游。
 * 样式表由 `src/client/index.js` 统一插入与回收，这里只导出文本。
 *
 * 上游的 ongoing 是一枚旋转弧线 spinner：`svg[data-state='ongoing']` 里一个静默底环
 * （第一个 `circle`，`opacity: .25`）拖着一条 1.5s 旋转的亮弧（第二个 `circle`，
 * 不透明度 1），整体颜色绑 `--dsw-alias-label-tertiary`——中性灰，底环在深色名义底
 * 上实测只有 2.3:1。**不明显的根因是不透明度，不是色相**，所以底环抬到 `.6` 是
 * 主要手段，换色是次要的：亮弧与底环之间仍留 1.6 倍差，旋转动感不被抹平。
 *
 * 换青色是为了避开三个已被占用的语义色：品牌蓝同时是选中态、链接与 focus ring 的
 * 颜色，`green-500` 是 done，`amber-500` 是 warning。分深浅两个值是因为单色做不到
 * 两边都亮——亮青在白底上即便 `opacity: 1` 也只有 1.81:1。
 *
 * 覆盖**不限定侧边栏**：同一个 `data-state="ongoing"` 也用在工具行、jobs 与 subagent
 * 面板上，它们有同样的对比度问题，同一语义给同一个颜色。
 */

/**
 * 活跃标记的配色与底环覆盖。
 *
 * 选择器只挂 `data-state` 与元素结构：class 名是构建期哈希，跨版本不稳定；
 * `data-state` 与 DOM 顺序（底环在前、亮弧在后）是 TSX 里的字面量。
 *
 * 靠特异性赢而不是靠插入顺序：`svg[data-state]` 是 (0,1,1)，压过上游 `.spinner` 的
 * (0,1,0)；`circle:first-of-type` 再叠一层，压过 `.spinnerTrack`。
 */
export const ACTIVE_DOT_CSS = `
svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(21, 94, 117);
  color: var(--dsh-state-ongoing);
}

body[data-ds-dark-theme] svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(34, 211, 238);
}

svg[data-state='ongoing'] circle:first-of-type {
  opacity: 0.6;
}
`
