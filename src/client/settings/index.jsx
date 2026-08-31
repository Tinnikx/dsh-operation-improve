/**
 * 通用设置栏里的「Harness 高级配置」一行。
 *
 * 这一类配置（`compaction-basic` 的压缩阈值、`tool-result-pruner` 的裁剪长度……）只有
 * cordis entry config，没有 settings 命名空间，`ctx.settings` 那条路够不到，所以界面上
 * 原本没有任何入口。这一行把它们搬进设置面板，写回当前 profile 的 `cordis.patch.yml`。
 *
 * `settings.general.item` 是 ui-settings-general 在**运行时**声明的 list slot，所以注册
 * 必须裹在 `ctx.slots.inject(name, cb)` 里等它声明；直接 `register` 到还没声明的 slot 会
 * 抛。行本体自带标签——这个 slot 的 owner props 是空的，什么都不投影下来。
 */
import { useCallback, useState } from 'react'

import { OWN_NS } from '../../shared/locale.js'
import { loadHarnessConfig, saveHarnessConfig } from './api.js'
import { HarnessConfigPanel } from './panel.jsx'
import { ROOT_CLASS, SETTINGS_CSS } from './styles.js'

export { SETTINGS_CSS }

/** 行在通用栏里的位置：排在上游的语言（10）/ 外观（20）/ 回车行为之后。 */
const ROW_ORDER = 60

/**
 * 把这一行装进通用设置栏。
 * @param {any} ctx 提供 `slots` 与 `locale` 的 client 根 context
 * @returns {{ dispose: () => void }} `dispose` 幂等，摘掉注册；`ctx.effect` 也已托管一份
 */
export function installHarnessConfigRow(ctx) {
  const dispose = ctx.slots.inject('settings.general.item', () => ctx.slots.register({
    name: 'settings.general.item',
    id: 'harness-advanced',
    order: ROW_ORDER,
    locale: OWN_NS,
    registrant: '@Tinnikx/dsh-operation-improve',
    inject: () => ({ load: loadHarnessConfig, save: saveHarnessConfig }),
  }, HarnessConfigRow))
  return { dispose }
}

/**
 * 行本体：标题 + 说明 + 展开开关。
 *
 * 面板只在展开时挂载——收起就该停掉它在飞的请求，也该在下次展开时重读文件。
 *
 * @param {object} props `t` 由 `locale` 声明合成；`load`/`save` 来自注册的 inject
 * @returns {import('react').ReactNode} 行元素
 */
function HarnessConfigRow({ t, load, save }) {
  const [open, setOpen] = useState(false)
  const toggle = useCallback(() => { setOpen((previous) => !previous) }, [])
  return (
    <div className={ROOT_CLASS} data-dsh-oi-harness-config="">
      <button type="button" className={`${ROOT_CLASS}__head`} aria-expanded={open} onClick={toggle}>
        <span>
          <span className={`${ROOT_CLASS}__title`}>{t('settings.title')}</span>
          <span className={`${ROOT_CLASS}__subtitle`}>{t('settings.subtitle')}</span>
        </span>
        <span className={`${ROOT_CLASS}__chevron`} aria-hidden="true">▸</span>
      </button>
      {open ? <HarnessConfigPanel t={t} load={load} save={save} /> : null}
    </div>
  )
}
