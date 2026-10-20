/**
 * 功能 12 的端到端验证：模型下拉里的厂商分组标题是否有常态区分带。
 *
 * 不注入 bundle、不 apply 自造 ctx，验的是页面自带的实例——本功能一行 JS 都不跑，
 * 全部判据都落在「真开一次下拉、截真实屏幕像素」上。纯 computed style 不足以证明
 * 「看得见」：菜单底是半透明的，填充的对比度只有被毛玻璃合成之后才是真值。
 *
 * 断言清单（15 条）：
 *   1. 页面里本插件的样式表在（前置：没有它后面全是假绿）
 *   2. 开下拉后厂商标题存在，且它所在的分组里确实有模型行（`role="menuitemradio"`）
 *   3. 该标题计算值：`border-radius: 0`（上游给非 macOS 的 12px 药丸被抹平）
 *   4. 常态带在菜单底上看得见（浅 ≥1.05 / 深 ≥1.15；现状是 1.02）
 *   5. 常态带平色性：主导桶占比 ≥ 0.9（底不是一个颜色时读数字没有意义）
 *   6. 底部横线与它所在带的对比度 ≥ 3.0（承重信号）
 *   7. 横线像素与它的 computed 解析值同源（防止取样点落到别处）
 *   8. 标题文字对带底的对比度不劣于现状（浅 ≥3.4 / 深 ≥5.6）
 *   9. 色块与模型行左右对齐（`margin-inline` 没被误加回来）
 *  10. 标题高度仍是 22px ±1（横线走 background-image，没有把行顶高）
 *  11. 钉住态仍生效：滚到顶后 `[data-stuck]` 出现
 *  12. 钉住态填充与常态不同（吸顶提示没被常态那条覆盖掉——这条是本轮真踩到的坑）
 *  13. 钉住态横线还在（上游 `background` 简写会重置 `background-image`）
 *  14. 浅/深两档都测，且两档读数确实不同（单档绿说明不了另一档）
 *  15. 选择器边界：同结构的 `role="option"` 分组（斜杠命令面板）不被命中
 *
 * 第 4 条的阈值为什么两档不同：**浅色档的填充存在物理上限**。浅色菜单底实测
 * `rgb(242,243,243)`，任何不透明填充最多只能到 1.11（纯白也才 1.11，往亮走封顶）；
 * 要过 1.15 只能往暗走，而那会把 11px 标题文字对底从 3.34 压到 2.7 以下，跌穿可读
 * 门槛。深色档菜单底 `rgb(53,54,58)` 离纯黑很远，往暗走空间充裕，实测到 1.25。
 * 所以两档承重信号都落在第 6 条那条横线上（4.15 / 5.42），填充只做氛围。
 *
 * 判据取屏幕像素的主导桶均值（16 级量化分桶），与本仓库功能 10 同一口径：
 * 一条扫描线的中位数会被字形抬高，凭空造出假数字。
 *
 * 用法：node scripts/verify-provider-band-live.mjs [cdpPort] [pageUrlPrefix]，先 `stack:up`。
 *
 * 只能人工确认、这里覆盖不到的：观感（色带是否太重、横线是否抢注意力）。
 */
import { abort, createEvaluator, createChecker, reloadAndWait, resolveTarget } from './lib/cdp.mjs'
import { dismissOnboarding } from './lib/onboarding.mjs'

const { port: PORT, prefix: PREFIX } = resolveTarget(process.argv.slice(2))
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const { evaluate, conn } = await createEvaluator({ port: PORT, prefix: PREFIX })
const { check, report } = createChecker()

/** 面板里那枚厂商标题的锚点：上游 `MenuGroup.tsx` 里的字面量属性。 */
const HEADING_SEL = '[data-menu-group-heading]'

/**
 * 主题钉住：`data-ds-dark-theme` 会被应用自己在两帧内写回（测试栈副本上的标准主题由
 * 主题控制器持有），一次性翻转撑不过 `Page.captureScreenshot` 的往返，所以挂
 * `MutationObserver` 把每一次写回都立刻翻回来（同功能 5/10 的守卫机制）。
 */
const PIN_THEME = (dark) => `(() => {
  if (window.__pbObs) { window.__pbObs.disconnect(); window.__pbObs = null }
  const want = ${dark}
  const enforce = () => {
    if (document.body.hasAttribute('data-ds-dark-theme') !== want) {
      if (want) document.body.setAttribute('data-ds-dark-theme', '')
      else document.body.removeAttribute('data-ds-dark-theme')
    }
  }
  enforce()
  window.__pbObs = new MutationObserver(enforce)
  window.__pbObs.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
  return document.body.hasAttribute('data-ds-dark-theme')
})()`

const UNPIN_THEME = `(() => { if (window.__pbObs) { window.__pbObs.disconnect(); window.__pbObs = null } return true })()`

/** 打开模型下拉并钻到「模型」面板；已在面板里就直接复用。 */
async function openModelPane() {
  // 关掉任何开着的浮层，再从干净的根面板重开——上一次调用可能把下拉留在已钻入的
  // 面板里，那时根菜单的「模型」格子不存在。
  await evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)
  await sleep(400)
  const trigger = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => String(x.className).includes('_7KE1Ra_trigger'))
    if (b === undefined) return null
    const r = b.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (trigger === null) return false
  for (const type of ['mousePressed', 'mouseReleased']) {
    await conn.send('Input.dispatchMouseEvent', { type, x: trigger.x, y: trigger.y, button: 'left', clickCount: 1 })
  }
  await sleep(900)
  if (await evaluate(`document.querySelectorAll('${HEADING_SEL}').length > 0`)) return true
  const cell = await evaluate(`(() => {
    const c = [...document.querySelectorAll('[role="menuitem"]')].find(x => x.innerText.startsWith('模型'))
    if (c === undefined) return null
    const r = c.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })()`)
  if (cell === null) return false
  for (const type of ['mousePressed', 'mouseReleased']) {
    await conn.send('Input.dispatchMouseEvent', { type, x: cell.x, y: cell.y, button: 'left', clickCount: 1 })
  }
  await sleep(800)
  return await evaluate(`document.querySelectorAll('${HEADING_SEL}').length > 0`)
}

/** 把模型列表滚到底，让第一组标题进入吸顶态。 */
async function scrollPane(top) {
  return await evaluate(`(() => {
    const menu = [...document.querySelectorAll('[role="menu"]')].find(x => x.scrollHeight > x.clientHeight + 4)
    if (menu === undefined) return null
    menu.scrollTop = ${top}
    return menu.scrollTop
  })()`)
}

/**
 * 同一现场连拍两次，逐像素比。同位 A/B 的**前提**：两次无改动截图必须完全一致，
 * 否则「开/关填充」量到的差里混着渲染抖动。
 *
 * @param {object} clip 截图裁剪框
 * @returns {Promise<{changedSamples:number,maxChannelDelta:number,total:number}|null>}
 */
async function screenshotStability(clip) {
  const shot = async () => {
    const res = await conn.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false })
    if (typeof res.result?.data !== 'string') abort('Page.captureScreenshot 没有返回图像', `CDP 回包：${JSON.stringify(res).slice(0, 400)}`)
    return res.result.data
  }
  const first = await shot()
  await sleep(600)
  const second = await shot()
  return await evaluate(`(async () => {
    const load = async (d) => { const img = new Image(); img.src = 'data:image/png;base64,' + d; await img.decode()
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
      const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, img.width, img.height).data }
    const A = await load(${JSON.stringify(first)}), B = await load(${JSON.stringify(second)})
    let changed = 0, max = 0
    for (let i = 0; i < A.length; i += 4) for (let k = 0; k < 3; k += 1) {
      const d = Math.abs(A[i + k] - B[i + k]); if (d > 0) changed += 1; if (d > max) max = d
    }
    return { changedSamples: changed, maxChannelDelta: max, total: A.length / 4 }
  })()`)
}

/**
 * 「这层填充改变了多少屏幕像素」的同位 A/B。
 *
 * **为什么不能拿「带 vs 底」当判据**：菜单卡片是 ~45% 半透明叠毛玻璃，底的颜色随背后
 * 内容逐段漂移——实测同一张深色卡片沿纵列从 `rgb(38,39,42)` 漂到 `rgb(56,58,62)`（约 18
 * 级），而填充本身的贡献只有 4~5 级（浅色档 0~1 级）。用一个跟着位置跑几十级的基准去除
 * 一个几级的信号，量出来的比值只反映取样点撞在哪。这与功能 10 在纹理主题上踩的坑同源：
 * **底不是一个颜色时，「对底对比度」就不是一个有意义的数**。
 *
 * 正确问法是「同一位置、只切换这一层填充，像素差多少」——基准与被测点同 y，漂移项对消。
 * 前提是同一现场连拍要逐像素稳定，脚本先断言这一点（`screenshots are reproducible`）。
 *
 * @param {{x:number,y:number,w:number,h:number}} band 取样矩形（页面 CSS 坐标）
 * @param {object} clip 截图裁剪框
 * @returns {Promise<{on:number[]|null, off:number[]|null, delta:number[]|null}>}
 */
async function fillContribution(band, clip) {
  const shot = async () => {
    const res = await conn.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false })
    if (typeof res.result?.data !== 'string') abort('Page.captureScreenshot 没有返回图像', `CDP 回包：${JSON.stringify(res).slice(0, 400)}`)
    return res.result.data
  }
  const meanAt = (data) => evaluate(`(async () => {
    const img = new Image(); img.src = 'data:image/png;base64,' + ${JSON.stringify(data)}; await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, img.width, img.height).data
    const R = ${JSON.stringify(band)}
    const x0 = Math.round(R.x - ${clip.x}), y0 = Math.round(R.y - ${clip.y})
    const x1 = Math.round(R.x - ${clip.x} + R.w), y1 = Math.round(R.y - ${clip.y} + R.h)
    let n = 0, s = [0, 0, 0]
    for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const i = (y * img.width + x) * 4
      s[0] += px[i]; s[1] += px[i + 1]; s[2] += px[i + 2]; n += 1
    }
    return n === 0 ? null : { mean: s.map(v => Math.round(v / n)), samples: n }
  })()`)

  const on = await meanAt(await shot())
  // 只关掉填充，横线（background-image）留着——这条要测的就是填充那一层。
  await evaluate(`(() => {
    document.querySelectorAll('style[data-pb-ab]').forEach(s => s.remove())
    const s = document.createElement('style'); s.dataset.pbAb = '1'
    s.textContent = 'section[data-menu-group]:has(> [role="menuitemradio"]) > [data-menu-group-heading]'
      + '{background-color:transparent !important}'
    document.head.append(s)
    return true
  })()`)
  await sleep(350)
  const off = await meanAt(await shot())
  await evaluate(`document.querySelectorAll('style[data-pb-ab]').forEach(s => s.remove())`)
  await sleep(350)

  if (on === null || off === null) return { on: null, off: null, delta: null }
  return { on: on.mean, off: off.mean, delta: on.mean.map((v, i) => v - off.mean[i]) }
}

/**
 * 采样一次：截卡片、回读各区域的屏幕像素。
 *
 * `clip.scale = 1` 让截图按 CSS 像素出图，局部坐标与出图像素只差一个 dpr 因子。
 *
 * @param {'rest'|'stuck'} phase 用于文件命名与读数标注
 * @param {string} theme
 */
async function sample(phase, theme) {
  const geom = await evaluate(`(() => {
    const heading = document.querySelector('${HEADING_SEL}')
    if (heading === null) return null
    // 卡片要取**含这枚标题**的那一张，不能用 document.querySelector 拿第一张：页面上
    // 任何别的浮层开着（斜杠命令面板、composer 上方其它下拉……）都会先被选中，clip 就
    // 按错的卡片裁，标题整个落在截图外——采样桶为空，判据崩在像素解码那一步。
    const surface = heading.closest('[data-menu-material]')
    if (surface === null) return null
    const rect = (el) => { const b = el.getBoundingClientRect()
      return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) } }
    const sr = rect(surface), hr = rect(heading)
    const cs = getComputedStyle(heading)
    const ruleDecl = cs.backgroundImage
    // 「菜单底」的取样带必须落在**一列之内、且避开一切内容**的位置。不能用卡片顶边
    // （sr.y + 1）：模型面板的卡片顶部是搜索框（实测占 y+4..y+28、宽 240），那条带读到
    // 的是搜索框的底而不是菜单底，会把基准抬高一档，判据假红。取标题正上方那一行——
    // 它夹在搜索框与标题之间，同列同材质。
    return { surface: sr, heading: hr, stuck: heading.hasAttribute('data-stuck'),
      radius: cs.borderRadius, textColor: cs.color, fill: cs.backgroundColor, ruleDecl,
      bands: { surfaceStrip: { x: hr.x + 2, y: hr.y - 2, w: hr.w - 4, h: 2 },
               bandStrip: { x: hr.x + 2, y: hr.y + 3, w: hr.w - 4, h: 8 },
               ruleRow: { x: hr.x + 3, y: hr.y + hr.h - 1, w: hr.w - 6, h: 1 } } }
  })()`)
  if (geom === null) abort('页面上找不到菜单卡片或厂商标题', '先确认模型下拉开着，且这版上仍用 `MenuGroup` 渲染厂商名。')

  const clip = {
    x: Math.floor(geom.surface.x) - 2, y: Math.floor(geom.surface.y) - 2,
    width: Math.ceil(geom.surface.w) + 4, height: Math.ceil(geom.surface.h) + 4, scale: 1,
  }
  const shot = await conn.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false })
  const data = shot.result?.data
  if (typeof data !== 'string') abort('Page.captureScreenshot 没有返回图像', `CDP 回包：${JSON.stringify(shot).slice(0, 400)}`)

  const { writeFileSync } = await import('node:fs')
  writeFileSync(`tmp/provider-band-${theme}-${phase}.png`, Buffer.from(data, 'base64'))

  const pixels = await evaluate(`(async () => {
    const img = new Image()
    img.src = 'data:image/png;base64,' + ${JSON.stringify(data)}
    await img.decode()
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
    const g = c.getContext('2d'); g.drawImage(img, 0, 0)
    const px = g.getImageData(0, 0, img.width, img.height).data
    const at = (x, y) => { const i = (y * img.width + x) * 4; return [px[i], px[i + 1], px[i + 2]] }
    /** 主导桶均值 + 占比：底不是一个颜色时（占比低）读数只反映取样点撞在哪。 */
    const dominant = (rect) => {
      const x0 = Math.round(rect.x - ${clip.x}), y0 = Math.round(rect.y - ${clip.y})
      const x1 = Math.round(rect.x - ${clip.x} + rect.w), y1 = Math.round(rect.y - ${clip.y} + rect.h)
      const buckets = new Map()
      for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) {
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
        const p = at(x, y), key = (p[0] >> 4) + ',' + (p[1] >> 4) + ',' + (p[2] >> 4)
        const e = buckets.get(key) ?? { n: 0, s: [0, 0, 0] }
        e.n += 1; e.s[0] += p[0]; e.s[1] += p[1]; e.s[2] += p[2]; buckets.set(key, e)
      }
      let total = 0, best = null
      for (const e of buckets.values()) { total += e.n; if (best === null || e.n > best.n) best = e }
      // 采样矩形整个落在截图外时桶是空的——那是坐标错，不是「测出来是黑的」。
      // 静默返回 0 会让下游算出一组自洽的假读数，所以这里显式报出来。
      if (best === null) return { mean: null, share: 0, empty: true, samples: total, rect }
      return { mean: best.s.map(v => Math.round(v / best.n)), share: +(best.n / total).toFixed(3), samples: total }
    }
    const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
    const lum = (p) => 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2])
    const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
      return +(((hi + 0.05) / (lo + 0.05)).toFixed(2)) }
    const out = {}
    for (const [name, rect] of Object.entries(${JSON.stringify(geom.bands)})) out[name] = dominant(rect)
    const fg = ${JSON.stringify(geom.textColor)}.match(/\\d+/g).slice(0, 3).map(Number)
    const empty = Object.entries(out).filter(([, v]) => v.empty === true).map(([k]) => k)
    if (empty.length > 0) return { decodeFailed: true, empty, detail: out }
    return { surface: out.surfaceStrip.mean, band: out.bandStrip.mean, rule: out.ruleRow.mean,
      bandShare: out.bandStrip.share, ruleShare: out.ruleRow.share,
      cBandVsSurface: contrast(out.bandStrip.mean, out.surfaceStrip.mean),
      cRuleVsBand: contrast(out.ruleRow.mean, out.bandStrip.mean),
      cTextVsBand: contrast(fg, out.bandStrip.mean) }
  })()`)

  if (pixels !== null && typeof pixels === 'object' && pixels.decodeFailed === true) {
    abort(
      '采样矩形落在截图外，读数不可信',
      `为空的取样带：${pixels.empty.join('、')}\n`
      + `几何：卡片 ${JSON.stringify(geom.surface)}、标题 ${JSON.stringify(geom.heading)}\n`
      + `裁剪：${JSON.stringify(clip)}\n`
      + '多半是卡片取错了（页面上还开着别的浮层）或标题已滚出可视区。',
    )
  }

  return { geom, pixels, image: [clip.width, clip.height], clip, shot: data }
}

/** 把 `background-image` 里那条 linear-gradient 的**最后一档**颜色解析出来，与像素读数同源比对。 */
async function ruleComputedColor() {
  return await evaluate(`(() => {
    const h = document.querySelector('${HEADING_SEL}')
    if (h === null) return null
    const decl = getComputedStyle(h).backgroundImage
    // 横线是 gradient 的最后一个色标。Chromium 会把 color-mix() 算成
    // \`color(srgb r g b / a)\` 而不是 rgb()——两种形式都要认，否则会抓到
    // 最前面那档全透明的 stop，判据恒红。
    const rgbForm = [...decl.matchAll(/rgba?\\(([^)]+)\\)/g)]
    const srgbForm = [...decl.matchAll(/color\\(srgb ([^)]+)\\)/g)]
    const pick = (m) => {
      if (m === undefined) return null
      const parts = m[1].trim().split(/[\\s,\\/]+/).filter(Boolean).map(Number)
      if (parts.length < 3 || parts.some(Number.isNaN)) return null
      return { rgb: parts.slice(0, 3).map(v => Math.round(v * 255)), alpha: parts.length === 4 ? parts[3] : 1 }
    }
    // 取声明里位置最靠后的那一档（横线画在最后 1px）。
    const last = (list) => list.length === 0 ? null : list[list.length - 1]
    const candidates = [
      ...rgbForm.map(m => ({ at: m.index, v: pick(m) })),
      ...srgbForm.map(m => ({ at: m.index, v: pick(m) })),
    ].filter(x => x.v !== null && x.v.alpha > 0)
    if (candidates.length === 0) return { rgb: null, alpha: 0, raw: decl }
    candidates.sort((a, b) => a.at - b.at)
    return { ...candidates[candidates.length - 1].v, raw: decl }
  })()`)
}

// ── 现场前置 ──────────────────────────────────────────────────────────────────
await reloadAndWait(conn, { mountMs: 6000 })
await dismissOnboarding(evaluate)

// 1. 本插件的样式表必须在：它不在，后面每条都可能"绿"得毫无意义。
check('plugin stylesheet present', await evaluate(`(() => {
  const s = document.querySelector('style[data-plugin="@Tinnikx/dsh-operation-improve"]')
  return s === null ? null : { present: true, length: s.textContent.length }
})()`), (v) => v !== null && v.present === true ? true : '本插件样式表不在页面上——插件没装进 profile 或页面没加载完')

const readings = {}
for (const theme of ['dark', 'light']) {
  await evaluate(PIN_THEME(theme === 'dark'))
  await sleep(500)

  if (!await openModelPane()) abort('打不开模型下拉', '页面上找不到 `_7KE1Ra_trigger` 那枚模型按钮，或菜单里没有「模型」格子。')

  // ── 常态 ────────────────────────────────────────────────────────────────────
  await scrollPane(0)
  await sleep(500)
  const rest = await sample('rest', theme)
  readings[theme] = { rest }

  check(`[${theme}] provider heading exists inside a model group`, await evaluate(`(() => {
    const h = document.querySelector('${HEADING_SEL}')
    if (h === null) return null
    const section = h.closest('[data-menu-group]')
    return { text: h.textContent, radioRows: section === null ? 0 : section.querySelectorAll(':scope > [role="menuitemradio"]').length }
  })()`), (v) => v !== null && v.radioRows > 0 ? true : '厂商标题不在一个含模型行的分组里')

  // 填充贡献：同位 A/B。浅色档实测只有 0~1 级（往亮走物理封顶，见文件头），故只要求
  // 「深色档真实改变了像素」；浅色档不设像素门槛——它两档的承重信号都是横线。
  // **这条测法有个前提**：同一现场连拍必须逐像素稳定。不先证这一点，量到的差可能是
  // 两次渲染抖动而不是填充贡献。故先跑一次无改动连拍。
  const reproducibility = await screenshotStability(rest.clip)
  readings[theme].reproducibility = reproducibility
  check(`[${theme}] screenshots are reproducible (A/B premise)`, reproducibility,
    (v) => v === null ? '连拍取不到像素'
      : v.changedSamples === 0 ? true
        : `无改动连拍有 ${v.changedSamples}/${v.total} 个采样点变化（最大通道差 ${v.maxChannelDelta}）——同位 A/B 的差不再只归因于填充`)

  const contribution = await fillContribution(rest.geom.bands.bandStrip, rest.clip)
  readings[theme].fillContribution = contribution
  check(`[${theme}] band fill changes real pixels (dark only)`, contribution,
    (v) => theme === 'light'
      ? (v.delta === null ? '同色探针取不到像素' : true)
      : v.delta === null ? '同色探针取不到像素'
        : v.delta.some(d => Math.abs(d) >= 2) ? true
          : `关掉填充后带均值只差 ${JSON.stringify(v.delta)}——这层填充在屏幕上等于没画`)

  check(`[${theme}] band strip is a flat colour`, rest.pixels,
    (v) => v.bandShare >= 0.9 ? true : `主导桶只占 ${v.bandShare}——底不是一个颜色，对比度读数不可信`)

  check(`[${theme}] bottom rule contrast vs band >= 3.0`, rest.pixels,
    (v) => v.cRuleVsBand >= 3.0 ? true : `横线对带只有 ${v.cRuleVsBand}——承重信号不够`)

  check(`[${theme}] rule pixel matches its computed declaration`, await ruleComputedColor(),
    (v) => v === null ? '读不到标题的 background-image'
      : v.alpha > 0 ? true : '横线那一档是全透明的，等于没画')

  check(`[${theme}] heading text contrast vs band not worse than baseline`, rest.pixels,
    (v) => v.cTextVsBand >= (theme === 'dark' ? 5.6 : 3.34) ? true
      : `文字对带 ${v.cTextVsBand}，比基线还差（浅 3.34 / 深 5.66）`)

  check(`[${theme}] heading height unchanged (22px ±1)`, rest.geom,
    (v) => Math.abs(v.heading.h - 22) <= 1 ? true : `标题高 ${v.heading.h}px——横线把它顶高了`)

  check(`[${theme}] border-radius flattened to 0`, rest.geom,
    (v) => v.radius === '0px' ? true : `圆角仍是 ${v.radius}——上游那条非 macOS 的药丸规则没被压过`)

  check(`[${theme}] heading band shares the model row's inset`, await evaluate(`(() => {
    const h = document.querySelector('${HEADING_SEL}')
    if (h === null) return null
    const row = h.closest('[data-menu-group]')?.querySelector(':scope > [role="menuitemradio"]')
    if (row === undefined || row === null) return null
    const b = (el) => { const r = el.getBoundingClientRect(); return { left: r.x, right: r.x + r.width } }
    const hr = b(h), rr = b(row)
    return { headingLeft: +hr.left.toFixed(2), rowLeft: +rr.left.toFixed(2), rowRight: +rr.right.toFixed(2),
      leftGap: +(hr.left - rr.left).toFixed(2), rightGap: +(rr.right - hr.right).toFixed(2) }
  })()`), (v) => v === null ? '找不到标题下的模型行'
    // 基准是模型行而不是卡片边：色块刻意与行同宽，不吃卡片那 4px 内边距（卡片右侧另留 5px 滚动条槽）。
    : Math.abs(v.leftGap) <= 0.6 && Math.abs(v.rightGap) <= 0.6 ? true
      : `色块与模型行不齐：左差 ${v.leftGap}px、右差 ${v.rightGap}px`)

  // ── 钉住 ────────────────────────────────────────────────────────────────────
  const scrolled = await scrollPane(300)
  if (scrolled === null || scrolled === 0) abort('模型列表滚不动，钉住态测不到', `scrollTop 读回 ${scrolled}；列表可能不足以滚动（模型太少）。`)
  await sleep(700)
  const stuck = await sample('stuck', theme)
  readings[theme].stuck = stuck

  check(`[${theme}] heading enters the stuck state when scrolled`, stuck.geom,
    (v) => v.stuck === true ? true : '滚到顶后 `[data-stuck]` 没出现——吸顶机制变了，后半段读数不适用')

  check(`[${theme}] stuck fill differs from the resting band`, { rest: rest.pixels.band, stuck: stuck.pixels.band },
    (v) => JSON.stringify(v.rest) !== JSON.stringify(v.stuck) ? true
      : `钉住态底色与常态同值 ${JSON.stringify(v.rest)}——上游那层吸顶填充被常态规则盖掉了`)

  check(`[${theme}] bottom rule survives the stuck fill`, stuck.pixels,
    (v) => v.cRuleVsBand >= 3.0 ? true
      : `钉住态横线对带只有 ${v.cRuleVsBand}——上游的 background 简写把 background-image 重置了`)

  // 收工：把面板滚回顶、关掉下拉，免得把现场留给下一个脚本。
  await scrollPane(0)
  await sleep(300)
}

// 14. 两档读数必须真的不同：只测一档绿说明不了另一档。
check('dark and light readings differ', { dark: readings.dark.rest.pixels, light: readings.light.rest.pixels },
  (v) => JSON.stringify(v.dark.band) !== JSON.stringify(v.light.band) ? true
    : '两档读到的带底同值——其中一档没生效（多半是主题钉住失败）')

// 15. 选择器边界：同一结构的 `role="option"` 分组（斜杠命令面板）必须不被命中。
// 拿真样式表判，不重写规则——这条守的是 `:has(> [role="menuitemradio"])` 那个限定。
check('selector spares the popupSelect (role=option) groups', await evaluate(`(() => {
  const host = document.createElement('div')
  host.innerHTML = \`
    <section data-menu-group="">
      <span data-menu-group-start=""></span>
      <div data-menu-group-heading="">radio-group</div>
      <button role="menuitemradio">model row</button>
    </section>
    <section data-menu-group="">
      <span data-menu-group-start=""></span>
      <div data-menu-group-heading="">option-group</div>
      <div role="option">command row</div>
    </section>\`
  document.body.append(host)
  const read = (text) => {
    const h = [...host.querySelectorAll('[data-menu-group-heading]')].find(x => x.textContent === text)
    const cs = getComputedStyle(h)
    return { radius: cs.borderRadius, bg: cs.backgroundColor, hasRule: cs.backgroundImage !== 'none' }
  }
  const out = { radio: read('radio-group'), option: read('option-group') }
  host.remove()
  return out
})()`), (v) => v === null ? '探针建不起来'
  : v.radio.hasRule === true && v.option.hasRule === false
    && v.option.bg === 'rgba(0, 0, 0, 0)' ? true
    : `选择器溢出了：radio 组 ${JSON.stringify(v.radio)}，option 组 ${JSON.stringify(v.option)}`)

await evaluate(UNPIN_THEME)
await evaluate(`document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`)

const { writeFileSync } = await import('node:fs')
writeFileSync('tmp/provider-band-readings.json', JSON.stringify(readings, null, 1))
console.log(`\n读数落在 tmp/provider-band-readings.json，截图 tmp/provider-band-<theme>-<rest|stuck>.png`)
report()
