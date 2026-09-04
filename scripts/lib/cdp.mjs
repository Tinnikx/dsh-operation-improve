/**
 * 两个实测驱动（`verify-live.mjs` / `verify-timestamps-live.mjs`）
 * 共用的 CDP 连接与断言框架。抽出来不是为了行数，而是这几份东西原先各存了一份拷贝——
 * 判据的语义（「skip 也算失败」「非零退出」）和 CDP 的踩坑（导航期重试、协议错误与页面
 * 异常分开报）改一处忘另一处只是时间问题。
 *
 * 这里只提供机制，不含任何被测功能的知识：具体断言、preflight 的门槛、注入哪个
 * bundle，都由调用方决定。测试栈的默认地址是唯一的例外，理由见 {@link resolveTarget}。
 */

/** 测试栈的 CDP 端口（`scripts/test-stack.mjs` 起的那个 Chrome）。 */
export const TEST_CDP_PORT = '9334'

/** 测试栈的页面地址前缀（`scripts/test-stack.mjs` 起的那个 harness）。 */
export const TEST_PAGE_PREFIX = 'http://127.0.0.1:3181'

/** 日常使用的那个 harness——验证脚本一律不许打上去。 */
const RESERVED_PORT = '3080'

/**
 * 解析被测目标，并挡住打到日常 harness 上的调用。
 *
 * 默认指向测试栈而不是 3080：验证脚本会真的点击破坏性菜单项，服务虽然是 spy，
 * 但**任何一道闸失手都直接落在真数据上**，而 3080 上跑的是日常在用的那个 harness。
 * 隔离要靠地址本身，不靠记得多传一个参数——所以默认值是测试栈，3080 反过来需要
 * 显式解锁。
 *
 * 3080 上的页面照样可以调试，只是要自己说出口：`DSH_OI_ALLOW_3080=1`。
 *
 * @param {string[]} argv 位置参数 `[cdpPort, pageUrlPrefix]`，通常是 `process.argv.slice(2)`
 * @returns {{ port: string, prefix: string }}
 *   命中保留端口且未解锁时直接 `abort`，不返回。
 */
export function resolveTarget(argv) {
  const port = argv[0] ?? process.env.DSH_OI_CDP_PORT ?? TEST_CDP_PORT
  const prefix = argv[1] ?? process.env.DSH_OI_PAGE ?? TEST_PAGE_PREFIX
  if (prefix.includes(`:${RESERVED_PORT}`) && process.env.DSH_OI_ALLOW_3080 !== '1') {
    abort(
      `拒绝对着 ${prefix} 跑验证——${RESERVED_PORT} 是日常在用的 harness。`,
      '验证脚本会真的点击「归档 N 个会话」这类菜单项。服务是 spy，三道闸也都在，'
      + '但闸的作用是兜底，不是许可证：真数据不该出现在被点击的那一侧。\n'
      + `处理：先起测试栈（node scripts/test-stack.mjs up），它会在 ${TEST_PAGE_PREFIX} 上`
      + `跑一个独立 DSH_HOME 的 harness、在 CDP ${TEST_CDP_PORT} 上开一个独占 Chrome，`
      + '然后不带参数重跑本脚本。\n'
      + `确实要对着 ${RESERVED_PORT} 调试只读断言：DSH_OI_ALLOW_3080=1 再跑。`,
    )
  }
  return { port, prefix }
}

/**
 * 响亮失败：打印原因后以非零码退出。
 *
 * 用于「实测未发生」——环境不满足导致断言根本没跑。这种情况必须中止而不是记成
 * 跳过：一个全是 skip 却退 0 的脚本，比没有脚本更糟。
 *
 * @param {string} reason 一句话结论
 * @param {string} [detail] 观测值与处理建议
 * @returns {never}
 */
export function abort(reason, detail) {
  console.error(`\n[ABORT] ${reason}`)
  if (detail !== undefined) console.error(detail)
  process.exitCode = 1
  process.exit(1)
}

/**
 * 创建一个绑定到某个 CDP 端点的求值器。
 *
 * @param {{ port: string, prefix: string }} target
 *   `port` 是 CDP 调试端口，`prefix` 用来在 `/json/list` 里挑出被测页面的 target。
 * @returns {Promise<{ connect: () => Promise<{ ws: WebSocket, send: (m: string, p?: object) => Promise<any> }>,
 *   evaluate: (expression: string, retries?: number) => Promise<any>, conn: { ws: WebSocket, send: Function } }>}
 *   `conn` 是一条长驻连接，只用于 `Page.reload` 这类需要收事件的场合；
 *   `evaluate` 每次调用自己开一条临时连接，用完即关。
 *   页面 target 不存在时直接 `abort`，不返回。
 */
export async function createEvaluator({ port, prefix }) {
  /**
   * 开一条到当前页面 target 的 CDP 连接。
   *
   * **每次求值都新开一条，而不是全程共用一条长驻连接**：断言里会点击会话行，
   * 而切会话销毁执行上下文，之后这条连接上的每次 `Runtime.evaluate` 都被协议层
   * 拒为 `-32000 Inspected target navigated or closed`，整轮验证崩在半路——证据链
   * 就此断掉。重开连接会重新解析 target 与执行上下文，因此切会话后照样能求值。
   */
  async function connect() {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
    const page = targets.find((t) => t.type === 'page' && t.url.startsWith(prefix))
    if (page === undefined) {
      abort(`CDP ${port} 上没有 ${prefix} 的页面 target`, '先起一个加载了该地址的 Chrome 实例，见 README「验证」。')
    }
    const ws = new (globalThis.WebSocket)(page.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })
    let seq = 0
    const pending = new Map()
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data)
      const entry = pending.get(msg.id)
      if (entry === undefined) return
      pending.delete(msg.id)
      entry(msg)
    })
    const send = (method, params) => {
      const id = (seq += 1)
      return new Promise((resolve) => {
        pending.set(id, resolve)
        ws.send(JSON.stringify({ id, method, params }))
      })
    }
    return { ws, send }
  }

  /**
   * 在页面里求值一段表达式，返回 JSON 值。
   *
   * 协议层错误（执行上下文被销毁）与页面异常是两回事，分开报：`res.result` 缺席时
   * 直接读 `.result.value` 只会退化成一句无信息的 TypeError。
   *
   * `Inspected target navigated or closed` 会在导航正在进行时出现——点击会话行本身
   * 就可能触发应用内导航。这是**时序**而不是判据失败，所以短暂重试；仍然失败就
   * 抛给调用方，由它决定是中止还是记为失败。
   */
  async function evaluate(expression, retries = 2) {
    for (let attempt = 0; ; attempt += 1) {
      const fresh = await connect()
      try {
        const res = await fresh.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
        if (res.error !== undefined) {
          const navigating = String(res.error.message ?? '').includes('navigated or closed')
          if (navigating && attempt < retries) {
            await new Promise((r) => setTimeout(r, 1500))
            continue
          }
          throw new Error(`CDP error: ${JSON.stringify(res.error)}`)
        }
        if (res.result?.exceptionDetails !== undefined) {
          throw new Error(res.result.exceptionDetails.exception?.description ?? 'page exception')
        }
        return res.result.result.value
      } finally {
        fresh.ws.close()
      }
    }
  }

  const conn = await connect()
  return { connect, evaluate, conn }
}

/**
 * 重新加载页面并等前端挂载完。
 *
 * 等 `Page.loadEventFired` 而不是定长 sleep：常驻 Chrome 上重载耗时不定，抢在导航
 * 完成前求值会拿到协议层的 "Inspected target navigated or closed"。
 *
 * @param {{ ws: WebSocket, send: Function }} conn 长驻连接（临时连接收不到事件）
 * @param {{ mountMs?: number, loadTimeoutMs?: number }} [options]
 */
export async function reloadAndWait(conn, options) {
  const mountMs = options?.mountMs ?? 6000
  const loadTimeoutMs = options?.loadTimeoutMs ?? 20000
  await conn.send('Page.enable', {})
  const loaded = new Promise((resolve) => {
    const onMessage = (event) => {
      if (JSON.parse(event.data).method === 'Page.loadEventFired') {
        conn.ws.removeEventListener('message', onMessage)
        resolve()
      }
    }
    conn.ws.addEventListener('message', onMessage)
  })
  await conn.send('Page.reload', { ignoreCache: false })
  await Promise.race([loaded, new Promise((r) => setTimeout(r, loadTimeoutMs))])
  // 前端挂载与插件加载在 load 之后，再给它一段时间把界面渲染出来。
  await new Promise((resolve) => setTimeout(resolve, mountMs))
}

/**
 * 断言记录器。
 *
 * `expect` 返回 `true` 记 PASS，返回字符串记 FAIL 并把该字符串当作失败原因。
 * 观测值里带 `skipped` 字段则记 SKIP——**SKIP 与 FAIL 同样导致非零退出**，
 * 「没测成」不是「测过了」。
 *
 * @returns {{ check: (label: string, value: any, expect: (v: any) => true | string) => void,
 *   report: () => never }}
 *   **`report()` 两条路径都以 `process.exit` 结束，绝不返回**——成功也退出（码 0），
 *   不是只在失败时退。因此它必须是脚本的最后一句：写在它后面的收尾（关连接、打印
 *   补充统计）永远不会执行。要关长驻连接就放在 `report()` 之前。
 */
export function createChecker() {
  const results = []

  /**
   * @param {string} label
   * @param {any} value 页面侧返回的观测值
   * @param {(v: any) => true | string} expect 返回 true 为通过，返回字符串为失败原因
   */
  function check(label, value, expect) {
    if (value !== null && typeof value === 'object' && 'skipped' in value) {
      results.push({ label, status: 'SKIP', value, reason: String(value.skipped) })
      console.log(`[SKIP] ${label}: ${JSON.stringify(value)}`)
      return
    }
    let verdict
    try {
      verdict = expect(value)
    } catch (error) {
      verdict = `断言自身抛错：${error.message}`
    }
    if (verdict === true) {
      results.push({ label, status: 'PASS', value })
      console.log(`[PASS] ${label}: ${JSON.stringify(value)}`)
    } else {
      results.push({ label, status: 'FAIL', value, reason: String(verdict) })
      console.log(`[FAIL] ${label}: ${JSON.stringify(value)}  ← ${verdict}`)
    }
  }

  /**
   * 打印 summary 并退出进程：`failed + skipped > 0` 用码 1，否则用码 0。
   *
   * 两条路径都不返回，调用方后面的语句不会执行——见本模块 `createChecker` 的
   * 返回值说明。显式退出是为了让「全绿」这件事只有一个出口，不依赖调用方自己
   * 记得设 `process.exitCode`。
   */
  function report() {
    const passed = results.filter((r) => r.status === 'PASS').length
    const failed = results.filter((r) => r.status === 'FAIL').length
    const skipped = results.filter((r) => r.status === 'SKIP').length

    console.log('\n=== summary ===')
    for (const r of results) {
      const suffix = r.status === 'PASS' ? '' : `  ← ${r.reason}`
      console.log(`[${r.status}] ${r.label}: ${JSON.stringify(r.value)}${suffix}`)
    }
    console.log(`\npassed=${passed} failed=${failed} skipped=${skipped} total=${results.length}`)

    if (failed + skipped > 0) {
      console.error('[FAILED] 存在未通过或未执行的断言——「跳过」不算通过。')
      process.exitCode = 1
      process.exit(1)
    }
    console.log('[OK] 全部断言实际执行且通过。')
    process.exit(0)
  }

  return { check, report }
}
