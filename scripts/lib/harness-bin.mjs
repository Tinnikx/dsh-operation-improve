/**
 * 解析当前权威 harness 的 CLI 入口（`@deepseek-ai/dsh/lib/bin.js`）。
 *
 * 这条解析路径原先只住在 `scripts/test-stack.mjs` 里。功能 8 的
 * `npm run check:catalog` 门禁要用**同一份** harness 跑 `--dump-config-schema`，
 * 拿到的上游 config schema 才与验证脚本跑的是同一个版本；两处各存一份候选顺序，
 * 早晚会出现「验证打 rc.1、门禁 dump 了 alpha.2」这种错版比对。所以抽出来共用。
 *
 * 候选顺序照 {@link resolveHarnessBin} 注释——desktop dist 打包的那份是产品随版本
 * 发布带出去的构建，不受真 home 的 node_modules 指向 dev 工作区旧构建的影响。
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

/**
 * @param {{ repo: string, realHome: string }} paths 仓库根与真 home（`~/.dsh`）
 * @returns {string} harness CLI 入口的绝对路径
 * @throws 全部候选都解析不到时抛（未装产品且回起点也够不着）
 */
export function resolveHarnessBin({ repo, realHome }) {
  const forced = process.env.DSH_TEST_BIN
  if (forced !== undefined && forced !== '') {
    if (!existsSync(forced)) throw new Error(`DSH_TEST_BIN 指向的文件不存在：${forced}`)
    return forced
  }
  const desktopBin = join(repo, '../dsh-desktop/dist/desktop/dsh-linux-x64/resources/app/node_modules/@deepseek-ai/dsh/lib/bin.js')
  if (existsSync(desktopBin)) return desktopBin
  const candidates = [join(realHome, 'profiles/web/noop.js'), join(repo, '../apps/shell/src/noop.js')]
  for (const from of candidates) {
    try {
      return createRequire(from).resolve('@deepseek-ai/dsh/lib/bin.js')
    } catch {
      // MODULE_NOT_FOUND：这个起点够不着 CLI，试下一个。别的错误 require.resolve 不抛。
    }
  }
  throw new Error(`解析不到 @deepseek-ai/dsh/lib/bin.js（desktop dist 不在，且试过 ${candidates.join('、')}）`)
}
