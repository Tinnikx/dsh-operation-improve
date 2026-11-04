/**
 * 菜单文案的两个来源。
 *
 * 「复制」借 harness 的 **common** 词典（`copy`）。同一个动作在消息气泡的复制按钮上
 * 已经有官方叫法，自己再写一遍就是第二个说法。
 *
 * 「粘贴」、查找条与设置面板那几处在上下游都没有对应词条（common 里没有 `paste`），
 * 这部分自注册一个本插件独占的 namespace。两份词典是 harness 发的全部 locale
 * （`LOCALE_IDS`），少一份不会报错，只会让那个语言下静默落回英文。
 */

/** harness 的公共 namespace（`@deepseek-ai/dsh-client-locale` 的 `COMMON_NS`），只读不写。 */
export const COMMON_NS = 'common'

/** 本插件拥有的 namespace。 */
export const OWN_NS = '@Tinnikx/dsh-operation-improve'

/** 简体中文词典（键集以它为准）。 */
const zh = {
  'selection.paste': '粘贴',
  'find.placeholder': '在页面中查找',
  'find.noResults': '无结果',
  'find.count': '{index} / {total}',
  'find.prev': '上一个匹配项',
  'find.next': '下一个匹配项',
  'find.close': '关闭查找',
  'settings.title': 'Harness 高级配置',
  'settings.subtitle': '检索分页、工具预算等只能手改配置文件的项目',
  'settings.loading': '正在读取当前配置…',
  'settings.file': '写入 {path}',
  'settings.keep': '改完离开输入框即自动保存，无需重启；未设置的项目走 harness 默认（整行灰显），移除本插件不会清空已写下的配置。',
  'settings.piNotice': '手动添加的模型若不在 pi-ai 内置目录里、也没声明 contextWindow，上下文窗口按 256K（262,144 token）计——「DeepSeek 模型接入」卡的默认窗口管不到它。请在 ~/.dsh/settings.yaml 里按路由为该模型设置真实窗口（模型条目写 contextWindow，或整条路由写 defaultContextWindow）。',
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
  'settings.effect.immediate': '保存即生效',
  'settings.effect.session': '保存即生效；已开的会话不变',
  'settings.effect.nextRequest': '保存即生效（下一轮请求）',
  'settings.effect.nextQuery': '保存即生效（下一次检索）',
  'settings.effect.nextAttachment': '保存即生效（下一次入库）',
  'settings.effect.nextSession': '保存即生效（新会话起）',
  'settings.effect.restart': '重启 harness 后生效',
}

/** 英文词典，键集与 zh 对齐。 */
const en = {
  'selection.paste': 'Paste',
  'find.placeholder': 'Find in page',
  'find.noResults': 'No results',
  'find.count': '{index} of {total}',
  'find.prev': 'Previous match',
  'find.next': 'Next match',
  'find.close': 'Close find bar',
  'settings.title': 'Harness advanced configuration',
  'settings.subtitle': 'Search paging, tool budgets — settings that otherwise need a hand-edited config file',
  'settings.loading': 'Reading the current configuration…',
  'settings.file': 'Written to {path}',
  'settings.keep': 'Edits save themselves when the field loses focus, no restart needed. Unset fields are dimmed and fall back to the harness defaults; removing this plugin does not clear what you wrote.',
  'settings.piNotice': 'A manually added model that pi-ai does not know and that declares no contextWindow is sized at 256K (262,144 tokens) — the default window in the "DeepSeek 模型接入" card does not reach it. Set the real window per route in ~/.dsh/settings.yaml (contextWindow on the model entry, or defaultContextWindow on the route).',
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
  'settings.effect.immediate': 'applies on save',
  'settings.effect.session': 'applies on save; open sessions unchanged',
  'settings.effect.nextRequest': 'applies on save (next model request)',
  'settings.effect.nextQuery': 'applies on save (next search)',
  'settings.effect.nextAttachment': 'applies on save (next image upload)',
  'settings.effect.nextSession': 'applies on save (new sessions)',
  'settings.effect.restart': 'takes effect after a harness restart',
}

/**
 * 注册本插件词典并绑出两个 translate 函数。
 *
 * 两个函数都是 `(key, params?) => string`，`params` 按 `{name}` 模板替换，调用时才读
 * active locale。`tCommon` 查 harness 的 common 词典，`tOwn` 查本插件自己的。
 *
 * @param {any} ctx 提供 `locale` 服务的 client 根 context
 * @returns {{ tCommon: (key: string, params?: Record<string, unknown>) => string,
 *   tOwn: (key: string, params?: Record<string, unknown>) => string,
 *   dispose: () => void }} `dispose` 幂等，摘掉本插件的词典注册
 * @throws 同一个 namespace 的同一个 locale 被注册两次时由 locale 服务抛出
 */
export function installLocale(ctx) {
  const disposeDict = ctx.locale.register(OWN_NS, { zh, en })
  const common = ctx.locale.bind(COMMON_NS)
  const tOwn = ctx.locale.bind(OWN_NS)

  /** 已经报过的键；同一个键只出声一次，每次界面重绘都刷一屏没有意义。 */
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
    tCommon: guard(COMMON_NS, common),
    tOwn,
    dispose: () => {
      if (disposed) return
      disposed = true
      disposeDict()
    },
  }
}
