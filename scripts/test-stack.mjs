/**
 * 测试栈：一个与日常使用完全隔离的 harness + Chrome，供三个 verify 脚本打。
 *
 * 存在的理由只有一条：**验证脚本会真的点击「归档 N 个会话」「删除 N 个工作区」**。
 * 服务打了 spy、清场停掉了 native、菜单还带归属校验，但这些都是兜底；真正的隔离
 * 是让被点击的那一侧根本不是真数据。所以测试栈自带一份 `DSH_HOME` 副本，跑在
 * 自己的端口上，日常那个 harness（3080）不参与验证。
 *
 * **副本不能省，也不能换成同一个 `DSH_HOME`**：同一个 home 上的两个 harness 各持
 * 一份启动时读进内存的 workspace 状态，谁都不看对方的写入——一边归档掉的会话在另
 * 一边照样列着，且后写的静默盖掉前一个（见父仓库 `CLAUDE.md` 的「接管而不是另起」）。
 * 拿真 home 起第二个 harness，等于用测试去改用户正在看的那份列表。
 *
 * **副本必须是真复制，不能用硬链接或符号链接省空间**：`storages/workspace.json` 是
 * 整体覆写，硬链接进来的文件被覆写时未必断开链接，那就直接写回了真 home。
 *
 * `.credentials.yaml` 不进副本——测试只渲染界面，不需要凭据。
 *
 * 用法（`npm run stack:up` / `stack:down` / `stack:status` 是同名别名）：
 *   node scripts/test-stack.mjs up       同步副本、起 harness 与 Chrome，等到可用
 *   node scripts/test-stack.mjs down     停掉两个进程（副本留着，下次 up 走增量）
 *   node scripts/test-stack.mjs status   报告两侧的存活与就绪情况
 *
 * 端口是写死的（harness 3181 / CDP 9334），与 `lib/cdp.mjs` 里的默认目标同源：
 * 验证脚本不传参就打在这里。
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** 日常在用的那个 harness 的端口——测试栈绝不能起在它上面。 */
const RESERVED_PORT = 3080

const HARNESS_PORT = 3181
const CDP_PORT = 9334
const PAGE_URL = `http://127.0.0.1:${HARNESS_PORT}/`

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..')
const PLUGIN_NAME = '@Tinnikx/dsh-operation-improve'
/** 真 home 的 profile 里装的还是改 scope 之前的名字，副本里要一并改过来。 */
const LEGACY_PLUGIN_NAME = 'dsh-operation-improve'
const REAL_HOME = join(homedir(), '.dsh')
const TEST_HOME = join(REPO, 'tmp/dsh-oi-test-home')
const STATE_DIR = join(REPO, 'tmp/dsh-oi-stack')
const CHROME_PROFILE = join(STATE_DIR, 'chrome')
const HARNESS_LOG = join(STATE_DIR, 'harness.log')
const HARNESS_PID = join(STATE_DIR, 'harness.pid')
const CHROME_PID = join(STATE_DIR, 'chrome.pid')

/** 产品自带的 node。Electron 那份跑不了 harness 的原生模块，见父仓库 README。 */
const NODE_BIN = join(REAL_HOME, 'desktop-bin/node-shim/node')

/**
 * headless Chrome 的启动参数。
 *
 * `--window-size` 不能小：窄窗口下侧边栏是折叠的，一条 `[role="treeitem"]` 都查不到。
 * 两个 `--blink-settings` 的 hover 参数也不能省：headless 默认 `(hover: none)`，上游
 * 那条把时间藏起来的 `@media (hover: hover)` 规则整条不生效，功能 4 的「改成常驻」
 * 断言会在什么都没测到的情况下报绿（`Emulation.setEmulatedMedia` 对 hover 无效，
 * 实测下发无错但 `matchMedia` 不变）。
 */
const CHROME_ARGS = [
  '--headless=new', '--no-sandbox', '--disable-gpu',
  '--window-size=1600,1000',
  `--remote-debugging-port=${CDP_PORT}`,
  '--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4',
  `--user-data-dir=${CHROME_PROFILE}`,
  PAGE_URL,
]

const CHROME_BIN = '/opt/google/chrome/chrome'

/** @param {string} message */
function die(message) {
  console.error(`[test-stack] ${message}`)
  process.exit(1)
}

// 本脚本要 `fetch`、顶层 `await`、`import.meta.dirname` 级别的新特性，而这台机器的
// 默认 `node` 是 nvm 里的 v16。**版本不对必须在这里就炸**：v16 上 `fetch` 是
// `undefined`，探测端口的那次调用会抛 ReferenceError，被当成「端口被占」——脚本
// 于是报一句和事实相反的话就退出，没人看得出根因。
if (Number.parseInt(process.versions.node.split('.')[0], 10) < 20) {
  die(`需要 node 20+，当前 ${process.version}。用产品自带的那份：`
    + 'PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/test-stack.mjs')
}

/** @param {number} ms */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 读一个 pid 文件，顺带确认那个进程还活着。
 *
 * pid 会被系统回收，所以存活不等于「还是我们起的那个」；调用方要么只用它做
 * 「有没有东西在跑」的提示，要么像 {@link stopProcess} 那样再核一次命令行。
 *
 * @param {string} file
 * @returns {number | null}
 */
function readPid(file) {
  if (!existsSync(file)) return null
  const pid = Number.parseInt(readFileSync(file, 'utf8').trim(), 10)
  if (!Number.isInteger(pid) || pid <= 0) return null
  try {
    process.kill(pid, 0)
    return pid
  } catch {
    // ESRCH：进程没了。EPERM 不可能——两边同一个用户。
    return null
  }
}

/**
 * 停掉一个进程，但**先核对它的命令行**。
 *
 * pid 文件是上一次运行留下的，进程早退出、pid 被系统分给别人是常态；不核对就
 * 可能杀掉一个无关进程。核对的是 `/proc/<pid>/cmdline` 里有没有我们认得的标记。
 *
 * @param {string} file pid 文件
 * @param {string} marker 命令行里必须出现的片段
 * @param {string} label 打印用的名字
 */
async function stopProcess(file, marker, label) {
  const pid = readPid(file)
  if (pid === null) {
    console.log(`[test-stack] ${label}: 没有在跑`)
    rmSync(file, { force: true })
    return
  }
  let cmdline = ''
  try {
    cmdline = readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ')
  } catch {
    // 进程刚好在这一瞬间退出了；当作已经停掉。
    rmSync(file, { force: true })
    return
  }
  if (!cmdline.includes(marker)) {
    console.log(`[test-stack] ${label}: pid ${pid} 已被系统回收（命令行对不上），不发信号`)
    rmSync(file, { force: true })
    return
  }
  process.kill(pid, 'SIGTERM')
  for (let i = 0; i < 50; i += 1) {
    if (readPid(file) === null) break
    await sleep(100)
  }
  const still = readPid(file)
  if (still !== null) process.kill(still, 'SIGKILL')
  rmSync(file, { force: true })
  console.log(`[test-stack] ${label}: 已停（pid ${pid}）`)
}

/**
 * 端口上有没有东西在答话。
 *
 * 只把「连不上」判为空闲，答了任何东西（哪怕 500）都算被占。**非网络错误一律
 * 上抛**：把它们吞进「被占」会让一个环境问题伪装成一次正常的占用判定。
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
async function portBusy(port) {
  try {
    await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(1500) })
    return true
  } catch (error) {
    if (error.name === 'TimeoutError') return true
    if (!(error instanceof TypeError)) throw error
    const codes = [error.cause?.code, ...(error.cause?.errors ?? []).map((e) => e.code)]
    if (codes.includes('ECONNREFUSED')) return false
    throw error
  }
}

/** 把真 home 同步成副本。首次全量，之后只搬变化的部分。 */
function syncHome() {
  if (!existsSync(REAL_HOME)) die(`找不到 ${REAL_HOME}`)
  mkdirSync(TEST_HOME, { recursive: true })
  const args = [
    '-a', '--delete',
    // 凭据不进副本：测试只渲染界面。
    '--exclude=.credentials.yaml',
    // Chrome / Electron 的运行时垃圾，复制过去没有意义。
    '--exclude=*.sock', '--exclude=*.lock',
    `${REAL_HOME}/`, `${TEST_HOME}/`,
  ]
  const res = spawnSync('rsync', args, { stdio: ['ignore', 'inherit', 'inherit'] })
  if (res.error !== undefined) die(`rsync 起不来：${res.error.message}`)
  if (res.status !== 0) die(`rsync 失败（退出码 ${res.status}）`)
  relinkPlugin()
  console.log(`[test-stack] 副本已同步：${TEST_HOME}`)
}

/**
 * 把副本里指向本仓库的那条插件软链重新指对，并把包名改成 scoped 的那个。
 *
 * `pnpm add link:` 在 profile 的 `node_modules` 里留的是**相对**软链
 * （`../../../../dev/co-creation-project/...`），相对的起点是 home 自己。`rsync -a`
 * 原样搬运软链的目标字符串，于是副本里那条从 `/tmp/` 往上数四层，指到一个不存在的
 * `/tmp/dev/...`——**插件就这么静默消失**，页面照样 200、照样出界面，只是四项功能
 * 一个都没有。改写成绝对路径，指回本仓库；同一份源码，两个 home 共用。
 *
 * 真 home 里装的是旧名，所以软链与 manifest 要一起改，见 {@link rescopeManifest}。
 */
function relinkPlugin() {
  const modules = join(TEST_HOME, 'profiles/web/node_modules')
  // 旧名那条软链也要摘掉：留着副本里就有两份同源的包，而 manifest 改写漏一处
  // 就会静默走回旧的那份，症状与「改名没生效」一模一样。
  rmSync(join(modules, LEGACY_PLUGIN_NAME), { force: true })
  const link = join(modules, PLUGIN_NAME)
  // scoped 包多一层目录，副本里未必已经有 `@Tinnikx/`。
  mkdirSync(dirname(link), { recursive: true })
  rmSync(link, { force: true })
  symlinkSync(REPO, link)
  rescopeManifest()
}

/**
 * 把副本 profile 的 manifest 改成 scoped 包名。
 *
 * `dsh.profile.bundles` 里的每一项都是**模块说明符**：app-boot 拿它去 profile 目录下
 * 解析包，client-modules 又拿 loader entry 的 `name` 去解析 client bundle。两处都必须
 * 与 `package.json` 的 `name` 逐字相同，所以副本里只改软链不改 manifest，解析仍然按
 * 旧名走——而旧名那条软链已经被摘掉，表现是 harness 起不来。
 *
 * **只改副本**：真 home 的 profile 由用户自己 `dsh plugin` 维护，测试不碰。
 */
function rescopeManifest() {
  const path = join(TEST_HOME, 'profiles/web/package.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))

  const deps = manifest.dependencies
  if (deps === undefined || (deps[LEGACY_PLUGIN_NAME] === undefined && deps[PLUGIN_NAME] === undefined)) {
    die(`副本的 profile manifest 里没有本插件的依赖项——它没装进 ${REAL_HOME}/profiles/web。`)
  }
  delete deps[LEGACY_PLUGIN_NAME]
  deps[PLUGIN_NAME] = `link:${REPO}`

  const bundles = manifest.dsh?.profile?.bundles
  if (!Array.isArray(bundles)) die('副本的 profile manifest 里没有 dsh.profile.bundles 数组。')
  const at = bundles.indexOf(LEGACY_PLUGIN_NAME)
  if (at !== -1) bundles[at] = PLUGIN_NAME
  else if (!bundles.includes(PLUGIN_NAME)) die(`副本的 dsh.profile.bundles 里没有本插件：${bundles.join('、')}`)

  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

/** harness 的入口。 */
function harnessBin() {
  // 两个候选按「离用户实际跑的那份最近」排序：真 home 解析得到的是产品自带的
  // 那个 CLI——也就是 3080 上正在服务的同一份；解析不到（没装产品）才回落到外层
  // 工作区里的 npm 依赖。两者同版本，差别只在谁更能代表用户看到的行为。
  const candidates = [join(REAL_HOME, 'profiles/web/noop.js'), join(REPO, '../apps/shell/src/noop.js')]
  for (const from of candidates) {
    try {
      return createRequire(from).resolve('@deepseek-ai/dsh/lib/bin.js')
    } catch {
      // MODULE_NOT_FOUND：这个起点够不着 CLI，试下一个。别的错误 require.resolve 不抛。
    }
  }
  die(`解析不到 @deepseek-ai/dsh/lib/bin.js（试过 ${candidates.join('、')}）`)
}

/** 起 harness，等到首页答 200 且带插件名册。 */
async function startHarness() {
  if (await portBusy(HARNESS_PORT)) die(`${HARNESS_PORT} 已被占用，先 npm run stack:down`)
  if (!existsSync(NODE_BIN)) die(`找不到产品自带的 node：${NODE_BIN}`)

  const log = openSync(HARNESS_LOG, 'w')
  const child = spawn(
    NODE_BIN,
    // `--expose-internals` 在脚本之前：它是运行时 flag，Cordis 的加载器要用内部
    // ESM 解析器。顺序换了会被当成脚本参数，harness 起不来。
    ['--expose-internals', harnessBin(), '--profile', 'web', '--port', String(HARNESS_PORT)],
    {
      env: { ...process.env, DSH_HOME: TEST_HOME },
      stdio: ['ignore', log, log],
      detached: true,
    },
  )
  child.unref()
  writeFileSync(HARNESS_PID, String(child.pid))

  for (let i = 0; i < 120; i += 1) {
    await sleep(500)
    if (readPid(HARNESS_PID) === null) die(`harness 退出了，日志：${HARNESS_LOG}`)
    let html = ''
    try {
      const res = await fetch(PAGE_URL, { signal: AbortSignal.timeout(1500) })
      if (!res.ok) continue
      html = await res.text()
    } catch {
      continue
    }
    // 判据是名册而不是「答了 200」：插件解析失败时服务器照样 200、照样吐出
    // `<div id="root">`，用户拿到的是白屏。
    if (!html.includes('__DSH_BOOT__')) continue
    const hasPlugin = html.includes('@Tinnikx/dsh-operation-improve')
    console.log(`[test-stack] harness 就绪：${PAGE_URL} pid=${child.pid} 本插件在名册里=${hasPlugin}`)
    if (!hasPlugin) {
      die(`副本的 profile 里没有 @Tinnikx/dsh-operation-improve——它没装进 ${REAL_HOME}/profiles/web，或同步漏了。`)
    }
    return
  }
  die(`harness 60 秒内没就绪，日志：${HARNESS_LOG}`)
}

/** 起 Chrome，等到 CDP 上出现被测页面的 target。 */
async function startChrome() {
  if (!existsSync(CHROME_BIN)) die(`找不到 ${CHROME_BIN}`)
  const log = openSync(join(STATE_DIR, 'chrome.log'), 'w')
  const child = spawn(CHROME_BIN, CHROME_ARGS, { stdio: ['ignore', log, log], detached: true })
  child.unref()
  writeFileSync(CHROME_PID, String(child.pid))

  for (let i = 0; i < 60; i += 1) {
    await sleep(500)
    try {
      const targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`, {
        signal: AbortSignal.timeout(1500),
      })).json()
      const page = targets.find((t) => t.type === 'page' && t.url.startsWith(PAGE_URL.slice(0, -1)))
      if (page === undefined) continue
      console.log(`[test-stack] Chrome 就绪：CDP ${CDP_PORT} pid=${child.pid} target=${page.url}`)
      return
    } catch {
      continue
    }
  }
  die(`Chrome 30 秒内没在 CDP ${CDP_PORT} 上给出 ${PAGE_URL} 的 target`)
}

async function up() {
  if (HARNESS_PORT === RESERVED_PORT) die('测试栈的端口不能是日常那个 harness 的端口')
  mkdirSync(STATE_DIR, { recursive: true })
  syncHome()
  await startHarness()
  await startChrome()
  console.log('\n[test-stack] 起好了。现在可以不带参数跑验证脚本：')
  // 带上 PATH 前缀照抄即可用：`PATH=… npm run stack:up` 只对那一条命令生效，
  // 跑完这个提示的那个 shell 里 `node` 仍是系统/nvm 那份。
  const prefix = 'PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH'
  console.log(`  ${prefix} npm run verify`)
  console.log(`  ${prefix} npm run verify:timestamps`)
  console.log(`[test-stack] 用完停掉：${prefix} npm run stack:down`)
}

async function down() {
  await stopProcess(CHROME_PID, CHROME_PROFILE, 'chrome')
  await stopProcess(HARNESS_PID, `--port ${HARNESS_PORT}`, 'harness')
}

async function status() {
  const harness = readPid(HARNESS_PID)
  const chrome = readPid(CHROME_PID)
  const serving = await portBusy(HARNESS_PORT)
  console.log(JSON.stringify({
    testHome: TEST_HOME,
    homeExists: existsSync(TEST_HOME),
    harnessPid: harness,
    harnessServing: serving,
    chromePid: chrome,
    pageUrl: PAGE_URL,
    cdpPort: CDP_PORT,
  }, null, 2))
}

const command = process.argv[2] ?? 'up'
if (command === 'up') await up()
else if (command === 'down') await down()
else if (command === 'status') await status()
else die(`未知命令 ${command}（up | down | status）`)
