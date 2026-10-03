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
 * **颜色断言读 computed style 而不是截图像素**：这里验的是「哪条规则赢、值是不是
 * 设计 token」，不是渲染合成结果；特异性胜负在 computed value 上已经见分晓，截图
 * 只会把同一个问题问得更贵。
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
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:0;bottom:0;width:320px;display:flex;flex-direction:column;gap:2px'
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
  // 别名色探针：断言里的期望值取自页面自己的 token 解析结果，不硬编码。
  // tertiary 也探一份：某些第三方主题把 label-secondary 与 label-tertiary 解析成
  // 同一个色（测试栈副本就撞上白色==白色），这时「时间提亮」只能验到「规则挂上了
  // 正确的 token」，验不到可见变亮——断言按这个降级口径写。
  // 多选配色不在这里探：它的期望值由多选行自己的 computed 值推（见 resolveOverSurface），
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
    document.body.append(el)
    alias[name] = { bg: getComputedStyle(el).backgroundColor, color: getComputedStyle(el).color }
    el.remove()
  }

  // 多选高亮的两枚自定义属性：描边色与填充色都从这读，断言不重算 color-mix。
  const custom = {}
  for (const [name, prop] of Object.entries({
    accent: '--dsh-oi-multi-accent',
    outline: '--dsh-oi-multi-outline',
  })) {
    const el = document.createElement('div')
    el.className = cls.row
    el.setAttribute('role', 'treeitem')
    el.setAttribute('data-dsh-oi-selected', '')
    el.style.cssText = 'position:absolute;left:-9999px'
    document.body.append(el)
    custom[name] = getComputedStyle(el).getPropertyValue(prop).trim()
    el.remove()
  }
  // 半透明色叠到侧边栏底色上的合成值。**不能靠 background-image 叠层再读
  // backgroundColor**——那读到的只是最底层的底色，叠在上面的渐变不进这个属性，
  // 拿到的永远是未合成的底色（实测第一版就是这么算出假读数）。这里自己按 alpha 混。
  // 解析器认两种写法：rgb()/rgba() 的 0~255 分量，与 color(srgb f f f / a) 的 0~1 分量
  // ——color-mix() 在 computed value 里就是后者。
  const parseColor = (value) => {
    const srgb = value.match(/color\\(srgb\\s+([^)]+)\\)/)
    if (srgb !== null) {
      const parts = srgb[1].split(/[\\s/]+/).filter(Boolean).map(Number)
      return { rgb: parts.slice(0, 3).map((v) => v * 255), a: parts.length > 3 ? parts[3] : 1 }
    }
    const nums = value.match(/[\\d.]+/g)
    if (nums === null) return null
    return {
      rgb: [Number(nums[0]), Number(nums[1]), Number(nums[2])],
      a: nums.length > 3 ? Number(nums[3]) : 1,
    }
  }
  const over = (fg, bg) => {
    const f = parseColor(fg)
    const s = parseColor(bg)
    if (f === null || s === null) return null
    return f.rgb.map((c, i) => c * f.a + s.rgb[i] * (1 - f.a))
  }
  // 侧边栏底色。**每次调用现读，不能在 setup 时缓存一次**：缓存下来的值属于当时那档
  // 主题，浅色档就会拿浅色描边去对深色底色比，算出一个根本不存在的低对比度。
  const surfaceColor = () => {
    const el = document.createElement('div')
    el.style.cssText = 'position:absolute;left:-9999px;background-color:var(--dsw-specific-sidebar-fill, #fff)'
    document.body.append(el)
    const out = getComputedStyle(el).backgroundColor
    el.remove()
    return out
  }
  // 把 box-shadow 的首个颜色分量抠出来：描边的 computed 值是 color-mix 的解析结果，
  // 自定义属性里留着未解析的 color-mix() 字符串，两者不能混用。
  // **不能按空白切**——color(srgb 0.529 0.661 0.992) 内部有空格，按空格切只会切出
  // "color(srgb" 这种碎片。改按 "0px" / "inset" 这些阴影独有的 token 定位。
  const shadowColor = (shadow) => {
    const m = shadow.match(/^(.+?)\\s+(?:-?\\d[\\d.]*px|inset)/)
    return m === null ? '' : m[1]
  }
  document.body.append(host)

  const cs = (el, pseudo) => getComputedStyle(el, pseudo ?? null)
  window.__dshOiRows__ = {
    rows, staggerRows, alias, custom, host, ourSheet, cls,
    resolveOverSurface: (colorValue) => {
      const mixed = over(colorValue, surfaceColor())
      return mixed === null ? '' : 'rgb(' + mixed.map((v) => Math.round(v)).join(', ') + ')'
    },
    shadowColor, surfaceColor,
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
    // 多选可辨性的全部读数。一次算完返回，好让深浅两档复用同一份实现。
    legible: () => {
      // 分量提取按括号内的纯数字走。**正则要写两个反斜杠**：这段代码本身在 setup 的
      // 模板字符串里，单反斜杠会被模板串先吃掉变成字面字母 d，于是 /[d.]+/g 只匹得到
      // 小数点，Number('.') 得 NaN，断言拿到的是 null 而不是数字。
      const srgb = (c) => {
        const body = c.slice(c.indexOf('(') + 1, c.lastIndexOf(')'))
        const parts = (body.match(/[\\d.]+/g) ?? []).slice(0, 3).map(Number)
        return c.startsWith('color(') ? parts.map((v) => v * 255) : parts
      }
      const lum = (c) => {
        const [r, g, b] = srgb(c).map((v) => {
          const s = v / 255
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
        })
        return 0.2126 * r + 0.7152 * g + 0.0722 * b
      }
      const cr = (a, b) => {
        const x = lum(a); const y = lum(b)
        return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
      }
      const over = (c) => window.__dshOiRows__.resolveOverSurface(c)
      const rd = (key) => window.__dshOiRows__.read(key)
      // 描边色取多选行 box-shadow 的解析结果，不是自定义属性里未解析的 color-mix() 字符串
      const outline = shadowColor(cs(rows.multi).boxShadow)
      const surface = surfaceColor()
      const plainBg = over(rd('control').bg)
      const selBg = over(rd('sel').bg)
      const multiBg = over(rd('multi').bg)
      return {
        surface, plainBg, selBg, multiBg, outline,
        outlineVsSurface: outline === '' ? 0 : cr(outline, surface),
        outlineVsFill: outline === '' ? 0 : cr(outline, multiBg),
        fillVsPlain: multiBg === '' ? 0 : cr(multiBg, plainBg),
        fillVsSelected: multiBg === '' ? 0 : cr(multiBg, selBg),
      }
    },
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
  }
})()`)

if (setup.fatal !== undefined) {
  abort(
    `页面里找不到上游 sessionRow 的样式规则（${setup.fatal}）`,
    '上游可能改了实现或 class 命名——这时本覆盖已经失效，先核对 ui-workspace 的 Rows.module.css。',
  )
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
// 期望值从多选行自己的填充合成结果读，断言只管「哪条规则赢」。
const expectMulti = await evaluate(`(() => {
  const rows = window.__dshOiRows__
  return rows.resolveOverSurface(rows.read('multi').bg)
})()`)
check('选中+多选：底色归多选规则（表内顺序契约的落点）', { bg: multi.bg, alias: expectMulti },
  (v) => (v.bg !== `rgba(${signal}, 0.1)` && v.bg !== `rgba(${signal}, 0.14)` && !v.bg.includes(signal))
    || `期望多选填充色（不该是功能 10 的信号色），实测 ${v.bg}`)
check('选中+多选：青色竖条保留（伪元素不吃背景）', multi.beforeContent === '""' && multi.beforeBg === `rgb(${signal})`,
  (v) => v === true || '竖条丢了')

// ---- 多选可辨性（用户诉求：任何主题都要一眼看出）----
// 判据是 WCAG 对比度，不是「颜色不一样」。底色填充无论多深都只有 ~1.4×，承重的是描边，
// 所以断言分开写：描边对侧边栏底色过 3:1（WCAG 非文本），填充对普通行底色只要求
// 1.15×（保证不是「看不出差」——3:1 那条是描边的活，不强加给填充）。
// 深浅两档都跑：摘属性、读数、还原在同一次 evaluate 里做完（见「主题切换」一节的坑）。
const legibleDark = await evaluate('window.__dshOiRows__.legible()')
const legibleLight = await evaluate(`(() => {
  const b = document.body
  const wasDark = b.hasAttribute('data-ds-dark-theme')
  if (wasDark) b.removeAttribute('data-ds-dark-theme')
  const out = window.__dshOiRows__.legible()
  if (wasDark) b.setAttribute('data-ds-dark-theme', '')
  return out
})()`)
for (const [name, v] of [['深色', legibleDark], ['浅色', legibleLight]]) {
  check(`多选描边 vs 侧边栏底色 ≥ 3:1（${name}主题）`, v.outlineVsSurface,
    (x) => x >= 3 || `期望 ≥3，实测 ${x.toFixed(2)}（描边 ${v.outline} vs 底 ${v.surface}）`)
  check(`多选描边 vs 描边内侧填充 ≥ 3:1（${name}主题）`, v.outlineVsFill,
    (x) => x >= 3 || `期望 ≥3，实测 ${x.toFixed(2)}（描边 ${v.outline} vs 填充 ${v.multiBg}）`)
  check(`多选填充 vs 普通行底色 ≥ 1.15×（${name}主题）`, v.fillVsPlain,
    (x) => x >= 1.15 || `期望 ≥1.15，实测 ${x.toFixed(2)}（填充 ${v.multiBg} vs 普通行 ${v.plainBg}）`)
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
    dark: b.hasAttribute('data-ds-dark-theme'),
  }
})()`)
check('清场：探针摘除、主题复位', cleaned,
  (v) => (v.probeGone && v.dark === setup.dark) || `残留：${JSON.stringify(v)}`)

conn.ws.close()
report()
