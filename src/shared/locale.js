/**
 * 菜单文案的三个来源。
 *
 * 单选的五项与工作区删除确认整段借上游 `ui-workspace` 的 `workspace` 词典：同一条
 * 操作在这里和上游那个「...」菜单里必须是同一个词——fork 在上游叫「分叉会话」，
 * 自己写成「复刻会话」就是给同一个动作起了第二个名字。`ctx.locale.bind(ns)` 返回的
 * `t` 在**调用时**读 active locale，所以菜单只要在右键那一刻求值就自动跟随语言切换，
 * 不需要订阅 `locale/change`。
 *
 * 「复制」借 harness 的 **common** 词典（`copy`）。同理：消息气泡上那枚复制按钮用的
 * 就是这一条，自己再写一遍就是第二个说法。
 *
 * 批量项、批量确认与「粘贴」在上游没有对应词条（上游没有多选，common 里也没有
 * `paste`），这部分自注册一个本插件独占的 namespace。两份词典是 harness 发的全部
 * locale（`LOCALE_IDS`），少一份不会报错，只会让那个语言下静默落回英文。
 *
 * 批量文案里的 `{n}` 恒 `>= 2`：批量分支的判据是 `targets.length > 1`，所以英文写死
 * 复数形式不会撞上「1 workspaces」。
 */

/** 上游 `ui-workspace` 拥有的 namespace，本插件只读不写。 */
export const UPSTREAM_NS = 'workspace'

/** harness 的公共 namespace（`@deepseek-ai/dsh-client-locale` 的 `COMMON_NS`），只读不写。 */
export const COMMON_NS = 'common'

/** 本插件拥有的 namespace。 */
export const OWN_NS = '@Tinnikx/dsh-operation-improve'

/** 简体中文词典（键集以它为准）。 */
const zh = {
  'batch.deleteWorkspaces': '删除 {n} 个工作区',
  'batch.archiveSessions': '归档 {n} 个会话',
  'confirm.deleteWorkspaces': '删除 {n} 个工作区？其会话将显示在“{group}”下。',
  'confirm.archiveSessions': '归档 {n} 个会话？',
  'selection.paste': '粘贴',
  'settings.title': 'Harness 高级配置',
  'settings.subtitle': '压缩、裁剪、工具上限等只能手改配置文件的项目',
  'settings.loading': '正在读取当前配置…',
  'settings.file': '写入 {path}',
  'settings.keep': '改完离开输入框即自动保存，无需重启；未设置的项目走 harness 默认（整行灰显），移除本插件不会清空已写下的配置。',
  'settings.absent': '这个插件不在当前 profile 的组合里，无法配置。',
  'settings.defaultHint': '默认 {value}',
  'settings.clear': '清除',
  'settings.saving': '保存中…',
  'settings.saved': '已保存，无需重启',
  'settings.dirty': '{n} 项待保存',
  'settings.source.panel': '本面板',
  'settings.source.manual': '手写',
  'settings.source.bundle': '组合默认',
  'settings.source.system': '系统默认',
}

/** 英文词典，键集与 zh 对齐。 */
const en = {
  'batch.deleteWorkspaces': 'Delete {n} workspaces',
  'batch.archiveSessions': 'Archive {n} sessions',
  'confirm.deleteWorkspaces': 'Delete {n} workspaces? Their sessions will appear under {group}.',
  'confirm.archiveSessions': 'Archive {n} sessions?',
  'selection.paste': 'Paste',
  'settings.title': 'Harness advanced configuration',
  'settings.subtitle': 'Compaction, pruning and tool limits — settings that otherwise need a hand-edited config file',
  'settings.loading': 'Reading the current configuration…',
  'settings.file': 'Written to {path}',
  'settings.keep': 'Edits save themselves when the field loses focus, no restart needed. Unset fields are dimmed and fall back to the harness defaults; removing this plugin does not clear what you wrote.',
  'settings.absent': 'This plugin is not part of the current profile composition.',
  'settings.defaultHint': 'default {value}',
  'settings.clear': 'Clear',
  'settings.saving': 'Saving…',
  'settings.saved': 'Saved, no restart needed',
  'settings.dirty': '{n} pending',
  'settings.source.panel': 'this panel',
  'settings.source.manual': 'hand-written',
  'settings.source.bundle': 'composition',
  'settings.source.system': 'harness default',
}

/**
 * 注册本插件词典并绑出三个 translate 函数。
 *
 * 三个函数都是 `(key, params?) => string`，`params` 按 `{name}` 模板替换，调用时才读
 * active locale。`t` 查上游 `workspace` 词典，`tCommon` 查 harness 的 common 词典，
 * `tOwn` 查本插件自己的。
 *
 * @param {any} ctx 提供 `locale` 服务的 client 根 context
 * @returns {{ t: (key: string, params?: Record<string, unknown>) => string,
 *   tCommon: (key: string, params?: Record<string, unknown>) => string,
 *   tOwn: (key: string, params?: Record<string, unknown>) => string,
 *   dispose: () => void }} `dispose` 幂等，摘掉本插件的词典注册
 * @throws 同一个 namespace 的同一个 locale 被注册两次时由 locale 服务抛出
 */
export function installLocale(ctx) {
  const disposeDict = ctx.locale.register(OWN_NS, { zh, en })
  const upstream = ctx.locale.bind(UPSTREAM_NS)
  const common = ctx.locale.bind(COMMON_NS)
  const tOwn = ctx.locale.bind(OWN_NS)

  /** 已经报过的键；同一个键只出声一次，右键一次就刷一屏没有意义。 */
  const warned = new Set()

  /**
   * 上游词典的 translate 工厂，外加一层 miss 检测。
   *
   * 查找链（namespace 的 active locale → 该 namespace 的 en → common → key 本身）在全
   * 部落空时返回键名本身。上游改键名不会让页面崩，只会让菜单上出现一行 `menu.fork`，
   * 除非这里出声，否则没人会注意到文案退回成了英文标识符。
   *
   * @param {string} ns 只用于报警文本
   * @param {(key: string, params?: Record<string, unknown>) => string} bound
   * @returns {(key: string, params?: Record<string, unknown>) => string}
   */
  const guard = (ns, bound) => (key, params) => {
    const text = bound(key, params)
    if (text === key && !warned.has(`${ns}:${key}`)) {
      warned.add(`${ns}:${key}`)
      console.warn(
        `[@Tinnikx/dsh-operation-improve] 上游词典 "${ns}" 里没有键 "${key}"，`
        + '菜单会把这个键名本身显示出来',
      )
    }
    return text
  }

  let disposed = false
  return {
    t: guard(UPSTREAM_NS, upstream),
    tCommon: guard(COMMON_NS, common),
    tOwn,
    dispose: () => {
      if (disposed) return
      disposed = true
      disposeDict()
    },
  }
}
