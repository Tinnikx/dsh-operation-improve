/**
 * 实测驱动：在运行中的 DSH 页面上验证活跃标记（`StateDot state="ongoing"`）的配色覆盖。
 *
 * 与另外三个 verify 脚本不同，这里**不注入 bundle、不 apply 任何 ctx**：被验的是
 * 一张纯样式表，而页面自带的那份插件实例已经把它插进 `<head>` 了。脚本因此走的是
 * 真实端到端路径——构建产物经 profile 装载、由页面自己的实例插入，断言读的是那张表
 * 的效果，不是脚本自己复制的一份 CSS。
 *
 * 覆盖前的基线靠**摘掉页面自带的那张样式表**取得（`disabled = true`，测完还原），
 * 而不是另开一个干净页面：同一个 DOM 上一摘一装，前后两组读数才可比。
 *
 * 上游的 ongoing 是一枚旋转弧线 spinner：`svg[data-state='ongoing']` 里
 * `g`（旋转动画）包两个 `circle`——静默底环（track，`opacity: .25`）与亮弧
 * （arc，dash 动画）。探针元素是脚本现搭的同构 spinner，class 从页面真实样式表里
 * 反查（CSS module 的 hash 名逐版本变，不能写死），所以它与上游规则形成的是**真实
 * 的特异性竞争**——本覆盖恰恰全部建立在赢过它们上（svg 的 color、底环的 opacity）。
 * 不去等一个真的活跃会话：那需要在测试栈里真的跑起一轮模型调用，代价与风险都远大于
 * 它能多验到的东西（同一个组件、同一条 CSS 规则）。
 *
 * 采样：svg 放到 96px 见方（viewBox 24，环宽按 CSS 渲染约 8px），底环与亮弧各截一
 * 张——截图时另一条用行内 `visibility: hidden` 摘掉（它是几何隔离，不是配色替身），
 * 亮弧那张另把 dash 拉成整环（`stroke-dasharray: none`），采样点不随旋转漂移。
 * **对比度读的是截图像素，但底色是脚本垫出来的名义值**：装了壁纸主题的页面整个 UI
 * 是半透明的，不存在「一个底色」；名义底色深色取 `--dsw-static-neutral-bluish-950`，
 * 浅色取白。前景那半必须是浏览器渲染出来的（color × opacity 的合成由它做）。
 *
 * CDP 连接与断言框架来自 [lib/cdp.mjs](lib/cdp.mjs)，判据语义（skip 也算失败、非零
 * 退出）与其余脚本共用一份实现。
 *
 * **默认打测试栈（3181）**，先 `node scripts/test-stack.mjs up`。
 *
 * 用法：node scripts/verify-active-dot-live.mjs [cdpPort] [pageUrlPrefix]
 * 环境变量：DSH_OI_NO_RELOAD=1 跳过 Page.reload
 */
import { abort, createEvaluator, reloadAndWait, createChecker, resolveTarget } from './lib/cdp.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))

/** 探针 svg 的边长（CSS px）。viewBox 24 → 4 倍，环宽 2 → 渲染约 8px。 */
const SIZE = 96
/** 环采样点：圆心正上方，ring 中线 r=9.5（viewBox 单位）→ 探针坐标 (SIZE/2, SIZE*(12-9.5)/24)。 */
const SAMPLE_X = SIZE / 2
const SAMPLE_Y = (SIZE * 2.5) / 24
/**
 * 亮弧采样点：动画冻结在 t=0 时 dash（12/59.7 周长 ≈ 72°）从 3 点钟起顺时针铺开，
 * 取其中间 36°。`stroke-dasharray` 由 dash 动画逐帧驱动，**动画优先于行内样式**，
 * 想拉成整环是拉不动的——只能冻住之后去弧在的地方采。
 */
const ARC_X = (SIZE * (12 + 9.5 * Math.cos(36 * Math.PI / 180))) / 24
const ARC_Y = (SIZE * (12 + 9.5 * Math.sin(36 * Math.PI / 180))) / 24

/**
 * 探针在视口里的落点（CSS px），与页面侧 `host` 的 fixed 定位写死成同一对数——
 * `Page.captureScreenshot` 的 `clip` 与它同系，两处对不上只表现为采到别处的像素，
 * 不报错。落点本身不挑地方：底色是探针自己垫的，压在什么内容上都不影响读数。
 */
const PROBE_X = 24
const PROBE_Y = 120

const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })

if (process.env.DSH_OI_NO_RELOAD !== '1') {
  await reloadAndWait(conn, { mountMs: 6000 })
}
await conn.send('Page.enable')

// 页面侧的探针。整段一次注入：中途每 evaluate 一次就新开一条连接，而探针元素、
// 摘掉的样式表这些状态必须跨断言存活，挂在 window 上比反复重建可靠。
const setup = await evaluate(`(() => {
  // 从页面真实样式表里反查上游 spinner 的三条 class（track / arc / motion）。
  // CSS module 的 hash 前缀逐版本变，按「选择器含 spinnerTrack」这类特征挑。
  // 跨 origin 的表读 cssRules 会抛，逐表 try 而不是整体包一个。
  const pick = (re) => {
    for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      if (rules === null) continue
      for (const rule of rules) {
        const sel = rule.selectorText
        if (typeof sel !== 'string') continue
        for (const part of sel.split(',')) {
          const m = part.trim().match(re)
          if (m !== null) return m[1]
        }
      }
    }
    return null
  }
  const trackClass = pick(/^\\.([\\w]*spinnerTrack[\\w]*)$/)
  const arcClass = pick(/^\\.([\\w]*spinnerArc[\\w]*)$/)
  const motionClass = pick(/^\\.([\\w]*spinnerMotion[\\w]*)$/)
  // spinner 根类必须与 track 同一 CSS module：页面里还有别的组件也叫 .spinner
  // （hash 前缀不同），拿错类的表现是探针渲染成别的几何，采样点落空。
  let spinnerClass = null
  if (trackClass !== null) {
    const mod = trackClass.match(/_([^_]+)_\\d+$/)
    spinnerClass = mod === null
      ? (pick(/^\\.(spinner)$/) ?? null)
      : pick(new RegExp('^\\\\.(_spinner_' + mod[1] + '_[\\\\w]+)$'))
  }
  let upstreamTrackOpacity = null
  if (trackClass !== null) {
    outer: for (const sheet of document.styleSheets) {
      let rules
      try { rules = sheet.cssRules } catch { continue }
      if (rules === null) continue
      for (const rule of rules) {
        if (typeof rule.selectorText === 'string'
          && rule.selectorText.split(',').some((s) => s.trim() === '.' + trackClass)) {
          if (rule.style.opacity !== '') { upstreamTrackOpacity = rule.style.opacity; break outer }
        }
      }
    }
  }
  if (trackClass === null || arcClass === null || motionClass === null || spinnerClass === null) {
    return { fatal: 'page-missing-statedot-rules', trackClass, arcClass, motionClass, spinnerClass }
  }

  // 探针：与上游 StateDot ongoing 同构的 spinner，几何按 viewBox 24 原样。
  const NS = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('data-state', 'ongoing')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(${SIZE}))
  svg.setAttribute('height', String(${SIZE}))
  svg.setAttribute('class', spinnerClass)
  svg.style.cssText = 'position:absolute;left:0;top:0;display:block'
  const g = document.createElementNS(NS, 'g')
  g.setAttribute('class', motionClass)
  const mk = (cls) => {
    const c = document.createElementNS(NS, 'circle')
    c.setAttribute('class', cls)
    c.setAttribute('cx', '12'); c.setAttribute('cy', '12'); c.setAttribute('r', '9.5')
    return c
  }
  const track = mk(trackClass)
  const arc = mk(arcClass)
  g.append(track, arc)
  svg.append(g)

  // 兄弟状态的探针（solid 那几档是 span[data-state]），证明覆盖没有误伤。
  const siblings = {}
  for (const state of ['done', 'warning', 'error']) {
    const span = document.createElement('span')
    span.setAttribute('data-state', state)
    span.style.cssText = 'position:absolute;left:-9999px'
    siblings[state] = span
  }

  const host = document.createElement('div')
  host.id = 'dsh-oi-active-dot-probe'
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:${PROBE_X}px;top:${PROBE_Y}px;width:' + (${SIZE} * 2) + 'px;height:${SIZE}px'
  host.append(svg, ...Object.values(siblings))
  document.body.append(host)

  // 名义底色。深色取页面自己的 static token（跟着上游改版走），浅色取白：
  // '--dsw-static-white' 在装了壁纸主题的页面上被改成了透明，不能用。
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;left:-9999px;background-color:var(--dsw-static-neutral-bluish-950)'
  document.body.append(probe)
  const darkBase = getComputedStyle(probe).backgroundColor
  probe.remove()
  const LIGHT_BASE = 'rgb(255, 255, 255)'
  const paint = () => {
    host.style.backgroundColor = document.body.hasAttribute('data-ds-dark-theme') ? darkBase : LIGHT_BASE
  }
  paint()

  const ourSheet = [...document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]')].at(-1) ?? null

  window.__dshOiDot__ = {
    host, svg, track, arc, siblings, ourSheet, paint,
    trackClass, arcClass, motionClass,
    /**
     * 隔离采样对象：亮时只亮被看的那条环。visibility 是几何隔离，不碰配色合成。
     * 两条动画（g 的旋转、arc 的 dash）冻在 t=0——**动画样式优先于行内样式**，
     * 冻住之前把 dasharray 改成整环是改不动的；冻住后弧固定在 3 点钟起顺时针
     * 72° 的扇区里，亮环采样点按那个扇区算。
     */
    isolate: (which) => {
      const p = window.__dshOiDot__
      p.track.style.visibility = which === 'track' ? 'visible' : 'hidden'
      p.arc.style.visibility = which === 'arc' ? 'visible' : 'hidden'
      p._frozen = []
      for (const el of [p.svg.firstElementChild, p.arc]) {
        for (const a of el.getAnimations()) { a.pause(); a.currentTime = 0; p._frozen.push(a) }
      }
    },
    /** 采样点命中自检：落空的典型表现是「环点和底色同色」，先回答那个像素上是谁。 */
    hitAtSample: (which) => {
      const x = which === 'arc' ? ${ARC_X} : ${SAMPLE_X}
      const y = which === 'arc' ? ${ARC_Y} : ${SAMPLE_Y}
      const el = document.elementFromPoint(${PROBE_X} + x, ${PROBE_Y} + y)
      return el === null ? 'none' : el.tagName + '.' + String(el.getAttribute('class') ?? '').slice(0, 30)
    },
    restoreIsolation: () => {
      const p = window.__dshOiDot__
      p.track.style.visibility = ''
      p.arc.style.visibility = ''
      for (const a of p._frozen ?? []) { a.play() }
      delete p._frozen
    },
    // 翻主题并要求它**存活到截图结束**。主题控制器会在两帧内把 data-ds-dark-theme
    // 写回真值，跨 evaluate 的一次性翻转撑不过 Page.captureScreenshot 的往返——
    // 所以挂观察者把它写掉的每一次都立刻翻回来；unflip 摘掉观察者并还原。
    flip: () => {
      const p = window.__dshOiDot__
      if (p._flipObs !== undefined) return false
      const wantDark = !document.body.hasAttribute('data-ds-dark-theme')
      p._flipOrig = document.body.hasAttribute('data-ds-dark-theme')
      const enforce = () => {
        if (document.body.hasAttribute('data-ds-dark-theme') !== wantDark) {
          if (wantDark) document.body.setAttribute('data-ds-dark-theme', '')
          else document.body.removeAttribute('data-ds-dark-theme')
        }
        p.paint()
      }
      enforce()
      p._flipObs = new MutationObserver(enforce)
      p._flipObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
      return wantDark
    },
    unflip: () => {
      const p = window.__dshOiDot__
      if (p._flipObs === undefined) return
      p._flipObs.disconnect()
      delete p._flipObs
      if (p._flipOrig) document.body.setAttribute('data-ds-dark-theme', '')
      else document.body.removeAttribute('data-ds-dark-theme')
      delete p._flipOrig
      p.paint()
    },
  }
  return {
    trackClass, arcClass, motionClass, spinnerClass, upstreamTrackOpacity,
    darkBase, lightBase: LIGHT_BASE,
    ourSheetPresent: ourSheet !== null,
    ourSheetHasOverride: ourSheet !== null && ourSheet.textContent.includes("svg[data-state='ongoing']"),
    dark: document.body.hasAttribute('data-ds-dark-theme'),
  }
})()`)

if (setup.fatal !== undefined) {
  abort(
    `页面里找不到上游 StateDot spinner 的样式规则（${setup.fatal}）`,
    `观测：trackClass=${setup.trackClass} arcClass=${setup.arcClass} motionClass=${setup.motionClass}。`
    + '上游可能改了实现或 class 前缀——这时本覆盖已经失效，先去核对 StateDot.module.css。',
  )
}
if (!setup.ourSheetPresent) {
  abort(
    '页面里没有本插件插入的样式表',
    'style[data-plugin="@Tinnikx/dsh-operation-improve"] 不存在：插件没装进 profile，或页面没加载完。'
    + '先确认 test-stack up 报告「本插件在名册里=true」，再确认页面已 mount。',
  )
}

const lin = (c) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
const contrast = (fg, bg) => {
  const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a)
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100
}
const rgb = (p) => `rgb(${p.join(',')})`

/**
 * 截下探针那一块，回读环采样点的像素与它旁边的底色。环上还有 2px 描边内侧的
 * 抗锯齿，采样点取 ring 中线；`clip.scale = 1` 让截图按 CSS 像素出图。
 *
 * @param {'track'|'arc'} which
 */
async function shoot(which) {
  const sx = which === 'arc' ? ARC_X : SAMPLE_X
  const sy = which === 'arc' ? ARC_Y : SAMPLE_Y
  await evaluate(`window.__dshOiDot__.isolate(${JSON.stringify(which)})`)
  const hit = await evaluate(`window.__dshOiDot__.hitAtSample(${JSON.stringify(which)})`)
  const res = await conn.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: PROBE_X, y: PROBE_Y, width: SIZE * 2, height: SIZE, scale: 1 },
    captureBeyondViewport: false,
  })
  await evaluate('window.__dshOiDot__.restoreIsolation()')
  const data = res.result?.data
  if (typeof data !== 'string') {
    abort('Page.captureScreenshot 没有返回图像', `CDP 回包：${JSON.stringify(res).slice(0, 400)}`)
  }
  const pixels = await evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + ${JSON.stringify(data)}
    await img.decode()
    const c = document.createElement('canvas')
    c.width = img.width; c.height = img.height
    const g = c.getContext('2d')
    g.drawImage(img, 0, 0)
    const at = (px, py) => [...g.getImageData(px, py, 1, 1).data].slice(0, 3)
    // clip 出图的宽是 SIZE*2 个 CSS px；k 把探针局部 CSS 坐标换算到出图像素
    // （dpr≠1 时 k≠1，算错只会表现为采到隔壁像素，不报错）。
    const k = img.width / (${SIZE} * 2)
    const ring = [at(Math.round(${sx} * k), Math.round(${sy} * k)),
                  at(Math.round(${sx} * k), Math.round(${sy} * k) + 1),
                  at(Math.round(${sx} * k), Math.round(${sy} * k) - 1)]
    // 三点必须同色，否则说明没踩在环上或环太细。
    const spread = Math.max(...ring.map((p) => Math.max(...p.map((v, i) => Math.abs(v - ring[0][i])))))
    const bx = Math.round(${SIZE} * 1.5 * k)
    const bgs = [at(bx, Math.round(4 * k)), at(bx, Math.round(${SIZE / 2} * k)), at(bx, img.height - Math.round(5 * k))]
    const bgSpread = Math.max(...bgs.map((p) => Math.max(...p.map((v, i) => Math.abs(v - bgs[0][i])))))
    return { imgW: img.width, imgH: img.height, ring: ring[0], spread, bg: bgs[1], bgUniform: bgSpread === 0, bgSpread,
      ringIsInk: !(ring[0][0] === bgs[0][0] && ring[0][1] === bgs[0][1] && ring[0][2] === bgs[0][2]) }
  })()`)
  return { hit, ...pixels }
}

const { check, report } = createChecker()

check('页面自带的样式表带上了覆盖（构建 → profile → 页面 端到端）', setup.ourSheetHasOverride,
  (v) => v === true || '页面加载的是旧产物：先 pnpm run build，再刷新页面')
check('探针垫的名义底色（深 / 浅）', { dark: setup.darkBase, light: setup.lightBase },
  (v) => v.dark === 'rgb(21, 21, 23)'
    || `期望 rgb(21, 21, 23)（--dsw-static-neutral-bluish-950），实测 ${v.dark}——上游改了 token 或页面主题覆盖了它`)

const readState = () => evaluate(`(() => {
  const p = window.__dshOiDot__
  const ts = getComputedStyle(p.track)
  const as = getComputedStyle(p.arc)
  const gs = getComputedStyle(p.svg.firstElementChild)
  const sib = {}
  for (const [state, el] of Object.entries(p.siblings)) {
    sib[state] = getComputedStyle(el).getPropertyValue('--dsh-state-ongoing').trim()
  }
  return {
    svgColor: getComputedStyle(p.svg).color,
    trackOpacity: ts.opacity, trackStroke: ts.stroke, trackStrokeWidth: ts.strokeWidth,
    arcOpacity: as.opacity, arcStroke: as.stroke,
    motionName: gs.animationName, motionDuration: gs.animationDuration,
    dark: document.body.hasAttribute('data-ds-dark-theme'),
    siblings: sib,
  }
})()`)

// ---- A 组：摘掉覆盖，测上游基线，证明「不明显」确实来自 opacity ----
await evaluate('window.__dshOiDot__.ourSheet.disabled = true')
const before = await readState()
const beforeTrack = await shoot('track')

check('上游 spinnerTrack 基线 opacity（规则文本）', setup.upstreamTrackOpacity,
  (v) => v === '0.25' || `期望 0.25，实测 ${v}`)
check('覆盖前 track computed opacity', before.trackOpacity,
  (v) => v === '0.25' || `期望 0.25，实测 ${v}`)
check('旋转动画在上游手里（motion 非空、1.5s）', { name: before.motionName, dur: before.motionDuration },
  (v) => (v.name !== 'none' && v.name.includes('dsh-state-dot-spin') && v.dur === '1.5s')
    || `期望 dsh-state-dot-spin / 1.5s，实测 ${JSON.stringify(v)}`)
check('底色采样均匀（探针没被遮住）', { uniform: beforeTrack.bgUniform, spread: beforeTrack.bgSpread },
  (v) => v.uniform === true || `底色那半不是纯色（极差 ${v.spread}），有东西盖在探针上，环的读数也不可信`)
check('采样点落在环上（与底色不同色）', beforeTrack,
  (v) => v.ringIsInk === true || `环点 ${rgb(v.ring)} 与底色相同——采样点命中的是 ${JSON.stringify(v.hit)}，探针几何或类名反查漂了`)

const beforeC = contrast(beforeTrack.ring, beforeTrack.bg)
check(`覆盖前底环对比度（截图像素：环 ${rgb(beforeTrack.ring)} / 底 ${rgb(beforeTrack.bg)}）`, beforeC,
  (v) => v < 2.6 || `期望 < 2.6（上游 .25 灰基线就在这个档，再高说明量的不是基线），实测 ${v}`)

// ---- B 组：装回覆盖 ----
await evaluate('window.__dshOiDot__.ourSheet.disabled = false')
const after = await readState()
const afterTrack = await shoot('track')
const afterArc = await shoot('arc')

const theme = after.dark ? '深色' : '浅色'
const expectColor = after.dark ? 'rgb(34, 211, 238)' : 'rgb(21, 94, 117)'
const afterTrackC = contrast(afterTrack.ring, afterTrack.bg)
const afterArcC = contrast(afterArc.ring, afterArc.bg)

check(`覆盖后 svg color（${theme}主题）`, after.svgColor,
  (v) => v === expectColor || `期望 ${expectColor}，实测 ${v}`)
check('覆盖后 track computed opacity', after.trackOpacity,
  (v) => v === '0.6' || `期望 0.6（特异性未赢过 .spinnerTrack），实测 ${v}`)
check('亮弧不受影响（opacity 1、stroke 同 currentColor）',
  { op: after.arcOpacity, same: after.arcStroke === after.svgColor },
  (v) => (v.op === '1' && v.same === true) || `期望 1 / currentColor，实测 ${JSON.stringify(v)}`)
check('动画仍由上游持有（覆盖没接管 animation）', { name: after.motionName, dur: after.motionDuration },
  (v) => (v.name === before.motionName && v.dur === '1.5s') || `前后不等：${JSON.stringify(v)} vs ${JSON.stringify(before.motionName)}`)
check(`覆盖后底环对比度（${theme}，截图像素：环 ${rgb(afterTrack.ring)} / 底 ${rgb(afterTrack.bg)}）`, afterTrackC,
  (v) => v >= 2.5 || `期望 >= 2.5，实测 ${v}`)
check(`覆盖后亮环对比度（${theme}，截图像素：环 ${rgb(afterArc.ring)}）`, afterArcC,
  (v) => v >= 4.0 || `期望 >= 4.0，实测 ${v}`)
check('底环对比度提升倍数', Math.round((afterTrackC / beforeC) * 100) / 100,
  (v) => v >= 1.5 || `期望至少 1.5×，实测 ${v}×`)
check('亮暗仍有差异（动感没被压平）', Math.round((afterArcC / afterTrackC) * 100) / 100,
  (v) => v >= 1.3 || `期望亮环至少是底环的 1.3×，实测 ${v}×`)
check('done/warning/error 未被误伤（不继承 ongoing 变量）', after.siblings,
  (v) => Object.values(v).every((x) => x === '') || `期望三个兄弟状态都读不到 --dsh-state-ongoing，实测 ${JSON.stringify(v)}`)

// ---- C 组：切到另一个主题，再量一轮。垫的底色跟着换，否则量的是青色压在深色底上
// ——那是 B 组已经量过的组合。翻转由守卫观察者撑住（理由见 setup 里 flip 的注释）。
await evaluate('window.__dshOiDot__.flip()')
const flipState = await readState()
const flipTrack = await shoot('track')
const flipArc = await shoot('arc')

const flipTheme = flipState.dark ? '深色' : '浅色'
const flipExpect = flipState.dark ? 'rgb(34, 211, 238)' : 'rgb(21, 94, 117)'
const flipTrackC = contrast(flipTrack.ring, flipTrack.bg)
const flipArcC = contrast(flipArc.ring, flipArc.bg)

check(`切到${flipTheme}主题后 svg color 跟着换`, flipState.svgColor,
  (v) => v === flipExpect || `期望 ${flipExpect}，实测 ${v}`)
check(`${flipTheme}主题底环对比度（截图像素：环 ${rgb(flipTrack.ring)} / 底 ${rgb(flipTrack.bg)}）`, flipTrackC,
  (v) => v >= 2.5 || `期望 >= 2.5，实测 ${v}`)
check(`${flipTheme}主题亮环对比度（截图像素：环 ${rgb(flipArc.ring)}）`, flipArcC,
  (v) => v >= 4.0 || `期望 >= 4.0，实测 ${v}`)

// 清场：探针、样式表、主题属性都要还原，页面留给下一次验证。
const cleaned = await evaluate(`(() => {
  const p = window.__dshOiDot__
  p.ourSheet.disabled = false
  p.host.remove()
  p.unflip()
  delete window.__dshOiDot__
  return {
    probeGone: document.getElementById('dsh-oi-active-dot-probe') === null,
    sheetEnabled: [...document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]')].every((s) => !s.disabled),
    dark: document.body.hasAttribute('data-ds-dark-theme'),
  }
})()`)
check('清场：探针摘除、样式表还原、主题复位', cleaned,
  (v) => (v.probeGone && v.sheetEnabled && v.dark === setup.dark) || `残留：${JSON.stringify(v)}`)

conn.ws.close()
report()
