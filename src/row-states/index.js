/**
 * 功能 10：侧边栏会话行的「选中」与「运行中」状态可视化。
 *
 * 纯样式，无 JS：样式表由 `src/client/index.js` 统一插入与回收，这里只导出文本。
 * 设计稿与 token 表在 [docs/design/session-row-states.html](../../docs/design/session-row-states.html)。
 *
 * **两个状态信号都取自行元素上的字面量属性，不碰 hash 类名**（同
 * {@link file://../active-dot/index.js} 的理由：`_sessionRow_xxx` 前缀逐版本变）。
 * 选中是 `aria-selected="true"`——上游 `SessionRow` 里 `node.id === currentId`
 * 直接写进 DOM 属性；运行中是行内出现 `svg[data-state='ongoing']`（`StateDot`
 * 只在 ongoing 时渲染 svg，done/warning/error 渲染 span）。
 *
 * 现状的根因在产物 CSS 里可查：`.sessionRow.selected` 的背景与 `:hover` 是同一
 * 条规则、同一个 `--dsw-alias-interactive-bg-hover`——选中行和悬停行本来就同色。
 * 所以覆盖必须赢过那条 (0,2,0) 的规则；同特异度下胜负取决于两张表在 head 里的
 * 先后而上游顺序不由插件掌控（同功能 4 的坑），背景色这条用 `!important`。
 *
 * **伪元素与上游拖拽指示器共用行**：`dropBefore:before` / `dropAfter:after` 是
 * 拖拽排序时的插入位置线。竖条走 `::before`、彗尾走 `::after`，两条规则都挂
 * `:not([class*="_drop"])` 让位——拖拽那几秒行上少一条装饰竖条或一圈扫光，
 * 而拖放目标指示（功能性的）永远可见。
 *
 * 彗尾不用设计稿里的辉光子元素：`filter: drop-shadow` 直接挂在伪元素上，光晕
 * 沿同一条轮廓弧走，效果同源且零 DOM 侵入。
 *
 * 运行中边框只在 `statuses[0]` 是 ongoing 时出现：等待审批的会话上游把状态点
 * 换成 warning，行就没有边框——这是跟随上游信号的定义，不是遗漏。
 */

/**
 * 行状态样式表。
 *
 * 层叠契约（改动前必读）：
 *   - 选中底色 `!important`：赢上游 `.sessionRow.selected` 的同特异度规则，理由见
 *     模块头。多选蓝（`MENU_CSS` 的 `[role="treeitem"][data-dsh-oi-selected]`）同为
 *     `!important` 且特异度 (0,2,0)，靠**本表插在 MENU_CSS 之前**让多选赢叠加态——
 *     批量圈选时当前会话显示蓝底（它在选集里）加青色竖条（伪元素不吃背景）。
 *   - 运行中底色不加 `!important`：选择器带 `:has()` 后特异度 (0,2,1)，天然压过
 *     上游 hover/selected 的 (0,2,0)；选中+运行的叠加底色 (0,3,1) 才加 `!important`
 *     （要盖过选中那条的 `.10 !important`）。
 *   - 错峰用 `:nth-child(3n+…)` 负延迟：行在列表里与工作区行、分组标题混排，
 *     取模的基数不是行数而是兄弟序号——这没关系，错峰只要「不同行不同相位」，
 *     不要求相邻。
 */
export const ROW_STATES_CSS = `
@property --dsh-oi-row-sweep {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

[class*="_sessionRow"] {
  --dsh-oi-row-signal: 21 94 117;
}

body[data-ds-dark-theme] [class*="_sessionRow"] {
  --dsh-oi-row-signal: 34 211 238;
}

/* ---- 选中（当前打开的会话）：青色竖条 + 填充 + 标题提权 ---- */
[class*="_sessionRow"][aria-selected="true"] {
  background-color: rgb(var(--dsh-oi-row-signal) / .10) !important;
}

[class*="_sessionRow"][aria-selected="true"]:not([class*="_drop"])::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  bottom: 20%;
  width: 3px;
  border-radius: 0 2px 2px 0;
  background: rgb(var(--dsh-oi-row-signal));
  pointer-events: none;
}

[class*="_sessionRow"][aria-selected="true"] {
  position: relative;
}

[class*="_sessionRow"][aria-selected="true"] [class*="_title"] {
  font-weight: 600;
}

[class*="_sessionRow"][aria-selected="true"] [class*="_time"] {
  color: var(--dsw-alias-label-secondary);
}

/* ---- 运行中：常亮静默底边 + 彗尾沿轮廓扫动 ---- */
[class*="_sessionRow"]:has(svg[data-state='ongoing']) {
  position: relative;
  background-color: rgb(var(--dsh-oi-row-signal) / .10);
  box-shadow: inset 0 0 0 1px rgb(var(--dsh-oi-row-signal) / .15);
}

[class*="_sessionRow"][aria-selected="true"]:has(svg[data-state='ongoing']) {
  background-color: rgb(var(--dsh-oi-row-signal) / .14) !important;
}

[class*="_sessionRow"]:has(svg[data-state='ongoing']):not([class*="_drop"])::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 9px;
  padding: 1px;
  background: conic-gradient(from var(--dsh-oi-row-sweep),
    transparent 0deg 268deg,
    rgb(var(--dsh-oi-row-signal) / .12) 286deg,
    rgb(var(--dsh-oi-row-signal) / .85) 330deg,
    rgb(var(--dsh-oi-row-signal)) 358deg,
    transparent 360deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask-composite: exclude;
  filter: drop-shadow(0 0 5px rgb(var(--dsh-oi-row-signal) / .55));
  animation: dsh-oi-row-sweep 2.4s linear infinite;
  pointer-events: none;
}

[class*="_sessionRow"]:has(svg[data-state='ongoing']):nth-child(3n+2)::after {
  animation-delay: -.8s;
}

[class*="_sessionRow"]:has(svg[data-state='ongoing']):nth-child(3n+3)::after {
  animation-delay: -1.6s;
}

@keyframes dsh-oi-row-sweep {
  to { --dsh-oi-row-sweep: 360deg; }
}

/* 减少动态：彗尾熄灭，静默底边常亮即完成识别（同功能 5 的降级思路）。 */
@media (prefers-reduced-motion: reduce) {
  [class*="_sessionRow"]:has(svg[data-state='ongoing']):not([class*="_drop"])::after {
    display: none;
  }
}
`
