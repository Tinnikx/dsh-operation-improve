# 005 功能 8 清单对齐 harness 0.1.5-rc.2 + 每张卡片标注生效方式

- 目标：「Harness 高级配置」精选清单目前对着 0.1.2-rc.1 手抄。以 dsh-desktop 打包出的 0.1.5-rc.2 闭包为唯一事实，清掉失效键与写不进运行时的卡片，并按用户要求给每张卡片标注「改了之后怎样才生效」（保存即生效 / 需要什么操作才用上新值）。验收方式：`npm run verify:settings` 在测试栈全绿；面板每张卡渲染出 `data-effect` 标记；`npm test` 与 `npm run build` 退出码 0。
- 范围：`src/harness-config/`（清单与口径）、`src/client/settings/`（渲染生效标记）、`scripts/verify-settings-live.mjs` 与测试夹具（被删卡片牵连的断言改指向存活卡片）、`docs/feature-8-harness-config.md` 与 README/rationale 的对应段落。不动 harness 本体。

## 进展

- 0.1.5-rc.2 证据取自 `/home/kaixiang/dev/co-creation-project/dsh-desktop/dist/desktop/dsh-linux-x64/resources/app/node_modules/`（打包产品的平铺 node_modules）。
- 逐包实测要点（schemastery `Config` 直调）：
  - `session-query-sqlite`：键已叫 `persistedReadConcurrency`（默认 4、min 1 不变）；schema 对未知键放行，旧键名留在 patch 里无害但插件不读。新增 `preparedSessionCacheSize`（数字，默认 5）、`journalMode`（字符串，口径 #2 不收）。
  - `agent-loop` 的整个 config 挂进了 settings 命名空间（`AGENT_LOOP_SETTINGS_SCHEMA`），违反收录口径 #1，删卡。
  - `web-search-deepseek` 同理（`installSection` 双入口），删卡。
  - `attachment-local.normalizedImageMaxDimension` 默认 8192（提示里 2048 过时），另有新键 `normalizedImageMaxPixels`（默认 4194304）。
  - `tool-web`：rc.2 的 `dsh-base` patch 写明 `fetch: true`，面板描述里「抓取被上游刻意关掉」已不成立。
- 生效机制证据（用户要求给每张卡片标生效方式，先把机制读死）：
  - `watchUserPatches`（`dsh-app-boot/lib/index.js`）→ `entry.update()`（root Include）→ loader `update` → `fiber.update(config, true)` → cordis `Fiber.update`：`this.config = config` 后 **`this.restart()`**——即 dispose + 以新 config 重新 apply。所以保存后该插件短暂下线再上线，所有字段（含 start 时拷走快照的）都会用上新值，**没有任何键是「保存了但跑着的进程用不上」**；毫秒级、不重启 harness。唯一例外是 start 时构建缓存的 `preparedSessionCacheSize`，标「重启生效」。
  - 结构例外：web 产品（`dsh-web-app`）把 host 平面 `compaction-basic`、`tool-result-pruner`、`tool-ralph`、`tool-todo`、`tool-web` 全部 `disabled: true`，由 agent preset（`agent.cordis.yml`，standard/ptc/cordis 三个预设同构，五行全部在场，`tool-result-pruner`/`tool-ralph`/`tool-todo`/`tool-web` 的 preset 行自带 config）按会话另挂一棵独立 Include 树。`PresetTree`（`dsh-agent-presets/lib/index.js`）只拿预设文件路径当 config，**用户 patch 层不流进 preset 树**。preset 里 `tool-bash`/`tool-pwsh` 挂的是 `dsh-tool-bash`/`dsh-tool-pwsh`，与 host 平面的 `dsh-bash-sandbox`/`dsh-pwsh-sandbox` 是**不同包**——归属按包判断，不按 id。
- **生效标记为面板新增能力**：`entry.effect`（每卡）+ 字段级 `effect` 覆盖；词典键 `settings.effect.*`（zh/en）；卡片标题旁与字段 meta 行渲染 `data-effect`；`verify:settings` 第 17 条断言盯它。
- 验证全绿（交接关闭前复跑确认）：`node --test tests/*.test.mjs` 28 pass / 0 fail；`DSH_ESBUILD_ROOT=<dsh-desktop 仓> node scripts/build.mjs` 退出码 0，`lib/client.js` 与 `lib/index.js` 出齐；`verify:settings` 在重建的测试栈上 `passed=17 failed=0 skipped=0`，栈用完已停。逐条实测读数的家在 [feature-8-harness-config.md](../feature-8-harness-config.md)。

## 决策与理由

- **删卡 8 张**：五张「预设接管」卡（`compaction-basic`、`tool-result-pruner`、`tool-ralph`、`tool-todo`、`tool-web`）——面板只在 webServer 环境出现，标准预设必然在场，写下的值到不了任何会话，是空操作；两张 settings 双入口卡（`agent-loop`、`web-search-deepseek`）；`tool-str-replace-editor`（web profile 组合里不存在，写必被 present 检查拒）。备选「保留 + 标注不生效」要运行时探测 preset 平面，脆，否。
- **幸存 13 卡、52 个字段声明**（面板渲染出的 `data-field` 是 50 个——`system-prompt` 那两个布尔字段是复选框，`fields.jsx` 只给文本框挂 `data-field`），全部满足四条收录口径；`tools.maxParallelSubCalls` 不收（`tools` 的 config 里有 `__jsExpr`，重述会静默改行为）。清单从 21 卡缩到 13 卡，每张卡都「写了真的会生效」。
- **`catalog-limits.js` 收掉 `PRUNE_MARKER_CHARS`**：它服务的 `tool-result-pruner` 卡片删了，其余五条镜像复测仍成立。
- **测试夹具换主**：手写块从 `compaction-basic` 换成 `session-query-sqlite`（带 `path: ":memory:"`/`openAt: never`/`maxLimit: 100` 三行非目录键）。手写行与托管行一样按 id 整体替换 config——夹具第一版漏了 `path`，测试 home 的检索翻到真实文件，这就是「重述」要解决的事的另一面，已写进 verify.md 当坑。
- **verify 套件 choreography 换主**：托管对换成 `maxLimit`+`readWindowMax`；跨字段断言往未托管的 `defaultLimit` 里写超 `maxLimit` 草稿（对未托管键 unset 是空操作，「清除撤草稿」才是纯撤销）；「清除键消失」用只有一份供给的 `snippetChars`；「清空回落」断言回到手写层（`maxLimit` 100），不再期望键消失。
- **effect 标记机制定论**：`Fiber.update` 对 config 变化做 dispose + 重新 apply，机制上不存在「保存了但跑着的进程读不到」的键，所以除 `preparedSessionCacheSize`（start 时构建缓存）外全部标各种「保存即生效」变体，没有大面积「重启生效」。
- **真 home 一字节未动**；3080 未碰；所有验证都在测试栈与 `/tmp` 卸载副本上完成。

## 未完成项 / 遗留

- 无（本交接范围内）。注意点：`docs/verify.md`「功能 8」一节里的实测读数段落随代码更新，其中 sha/毫秒数是当轮读数，上游变化后以重跑为准。

## 坑

- **cordis `grep -E "a|b|c"` 交替里的空格**：`- id:` 后面的空格让 `id: \(compaction-basic\|…\)` 这类交替全灭——当时得出「预设里没有那五行」的误判；用 Python 按 `- id:` 切块重验才翻案。对 YAML 结构做 grep，先切块再匹配。
- **token URL 是一次性门票**：harness 的 web 页面挂在 `/?token=…` 上，GET 它只回 303 + `dsh-auth-*` cookie，带 cookie 打 `/` 才是应用页。脚本探测启动得手动转发 set-cookie（undici fetch 没有 cookie 罐）；裸打 `/` 得到的 401 是没登录，不是没起来。
- **手写块也会整体替换 config**：fixture 里的手写 `session-query-sqlite` 漏了 `path: ":memory:"` 时，整个测试 home 的检索从内存库翻到真实文件——手写层接管一个 id 后必须带走 bundle 层的全部键，面板的重述机制解决的是同一件事。
- **对未托管字段做「清除」是空操作**（unset ≠ 写默认）：验证脚本里「清除后键消失」的断言只能挑没有手写/bundle 供给的键，否则清除是「回落」而不是「消失」——两种行为都对，断言要各找各的主。
- **脚本栈上被 CSS 变量 `!important` 成同色的主题**：灰显断言读 `getComputedStyle().opacity` 不读颜色（历史坑，仍有效）。
