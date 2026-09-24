# 014 功能 11：Ctrl+F 页内查找

- 目标：按 `Ctrl`/`cmd` + `F` 弹出查找条，在**当前页面已渲染的文本**里搜关键词，词级高亮全部命中，`Enter` / `Shift+Enter` 跳下一个 / 上一个（到端点环绕），`Esc` 关闭并清除高亮——观感对齐浏览器自己的查找条。验收方式：`npm run verify:find` 末行 `passed=19 failed=0 skipped=0` 且 `echo $?` 为 0，其中「一轮输入与跳转下来 `childList` mutation 计数为 0」那条实际执行（不是 skip）；七套既有 live 全套不回归。
- 范围：做——`src/find/`（纯函数层 + DOM 半边 + 一段 CSS）、client 入口装配与调试句柄、`src/shared/locale.js` 六个键、`scripts/verify-find-live.mjs` + `scripts/lib/find-page.mjs`、README 与 [docs/feature-11-find.md](../feature-11-find.md)。不做——跨会话搜索、host 侧 SQLite FTS5 全历史检索、上游工具栏「搜索轨迹」那套**过滤**语义、大小写/全词/正则开关、`<mark>` 包裹命中。

## 进展

- 功能实现完成，全部读数在 [docs/feature-11-find.md](../feature-11-find.md#实测读数)。判据三条主线：快捷键挂 `window` 捕获（抢在共享菜单的 `Esc` 之前，同相位下注册序决定调用序）；高亮走 `CSS.highlights` 两个注册名 + 两条 `::highlight()`，**不改上游 DOM**；命中域是 `document.body` 的文本节点，跳四类（自己的浮层与标签、不渲染成文本的标签、不可见、折叠）。
- 全套读数：`npm test` 44/44（新增 10 条纯函数用例）· `verify:find` 19/19 · 回归 `verify 27/27 · timestamps 10/10 · dot 21/21 · selection 20/20 · row-states 24/24 · chat-history 16/16 · settings 22/22`，七套合计 140 条，`failed=0 skipped=0`。构建产物已随本轮更新（`lib/client.js` 比 `src/find/index.js` 新）。
- 关键读数三条：查询词 `" age"` 上插件 5 条与独立 oracle 5 条同数、当前项集合 1 条且文本只差大小写；「改词 + 两次跳转」期间 `childList` mutation 计数 `0`；条开着切会话后高亮 11 条 Range 的 `startContainer.isConnected` 全为真且与 oracle 同数（只比数字会放过悬空 Range）。
- 截图核对：条在右上角 `380×34`、计数 `1 / 5`，当前项实心橙 `rgb(221, 134, 41)`、其余命中 42% 透明橙——两条 `::highlight()` 的先后确实是叠放绘序，active 那条必须写在后面。

## 决策与理由

- 高亮走 CSS Custom Highlight API 而不是 `<mark>`：包裹命中会拆掉 React 管的文本节点，并喂给功能 1 与功能 4 那两个 `document.body` 级 `MutationObserver`。注册表是文档级全局的，两份实例同名互顶，因此绘制前认领、摘除时 `if (CSS.highlights.get(n) === mine) delete`。
- 游标重锚按 `(rowKey, ordinal)` 而不是绝对序号：`rowKey` 取命中所属行的 `data-chat-node-key`（退 `data-chat-flow-key`，再退 `'page'`）。「加载更早」前插会让整体位移，硬保连续是假象——写进已知限制。
- 折叠与不可见文本一律不计入命中，判据是 `checkVisibility({ checkVisibilityCSS: true, ... })` + `getClientRects()` 为空 + 两条折叠属性。`checkVisibilityCSS` 那一项不能省，理由见「坑」。
- 命中上限 1000、计数显示 `1000+`：`Range` 与 `Highlight` 的构造按条付费，长会话里搜一个常见字母会破万。
- 功能 9 的 `writeText` 不复用：它派发合成按键，Lexical 不看 `isTrusted`；查找条是普通 `<input>`，走真实输入管线。

## 测试cases

`tests/find-matches.test.mjs`（10 条）：`findOffsets` 的大小写 / 不重叠 / 空查询 / 小写改变长度的字符（U+0130，偏移必须是原文下标）、`buildMatchList` 的按 key 归组与截断、`nextIndex` 的环绕与零命中、`reanchor` 的同命中 / 命中消失后取文档序其后 / 全没有时回退 / 空表。

`scripts/verify-find-live.mjs`（19 条）+ `scripts/lib/find-page.mjs`（oracle 两口径 `visible` / `raw`，加 `defaultPrevented` 探针与 `childList` 计数器）。覆盖清单与每条的坑见 [docs/verify.md · 功能 11 的验证](../verify.md#功能-11-的验证)。

## 未完成项与下一步

- 真桌面客户端手工项（不进 CDP）：shell 层 accelerator 抢键、macOS `cmd` + `F`、观感、流式输出时的抢滚动。

## 坑

- **上游的折叠不是 `display: none`**。「已完成工作」这类过程块把正文容器标成 `[hidden]`，主题给的是 `content-visibility: hidden`——元素仍有 layout 盒（`getClientRects()` 非空、矩形高度 24px），光看矩形判不出来，只有 `checkVisibility({ checkVisibilityCSS: true })` 报得准。实测一条多轮会话上有 59 个这样的条目：不传这个选项就会把一整组看不见的思考与工具文本算进命中。
- **折叠组的标题也在同一个隐藏容器里**，点不到。原本设计的「取收起思考行的词 → 点开 → 命中出现」这条链在这份页面上做不出来（思考行全部长在隐藏的 turn-process 组内），重算判据因此改成「条开着切会话」，并且要看 Range 的 `isConnected`——悬空 Range 的 `size` 照样对得上数字。
- **`Input.insertText` 替换的是选区**，不先 `select()` 就是往后追加：实测「把查询词改成前三字」变成了 `" age ag"`，报出来的是查询词不对，看着像功能坏了。
- **主题 token 定义在 `document.body` 上，不在 `:root`**：`getComputedStyle(document.documentElement)` 读回来全是空串，token 在场那条断言一开始就是这么假失败的。
- **`.pnpm` 目录没有 `@deepseek-ai+` 这一级**：包目录是 `@deepseek-ai+pkg@ver` 这种平铺名，`grep -r ... @deepseek-ai+` 会静默命中 0 个文件（`2>/dev/null` 把「路径不存在」也吞了）。本轮据此得出的「上游没有 `CSS.highlights` / 没有 shadow DOM / 没有 Ctrl+F 处理」三条一度是假的，改成 `@deepseek-ai+*/node_modules/@deepseek-ai/*/lib/*.js` 后重查才成立（10023 个文件，四条判据仍全为 0 命中）。
- **两份实例并存时后装的占住注册名**：不每次绘制前 `CSS.highlights.set` 认领，就会出现「快照报有命中而页面上什么都不亮」。
