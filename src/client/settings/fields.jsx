/**
 * 面板里的一行字段。
 *
 * 每行左边是标签与说明，右边是控件、来源徽标和「清除」。两条不显然的约定：
 *
 * - **「清除」不是「填回默认值」**：它下的是 `unset`，让这个键从托管区段里消失，从而
 *   回到 harness 自己的默认；把默认值写进文件会在上游改默认时把旧值钉死。
 * - **没人设过的字段只淡化控件本身，默认值只走 placeholder，不进 `value`**。填进 `value`
 *   的话，一次 blur 就把 harness 的默认值当成用户输入写死进了文件——同上，旧值被钉住。
 *   标签与说明不跟着淡：读不读得懂这一项，与它是不是默认值无关。
 *
 * 四个提交点：输入框 blur、输入框 `Enter`（转成 blur）、复选框 change、「清除」click。
 */
import { draftKey, currentValue, formatValue, parseDraft, isDirty, sourceOf } from './draft.js'
import { ROOT_CLASS } from './styles.js'

/**
 * 渲染一行字段。
 * @param {object} props `t` 本插件词典；`entry`/`field` 目录条目与字段声明；
 *   `entryState` 该 entry 的服务端状态；`draft` 整张草稿表；`putDraft(key, value)`
 *   写草稿（`value` 为 `undefined` 表示撤销这一条）；`commit()` 提交整张草稿表；
 *   `disabled` patch 文件不可写
 * @returns {import('react').ReactNode} 行元素
 */
export function FieldRow({ t, entry, field, entryState, draft, putDraft, commit, disabled }) {
  const key = draftKey(entry.id, field.key)
  const draftEntry = draft[key]
  const live = currentValue(entryState, field)
  const parsed = draftEntry === undefined ? undefined : parseDraft(field, draftEntry)
  const dirty = parsed !== undefined && isDirty(entryState, field, parsed)
  const source = sourceOf(entryState, field)
  const managed = entryState.managed.includes(field.key)
  // 三层都没设过、草稿也没动过 = 这一行显示的就是 harness 自己的默认值。
  const atDefault = source === 'system' && draftEntry === undefined
  // bundle 层设的值报得出是哪个包设的；报不出时退回「组合默认」这种笼统说法。
  const owner = source === 'bundle' ? (entryState.bundleOwners?.[field.key] ?? null) : null

  const control = field.type === 'boolean'
    ? (
      <input
        type="checkbox"
        className={`${ROOT_CLASS}__check`}
        disabled={disabled}
        checked={boolFromDraft(draftEntry, live, field)}
        onChange={(event) => { putDraft(key, { kind: 'bool', value: event.target.checked }); commit() }}
      />
    )
    : (
      <input
        type="text"
        inputMode={field.type === 'integer-list' ? 'text' : 'decimal'}
        className={`${ROOT_CLASS}__input`}
        data-dirty={dirty ? '' : undefined}
        data-field={`${entry.id}.${field.key}`}
        disabled={disabled}
        placeholder={formatValue(field, field.default)}
        value={draftEntry?.kind === 'text' ? draftEntry.text : formatValue(field, live)}
        onChange={(event) => { putDraft(key, { kind: 'text', text: event.target.value }) }}
        onBlur={() => { commit() }}
        onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
      />
    )

  // 「清除」在这个字段既没被本面板管、草稿也没动过时无事可做。
  const clearable = !disabled && (managed || dirty)

  return (
    <div className={`${ROOT_CLASS}__field`} data-default={atDefault ? '' : undefined}>
      <div className={`${ROOT_CLASS}__fieldMain`}>
        <div className={`${ROOT_CLASS}__label`}>{field.label}</div>
        {field.help === '' ? null : <div className={`${ROOT_CLASS}__help`}>{field.help}</div>}
      </div>
      <div className={`${ROOT_CLASS}__fieldSide`}>
        {control}
        <div className={`${ROOT_CLASS}__meta`}>
          <span
            className={`${ROOT_CLASS}__badge`}
            data-source={source}
            data-owner={owner ?? undefined}
            title={owner ?? undefined}
          >
            {owner === null ? t(`settings.source.${source}`) : shortenPackage(owner)}
          </span>
          <span>{t('settings.defaultHint', { value: formatValue(field, field.default) })}</span>
          <button
            type="button"
            className={`${ROOT_CLASS}__link`}
            data-clear={`${entry.id}.${field.key}`}
            disabled={!clearable}
            onClick={() => { putDraft(key, managed ? { kind: 'unset' } : undefined); commit() }}
          >
            {t('settings.clear')}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * 徽标里显示的包名。
 *
 * 只摘掉上游自己那个 scope——第三方插件的 scope 留着，它才是「谁设的」里的「谁」。
 * @param {string} name 完整包名
 * @returns {string} 显示用的短名；完整名由 `title` 兜底
 */
function shortenPackage(name) {
  const scope = '@deepseek-ai/'
  return name.startsWith(scope) ? name.slice(scope.length) : name
}

/** 复选框的显示状态：草稿优先，其次生效值，最后目录默认。 */
function boolFromDraft(draftEntry, live, field) {
  if (draftEntry?.kind === 'bool') return draftEntry.value
  if (draftEntry?.kind === 'unset') return field.default === true
  if (typeof live === 'boolean') return live
  return field.default === true
}
