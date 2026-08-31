# 功能 3：对话起点导航列

会话页右侧的对话起点导航列。鼠标贴近右边缘淡入一列刻度，一条 user 消息一个刻度；hover 出摘要 tooltip，点击平滑滚到该起点，滚动时高亮当前所在起点。

`src/start-nav/index.js`

```js
installStartNav({ hotZone?, minAnchors? }) -> { dispose(), snapshot(), refresh() }
collectAnchors(scroller) -> Array<{ element, summary }>
NAV_CSS
```

导航列不在侧边栏，也不用捕获阶段：它挂在 `document.body` 上，数据来自会话页 `[data-conversation-scroll]` 的子树，靠 `MutationObserver` 与滚动容器的 `passive` 滚动监听驱动。

起点来自 DOM 而不是会话快照：导航列住在 overlay 层，够不着 session 域的 `useSession`，而定位本来就要 DOM 锚点，所以两边都走 `[data-conversation-scroll]` 里的 `[class*="_userRow"]`。steering 行复用同一个组件，按 `data-pending-steering` 排除；摘要取 `[class*="_bubble"]` 的文本，截到 90 字。

## 设计判据

- **刻度是整列重建，不是增量更新**。会话切换会整片换掉滚动容器与消息节点，增量维护要处理节点复用与顺序变化。重建由 `MutationObserver`（观察 `document.body`，因为容器本身也会被换掉）触发并压到一帧一次。
- **列的右缘贴着会话视图 `[class*="_viewArea"]` 的右缘，往里让出参照边宽度的 2%**。参照边是 `document.documentElement.clientWidth`——`fixed` 的 `right` 按初始包含块解析，那个盒子不含文档自己的竖直滚动条，而 `window.innerWidth` 含，两者只在文档不滚动时相等（fixture 上实测差 15px，表现是空隙比设定值多出这一截）。位置由 `measureGeometry` 写成 inline px，`NAV_CSS` 里的 `right: 2%` 只是锚点缺席（首页 / 新会话态没有 `_viewArea`，回落到 `[data-conversation-scroll]`，两个都没有就用它）时的回落值。刻度 30×6px，hover 或高亮时加宽到 44px，列宽写死成这个最大值——宽度随内容走的话 hover 会把右对齐容器的左缘往左推，摘要框锚在左缘上就会跟着跳。
- **跟随靠锚点上的 `ResizeObserver`，不能靠 `MutationObserver`**。外壳是三列 grid，别的插件展开右侧详情列时会话区整体左移，而展开只改 grid 容器那一行 inline 样式，DOM 结构不变：实测 `MutationObserver(document.body, { childList: true, subtree: true })` 一次都不触发，锚点的 `ResizeObserver` 触发 14 次。锚点在会话切换时会换新，重新观察必须走在「起点集合没变就提前返回」那条路之前——切到起点数相同的会话不重建刻度，但列得改贴到新节点上，盯着游离节点就是再也收不到尺寸变化。
- **淡入的热区从列的左缘往左量 72px**，不是从窗口右缘量。列不贴着窗口右缘，详情列一展开更是差出几百 px，按窗口右缘算的固定热区够不到列本身。热区左界只在 `measureGeometry` 里更新，不在 `pointermove` 里现读——那是每秒上百次的强制同步布局。
- **摘要框是列的绝对定位子节点**，垂直对齐到悬浮刻度的中心（`offsetTop`），水平贴在列左缘外 10px。**不能改成 `position: fixed`**：列自己带 `transform`，那让它成为 `fixed` 后代的包含块，视口坐标会被当成相对列顶端的偏移——实测偏了 381px，框落到列的下方。
- **摘要框的底色取会话页的全局背景** `--dsw-alias-bg-base`（上游 `body` 的规则就是 `background: var(--dsw-alias-bg-base, #fff)`，会话区根节点用的也是它；深色主题 `#151517`）。**不要换成 `--dsw-specific-bubble`**——那是 user 气泡的底色（`#2c2c2e`），用它等于把摘要框做成一条「我说的话」。底色与正文同色，框靠 `--dsw-shadow-lv2` 浮起来；排版（22px 圆角、`10px 16px` 内距、16px/24px 文字、`--dsw-alias-label-primary` 文字色）与会话正文一致。
- **摘要框宽度必须显式写 `max-content`**，再由 `max-width: 360px` 收口换行。绝对定位、只给 `right`、`width: auto` 时 shrink-to-fit 的可用宽度是「包含块宽度 − right 偏移」，包含块是 44px 的列而偏移比它还大，可用宽度成了负数，浏览器退到最小内容宽度——**中文每行只放得下一个字**，而框的高度、居中、间距全都正常，只断言位置量不出这个缺陷。
- **高亮 = 最后一个已越过容器顶部的起点**，滚到第一条起点之前时 `active` 为 `-1`（没有刻度点亮）。
- **点击不用 `scrollIntoView`**：它会连带滚动祖先容器，在这个布局下把整页顶上去。改为对 `[data-conversation-scroll]` 算 offset 后 `scrollTo({ behavior: 'smooth' })`，起点落在距顶 16px。
- **不干扰原有滚动与点击**：容器**恒为** `pointer-events: none`，只有刻度在列可见时可点。列压在会话正文上，容器可点就等于在正文上盖一条吞掉点击与文本选中的透明带。滚动监听是 `passive`，全程不 `preventDefault`。
- 少于 2 条起点时整列 `display: none`——一条起点的导航列没有意义。此时热区判定直接短路：`display: none` 的列量出来左缘是 0，任何位置都会落进热区，`snapshot().visible` 会报一个看不见的 `true`。

## 被浮层盖住时不点亮

判据是命中测试（`measureCovered`）而不是浮层类名或 `role="dialog"` 清单。列的 `z-index` 是 `2147482000`，比上游浮层实测的 `1000` 都高，不挡一道就会浮在设置面板上面。三种前置页的 DOM 形态并不统一——设置是 `role="dialog"` 的 `VOzbGW_panel` 配 `VOzbGW_mask`，Session log 多带一个 `aria-modal="true"`，快捷键速查表**只有一层 `dyn-kbd-palette-backdrop`、没有任何 dialog 语义**——认 role 会漏掉第三种，列清单则每装一个新插件漏一条。共同点只有一条：列所在那个点上压在最上面的东西不再属于会话视图。所以在列自己的矩形中心做一次 `document.elementsFromPoint`，跳过落在 `.dsh-oi-nav` 内部的节点（列可见时刻度是可点的，正好挡在探测点最前面），取第一个外部节点判它与滚动容器**互不包含**才算被盖。两个方向都要判：会话短的时候点会落在容器的祖先（会话区的空白背景）上，只判一个方向会把正常状态误判成被盖，而这种误判不报错，只是让列在某些会话上再也不出现。

**命中测试只在跨进热区的那一次做**，停在热区里期间的浮层开关由 `MutationObserver` 那条路径接手（实测设置面板打开时 `body` 子树打出 166 条 mutation、关闭时 1 条）。`elementsFromPoint` 和 `getBoundingClientRect` 一样强制同步布局，而 `pointermove` 每秒上百次——热区左界缓存在 `measureGeometry` 里正是为了避开这件事。两条路径合起来才盖住「先开页再移过来」与「人已经悬在列上、页从底下弹出来」两种时序，后者鼠标不动，只有 `MutationObserver` 收得到。遮挡时保持 `opacity: 0` 而不是 `display: none`：列得保住自己的矩形，否则下一次探测取不到采样点。

会话页内的**其他标签不需要额外判据**。轨迹 / 记忆 / 上下文 / 技能 / 待办下 `[data-conversation-scroll]` 仍在，但 `_userRow` 归零，上面那条 `minAnchors` 已经把整列藏掉——实测五个标签的列矩形全是 `[0,0,0,0]`，切回「对话」恢复 `[1516,332,44,194]`。

## 已知限制

- 导航列的 `MutationObserver` 观察 `document.body`，而导航列自己也住在 `body` 里。重建追加刻度会再次触发本观察者，因此**必须同时具备两道闸**：观察者丢弃源自任何 `.dsh-oi-nav` 内部的 mutation，且 `rebuild()` 在锚点集合未变时不碰 DOM。少任何一道就是每帧重建的自激循环——刻度条数看起来完全正常，但 hover、focus 与 CSS transition 每帧被无声打断，这是交互正确性问题而不只是性能问题。实测无闸时空闲 3 秒内 nav 子树发生 1800 次 childList 变更、新增 900 个刻度节点（实际只需 5 个），且刻度节点身份被替换（旧节点 `isConnected=false`）。
- 第一道闸**不能写成 `root.contains(...)`**：页面上可能残留上一次注入的实例，只认自己的 root 挡不住两个实例互相触发的乒乓——A 重建触发 B、B 重建又触发 A，各自都「没观察到自己」。必须按 `.dsh-oi-nav` 类选择排除所有实例。
- 观察目标**不能收窄到消息容器或它的父节点**。切会话时整个容器被换掉，盯着它就连同观察目标一起变成游离节点，从此收不到任何通知——实测表现是切到新会话后刻度停在旧会话的值不动，而空闲指标一切正常。宁可观察 `body` 再靠上面两道闸挡自激。
- 「刻度数是 user 行数的 2 倍」不是首帧竞态，也不会自愈，而是**页面上并存两个实例**（上一次注入没有 dispose 干净）。先数 `.dsh-oi-nav` 的个数再判断。实测：清场后单次 apply 在同步帧、第一帧、第二帧、静置 1.2s 四个采样点恒为 `navs:1 ticks:5`；不 dispose 再 apply 一次得 `navs:2 ticks:10`，静置 1.5s 后仍是 10。
- 导航列认的是 `_userRow` / `_bubble` 这两个类名片段（`ui-conversation` 的 CSS module 类名，hash 前缀之后的部分）。上游改类名会让整列静默变空——表现是导航列不出现，不报错。

## 验证

跑法与坑见[验证 · 端到端](./verify.md#端到端)（`npm run verify:nav`）与[验证 · 几何](./verify.md#几何不需要真实会话也不碰任何-harness)。
