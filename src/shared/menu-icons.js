/**
 * 右键菜单用的 glyph。除 `paste` 外全部逐字拷自 `@deepseek-ai/dsh-client-ui-primitives`
 * 的 Regular 档图标（`IconEditOutlineRegular`、`IconBranchOutlineRegular`、
 * `IconArchiveOutlineRegular`、`IconUnarchiveOutlineRegular`、`IconTrashOutlineRegular`、
 * `IconCopyOutlineRegular`、`IconPinOutlineRegular`、`IconPinFillRegular`）。
 *
 * **为什么是拷贝而不是引用**：`ui-primitives` 只导出 React 组件，而本插件的菜单是纯
 * DOM 的；那个包又是前端运行时提供的 external，拿不到组件之外的形态。
 *
 * **拷贝会漂移，靠断言兜住**：上游换图标时这里不会有任何编译期报错，菜单只是画着一版
 * 旧矢量。`scripts/verify-live.mjs` 因此点开真实行的「...」菜单，把每一项的 `viewBox`
 * 与全部 `path[d]` 与这里逐字对比——上游一改，那条断言立刻 FAIL。`copy` 由
 * `scripts/verify-selection-menu-live.mjs` 对着消息气泡上那枚真实复制按钮同样比一遍。
 *
 * Regular 档是描边制：svg 根带 `fill="none"` 与 `stroke-width="1"`，子元素按各自声明
 * 落 `stroke="currentColor"` 或 `fill="currentColor"`（混合是上游画法，逐字保留）。
 *
 * **`paste` 是自绘的，没有上游哨兵**：上游图标集里没有剪贴板/粘贴矢量，所以这一枚
 * 拿不到可比对的原件，上面那套漂移断言对它不成立。它按同一批的描边制画：viewBox 16、
 * `fill="none"` + `stroke-width="1"` + `stroke="currentColor"`。
 *
 * 渲染尺寸由 `context-menu.js` 的 `__icon` 规则统一压到 14px（上游 `.itemIcon svg`
 * 同值）；SVG 属性上的 size 是各组件的默认值，与上游 DOM 逐项相等。
 */

/** 上游 `IconEditOutlineRegular` —— 会话/工作区的「重命名」。 */
const EDIT = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M8.85596 2.69971H4.19971C3.37141 2.69971 2.69992 3.37146 2.69971 4.19971V11.8003C2.69992 12.6285 3.37141 13.3003 4.19971 13.3003H11.8003C12.6283 13.2999 13.3001 12.6283 13.3003 11.8003V7.89893H14.3003V11.8003C14.3001 13.1806 13.1806 14.2999 11.8003 14.3003H4.19971C2.81913 14.3003 1.69992 13.1808 1.69971 11.8003V4.19971C1.69992 2.81918 2.81913 1.69971 4.19971 1.69971H8.85596V2.69971Z" fill="currentColor"/><path d="M7.7849 8.23878L13.888 2.13574" stroke="currentColor"/></svg>'

/** 上游 `IconBranchOutlineRegular` —— 会话的「分叉」。 */
const BRANCH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1.01503 8.0001L5.6964 8.0001C6.41913 8.0001 6.78049 8.0001 7.12115 7.91951C7.4232 7.84804 7.71233 7.73014 7.97821 7.57C8.27809 7.38939 8.5364 7.13669 9.05303 6.63129L11.3281 4.40564" stroke="currentColor"/><path d="M1.01221 7.9999L5.6964 7.9999C6.41913 7.9999 6.78049 7.9999 7.12115 8.08049C7.4232 8.15196 7.71233 8.26986 7.97821 8.43C8.27809 8.61061 8.5364 8.86331 9.05303 9.36871L11.3281 11.5944" stroke="currentColor"/><circle cx="12.4502" cy="3.3079" r="1.56962" stroke="currentColor"/><circle cx="12.4502" cy="12.6921" r="1.56962" stroke="currentColor"/></svg>'

/** 上游 `IconArchiveOutlineRegular`（菜单里按 size=14 渲染）—— 会话的「归档」。 */
const ARCHIVE = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M13.5 2.5H2.5C1.94772 2.5 1.5 2.94772 1.5 3.5V4.5C1.5 5.05228 1.94772 5.5 2.5 5.5H13.5C14.0523 5.5 14.5 5.05228 14.5 4.5V3.5C14.5 2.94772 14.0523 2.5 13.5 2.5Z" stroke="currentColor"/><path d="M2.5 5.5V13.5C2.5 13.7652 2.60536 14.0196 2.79289 14.2071C2.98043 14.3946 3.23478 14.5 3.5 14.5H12.5C12.7652 14.5 13.0196 14.3946 13.2071 14.2071C13.3946 14.0196 13.5 13.7652 13.5 13.5V5.5" stroke="currentColor"/><path d="M6.5 9.5H9.5" stroke="currentColor"/></svg>'

/**
 * 上游 `IconUnarchiveOutlineRegular`（同样按 size=14 渲染）—— 归档行的「取消归档」。
 * viewBox 是 20 而不是这一批常见的 16：上游那枚原件自己就是 20，逐字拷贝意味着连它一起抄。
 */
const UNARCHIVE = '<svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path fill-rule="evenodd" clip-rule="evenodd" d="M15.8659 2.05975C17.2603 2.05995 18.3913 3.19096 18.3914 4.58527V5.4874C18.3914 6.02747 18.2192 6.52672 17.9303 6.93735C17.9336 6.96524 17.9388 6.99318 17.9388 7.02195V12.8884C17.9388 13.6345 17.9395 14.2379 17.8996 14.7254C17.8642 15.1593 17.7936 15.5499 17.6373 15.9141L17.5654 16.0685C17.278 16.6328 16.8405 17.1046 16.3038 17.434L16.0679 17.5661C15.66 17.7739 15.2196 17.8598 14.7237 17.9003C14.2362 17.9401 13.6327 17.9405 12.8867 17.9405H7.11122C6.36511 17.9405 5.76171 17.9401 5.27418 17.9003C4.84051 17.8649 4.44949 17.7952 4.08545 17.6391L3.93104 17.5661C3.36673 17.2785 2.89392 16.8414 2.56465 16.3044L2.43245 16.0685C2.22473 15.6608 2.13878 15.2211 2.09825 14.7254C2.05841 14.2379 2.05912 13.6345 2.05912 12.8884V7.02195C2.05912 6.99284 2.06422 6.96449 2.06758 6.93629C1.77931 6.52592 1.60858 6.02687 1.60858 5.4874V4.58527C1.60876 3.19084 2.73962 2.05975 4.1341 2.05975H15.8659ZM16.4984 7.92936C16.296 7.98169 16.0847 8.01288 15.8659 8.01291H4.1341C3.91478 8.01291 3.70246 7.98194 3.49955 7.92936V12.8884C3.49955 13.6582 3.50053 14.1927 3.53445 14.608C3.56769 15.0146 3.62923 15.244 3.71635 15.415L3.7925 15.5514C3.98339 15.8627 4.25749 16.1165 4.58464 16.2833L4.72529 16.3435C4.88095 16.3993 5.08638 16.4402 5.39158 16.4651C5.80685 16.4991 6.34138 16.5001 7.11122 16.5001H12.8867C13.6564 16.5001 14.1911 16.499 14.6063 16.4651C15.0128 16.432 15.2423 16.3703 15.4133 16.2833L15.5508 16.2061C15.8618 16.0152 16.116 15.7419 16.2827 15.415L16.3429 15.2732C16.3985 15.1177 16.4396 14.9128 16.4645 14.608C16.4985 14.1927 16.4984 13.6583 16.4984 12.8884V7.92936ZM4.1341 3.50019C3.53511 3.50019 3.0492 3.98631 3.04902 4.58527V5.4874C3.04902 6.08649 3.535 6.57248 4.1341 6.57248H15.8659C16.4648 6.57228 16.951 6.08638 16.951 5.4874V4.58527C16.9509 3.98644 16.4647 3.50038 15.8659 3.50019H4.1341Z" fill="currentColor"/><path d="M10 14.1V10.1M7.85 12.05L10 9.9L12.15 12.05" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/** 上游 `IconTrashOutlineRegular` —— 工作区的「删除」。 */
const TRASH = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M1.28149 3.88831H14.7187" stroke="currentColor"/><path d="M5.41602 3.88833V2.47962C5.41602 2.29282 5.52492 2.11366 5.71876 1.98157C5.9126 1.84948 6.17551 1.77527 6.44964 1.77527H9.55053C9.82466 1.77527 10.0876 1.84948 10.2814 1.98157C10.4753 2.11366 10.5842 2.29282 10.5842 2.47962V3.88833" stroke="currentColor"/><path d="M2.57349 3.88831L3.19366 13.2943C3.21937 13.5502 3.33952 13.7872 3.53065 13.9593C3.72178 14.1313 3.97016 14.2259 4.22729 14.2246H11.7728C12.0299 14.2259 12.2783 14.1313 12.4694 13.9593C12.6605 13.7872 12.7807 13.5502 12.8064 13.2943L13.4266 3.88831" stroke="currentColor"/><path d="M6.44946 6.98926V11.1238" stroke="currentColor"/><path d="M9.55054 6.98926V11.1238" stroke="currentColor"/></svg>'

/** 上游 `IconCopyOutlineRegular` —— 选中文本的「复制」。 */
const COPY = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="1.52075" y="4.07373" width="10.3932" height="10.3932" rx="2" stroke="currentColor"/><path d="M11.9792 1.53296C13.36 1.53296 14.4792 2.65225 14.4792 4.03296V9.42847C14.4792 10.3756 13.9521 11.1987 13.1755 11.6228V10.3298C13.3652 10.0787 13.4792 9.7674 13.4792 9.42847V4.03296C13.4792 3.20453 12.8077 2.53296 11.9792 2.53296H6.58374C6.27966 2.53301 5.99684 2.6235 5.7605 2.77905H4.42358C4.85652 2.03463 5.66056 1.53304 6.58374 1.53296H11.9792Z" fill="currentColor"/></svg>'

/** 上游 `IconPinOutlineRegular` —— 未置顶会话的「置顶会话」。 */
const PIN_OUTLINE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" stroke="currentColor" stroke-linejoin="round"/><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"/></svg>'

/** 上游 `IconPinFillRegular` —— 已置顶会话的「取消置顶」。 */
const PIN_FILL = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9.96976 1.70572L13.1554 3.93629L10.9019 8.12317L11.5158 11.605L10.7192 12.7427L2.52767 7.00693L3.3243 5.86922L6.80612 5.25528L9.96976 1.70572Z" fill="currentColor" stroke="currentColor" stroke-linejoin="round"/><path d="M6.05285 9.47511C6.27284 9.16094 6.70586 9.08458 7.02003 9.30457C7.3342 9.52455 7.41055 9.95757 7.19057 10.2717L3.98587 14.4708L3.21223 13.9291L6.05285 9.47511Z" fill="currentColor"/></svg>'

/**
 * 自绘的粘贴 glyph —— 选中文本的「粘贴」。上游图标集里没有剪贴板/粘贴矢量，这一枚没有
 * 可比对的原件。画法与这批 Regular 描边制一致：`fill="none"` + `stroke-width="1"` +
 * `stroke="currentColor"`，圆角矩形外框加一枚实心夹子。
 */
const PASTE = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke-width="1" stroke="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10.5" rx="2"/><path d="M6 3.5V2.5A1 1 0 0 1 7 1.5H9A1 1 0 0 1 10 2.5V3.5"/></svg>'

/**
 * 菜单项 id → SVG 标记。键名与 `context-menu-feature` 里的动作 id 无关，取的是
 * glyph 自己的名字，避免「删除工作区」和「归档会话」共用一个动作 id 时对不上。
 */
export const MENU_ICONS = {
  edit: EDIT,
  branch: BRANCH,
  archive: ARCHIVE,
  unarchive: UNARCHIVE,
  trash: TRASH,
  copy: COPY,
  paste: PASTE,
  pinOutline: PIN_OUTLINE,
  pinFill: PIN_FILL,
}
