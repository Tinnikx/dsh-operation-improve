# 019 多选高亮重做：描边 + 主题感知填充

- 目标：多选状态在**任何主题、任何明暗档**下都能一眼看出哪些行被选中。用户选定方案 A（描边 + 淡填充），附加硬要求「在不同颜色的主题下都能清晰可见」——这条约束直接决定了强调色取自主题 token 而非硬编码，且强制描边必须是实色。
- 范围：改多选高亮这一处 CSS 与它的验证断言。不动多选行为、选择集、右键菜单、功能 10 的选中与运行中语义。不加计数徽章、不加复选框。
- 状态：**已完成**（用户在真实应用里看过观感并确认；色相不与功能 10 统一，用户明确表示不用改）。

## 进展

### 现状的根因（已实测）

多选高亮此前只有一个通道在说话，且那个通道的值就是侧边栏底色本身：

- `src/shared/context-menu.js` 的多选规则读 `var(--dsw-alias-bg-multi-select, rgba(77, 107, 254, 0.22))`。上游这枚 token **真实存在**，值是中性灰（浅色 `#f5f6f7`、深色 `#2c2c2e`），侧边栏底色是（浅色 `#f9fafb`、深色 `#1b1b1c`）——`var()` 命中就不走 fallback，那支蓝色从未生效。
- 测试栈实测合成后与侧边栏底色的对比度：**1.071×**（对比度 1.0 即完全同色）。同组对照：hover 1.255×、按下 1.536×。三档挤在 1.07~1.54 的灰阶里，肉眼不可辨。
- 上游 `.sessionRow:hover` 与 `.sessionRow.selected` 是**同一条规则、同一枚 token**（`--dsw-alias-interactive-bg-hover`），所以侧边栏原生不用底色区分状态；功能 10 已改用青色竖条绕开，多选却只有底色。
- 实测确认除底色外没有任何第二通道：`boxShadow: none`、`borderTopWidth: 0`、`outlineStyle: none`，且多选规则把上游 `--dsw-radius-md`（12px）覆盖成 6px，圆角差异属形状噪声不构成识别信号。

### 事实核查

- 真实侧边栏行**全部带 `role="treeitem"`**（实测 11/11），选择器命中无问题。
- 上游产物里 `treeitem` 只出现在一条 CSS 选择器（`.searchTree>[role=treeitem]+[role=treeitem]`）中，`role:"treeitem"` 字面量 3 处。搜索结果行的角色未取得实机证据（测试 home 里打不开搜索面板，探针读到的输入框与搜索按钮均为 0 个），**保持选择器现状不动**，不扩大改动面。

### 落地后的形状

```css
[role="treeitem"][data-dsh-oi-selected] {
  --dsh-oi-multi-accent: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4176e6);
  --dsh-oi-multi-outline: color-mix(in srgb, var(--dsh-oi-multi-accent) 70%, var(--dsw-alias-label-primary, #0f1115));
  background: color-mix(in srgb, var(--dsh-oi-multi-accent) 24%, transparent) !important;
  box-shadow: inset 0 0 0 1px var(--dsh-oi-multi-outline);
}
```

描边用 `box-shadow` 而不用 `border`：行高由上游定死（会话行 32px、工作区行 34px），`border` 要么撑高要么触发重排，`inset` 阴影不动盒模型。填充保留 `!important`，赢上游 `:hover` / `.selected` 那条同特异度规则。

最后一条 `:has(svg[data-state='ongoing'])` 的多选描边规则不是装饰：功能 10 运行中那条 (0,2,1) 的静默底边会整圈盖掉 (0,2,0) 的描边，这条 (0,3,1) 的规则把描边取回来，两者叠成「描边 + 内侧信号色底边」。

## 决策与理由

**描边是承重信号，填充只是氛围。** 底色填充无论调到多深，与相邻底色的对比度天花板都在 ~1.2~1.4×（实测矩阵：强调色 14%~24% 填充 vs 普通行底色 1.18~1.41×）——填充永远不足以单独承担识别。描边用实色强调色才有 3~5× 量级。

**强调色取主题的 `--dsw-alias-brand-primary-new-colorprimary-new-color`**，不绑 `bg-multi-select`（它是灰）、不硬编码蓝。实测解析值浅色 `rgb(65,118,230)`、深色 `rgb(86,134,254)`，两档对侧边栏底色分别是 4.05× / 5.11×，过 WCAG 非文本 3:1。

**描边色再向文字色混 30%，把主题换色时的最坏情形兜住。** 主题可提供任意强调色（含 red-400 / green-500 / amber-500 这类状态色，以及与侧边栏同族的浅蓝）。纯色描边在浅色档遇到浅强调色会掉到 1.25×（`deepseek-200`）；向 `--dsw-alias-label-primary` 混 30% 后，最差情形升到 2.42×，主流强调色全在 3.7× 以上。混色比例 0.7 是实测扫描的拐点（0.6 起最差才过 3:1，但 0.6 会让深色档的强调色偏灰、失去「蓝」的语义；0.7 兼顾可辨与色相）。

**圆角不再覆盖，改回上游 `--dsw-radius-md`。** 此前硬写 6px 会让多选行的圆角与普通行不一致，是纯噪声且与功能 10 的 9px 描边圆角不自洽。

## 测试cases

全部实跑结果（`0.1.7-alpha.2` 测试栈，深浅两档主题都在断言里）：

| 套件 | 结果 | 与本次改动的相关性 |
| --- | --- | --- |
| `npm test` | pass 46 / fail 0 | 无测试引用 MENU_CSS，不触 |
| `npm run verify:row-states` | passed=31 failed=0 | 新增 6 条双主题可辨性断言，替换 1 条多选底色别名断言 |
| `npm run verify` | passed=30 failed=0 | 功能 1、2 端到端 |
| `npm run verify:selection` | passed=20 failed=0 | 功能 1、2 本体 |
| `npm run verify:timestamps` / `verify:dot` / `verify:settings` / `verify:chat-history` | 10 / 21 / 26 / 16 全绿 | 共享 MENU_CSS 的回归面 |
| `npm run verify:find` | ABORT | **既有环境性 abort，非本次回归**：已 `git stash` 掉改动重跑，报同一句话——需要一个带折叠过程块的会话 |

新增断言（每档主题各三条，`legible()` 一次算完返回六项读数）：

| 量 | 判据 | 实测 浅 / 深 |
| --- | --- | --- |
| 描边 vs 侧边栏底色 | ≥ 3:1 | 6.52× / 7.47× |
| 描边 vs 描边内侧填充 | ≥ 3:1 | 4.85× / 5.28× |
| 填充 vs 普通行底色 | ≥ 1.15× | 1.34× / 1.41× |

对比度是从侧边栏底到多选底 1.071× 起跳的——同一块地方，提高约 6~7 倍。

## 未完成项与下一步

- 视觉截图未做：模型不声明 image input（`read_image` 报 `model "space-bunny-free" does not declare image input`），观感由 computed 值与对比度数字间接判断，用户已在真实应用里核对确认。
- `verify:find` 那条 abort 若要继续追（造一个带折叠过程块的会话进测试 home），属独立于本次改动的问题。

## 坑

- **`var()` 有 fallback 不等于会走 fallback**：上游 `--dsw-alias-bg-multi-select` 存在，插件那支 `rgba(77,107,254,.22)` 蓝色因此从未生效。改配色前先确认 token 是否真实存在，否则会在错的基线上调参。
- **`--dsw-alias-bg-multi-select` 不是「多选蓝」**，它是中性灰，名字有误导性。任何按名字推断它颜色的读法都会错。
- **测试栈的进程活不过一次 bash 调用**：`stack up` 起的 harness 与 Chrome 会在该调用结束后被杀，必须 `up` 与验证脚本写在同一条命令里连着跑，否则报 `ECONNREFUSED 127.0.0.1:9334`。
- **探针脚本必须 `process.exit(0)`**：常驻 CDP WebSocket 的 node 不会自然退出，会挂到超时。
- **切主题属性（`data-ds-dark-theme`）的摘除、读数、还原必须在同一次 evaluate 内完成**：主题控制器会在下一帧把它写回，跨两次 evaluate 读到的是深色值。还原只写回自己摘掉的那一样。
- **多选规则与功能 10 的选中底色同为特异度 (0,2,0) 同 `!important`**，胜负只由 `ROW_STATES_CSS` 排在 `MENU_CSS` 之前决定（`src/client/index.js` 的 join 顺序）。改动任一张表的位置都会翻转「当前会话被批量圈选」的归属，`verify-row-states` 有断言守着这条顺序契约。
- **断言代码写在 `evaluate(\`…\`)` 模板串里，反斜杠与反引号各要两层**：`\d` 会被模板串吃掉变成字面字母 `d`（正则只匹得到小数点，`Number('.')` 得 NaN，断言拿到 `null`）；中文注释里一个反引号就截断整个模板串。产品侧的 CSS 注释同理——本轮第一次构建就报 `src/shared/context-menu.js:264:22: ERROR: Expected ";" but found "dsw"`，同一个坑在 handoff 017 已记过一次。跑栈前先 `node --check <file>` 能抓到后一类。
- **不能靠 background-image 叠层再读 `background-color` 来「合成」半透明色**：读到的永远是最底层的底色（第一版断言就是这么算出假读数）。要在页面里按 alpha 手工混 `f.rgb[i]*f.a + s.rgb[i]*(1-f.a)`。
- **`color-mix()` 在 computed value 里是 `color(srgb f f f / a)` 的 0~1 分量**（实测填充 `color(srgb 0.337255 0.52549 0.996078 / 0.24)`），解析器得同时认这一种与 `rgb()/rgba()` 的 0~255 写法；从前者取数字段时不能扫全串，否则 `color(srgb` 里的数字会混进来。
- **`box-shadow` 的颜色分量不能按空白切**：`color(srgb 0.529 0.661 0.992) 0px 0px 0px 1px inset` 内部有空格，按空白切只切得出碎片 `color(srgb`；要按 `0px` / `inset` 这些阴影独有的 token 定位。
- **侧边栏底色不能缓存**：缓存下来的值属于当时那档主题，浅色档会拿浅色描边去对深色底色比，算出 2.53/1.90 的假失败。改成每次调用现读的函数。