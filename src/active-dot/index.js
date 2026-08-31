/**
 * 活跃标记（上游 `StateDot state="ongoing"`）的配色覆盖。
 *
 * 纯样式，无 JS：只改颜色与动画的不透明度档位，几何、`fill: currentColor` 与
 * 1s 周期都留给上游。样式表由 `src/client/index.js` 统一插入与回收，这里只导出
 * 文本。
 *
 * **不明显的根因是不透明度，不是色相**。上游那 8 格的基线是 `opacity: .15`，追
 * 逐动画任一时刻只有 1 格到 1.0，其余 5 格常年停在基线——按 `deepseek-450` 对
 * 深色主题底色算只有 1.21:1（浅色 1.17:1），换成纯白也才 1.61:1。所以基线抬到
 * 0.6 是主要手段，换色是次要的：暗格因此到 4.32:1（深）/ 2.90:1（浅），亮暗之
 * 间仍留 2.3 倍亮度差，动感不被抹平。
 *
 * 换青色是为了避开三个已被占用的语义色：品牌蓝同时是选中态、链接与 focus ring
 * 的颜色，`green-500` 是 done，`amber-500` 是 warning。分深浅两个值是因为单色做
 * 不到两边都亮——亮青在白底上即便 `opacity: 1` 也只有 1.81:1。
 *
 * 覆盖**不限定侧边栏**：同一个 `data-state="ongoing"` 也用在工具行、jobs 与
 * subagent 面板上，它们有同样的 1.2:1 问题，同一语义给同一个颜色。
 */

/**
 * 活跃标记的配色与动画覆盖。
 *
 * 两处写法都在规避上游产物的 hash：class 名（`._cell_10orb_54`）与 keyframes 名
 * （`_dsh-state-dot-chase_10orb_1`）都是构建期哈希出来的，跨版本不稳定，只有
 * `data-state` 是 TSX 里的字面量。所以选择器挂 `data-state`，动画换自己的名字接
 * 管 `animation-name` 而不去覆盖同名 keyframes。
 *
 * 靠特异性赢而不是靠插入顺序：`svg[data-state] rect` 是 (0,1,1)，压过上游那条
 * (0,1,0)。
 */
export const ACTIVE_DOT_CSS = `
svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(21, 94, 117);
}

body[data-ds-dark-theme] svg[data-state='ongoing'] {
  --dsh-state-ongoing: rgb(34, 211, 238);
}

svg[data-state='ongoing'] rect {
  animation-name: dsh-oi-state-dot-chase;
}

@keyframes dsh-oi-state-dot-chase {
  0%, 12.4% { opacity: 1; }
  12.5%, 24.9% { opacity: 0.85; }
  25%, 37.4% { opacity: 0.7; }
  37.5%, 100% { opacity: 0.6; }
}
`
