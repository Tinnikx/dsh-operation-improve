# 功能 7：思考区域限高与滑块

会话里展开的思考正文超过 60vh 时截断并出自己的滚动条，不再把会话流撑开。和功能 5 一样**一行 JS 都不跑**。

`src/think-scroll/index.js`

```js
export const THINK_SCROLL_CSS   // 两条声明，由 client 入口拼进那张样式表
```

```css
[data-variant='think'] [class*='_thinkBody'] {
  max-height: var(--dsh-oi-think-max-height, 60vh);
  overflow-y: auto;
}
```

上游 `ReasoningRow` 展开后把思考正文渲染成 `DisclosureRow` 根的直接子元素（没有包裹层），只给了 `white-space: pre-wrap`、没有任何高度上限——一段几千字的思考把整条会话流撑开，往下翻要翻很久才回到正文。同一个包里的 `GenericCommandCard` 早就是 `max-height` + `overflow: auto`，这里是把同一个做法用到思考正文上。

- **不需要 JS 去量「有没有超出」**。`max-height` 本身就是条件性的：放得下的正文高度不受影响、`overflow-y: auto` 也不出滚动条，只有真超了才既截断又出滑块。
- **上限用 `vh` 而不是 px**。判据是「超出屏幕」，而屏幕高度只有视口单位知道；固定 px 在竖过来的显示器上会把一屏放得下的思考也截成滚动区。想换值覆盖 `--dsh-oi-think-max-height`。
- **选择器挂 `[class*='_thinkBody']` 而不是完整类名**。`QWLzlG_thinkBody` 的前缀是构建期哈希，跨版本不稳定；`data-variant="think"` 才是 TSX 里的字面量。两段合起来特异度 (0,2,0)，压过上游那条 (0,1,0)，胜负不取决于样式表在 `head` 里的先后。
- **不加 `box-sizing: border-box`**。页面没有全局 border-box，`max-height` 因此落在内容盒上，被截后的 `clientHeight` 是 60vh 再加上游那 8px 上下 padding。为这 8px 去改这个元素所有尺寸的算法不值当，验收断言里直接把 padding 算进期望值。

## 实测读数

测试栈的真实会话，`innerHeight` 857、60vh = 514.2px：一个 1942 字、自然高 608px 的思考被截到 `clientHeight` 522（514 + 8），`scrollHeight` 仍是 608、可滚余量 86px、滚动条占 8px 宽；同页另外六个（296/224/56/200/104/176px）高度与无此规则时逐字相同且不出滚动余量；上游那 9 条声明（`color` / `fontSize` / `lineHeight` / 三条 `padding` / `whiteSpace` / `wordBreak` / `backgroundColor`）前后完全一致。

## 已知限制

- 认的是 `data-variant="think"` 加 `_thinkBody` 这个类名片段。上游改任意一处，限高整条失效且不报错——表现是长思考退回把会话流撑开的样子。
- **流式输出中的思考不再自动跟到底**：思考正文超过 60vh 之后，新写出来的内容落在自己的滚动容器里，而跟随滚动的是外层会话容器，正文自己不会滚到底。这一条**没有实测过**——要复现得真的向模型发一条会产生长思考的消息。
- 上限是按视口高算的，不看正文所在的位置。上游哪天把思考正文放进一个本身就比 60vh 矮的容器里，这条规则就形同虚设（不报错，只是不生效）。

## 验证

没有 `npm run verify:*` 脚本，判据在一份 scratch 脚本里，跑法与那处对照组的坑见[验证 · 功能 7](./verify.md#功能-7-的验证)。
