/**
 * 展开后的面板：按插件分组的卡片，**没有保存按钮**。
 *
 * 状态只活在这个组件里（一次 `GET` 的结果加一张草稿表），不进 slot store——没有第二
 * 个组件要读它，收起就该忘掉。**每次展开重新 `GET`**：patch 文件是热的，别人在编辑
 * 器里改过之后面板不重读就会拿旧基线去重述，把人家刚写的键抹掉。
 *
 * 三条与「点保存」那种面板不同的做法：
 *
 * - **每次提交发的是整张草稿表**，不是刚离开的那一个字段。跨字段规则跑在合成值上，
 *   只交当前字段就会让「先调小 `thresholdRatio`、再调小 `retainRatio`」死在第一步——
 *   而没有保存按钮，也就没有「两个一起交」的第二次机会。被拒的草稿因此原样留着，
 *   等下一个字段一起过。
 * - **提交串行**：连着两次 blur，第二次必须拿第一次写完后的 payload 去算重述，否则
 *   重述用的是旧基线，会把刚写进去的键抹掉。所以走一条 promise 链，并从 ref 读最新
 *   的 payload / 草稿——`setState` 是异步的，读 state 会读到上一轮。
 * - **`POST` 不挂卸载 abort**。点收起头部会先让输入框 blur、提交，紧接着面板卸载；
 *   跟着 `GET` 一起 abort 就等于静默吞掉用户最后一次改动。`setState` 改由 `mountedRef` 守。
 */
import { useCallback, useEffect, useRef, useState } from 'react'

import { buildOps, draftKey, isDirty, parseDraft } from './draft.js'
import { FieldRow } from './fields.jsx'
import { ROOT_CLASS } from './styles.js'

/**
 * 渲染面板。
 * @param {object} props `t` 本插件词典；`load`/`save` 注入进来的两次调用
 * @returns {import('react').ReactNode} 面板元素
 */
export function HarnessConfigPanel({ t, load, save }) {
  const [payload, setPayload] = useState(null)
  const [errors, setErrors] = useState([])
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(true)
  const [saved, setSaved] = useState(false)

  const mountedRef = useRef(true)
  const payloadRef = useRef(null)
  const draftRef = useRef({})
  const chainRef = useRef(Promise.resolve())

  useEffect(() => {
    mountedRef.current = true
    const controller = new AbortController()
    void (async () => {
      try {
        const next = await load(controller.signal)
        payloadRef.current = next
        if (mountedRef.current) { setPayload(next); setErrors([]) }
      } catch (error) {
        if (controller.signal.aborted || !mountedRef.current) return
        setErrors(error?.errors ?? [String(error?.message ?? error)])
      } finally {
        if (!controller.signal.aborted && mountedRef.current) setBusy(false)
      }
    })()
    return () => { mountedRef.current = false; controller.abort() }
  }, [load])

  /** 写一条草稿并同步 ref——提交要在同一个事件里读到它。 */
  const putDraft = useCallback((key, value) => {
    const next = { ...draftRef.current }
    if (value === undefined) delete next[key]
    else next[key] = value
    draftRef.current = next
    setDraft(next)
    setSaved(false)
    return next
  }, [])

  /**
   * 把当前整张草稿表提交一次。
   *
   * 有错就把草稿留着（输入框里还是用户打的字）并显示错误，**不发请求**；没有真实改动
   * 就丢掉草稿；否则写盘并换成回读到的新状态。
   */
  const runCommit = useCallback(async () => {
    const current = payloadRef.current
    if (current === null) return
    const compiled = buildOps(current.catalog, current.state, draftRef.current)
    if (compiled.errors.length > 0) {
      if (mountedRef.current) setErrors(compiled.errors)
      return
    }
    if (compiled.ops.length === 0) {
      draftRef.current = {}
      if (mountedRef.current) { setDraft({}); setErrors([]) }
      return
    }
    if (mountedRef.current) { setBusy(true); setErrors([]) }
    try {
      // 刻意不传 signal：这一次写盘要跑完，哪怕面板已经收起。
      const next = await save(compiled.ops)
      payloadRef.current = next
      draftRef.current = {}
      if (mountedRef.current) { setPayload(next); setDraft({}); setSaved(true) }
    } catch (error) {
      if (mountedRef.current) setErrors(error?.errors ?? [String(error?.message ?? error)])
    } finally {
      if (mountedRef.current) setBusy(false)
    }
  }, [save])

  const commit = useCallback(() => {
    chainRef.current = chainRef.current.then(runCommit, runCommit)
  }, [runCommit])

  if (payload === null) {
    return (
      <div className={`${ROOT_CLASS}__panel`} data-state={busy ? 'loading' : 'failed'}>
        {busy ? <div className={`${ROOT_CLASS}__note`}>{t('settings.loading')}</div> : null}
        <ErrorList errors={errors} />
      </div>
    )
  }

  const dirtyCount = countDirty(payload, draft)
  const readonly = payload.profile.writable !== true

  return (
    <div className={`${ROOT_CLASS}__panel`} data-state="ready">
      <div className={`${ROOT_CLASS}__note`}>{t('settings.file', { path: payload.profile.patchPath })}</div>
      <div className={`${ROOT_CLASS}__note`}>{t('settings.keep')}</div>
      {payload.warnings.length > 0
        ? (
          <div className={`${ROOT_CLASS}__warn`} data-warnings="">
            {payload.warnings.map((warning) => <div key={warning}>{warning}</div>)}
          </div>
        )
        : null}
      <ErrorList errors={errors} />
      {payload.catalog.map((entry) => (
        <EntryCard
          key={entry.id}
          t={t}
          entry={entry}
          entryState={payload.state[entry.id]}
          draft={draft}
          putDraft={putDraft}
          commit={commit}
          disabled={readonly}
        />
      ))}
      <div className={`${ROOT_CLASS}__status`} data-dirty-count={dirtyCount}>
        {statusText(t, { busy, dirtyCount, saved })}
      </div>
    </div>
  )
}

function EntryCard({ t, entry, entryState, draft, putDraft, commit, disabled }) {
  return (
    <div className={`${ROOT_CLASS}__card`} data-entry={entry.id}>
      <div className={`${ROOT_CLASS}__cardTitle`}>{entry.title}</div>
      <div className={`${ROOT_CLASS}__cardDesc`}>{entry.description}</div>
      {entryState?.present === true
        ? entry.fields.map((field) => (
          <FieldRow
            key={field.key}
            t={t}
            entry={entry}
            field={field}
            entryState={entryState}
            draft={draft}
            putDraft={putDraft}
            commit={commit}
            disabled={disabled}
          />
        ))
        : <div className={`${ROOT_CLASS}__absent`}>{t('settings.absent')}</div>}
    </div>
  )
}

function ErrorList({ errors }) {
  if (errors.length === 0) return null
  return (
    <div className={`${ROOT_CLASS}__error`} data-errors="">
      {errors.map((message) => <div key={message}>{message}</div>)}
    </div>
  )
}

/** 状态行文案：写盘中 → 还有没提交的草稿 → 刚写完 → 空。 */
function statusText(t, { busy, dirtyCount, saved }) {
  if (busy) return t('settings.saving')
  if (dirtyCount > 0) return t('settings.dirty', { n: dirtyCount })
  return saved ? t('settings.saved') : ''
}

/**
 * 还没提交的字段数。
 *
 * 解析失败的也算——它正是被留在草稿里等下一次一起提交的那一条，不算就会显示成
 * 「什么都没改」，而输入框里明明还有用户打的字。
 */
function countDirty(payload, draft) {
  let count = 0
  for (const entry of payload.catalog) {
    const entryState = payload.state[entry.id]
    if (entryState === undefined || !entryState.present) continue
    for (const field of entry.fields) {
      const draftEntry = draft[draftKey(entry.id, field.key)]
      if (draftEntry === undefined) continue
      if (isDirty(entryState, field, parseDraft(field, draftEntry))) count += 1
    }
  }
  return count
}
