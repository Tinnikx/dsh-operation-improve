/**
 * 实测驱动的靶子与 DOM 读数工具，给 [verify-live.mjs](../verify-live.mjs) 等脚本共用。
 *
 * **为什么要靶子**：菜单项的动作是真服务（`workspaces.delete`、`archiveSession`……），
 * 断言没法再靠 spy 记账——插件的菜单换成上游组件后，会话那一支必须在页面里那份真实实例
 * 上跑（条目要从真 `slots` 服务里读出来），于是「点哪一行」就等于「动哪一行数据」。所以
 * 脚本自己建可丢弃的工作区当靶子，破坏性项只对靶子点，收尾（含任何非零退出）删干净。
 *
 * 靶子只落在**测试栈**那份 `DSH_HOME` 副本上（`scripts/test-stack.mjs` 每次启动都从真
 * home 重新同步），日常在用的那个 harness 由 `lib/cdp.mjs` 的 `resolveTarget` 挡在门外。
 *
 * **靶子只有工作区，没有会话**：`sessions.create` 建出来的会话是 blank 的，而
 * `ui-workspace/src/client/tree.ts:238-256` 的 `sessionVisible()` 首行就是
 * `if (session.blank && session.id !== current) return false`；blank 只由真发一条消息翻掉
 * （`session-controller/src/client/sessions/manager.ts:278-292`），公开 API 里没有开关。
 * 换句话说新建的会话永远没有侧栏行，当不了靶子。会话侧改用别的办法验，见
 * [verify-live.mjs](../verify-live.mjs) 里「打桩 + 逐项全等」那几条。
 *
 * 这里只提供机制。判据归调用方。
 */
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { abort } from './cdp.mjs'

/** 靶子标题的固定前缀：清理与人工辨认都靠它。 */
export const FIXTURE_PREFIX = 'dsh-oi-verify'

/** 靶子工作区目录的落脚点：系统临时目录，测试栈与日常都不往里放别的。 */
const FIXTURE_ROOT = join(tmpdir(), FIXTURE_PREFIX)

/**
 * 页面上那份插件实例的调试句柄，取不到就中止。
 *
 * 没有它就没有靶子可建，也没有任何菜单断言的基准——静默继续只会让每条断言都退化成
 * 「没测到」，而 SKIP 在这套框架里同样是非零退出。
 *
 * @param {(expression: string, retries?: number) => Promise<any>} evaluate CDP 求值器
 * @returns {Promise<string>} 实例 id
 */
export async function requireInstance(evaluate) {
  const probe = await evaluate(`(() => {
    const h = window.__dshOperationImprove__
    if (h === undefined || h === null) return { ok: false, reason: 'handle absent' }
    return {
      ok: typeof h.instanceId === 'string',
      instanceId: h.instanceId,
      services: Object.keys(h.services ?? {}).sort(),
      uiWorkspace: typeof (h.services ?? {}).uiWorkspace?.startSession,
    }
  })()`)
  if (probe.ok !== true) {
    abort(
      '页面上没有本插件的实例句柄。',
      `观测：${JSON.stringify(probe)}\n`
      + '处理：`node scripts/build.mjs` 之后整页 reload，并让测试栈重新同步 profile'
      + '（node scripts/test-stack.mjs up 每次启动都从真 home 重同步）。',
    )
  }
  for (const service of ['workspaces', 'sessions', 'slots']) {
    if (!(probe.services ?? []).includes(service)) {
      abort(
        `句柄上的 services 少了 ${service}，靶子建不起来。`,
        `观测：${JSON.stringify(probe)}\n处理：重新构建并刷新页面。`,
      )
    }
  }
  return probe.instanceId
}

/**
 * 建一个靶子工作区。
 *
 * 工作区必须指向**真实存在**的目录：host 侧 `WorkspaceCommands.create` 是「把一个已存在
 * 的路径登记为工作区」，`workspaceRegistry.create` 抛错就翻成 `workspace/invalid-path`
 * （`workspace-controller/src/commands.ts:44-61`）。页面 JS 没有建目录的能力，所以
 * 目录由这里先 `mkdirSync` 出来——上游自己的 spec 也是 `stageDir(root, name)` 这么写
 * 的（`workspace-controller.host.spec.ts`）。
 *
 * 落点是系统临时目录而不是测试栈 home：harness 是同一个进程读同一个文件系统，
 * `/tmp` 在副本与真 home 之间没有区别，而测试栈 home 会被 `stack:up` 的重新同步抹掉。
 *
 * @param {(expression: string, retries?: number) => Promise<any>} evaluate CDP 求值器
 * @param {string} tag 靶子标记，进目录名与标题
 * @returns {Promise<{ workspaceId: string, title: string, cwd: string }>}
 */
export async function createFixtures(evaluate, tag = FIXTURE_PREFIX) {
  const name = `${tag}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  const cwd = join(FIXTURE_ROOT, name)
  mkdirSync(cwd, { recursive: true })

  const result = await evaluate(`(async () => {
    const svc = window.__dshOperationImprove__.services
    const cwd = ${JSON.stringify(cwd)}
    const created = await svc.workspaces.create({ path: cwd })
      .then((view) => ({ ok: true, view }))
      .catch((error) => ({ ok: false, reason: String(error && error.message ? error.message : error) }))
    if (created.ok !== true) return { ok: false, step: 'workspaces.create', reason: created.reason }
    const view = created.view.workspace ?? created.view
    // 标题由 host 从目录名派生，所以目录名带 tag 就等于标题带 tag。
    window.__dshOiFixtures__ = { workspaceId: view.workspaceId, title: view.title, cwd }
    return { ok: true, workspaceId: view.workspaceId, title: view.title, cwd }
  })()`)
  if (result.ok !== true) {
    rmSync(cwd, { force: true, recursive: true })
    abort(
      `靶子建不起来（${result.step ?? 'unknown'}）：${result.reason ?? '无原因'}`,
      '靶子是破坏性菜单项的唯一合法目标，没有它就不能安全地点「删除工作区」。\n'
      + `尝试的目录：${cwd}\n`
      + '处理：确认该目录可创建，且 harness 没有把工作区路径限制在别处。',
    )
  }
  return result
}

/**
 * 删掉靶子：工作区记录 + 目录移除。
 *
 * 目录是脚本自己 `mkdirSync` 出来的，所以由这边 `rmSync` 收尾；页面里的服务只认工作区
 * 那条记录，管不到磁盘。失败都吞掉并如实回报——收尾只做尽力而为，绝不因为它把断言
 * 结果改成别的意思。
 *
 * @param {(expression: string, retries?: number) => Promise<any>} evaluate CDP 求值器
 * @returns {Promise<{ deleted: boolean, removed: boolean }>}
 */
export async function cleanupFixtures(evaluate) {
  const result = await evaluate(`(async () => {
    const svc = window.__dshOperationImprove__.services
    const fx = window.__dshOiFixtures__
    if (fx === undefined) return { deleted: false, cwd: null }
    const deleted = await svc.workspaces.delete(fx.workspaceId)
      .then(() => true)
      .catch(() => false)
    const cwd = fx.cwd
    delete window.__dshOiFixtures__
    return { deleted, cwd }
  })()`)
  let removed = false
  if (typeof result.cwd === 'string') {
    rmSync(result.cwd, { force: true, recursive: true })
    removed = true
  }
  return { deleted: result.deleted, removed }
}

export { abort }
