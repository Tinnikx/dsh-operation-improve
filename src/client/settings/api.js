/**
 * 面板这一侧对那条回环路由的两次调用。
 *
 * 路由的错误一律是 `{ ok: false, errors: string[] }`，这里把它抬成带 `errors` 的
 * `Error`——面板要把每一条原样显示在字段下方，不能压成一句话。
 */
import { HARNESS_CONFIG_ROUTE } from '../../harness-config/route-path.js'

/**
 * 读一次完整状态。
 * @param {AbortSignal} [signal] 取消信号（面板收起 / 卸载时用）
 * @returns {Promise<object>} 路由的 `{ catalog, profile, warnings, state }`
 * @throws 带 `errors: string[]` 的 Error；网络失败时 `errors` 只有一条
 */
export async function loadHarnessConfig(signal) {
  return request({ method: 'GET', signal })
}

/**
 * 提交一批改动。
 * @param {Array<{ id: string, field: string, op: 'set' | 'unset', value?: unknown }>} ops 改动列表
 * @param {AbortSignal} [signal] 取消信号
 * @returns {Promise<object>} 写入后回读到的新状态，形状同 {@link loadHarnessConfig}
 * @throws 带 `errors: string[]` 的 Error；**抛出即文件未被修改**（路由整批拒绝）
 */
export async function saveHarnessConfig(ops, signal) {
  return request({
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ops }),
  })
}

async function request(init) {
  let response
  try {
    response = await fetch(HARNESS_CONFIG_ROUTE, init)
  } catch (error) {
    // fetch 只在网络层失败时抛（HTTP 4xx/5xx 照样 resolve），所以这里一定是
    // 「请求没发出去」或「连接断了」，与 harness 的回答无关。
    throw withErrors(new Error(String(error?.message ?? error)), [
      `连不上 harness：${error?.message ?? error}`,
    ])
  }
  let payload
  try {
    payload = await response.json()
  } catch {
    // 路由永远回 JSON。走到这里说明答的不是它——多半是 SPA 首页，即这一份 harness
    // 没有加载本插件的 host 半边。
    throw withErrors(new Error('响应不是 JSON'), [
      `${HARNESS_CONFIG_ROUTE} 没有回 JSON（HTTP ${response.status}）：当前 harness 可能没有加载本插件的 host 半边。`,
    ])
  }
  if (!response.ok || payload?.ok !== true) {
    const errors = Array.isArray(payload?.errors) && payload.errors.length > 0
      ? payload.errors
      : [`请求失败（HTTP ${response.status}）`]
    throw withErrors(new Error(errors[0]), errors)
  }
  return payload
}

function withErrors(error, errors) {
  error.errors = errors
  return error
}
