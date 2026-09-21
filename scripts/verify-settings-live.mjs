/**
 * 「Harness 高级配置」面板的实测验证：真面板、真 harness、真 patch 文件。
 *
 * 跑：
 *   PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/test-stack.mjs up
 *   PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:settings
 *
 * 打的是测试栈（`<repo>/tmp/dsh-oi-test-home`、harness 3181、CDP 9334），**不碰
 * 3080，也不碰 `~/.dsh/profiles/web`**——本脚本会真的往 patch 文件里写字节。
 *
 * 四条与别的 verify 脚本不同的做法：
 *
 * - **输入用 focus + native setter + `input` 事件**。React 的受控 input 认的是 value
 *   tracker，直接 `el.value = x` 不触发 `onChange`，状态没变而画面变了，断言会对着一个
 *   不存在的草稿报绿；而 focus 也不能省——面板的写入点在 `onBlur` 上，没聚焦过的元素
 *   调 `blur()` 不派发事件，整批断言会一起卡在等一次永远不会发生的写入上。
 * - **提交靠失焦，不靠按钮**。面板没有保存按钮，`[data-save]` 在 DOM 里根本不存在
 *   （断言 7 验的就是这一条）。
 * - **生效判据读 host 路由回的 `live`，不读界面**。`live` 来自 `ctx.loader.entries()`，
 *   即 loader 真正跑着的那份 config；界面上的值是本次 `GET` 的快照，写完立刻回显不能
 *   证明热重载成功。`watchUserPatches` 有防抖，所以要轮询而不是睡一个定长。
 * - **「卸载不清空」在一份副本上真卸载**：把 `/tmp/dsh-oi-test-home` 复制一份，从
 *   profile 的 `bundles` 里摘掉本插件，再起一个真 harness（3182）确认它照样起得来，
 *   并用 harness 自己那套 `loadProfile` + `composeEntries` 算出该 home 的生效配置。
 *   不能在测试栈本身上卸载——那会把 CDP 那一侧的页面一起掀掉，后面的断言就没得跑了。
 */
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'

import { abort, createChecker, createEvaluator, reloadAndWait, resolveTarget } from './lib/cdp.mjs'
import { ROOT_CLASS } from '../src/client/settings/styles.js'
import { MANAGED_BEGIN_PREFIX, MANAGED_END, splitManaged } from '../src/harness-config/patch-file.js'

const HARNESS_ORIGIN = 'http://127.0.0.1:3181'
const ROUTE = `${HARNESS_ORIGIN}/operation-improve/harness-config`
/** 与 [test-stack.mjs](test-stack.mjs) 同一个 home：仓内 `tmp/`，不是系统 `/tmp`。 */
const REPO = fileURLToPath(new URL('..', import.meta.url))
const TEST_HOME = join(REPO, 'tmp/dsh-oi-test-home')
const PATCH_PATH = join(TEST_HOME, 'profiles/web/cordis.patch.yml')
const FIXTURE_PATH = new URL('../tests/fixtures/web-cordis.patch.yml', import.meta.url)
const UNINSTALL_HOME = '/tmp/dsh-oi-uninstall-home'
const UNINSTALL_PORT = 3182
const NODE_BIN = join(homedir(), '.dsh/desktop-bin/node-shim/node')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const sha = (text) => createHash('sha256').update(text).digest('hex')
const readPatch = () => (existsSync(PATCH_PATH) ? readFileSync(PATCH_PATH, 'utf8') : '')

const { check, report } = createChecker()
const { evaluate, conn } = await createEvaluator(resolveTarget(process.argv.slice(2)))

// ---------------------------------------------------------------- preflight

/**
 * 「手写行共存」那组断言需要一份区段外的手写 block。块来自仓库夹具（
 * `session-query-sqlite` 带两个手写键），每次跑之前补种进测试栈副本——真 home 的
 * patch 内容随时会变，脚本不能依赖它。
 */
function seedHandwrittenBlock() {
  let text = readPatch()
  if (text.includes('- id: session-query-sqlite')) return text
  const fixture = readFileSync(FIXTURE_PATH, 'utf8')
  const block = fixture.slice(fixture.indexOf('- id: session-query-sqlite')).trimEnd()
  if (!block.includes('defaultLimit') || !block.includes('readWindowMax')
    || !block.includes('openAt')) {
    abort('夹具里没有可用的 session-query-sqlite 手写块', FIXTURE_PATH)
  }
  writeFileSync(PATCH_PATH, `${text.replace(/\n*$/u, '\n')}\n${block}\n`, 'utf8')
  return readPatch()
}

const baseline = seedHandwrittenBlock()
if (baseline.includes(MANAGED_BEGIN_PREFIX)) {
  abort(
    `${PATCH_PATH} 里已经有托管区段，基线不干净`,
    '本脚本的最后一步会把区段清干净；上一轮中途失败会留下它。'
    + '重新同步副本再跑：node scripts/test-stack.mjs down && node scripts/test-stack.mjs up',
  )
}

/** 手写块里那几行的原文，用来断言「原样保留」——不写死注释文本，真 home 随时会被改。 */
const handLines = baseline.split('\n').filter((line) => /^ {4}(defaultLimit|readWindowMax):/u.test(line))
if (handLines.length !== 2) {
  abort(`${PATCH_PATH} 的手写块里没有 defaultLimit / readWindowMax 两行`, `读到 ${handLines.length} 行。`)
}

/**
 * 手写块的值，由 host 路由自己解析出来（`outside` = 托管区段之外那一层）。
 *
 * 下面几个测试值全部从它算出来，一个都不写死：副本来自真 home，那边的手写值随时会被
 * 改，写死就是让脚本慢慢烂掉——而且烂法是「面板明明对着、断言却报红」。
 */
const outside = (await state()).state['session-query-sqlite'].outside ?? {}
for (const key of ['defaultLimit', 'readWindowMax', 'maxLimit']) {
  if (typeof outside[key] !== 'number') {
    abort(`手写块里读不到数字 ${key}`, `outside = ${JSON.stringify(outside)}`)
  }
}

/**
 * 托管的两边：1 那组断言把 `maxLimit` 提交成托管值，4 再往 `defaultLimit` 里写一个
 * 超过它的草稿——跨字段规则跑在合成值上，必须拒。RW_MANAGED 是顺手托管的第二个键，
 * 让区段名册点两个名。
 */
const TEST_MAX_LIMIT = outside.maxLimit === 50 ? 51 : 50
const RW_MANAGED = outside.readWindowMax + 10
/** 故意越界的草稿值：比托管中的 maxLimit 大。 */
const OVER_LIMIT = TEST_MAX_LIMIT + 10
// defaultLimit 未托管时落回到目录默认 20：托管 cap 若小于它，提交 cap 那一刻就会自炸。
if (!(TEST_MAX_LIMIT >= 20 && TEST_MAX_LIMIT !== outside.maxLimit)) {
  abort(
    '手写块的 maxLimit 太极端，算不出可用的测试值',
    `maxLimit=${outside.maxLimit} 推出 TEST_MAX_LIMIT=${TEST_MAX_LIMIT}`,
  )
}

/** bash-sandbox.timeoutMs 在 bundle 层被 pin 成的值；8a 的 placeholder 拿它对账。 */
const BASH_BASELINE_TIMEOUT = (await state()).state['bash-sandbox'].outside?.timeoutMs
if (typeof BASH_BASELINE_TIMEOUT !== 'number') {
  abort('bundle 层没给 bash-sandbox.timeoutMs 设值，重述断言没有基线可比', `outside = ${JSON.stringify((await state()).state['bash-sandbox'].outside)}`)
}
/** session-query-sqlite 的 bundle 层 path 值：重述断言的回落基线。 */
const SQLITE_BASELINE_PATH = (await state()).state['session-query-sqlite'].outside?.path
if (typeof SQLITE_BASELINE_PATH !== 'string') {
  abort('bundle 层没给 session-query-sqlite.path 设值，重述断言没有基线可比', `outside = ${JSON.stringify((await state()).state['session-query-sqlite'].outside)}`)
}

/** 从 host 路由读一次完整状态。 */
async function state() {
  const res = await fetch(ROUTE, { signal: AbortSignal.timeout(8000) })
  if (!res.ok) abort(`host 路由答 ${res.status}`, `${ROUTE} 不通，说明 harness 里没有本插件的 host 半边。`)
  return res.json()
}

/**
 * 轮询到 loader 里跑着的值满足条件为止。
 * @returns {Promise<{ ok: boolean, ms: number, live: unknown }>}
 */
async function waitLive(id, predicate, timeoutMs = 20000) {
  const started = Date.now()
  let live
  for (;;) {
    live = (await state()).state[id].live
    if (predicate(live)) return { ok: true, ms: Date.now() - started, live }
    if (Date.now() - started > timeoutMs) return { ok: false, ms: Date.now() - started, live }
    await sleep(500)
  }
}

// --------------------------------------------------------------- 面板驱动

/** 重载页面 → 收掉凭据引导框（若有）→ 打开设置 → 展开面板，返回面板状态。 */
async function openPanel() {
  await reloadAndWait(conn, { mountMs: 6000 })
  // 副本不携凭据（rsync 排除 .credentials.yaml），产品会弹「配置 API 密钥」引导框并
  // 把焦点钉在它的输入框上——面板字段刚聚焦就被抢走，blur 不派发。先点「稍后配置」。
  await evaluate(`(() => {
    const later = [...document.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').trim() === '稍后配置')
    if (later !== undefined) later.click()
  })()`)
  await sleep(800)
  await evaluate(`(() => {
    const b = [...document.querySelectorAll('button,[role="button"],a')]
      .find((e) => (e.getAttribute('aria-label') || e.textContent || '').trim() === '设置')
    if (b === undefined) throw new Error('找不到「设置」入口')
    b.click()
  })()`)
  await sleep(2000)
  await evaluate(`(() => {
    const row = document.querySelector('[data-dsh-oi-harness-config]')
    if (row === null) throw new Error('通用设置栏里没有本插件那一行')
    row.querySelector('button').click()
  })()`)
  return waitPanelReady()
}

async function waitPanelReady() {
  for (let i = 0; i < 40; i += 1) {
    const info = await panelInfo()
    if (info.state === 'ready' || info.errors.length > 0) return info
    await sleep(500)
  }
  abort('面板 20 秒内没进入 ready', '看 /tmp/dsh-oi-stack/harness.log 与页面控制台。')
}

/** 单次读面板的可观察状态。 */
function panelInfo() {
  return evaluate(`(() => {
    const root = document.querySelector('[data-dsh-oi-harness-config]')
    const panel = root?.querySelector('[data-state]')
    return {
      state: panel?.dataset.state ?? null,
      errors: [...(root?.querySelectorAll('[data-errors] div') ?? [])].map((d) => d.textContent),
      fields: Object.fromEntries([...(root?.querySelectorAll('[data-field]') ?? [])].map((i) => [i.dataset.field, i.value])),
      sources: Object.fromEntries([...(root?.querySelectorAll('[data-clear]') ?? [])]
        .map((b) => [b.dataset.clear, b.parentElement?.querySelector('[data-source]')?.dataset.source ?? null])),
      entryEffects: Object.fromEntries([...(root?.querySelectorAll('[data-entry]') ?? [])]
        .map((card) => [card.dataset.entry, card.querySelector(':scope > [data-effect]')?.dataset.effect ?? null])),
      fieldEffects: Object.fromEntries([...(root?.querySelectorAll('[data-field]') ?? [])]
        .map((i) => [i.dataset.field, i.closest('.${ROOT_CLASS}__field')?.querySelector('[data-effect]')?.dataset.effect ?? null])),
      dirty: Number(root?.querySelector('[data-dirty-count]')?.dataset.dirtyCount ?? -1),
      saveButtons: (root?.querySelectorAll('[data-save]') ?? []).length,
    }
  })()`)
}

/**
 * 往一个文本字段里打字：focus + native setter + `input`。
 *
 * **不提交**——提交点是失焦，由 {@link commit} 触发。
 */
async function type(field, text) {
  await evaluate(`(() => {
    const el = document.querySelector('[data-field="${field}"]')
    if (el === null) throw new Error('找不到字段 ${field}')
    el.focus()
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
    setter.call(el, ${JSON.stringify(text)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(200)
}

/** 让字段失焦（= 触发自动保存），然后等落定。 */
async function commit(field) {
  await evaluate(`(() => {
    const el = document.querySelector('[data-field="${field}"]')
    if (document.activeElement !== el) throw new Error('${field} 不在焦点上，blur 不会派发事件')
    el.blur()
  })()`)
  return settle()
}

/** 点「清除」，然后等落定。 */
async function clickClear(field) {
  await evaluate(`(() => {
    const b = document.querySelector('[data-clear="${field}"]')
    if (b.disabled) throw new Error('「清除」是灰的：${field} 既没被本面板管，草稿也没动过')
    b.click()
  })()`)
  return settle()
}

/**
 * 等这一次自动保存落定。
 *
 * 判据是「待提交计数归零」或「报了错」，不是 `data-state`——那个在 payload 一到手就是
 * `ready`，写请求还在飞的时候读字段会读到旧快照。
 */
async function settle() {
  for (let i = 0; i < 50; i += 1) {
    await sleep(400)
    const info = await panelInfo()
    if (info.errors.length > 0 || info.dirty === 0) return info
  }
  abort('自动保存 20 秒内没落定', '看 /tmp/dsh-oi-stack/harness.log。')
}

/**
 * 读两行的灰显状态：一行走 harness 默认，一行被设过。
 *
 * 读 `getComputedStyle` 而不是类名——灰显是一条 CSS 规则的效果，断言标记挂上了只能证明
 * 标记在，证明不了它真的淡下去了。读的是 `opacity` 而不是 `color`：主题插件可以把标签
 * 色变量全部 `!important` 成同一个颜色（本仓库实测的主题就是），按颜色比会永远相等。
 *
 * 行与控件分开读：淡的只该是控件，标签与说明所在的整行必须留在满对比度上。
 *
 * @param {string} defaultField 期望走默认的字段（`entryId.key`）
 * @param {string} setField 期望被设过的字段
 * @returns {Promise<{ defaultRow: object, setRow: object }>} 两行的观测值
 */
function greyState(defaultField, setField) {
  return evaluate(`(() => {
    const read = (name) => {
      const input = document.querySelector('[data-field="' + name + '"]')
      if (input === null) throw new Error('找不到字段 ' + name)
      const row = input.closest('.${ROOT_CLASS}__field')
      return {
        atDefault: row.hasAttribute('data-default'),
        value: input.value,
        placeholder: input.placeholder,
        rowOpacity: getComputedStyle(row).opacity,
        inputOpacity: getComputedStyle(input).opacity,
        labelOpacity: getComputedStyle(row.querySelector('.${ROOT_CLASS}__label')).opacity,
      }
    }
    return { defaultRow: read(${JSON.stringify(defaultField)}), setRow: read(${JSON.stringify(setField)}) }
  })()`)
}

/**
 * 读一个字段的来源徽标。
 * @param {string} field `entryId.key`
 * @returns {Promise<{ source: string, owner: string | null, text: string, title: string }>} 徽标观测值
 */
function badgeOf(field) {
  return evaluate(`(() => {
    const clear = document.querySelector('[data-clear="${field}"]')
    if (clear === null) throw new Error('找不到字段 ${field}')
    const badge = clear.parentElement.querySelector('[data-source]')
    return {
      source: badge.dataset.source,
      owner: badge.dataset.owner ?? null,
      text: badge.textContent,
      title: badge.title,
    }
  })()`)
}


// --------------------------------------------------------------------- 断言

const opened = await openPanel()
check('preflight：面板展开后读到 host 路由的状态', {
  state: opened.state,
  errors: opened.errors,
  fields: Object.keys(opened.fields).length,
}, (v) => (v.state === 'ready' && v.errors.length === 0 && v.fields > 10
  ? true
  : '面板没进 ready，或字段没渲染出来'))

check('6a 手写行的值就是面板显示的当前值，且标成「手写」', {
  defaultLimit: opened.fields['session-query-sqlite.defaultLimit'],
  readWindowMax: opened.fields['session-query-sqlite.readWindowMax'],
  source: opened.sources['session-query-sqlite.defaultLimit'],
  expected: `${outside.defaultLimit} / ${outside.readWindowMax}`,
}, (v) => (v.defaultLimit === String(outside.defaultLimit) && v.readWindowMax === String(outside.readWindowMax)
  && v.source === 'manual'
  ? true
  : '面板没显示手写值，或来源徽标不是 manual'))

check('7 面板上没有保存按钮，DOM 里连 [data-save] 都不存在', {
  saveButtons: opened.saveButtons,
}, (v) => (v.saveButtons === 0 ? true : '面板上还留着保存按钮'))

// —— 8a：没人设过的字段只有控件灰显，默认值只走 placeholder ——
const grey0 = await greyState('session-query-sqlite.persistedReadConcurrency', 'session-query-sqlite.defaultLimit')
check('8a 走 harness 默认的那一行只淡化输入框，标签与整行不淡，默认值只在 placeholder 里', grey0, (v) => (
  v.defaultRow.atDefault === true && v.defaultRow.value === '' && v.defaultRow.placeholder === '4'
    && v.setRow.atDefault === false
    && Number(v.defaultRow.inputOpacity) < 1
    && v.defaultRow.rowOpacity === '1' && v.defaultRow.labelOpacity === '1'
    && v.setRow.inputOpacity === '1'
    ? true
    : '控件没淡下去、标签或整行被连带淡化，或默认值被填进了 value（一次失焦就会把它写死进文件）'))

// —— 9：bundle 层设的值报出是哪个包设的，手写与系统默认的文案不变 ——
const owners = (await state()).state
const badges = {
  bundle: await badgeOf('bash-sandbox.timeoutMs'),
  manual: await badgeOf('session-query-sqlite.defaultLimit'),
  system: await badgeOf('session-query-sqlite.persistedReadConcurrency'),
}
check('9 bundle 字段的徽标显示来源包名，手写 / 系统默认保持原样', {
  ...badges,
  hostOwner: owners['bash-sandbox'].bundleOwners?.timeoutMs ?? null,
}, (v) => (
  v.bundle.source === 'bundle' && typeof v.hostOwner === 'string' && v.hostOwner !== ''
    && v.bundle.owner === v.hostOwner && v.bundle.title === v.hostOwner
    && v.bundle.text === v.hostOwner.replace(/^@deepseek-ai\//u, '') && v.bundle.text !== '组合默认'
    && v.manual.source === 'manual' && v.manual.text === '手写' && v.manual.owner === null
    && v.system.source === 'system' && v.system.text === '系统默认' && v.system.owner === null
    ? true
    : 'host 没归因出包名，或徽标没显示它 / 把手写与系统默认也改了'))

// —— 10：生效方式标记——每张卡一枚，个别行为不同的字段那行 meta 里再挂一枚 ——
// 重启级字段现在整支「会话检索」卡 6 个键全是：harness 0.1.6-alpha.2 对它的热重挂有缺陷
// （docs/harness-hmr-session-defect.md），整卡改按「重启后生效」口径标注。
const effects = await panelInfo()
const effectEntries = Object.entries(effects.entryEffects)
const fieldEffectValues = Object.values(effects.fieldEffects)
check('10 每张卡都渲染生效方式标记；重启级标记恰好是「会话检索」全卡 6 键', {
  cards: effectEntries.length,
  missing: effectEntries.filter(([, effect]) => effect === null).map(([id]) => id),
  restartFieldKeys: Object.entries(effects.fieldEffects)
    .filter(([, effect]) => effect === 'restart').map(([key]) => key).sort(),
  bashTimeout: effects.fieldEffects['bash-sandbox.timeoutMs'],
  preparedCache: effects.fieldEffects['session-query-sqlite.preparedSessionCacheSize'],
}, (v) => (
  v.cards > 0 && v.missing.length === 0
    && v.bashTimeout === 'immediate'
    && v.preparedCache === 'restart'
    && v.restartFieldKeys.length === 6
    && v.restartFieldKeys.every((key) => key.startsWith('session-query-sqlite.'))
    ? true
    : '生效标记缺了、标错了，或重启级字段越出了「会话检索」卡的范围'))


// —— 1：改完只失焦、不点任何按钮，就该落盘并热生效 ——
await type('session-query-sqlite.maxLimit', String(TEST_MAX_LIMIT))
await commit('session-query-sqlite.maxLimit')
await type('session-query-sqlite.readWindowMax', String(RW_MANAGED))
const afterCommit1 = await commit('session-query-sqlite.readWindowMax')
const text1 = readPatch()
const live1 = await waitLive(
  'session-query-sqlite',
  (c) => c?.maxLimit === TEST_MAX_LIMIT && c?.readWindowMax === RW_MANAGED,
)

check('1a 只失焦就写了盘：文件里出现托管区段，名册点名了这两个键', {
  hasBegin: text1.includes(MANAGED_BEGIN_PREFIX),
  hasEnd: text1.includes(MANAGED_END),
  header: text1.split('\n').find((l) => l.startsWith('# managed: ')) ?? null,
  outsideUnchanged: text1.slice(0, baseline.length) === baseline,
}, (v) => (v.hasBegin && v.hasEnd && v.outsideUnchanged
  && v.header?.includes('"maxLimit"') && v.header?.includes('"readWindowMax"')
  ? true
  : '区段没写出来、名册不对，或区段外的字节被动了'))

check('1b 不重启 harness，loader 跑着的 config 跟上了新值', {
  ms: live1.ms,
  maxLimit: live1.live?.maxLimit,
  readWindowMax: live1.live?.readWindowMax,
  panelErrors: afterCommit1.errors,
}, (v) => (v.maxLimit === TEST_MAX_LIMIT && v.readWindowMax === RW_MANAGED
  && v.panelErrors.length === 0
  ? true
  : '热重载没把新值送进 loader，或自动保存报了错'))

// —— 8b：设过之后同一行不再灰显 ——
const grey1 = await greyState('session-query-sqlite.readWindowMax', 'session-query-sqlite.maxLimit')
check('8b 设过之后那一行不再淡化，来源徽标变成「本面板」', {
  atDefault: grey1.defaultRow.atDefault,
  value: grey1.defaultRow.value,
  inputOpacity: grey1.defaultRow.inputOpacity,
  source: (await panelInfo()).sources['session-query-sqlite.readWindowMax'],
}, (v) => (v.atDefault === false && v.value === String(RW_MANAGED) && v.inputOpacity === '1'
  && v.source === 'panel'
  ? true
  : '设过之后仍然灰显，或来源徽标没跟上'))

// —— 3：whole-config 替换的回归——不重述就会把 bundle 层设的键抹掉 ——
// 仍用 session-query-sqlite：bundle 层给它设了 path / openAt 这两个目录键之外的键，
// 再写第三个托管键时它们必须被原样重述进区段，否则检索配置直接坏掉。
await type('session-query-sqlite.snippetChars', '333')
await commit('session-query-sqlite.snippetChars')
const text3 = readPatch()
const live3 = await waitLive('session-query-sqlite', (c) => c?.snippetChars === 333)

check('3 写 session-query-sqlite.snippetChars 时把 bundle 层的 path/openAt 原样重述进区段', {
  managedLine: text3.split('\n').find((l) => l.includes('snippetChars: 333')) ?? null,
  pathLine: text3.split('\n').find((l) => l.includes('path:')) ?? null,
  openAtLine: text3.split('\n').find((l) => l.includes('openAt:')) ?? null,
  snippetChars: live3.live?.snippetChars,
  path: live3.live?.path,
  ms: live3.ms,
}, (v) => (v.managedLine !== null && v.pathLine?.includes(':memory:') && v.openAtLine !== null
  && v.snippetChars === 333 && v.path === SQLITE_BASELINE_PATH
  ? true
  : 'patch 按 id 命中会整体替换 config——没重述的键会从 loader 里消失'))

// —— 6b：手写行还在，它的两个键即使被托管（值被改写）也留在区段里 ——
// 手写块的两个键此刻都已进区段（重述机制把它们搬了进去），原文必须逐字节保留。
check('6b 手写那两行连行尾中文注释原样保留', {
  keptLines: handLines.filter((line) => text3.includes(line)).length,
  handLines,
}, (v) => (v.keptLines === 2
  ? true
  : '手写行被改写了，或重述时丢了原文'))

// —— 4：跨字段规则由前端拦下，请求根本不发 ——
// maxLimit 已在 1 那组托管成 TEST_MAX_LIMIT；往 defaultLimit 里写一个超过它的草稿：
// 规则跑在合成值上，被拒的草稿留在输入框里，文件不能动。defaultLimit 本身不在托管区
// 段里——4b 的「清除」才会是纯粹的撤销（对未托管键 unset 是空操作）。
const shaBefore = sha(readPatch())
await type('session-query-sqlite.defaultLimit', String(OVER_LIMIT))
const rejected = await commit('session-query-sqlite.defaultLimit')
const shaAfter = sha(readPatch())

check('4 defaultLimit 超过托管中的 maxLimit 被前端拦下，文件一个字节没动', {
  tried: `defaultLimit=${OVER_LIMIT} > maxLimit=${TEST_MAX_LIMIT}`,
  errors: rejected.errors,
  shaBefore: shaBefore.slice(0, 16),
  shaAfter: shaAfter.slice(0, 16),
}, (v) => (v.errors.length > 0 && v.errors.some((e) => e.includes('默认每页条数不能超过每页条数上限'))
  && v.shaBefore === v.shaAfter
  ? true
  : '没拦下来，或拦下来了却还是写了文件'))

// 被拒的草稿留在输入框里等下一个字段一起提交，点「清除」把它撤掉。
const withdrawn = await clickClear('session-query-sqlite.defaultLimit')
check('4b 点「清除」撤掉被拒的草稿：错误消失、待提交归零，文件仍然没动', {
  errors: withdrawn.errors,
  dirty: withdrawn.dirty,
  defaultLimit: withdrawn.fields['session-query-sqlite.defaultLimit'],
  sha: sha(readPatch()).slice(0, 16),
}, (v) => (v.errors.length === 0 && v.dirty === 0 && v.defaultLimit === String(outside.defaultLimit)
  && v.sha === shaBefore.slice(0, 16)
  ? true
  : '撤销后错误没清、草稿没退回，或文件被动了'))

// —— 5：把本插件从一份副本里真卸载，区段与它的效力都不该消失 ——
const uninstall = await verifyUninstall()
check('5 卸载本插件后：区段仍在文件里、profile 照样加载、值照样生效', uninstall, (v) => (
  v.sectionKept && v.pluginGone && v.harnessOk && v.maxLimit === TEST_MAX_LIMIT
    && v.readWindowMax === RW_MANAGED
    ? true
    : '卸载后区段丢了、profile 起不来，或那些值没生效'))

// —— 2：清除 = unset，不做别的操作就该立即生效 ——
// 挑 snippetChars：它只有托管层一份（手写层与 bundle 层都没设它），清除后组合结果里
// 这个键是真的消失了——maxLimit / readWindowMax 清除后只会回落到手写层，那在 2b 验。
await clickClear('session-query-sqlite.snippetChars')
const live2 = await waitLive('session-query-sqlite', (c) => c?.snippetChars === undefined)

check('2a 点「清除」之后不做任何别的操作，键就从 loader 的 config 里消失了', {
  ms: live2.ms,
  snippetChars: live2.live?.snippetChars ?? null,
  stillMaxLimit: live2.live?.maxLimit,
  sectionHasKey: splitManaged(readPatch()).section?.includes('snippetChars') ?? true,
}, (v) => (v.snippetChars === null && v.stillMaxLimit === TEST_MAX_LIMIT && !v.sectionHasKey
  ? true
  : '清除没把键摘掉，或顺手把默认值写进了文件'))

await clickClear('session-query-sqlite.maxLimit')
await clickClear('session-query-sqlite.readWindowMax')
const finalText = readPatch()
const live4 = await waitLive(
  'session-query-sqlite',
  (c) => c?.maxLimit === outside.maxLimit && c?.readWindowMax === outside.readWindowMax
    && c?.defaultLimit === outside.defaultLimit,
)

check('2b 托管键清空后区段整体消失，文件逐字节回到基线，值回落到手写层', {
  bytesIdentical: finalText === baseline,
  sha: sha(finalText).slice(0, 16),
  baselineSha: sha(baseline).slice(0, 16),
  maxLimit: live4.live?.maxLimit,
  defaultLimit: live4.live?.defaultLimit,
  readWindowMax: live4.live?.readWindowMax,
  liveSnippet: (await state()).state['session-query-sqlite'].live?.snippetChars ?? null,
  livePath: (await state()).state['session-query-sqlite'].live?.path,
  ms: live4.ms,
}, (v) => (v.bytesIdentical && v.maxLimit === outside.maxLimit
  && v.defaultLimit === outside.defaultLimit && v.readWindowMax === outside.readWindowMax
  && v.liveSnippet === null && v.livePath === SQLITE_BASELINE_PATH
  ? true
  : '区段没删干净，或清掉的键没回落到手写层'))

// —— 8c：清空之后那一行重新灰显 ——
// 同 2a：snippetChars 没有别的供给层，清掉才轮得到灰显；对照行拿 bundle 设过的
// bash-sandbox.timeoutMs（徽标是「组合默认」，值非空、不淡化）。
const grey2 = await greyState('session-query-sqlite.snippetChars', 'bash-sandbox.timeoutMs')
check('8c 清空之后那一行的输入框重新淡化、重新空着，标签仍不淡', grey2, (v) => (
  v.defaultRow.atDefault === true && v.defaultRow.value === '' && Number(v.defaultRow.inputOpacity) < 1
    && v.defaultRow.rowOpacity === '1' && v.defaultRow.labelOpacity === '1'
    && v.setRow.atDefault === false && v.setRow.inputOpacity === '1'
    ? true
    : '清空之后没退回灰显'))

conn.ws.close()
// 本脚本会真写托管区段里的 session-query-sqlite：harness 0.1.6-alpha.2 的热重挂缺陷
// 会连带杀死会话服务且不可逆（docs/harness-hmr-session-defect.md），不重启 harness
// 下一个脚本拿到的就是空侧栏。默认目标（测试栈）自动重启；打了别的端口就自己处理。
if (process.argv.slice(2).length === 0) {
  console.log('[stack] 重启测试栈：verify:settings 写过 session-query-sqlite，harness 热重挂缺陷会杀掉会话服务')
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./test-stack.mjs', import.meta.url)), 'restart'], { stdio: 'inherit' })
  if (r.status !== 0) console.error('[stack] 重启失败：手动 npm run stack:down && npm run stack:up 后再跑其余脚本')
} else {
  console.warn('[stack] 本脚本写过 session-query-sqlite（非默认目标，不自动重启）：该 harness 版本的会话服务已死到进程重启为止，见 docs/harness-hmr-session-defect.md')
}
report()

// ------------------------------------------------------------------ 卸载分支

/**
 * 在一份副本上真卸载本插件，再用 harness 自己的两段代码算生效配置。
 * @returns {Promise<object>} 观测值
 */
async function verifyUninstall() {
  const rsync = spawnSync('rsync', ['-a', '--delete', `${TEST_HOME}/`, `${UNINSTALL_HOME}/`], { stdio: 'inherit' })
  if (rsync.status !== 0) abort(`rsync 复制到 ${UNINSTALL_HOME} 失败（退出码 ${rsync.status}）`)

  const manifestPath = join(UNINSTALL_HOME, 'profiles/web/package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  manifest.dsh.profile.bundles = manifest.dsh.profile.bundles.filter((b) => b !== '@Tinnikx/dsh-operation-improve')
  delete manifest.dependencies['@Tinnikx/dsh-operation-improve']
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)

  const copiedPatch = readFileSync(join(UNINSTALL_HOME, 'profiles/web/cordis.patch.yml'), 'utf8')

  // harness 自己那套：同样的 loadProfile + composeEntries，只是 home 指向卸载副本。
  const bin = createRequire(join(homedir(), '.dsh/profiles/web/noop.js')).resolve('@deepseek-ai/dsh/lib/bin.js')
  const boot = await import(pathToFileURL(createRequire(bin).resolve('@deepseek-ai/dsh-app-boot')).href)
  const profile = boot.loadProfile('verify-settings', 'web', join(bin, '../..', 'package.json'), UNINSTALL_HOME)
  const entries = boot.composeEntries([...profile.layers.map((l) => l.patches), profile.patches])
  const find = (id, list = entries) => {
    for (const e of list) {
      if (e.id === id) return e.config
      if (Array.isArray(e.config)) { const hit = find(id, e.config); if (hit !== undefined) return hit }
    }
    return undefined
  }
  // 判据是插件**行**的 `name`（包名），不是 `id`——entry 的 id 由 bundle 自己定，
  // 按包名找 id 永远找不到，那条断言就会在插件明明还在的时候报绿。
  const hasPlugin = (list = entries) => list.some((e) => e.name === '@Tinnikx/dsh-operation-improve'
    || (Array.isArray(e.config) && hasPlugin(e.config)))

  const harnessOk = await bootUninstalledHarness()
  return {
    sectionKept: copiedPatch.includes(MANAGED_BEGIN_PREFIX) && copiedPatch.includes(MANAGED_END),
    pluginGone: !manifest.dsh.profile.bundles.includes('@Tinnikx/dsh-operation-improve') && !hasPlugin(),
    harnessOk: harnessOk.ok,
    harnessRoster: harnessOk.hasPlugin,
    // 只验 composition 层能看到的托管值；bundle 层的 path/openAt 早已在 2b/6b 验过
    // 回落，这里不重复。
    maxLimit: find('session-query-sqlite')?.maxLimit,
    readWindowMax: find('session-query-sqlite')?.readWindowMax,
  }
}

/** 用卸载副本起一个真 harness，确认它照样起得来且名册里没有本插件。 */
async function bootUninstalledHarness() {
  const bin = createRequire(join(homedir(), '.dsh/profiles/web/noop.js')).resolve('@deepseek-ai/dsh/lib/bin.js')
  const child = spawn(
    NODE_BIN,
    ['--expose-internals', bin, '--profile', 'web', '--port', String(UNINSTALL_PORT)],
    { env: { ...process.env, DSH_HOME: UNINSTALL_HOME }, stdio: ['ignore', 'pipe', 'pipe'] },
  )
  try {
    // 应用页挂在带 token 的 URL 上，裸 `/` 是 401；token 只印在启动横幅里。收 stdout
    // 等那行 URL：token URL 本身只 303 + 发 `dsh-auth-*` cookie，应用页要带着这个
    // cookie 打 `/` 才拿得到——undici 的 fetch 没有 cookie 罐，得手动转发 set-cookie。
    let stdout = ''
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { stdout += chunk })
    for (let i = 0; i < 90; i += 1) {
      await sleep(500)
      const url = stdout.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/u)?.[0]
      if (url === undefined) continue
      const grant = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(3000) }).catch(() => null)
      const cookie = grant?.headers.getSetCookie().map((line) => line.split(';')[0]).join('; ')
      if (!cookie) continue
      const res = await fetch(`http://127.0.0.1:${UNINSTALL_PORT}/`, {
        headers: { cookie }, signal: AbortSignal.timeout(3000),
      }).catch(() => null)
      if (res === null || !res.ok) continue
      const html = await res.text()
      if (!html.includes('__DSH_BOOT__')) continue
      // 副本里插件已卸载，页面里不该再有它——这半句是诊断输出，不是断言。
      return { ok: true, hasPlugin: html.includes('@Tinnikx/dsh-operation-improve') }
    }
    return { ok: false, hasPlugin: null }
  } finally {
    child.kill('SIGTERM')
  }
}
