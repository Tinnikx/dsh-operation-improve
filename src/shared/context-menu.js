/**
 * 通用右键菜单 —— 共享基础层，纯 DOM 实现（不依赖 React 或 primitives）。
 *
 * 契约：
 * - `openContextMenu({ x, y, items, onSelect })` 同时只存在一个菜单；再次调用先关掉旧的。
 * - 定位：以 (x, y) 为左上角，超出视口时向内翻转，保证整块可见。
 * - 关闭条件：选中一项、点击外部（capture 阶段的 pointerdown）、Esc、**锚点跟着动的那次
 *   滚动**（capture，判据见 `openContextMenu` 的 `anchor`）、窗口 blur、resize。关闭后所有
 *   监听器都被摘掉。
 * - `items` 形如 `{ id, label, icon?, danger?, disabled? }`；`separator: true` 渲染一条分隔线。
 *   `icon` 是一段 SVG 标记（见 [menu-icons.js](menu-icons.js)），**只能是本仓库的常量**：
 *   它经 `innerHTML` 落地，接受调用方传入的任意串就等于开了个注入口。
 * - 返回幂等的 `close()`。菜单挂在 `document.body` 上，`z-index` 高于应用主体。
 * - 菜单元素带 `data-dsh-oi-owner`，值是开它的那份实例的 id。页面上同时存在两份实例
 *   时（插件装在 profile 里，注入式验证会再造一份），`querySelector` 只能按注册顺序
 *   拿到先挂的那个——**光看类名分不出这个菜单是谁开的**，而分不出就意味着点下去可能
 *   打在另一份实例的真服务上。
 */

const ROOT_CLASS = 'dsh-oi-menu'

/** 菜单元素上标记归属实例的属性名（`dataset` 侧写作 `dshOiOwner`）。 */
export const OWNER_ATTR = 'data-dsh-oi-owner'

/** @type {null | (() => void)} */
let activeClose = null

/**
 * 打开右键菜单。
 *
 * @param {{
 *   x: number,
 *   y: number,
 *   items: Array<{ id?: string, label?: string, icon?: string, danger?: boolean, disabled?: boolean, separator?: boolean }>,
 *   onSelect?: (id: string) => void,
 *   onClose?: () => void,
 *   owner?: string,
 *   anchor?: Element,
 * }} options `owner` 写进菜单元素的 `data-dsh-oi-owner`；缺省则不写该属性。
 *   `anchor` 是菜单指向的那个元素，决定哪次滚动会关掉菜单：只有整页滚动、或滚动的
 *   容器包含 `anchor` 时才关。**缺省则退回「任何滚动都关」**，那正是会话区流式输出
 *   时菜单自己消失的行为。
 * @returns {() => void} 幂等的关闭函数
 */
export function openContextMenu(options) {
  closeContextMenu()

  const { x, y, items, onSelect, onClose, owner } = options
  const anchor = options.anchor ?? null
  const root = document.createElement('div')
  root.className = ROOT_CLASS
  root.setAttribute('role', 'menu')
  if (owner !== undefined) root.setAttribute(OWNER_ATTR, owner)
  root.style.left = '0px'
  root.style.top = '0px'

  for (const item of items) {
    if (item.separator === true) {
      const hr = document.createElement('div')
      hr.className = `${ROOT_CLASS}__sep`
      root.append(hr)
      continue
    }
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `${ROOT_CLASS}__item`
    button.setAttribute('role', 'menuitem')
    if (item.icon !== undefined) {
      const icon = document.createElement('span')
      icon.className = `${ROOT_CLASS}__icon`
      icon.innerHTML = item.icon
      button.append(icon)
    }
    const label = document.createElement('span')
    label.className = `${ROOT_CLASS}__label`
    label.textContent = item.label ?? item.id ?? ''
    button.append(label)
    if (item.danger === true) button.dataset.danger = ''
    if (item.disabled === true) button.disabled = true
    button.addEventListener('click', () => {
      const id = item.id
      close()
      if (id !== undefined && onSelect !== undefined) onSelect(id)
    })
    root.append(button)
  }

  document.body.append(root)
  place(root, x, y)

  let closed = false
  const close = () => {
    if (closed) return
    closed = true
    activeClose = null
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('scroll', onScroll, true)
    window.removeEventListener('blur', close)
    window.removeEventListener('resize', close)
    root.remove()
    if (onClose !== undefined) onClose()
  }

  /** @param {PointerEvent} event */
  const onPointerDown = (event) => {
    if (event.target instanceof Node && root.contains(event.target)) return
    close()
  }
  /** @param {KeyboardEvent} event */
  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }
  /**
   * 只有锚点跟着动的那次滚动才关菜单。
   *
   * 捕获阶段挂在 `window` 上的监听器会收到页面里**任何**滚动容器的事件——scroll 不
   * 冒泡，但捕获阶段照样从 window 往下派发。会话区流式输出时每来一段就自动滚到底
   * 一次，无差别关闭的表现就是「一边输出一边右键，菜单弹出来立刻消失」。
   *
   * @param {Event} event
   */
  const onScroll = (event) => {
    if (anchor === null) {
      close()
      return
    }
    const target = event.target
    // 整页滚动：锚点整体平移，而菜单是 fixed 的，留着就错位。
    if (target === document || target === document.documentElement || target === document.body) {
      close()
      return
    }
    if (target instanceof Element && target.contains(anchor)) close()
  }

  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('blur', close)
  window.addEventListener('resize', close)

  activeClose = close
  return close
}

/** 关掉当前打开的菜单（没有则什么都不做）。 */
export function closeContextMenu() {
  if (activeClose !== null) activeClose()
}

/**
 * 把菜单摆在 (x, y)，超出视口时向内翻转。
 *
 * @param {HTMLElement} root
 * @param {number} x
 * @param {number} y
 */
function place(root, x, y) {
  const rect = root.getBoundingClientRect()
  const margin = 8
  let left = x
  let top = y
  if (left + rect.width + margin > window.innerWidth) left = Math.max(margin, x - rect.width)
  if (top + rect.height + margin > window.innerHeight) top = Math.max(margin, y - rect.height)
  root.style.left = `${left}px`
  root.style.top = `${top}px`
}

/**
 * 菜单与多选高亮的样式表；由 client 入口插入一次。
 *
 * 尺寸、圆角、字号、间距、hover 与分隔线全部照抄应用自己的菜单——具体是
 * `ui-primitives/src/Menu.module.css` 的**默认档**（`.list` / `.item` / `.itemIcon`
 * / `.itemLabel` / `.separator`），而不是 `.compactList`：侧边栏那两处「...」菜单渲染
 * `Menu` 时既没传 `compact` 也没传 `dense`，抄紧凑档就和被对齐的目标差一整个尺寸级。
 * 值取自它的规则而不是另调一套，主题换皮时两者一起变。
 *
 * 用到的 token 必须真实存在：写错的名字不会报错，只会静默落到 `var()` 的兜底值上，
 * 于是「跟随主题」这件事从来没发生过，换主题才暴露。
 */
export const MENU_CSS = `
.${ROOT_CLASS} {
  /* 浮层底色只能取 surface token。--dsw-alias-bg-base 是页面底色，自定义主题会给它
     alpha（实测某主题为 0.58）好让壁纸透上来，菜单绑它就等于跟着一起透。 */
  --dsw-oi-surface: var(--dsw-specific-menu, var(--dsw-alias-bg-layer-3, #2c2c2e));
  box-sizing: border-box;
  position: fixed;
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  min-width: 218px;
  max-width: 360px;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid var(--dsw-alias-border-inverted, rgba(128,128,128,0.3));
  /* 两层：主题色画在 background-image 上，垫在它下面的 background-color 是同族的另一个
     surface。主题真把 --dsw-specific-menu 定成半透明时，合成结果仍比页面底色实。 */
  background-color: var(--dsw-alias-bg-layer-1, #2c2c2e);
  background-image: linear-gradient(var(--dsw-oi-surface), var(--dsw-oi-surface));
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0, 0, 0, 0.28));
  color: var(--dsw-alias-label-primary, inherit);
  pointer-events: auto;
  user-select: none;
}
.${ROOT_CLASS}__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 40px;
  padding: 8px 10px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--dsw-alias-label-primary, inherit);
  font-size: 14px;
  line-height: 22px;
  text-align: left;
  cursor: pointer;
}
.${ROOT_CLASS}__item:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.18)); }
.${ROOT_CLASS}__item:disabled { opacity: 0.4; cursor: not-allowed; }
.${ROOT_CLASS}__item[data-danger] { color: var(--dsw-alias-state-error-primary, #e5484d); }
.${ROOT_CLASS}__item[data-danger]:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover-danger, rgba(229, 72, 77, 0.16)); }
.${ROOT_CLASS}__icon {
  display: inline-flex;
  flex: none;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-label-tertiary, inherit);
}
.${ROOT_CLASS}__item[data-danger] .${ROOT_CLASS}__icon { color: var(--dsw-alias-state-error-primary, #e5484d); }
.${ROOT_CLASS}__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.${ROOT_CLASS}__sep {
  height: 1px;
  margin: 4px 2px;
  background: var(--dsw-alias-border-l1, rgba(128,128,128,0.25));
}
[data-dsh-oi-selected] {
  background: var(--dsw-alias-bg-multi-select, rgba(77, 107, 254, 0.22)) !important;
  border-radius: 6px;
}
`
