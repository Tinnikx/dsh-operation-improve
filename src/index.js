/**
 * `@Tinnikx/dsh-operation-improve` — host 半边。
 *
 * 除了让插件出现在 host 组合里（从而让 `package.json` 的 `dsh.client` 半边被发现
 * 并加载），host 侧只做一件事：挂上「Harness 高级配置」面板要的那条回环路由，
 * 见 [harness-config/route.js](./harness-config/route.js)。
 */
import { mountHarnessConfigRoute } from './harness-config/route.js'

const name = '@Tinnikx/dsh-operation-improve'

/** `webServer` 缺席时插件挂起不动——非 web surface 下本来也没有面板。 */
const inject = ['webServer', 'loader']

function apply(ctx) {
  mountHarnessConfigRoute(ctx)
}

export { apply, inject, name }
