/**
 * 实测驱动：在运行中的 DSH 页面上验证功能 10（会话行选中态强化 + 运行中光线边框）。
 *
 * 与 [verify-active-dot-live.mjs](verify-active-dot-live.mjs) 同构：被验的是一张纯
 * 样式表，页面自带的插件实例已经把它插进 `<head>`，脚本不注入 bundle、不 apply ctx，
 * 断言读的是真实端到端路径的效果。探针是脚本现搭的行：class 从页面真实样式表里反查
 * hash 前缀（`_sessionRow` 等名字逐版本变，不能写死），并带上上游的 `selected` /
 * `dropAfter` 类——**与上游规则形成真实的特异性竞争**，这正是本次改动的全部内容。
 *
 * 不等真的运行中会话：那要在测试栈里真跑一轮模型调用，代价远大于多验到的东西
 * （同一个 `data-state` 字面量、同一条 `:has()` 规则）。也不等真的选中行：选中样式
 * 由 `aria-selected` 驱动，探针写这个属性与上游写是同一件事。
 *
 * **两套读数口径**：规则胜负读 computed style（哪条规则赢、值是不是设计 token，特异性
 * 胜负在这里已经见分晓，截图只会把同一个问题问得更贵）；**多选可辨性读屏幕像素**——那一组
 * 量的是「用户看不看得出来」，而多选底色是半透明色叠在侧栏那条图层链上，按 token 值手工
 * 合成会算出屏幕上不存在的底色（实测差一倍亮度，见
 * [交接 022](../docs/handoff/022-multiselect-contrast-baseline.md)）。
 *
 * 用法：node scripts/verify-row-states-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过 Page.reload
 */
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
}

// ---- 页面侧搭探针 ----
const setup = await evaluate(`(() => {
  // 反查上游 hash 前缀：找形如 '.XXXX_sessionRow{...height:32px...' 的规则。
  let sessionRowClass = null
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    if (rules === null) continue
    for (const rule of rules) {
      const sel = rule.selectorText
      if (typeof sel !== 'string') continue
      const m = sel.match(/\\.([A-Za-z0-9]+_sessionRow)\\b/)
      if (m !== null) { sessionRowClass = m[1]; break }
    }
    if (sessionRowClass !== null) break
  }
  if (sessionRowClass === null) return { fatal: 'page-missing-sessionrow-rule' }
  const prefix = sessionRowClass.slice(0, sessionRowClass.indexOf('_sessionRow') + 1)
  const cls = {
    row: sessionRowClass,
    selected: prefix + 'selected',
    title: prefix + 'title',
    time: prefix + 'time',
    dropAfter: prefix + 'dropAfter',
  }
  // 反查不到上游 selected 规则不致命：它只影响「竞争是否真实」，断言照跑，
  // 但要在报告里可见。
  let upstreamSelectedRule = false
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    if (rules === null) continue
    for (const rule of rules) {
      const sel = rule.selectorText
      if (typeof sel === 'string' && sel.includes('.' + cls.row) && sel.includes('.' + cls.selected)) {
        upstreamSelectedRule = true
      }
    }
  }

  const ourSheet = [...document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]')].at(-1) ?? null

  const NS = 'http://www.w3.org/2000/svg'
  const ongoingDot = () => {
    const svg = document.createElementNS(NS, 'svg')
    svg.setAttribute('data-state', 'ongoing')
    return svg
  }
  const mkRow = ({ selected = false, running = false, multi = false, drop = false, text = '探针行' }) => {
    const row = document.createElement('div')
    row.className = cls.row
    row.setAttribute('role', 'treeitem')
    if (selected) { row.setAttribute('aria-selected', 'true'); row.classList.add(cls.selected) }
    else row.setAttribute('aria-selected', 'false')
    if (multi) row.setAttribute('data-dsh-oi-selected', '')
    if (drop) row.classList.add(cls.dropAfter)
    const title = document.createElement('span')
    title.className = cls.title
    title.textContent = text
    const time = document.createElement('span')
    time.className = cls.time
    time.textContent = '3 分钟前'
    row.append(title, time)
    if (running) row.append(ongoingDot())
    return row
  }

  const host = document.createElement('div')
  host.id = 'dsh-oi-row-states-probe'
  host.dataset.dshOiProbe = 'rows'
  host.style.cssText = 'display:flex;flex-direction:column;gap:2px;pointer-events:none'
  // **探针挂在真实侧栏列表里，不挂在 body 下。**多选底色是半透明色，它叠在侧栏那条图层链
  // 上（容器背景 + 第三方主题的半透明层 + 画布），挂在 body 下按 token 值手工合成会算出一个屏幕
  // 上不存在的底色：实测第三方主题在场上时 token 名义值 rgb(106,88,52)、屏幕像素
  // rgb(81,68,43)，同一枚描边因此被读成 3.03× 而不是 4.18×。挂在真实列表里，token 作用域
  // 与背景叠层都跟真行一致，截图取到的就是用户看到的那块。
  // 挑行要按几何挑：页面上还有别处带的 _sessionRow 后代（实测见过 361×16 的一条，挂在
  // 会话区而不是侧栏），第一条可见的不是它——但它会让像素全落在同一种底色上。
  const candidates = [...document.querySelectorAll('.' + CSS.escape(cls.row))]
    .map((r) => ({ r, b: r.getBoundingClientRect() }))
    .filter(({ b }) => b.height >= 24 && b.height <= 48 && b.width >= 120 && b.width <= 340
      && b.top > 0 && b.bottom < window.innerHeight)
    .sort((a, b2) => a.b.top - b2.b.top)
  if (candidates.length === 0) return { fatal: 'no-visible-session-row' }
  const realRow = candidates[0].r
  const listHost = realRow.parentElement
  const rows = {
    control: mkRow({}),
    sel: mkRow({ selected: true }),
    run: mkRow({ running: true }),
    combo: mkRow({ selected: true, running: true }),
    multi: mkRow({ selected: true, multi: true }),
    multiRun: mkRow({ running: true, multi: true }),
    drop: mkRow({ running: true, drop: true }),
  }
  host.append(...Object.values(rows))
  // 错峰容器：3 条运行中行按 1/2/3 排，nth-child 的相位差要能读出来。
  const stagger = document.createElement('div')
  stagger.style.cssText = 'display:flex;flex-direction:column'
  const staggerRows = [mkRow({ running: true }), mkRow({ running: true }), mkRow({ running: true })]
  stagger.append(...staggerRows)
  host.append(stagger)
  listHost.append(host)
  host.scrollIntoView({ block: 'nearest' })
  // 别名色探针：**挂在 host 里**（也就是侧栏子树内），不挂 body——token 可能在侧栏容器上
  // 被重定义，body 下读到的是另一档色。断言里的期望值取自页面自己的 token 解析结果，
  // 不硬编码。tertiary 也探一份：某些第三方主题把 label-secondary 与 label-tertiary 解析
  // 成同一个色，这时「时间提亮」只能验到「规则挂上了正确的 token」，验不到可见变亮——
  // 断言按这个降级口径写。多选配色不在这里探：它由多选行自己的 computed 值与屏幕像素推，
  // 探一枚与规则无关的别名 token 只会让断言锚回一个已经弃用的基线。
  const alias = {}
  for (const [name, token] of Object.entries({
    labelSecondary: '--dsw-alias-label-secondary, #999',
    labelTertiary: '--dsw-alias-label-tertiary, #777',
  })) {
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;left:-9999px;background-color:rgba(0,0,0,0);color:rgb(' + '0,0,0' + ')'
    el.style.setProperty('background-color', 'var(' + token + ')')
    el.style.setProperty('color', 'var(' + token + ')')
    host.append(el)
    alias[name] = { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }
    el.remove()
  }
  // 把 box-shadow 的首个颜色分量抠出来：描边的 computed 值是 color-mix 的解析结果，
  // 自定义属性里留着未解析的 color-mix() 字符串，两者不能混用。
  // **不能按空白切**——color(srgb 0.529 0.661 0.992) 内部有空格，按空格切只会切出
  // "color(srgb" 这种碎片。改按 "0px" / "inset" 这些阴影独有的 token 定位。
  const shadowColor = (shadow) => {
    const m = shadow.match(/^(.+?)\\s+(?:-?\\d[\\d.]*px|inset)/)
    return m === null ? '' : m[1]
  }
  const tokenColor = (name) => {
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;left:-9999px'
    el.className = cls.row
    el.setAttribute('role', 'treeitem')
    el.style.setProperty('background-color', 'var(' + name + ')')
    host.append(el)
    const out = getComputedStyle(el).backgroundColor
    el.remove()
    return out
  }
  const cs = (el, pseudo) => getComputedStyle(el, pseudo ?? null)
  window.__dshOiRows__ = {
    rows, staggerRows, alias, host, ourSheet, cls,
    shadowColor,
    // 截图取样要的几何：三条行的位置（多选行给描边与填充，对照行给普通行底色，
    // 多选行左外侧给侧栏底色本身）。每次现读，滚动与翻主题都会动它。
    rects: () => {
      const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height } }
      return { multi: r(rows.multi), control: r(rows.control) }
    },
    // 可辨性判据的 computed 侧读数：描边解析色（用来核对截图像素取到的是不是同一枚）、
    // 以及「翻档到底改了什么」（档位可达性守卫的输入）。
    colorRead: () => ({
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      outline: shadowColor(cs(rows.multi).boxShadow),
      fill: cs(rows.multi).backgroundColor,
      labelPrimary: tokenColor('--dsw-alias-label-primary, #0f1115'),
      sidebarFill: cs(rows.multi).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
    }),
    // 翻主题并要求它**存活到截图结束**：主题控制器（第三方在场时是每一帧）会把
    // data-ds-dark-theme 写回，一次性翻转撑不过 Page.captureScreenshot 的往返，所以挂
    // MutationObserver 把每一次写回都立刻翻回来（同 verify-active-dot 的 flip/unflip）。
    flipTo: (wantDark) => {
      const p = window.__dshOiRows__
      if (p._obs !== undefined) return false
      p._orig = document.body.hasAttribute('data-ds-dark-theme')
      const enforce = () => {
        if (document.body.hasAttribute('data-ds-dark-theme') !== wantDark) {
          if (wantDark) document.body.setAttribute('data-ds-dark-theme', '')
          else document.body.removeAttribute('data-ds-dark-theme')
        }
      }
      enforce()
      p._obs = new MutationObserver(enforce)
      p._obs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      return true
    },
    flipBack: () => {
      const p = window.__dshOiRows__
      if (p._obs === undefined) return false
      p._obs.disconnect()
      delete p._obs
      if (p._orig) document.body.setAttribute('data-ds-dark-theme', '')
      else document.body.removeAttribute('data-ds-dark-theme')
      delete p._orig
      return true
    },
    read: (key) => {
      const el = rows[key]
      const before = cs(el, '::before')
      const after = cs(el, '::after')
      return {
        bg: cs(el).backgroundColor,
        boxShadow: cs(el).boxShadow,
        position: cs(el).position,
        beforeContent: before.content,
        beforeWidth: before.width,
        beforeBg: before.backgroundColor,
        afterContent: after.content,
        afterAnimName: after.animationName,
        afterAnimDuration: after.animationDuration,
        afterAnimDelay: after.animationDelay,
        afterDisplay: after.display,
        afterFilter: after.filter,
        afterMaskComposite: after.maskComposite || after.webkitMaskComposite,
        titleWeight: cs(el.querySelector('.' + CSS.escape(cls.title))).fontWeight,
      }
    },
    timeColor: (key) => cs(rows[key].querySelector('.' + CSS.escape(cls.time))).color,
    staggerDelays: () => staggerRows.map((el) => cs(el, '::after').animationDelay),
  }
  return {
    cls, upstreamSelectedRule,
    ourSheetPresent: ourSheet !== null,
    ourSheetHasCss: ourSheet !== null && ourSheet.textContent.includes('dsh-oi-row-sweep'),
    // 表内顺序契约：ROW_STATES 段必须出现在多选规则段之前。
    rowStatesBeforeMenu: ourSheet !== null
      && ourSheet.textContent.indexOf('dsh-oi-row-sweep') !== -1
      && ourSheet.textContent.indexOf('dsh-oi-row-sweep') < ourSheet.textContent.indexOf('dsh-oi-selected'),
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    // 探针落点：host 挂在真实会话列表里，与真行同父同叠层。像素那三条判据量的底色只有
    // 在这个前提下才是用户看到的那块底。
    siblingRows: [...listHost.children].filter((el) => el.classList.contains(cls.row)).length,
    rowBox: candidates[0].b.toJSON(),
  }
})()`)

if (setup.fatal !== undefined) {
  const reasons = {
    'no-sessionRow-rule': '上游可能改了实现或 class 命名——这时本覆盖已经失效，先核对 ui-workspace 的 Rows.module.css。',
    'no-visible-session-row': '页面里没有一条几何正常的可见会话行（24~48px 高、120~340px 宽）——侧栏被折叠、或列表还没渲染出来。像素判据必须有真侧栏当底，这时不测。',
  }
  abort(`探针前置缺失：${setup.fatal}`, reasons[setup.fatal] ?? '核对上游 Rows.module.css 与侧栏渲染状态。')
}
if (!setup.ourSheetPresent) {
  abort(
    '页面里没有本插件插入的样式表',
    'style[data-plugin="@Tinnikx/dsh-operation-improve"] 不存在：插件没装进 profile，或页面没加载完。',
  )
}

const DARK = '34, 211, 238'
const LIGHT = '21, 94, 117'
const { check, report } = createChecker()

check('页面自带样式表带上了功能 10 的 CSS（构建 → profile → 页面 端到端）', setup.ourSheetHasCss,
  (v) => v === true || '页面加载的是旧产物：先重新构建，再刷新页面')
check('表内顺序契约：ROW_STATES 段在多选规则段之前', setup.rowStatesBeforeMenu,
  (v) => v === true || '叠加态（选中+多选）的归属由这条顺序决定，join 数组被改动了')
check('上游 selected 竞争规则在场（特异性竞争真实成立）', setup.upstreamSelectedRule,
  (v) => v === true || '没反查到 .sessionRow.selected 规则——覆盖前的基线变了，去核对上游 CSS')
// 像素判据量的底色只有在真实会话列表里才成立：探针与真行同父，吃同一条图层链。
check('探针挂在真实会话列表里（与真行同父，底色叠层一致）', { siblingRows: setup.siblingRows, rowBox: setup.rowBox },
  (v) => v.siblingRows >= 1 || `探针父容器里没有别的会话行（siblingRows=${v.siblingRows}）——截图像素量的不是侧栏底`)

const signal = setup.dark ? DARK : LIGHT
const other = setup.dark ? LIGHT : DARK

// ---- 选中态 ----
const sel = await evaluate('window.__dshOiRows__.read("sel")')
check(`选中行底色 = 青填充（赢上游 selected=hover 同色规则，${setup.dark ? '深' : '浅'}色主题）`, sel.bg,
  (v) => v === `rgba(${signal}, 0.1)` || `期望 rgba(${signal}, 0.1)，实测 ${v}`)
check('选中行竖条 ::before（content + 3px + 信号色）', sel,
  (v) => (v.beforeContent === '""' && v.beforeWidth === '3px' && v.beforeBg === `rgb(${signal})`)
    || `期望 3px 实色竖条，实测 content=${v.beforeContent} width=${v.beforeWidth} bg=${v.beforeBg}`)
check('选中行标题字重 600', sel.titleWeight,
  (v) => v === '600' || `期望 600，实测 ${v}`)
const timeColors = await evaluate(`(() => ({
  sel: window.__dshOiRows__.timeColor('sel'),
  control: window.__dshOiRows__.timeColor('control'),
  secondary: window.__dshOiRows__.alias.labelSecondary.bg,
  tertiary: window.__dshOiRows__.alias.labelTertiary.bg,
}))()`)
check('选中行时间挂上 label-secondary token', timeColors,
  (v) => (v.sel === v.secondary && (v.secondary === v.tertiary || v.control !== v.secondary))
    || `期望 sel=${v.secondary}（且该主题下对照行不是 secondary），实测 ${JSON.stringify(v)}`)

// ---- 对照行 ----
const control = await evaluate('window.__dshOiRows__.read("control")')
check('对照行无装饰（背景透明、无伪元素）', control,
  (v) => (v.bg === 'rgba(0, 0, 0, 0)' && v.beforeContent === 'none' && v.afterContent === 'none')
    || `期望全空，实测 bg=${v.bg} before=${v.beforeContent} after=${v.afterContent}`)

// ---- 运行中 ----
const run = await evaluate('window.__dshOiRows__.read("run")')
check('运行中行底色 = 青填充（:has 特异度天然压过上游 hover/selected）', run.bg,
  (v) => v === `rgba(${signal}, 0.1)` || `期望 rgba(${signal}, 0.1)，实测 ${v}`)
check('运行中行静默底边（inset 1px 信号色 .15）', run.boxShadow,
  (v) => v.includes(`rgba(${signal}, 0.15)`) || `期望含 rgba(${signal}, 0.15) 的 inset 阴影，实测 ${v}`)
check('彗尾 ::after（动画名 + 2.4s + 描边 mask）', run,
  (v) => (v.afterAnimName === 'dsh-oi-row-sweep' && v.afterAnimDuration === '2.4s'
    && (v.afterMaskComposite ?? '').split(',')[0].trim() === 'exclude')
    || `期望 sweep 动画与 exclude 描边，实测 name=${v.afterAnimName} dur=${v.afterAnimDuration} mask=${v.afterMaskComposite}`)
check('彗尾辉光（drop-shadow 挂在伪元素上）', run.afterFilter,
  (v) => v.startsWith('drop-shadow') || `期望 drop-shadow(...)，实测 ${v}`)

// ---- 叠加态 ----
const combo = await evaluate('window.__dshOiRows__.read("combo")')
check('选中+运行中：填充提到 .14', combo.bg,
  (v) => v === `rgba(${signal}, 0.14)` || `期望 rgba(${signal}, 0.14)，实测 ${v}`)
check('选中+运行中：竖条与彗尾同现', combo,
  (v) => (v.beforeContent === '""' && v.afterAnimName === 'dsh-oi-row-sweep')
    || `期望两者都在，实测 before=${v.beforeContent} after=${v.afterAnimName}`)
const multi = await evaluate('window.__dshOiRows__.read("multi")')
// 底色不再读 bg-multi-select（那是中性灰，与侧边栏底色 1.07×，看不出被选中）；
// 这条只管「哪条规则赢」：多选行的背景不能是功能 10 的青信号色。
check('选中+多选：底色归多选规则（表内顺序契约的落点）', multi.bg,
  (v) => (v !== `rgba(${signal}, 0.1)` && v !== `rgba(${signal}, 0.14)` && !v.includes(signal))
    || `期望多选填充色（不该是功能 10 的信号色），实测 ${v}`)
check('选中+多选：青色竖条保留（伪元素不吃背景）', multi.beforeContent === '""' && multi.beforeBg === `rgb(${signal})`,
  (v) => v === true || '竖条丢了')

// ---- 多选可辨性（用户诉求：任何主题都要一眼看出）----
// 判据是 WCAG 对比度，不是「颜色不一样」。底色填充无论多深都只有 ~1.4×，承重的是描边，
// 所以断言分开写：描边对侧边栏底色过 3:1（WCAG 非文本），填充对普通行底色只要求
// 1.15×（保证不是「看不出差」——3:1 那条是描边的活，不强加给填充）。
//
// **量的是屏幕像素，不是「token 值 + 手工合成」。**多选底色是一层半透明色，它叠在侧栏那条
// 图层链（容器背景 + 第三方主题的半透明层 + 画布）上；把 token 当成不透明来混会算出一块
// 屏幕上不存在的底色——实测第三方主题在场上时 token 名义值 rgb(106,88,52)、真实像素
// rgb(81,68,43)，同一枚描边因此被读成 3.03×，真实是 4.18×（见
// [交接 022](handoff/022-multiselect-contrast-baseline.md)）。像素没有这层近似。
// 取样点：描边取多选行**上边缘**那 1px 带（左边缘被功能 10 的青色竖条盖住），行内填充取多选
// 行中段，普通行底色取对照行中段（都取中位数，跳过标题字形），侧栏底色取多选行左边缘外侧 2~8px。
const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
const cr = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
const median = (list) => {
  const s = list.filter((p) => Array.isArray(p)).sort((a, b) => lum(a) - lum(b))
  return s.length === 0 ? null : s[Math.floor(s.length / 2)]
}
const sameColor = (a, b, tol = 6) => Array.isArray(a) && Array.isArray(b)
  && a.every((v, i) => Math.abs(v - b[i]) <= tol)
/** `color(srgb .536 .668 .997)` / `rgb(27, 27, 28)` / `#5686fe` → [r,g,b]。 */
const parseRgb = (value) => {
  if (typeof value !== 'string') return null
  const srgb = value.match(/color\(srgb\s+([^)]+)\)/)
  if (srgb !== null) {
    return srgb[1].split(/[\s/]+/).filter(Boolean).slice(0, 3).map((v) => Math.round(Number(v) * 255))
  }
  const hex = value.match(/^#([0-9a-f]{6})$/i)
  if (hex !== null) return [1, 3, 5].map((i) => parseInt(hex[1].slice(i - 1, i + 1), 16))
  const nums = value.match(/[\d.]+/g)
  if (nums === null) return null
  return nums.slice(0, 3).map(Number)
}
const fmt = (c) => (Array.isArray(c) ? `rgb(${c.join(',')})` : String(c))
/**
 * 一片像素里的**主导色**：按 16 级量化分桶，取像素最多的那桶再求均值。
 *
 * 不能取一条扫描线的中位数（字形会把它抬高），也不能按逐像素完全相等分桶求众数：第三方主题
 * 把侧栏渲染成模糊纹理，逐像素都不同（实测同一行内红通道从 97 跳到 140），相等分桶的主导桶
 * 只剩 8 个点、还被白色字形抢走。量化到 16 级把纹理并成一桶，均值给出这块板的感知色。
 * `coverage`（主导桶占采样点的比例）同时是**平色性**的读数：纹理主题的 coverage 远低于 1，
 * 那种现场「底色」不是一个数，对比度也就不是一个数——判据据此 SKIP，见下面平色性守卫。
 */
const dominant = (pixels) => {
  const buckets = new Map()
  for (const p of pixels) {
    const key = `${p[0] >> 4},${p[1] >> 4},${p[2] >> 4}`
    const b = buckets.get(key)
    if (b === undefined) buckets.set(key, [p])
    else b.push(p)
  }
  let best = null
  for (const b of buckets.values()) if (best === null || b.length > best.length) best = b
  if (best === null || best.length === 0) return { rgb: null, n: 0, total: pixels.length, coverage: 0 }
  const sum = [0, 1, 2].map((i) => best.reduce((s, p) => s + p[i], 0) / best.length)
  return { rgb: sum.map((v) => Math.round(v)), n: best.length, total: pixels.length, coverage: best.length / pixels.length }
}
/** 平色性的门槛：主导桶要占住七成采样点，否则这块底不是「一个颜色」。 */
const FLAT_COVERAGE = 0.7
const isFlat = (v) => v.fillCoverage >= FLAT_COVERAGE && v.plainCoverage >= FLAT_COVERAGE
/** 同上，但把 alpha 单独交出来：`color(srgb .337 .525 .996 / 0.24)` 是多选行的 computed 背景。 */
const parseAlpha = (value) => {
  if (typeof value !== 'string') return null
  const srgb = value.match(/color\(srgb\s+([^)]+)\)/)
  if (srgb !== null) {
    const parts = srgb[1].split(/[\s/]+/).filter(Boolean).map(Number)
    return { rgb: parts.slice(0, 3).map((v) => v * 255), a: parts.length > 3 ? parts[3] : 1 }
  }
  const nums = value.match(/[\d.]+/g)
  if (nums === null) return null
  const n = nums.map(Number)
  return { rgb: n.slice(0, 3), a: n.length > 3 ? n[3] : 1 }
}
/** 半透明色叠在不透明底色上的结果——**只在「底色已是屏幕真实值」时才用它做同源核对**。 */
const overSurface = (fg, bg) => {
  const f = parseAlpha(fg)
  if (f === null || !Array.isArray(bg)) return null
  return f.rgb.map((c, i) => Math.round(c * f.a + bg[i] * (1 - f.a)))
}

/** 截下探针那几行并按取样点回读像素。翻档窗口内调用，靠 `flipTo` 的守卫撑住主题。 */
async function shoot() {
  const geometry = await evaluate(`(() => {
    const p = window.__dshOiRows__
    const r = p.rects()
    const inView = r.multi.y > 0 && r.multi.y + r.multi.h < window.innerHeight - 2
      && r.control.y > 0 && r.control.y + r.control.h < window.innerHeight - 2
    return { ...r, inView, vh: window.innerHeight }
  })()`)
  if (!geometry.inView) {
    abort('探针行不在视口内，截不到像素', `多选行 y=${geometry.multi.y} 高 ${geometry.multi.h}，视口高 ${geometry.vh}——真实列表里那条可见会话行找不到？`)
  }
  const clip = {
    x: geometry.multi.x - 12,
    y: geometry.control.y,
    width: geometry.multi.w + 132,
    height: geometry.multi.y + geometry.multi.h - geometry.control.y + 2,
  }
  const res = await conn.send('Page.captureScreenshot', {
    format: 'png', clip: { ...clip, scale: 4 }, captureBeyondViewport: false,
  })
  const data = res.result?.data
  if (typeof data !== 'string') {
    abort('Page.captureScreenshot 没有返回图像', `CDP 回包：${JSON.stringify(res).slice(0, 300)}`)
  }
  const raw = await evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + ${JSON.stringify(data)}
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const SCALE = img.width / ${JSON.stringify(clip.width)}
    const cx = ${JSON.stringify(clip.x)}
    const cy = ${JSON.stringify(clip.y)}
    const px = (cssX, cssY) => {
      const x = Math.round((cssX - cx) * SCALE)
      const y = Math.round((cssY - cy) * SCALE)
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) return null
      return [...g.getImageData(x, y, 1, 1).data].slice(0, 3)
    }
    // 取样坐标用截图**之前**那次读到的几何，不在这里重读：两次读之间若页面滚了一行，
    // 重读会让所有点整体偏移，取到的底色当成填充、量出一个自洽的假读数。
    const r = ${JSON.stringify({ multi: geometry.multi, control: geometry.control })}
    // 描边取**上边缘**那 1px 带、横向避开圆角（x+40）。左边缘不行：多选行同时也是选中行，
    // 功能 10 的 3px 青色竖条画在 left:0 会把描边盖住——实测这条同源检查第一次就跑红了，
    // 取到的是 rgb(34,211,238)（竖条）而不是描边。
    const ring = [px(r.multi.x + 40, r.multi.y + 0.15), px(r.multi.x + 40, r.multi.y + 0.5), px(r.multi.x + 40, r.multi.y + 0.85)]
    // 行内色：把整片内部的像素原样回传，归类在 node 侧做。网格避开上下 5px（描边带）与左右
    // 30px（青色竖条与圆角）。不能取一条扫描线的中位数：行里有标题与时间字形（选中行的标题
    // 还是 600 字重），字形会把行内色抬高——实测抬到 rgb(92,98,113)，比按 alpha 合成的
    // rgb(82,84,95) 亮一档，「描边 vs 内侧填充」因此报出过 2.69 这种不存在的失败。
    const region = (box) => {
      const out = []
      for (let x = box.x + 30; x < box.x + box.w - 30; x += 6) {
        for (let y = box.y + 5; y < box.y + box.h - 5; y += 5) {
          const p = px(x, y)
          if (p !== null) out.push(p)
        }
      }
      return out
    }
    const fill = region(r.multi)
    // 侧栏底色的参照是**对照行内部**（无装饰那条），不是行外侧 gutter：实测 gutter 比行内亮
    // 一档（棕色现场 rgb(94,85,67) 对 rgb(81,68,42)），那是另一块板，不是行的底。
    const plain = region(r.control)
    return { ring, fill, plain }
  })()`)
  const computed = await evaluate('window.__dshOiRows__.colorRead()')
  const ringPick = median(raw.ring)
  // 环上三点必须同色，否则说明没踩在描边带上（1px 带受亚像素取整影响会半混）。
  const spread = Math.max(...raw.ring.filter(Boolean).map((p) => Math.max(...p.map((v, i) => Math.abs(v - (ringPick ?? [0, 0, 0])[i])))))
  const fillPick = dominant(raw.fill)
  const plainPick = dominant(raw.plain)
  return {
    computed,
    ring: ringPick,
    ringSpread: spread,
    fill: fillPick.rgb,
    fillSamples: fillPick.n,
    fillPoints: raw.fill.length,
    fillCoverage: fillPick.coverage,
    // 参照与行内色同源：都取主导桶均值。
    plain: plainPick.rgb,
    plainSamples: plainPick.n,
    plainPoints: raw.plain.length,
    plainCoverage: plainPick.coverage,
  }
}

const asLoaded = await shoot()
// 一条像素都取不到 = 截图这条链坏了（CDP 没出图、探针被 React 摘掉、视口里没有行），不是
// 「现场测不了」。这种情况必须 abort 点名，不能被平色守卫吞成一条 SKIP。
if (asLoaded.plain === null || asLoaded.fill === null || asLoaded.ring === null || asLoaded.fillPoints === 0) {
  abort('截图像素取不到，可辨性判据没有输入', `多选行 ${asLoaded.fillPoints} 个采样点、对照行 ${asLoaded.plainPoints} 个，主导色 ${fmt(asLoaded.fill)}——截图没出图或探针不在视口内。`)
}
const schemeNames = asLoaded.computed.dark ? ['深色', '浅色'] : ['浅色', '深色']
const LEGIBLE_TITLES = ['多选描边 vs 侧边栏底色 ≥ 3:1', '多选描边 vs 描边内侧填充 ≥ 3:1', '多选填充 vs 普通行底色 ≥ 1.15×']
const SOURCES = ['描边像素与解析色同源（截图确实取到了这枚描边）', '内侧填充像素与合成值同源（行内取样没被字形污染）']
const pct = (x) => `${Math.round(x * 100)}%`

const legibleOf = (label, v) => {
  check(`${LEGIBLE_TITLES[0]}（${label}）`, cr(v.ring, v.plain),
    (x) => x >= 3 || `期望 ≥3，实测 ${x.toFixed(2)}（描边 ${fmt(v.ring)} vs 底 ${fmt(v.plain)}）`)
  check(`${LEGIBLE_TITLES[1]}（${label}）`, cr(v.ring, v.fill),
    (x) => x >= 3 || `期望 ≥3，实测 ${x.toFixed(2)}（描边 ${fmt(v.ring)} vs 填充 ${fmt(v.fill)}）`)
  check(`${LEGIBLE_TITLES[2]}（${label}）`, cr(v.fill, v.plain),
    (x) => x >= 1.15 || `期望 ≥1.15，实测 ${x.toFixed(2)}（填充 ${fmt(v.fill)} vs 普通行 ${fmt(v.plain)}）`)
}
const skipEach = (titles, reason, extra) => {
  for (const t of titles) check(t, { skipped: reason, ...extra }, () => true)
}

// **平色性守卫**（先于两档的一切可辨性读数）：判据的另一半「底色」必须是一个颜色才有对比度
// 可言。第三方主题把侧栏渲染成模糊纹理时它不是一个颜色——实测同一行内相邻采样点红通道从 97
// 跳到 140，主导桶只占 49% 的采样点，取到的「底」完全取决于点撞在哪，于是「2.41×」这种读数
// 是取样噪声而不是观感。这种现场明说测不了（SKIP），比报一条随取样点漂移的红绿灯诚实。
if (!isFlat(asLoaded)) {
  const reason = `本现场的侧栏底不是一个颜色：多选行内主导桶只占 ${pct(asLoaded.fillCoverage)} 的采样点、对照行占 ${pct(asLoaded.plainCoverage)}（模糊纹理，逐像素都不同），对比度在这里不是一个数`
  const extra = { fillCoverage: pct(asLoaded.fillCoverage), plainCoverage: pct(asLoaded.plainCoverage), plain: asLoaded.plain }
  check('侧栏底是平色（可辨性判据的前提）', { skipped: reason, ...extra }, () => true)
  skipEach(SOURCES, reason, extra)
  skipEach(LEGIBLE_TITLES.map((t) => `${t}（${schemeNames[0]}主题·现场）`), reason, extra)
  skipEach(LEGIBLE_TITLES.map((t) => `${t}（${schemeNames[1]}主题）`), reason, extra)
} else {
  check('侧栏底是平色（可辨性判据的前提）', { fillCoverage: pct(asLoaded.fillCoverage), plainCoverage: pct(asLoaded.plainCoverage) },
    (v) => (isFlat(asLoaded)) || `主导桶占比不足 ${pct(FLAT_COVERAGE)}：${JSON.stringify(v)}`)

  // **描边像素与解析色同源**：截图取到的那一列得就是 box-shadow 算出来的那枚颜色，否则后面
  // 三个对比度量的都不是本插件的描边。踩偏（没落在 1px 带上、或被别的装饰盖住）在这里暴露：
  // 实测第一版取行左边缘，取到的是功能 10 的青色竖条 rgb(34,211,238)，三条判据全被抬成假绿。
  check(SOURCES[0], { pixel: asLoaded.ring, computed: asLoaded.computed.outline, spread: asLoaded.ringSpread },
    (v) => (v.spread <= 6 && sameColor(v.pixel, parseRgb(v.computed), 8))
      || `期望截图像素 ≈ ${v.computed}（同带宽内三点同色），实测 ${fmt(v.pixel)}（三点差 ${v.spread}）`)

  // **内侧填充像素与「computed 背景叠在实测底上」同源**：这条守着取样本身。行里有标题与时间
  // 字形，一条扫描线的中位数会被字形抬高（实测抬到 rgb(92,98,113)，比合成值 rgb(82,84,94)
  // 亮一档，「描边 vs 内侧填充」因此报出过 2.69 这种不存在的失败）。
  check(SOURCES[1], {
    pixel: asLoaded.fill,
    expect: overSurface(asLoaded.computed.fill, asLoaded.plain),
    css: asLoaded.computed.fill,
    plain: asLoaded.plain,
    coverage: `${asLoaded.fillSamples}/${asLoaded.fillPoints}`,
  }, (v) => (v.expect !== null && sameColor(v.pixel, v.expect, 8))
      || `期望 ≈ ${fmt(v.expect)}（${v.css} 叠在 ${fmt(v.plain)} 上），实测主导色 ${fmt(v.pixel)}（主导桶占 ${v.coverage} 个采样点）`)

  // 页面开局那一档就是用户屏幕上那一档，无条件量。
  legibleOf(`${schemeNames[0]}主题·现场`, asLoaded)

  const flipped = await evaluate(`window.__dshOiRows__.flipTo(${String(!asLoaded.computed.dark)})`)
  if (flipped !== true) abort('翻主题守卫没能挂上', 'flipTo 返回 false：上一次翻档的观察者没摘干净。')
  const otherScheme = await shoot()
  await evaluate('window.__dshOiRows__.flipBack()')

  // **档位可达性守卫**：第二档靠摘 `data-ds-dark-theme` 造。第三方主题把底色与文字色钉成
  // `!important` 时，摘属性只换得动强调色——量到的是「上游浅档强调色 + 深档底色 + 深档文字」
  // 这种页面从不渲染的组合（旧判据就是这么报出 2.62× 的假红灯，见
  // [交接 022](handoff/022-multiselect-contrast-baseline.md)）。所以翻档后底色像素一个像素都
  // 没动，就明说这一档没测到，而不是报一条假失败。
  const surfaceMoved = !sameColor(otherScheme.plain, asLoaded.plain, 2)
  if (!surfaceMoved) {
    skipEach(LEGIBLE_TITLES.map((t) => `${t}（${schemeNames[1]}主题）`),
      `${schemeNames[1]}主题在本现场渲染不出来：翻档后侧栏底色像素没变（两档都是 ${fmt(otherScheme.plain)}），有第三方样式把它钉住了；label-primary 同样是 ${otherScheme.computed.labelPrimary}`,
      { plain: otherScheme.plain, labelPrimary: otherScheme.computed.labelPrimary })
  } else if (!isFlat(otherScheme)) {
    skipEach(LEGIBLE_TITLES.map((t) => `${t}（${schemeNames[1]}主题）`),
      `${schemeNames[1]}主题的侧栏底不是平色：主导桶只占 ${pct(otherScheme.fillCoverage)} / ${pct(otherScheme.plainCoverage)} 的采样点`,
      { fillCoverage: pct(otherScheme.fillCoverage), plainCoverage: pct(otherScheme.plainCoverage) })
  } else {
    legibleOf(`${schemeNames[1]}主题`, otherScheme)
  }
}

// 多选 + 运行中：功能 10 的静默底边是 (0,2,1)，会盖掉多选描边 (0,2,0)，批量圈选里的
// 运行中行会丢掉选中信号——断言要求描边取回且与信号色底边同现。
const multiRun = await evaluate('window.__dshOiRows__.read("multiRun")')
const multiRunOutline = await evaluate('window.__dshOiRows__.shadowColor(window.__dshOiRows__.read("multiRun").boxShadow)')
const plainOutline = await evaluate('window.__dshOiRows__.shadowColor(window.__dshOiRows__.read("multi").boxShadow)')
check('多选+运行中：描边取回且与静默底边同现', { ...multiRun, outline: multiRunOutline, plainOutline },
  (v) => (v.outline !== '' && v.outline === v.plainOutline && v.boxShadow.includes(`rgba(${signal}, 0.15)`))
    || `期望描边 ${v.plainOutline} 取回 + 静默底边 rgba(${signal}, 0.15)，实测 outline=${v.outline} shadow=${v.boxShadow}`)

// ---- 拖拽让位 ----
const drop = await evaluate('window.__dshOiRows__.read("drop")')
check('拖拽目标行：彗尾让位给上游插入线（:not(_drop) 守卫）', drop.afterAnimName,
  (v) => v === 'none' || `期望 none（我们的 ::after 不该参与竞争），实测 ${v}`)

// ---- 错峰 ----
const delays = await evaluate('window.__dshOiRows__.staggerDelays()')
check('三行错峰相位 0 / -0.8s / -1.6s', delays,
  (v) => (JSON.stringify(v) === JSON.stringify(['0s', '-0.8s', '-1.6s'])) || `期望 [0s,-0.8s,-1.6s]，实测 ${JSON.stringify(v)}`)

// ---- 主题切换 ----
// 摘属性、读数、还原必须在**同一次 evaluate** 里做完：应用的主题控制器会在下一帧
// 把 `data-ds-dark-theme` 写回 body，跨两次 evaluate 的窗口里属性已经回来了，
// 读到的是深色值（实测第一轮就是这么假失败）。
//
// **还原只写回自己摘掉的那一样**：页面本来就有该属性才补回去。无条件 `setAttribute`
// 会把一次浅色页（第三方背景插件被预检否决后回落到标准主题就是这种）抬成深色，
// 后面降级态那条拿着浅色信号色比的断言就变成假失败。
const lightRead = await evaluate(`(() => {
  const b = document.body
  const wasDark = b.hasAttribute('data-ds-dark-theme')
  b.removeAttribute('data-ds-dark-theme')
  const rows = window.__dshOiRows__
  const out = { selBg: rows.read('sel').bg, runShadow: rows.read('run').boxShadow, wasDark }
  if (out.wasDark) b.setAttribute('data-ds-dark-theme', '')
  return out
})()`)
check(`浅色主题下选中底色换暗青 rgba(${LIGHT}, 0.1)`, lightRead.selBg,
  (v) => v === `rgba(${LIGHT}, 0.1)` || `期望 rgba(${LIGHT}, 0.1)，实测 ${v}`)
check(`浅色主题下彗尾/底边颜色变量跟着换`, lightRead.runShadow,
  (v) => v.includes(`rgba(${LIGHT}, 0.15)`) || `期望含 rgba(${LIGHT}, 0.15)，实测 ${v}`)
// 复位判据取「这一轮开始时的主题」，不是写死深色；且与 lightRead 同源核对，
// 避免浅色页上「浅色测试没换出任何东西、复位测试又跟着错」。
const backToSetup = await evaluate('window.__dshOiRows__.read("run").bg')
const setupSignal = setup.dark ? DARK : LIGHT
check(`主题还原后底色回到开局那一档（${setup.dark ? '深' : '浅'}色）`, [lightRead.wasDark === setup.dark, backToSetup],
  ([same, bg]) => (same && bg === `rgba(${setupSignal}, 0.1)`)
    || `期望 wasDark=${setup.dark} 且底色 rgba(${setupSignal}, 0.1)，实测 wasDark=${lightRead.wasDark} 底色 ${bg}`)

// ---- 减少动态 ----
await conn.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
const reduced = await evaluate('window.__dshOiRows__.read("run")')
check('prefers-reduced-motion：彗尾熄灭，静默底边常亮', { display: reduced.afterDisplay, shadow: reduced.boxShadow.includes(`rgba(${signal}, 0.15)`) },
  (v) => (v.display === 'none' && v.shadow === true) || `期望 display:none + 底边在场，实测 ${JSON.stringify(v)}`)
await conn.send('Emulation.setEmulatedMedia', { features: [] })
const restored = await evaluate('window.__dshOiRows__.read("run")')
check('还原动态后彗尾复燃', restored.afterAnimName,
  (v) => v === 'dsh-oi-row-sweep' || `期望 dsh-oi-row-sweep，实测 ${v}`)

// ---- 清场 ----
const cleaned = await evaluate(`(() => {
  window.__dshOiRows__.host.remove()
  delete window.__dshOiRows__
  const b = document.body
  if (${setup.dark}) b.setAttribute('data-ds-dark-theme', '')
  else b.removeAttribute('data-ds-dark-theme')
  return {
    probeGone: document.getElementById('dsh-oi-row-states-probe') === null,
    leftovers: document.querySelectorAll('[data-dsh-oi-probe]').length,
    dark: b.hasAttribute('data-ds-dark-theme'),
  }
})()`)
check('清场：探针摘除、无残留、主题复位', cleaned,
  (v) => (v.probeGone && v.leftovers === 0 && v.dark === setup.dark) || `残留：${JSON.stringify(v)}`)

conn.ws.close()
report()
