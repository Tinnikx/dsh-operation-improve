# 功能 13：滚到顶部时自动加载更早的消息

会话页滚到最顶上时，「加载更早」按钮进入视口，插件替用户点这一下：新的一页插到上方，读者停留在原先看的那一行。不点从不出现，按钮不卸载就不会一打开会话就把全部历史拉下来。

实现是 [src/auto-load-older/index.js](../src/auto-load-older/index.js)：一个 `IntersectionObserver` + 一个 `MutationObserver`，不注册 slot、不调 harness 服务、不带样式表。

## 为什么只认「可见」

上游把按钮渲染在会话列最顶端（`ChatView.tsx` 的 `hasMore && <div className={css.older}><button…`）：列是 `div[data-chat-flow]`，`.older` 是它的第一个子元素。按钮随 `hasMore` 常驻，滚在底部时被滚动容器裁掉，只有回到顶上才看得见。

点击走 `useChatNavigation.loadEarlier`：取消正在进行的导航、`viewport.beginPaging()`、暂停「跟随到底」，再调 `session.loadOlder()`。提交时 `viewport.preserve()` 把原先可见的那一行钉在原位，新补的页出现在它上方——**按钮因此被顶出视口**，读者要再往上滚才会再次看见它。所以「加载完按钮还在原地」在正常页长下不会发生（一页至少 50 条消息，实测一次 +734 行 / 高度 +23362px）。

用户选定的触发时机是**按钮真的可见时**，不是一打开会话就补全历史。`IntersectionObserver` 的根是视口，祖先滚动容器的裁剪自动计入交叉矩形：停在底部时 `isIntersecting` 为假，1.5s 内行数不变（实测 104 → 104）。

页面短到一页装不满时，加载完按钮仍在视口里，会接着点下一页，直到历史到头（按钮随 `hasMore` 卸载）或内容顶满视口——这是「可见就加载」的自然延伸，不需要第二种策略。

## 怎么认按钮

只锚两个上游事实：

- 滚动容器上的 `[data-conversation-scroll]`（上游 `ConversationContent.tsx` 渲染，`useChatViewport` 也按它找滚动节点）；
- 会话列上的 `[data-chat-flow]`。

在滚动容器里找「`[data-chat-flow]` 的第一个子元素的第一个子元素是 `button[type=button]`」的那一枚。不按文案锚——统计页（`client-ui-stats` 的 `StatsView`）也有一枚同文案的「加载更早」，按文字会点错；也不按编译后的 CSS Module 类名锚（类名前缀随构建变）。统计页没有这个两层结构，天然被排除。实测真正的链是 `BUTTON → DIV.EvIC1a_older → DIV.EvIC1a_column[data-chat-flow]`，同一页上还有大量 `[data-chat-flow]` 的工具正文容器，它们的第一层子元素不是按钮。

React 重渲染会换掉按钮节点：`MutationObserver` 每批 mutation 在下一帧合并扫一次，按钮身份变了就 `unobserve` 旧的、观察新的；`refresh()` 给验证脚本在切会话后立即重扫。

## 失败不重试

上游 `loadOlder()` 把异常吞进 `console.error`，失败时按钮照常留在原地、恢复可点。如果只按「可见就点」，失败一次就会变成死循环。

一次点击记下三个基准：第一行节点 key、`scrollHeight`、点击时刻。等这次加载落地后：

- **内容变多**（第一行 key 换了，或 `scrollHeight` 变大）→ 成功。按钮还看得见就继续下一页；看不见就等读者再滚上来。
- **按钮已恢复可用、内容没变**（400ms 后仍如此）→ 判为失败，`stalled = true`，不再自动点，直到按钮离开视口再回来才重新允许。

失败判定用「按钮恢复可用」当门槛，是因为加载中按钮是 `disabled` 的：400ms 到点时它还没恢复，就说明这一页还在飞，不判失败，基准留着，等后续 mutation（行插入或 `disabled` 翻回 false）再收尾。

## 实测

测试栈（harness 3181 / CDP 9334，`node scripts/verify-auto-load-older-live.mjs`，8 条断言全绿）：

| 阶段 | 行数 | scrollHeight | scrollTop | 按钮点击计数 |
| --- | --- | --- | --- | --- |
| 打开长会话、停在底部，静置 1.5s | 104 | 5373 | 4592 | 0 |
| 真实滚轮到顶 | 193 | 12207 | 6834 | 1 |
| 落地 1s 后（按钮被顶出视口） | 193 | 12207 | 6834 | 1 |
| 再滚到顶（第二页） | 283 | — | — | 2 |

- 行数与高度同时变大，`scrollTop` 从 4592 走到 6834（锚点前移，不是把读者扔回 `scrollTop = 0`）。
- 加载落地后按钮 `top = -6742`，1s 内行数不再变。
- 第二页之后 `snapshot.attached === true` 且页面上按钮仍在，与 `hasMore` 一致；继续滚会再加载，直到按钮卸载。
- 另一组用 756 行的大会话手点：756 → 1490（+734，高度 24984 → 48346），再来一页 1490 → 1846 后按钮卸载（历史到头）。

验证脚本给按钮的 `click` 挂计数器：行数变多只说明「有东西加载了」，计数从 0 → 1 → 2 才证明是**本功能**点的；加载本身仍走上游真 handler。滚轮用 CDP `Input.dispatchMouseEvent` 真事件——直接赋 `scroller.scrollTop = 0` 会被上游的滚动补偿在 150ms 内改回去，触发不了 `IntersectionObserver`。

## 已知限制

1. **依赖上游的节点结构**：`[data-conversation-scroll]` 下 `[data-chat-flow]` 的第一层子元素是按钮、按钮是它的第一个子元素。上游改 `ChatView` 的包裹层就静默失效（按钮还在，但认不出），不会报错。
2. **打开就会停在顶部的会话会被立刻自动加载**。按钮可见是唯一条件；如果某个会话打开时视图没落在底部，功能会在第一帧之后就连着翻页，直到视口被填满或历史到头。这是「可见才加载」的直接结果，不是可单独关闭的分支。
3. **失败判定的 400ms 是经验值**。上游失败时不发任何事件，只能靠「按钮恢复可用 + 内容没长」推断；如果上游把失败重试做在内部、按钮长时间保持 `disabled`，本功能会一直等，不会误判成功。
4. **观察的是整个 `document.body`**（`childList` + `subtree` + `characterData` + `disabled` 属性，每帧合并一次）。流式输出时每帧都会扫一次滚动容器，开销与功能 4 的时间戳重建同源；没有在超长会话上单独量过。`disabled` 单独看一眼是因为一次加载结束时上游只翻这个属性、不插节点。
5. **只点「加载更早」，不碰统计页**。统计页那枚同文案按钮结构不同，刻意不覆盖。
6. **`snapshot.attached` 以按钮是否还在 DOM 为准**，切会话的过渡帧里可能短暂为 `true`（旧按钮还没被 React 摘掉）。

## 与上游的关系

不改上游源码。锚点 `[data-conversation-scroll]` / `[data-chat-flow]` / `[data-chat-node-key]` 都是上游字面量属性；点击调的是按钮自己的 `click()`，走完整的上游 handler。上游把「一页至少 50 条」与 `viewport.preserve()` 的行为当作既有契约沿用，没有自己接管滚动位置。
