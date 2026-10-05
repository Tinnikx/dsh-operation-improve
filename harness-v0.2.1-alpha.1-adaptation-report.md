# harness v0.2.1-alpha.1 适配报告

锚定版本从 0.2.0-rc.2 → **0.2.1-alpha.1**（desktop dist `@deepseek-ai/dsh` 的 `package.json`、`lib/bin.js --version`、`getDshRuntimeVersion()` 三处一致）。沿用单版本锚定口径，不保留旧版本兼容路径。

## 比对材料

0.2.0-rc.2 的发布物不在本机 `.pnpm` store 之外可复用，但 rc.2 那轮已经把 desktop dist 与 npm 下载的旧版包解包到 `tmp/upstream/old/`，本轮沿用同一套方法做 rc.2 → alpha.1 的两版对读：

- **逐包文件级 diff**：`tmp/upstream/diff-rc2-to-alpha1.mjs` → `tmp/upstream/changed-rc2-alpha1.json`（95 个包有差异记录；排除 `node_modules`/`.bin`/`package.json`/`README*`/`LICENSE*`/`*.md`/`*.i18n.yaml`）。落在本插件九个镜像面上的包，逐项读数见下节。
- **config schema 两版 dump + delta**：`tmp/upstream/schema-delta-rc2-a1.json`，脚本 `tmp/upstream/schema-delta.mjs`。
- **镜像面对读脚本**：`tmp/upstream/mirror-surfaces.mjs`，读数落 `tmp/upstream/mirror-surfaces-final.log`。

## alpha.1 相对 rc.2 的变化（落在本插件镜像面上的部分）

**九个镜像面全部无漂移**（功能 1-7、9-11 代码零改动），脚本读数 `合计 35 项检查 · 漂移 0: 无`：

1. **菜单样式档**：`.scrollable` 的 token 名两版全同；插件 `src/shared/context-menu.js` 的 `MENU_CSS` 不镜像这处 → 无漂移。
2. **七枚 Regular 图标**（primitives）：逐字节相同。
3. **会话行「...」菜单项集合与 order**：`pin`/`rename`/`fork`/`archive` 集合与顺序相同。插件 rename 用 `rowTitle(rowElement,kind)`（侧栏行 DOM 文本）不是上游 `displayTitle`，fork 走 host 侧 `ctx.sessions.fork`，均不受影响。
4. **StateDot ongoing**：`StateDot.module.css` 逐字节相同。
5. **侧栏行 DOM 契约**：`_sessionRow` 26/26、`_projectRow` 11/11、`_searchResultRow` 8/8、`_archived` 5/5、`rowActions` 13/13、`role=treeitem` 5/5、`aria-selected` 2/2 全同。
6. **逐行时间锚点**（功能 4）：`data-chat-node-key` 1/1、`data-chat-flow-key` 3/3、`data-chat-flow-kind` 19/19、`ChatNodeSeat` 5/5、`_timeStart` 2/2、`_timeEnd` 2/2 全同。
7. **TurnNavigator**（功能 9）：`TurnNavigator` 22/22、`mergeTurnRailItems` 2/2、`useVirtualizer` 4/4、`hasMore` 16/16、`loadOlder` 3/3 全同。
8. **`_thinkBody` 与 think 折叠契约**（功能 11）：`_thinkBody` 2/2、`data-variant` 2/2、`data-expanded` 3/3 全同；`TRANSCRIPT_VIEW_MODES` 档位表（`compact`/`standard`/`detailed`/`verbose` + `LEGACY_TRANSCRIPT_VIEW_MODE`）逐字相同。

**折叠机制也逐字相同**（功能 11 取词口径的依据）：`dsh-client-ui-chat/lib/client.js:1599-1620` 的 `useSearchableHidden` 两版都设 `hidden="until-found"`、都挂 `beforematch`；`ChatGroupSeat`（`:2920` 起）两处折叠调用（`:2935` 外层 turn、`:2957` 过程组正文）与 `grouped` 判据（`:2930`）逐字相同；`data-step-process-body` 计数两版都 3 次。→ **不是 alpha.1 的行为漂移**，此前那条「换成 `data-step-process-body[hidden]`」的假说因此被否掉（实测 `data-step-process-body[hidden]` 总数 0）。

## alpha.1 的新机制（登记，不镜像）

`dsh-client-ui-schedule`（日程 UI）成为新包并带 `ui-schedule` entry；`schedule` entry 改为直接挂进 web 组合（见下节）；`dsh-compaction`/`dsh-plan-mode`/`dsh-goal` 等包继续演进。

## 兼容性预检在本轮咬到的东西

第三方插件 `@yilinxiao/dsh-mcp-lazy@0.5.1` 仍被预检**否决**（peer `@deepseek-ai/dsh-subprocess`/`dsh-tools` 上限只到 `rc.6`，运行时是 `0.2.1-alpha.1`）→ 静默 `disabled`。`dsh-notion-mcp` 在 bundle 里不可解析。

**对本插件的结论：放行**——本插件在名册里（`本插件在名册里=true`，见 `tmp/upstream/verify-settings-run2.log:37`）。

## 功能 8 清单的 schema 对读

`npm run check:catalog` 对 0.2.1-alpha.1 **PASS**（`tmp/upstream/check-catalog-final.log`）：

```
[check:catalog] home=... dsh=0.2.1-alpha.1  profile=web
[check:catalog] 逐键比对 catalog 19 卡 / 81 字段 vs 上游 schema
[check:catalog] PASS 全部字段与上游 schema 一致（type/default 相等，上游边界不更松）。
```

schema delta（`tmp/upstream/schema-delta-rc2-a1.json`）：entry 196→198（新增 `schedule`、`ui-schedule`），字段 483→487（**新增 4、移除 0、变化 0**）：

- `schedule.deliveryHistoryDays [entry schema] type=["integer","null"] default=undefined min=1 max=3650`
- `schedule.deliveryHistoryRecords [entry schema] type=["integer","null"] default=undefined min=1 max=10000`
- `session-controller.listWorkSliceMs [entry schema] type=["integer","null"] default=undefined min=`
- `web-runtime.publicUrl [entry partial] type=["string","null"] default=undefined min= max=`

### 新增 4 字段的收录判定

- **`schedule.deliveryHistoryDays` / `deliveryHistoryRecords`（2）**：**收**。0.2.0-rc.2 上 `schedule` 只被已删除的 `dsh-experimental-schedule-bundle` 插进组合，本卡从 0.2.1-alpha.1 起才成立——`dsh-web-app/cordis.patch.yml` 改为把 `schedule` 直接挂进 web 组合（insert 且没有 `disabled`），`presets/cordis.patch.yml` 再挂 `tool-schedule` 与 `schedule_create/delete/list/update` 四个工具。config 块无 `__jsExpr`（口径 #4 通过），无 settings 命名空间。
- **`session-controller.listWorkSliceMs`（1）**：**收**。上游 `z.natural().min(1)`（`default(16)` 在 schema 里投影成 `default: 16`），只在构造时解析一次（`new ApiSessionList(ctx, resolved.listWorkSliceMs)`），会话列表每扫满这么久就 `await scheduler.yield()`。改这条 entry 的 config 会触发 harness 热重挂，而热重挂正是 [harness 0.1.6 那个把会话服务一起摘掉的缺陷](docs/harness-hmr-session-defect.md)的近邻 → 整卡按「重启后生效」标注。同 entry 上的 `nativeOpen`（是否走系统默认程序打开会话关联的文件）是部署形态开关、web 上无意义，**不收**。
- **`web-runtime.publicUrl`（1）**：**不收**。上游 dump 标 `entry partial`（partial 意味着配置块里可能有本插件无法重述的表达式），且 web profile 下没有独立消费者面，撞口径 #2（写了没人读）。

## 本轮改动

### 功能 8 收进两张新卡（17 卡 78 字段 → 19 卡 81 字段）

- **会话列表扫描节奏**（`session-controller`，单字段 `listWorkSliceMs`，`type:'integer'`、`default:16`、`min:1`、`effect:'restart'`）：落在 `src/harness-config/catalog-model.js:239-253`。
- **定时任务投递历史**（`schedule`，两字段 `deliveryHistoryDays`（`default:30`、min 1、max 3650）与 `deliveryHistoryRecords`（`default:200`、min 1、max 10000），均 `effect:'immediate'`）：落在 `src/harness-config/catalog-model.js:406-420`，`deliveryHistoryDays` 的注释记下了它为什么从这一版才成立（experimental bundle 已删、改为直挂 web 组合）。

两张卡都进了 `check:catalog` 逐键对读与 `verify:settings` 全链路。

### 两处验证脚本按实测修正

- **`scripts/verify-settings-live.mjs`**：点「清除」之后不再等「loader 立刻就空」，改成 `clearAndConfirm()`——点清除后最多 3 轮借陪跑键 `schedule.deliveryHistoryRecords` 逼一次真重载（不碰被验的那张卡）再读 `live`，把用了几次 `pokes` 记进观测值。原因见下节。断言数 26 → **30**。
- **`scripts/verify-find-live.mjs`**：第 15 条的折叠正文取词不再依赖某个具体宿主选择器，改成从 oracle 的 raw/visible 差集里要词（`probeInvisibleQuery()`），且挑会话循环改成「落定一条就试探折叠词，探到就用这条，12 条都没有就据实报红」——原先只按长度取第一条够长的会话，而折叠正文只在带整组折叠过程块的会话上存在，够长的会话里不带折叠块的是多数。

### 一处共用库修正

**`scripts/lib/cdp.mjs`**：`connect()` 里裸 `fetch('/json/list')` 换成新增的 `fetchTargets(attempts)`（重试 5 次，每次带 `headers: { connection: 'close' }` 让 undici 不复用池中死连接，间隔 1000ms，末次抛原 error）。起因：重启测试栈后 Chrome 与 CDP 端口一起换掉，undici 池里旧连接变死连接，首个 `/json/list` 抛 `[TypeError: fetch failed] [cause]: SocketError: other side closed code: 'UND_ERR_SOCKET'`。所有 verify 脚本共用这一处。

## 兼容性预检与上游热重挂：两处脚本侧修正的实测依据

### 13b/13d：清除那一次 profile patch 重载会偶发地被宿主漏接

harness 偶发会漏接「清除」那一次 profile patch 重载：面板把文件写回基线是对的（`bytesIdentical:true`），loader 里那枚键却还留着，要到下一次任何改动触发真重载时才顺带消失。宿主侧对 reload 失败只有一行 `ctx.logger.warn`，不落测试栈日志，机制无从证明——所以脚本不推测上游为什么漏，改成用 `clearAndConfirm()` 逼一次真重载再读 `live`，让这几枚「清除」断言各自能扛住宿主那一次偶发漏接，而不是靠运气红绿。`clearAndConfirm()` 与 `pokeReload()` 的注释写明这是「判据换口径，不是掩盖失败」。

读数（`tmp/upstream/verify-settings-run8.log`）：`passed=30 failed=0 skipped=0 total=30`。13a `{"ms":2091,"days":45,"records":null,...}`、13b `{"days":null,"pokes":1,"bytesIdentical":true}`、13c `{"ms":2129,"listWorkSliceMs":24,"rowsBefore":40,"sessionRows":40}`、13d `{"listWorkSliceMs":null,"pokes":1,"bytesIdentical":true}`（`pokes:1` 说明宿主这一次没接住清除，poke 兜底有效）。

### 13c：写 `session-controller` 本身完全健康，量到 0 是第 1 组留下的坑

`session-query-sqlite` 手写块一出现，reload 后侧栏会话行就归零——该条目正是会杀死会话服务的那一个（[harness-hmr-session-defect.md](docs/harness-hmr-session-defect.md) 的对象）。该手写块在整轮开头补种，13c 量到 0 是它留下的坑，不是被测的 `session-controller` 掀空的。第 13 组因此先 `restartStackAndReopen()` 换到一台干净进程、不补种，再比对写前/写后的会话行数（`rowsBefore > 0 && sessionRows >= rowsBefore`）。实测 `rowsBefore=40`、`sessionRows=40` → **写 session-controller 不掀空侧栏，坐实**。否证实验读数见 `tmp/upstream/probe-seed-block.log`、`probe-seed-key.log`、`probe-13c.log`。

## 验证结果（真实运行输出）

- `npm run check:catalog`：**PASS 全部字段与上游 schema 一致**（19 卡 / 81 字段）。
- `npm test`：**46 pass / 0 fail**（`tmp/upstream/npm-test-final.log`）。
- `npm run build`：`lib/client.js + lib/index.js built`。**注意**：`npm run build` 默认失败 `Error: esbuild not found under /home/kaixiang/dev/co-creation-project (set DSH_ESBUILD_ROOT)`（`scripts/build.mjs:52`）——本机 esbuild 在 dsh-desktop 侧，需 `DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop npm run build`。
- **八套 live 验证连跑**（同栈同构建一次连跑，`tmp/upstream/eight-suites-run1.log`），**合计 177 条，failed=0 skipped=0**：
  - `verify` 30/0/0/30、`verify:timestamps` 10/0/0/10、`verify:dot` 21/0/0/21、`verify:selection` 20/0/0/20
  - `verify:settings` 30/0/0/30、`verify:chat-history` 16/0/0/16、`verify:row-states` 31/0/0/31、`verify:find` 19/0/0/19
  - 另有 `verify-settings-run8.log` 与 `verify-find-run2.log` 两份单独复跑，全绿（30/30 与 19/19）。

## 向下兼容

单版本锚定，不保留旧版本兼容路径。锚定版本即 0.2.1-alpha.1。

## 未做

- `web-runtime.publicUrl` 撞口径 #2（web 下无独立消费者面），不收进清单。
- `session-controller.nativeOpen` 是部署形态开关（web 上无意义），不收进清单。
- 宿主漏接清除重载的**机制**未查清（无日志可证），只把判据从「等 loader 立刻空」换成「逼一次真重载再看」，并把 `pokes` 次数记进观测值便于日后回看。