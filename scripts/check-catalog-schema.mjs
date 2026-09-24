/**
 * 功能 8 的 catalog ↔ 上游 config schema 门禁：把精选清单声明的**信息格式**逐键对到
 * 权威 harness 的 `--dump-config-schema` 上，漂移即非零退出。
 *
 * 存在的理由（2026-09-24 审计）：清单是手抄的，此前**没有任何门禁把 catalog 与上游比对过**——
 * `verify:settings` 比的是「面板显示的值 vs host 现算的值」（两边同源，抄错也看不出），
 * `tests/catalog.test.mjs` 只测「抄下来之后自洽」。实测手抄与上游 rc.1 有 18 处偏离。
 * 这条门禁补上那一层。
 *
 * 比对契约（与用户定的「镜像 + 保留防呆」口径一致）：
 * - **type 必须相等**（integer / number / boolean / 数组容器；`integer-list` 对上游 `array`，
 *   数组内元素类型是面板口径，不比）。上游 `z.number()` 的键，catalog 不许标 `integer`。
 * - **default 上游有则必须相等**；上游 schema 无 `default` 的键跳过（catalog 的 default 只是
 *   界面提示，从不写盘，见 docs/feature-8-harness-config.md）。
 * - **上游有的边界 catalog 必须有、且不更松**：上游 `minimum` ⇒ catalog `min` 存在且 `>=`；
 *   上游 `maximum` ⇒ catalog `max` 存在且 `<=`。这一条堵的是最危险的方向——面板放行一个
 *   上游会拒、写下去整棵树起不来的值。
 * - **catalog 比上游更严的防呆（上游无界而 catalog 加 min/max）不在比对范围**，允许。
 *
 * 跑（需要装了产品的机器；打的是测试栈那份 home，不碰 3080）：
 *   PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run check:catalog
 * 升级 harness 后必跑（见 README「升级必检」）：新版本的 schema 漂移会在这里红，逼你重抄清单。
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { CATALOG } from '../src/harness-config/catalog.js'
import { resolveHarnessBin } from './lib/harness-bin.mjs'

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const REAL_HOME = join(homedir(), '.dsh')
const PROFILE = 'web'

/** @param {string} reason @param {string} [detail] @returns {never} */
function abort(reason, detail) {
  console.error(`[check:catalog] FAIL ${reason}`)
  if (detail !== undefined) console.error(`  ${detail.split('\n').join('\n  ')}`)
  process.exit(1)
}

/** 解析产品 node：优先显式指定，其次产品自带 node-shim，再次当前进程（要求 20+）。 */
function resolveNode() {
  const forced = process.env.DSH_SCHEMA_NODE
  if (forced !== undefined && forced !== '') {
    if (!existsSync(forced)) abort(`DSH_SCHEMA_NODE 指向的文件不存在：${forced}`)
    return forced
  }
  const shim = join(REAL_HOME, 'desktop-bin/node-shim/node')
  if (existsSync(shim)) return shim
  if (Number.parseInt(process.versions.node.split('.')[0], 10) >= 20) return process.execPath
  abort('解析不到可用的 node', '需要产品自带的 ~/.dsh/desktop-bin/node-shim/node，或 PATH 上 20+ 的 node。')
}

/** 用哪份 home 去 dump：显式指定 > 测试栈副本（若已同步）> 真 home（只读，不改）。 */
function resolveHome() {
  const forced = process.env.DSH_SCHEMA_HOME
  if (forced !== undefined && forced !== '') {
    if (!existsSync(join(forced, `profiles/${PROFILE}`))) abort(`DSH_SCHEMA_HOME 下没有 profiles/${PROFILE}：${forced}`)
    return forced
  }
  const testHome = join(REPO, 'tmp/dsh-oi-test-home')
  if (existsSync(join(testHome, `profiles/${PROFILE}`))) return testHome
  if (existsSync(join(REAL_HOME, `profiles/${PROFILE}`))) return REAL_HOME
  abort(`找不到含 profiles/${PROFILE} 的 home`, '先 npm run stack:up 同步测试栈副本，或设 DSH_SCHEMA_HOME。')
}

function dumpSchema() {
  let bin
  try {
    bin = resolveHarnessBin({ repo: REPO, realHome: REAL_HOME })
  } catch (error) {
    abort(error.message)
  }
  const node = resolveNode()
  const home = resolveHome()
  const res = spawnSync(node, ['--expose-internals', bin, '--profile', PROFILE, '--dump-config-schema'], {
    env: { ...process.env, DSH_HOME: home },
    encoding: 'utf8',
    maxBuffer: 64 << 20,
    timeout: 180_000,
  })
  if (res.error) abort(`起 harness dump 失败：${res.error.message}`)
  // loose-validation 等告警走 stderr 且退出码可能非零——判据是 stdout 能不能解析成 schema。
  let schema
  try {
    schema = JSON.parse(res.stdout)
  } catch {
    abort('dump 出来的不是合法 JSON schema', `退出码 ${res.status}；stdout 前 200 字节：${res.stdout.slice(0, 200)}`)
  }
  return { schema, home, bin }
}

// ------------------------------------------------------------------ 比对机制

const CATALOG_BASE_TYPE = { integer: 'integer', number: 'number', boolean: 'boolean', 'integer-list': 'array' }

/** entry id → config def（取 `status` 非 absent 且能解析到 properties 的那条）。 */
function configRefOf(schema, id) {
  for (const entry of schema['x-cordis'].entries) {
    if (entry.id !== id || typeof entry.configRef !== 'string') continue
    if (entry.configRef.includes('unknownConfig')) continue
    const def = resolvePointer(schema, entry.configRef)
    if (def !== undefined && propsOf(def) !== undefined) return def
  }
  return undefined
}

function resolvePointer(root, ref) {
  let node = root
  for (const seg of ref.replace(/^#\//, '').split('/')) {
    node = node?.[seg]
    if (node === undefined) return undefined
  }
  return node
}

function propsOf(configDef) {
  const containers = []
  if (Array.isArray(configDef?.anyOf)) containers.push(...configDef.anyOf)
  containers.push(configDef)
  for (const c of containers) if (c?.properties !== undefined) return c.properties
  return undefined
}

/** 取一个字段 schema 里那条**非 loaderExpression** 的分支（含 type/minimum/maximum）。 */
function constraintBranch(prop) {
  const branches = Array.isArray(prop?.anyOf) ? prop.anyOf : [prop]
  for (const b of branches) if (b && typeof b === 'object' && b.$ref === undefined) return b
  return branches[0] ?? {}
}

function baseTypeOf(branch) {
  const t = branch?.type
  const set = Array.isArray(t) ? t.filter((x) => x !== 'null') : (t ? [t] : [])
  return set
}

// ------------------------------------------------------------------------ 跑

const { schema, home, bin } = dumpSchema()
const drift = []
let checkedFields = 0

for (const entry of CATALOG) {
  const def = configRefOf(schema, entry.id)
  if (def === undefined) {
    drift.push(`${entry.id}：上游 schema 里找不到这条 entry（改名 / 被预检否决 / disabled？）`)
    continue
  }
  const props = propsOf(def)
  for (const field of entry.fields) {
    checkedFields += 1
    const prop = props[field.key]
    if (prop === undefined) {
      drift.push(`${entry.id}.${field.key}：上游 schema 里没有这个键`)
      continue
    }
    const branch = constraintBranch(prop)
    const upTypes = baseTypeOf(branch)
    const expect = CATALOG_BASE_TYPE[field.type]
    const tag = `${entry.id}.${field.key}`

    // type 相等
    if (field.type !== 'integer-list' ? !upTypes.includes(expect) : !upTypes.includes('array')) {
      drift.push(`${tag}：type 不符 — catalog 标 \`${field.type}\`，上游是 \`${upTypes.join('/') || '?'}\``)
    }
    // default 上游有则相等
    if (Object.prototype.hasOwnProperty.call(prop, 'default')) {
      if (JSON.stringify(prop.default) !== JSON.stringify(field.default)) {
        drift.push(`${tag}：default 不符 — catalog \`${JSON.stringify(field.default)}\`，上游 \`${JSON.stringify(prop.default)}\``)
      }
    }
    // 上游边界必须有、不更松
    if (typeof branch.minimum === 'number') {
      if (typeof field.min !== 'number') {
        drift.push(`${tag}：上游 minimum=${branch.minimum}，catalog 未声明 min（面板可能放行上游拒的值）`)
      } else if (field.min < branch.minimum) {
        drift.push(`${tag}：min 比上游松 — catalog min=${field.min} < 上游 minimum=${branch.minimum}`)
      }
    }
    if (typeof branch.maximum === 'number') {
      if (typeof field.max !== 'number') {
        drift.push(`${tag}：上游 maximum=${branch.maximum}，catalog 未声明 max（面板可能放行上游拒的值）`)
      } else if (field.max > branch.maximum) {
        drift.push(`${tag}：max 比上游松 — catalog max=${field.max} > 上游 maximum=${branch.maximum}`)
      }
    }
  }
}

const version = JSON.parse(readFileSync(join(dirname(bin), '..', 'package.json'), 'utf8')).version
console.log(`[check:catalog] 上游 bin=${bin}`)
console.log(`[check:catalog] home=${home}  dsh=${version}  profile=${PROFILE}`)
console.log(`[check:catalog] 逐键比对 catalog ${CATALOG.length} 卡 / ${checkedFields} 字段 vs 上游 schema`)
if (drift.length > 0) {
  console.error(`\n[check:catalog] FAIL 与上游漂移 ${drift.length} 处：`)
  for (const d of drift) console.error(`  - ${d}`)
  console.error('\n清单是手抄的；上面每一条都要在 catalog 里改到与上游一致（或按「保留防呆」收紧，但不可更松），改完重跑。')
  process.exit(1)
}
console.log('[check:catalog] PASS 全部字段与上游 schema 一致（type/default 相等，上游边界不更松）。')
