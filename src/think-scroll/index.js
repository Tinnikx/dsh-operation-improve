/**
 * 思考区域的高度上限与滚动条。
 *
 * 纯样式，无 JS：只给展开后的思考正文一条 `max-height` 和一个滚动容器，配色、
 * 字号、行高、内边距与滚动条外观全部留给上游。样式表由 `src/client/index.js`
 * 统一插入与回收，这里只导出文本。
 *
 * 上游 `ReasoningRow` 展开后的结构是（类名前缀是构建期 hash）：
 *
 * ```
 * div[data-variant="think"]        ReasoningRow 自己的根
 *   div._root_…                    DisclosureRow 的根：display:flex，column，不裁剪
 *     div._row_…                   折叠头那条 flex 行
 *     div.…_thinkBody              正文，展开时才渲染，没有包裹层
 * ```
 *
 * 正文那条上游只给了 `white-space: pre-wrap`，没有任何高度上限——一段几千字的
 * 思考会把整条会话流撑开，往下翻要翻很久才回到正文。同一个包里的
 * `GenericCommandCard` 早就是 `max-height` + `overflow: auto`，这里只是把同一个
 * 做法用到思考正文上。
 */

/**
 * 思考正文的高度上限与滚动。
 *
 * **上限用 `vh` 而不是 px**：判据是「超出屏幕」，而屏幕高度只有视口单位知道。
 * 固定 px（上游命令卡那样的 260px）在竖屏笔记本上还行，在竖过来的显示器上就是
 * 无谓地把一屏能放下的思考也截成滚动区。默认 60vh 给正文留出大半屏，同时保证
 * 它上下都还看得见所属的回复行。想换值覆盖 `--dsh-oi-think-max-height` 即可。
 *
 * **不需要 JS 去量「有没有超出」**：`max-height` 本身就是条件性的——放得下的思考
 * 正文高度不受影响、`overflow-y: auto` 也不出滚动条，只有真的超了才既截断又出
 * 滑块。所以这一项和 `src/active-dot/` 一样一行 JS 都不跑。
 *
 * 选择器挂 `[class*='_thinkBody']` 而不是完整类名：`QWLzlG_thinkBody` 里的前缀是
 * 构建期哈希出来的，跨版本不稳定，`data-variant="think"` 才是 TSX 里的字面量。
 * 两段合起来特异度 (0,2,0)，压过上游那条 (0,1,0)，胜负不取决于样式表在 `head`
 * 里的先后。
 */
export const THINK_SCROLL_CSS = `
[data-variant='think'] [class*='_thinkBody'] {
  max-height: var(--dsh-oi-think-max-height, 60vh);
  overflow-y: auto;
}
`
