# 功能 8：「Harness 高级配置」面板

设置页里多一行可展开的「Harness 高级配置」，把一批只有 cordis entry config、没有 settings 命名空间的插件参数搬进界面，改完自动保存、不重启 harness 即生效。

`src/harness-config/`（host）与 `src/client/settings/`（client）

```js
// host：src/harness-config/route.js
mountHarnessConfigRoute(ctx) -> void            // 注册与卸载交给 ctx.effect
HARNESS_CONFIG_ROUTE                            // '/operation-improve/harness-config'

// host：src/harness-config/profile.js
readState(ctx) -> Promise<{ profile, warnings, state }>
applyOps(ctx, ops) -> Promise<{ ok: true, state } | { ok: false, status, errors }>

// client：src/client/settings/index.jsx
installHarnessConfigRow(ctx) -> { dispose }     // 幂等 disposer
export const SETTINGS_CSS                       // 由 client 入口拼进那张样式表
```

harness 里有一整类插件只有 cordis entry config、没有 settings 命名空间：`compaction-basic` 的 `thresholdRatio` / `retainRatio`、`tool-result-pruner` 的三个长度、`tool-ralph` 的 `maxRounds` 都是这样。`ctx.settings`（写 `$DSH_HOME/settings.yaml`，模型页与外观页走的那条路）**够不到它们**，唯一的改法是手编辑 profile 的 `cordis.patch.yml`——要知道键名，还要知道 `retainRatio` 必须小于 `thresholdRatio`（违反会让插件**加载失败**，而 patch 是热的，写下去那一刻整棵树就起不来了）。这一项把[精选清单](../src/harness-config/catalog-entries.js)里那些字段搬进设置页，收录口径写在清单自己的头注释里。

## 托管区段

面板只拥有 patch 文件末尾两行标记之间的字节：

```yaml
# >>> dsh-operation-improve: 「Harness 高级配置」面板托管区段
# 这一段由设置面板整体重写，手改会在下次保存时丢失；要手写请放到标记之外。
# 移除本插件不会清空这一段，写下的配置照样生效。
# managed: {"compaction-basic":["thresholdRatio"],"tool-ralph":["maxRounds"]}
- id: compaction-basic
  config:
    # ↓ 由「Harness 高级配置」面板设置
    thresholdRatio: 0.55
    # ↓ 面板之外已有的值，原样重述：patch 按 id 命中会整体替换 config，不重述就被抹掉了
    maxTokens: 64000
    retainRatio: 0.15
# <<< dsh-operation-improve
```

写入是**文本行外科手术**，不过 YAML 库：读全文 → 按标记切成 `before` / `section` / `after` → 只重写中段 → 原样拼回，标量序列化自己写（[patch-file.js](../src/harness-config/patch-file.js)，只支持 number / boolean / string / 标量数组，精选清单够用）。**区段外一个字节都不动**，包括别人写在行尾的中文注释——YAML 解析器看不出这个区别，所以[单元测试](../tests/patch-file.test.mjs)比的是字节而不是「解析出来一样」。

- **`# managed:` 那行是机器可读的名册**，标出哪些键是面板托管的、哪些是重述来的。没有它就分不出「面板设的」和「重述进来的」，下一次保存会把用户手写的键当成自己的托管值。名册被手改坏时回落成「区段里该 entry 的键全算托管」——它们下次保存被原样重写，值不变。
- **区段必须在文件末尾**。区段外的基线靠「解析出来的用户 patch 去掉尾部 K 条」还原（K = 区段里的顶层条目数）；闭标记之后又出现顶层列表项时这个前提不成立，`profile.writable` 报 `false`、面板转只读并打出一行说明，**不猜着写**。
- **区段整体删除后若文档里再没有顶层列表项，补一行裸 `[]`**。纯注释文档与空文件都会让 profile 加载失败（`overlay ... must be a top-level YAML array of loader patch entries`），而 harness 自带的模板末尾正是一行 `[]`。
- **落盘是同目录临时文件 + `rename`**。`cordis.patch.yml` 被 `watchUserPatches` 热监听，非原子写会让 watcher 读到半个文件，整棵树按加载失败处理。
- **写完不重启 harness**。patch 是热的，失焦到 loader 里跑着的 config 跟上新值是毫秒级（见[实测读数](#实测读数)）。

### 标记不跟包名走

两行标记里写的是 `dsh-operation-improve`，**不带 `@Tinnikx/` scope，也不跟着包名改**（[patch-file.js](../src/harness-config/patch-file.js) 里 `MANAGED_BEGIN_PREFIX` / `MANAGED_END` 两个常量的注释同样写着这一条）。

它们是写在用户 `cordis.patch.yml` 里的持久字节，而区段的约定是「移除本插件也不清空」。改掉标记就等于认不出已经写下的区段：它降级成普通用户 patch 留在文件里，面板在末尾再追加一段新的，旧那段从此没有任何界面能改。要改标记就得同时带上一条迁移，不能只换字符串。

与它相对的是 `OWN_NS`（[src/shared/locale.js](../src/shared/locale.js)），那个**必须**与包名逐字相同——它同时是词典 namespace 和 bundle 注册 id，改包名时跟着改。

## restate：whole-config 替换的解法

**patch 按 id 命中时替换整个 `config`，没有深合并。** 所以写托管行时 `config` 必须 = 该 entry 在区段外已经生效的全部键 ∪ 本次托管的键，否则 `tool-ralph` 的 `subagentProvider`、用户自己手写的 `maxTokens` 都会被整体替换抹掉。区段外的基线由 `loadProfile` + `composeEntries` 现算（bundle 层 + 用户层去掉尾部 K 条），每次保存前重读一次文件——别人在编辑器里改过之后不重读，就会拿旧基线去重述、把人家刚写的键抹掉。

面板因此对每个字段算三个值：`bundle`（只由 bundle 层合成，即「系统默认」的权威定义）、`outside`（bundle + 区段外的用户 patch，重述的来源）、`effective`（整份文件合成的结果，也就是显示的当前值）。字段右侧的来源徽标就是这三层的判读：`本面板` / `手写` / **设这个值的 bundle 包名** / `系统默认`。

包名由**逐层累积合成**算出来，不是扫单层 patch 里写没写这个键：whole-config 替换会让后面的层原样重述一遍同一个值也被算成「它设的」。判据因此是值发生变化的那一层，原样重述不改归因；键被后面的层整体替换掉时归因跟着删。徽标里摘掉上游自己那个 `@deepseek-ai/` scope（第三方 scope 留着，它才是「谁设的」里的「谁」），完整包名在 `title` 里。归因不出包名时退回 `组合默认` 这种笼统说法。测试栈 13 层实测：一次全量合成 0.35ms，13 次累积快照 3.65ms，跟每次 `GET` 一起算。

## 自动保存

面板没有保存按钮。四个提交点：输入框失焦、输入框里按 `Enter`（转成失焦）、复选框 change、点「清除」。

- **每次提交发的是整张草稿表**，不是刚离开的那一个字段。跨字段规则跑在合成值上，只交当前字段会让「先调小 `thresholdRatio`、再调小 `retainRatio`」死在第一步，而没有保存按钮也就没有「两个一起交」的第二次机会。被拒的草稿因此原样留在输入框里，等下一个字段一起过；想撤掉它就点那一行的「清除」。
- **提交串行**。连着两次失焦，第二次必须拿第一次写完后的 payload 去算重述，否则重述用的是旧基线，会把刚写进去的键抹掉。所以走一条 promise 链，并从 ref 读最新的 payload 与草稿——`setState` 是异步的，读 state 会读到上一轮。
- **写请求不挂卸载 abort**。点收起头部会先让输入框失焦、提交，紧接着面板卸载；跟着那次 `GET` 一起 abort 就等于静默吞掉用户最后一次改动。只有初次 `GET` 归卸载时 abort 的那个 controller，`setState` 由 `mountedRef` 守。

## 不设置 = 不写这个键

清单里的 `default` **只用于界面提示**（「默认 0.8」），从不写进文件。清空一个输入框、或者点那一行的「清除」，都等于 `unset`：键从区段里消失，值回落到下一层（区段外的手写行 → bundle 层 → harness 自己的默认）。上游改了默认值，最坏是提示过时，行为不受影响。

三层都没设过的字段**只淡化控件本身**（`opacity: 0.55`），标签与说明留在满对比度上——读不读得懂这一项，与它有没有被设过无关。输入框空着、默认值只走灰色 `placeholder`。**默认值不能填进 `value`**：那样一次失焦就把 harness 的默认值当成用户输入写死进文件，上游改默认时旧值被钉住。淡化用 `opacity` 而不是改 `color`——主题插件可以把 `--dsw-alias-label-*` 全部 `!important` 成同一个颜色（本仓库测试栈里那份主题就把四档标签色统统压成纯白），按颜色淡化的控件和正常控件会长得一模一样。控件仍然可编辑，聚焦时恢复满对比度。bundle 层设过的字段**不淡化**：它的徽标已经指名是哪个包设的，那不是「没人设过」。

**移除本插件不清空已写下的配置**：托管区段是普通的 patch 条目，插件不在了它照样被 profile 加载。代价是那之后没有界面能改它，只能手编辑或删掉整段。

## host↔client 通道

第三方插件拿不到 typert RPC（生成器不在闭包里），所以两半只能走 host 自己挂的一条 HTTP 路由，注册写法照 `dsh-desktop` 里审批 SSE 那条先例（`ctx.webServer.register({ kind: 'exact', path, handler })`）。`GET` 回 `{ catalog, profile, warnings, state }`，`POST` 收 `{ ops: [{ id, field, op: 'set' | 'unset', value? }] }`。

**路由永远不写任意 YAML**：只接受清单里的 `(id, field)` 对，值按字段声明收窄、按跨字段规则校验，任何清单外的键或非法值一律 400，文件不动。跨字段规则跑在**合成值**上而不是本次改动的增量——上游校验看到的就是合成后的 config，只看增量会漏掉「改一个键把另一个键顶出界」。前后端共用 [catalog.js](../src/harness-config/catalog.js) 里同一份 `checkCrossRules`（client 直接 import 它，不是抄一遍），所以前端拦下来的批次根本不发请求，而 host 仍然独立复核一次。

host 半边 `inject = ['webServer', 'loader']`：非 web surface 下插件挂起不动，本来也没有面板。

## step 0 探针实测到的四条

实现分支由这四条定夺，都在隔离栈上量过：

- **`ctx.loader.config.baseUrl` 是 `undefined`**（loader config 整个是 `{}`），拿不到 profile 目录。真正的来源是命令行的 `--profile` 加 `boot.resolveProfileDir(name)`。
- **`@deepseek-ai/dsh-app-boot` 没有 `./profile` 子导出**，`loadProfile` / `composeEntries` / `PROFILE_PATCH_FILENAME` 都由包主入口再导出；解析锚点用正在跑的那个 `dsh/lib/bin.js`（`process.argv[1]`）。
- **纯注释 / 空的 patch 文件会让整个 profile 加载失败**，所以区段清空后要补 `[]`。
- **`ctx.loader.resolve(id)` 够不到嵌套在分组里的 id**，读跑着的值只能遍历 `ctx.loader.entries()` 比 `options.id`。

## 刻意不做的字段

- `compaction-basic` 的 `retainTokens`（与 `retainRatio` 互斥，两个都摆出来只会让人写出互相打架的一对）、`summarizationProvider` / `summarizationModel`（必须成对，且选模型归模型页）、`modelPolicies`（数组表格，值不抵成本）。
- `tool-web.fetch`：`dsh-base` 的 patch 注释写明它被刻意关掉——"that provider defers SSRF protection and the model would choose the request target"。**一键翻转一个上游的安全决定不该藏在设置面板里**，这一项只暴露 `searchTimeoutMs`。

## 实测读数

一轮完整跑（`passed=16 failed=0 skipped=0 total=16`）：面板渲染出 59 个文本字段（清单 21 个 entry、63 个字段，减去 4 个布尔字段——复选框不带 `data-field`）、`[data-save]` 计数为 `0`；`compaction-basic.compactionRetries` 那一行 `data-default` 在、`value` 为空、`placeholder` 是 `1`、输入框计算 `opacity` `0.55` 而整行与标签都是 `1`，手写的 `thresholdRatio` 那一行输入框 `opacity` `1`；`tool-ralph.maxRounds` 的徽标 `data-source="bundle"`、文字 `dsh-base`、`title` `@deepseek-ai/dsh-base`，与 host 归因出的包名一致，而手写行仍是 `手写`、系统默认行仍是 `系统默认`（两者都没有 `data-owner`）。只让输入框失焦、不点任何按钮，区段头写成 `# managed: {"compaction-basic":["thresholdRatio","compactionRetries"]}`，区段外逐字节不变；热重载把从基线算出的 `thresholdRatio: 0.58` / `compactionRetries: 3` 送进 loader 用了 **11ms**，`compactionRetries` 那一行随即变成 `opacity` `1` 且徽标转 `本面板`；写 `tool-ralph.maxRounds` 时区段里出现 `    subagentProvider: "spawn"`，live config 里两个键都在（**11ms**）；手写那两行（`maxTokens: 64000      # 必须 ≤ 模型输出上限(sonnet-5 为 64000)` 与 `thresholdRatio: 0.8   # …`）连行尾中文注释原样保留，`maxTokens: 64000` 与 `retainRatio: 0.16` 照样生效；`retainRatio = 0.68 > thresholdRatio = 0.58` 被前端拦下（`上下文压缩：保留比例必须小于触发阈值比例，否则 compaction-basic 加载失败。`），文件 sha 前后同为 `1a32ae6d105b265a`，点「清除」撤掉这条草稿后错误清空、待提交归零、输入框退回 `0.16`、文件 sha 不变；卸载副本里区段仍在、`compaction-basic.thresholdRatio` 仍是 `0.58`、`tool-ralph.maxRounds` 仍是 `32`，3182 上的 harness 起得来且名册里没有本插件；点「清除」之后不做任何别的操作，`compactionRetries` **13ms** 内从 live config 里消失、文件里也不含这个键（**不是把默认值写进去**）；全部清空后文件逐字节回到基线（sha `bf6bb159d31f82ea`），值回落到手写层的 `0.8` 与 bundle 层的 `64`，那一行的输入框重新淡化成 `opacity` `0.55`。徽标不挤版：`dsh-base` 实测 57px、`系统默认` 56px，10 个 bundle 徽标一个都没被 `text-overflow` 截断，最宽的那条 meta 行 147px、卡片 556px。

清单本身的两侧另有一轮探测：往 6 个此前没测过的 entry 各写一个键，重述照样只出标量——`agent-loop` 的空数组写成 `agents: []`、`session-query-sqlite` 的 `path: ":memory:"` 与 `openAt: "never"` 带引号、`system-prompt` 那条含 `{{model}}` 的 persona 逐字保留，6 个值全部进了 loader 的 live config，首页仍 200。值域镜像两侧都真：面板拒掉 `maxRequestFilesBytes = 1000`、`fileExpiresAfterSeconds = 3600`、`imageCompressionConcurrency = 9` 与两条跨字段（`fallbackMaxBytes > maxTitleBytes`、`defaultLimit > maxLimit`），文件 sha 一次没动；把 `fallbackMaxBytes: 100` 手写进 patch 之后，文件里是 `100` 而 loader 跑着的仍是 `40`——**插件拒绝以这个值重载**，镜像挡下的确实是会让 entry 起不来的值。

## 已知限制

- [精选清单](../src/harness-config/catalog-entries.js)是手抄的，没有编译期保障。上游给某个 entry 改键名、改值域、改跨字段约束，面板都不会知道：改键名的表现是那一行写下去不起作用（patch 里多一个没人读的键），改约束的表现更糟——面板放行了一个会让插件加载失败的值，而 patch 是热的，保存那一刻整棵树就起不来。清单里几个 `min` 镜像的是**不暴露的相邻键的默认值**（[catalog-limits.js](../src/harness-config/catalog-limits.js) 里 `llm-deepseek` 那三条），上游改掉那个默认，镜像就连方向都不对了。跟上的办法只有重读上游那几个包的 schema。
- 清单里 `default` 是抄来的展示值。上游改了默认，面板上「默认 0.8」这行提示就是错的，但**行为不受影响**——不设置就是不写这个键，实际生效的永远是 harness 自己的默认。
- 托管区段必须在 patch 文件末尾。闭标记之后又出现顶层列表项时，「区段外基线」还原不出来，面板转只读并打出一行说明（`profile.writable` 为 `false`）；把手写条目挪到开标记之前即可恢复。这是显式失败，不是静默。
- 字段标签、说明与错误文案由 host 的清单直接发下来，**只有中文**，不走词典、不跟随语言切换。行标题与按钮那几个字走本插件词典，所以切到 en 时会出现「标题是英文、字段名是中文」的混排。
- host 半边要 `webServer`。非 web surface（比如终端里跑的 harness）下整个插件挂起不动，面板也就不存在——那里本来也没有设置页。
- 每次展开重新 `GET` 一次。展开着的面板不订阅文件变化，别人在编辑器里同时改同一个文件时面板显示的是打开那一刻的快照；保存前 host 会重读一次文件再算重述，所以不会抹掉人家刚写的键，但面板上的来源徽标可能已经过时。
- 面板样式是自己写的一段 CSS（`src/client/settings/styles.js`），只借了 `--dsw-alias-*` 那套设计令牌，不是复用上游模型页的组件。上游改版式时它不会跟上，表现是这一行与邻居长得不太一样，不报错。

## 验证

跑法、16 条断言与八处坑见[验证 · 功能 8](./verify.md#功能-8-的验证)（`npm run verify:settings`）。**这个脚本会真的往 patch 文件里写字节**，只能打测试栈。
