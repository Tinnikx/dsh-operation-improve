/**
 * 构建 @Tinnikx/dsh-operation-improve 的两半产物。
 *
 * client 半边必须是 web shell 认的那层壳：一个交给
 * `window.__ModuleLoader__.load({ id, factory })` 的 CJS factory，平台模块
 * （react 等）从注入的 `require` 里取，其余全部内联。**注册 id 必须等于
 * package.json 的 `name`**，也必须等于 patch 行的 `name`——加载器按 loader
 * entry 的 name 去认这个注册，对不上就是「loaded without registering」，
 * 页面不报错，功能静默消失。
 *
 * host 半边是普通 ESM，直接原样 bundle。
 *
 * esbuild 从外层 dsh-desktop 仓库的 pnpm store 里解析（本包零运行时依赖）；
 * 用 $DSH_ESBUILD_ROOT 覆盖查找根。
 */
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MANIFEST = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const PLUGIN_ID = MANIFEST.name
const SEARCH_ROOT = process.env.DSH_ESBUILD_ROOT ?? join(ROOT, '..')

/** 平台模块表：由加载器提供，不能打进产物。 */
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-schema-form',
  '@deepseek-ai/dsh-client-runtime/client',
]

/** 在 pnpm checkout（store 或 hoisted）里定位 esbuild。 */
function resolveEsbuild(root) {
  const store = join(root, 'node_modules/.pnpm')
  if (existsSync(store)) {
    const entries = readdirSync(store).filter((n) => n.startsWith('esbuild@')).sort()
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      const candidate = join(store, entries[i], 'node_modules/esbuild/package.json')
      if (existsSync(candidate)) return candidate
    }
  }
  const hoisted = join(root, 'node_modules/esbuild/package.json')
  if (existsSync(hoisted)) return hoisted
  throw new Error(`esbuild not found under ${root} (set DSH_ESBUILD_ROOT)`)
}

const require = createRequire(resolveEsbuild(SEARCH_ROOT))
const esbuild = require('esbuild')

const banner = [
  `window.__ModuleLoader__.load({ id: ${JSON.stringify(PLUGIN_ID)}, factory: (require) => {`,
  'var module = { exports: {} }; var exports = module.exports;',
].join('\n')
const footer = 'return module.exports; } });'

await esbuild.build({
  entryPoints: [join(ROOT, 'src/client/index.js')],
  outfile: join(ROOT, 'lib/client.js'),
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  // 设置面板是 `.jsx`。automatic 让它编成 `react/jsx-runtime` 的调用——那个模块在
  // EXTERNALS 里，由加载器提供；classic 会编成 `React.createElement`，而本包没有把
  // `React` 这个名字引进作用域。
  jsx: 'automatic',
  external: EXTERNALS,
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: banner },
  footer: { js: footer },
})

await esbuild.build({
  entryPoints: [join(ROOT, 'src/index.js')],
  outfile: join(ROOT, 'lib/index.js'),
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
})

console.log('lib/client.js + lib/index.js built')
