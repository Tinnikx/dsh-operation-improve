# 功能 4：逐行开始时间戳

会话页逐行开始时间戳。每条回复、工具调用、思考等节点行的右上角显示它的**开始**时刻（`HH:mm:ss`），user / steering / turn-tail 三类改成常驻显示上游自己的时间标签。

`src/timestamps/index.js`

```js
installTimestamps({ now? }) -> { dispose(), snapshot(), refresh() }
TIMESTAMP_CSS
```

`src/timestamps/format-clock.js`

```js
formatClockSeconds(time, now?) -> string | null   // 非有限数返回 null
```

只读会话页的 DOM 与 React fiber，标签作为节点行自己的子节点插入，由观察 `document.body` 的 `MutationObserver` 驱动。

数据源是 React fiber：每个节点行由上游 `ui-conversation` 渲染成 `div[data-chat-flow-key][data-chat-flow-kind]`，其内部第 7 层 fiber 的 `memoizedProps.node` 就是完整节点（`kind` / `key` / `data` / `location`）。反查**只接受 `node.key` 与行上 `data-chat-flow-key` 逐字相等的那一个**：上游改了层级或复用了节点，结果是这一行没有标签，而不是安上邻行的时间。

## 时间取的是开始时刻

候选顺序逐条对齐上游轨迹页 `startedAt` 的推导（`packages/client/ui-trajectory/src/client/layout.ts`），也就是详情面板里「Started」那一行的值：

| kind | 取哪个字段 | 为什么不是 `data.time` |
| --- | --- | --- |
| `tool-call` | `data.root.callTime`，缺席时退 `data.root.time` | `time` 是结果落地时刻。实测同一次调用 `callTime 15:13:44` / `time 15:15:06`，差 82 秒 |
| `assistant-step` | `data.finalNode.timing.stepStartTime`，依次退 `location.step.start.time`、`firstTokenTime` | `data.time` 等于 `timing.completedTime`。实测 `stepStartTime 15:15:15` / `data.time 15:15:56`，差 41 秒 |
| 事件类（context / compaction / turn-tail…） | `data.time` | 事件本身没有「开始 / 结束」之分 |

末两条候选 `location.step.start.time` / `location.turn.start.time` 是通用兜底——`workflow-run` 是唯一 `data` 里没有任何时间字段的 kind，走的就是它。**step 专属的两条兜底由 `finalNode` 是否存在关在 assistant-step 这一类里**：不关的话，`context` 这种「事件时刻晚于所属 step 起点」的节点会被安上 step 的起点。

用候选路径而不是按 kind 打表：打表遇到表外的 kind 是静默无标签，候选路径至少还能靠 location 兜住。代价是**顺序本身承载语义**，插入新候选前先确认它不会在别的 kind 上抢答。

格式化分支对齐上游 `ui-conversation/src/client/chat/message-chrome.ts` 的 `formatMessageClock`，各多一个秒：同日 `HH:mm:ss`，同年更早 `M/D HH:mm:ss`，跨年 `Y/M/D HH:mm:ss`。判据是**本地日历字段**而不是毫秒差。日期部分固定成数字形式，不接词典——上游那两个模板（`clock.md` / `clock.ymd`）在 `conversation` 词典里，zh 下是 `{m}月{d}日`，所以中文界面上这里与上游的日期写法不一致，见[已知限制](#已知限制)。

## 标签的放置

**每个 `[data-chat-flow-key]` 留出 `--dsh-oi-ts-gutter`（56px）右侧留白**，行标签绝对定位到 `top: 0; right: 0`，落在这条留白里、与本行第一行水平对齐。

- **留白必须给到每一个节点行，不只是被贴了标签的那些**。只缩一部分行，剩下的（user / steering / turn-tail，以及取不到时间的行）保持原宽，右边缘就参差不齐。代价是正文列窄 56px——这是有意付的：标签放进 16px 的列间距里可以做到零布局位移，但那条间距上下对称，标签离本行和离下一行都是 1px，**读起来归属下一行**。
- **对齐的是本行第一行，不是最后一行**。这是「开始时间」，而一个两千 px 高的回复行，把它的起始时刻放在两千 px 之下没有意义。
- **不能把标签内联到首行末尾**。实测 tool-call 的命令行带 ellipsis 裁切、assistant-step 的代码块横向滚动，两类的首行右端可用宽度都是负数（分别 −257px、−1688px），内联必然压在正文上。
- 标签一律 `pointer-events: none` + `user-select: none`：它落在正文的选区范围内，可选中就意味着复制一段回复会连时间戳一起带走。

**本该为空的行不插标签**：`.flowItem:empty { display: none }`（`ChatView.module.css`）让 turn-tail 在不拥有 actions 时主动放弃渲染，往这种行里插任何子节点都会让它现形。判据是「行里有没有插件之外的元素子节点」——自己的标签不算内容，否则装上之后这一行就永远不空了。

## 思考行

Think 折叠头那条 flex 行末尾插一枚标签，时间用**所属 assistant-step 的开始时刻**（思考本身在 fiber 里没有独立的时间字段）。它是 flex 项而不是绝对定位：那条行里摘要是 `flex: 1 1 auto` 且带 ellipsis，插一个 `flex: 0 0 auto` 的兄弟进去，摘要自己会让出宽度；绝对定位则必然压在摘要尾巴上。`line-height` 必须与摘要的 24px 对齐，否则这一行会被标签撑高。

**落在所属 step 第一行水平带上的 Think 不单独贴标签**——行标签就在同一条水平带的右端，两枚一字不差的时间并排出现只是噪声。实测一个 73 行的真实会话里 7 个 Think 行全部落在这一带上，`snapshot().thinks` 因此是 0。判据要读矩形，所以 `rebuild()` 拆成读、写两相：读相位把整页量完再统一写，读写交替就是一行一次布局抖动。

## 上游三类改常驻

```css
[data-time-hover-root] [class*="_timeStart"],
[data-time-hover-root] [class*="_timeEnd"] { opacity: 1 !important; }
```

user / steering / turn-tail 三类上游自己就在渲染时间（还带 `Ran for` / `TTFT` / `tok/s` 读数），只是藏在 hover 后面，插件不另贴。`!important` 是必要的：上游那条 `@media (hover: hover)` 下的 `opacity: 0` 与这条特异度相同，胜负只取决于两张样式表在 `head` 里的先后，而上游样式表由构建产物插入，顺序不由插件掌控。

## 自激环两道闸

观察者盯的是 `document.body`（切会话会整片换掉滚动容器，收窄观察目标会连观察者一起变成游离节点），而标签也插在它盯的范围内，所以它一定看得到自己造成的记录，得用两道闸挡回去：

1. 观察者丢弃源自标签自身的记录，以及「增删的节点全是 `.dsh-oi-ts`」的记录。**不能写成 `record.target.closest('.dsh-oi-ts')`**——标签是插到行容器上的，那条 mutation 的 target 是行容器本身，闸门根本合不上。
2. 更新必须幂等：文本相同不写 `textContent`，属性已在不重设。稳态下一条 mutation 都不产生。

实测空闲 3 秒内新增标签节点 0 个、首枚标签仍是同一个对象。

## 已知限制

- 时间戳的日期部分不跟随 harness 语言：上游 zh 下写「8月27日」，这里写 `8/27`。`formatClockSeconds` 是个不带 ctx 的纯函数，接词典要把 `conversation` 词典的 `clock.md` / `clock.ymd` 传进去。右键菜单不在此列，它的文案[全部取自词典](./feature-1-2-sidebar-menu.md#菜单项与服务映射)。
- 16 类 kind 里，真实页面上只跑到过 `assistant-step` / `tool-call` / `context` / `compaction` / `model-retry` / `turn-tail` / `user` 七类。另外九类（`steering`、`manual-compaction`、`command`、`command-input`、`turn-error`、`turn-max-tokens`、`workflow-run`、`agent-teams`、`unknown`）**从未在真实页面上被验证过**，它们走的是 `resolveTime` 的通用兜底；取不到时间的表现是这一行没有标签，不报错。
- **整页时间戳不是全局单调的**。同一个 step 内 `model-retry` 显示的重试时刻会晚于其后 `assistant-step` 显示的 step 起点——两者都对，只是读起来像倒退。
- 常驻规则认的是 `_timeStart` / `_timeEnd` 两个类名片段与 `[data-time-hover-root]` 属性。上游改任意一处，那三类行的时间就退回 hover 才显形，且不报错。
- 右侧留白写死 56px（`--dsh-oi-ts-gutter`）。它要容下最宽的一种文本，也就是跨年的 `Y/M/D HH:mm:ss`——那种宽度只在跨年会话上出现，实测覆盖不到，容不下时表现是标签被挤出行的右边缘。
- fiber 反查与 `rowId` 依赖同一个 React 内部字段，React 版本变化同样会失效；表现是整页没有标签（`key` 自校验挡住了「安上邻行时间」这种更糟的失效方式）。

## 验证

跑法、十条断言与四处坑见[验证 · 功能 4](./verify.md#功能-4-的验证)（`npm run verify:timestamps`）。
