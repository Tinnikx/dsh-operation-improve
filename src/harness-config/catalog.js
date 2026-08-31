/**
 * 精选清单的校验与查询。清单数据本体在 [catalog-entries.js](catalog-entries.js)，
 * 收录口径也写在那里。
 *
 * `crossRules` 是**上游会硬抛的跨字段约束**的镜像，前后端共用同一份声明（GET 把
 * 目录原样发给客户端）。镜像不是装饰：违反 `retainRatio < thresholdRatio` 或
 * `headChars + 39 + tailChars ≤ thresholdChars` 会让对应插件**加载失败**，
 * 而 patch 是热的——写下去那一刻整棵树就起不来了。
 */

import { CATALOG } from './catalog-entries.js'

export { CATALOG }

/** @type {Map<string, object>} */
const BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]))

/**
 * 查一个目录条目。
 * @param {string} id entry id
 * @returns {object | undefined} 目录条目，不在清单里时 undefined
 */
export function catalogEntry(id) {
  return BY_ID.get(id)
}

/**
 * 查一个字段声明。
 * @param {string} id entry id
 * @param {string} key 字段名
 * @returns {object | undefined} 字段声明，不在清单里时 undefined
 */
export function catalogField(id, key) {
  return BY_ID.get(id)?.fields.find((field) => field.key === key)
}

/**
 * 按字段声明校验一个值，顺带把界面送来的字符串收成目标类型。
 * @param {object} field 来自 {@link CATALOG} 的字段声明
 * @param {unknown} raw 待校验的值
 * @returns {{ value: unknown } | { error: string }} 收窄后的值，或中文错误说明
 */
export function coerceField(field, raw) {
  if (field.type === 'boolean') {
    if (typeof raw !== 'boolean') return { error: `${field.label} 必须是布尔值` }
    return { value: raw }
  }
  if (field.type === 'integer-list') {
    if (!Array.isArray(raw)) return { error: `${field.label} 必须是数组` }
    const out = []
    for (const item of raw) {
      if (!Number.isInteger(item)) return { error: `${field.label} 的每一项必须是整数` }
      if (field.min !== undefined && item < field.min) return { error: `${field.label} 的每一项不能小于 ${field.min}` }
      out.push(item)
    }
    if (out.length === 0) return { error: `${field.label} 不能为空` }
    return { value: out }
  }
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return { error: `${field.label} 必须是数字` }
  if (field.type === 'integer' && !Number.isInteger(raw)) return { error: `${field.label} 必须是整数` }
  if (field.min !== undefined) {
    if (field.exclusive ? raw <= field.min : raw < field.min) {
      return { error: `${field.label} 必须${field.exclusive ? '大于' : '不小于'} ${field.min}` }
    }
  }
  if (field.max !== undefined) {
    if (field.exclusive ? raw >= field.max : raw > field.max) {
      return { error: `${field.label} 必须${field.exclusive ? '小于' : '不大于'} ${field.max}` }
    }
  }
  return { value: raw }
}

/**
 * 跑一个 entry 的跨字段规则。
 *
 * 传进来的必须是**生效值**（托管值叠在区段外基线之上），不是本次改动的增量：
 * 上游校验看到的就是合成后的 config，只看增量会漏掉「改一个键触发另一个键越界」。
 *
 * @param {object} entry 来自 {@link CATALOG} 的目录条目
 * @param {Record<string, unknown>} values 该 entry 的生效 config
 * @returns {string[]} 违反的规则说明，全过时为空数组
 */
export function checkCrossRules(entry, values) {
  const problems = []
  for (const rule of entry.crossRules) {
    if (rule.kind === 'lessThan') {
      const a = pick(values, rule.field, entry)
      const b = pick(values, rule.than, entry)
      if (typeof a === 'number' && typeof b === 'number' && !(a < b)) problems.push(rule.message)
    } else if (rule.kind === 'sumAtMost') {
      const sum = rule.fields.reduce((acc, key) => acc + toNumber(pick(values, key, entry)), rule.plus)
      const cap = pick(values, rule.atMost, entry)
      if (typeof cap === 'number' && sum > cap) problems.push(rule.message)
    } else if (rule.kind === 'increasing') {
      const list = pick(values, rule.field, entry)
      if (Array.isArray(list)) {
        for (let i = 1; i < list.length; i += 1) {
          if (!(list[i - 1] < list[i])) { problems.push(rule.message); break }
        }
      }
    }
  }
  return problems
}

/** 取生效值；键不存在时用目录里的默认值——上游校验看到的正是这个回落。 */
function pick(values, key, entry) {
  if (values[key] !== undefined) return values[key]
  return entry.fields.find((field) => field.key === key)?.default
}

function toNumber(value) {
  return typeof value === 'number' ? value : 0
}
