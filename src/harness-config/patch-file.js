/**
 * 用户 patch 层里那一个**托管区段**的读写。
 *
 * 本插件只拥有两行标记之间的字节：读文件 → 按标记切成 before / section / after →
 * 只重写中段 → 原样拼回。区段外一个字节都不动，包括别人写的行内注释。
 *
 * 三条实测出来的约束（step 0，隔离栈上量的）：
 *
 * - **区段必须在文件末尾**。调用方靠「解析出来的 patch 列表去掉尾部 K 条」还原出
 *   区段外的基线，K 是区段里的顶层条目数；有人在闭标记之后又手写了列表项，这个
 *   还原就不成立，调用方必须自己发现并回落。
 * - **纯注释文档 / 空文件会让 profile 加载失败**（`overlay ... must be a top-level
 *   YAML array of loader patch entries`），而 harness 自带的模板末尾是一行裸 `[]`。
 *   所以区段整体删除后，若剩下的文档里再没有顶层列表项，必须补一行 `[]`。
 * - 落盘走同目录 `rename`：`cordis.patch.yml` 被 `watchUserPatches` 热监听，
 *   非原子写会让 watcher 读到半个文件，整棵树按加载失败处理。
 */
import { renameSync, writeFileSync } from 'node:fs'

/**
 * 开标记的固定前缀（后面还跟着给人看的说明，匹配只认前缀）。
 *
 * **不带 `@Tinnikx/` scope，也不跟着包名走。** 这两行标记是写在用户 `cordis.patch.yml`
 * 里的持久字节，而区段的约定是「移除本插件也不清空」。改掉标记就等于认不出已经写下的
 * 区段：它降级成普通用户 patch 留在文件里，面板在末尾再追加一段新的，旧那段从此没有
 * 任何界面能改。要改标记就得同时带上一条迁移，不能只换字符串。
 */
export const MANAGED_BEGIN_PREFIX = '# >>> dsh-operation-improve'
/** 闭标记，整行固定。约束同上。 */
export const MANAGED_END = '# <<< dsh-operation-improve'

const BEGIN_LINE = `${MANAGED_BEGIN_PREFIX}: 「Harness 高级配置」面板托管区段`
const NOTE_LINES = [
  '# 这一段由设置面板整体重写，手改会在下次保存时丢失；要手写请放到标记之外。',
  '# 移除本插件不会清空这一段，写下的配置照样生效。',
]
const MANAGED_NOTE = '    # ↓ 由「Harness 高级配置」面板设置'
const RESTATE_NOTE = '    # ↓ 面板之外已有的值，原样重述：patch 按 id 命中会整体替换 config，不重述就被抹掉了'
const MANAGED_HEADER_PREFIX = '# managed: '

/**
 * 按标记把文件切三段。
 * @param {string} text 文件全文（文件不存在时传 `''`）
 * @returns {{ before: string, section: string, after: string, found: boolean }}
 *   `before` 与 `after` 是区段外的原始字节；`section` 含标记行本身与它前面那一行
 *   分隔空行（写入时由本模块产生，删除时要一起消失）。
 * @throws 开标记有、闭标记没有时抛——这种文件不该被猜着改。
 */
export function splitManaged(text) {
  const lines = text.split('\n')
  let begin = -1
  let end = -1
  for (let i = 0; i < lines.length; i += 1) {
    if (begin === -1) {
      if (lines[i].startsWith(MANAGED_BEGIN_PREFIX)) begin = i
      continue
    }
    if (lines[i].startsWith(MANAGED_END)) { end = i; break }
  }
  if (begin === -1) return { before: text, section: '', after: '', found: false }
  if (end === -1) {
    throw new Error(`${MANAGED_BEGIN_PREFIX} 有开标记但找不到闭标记 ${MANAGED_END}，拒绝改写`)
  }
  let start = begin
  if (start > 0 && lines[start - 1] === '') start -= 1
  const before = start > 0 ? `${lines.slice(0, start).join('\n')}\n` : ''
  const section = `${lines.slice(start, end + 1).join('\n')}\n`
  const after = lines.slice(end + 1).join('\n')
  return { before, section, after, found: true }
}

/**
 * 读区段头里那行机器可读的托管键名册。
 * @param {string} section {@link splitManaged} 切出来的区段文本
 * @returns {Record<string, string[]> | null} 名册；区段没有或名册被手改坏时 null
 */
export function readManagedHeader(section) {
  for (const line of section.split('\n')) {
    if (!line.startsWith(MANAGED_HEADER_PREFIX)) continue
    try {
      const parsed = JSON.parse(line.slice(MANAGED_HEADER_PREFIX.length))
      return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? parsed : null
    } catch {
      // 名册被手改成非 JSON。区段本来就声明「手改会丢」，交给调用方回落。
      return null
    }
  }
  return null
}

/**
 * 数区段里的顶层列表项。调用方用它把解析出来的 patch 列表切掉尾部。
 * @param {string} section {@link splitManaged} 切出来的区段文本
 * @returns {number} 顶层 `- ` 行数
 */
export function countSectionItems(section) {
  let count = 0
  for (const line of section.split('\n')) if (line.startsWith('- ')) count += 1
  return count
}

/**
 * 渲染托管区段。
 * @param {Array<{ id: string, managed: Array<[string, unknown]>, restated: Array<[string, unknown]> }>} plans
 *   每个 entry 的托管键与必须重述的键，按写入顺序
 * @param {boolean} separator 区段前是否需要一行空行（`before` 非空时需要）
 * @returns {string} 以换行结尾的区段文本；`plans` 为空时返回 `''`
 * @throws 值不是 JSON 可表达的形状时抛——宁可拒绝写，也不写出一份猜出来的 YAML
 */
export function renderSection(plans, separator) {
  if (plans.length === 0) return ''
  const header = {}
  for (const plan of plans) header[plan.id] = plan.managed.map(([key]) => key)

  const out = []
  if (separator) out.push('')
  out.push(BEGIN_LINE, ...NOTE_LINES, MANAGED_HEADER_PREFIX + JSON.stringify(header))
  for (const plan of plans) {
    out.push(`- id: ${plan.id}`)
    out.push('  config:')
    if (plan.managed.length > 0) {
      out.push(MANAGED_NOTE)
      for (const [key, value] of plan.managed) out.push(...serializeLines(key, value, 4))
    }
    if (plan.restated.length > 0) {
      out.push(RESTATE_NOTE)
      for (const [key, value] of plan.restated) out.push(...serializeLines(key, value, 4))
    }
  }
  out.push(MANAGED_END)
  return `${out.join('\n')}\n`
}

/**
 * 把三段拼回一份完整文档，必要时补上裸 `[]`。
 * @param {string} before 区段之前的原始字节
 * @param {string} section {@link renderSection} 的产物（删除区段时传 `''`）
 * @param {string} after 区段之后的原始字节
 * @returns {string} 待落盘的全文
 */
export function composeFile(before, section, after) {
  let head = before
  if (head.length > 0 && !head.endsWith('\n')) head += '\n'
  const text = head + section + after
  return hasTopLevelItem(text) ? text : `${text}${text.endsWith('\n') || text.length === 0 ? '' : '\n'}[]\n`
}

/** 文档里有没有顶层列表项或裸流式集合——没有的话它不是合法的 patch 层。 */
function hasTopLevelItem(text) {
  for (const line of text.split('\n')) {
    if (line.startsWith('- ') || line === '-') return true
    const trimmed = line.trim()
    if (trimmed.startsWith('[') || trimmed.startsWith('!!')) return true
  }
  return false
}

/**
 * 同目录临时文件 + `rename` 落盘。
 * @param {string} path 目标路径
 * @param {string} text 全文
 */
export function writeAtomic(path, text) {
  const tmp = `${path}.dsh-oi.tmp`
  writeFileSync(tmp, text, 'utf8')
  renameSync(tmp, path)
}

/**
 * 把一个 `key: value` 序列化成若干行 YAML。
 * @param {string} key 键名（只允许目录里的键，形状受控）
 * @param {unknown} value JSON 可表达的值
 * @param {number} indent 缩进空格数
 * @returns {string[]} 行数组
 * @throws 值含函数、`undefined`、循环引用等 JSON 表达不了的东西时抛
 */
function serializeLines(key, value, indent) {
  const pad = ' '.repeat(indent)
  if (isScalar(value)) return [`${pad}${key}: ${scalar(value)}`]
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${key}: []`]
    if (value.every(isScalar)) return [`${pad}${key}: [${value.map(scalar).join(', ')}]`]
    const lines = [`${pad}${key}:`]
    for (const item of value) {
      if (isScalar(item)) { lines.push(`${pad}  - ${scalar(item)}`); continue }
      throw new Error(`无法序列化 ${key}：数组里出现了嵌套结构`)
    }
    return lines
  }
  if (typeof value === 'object' && value !== null) {
    const lines = [`${pad}${key}:`]
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childValue === undefined) continue
      lines.push(...serializeLines(childKey, childValue, indent + 2))
    }
    return lines
  }
  throw new Error(`无法序列化 ${key}：${typeof value} 不是 JSON 可表达的值`)
}

function isScalar(value) {
  if (value === null) return true
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'string'
}

/** 标量的 YAML 写法。**字符串一律双引号**：裸写会把 `yes` / `1.0` / `null` 变成别的类型。 */
function scalar(value) {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') return String(value)
  return JSON.stringify(value)
}
