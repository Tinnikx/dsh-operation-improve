/**
 * 把 profile 的用户 patch 层读成面板要的状态，并把面板的改动写回去。
 *
 * 三个值的分工（whole-config 替换是这里所有复杂度的来源——patch 按 id 命中会
 * **整体替换** `config`，没有深合并）：
 *
 * - `bundle`：只由 bundle 层合成，即「系统默认」的权威定义。
 * - `outside`：bundle 层 + 用户层里**托管区段之外**的 patch。写托管行时必须把它的
 *   每个键原样重述进去，否则那些键（`tool-ralph` 的 `subagentProvider`、用户自己
 *   手写的行）会被整体替换抹掉。
 * - `effective`：整份文件合成出来的结果，也就是面板显示的当前值。
 * - `bundleOwners`：`bundle` 里每个键是哪个 bundle 包设的，面板拿它当来源徽标的文案。
 *
 * `outside` 靠「解析出来的用户 patch 去掉尾部 K 条」还原，K 是托管区段里的顶层条
 * 目数。前提是区段在文件末尾；闭标记之后又出现顶层列表项时这个前提不成立，本模块
 * 把 `outside` 报成 `null`，路由据此拒绝写入而不是猜。
 *
 * profile 目录**不能从 `ctx.loader.config.baseUrl` 取**：实测它是 `undefined`
 * （loader config 整个是 `{}`）。真正的来源是命令行的 `--profile` 加 `$DSH_HOME`。
 * `@deepseek-ai/dsh-app-boot` 也**没有 `./profile` 子导出**，`loadProfile` 等符号
 * 由包主入口再导出；解析锚点用正在跑的那个 `dsh/lib/bin.js`。
 */
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { CATALOG, catalogEntry, catalogField, checkCrossRules, coerceField } from './catalog.js'
import {
  composeFile, countSectionItems, readManagedHeader, renderSection, splitManaged, writeAtomic,
} from './patch-file.js'

const BIN_NAME = '@Tinnikx/dsh-operation-improve'

/** @type {Promise<{ boot: any, installAnchor: string }> | undefined} */
let bootPromise

/**
 * 解析并加载 app-boot 的 profile API。
 * @returns {Promise<{ boot: any, installAnchor: string }>} 模块与安装锚点
 * @throws 解析不到 `@deepseek-ai/dsh-app-boot` 时抛（非 profile 启动的 harness）
 */
function loadBoot() {
  bootPromise ??= (async () => {
    const bin = process.argv[1]
    if (bin === undefined) throw new Error('拿不到 dsh 入口路径（process.argv[1] 为空）')
    const resolved = createRequire(bin).resolve('@deepseek-ai/dsh-app-boot')
    return {
      boot: await import(pathToFileURL(resolved).href),
      installAnchor: join(dirname(bin), '..', 'package.json'),
    }
  })()
  return bootPromise
}

/**
 * 从命令行读出正在跑的 profile 名。
 * @returns {string | null} profile 名；不是 `--profile` 启动时 null
 */
export function currentProfileName() {
  const argv = process.argv
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === '--profile') return argv[i + 1] ?? null
    if (argv[i].startsWith('--profile=')) return argv[i].slice('--profile='.length)
  }
  return null
}

/** 在合成出来的 entry 列表里找一个 id 的 config，含分组的嵌套列表。 */
function findConfig(entries, id) {
  for (const entry of entries) {
    if (entry.id === id) return { present: true, config: entry.config }
    if (Array.isArray(entry.config)) {
      const hit = findConfig(entry.config, id)
      if (hit.present) return hit
    }
  }
  return { present: false, config: undefined }
}

/** loader 里真正跑着的那份 config——`resolve()` 够不到嵌套 id，只能遍历。 */
function liveConfig(ctx, id) {
  if (ctx?.loader === undefined) return undefined
  for (const entry of ctx.loader.entries()) {
    if (entry.options?.id === id) return entry.options.config
  }
  return undefined
}

/**
 * 读出面板需要的全部状态。
 * @param {object | undefined} ctx cordis Context，用来读 loader 里跑着的值；缺省时 `live` 为 null
 * @returns {Promise<object>} `{ profile, warnings, state }`
 * @throws profile 加载失败（bundle 解析不到等）时抛；用户层写坏只进 `warnings`
 */
export async function readState(ctx) {
  const { boot, installAnchor } = await loadBoot()
  const name = currentProfileName()
  if (name === null) throw new Error('当前 harness 不是用 --profile 启动的，没有用户 patch 层可写')

  const dir = boot.resolveProfileDir(name)
  const patchPath = join(dir, boot.PROFILE_PATCH_FILENAME)
  const text = existsSync(patchPath) ? readFileSync(patchPath, 'utf8') : ''
  const parts = splitManaged(text)
  const sectionItems = countSectionItems(parts.section)

  const warnings = []
  let profile
  try {
    profile = boot.loadProfile(BIN_NAME, name, installAnchor, undefined, { userLayer: true })
  } catch (error) {
    warnings.push(`用户 patch 层读不了，面板只显示 bundle 默认值：${error.message}`)
    profile = boot.loadProfile(BIN_NAME, name, installAnchor, undefined, { userLayer: false })
  }
  const layers = profile.layers.map((layer) => layer.patches)
  const bundleEntries = boot.composeEntries(layers)
  const owners = attributeLayers(boot, profile.layers)
  const effectiveEntries = boot.composeEntries([...layers, profile.patches])

  // 闭标记之后不能再有顶层列表项，否则「去掉尾部 K 条」还原不出区段外的基线。
  const tailOk = !/^-[ \t]/m.test(parts.after)
  let outsideEntries = null
  let sectionPatches = []
  if (tailOk && profile.patches.length >= sectionItems) {
    sectionPatches = profile.patches.slice(profile.patches.length - sectionItems)
    outsideEntries = boot.composeEntries([...layers, profile.patches.slice(0, profile.patches.length - sectionItems)])
  } else {
    warnings.push('托管区段不在文件末尾（闭标记之后还有顶层条目），面板拒绝写入。把手写条目挪到开标记之前即可恢复。')
  }

  const header = readManagedHeader(parts.section)
  const state = {}
  for (const entry of CATALOG) {
    const bundle = findConfig(bundleEntries, entry.id)
    const effective = findConfig(effectiveEntries, entry.id)
    const outside = outsideEntries === null ? null : findConfig(outsideEntries, entry.id)
    const sectionConfig = sectionPatches.find((patch) => patch.id === entry.id)?.config
    const managed = header?.[entry.id]
      // 名册被手改坏时回落：把区段里该 entry 的键全当成托管键。它们下次保存会被
      // 原样重写，最坏结果是一个本该重述的键被标成托管，值不变。
      ?? (sectionConfig === undefined ? [] : Object.keys(sectionConfig))
    state[entry.id] = {
      present: effective.present,
      bundle: bundle.present ? (bundle.config ?? {}) : null,
      outside: outside === null ? null : (outside.present ? (outside.config ?? {}) : null),
      effective: effective.present ? (effective.config ?? {}) : null,
      managed: managed.filter((key) => catalogField(entry.id, key) !== undefined),
      managedValues: pickManaged(sectionConfig, managed),
      bundleOwners: owners[entry.id] ?? {},
      live: liveConfig(ctx, entry.id) ?? null,
    }
  }

  return {
    profile: { name, dir, patchPath, hasSection: parts.found, writable: outsideEntries !== null },
    warnings,
    state,
  }
}

/**
 * 每个键现在这个值是哪个 bundle 包给的。
 *
 * 只能逐层累积合成来算，不能扫单层 patch 里写没写这个键：patch 按 id 命中会**整体替换**
 * `config`，后面的层原样重述一遍同一个值也会被算成「它设的」。判据因此是**值发生变化的
 * 那一层**——原样重述不改归因；键被后面的层整体替换掉时那条归因跟着删。
 *
 * @param {any} boot app-boot 模块
 * @param {ReadonlyArray<{ packageName: string, patches: unknown[] }>} layers 按应用顺序的 bundle 层
 * @returns {Record<string, Record<string, string>>} `entry id -> 字段键 -> 包名`，只含目录里的字段
 */
function attributeLayers(boot, layers) {
  const owners = {}
  /** 上一层合成后每个 entry 的 config，用来判断这一层有没有改动某个键。 */
  const previous = {}
  for (const [index, layer] of layers.entries()) {
    const snapshot = boot.composeEntries(layers.slice(0, index + 1).map((one) => one.patches))
    for (const entry of CATALOG) {
      const config = findConfig(snapshot, entry.id).config ?? {}
      const before = previous[entry.id] ?? {}
      owners[entry.id] ??= {}
      const own = owners[entry.id]
      for (const key of Object.keys(own)) if (config[key] === undefined) delete own[key]
      for (const field of entry.fields) {
        const value = config[field.key]
        if (value === undefined) continue
        if (JSON.stringify(before[field.key]) !== JSON.stringify(value)) own[field.key] = layer.packageName
      }
      previous[entry.id] = config
    }
  }
  return owners
}

function pickManaged(sectionConfig, managed) {
  const out = {}
  if (sectionConfig === undefined) return out
  for (const key of managed) if (sectionConfig[key] !== undefined) out[key] = sectionConfig[key]
  return out
}

/**
 * 应用一批改动并落盘。
 *
 * 每条 op 必须命中 {@link CATALOG} 里的 `(id, field)`，值按字段声明收窄，收窄后再对
 * **合成值**跑跨字段规则——上游校验看到的就是合成后的 config，只看增量会漏掉「改一个
 * 键把另一个键顶出界」。任何一条不合法就整批拒绝，文件不动。
 *
 * @param {object | undefined} ctx cordis Context，透传给 {@link readState}
 * @param {Array<{ id: string, field: string, op: 'set' | 'unset', value?: unknown }>} ops 改动列表
 * @returns {Promise<{ ok: true, state: object } | { ok: false, status: number, errors: string[] }>}
 *   成功时返回回读到的新状态；失败时给 HTTP 状态码与中文错误列表，文件未被修改
 */
export async function applyOps(ctx, ops) {
  const current = await readState(ctx)
  if (!current.profile.writable) {
    return { ok: false, status: 409, errors: current.warnings }
  }

  const errors = []
  /** @type {Map<string, Record<string, unknown>>} */
  const managed = new Map()
  for (const entry of CATALOG) {
    managed.set(entry.id, { ...current.state[entry.id].managedValues })
  }

  const touched = new Set()
  for (const op of ops) {
    const entry = catalogEntry(op.id)
    const field = catalogField(op.id, op.field)
    if (entry === undefined || field === undefined) {
      errors.push(`不在清单里的配置项：${op.id}.${op.field}`)
      continue
    }
    if (!current.state[op.id].present) {
      errors.push(`${entry.title}（${op.id}）不在当前 profile 里，无法配置`)
      continue
    }
    touched.add(op.id)
    if (op.op === 'unset') {
      delete managed.get(op.id)[op.field]
      continue
    }
    if (op.op !== 'set') { errors.push(`未知操作 ${op.op}`); continue }
    const coerced = coerceField(field, op.value)
    if ('error' in coerced) { errors.push(`${entry.title}：${coerced.error}`); continue }
    managed.get(op.id)[op.field] = coerced.value
  }
  if (errors.length > 0) return { ok: false, status: 400, errors }

  for (const id of touched) {
    const entry = catalogEntry(id)
    const merged = { ...(current.state[id].outside ?? {}), ...managed.get(id) }
    for (const problem of checkCrossRules(entry, merged)) errors.push(`${entry.title}：${problem}`)
  }
  if (errors.length > 0) return { ok: false, status: 400, errors }

  const plans = []
  for (const entry of CATALOG) {
    const values = managed.get(entry.id)
    const keys = Object.keys(values)
    if (keys.length === 0) continue
    const outside = current.state[entry.id].outside ?? {}
    plans.push({
      id: entry.id,
      managed: entry.fields.filter((f) => keys.includes(f.key)).map((f) => [f.key, values[f.key]]),
      restated: Object.entries(outside).filter(([key]) => !keys.includes(key)),
    })
  }

  const text = existsSync(current.profile.patchPath)
    ? readFileSync(current.profile.patchPath, 'utf8')
    : ''
  const parts = splitManaged(text)
  const section = renderSection(plans, parts.before.length > 0)
  writeAtomic(current.profile.patchPath, composeFile(parts.before, section, parts.after))

  return { ok: true, state: await readState(ctx) }
}
