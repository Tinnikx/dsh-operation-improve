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
  const alias = {}
  for (const [name, token] of Object.entries({
    multiSelect: '--dsw-alias-bg-multi-select, rgba(77, 107, 254, 0.22)',
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
  document.body.append(host)

  const cs = (el, pseudo) => getComputedStyle(el, pseudo ?? null)
  window.__dshOiRows__ = {
    rows, staggerRows, alias, host, ourSheet, cls,
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
const expectMulti = await evaluate('window.__dshOiRows__.alias.multiSelect.bg')
check('选中+多选：底色归多选蓝（表内顺序契约的落点）', { bg: multi.bg, alias: expectMulti },
  (v) => (v.bg === v.alias && !v.bg.includes(signal)) || `期望多选别名色 ${v.alias}，实测 ${v.bg}`)
check('选中+多选：青色竖条保留（伪元素不吃背景）', multi.beforeContent === '""' && multi.beforeBg === `rgb(${signal})`,
  (v) => v === true || '竖条丢了')

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
