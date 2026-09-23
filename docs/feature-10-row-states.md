# 功能 10：会话行选中态强化 + 运行中光线边框

侧边栏会话行的两个状态可视化：当前打开的会话加青色竖条与填充底，有任务在跑的行加一圈沿轮廓扫动的彗尾边框。**一行 JS 都不跑**，实现是[那张样式表](../src/client/index.js)里的一段 CSS（[src/row-states/index.js](../src/row-states/index.js)）。设计稿与 token 表在 [docs/design/session-row-states.html](design/session-row-states.html)。

选中的根因在产物 CSS 里可查：上游 `.sessionRow.selected` 的背景与 `:hover` 是**同一条规则、同一个 `--dsw-alias-interactive-bg-hover`**——选中行和悬停行本来就同色。运行中的行则只有一个 10px 的追逐点，在长列表里划不出归属。

```css
[class*="_sessionRow"][aria-selected="true"]                { background-color: rgb(var(--sig) / .10) !important; }  /* 竖条走 ::before */
[class*="_sessionRow"]:has(svg[data-state='ongoing'])       { box-shadow: inset 0 0 0 1px rgb(var(--sig) / .15); }  /* 彗尾走 ::after */
```

信号色 `--sig` 深浅两档：`rgb(34 211 238 / 21 94 117)`，与功能 5 的 `--dsh-state-ongoing` 同值——一个色相管「运行」族语义，选中与运行中靠形态（竖条+填充 vs 轮廓扫光）正交区分。

五条不能随手改的：

1. **选择器只挂字面量属性**。选中读 `aria-selected="true"`（上游 `SessionRow` 把 `node.id === currentId` 直接写进 DOM），运行中读行内 `svg[data-state='ongoing']`（`StateDot` 只在 ongoing 时渲染 svg）。hash 类名逐版本变，`data-state` / `aria-selected` 是 TSX 字面量。
2. **伪元素让位给上游拖拽指示器**。`dropBefore:before` / `dropAfter:after` 是拖拽排序的插入位置线；竖条与彗尾的规则都挂 `:not([class*="_drop"])`。拖拽那几秒行上少一条装饰，功能性的指示线永远可见。
3. **背景色那条必须 `!important`**。选中覆盖与上游 `.sessionRow.selected` 同为 (0,2,0)，胜负取决于两张表在 `head` 里的先后，而上游顺序不由插件掌控（同功能 4 的坑）。运行中那条不加：`:has()` 让特异度到 (0,2,1)，天然压过上游。
4. **表内顺序是层叠契约**。`ROW_STATES_CSS` 必须排在 `MENU_CSS` 之前：多选蓝与选中青同特异度同 `!important`，「当前会话被批量圈选」时底色归蓝（+青色竖条保留，伪元素不吃背景）只由这个先后决定。两处写法在 [verify:row-states](#验证) 都有断言守着。
5. **彗尾的相位差用负 `animation-delay`**（`:nth-child(3n+…)` 取模 0 / -0.8s / -1.6s）。多行同步扫动像跑马灯；取模基数是兄弟序号而非行数，错峰只要「不同行不同相位」，不要求相邻。

辉光没有按设计稿做成独立子元素：`filter: drop-shadow` 直接挂在彗尾伪元素上，光晕沿同一条轮廓弧走，效果同源且零 DOM 侵入。

## 实测读数

24 条断言全绿（0.1.7-alpha.2 测试栈，深色主题）的关键观测：选中底色 `rgba(34, 211, 238, 0.1)`、竖条 3px 实色、标题 600；运行中底边 `rgba(34, 211, 238, 0.15) 0px 0px 0px 1px inset`、彗尾 `dsh-oi-row-sweep 2.4s` + mask `exclude` + `drop-shadow(rgba(34, 211, 238, 0.55) 0px 0px 5px)`；错峰 `[0s, -0.8s, -1.6s]`；选中+运行中 `.14`；选中+多选底色归别名解析值（该主题下 `rgb(93, 79, 161)`）且竖条保留；拖拽目标行彗尾 `none`；浅色主题同一次求值内底色 `rgba(21, 94, 117, 0.1)`；reduced-motion 下彗尾 `display: none` 而底边在场。

## 已知限制

- 运行中边框只在 `statuses[0]` 是 ongoing 时出现：等待审批的会话上游把状态点换成 warning，行就没有边框——跟随上游信号的定义，不是遗漏。
- conic-gradient 扫描是重绘不是合成层，仅运行中行参与动画。运行中会话通常个位数；若实测掉帧，降级方案是底边 opacity 呼吸（纯合成属性）。
- 上游把 `aria-selected` 或 `data-state` 挪走、或不再用 svg 渲染 ongoing，对应半边覆盖整条失效且不报错——表现退回改动前的样子，`verify:row-states` 的反查断言会先撞上。
- 浅色主题的两个透明度（.10/.15）取自设计稿，深色主题下逐像素验过对比语义，浅色只验了 computed 值。

## 验证

跑法与断言见 [验证 · 功能 10](./verify.md#功能-10-的验证)（`npm run verify:row-states`）。
