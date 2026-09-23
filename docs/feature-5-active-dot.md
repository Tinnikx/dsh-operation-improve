# 功能 5：活跃标记配色

侧边栏（以及工具行、jobs、subagent 面板）上表示「这个会话正在跑」的活跃标记，提高它的对比度。**一行 JS 都不跑**，实现是[那张样式表](../src/client/index.js)里的三条规则。

上游的 `StateDot` ongoing 形态是一枚旋转弧线 spinner：`svg[data-state='ongoing']` 里一个 `g`（1.5s 匀速旋转）包两条 `circle`——静默底环（`opacity: .25`）与亮弧（不透明度 1，靠 dash 露出约 72° 的扇区）。整体颜色绑 `--dsw-alias-label-tertiary`（中性灰）。它不明显的根因是**不透明度，不是色相**：底环 .25 的灰压在深色名义底上实测 2.2:1。所以主要手段是把底环抬到 `.6`，换色是次要的；亮暗之间仍留 1.6 倍差，旋转动感不被抹平。

```css
svg[data-state='ongoing']                          { --dsh-state-ongoing: rgb(21, 94, 117); color: var(--dsh-state-ongoing); }
body[data-ds-dark-theme] svg[data-state='ongoing'] { --dsh-state-ongoing: rgb(34, 211, 238); }
svg[data-state='ongoing'] circle:first-of-type     { opacity: 0.6; }
```

四条不能随手改的：

1. **选择器只能挂 `data-state` 与元素结构**。`._spinner_*` / `._spinnerTrack_*` 这类 class 是 CSS Module 构建期哈希出来的，逐版本变；`data-state` 是 TSX 里的字面量，「底环在前、亮弧在后」的 DOM 顺序也是。
2. **不接管动画**。上游的 spin/dash 两条 keyframes 是行为本体，这里只改颜色与底环不透明度——与旧版「换动画名」的做法相反，现在没有任何理由碰 `animation-*`。
3. **靠特异性赢，不靠插入顺序**。`svg[data-state]` 是 (0,1,1)，压过上游 `.spinner` 的 (0,1,0)；`circle:first-of-type` 再叠一层，压过 `.spinnerTrack`。两张样式表在 `head` 里谁先谁后都不影响结果。
4. **深浅两个值不能合成一个**。单色做不到两边都亮——亮青在白底上即便 `opacity: 1` 也只有 1.81:1。

换青色是为了避开三个已被占用的语义色：品牌蓝同时是选中态、链接与 focus ring，`green-500` 是 done，`amber-500` 是 warning。覆盖**不限定侧边栏**：同一个 `data-state="ongoing"` 在别处有同样的低对比问题，同一语义给同一个颜色。

## 实测读数

21 条断言全过时的读数（深色主题）：

| | 覆盖前 | 覆盖后 |
| --- | --- | --- |
| 底环像素 / 对比度 | `rgb(79,79,81)` / **2.23** | `rgb(28,135,152)` / **4.31** |
| 亮弧像素 / 对比度 | —（随旋转漂移，不可定采） | `rgb(34,211,238)` / **10.09** |
| 底环 computed opacity | `0.25` | `0.6` |

浅色主题下底环 `rgb(115,158,172)` / 2.91、亮弧 `rgb(21,94,117)` / 7.27。底环提升 1.93×，亮暗之间仍有 2.34× 的差，旋转的节奏没有被抹平。

## 已知限制

- 覆盖认的是 `svg[data-state='ongoing']` + 「第一个 `circle` 是底环」这个结构。上游再改实现（换标签、调 DOM 顺序、挪 `data-state`），覆盖整条失效且不报错——表现是标记退回基线对比度。`verify:dot` 的反查断言（样式表里找 spinnerTrack/spinnerArc/spinnerMotion 三个类）会先撞上这种改动。
- 对比度是对着**标准主题底色**保证的。装了壁纸主题一类的第三方壁纸底色时，标记压着的是一张照片，实际对比度逐像素变化，插件管不到。
- 深浅两个色值写死在 CSS 里，不跟随上游的调色板 token。上游改了主题底色，这两个值不会自己跟上；表现是对比度偏离设计值，仍然不报错，要靠重跑 `verify:dot` 才看得出。

## 验证

跑法、取样口径与三处坑见[验证 · 功能 5](./verify.md#功能-5-的验证)（`npm run verify:dot`）。
