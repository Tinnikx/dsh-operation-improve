/**
 * 实测驱动：在运行中的 DSH 页面上验证活跃标记（`StateDot state="ongoing"`）的配色覆盖。
 *
 * 与另外三个 verify 脚本不同，这里**不注入 bundle、不 apply 任何 ctx**：被验的是
 * 一张纯样式表，而页面自带的那份插件实例已经把它插进 `<head>` 了。脚本因此走的是
 * 真实端到端路径——`pnpm run build` 的产物经 profile 装载、由页面自己的实例插入，
 * 断言读的是那张表的效果，不是脚本自己复制的一份 CSS。
 *
 * 覆盖前的基线靠**摘掉页面自带的那张样式表**取得（`disabled = true`，测完还原），
 * 而不是另开一个干净页面：同一个 DOM 上一摘一装，前后两组读数才可比。
 *
 * 探针元素是脚本现搭的一个 `StateDot`，class 从页面真实样式表里反查（`_cell_` /
 * `_matrix_` 的 hash 名逐版本变，不能写死），所以它与上游那条规则形成的是**真实的
 * 特异性竞争**，而这正是本次改动的全部内容。不去等一个真的活跃会话：那需要在测试
 * 栈里真的跑起一轮模型调用，代价与风险都远大于它能多验到的东西（同一个组件、同一
 * 条 CSS 规则）。
 *
 * **对比度读的是截图像素，但底色是脚本垫出来的名义值**。前景那半必须是浏览器渲
 * 染出来的——`fill × opacity` 的合成由它做，脚本算一遍就等于验证脚本自己重写了
 * 一次被测逻辑。底色那半则不能取自页面：装了壁纸主题的页面整个 UI 是半透明的，
 * 标记压着的是一张逐像素变化的照片（实测同一列上下极差 187），`--dsw-alias-bg-base`
 * 本身就解析成 `rgba(108, 96, 97, .28)` 且不随主题变，从格子到 `html` 一层不透明背
 * 景都没有。那种页面上不存在「一个底色」，任何单点采样都是偶然值。所以探针自带一
 * 块名义底色（深色取页面的 `--dsw-static-neutral-bluish-950`，浅色取白），
 * `Page.captureScreenshot` 把格子连同这块底色一起截下来，两个颜色取自同一张图的两
 * 个像素——量的是「这个配色在标准主题底色上有多少对比度」，与用户装了什么主题无关。
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

/** 覆盖后四档不透明度的期望值，与 `src/active-dot/index.js` 的 keyframes 同源。 */
const EXPECTED_STEPS = [1, 0.85, 0.7, 0.6]

/** 采样相位（ms）。1s 周期四档各取中点，避开 12.5% 这类档位边界上的插值。 */
const PHASES = [60, 180, 310, 700]

/** 探针边长（CSS px）。够大才能在截图里取到一块不含抗锯齿边的纯色。 */
const CELL = 24

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
  // 从页面真实样式表里反查上游那条 cell 规则，拿到 hash 出来的 class 名。
  // 跨 origin 的表读 cssRules 会抛，逐表 try 而不是整体包一个。
  let cellClass = null
  let matrixClass = null
  let upstreamOpacity = null
  for (const sheet of document.styleSheets) {
    let rules
    try { rules = sheet.cssRules } catch { continue }
    if (rules === null) continue
    for (const rule of rules) {
      const sel = rule.selectorText
      if (typeof sel !== 'string') continue
      if (cellClass === null && /^\\._cell_/.test(sel) && rule.style.animationName !== '') {
        cellClass = sel.slice(1)
        upstreamOpacity = rule.style.opacity
      }
      // 上游把 --dsh-state-ongoing 写在 '.dot, .matrix' 的合并规则上，选择器不以
      // ._matrix_ 开头，所以按逗号分段再挑出 matrix 那一支。
      if (matrixClass === null && rule.style.getPropertyValue('--dsh-state-ongoing') !== '') {
        const part = sel.split(',').map((s) => s.trim()).find((s) => /^\\._matrix_/.test(s))
        if (part !== undefined) matrixClass = part.slice(1)
      }
    }
  }
  if (cellClass === null || matrixClass === null) {
    return { fatal: 'page-missing-statedot-rules', cellClass, matrixClass }
  }

  const CELL = ${CELL}
  // 格子铺满整个 svg：被测的是配色与不透明度，几何不是；铺满才能在截图里取到一块
  // 足够大的纯色，中心采样碰不到边缘的抗锯齿。
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('data-state', 'ongoing')
  svg.setAttribute('viewBox', '0 0 10 10')
  svg.setAttribute('width', String(CELL))
  svg.setAttribute('height', String(CELL))
  svg.setAttribute('class', matrixClass)
  svg.style.cssText = 'position:absolute;left:0;top:0;display:block'
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
  rect.setAttribute('class', cellClass)
  rect.setAttribute('x', '0'); rect.setAttribute('y', '0')
  rect.setAttribute('width', '10'); rect.setAttribute('height', '10')
  svg.append(rect)

  // 兄弟状态的探针，用来证明覆盖没有误伤 done / warning / error。移出可视区，
  // 免得混进截图。
  const siblings = {}
  for (const state of ['done', 'warning', 'error']) {
    const span = document.createElement('span')
    span.setAttribute('data-state', state)
    span.style.cssText = 'position:absolute;left:-9999px'
    siblings[state] = span
  }

  // 探针左半是格子、右半只有底色。底色由脚本垫成主题的名义值：装了壁纸主题的页
  // 面上没有真实底色可测（半透明 UI 浮在照片上），而名义底色是这次配色要保证的
  // 那个基准。垫在 host 上而不是 svg 上，格子那半才是「格子压在底色上」。
  const host = document.createElement('div')
  host.id = 'dsh-oi-active-dot-probe'
  host.style.cssText = 'position:fixed;z-index:2147483647;pointer-events:none;left:${PROBE_X}px;top:${PROBE_Y}px;width:' + (CELL * 2) + 'px;height:' + CELL + 'px'
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
    host, svg, rect, siblings, ourSheet, paint,
    /** 暂停动画并定到某个相位，返回该相位下的 computed opacity。截图前必须先定住：
     *  运行中截到的是任意一帧，前后两组读数不可比。 */
    freeze: (t) => {
      const anims = rect.getAnimations()
      if (anims.length === 0) return null
      anims[0].pause()
      anims[0].currentTime = t
      return Number(getComputedStyle(rect).opacity)
    },
    resume: () => { for (const a of rect.getAnimations()) a.play() },
    /** 四相位逐个定住读 opacity，读完恢复播放。 */
    sample: () => {
      const anims = rect.getAnimations()
      if (anims.length === 0) return null
      const a = anims[0]
      a.pause()
      const out = []
      for (const t of ${JSON.stringify(PHASES)}) {
        a.currentTime = t
        out.push(Number(getComputedStyle(rect).opacity))
      }
      a.play()
      return out
    },
  }
  return {
    cellClass, matrixClass, upstreamOpacity, darkBase, lightBase: LIGHT_BASE,
    ourSheetPresent: ourSheet !== null,
    ourSheetHasOverride: ourSheet !== null && ourSheet.textContent.includes('dsh-oi-state-dot-chase'),
    dark: document.body.hasAttribute('data-ds-dark-theme'),
  }
})()`)

if (setup.fatal !== undefined) {
  abort(
    `页面里找不到上游 StateDot 的样式规则（${setup.fatal}）`,
    `观测：cellClass=${setup.cellClass} matrixClass=${setup.matrixClass}。`
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
 * 定住相位、截下探针那一块，回读格子色与它旁边的底色。
 *
 * `clip.scale = 1` 让截图按 CSS 像素出图，坐标与 `host` 的 fixed 定位同系；不这么
 * 定就要跟着 `devicePixelRatio` 换算，而换算错了只表现为采到隔壁像素，不报错。
 *
 * PNG 的解码借页面自己的 `Image` + `canvas` 做——脚本这一侧没有图像库，而为了读
 * 三个像素引一个依赖不划算。
 *
 * @param {number} phase 动画相位（ms）
 * @returns {Promise<{ opacity: number|null, cell: number[], bg: number[], bgUniform: boolean, spread: number }>}
 */
async function shoot(phase) {
  const opacity = await evaluate(`window.__dshOiDot__.freeze(${phase})`)
  // conn.send 回的是整条 CDP 消息，不是 result；截图数据在 res.result.data 上。
  const res = await conn.send('Page.captureScreenshot', {
    format: 'png',
    clip: { x: PROBE_X, y: PROBE_Y, width: CELL * 2, height: CELL, scale: 1 },
    captureBeyondViewport: false,
  })
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
    const cx = Math.round(img.width * 0.25)
    const bx = Math.round(img.width * 0.75)
    const cy = Math.round(img.height / 2)
    // 底色那半是脚本自己垫的纯色，多点必须完全一致；不一致说明有东西盖在探针上，
    // 那时格子那半读到的也不是格子，宁可判失败。
    const bgs = [at(bx, 4), at(bx, cy), at(bx, img.height - 5)]
    const spread = Math.max(...bgs.map((p) => Math.max(...p.map((v, i) => Math.abs(v - bgs[0][i])))))
    return { cell: at(cx, cy), bg: bgs[1], bgUniform: spread === 0, spread }
  })()`)
  await evaluate('window.__dshOiDot__.resume()')
  return { opacity, ...pixels }
}

const { check, report } = createChecker()

check('页面自带的样式表带上了覆盖（构建 → profile → 页面 端到端）', setup.ourSheetHasOverride,
  (v) => v === true || '页面加载的是旧产物：先 pnpm run build，再刷新页面')
check('探针垫的名义底色（深 / 浅）', { dark: setup.darkBase, light: setup.lightBase },
  (v) => v.dark === 'rgb(21, 21, 23)'
    || `深色底色期望 rgb(21, 21, 23)（--dsw-static-neutral-bluish-950），实测 ${v.dark}——上游改了 token 或页面主题覆盖了它`)

// ---- A 组：摘掉覆盖，测上游基线，证明「不明显」确实来自 opacity ----
await evaluate('window.__dshOiDot__.ourSheet.disabled = true')
const beforeSteps = await evaluate('window.__dshOiDot__.sample()')
const beforeFill = await evaluate('getComputedStyle(window.__dshOiDot__.rect).fill')
const beforeDim = await shoot(PHASES.at(-1))
const beforeBright = await shoot(PHASES[0])

check('上游 cell 规则的基线 opacity', setup.upstreamOpacity,
  (v) => v === '0.15' || `期望 0.15，实测 ${v}`)
check('覆盖前 fill 是品牌蓝 deepseek-450', beforeFill,
  (v) => v === 'rgb(86, 134, 254)' || `期望 rgb(86, 134, 254)，实测 ${v}`)
check('覆盖前四相位 opacity', beforeSteps,
  (v) => (Array.isArray(v) && Math.abs(Math.min(...v) - 0.15) < 0.001) || `期望最低档 0.15，实测 ${JSON.stringify(v)}`)
check('底色采样均匀（探针没被遮住）', { uniform: beforeDim.bgUniform, spread: beforeDim.spread },
  (v) => v.uniform === true || `底色那半不是纯色（极差 ${v.spread}），有东西盖在探针上，格子那半也不可信`)

const beforeDimC = contrast(beforeDim.cell, beforeDim.bg)
const beforeBrightC = contrast(beforeBright.cell, beforeBright.bg)
check(`覆盖前暗格对比度（截图像素：格 ${rgb(beforeDim.cell)} / 底 ${rgb(beforeDim.bg)}）`, beforeDimC,
  (v) => v < 1.5 || `期望 < 1.5（这就是「不明显」的量），实测 ${v}`)
check(`覆盖前亮格对比度（截图像素：格 ${rgb(beforeBright.cell)}）`, beforeBrightC,
  (v) => typeof v === 'number' || '读不到')

// ---- B 组：装回覆盖 ----
await evaluate('window.__dshOiDot__.ourSheet.disabled = false')
const afterSteps = await evaluate('window.__dshOiDot__.sample()')
const afterState = await evaluate(`(() => {
  const p = window.__dshOiDot__
  const cs = getComputedStyle(p.rect)
  const sib = {}
  for (const [state, el] of Object.entries(p.siblings)) {
    sib[state] = getComputedStyle(el).getPropertyValue('--dsh-state-ongoing').trim()
  }
  return { fill: cs.fill, animationName: cs.animationName, dark: document.body.hasAttribute('data-ds-dark-theme'), siblings: sib }
})()`)
const afterDim = await shoot(PHASES.at(-1))
const afterBright = await shoot(PHASES[0])

const theme = afterState.dark ? '深色' : '浅色'
const expectFill = afterState.dark ? 'rgb(34, 211, 238)' : 'rgb(21, 94, 117)'
const afterDimC = contrast(afterDim.cell, afterDim.bg)
const afterBrightC = contrast(afterBright.cell, afterBright.bg)

check('覆盖后 animation-name 接管', afterState.animationName,
  (v) => v === 'dsh-oi-state-dot-chase' || `期望 dsh-oi-state-dot-chase（特异性未赢过上游），实测 ${v}`)
check(`覆盖后 fill（${theme}主题）`, afterState.fill,
  (v) => v === expectFill || `期望 ${expectFill}，实测 ${v}`)
check('覆盖后四相位 opacity 落在设计档位', afterSteps,
  (v) => (Array.isArray(v) && v.length === EXPECTED_STEPS.length
    && v.every((x, i) => Math.abs(x - EXPECTED_STEPS[i]) < 0.001))
    || `期望 ${JSON.stringify(EXPECTED_STEPS)}，实测 ${JSON.stringify(v)}`)
check(`覆盖后暗格对比度（${theme}，截图像素：格 ${rgb(afterDim.cell)} / 底 ${rgb(afterDim.bg)}）`, afterDimC,
  (v) => v >= 2.8 || `期望 >= 2.8，实测 ${v}`)
check(`覆盖后亮格对比度（${theme}，截图像素：格 ${rgb(afterBright.cell)}）`, afterBrightC,
  (v) => v >= 4.5 || `期望 >= 4.5，实测 ${v}`)
check('暗格对比度提升倍数', Math.round((afterDimC / beforeDimC) * 100) / 100,
  (v) => v >= 2 || `期望至少 2×，实测 ${v}×`)
check('亮暗仍有差异（动画没被压平）', Math.round((afterBrightC / afterDimC) * 100) / 100,
  (v) => v >= 1.3 || `期望亮格至少是暗格的 1.3×，实测 ${v}×`)
check('done/warning/error 未被误伤（不继承 ongoing 变量）', afterState.siblings,
  (v) => Object.values(v).every((x) => x === '') || `期望三个兄弟状态都读不到 --dsh-state-ongoing，实测 ${JSON.stringify(v)}`)

// ---- C 组：切到另一个主题，再截一次。垫的底色也要跟着换，否则量的是青色压在
// 深色底上——那是 B 组已经量过的组合。
await evaluate(`(() => {
  const b = document.body
  if (b.hasAttribute('data-ds-dark-theme')) b.removeAttribute('data-ds-dark-theme')
  else b.setAttribute('data-ds-dark-theme', '')
  window.__dshOiDot__.paint()
})()`)
const flipState = await evaluate(`(() => ({
  fill: getComputedStyle(window.__dshOiDot__.rect).fill,
  dark: document.body.hasAttribute('data-ds-dark-theme'),
}))()`)
const flipDim = await shoot(PHASES.at(-1))
const flipBright = await shoot(PHASES[0])

const flipTheme = flipState.dark ? '深色' : '浅色'
const flipExpect = flipState.dark ? 'rgb(34, 211, 238)' : 'rgb(21, 94, 117)'
const flipDimC = contrast(flipDim.cell, flipDim.bg)
const flipBrightC = contrast(flipBright.cell, flipBright.bg)

check(`切到${flipTheme}主题后 fill 跟着换`, flipState.fill,
  (v) => v === flipExpect || `期望 ${flipExpect}，实测 ${v}`)
check(`${flipTheme}主题暗格对比度（截图像素：格 ${rgb(flipDim.cell)} / 底 ${rgb(flipDim.bg)}）`, flipDimC,
  (v) => v >= 2.8 || `期望 >= 2.8，实测 ${v}`)
check(`${flipTheme}主题亮格对比度（截图像素：格 ${rgb(flipBright.cell)}）`, flipBrightC,
  (v) => v >= 4.5 || `期望 >= 4.5，实测 ${v}`)

// 清场：探针、样式表、主题属性都要还原，页面留给下一次验证。
const cleaned = await evaluate(`(() => {
  const p = window.__dshOiDot__
  p.ourSheet.disabled = false
  p.host.remove()
  const b = document.body
  if (${setup.dark}) b.setAttribute('data-ds-dark-theme', '')
  else b.removeAttribute('data-ds-dark-theme')
  delete window.__dshOiDot__
  return {
    probeGone: document.getElementById('dsh-oi-active-dot-probe') === null,
    sheetEnabled: [...document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]')].every((s) => !s.disabled),
    dark: b.hasAttribute('data-ds-dark-theme'),
  }
})()`)
check('清场：探针摘除、样式表还原、主题复位', cleaned,
  (v) => (v.probeGone && v.sheetEnabled && v.dark === setup.dark) || `残留：${JSON.stringify(v)}`)

conn.ws.close()
report()
