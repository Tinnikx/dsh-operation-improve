/**
 * 面板与 harness 之间那条回环路由。
 *
 * 第三方插件拿不到 typert RPC（生成器不在闭包里），所以 host↔client 只能走 host
 * 自己挂的 HTTP 路由，照 `dsh-desktop` 里审批 SSE 那条先例注册。
 *
 * **路由永远不写任意 YAML**：POST 只接受 {@link CATALOG} 里的 `(id, field)` 对，
 * 值按字段声明收窄、按跨字段规则校验，任何目录外的键或非法值一律 400。
 */
import { CATALOG } from './catalog.js'
import { applyOps, readState } from './profile.js'
import { HARNESS_CONFIG_ROUTE } from './route-path.js'

export { HARNESS_CONFIG_ROUTE }

/** 请求体上限：一次改动最多几十个数字，1 MiB 已经宽得离谱。 */
const MAX_BODY_BYTES = 1 << 20

/**
 * 挂上 `GET`/`POST /operation-improve/harness-config`。
 * @param {object} ctx cordis Context，需要 `webServer`（`loader` 可选，只用于读跑着的值）
 * @returns {void} 注册与卸载由 `ctx.effect` 托管
 */
export function mountHarnessConfigRoute(ctx) {
  const handler = (req, res) => {
    void serve(ctx, req, res).catch((error) => {
      send(res, 500, { ok: false, errors: [String(error?.message ?? error)] })
    })
  }
  ctx.effect(
    () => ctx.webServer.register({ kind: 'exact', path: HARNESS_CONFIG_ROUTE, handler }),
    '@Tinnikx/dsh-operation-improve: harness config route',
  )
}

async function serve(ctx, req, res) {
  if (req.method === 'GET') {
    send(res, 200, { ok: true, catalog: CATALOG, ...(await readState(ctx)) })
    return
  }
  if (req.method !== 'POST') {
    send(res, 405, { ok: false, errors: [`不支持的方法 ${req.method}`] })
    return
  }
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch (error) {
    send(res, 400, { ok: false, errors: [`请求体不是合法 JSON：${error.message}`] })
    return
  }
  if (!Array.isArray(body?.ops)) {
    send(res, 400, { ok: false, errors: ['请求体需要 { ops: [...] }'] })
    return
  }
  const result = await applyOps(ctx, body.ops)
  if (!result.ok) {
    send(res, result.status, { ok: false, errors: result.errors })
    return
  }
  send(res, 200, { ok: true, catalog: CATALOG, ...result.state })
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('请求体过大'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

function send(res, status, payload) {
  if (res.writableEnded) return
  const text = JSON.stringify(payload)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(text)
}
