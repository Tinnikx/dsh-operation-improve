# 017 功能 4 时间标签布局：不遮字 + 正文向左推（留白带）

- 目标：修会话页时间戳溢出正文列的布局回归（用户报告「时间跑到会话区外」「每一步的时间把整条会话向左缩短」），定案口径「不要遮字，遮字就把相应步骤的文字向左推」。验收方式：`npm run verify:timestamps` 末行 `passed=10 failed=0 skipped=0` 且 `echo $?` 为 0，其中「标签待在留白带里不遮字」那条实际执行（不是 skip）；`check:catalog` 17 卡 / 78 字段 PASS、`npm test` 44/44、其余 live 套件不回归。
- 范围：做——`src/timestamps/index.js`（留白带布局 + `undecorate` 收回 padding）、`scripts/lib/ts-checks.mjs`（几何不变式断言）、[docs/feature-4-timestamps.md](../feature-4-timestamps.md) 两段。不做——改上游 DOM、改时间格式化口径、跨会话时间、逐行抠正文矩形的重叠判定。

## 进展

- **布局**：行标签 `position:absolute; top:0; right:0` 落在一条右侧留白带里、与本行第一行水平对齐；正文由这条 `padding-right` 向左让出容得下标签的窄带，文字满铺到内容盒右缘即止、不进带，两者不相交——**不遮字**。带宽由 **CSS 按标签的日期档位**给：行标记属性 `data-dsh-oi-ts` 的值就是档位（`hms` / `md` / `ymd`，新纯函数 `clockTier` 从标签文本判），CSS 三条规则给 49 / 79 / 107px（= 各档最宽标签实测 43 / 73 / 101px + 6px 呼吸位，11px tabular-nums 下量得）。`undecorate` 摘掉属性即收回带。旧的定宽 80px（`--dsh-oi-ts-gutter`）已移除。
- **切页卡慢有两个独立根因，都已修**（用户报「disable 插件快、启用切换回对话页 ~4s」，后又报「长会话切回仍卡」）：
  1. **观察者自激**：`decorate()` 贴标签是 childList mutation，回流到 `document.body` 的观察者 → 又 `queueRebuild` → 又写。切页时 React 的真实节点增删与插件标签混在同一批 mutation 里，`isSelfInflicted` 的 `touched.every(isLabel)` 挡不住混批，一次切换放行出 65 次 rebuild。修法：写相位整段包进 `withoutObserving(fn)`（写前 `observer.disconnect()`、写后 `takeRecords()` 丢自伤记录再重连），物理上断掉回路。实测 53 行会话同一手势 **3865ms（rebuild 65 次 / 11435 mutation）→ 678ms（rebuild 1 次）**，基线（`dispose()`）622ms。
  2. **逐行写内联 `padding-right`**：每写一行就让该行文字重排一次，布局次数随行数线性上升。CDP `Performance.getMetrics` 的 `LayoutCount` 实测：117 行会话插件开 `+203` / 466ms、插件关 `+9` / 358ms；473 行放大到 `+354` / 717ms vs `+7` / 426ms。分段实验（只读矩形 / 只读 offsetWidth / 交替读写 / 纯写 padding）各 0 次回流，排除了「读写交替」这条误判——成本就是逐行写 style 本身。修法即上面的「带宽交给 CSS 按档位给」，插件一行内联样式都不写。
- **最终读数**：332 行 / 325 标签的会话上，插件开 `LayoutCount +24` / 506ms，插件关 `+7` / 404ms——布局次数不再随行数爬升，插件边际成本 +102ms（其中 90ms 是 fiber 反查与格式化的固有 JS 开销，非布局抖动）。
- 验证：`verify:timestamps` **10/10**，其中「标签待在留白带里不遮字」在一份 **311 枚可测标签**的长会话上 `floatOut=0 tooNarrow=0 intrude=0`；`npm test` **46/46**（新增 2 条 `clockTier` 用例，含「与 `formatClockSeconds` 三条分支一致」那条防两者漂移）；`check:catalog` 17 卡 / 78 字段 vs 0.2.0-rc.2 schema 一致 PASS。
- **`verify:timestamps` 有两条断言会在「会话整组折叠」时报 `checked:0` 失败**：断言按「零高度行跳过」（折叠组里的行高度为 0），若选中的会话所有行都折叠就没东西可测。这是测试数据条件，**基线（stash 掉本轮改动）在同一会话上同样失败两条**，不是回归。要拿到有效信号得先挑一份「行有实际高度」的会话：测试 home 里 `依赖下载失败原因排查`（53 行全部有高度 / 19 think / 3 上游时间）可用；多数长会话的过程组是折叠的（实测 251 行里只有 8 行有高度）。
- **第三处成本（用户问「为什么不能异步渲染」并选 A 方案）已修**：那一趟装饰原本在「有 mutation 的下一帧」就做，正好挤进上游虚拟列表连续量布局的窗口，把上游的读变成强制回流。改成**等上游连续 4 帧不再改 DOM 才做**（`SETTLE_QUIET_FRAMES = 4`），带 `SETTLE_MAX_MS = 250` 超时上限（流式输出时 mutation 永不停，只按静帧判则时间戳永不出现）。调度器换成 `markDirty()` + `tick()` 帧循环，取代原 `queueRebuild()`。同一份长会话切回对话页实测：**内容稳定 278ms → 117ms（关掉插件是 116ms，已持平）**，主线程阻塞 121ms → 34ms（关掉是 31ms）；代价是标签晚一点出现（内容稳定后约 100ms，实测 `labelsAt` 235ms）。CPU profile 佐证插件自身函数自耗时 ≈ 0%，成本全在写入与上游读布局互相挤。
- 复验：`verify:timestamps` **10/10**（含 `idle: no self-triggered rebuild` 3s 内 `labelNodesAdded=0`、`bodyChildListMutations=0`，证明静帧循环会干净停下、不残留常驻 rAF）；`npm test` 46/46；`check:catalog` PASS。

## 决策与理由

- 留白带是唯一既不遮字又不靠绕排的解法。`float:right` 让正文绕排在本 DOM 下几何上不可能：正文套在 `[data-chat-node-key]`（`EvIC1a_flowItem`，`display:block,overflow:visible`）里 `display:contents` 之下的**嵌套 flex/grid 格式化上下文**（用户消息 `Sixlwa_userStack`/`Sixlwa_userRow` 是 flex、think 头 `_content_1rdzk_11` 是 flex ← `_root_1rdzk_1` 是 grid），float 影响不到 flex/grid 容器内的内容。实测 `float:right` 后标签仍浮在行右缘、正文满宽压住它。
- 「叠正文右上角 + 不透明底」被用户否（m00834「不要遮字」）：它会遮住首行右端小段文字。
- 带宽按**档位枚举**给、不逐行量：定宽一档不可行（定 49px 容不下跨日前缀，定 107px 把同日会话白推 58px），逐行量宽又必须逐行写内联 style（就是上面根因 2）。取该档最宽标签给宽，代价是窄标签右侧多空几 px——同日标签 43px 落在 49px 带里。

## 测试cases

`scripts/lib/ts-checks.mjs` 把原「labels never overlap body text」（用元素 rect 判交叠，nowrap 溢出假阳性）改成几何不变式 **「row labels sit in the reserved band and never cover body text」**：`contentRight = rr.right - parseFloat(getComputedStyle(row).paddingRight)`，守三条件 `floatOut`（`a.right > rr.right`，越出本行右缘=会话区外回归）、`tooNarrow`（`padR + 0.5 < a.width`，带宽装不下标签）、`intrude`（`a.left + 0.5 < contentRight`，标签侵入正文区=压字）。正文满铺到内容盒右缘即止不进带，标签待带里二者必不相交，故不逐行抠正文矩形、无假阳性。

## 主题漂移：菜单浮层描边分档

0.2.0-rc.2 起，`dsh-client-ui-theme` 在 `body[data-ds-dark-theme] [data-menu-material]` 作用域内发 `--dsw-elevation-stroke-color: var(--dsw-alias-border-l3)`——**只有深色这一档**；浅色下 `[data-menu-material]` 没有任何对应规则，能看到的只有 `body` 上那一档 l4。上游菜单自己的 `._list` 规则（`ui-primitives` 的 Menu，`dsh-web-frontend/dist/assets/index-*.css`）写死了 `--dsw-elevation-stroke-color: var(--dsw-alias-border-l1)`，加上 JSX 上的 `data-menu-material="translucent"`，两半合起来才是「浅色 l1 / 深色 l3」。本仓的浮层那份声明照抄了 l1、却没带那枚属性，于是深色下主题那条覆盖命中不了，描边色退回 l1：`list.boxShadow` 那 0.5px 描边本插件算得 `rgba(255,255,255,0.06)`、上游是 `0.16`（l3），只有深色主题看得出差，浅色两档同值。

修法是**两半一起给**：菜单根元素补上 `data-menu-material="translucent"`，同时把 [src/shared/context-menu.js](../src/shared/context-menu.js) 里原有的 `--dsw-elevation-stroke-color: var(--dsw-alias-border-l1, …)` **留着**。两半缺一不可，且错的方向相反：只有属性不吃声明，浅色下主题只在 `body` 上发过这枚 token（值是 l4），没人给菜单重发，落到 l4，比上游深一档；只有声明不吃属性，深色下主题那条覆盖规则挂在 `[data-menu-material]` 选择器上、特异度 0,2,1，压不过也命中不了，退回 l1，比上游浅一档。两半都在时浅色靠自报那份、深色被主题盖成 l3，深浅两档 `boxShadow` 与上游逐字相等。

**`src/find/index.js` 里功能 11 的查找条有同一行拷贝，没跟改**：那条横条不是菜单、上游没有对应物，它那层阴影是本仓自己选的，没有判据能验什么才是「对齐」。给它照搬菜单的 material 标记等于凭空声明它是一张菜单表面。

判据分两处。`metrics()` 多取两样——`material: menu.getAttribute('data-menu-material')` 与 `stroke: l.getPropertyValue('--dsw-elevation-stroke-color').trim()`（**解析后的值，不是声明串**），`menu metrics match the primitives default tier` 那条在 `styleDiff` 之前先单比这两样；**都单列而不混进 metrics 里靠 boxShadow 反推**——boxShadow 那串里混着两档同值的层，只有深色主题露馅。

但那一条只在**启动时那一档主题**下跑，而缺两半各在一档里露馅（见下），所以另立一条 `menu stroke colour matches upstream in both themes`：用 `withTheme()` 把 `data-ds-dark-theme` 摘掉又挂回，两档各读一遍两个菜单。除了逐档比，还要求**两档读出的值必须不同**——相同就说明其中一档没生效（属性没被主题接住，或声明把主题那份盖住了），这条 FAIL 而不是当作巧合放过。

回归证法（变异测试）：把那行 `--dsw-elevation-stroke-color` 声明删掉重建重跑，`menu stroke colour matches upstream in both themes` FAIL（浅色档 l4 ≠ 上游 l1）而 `menu metrics match the primitives default tier` 仍 PASS——**后者单独留着就抓不到它**，这正是新增这条的理由。

**中途走过一段错路，教训记在这里**：先只补了属性、把自报声明摘掉（当时认定「不自己报档，档位完全交给主题」），深色转绿、整套 29/29 全过，但**浅色从 l1 掉到 l4、比上游深一档——而当时的判据看不出来**，因为它只单比 `material`、剩下的交给 boxShadow，那正是浅色两档同值的情形；测试栈又只起深色那一档。是靠一条临时探针分别读本插件菜单与上游菜单在两档下的解析值才发现（探针已删，`tmp/` 被 `.gitignore` 忽略）。**「判据绿」不等于「改对了」：判据没覆盖的那一半要自己量，尤其当一个改动同时影响多个主题时，单主题的绿灯只能证明它覆盖的那一档。**

## 未验证项与下一步

- 跨年会话（`Y/M/D HH:mm:ss` 更宽标签）的带宽变宽只在理论上覆盖，`verify:timestamps` 只在当前世界会话跑。
- 真桌面客户端手工项：跨年前缀标签的观感、流式输出时的布局抖动。

## 坑

- **插件往 `document.body` 的观察者写 DOM 会自激**：`MutationObserver` 是异步批量派发的，`decorate()` 写的标签 append 与 React 的真实节点增删会混进**同一批** `records`，`isSelfInflicted` 的 `touched.every(isLabel)` 只要混进一个非标签节点就判「非自伤」放行 → 又 `queueRebuild` → 又写 → 一次切页 65 次 rebuild、切回对话页从 622ms 放大到 3865ms。靠 every 判据在混批下永远有漏网，正解是**写 DOM 期间 `observer.disconnect()`、写完 `takeRecords()` 丢掉自伤批次再 `observe()`**——物理上不让自己的写回流到观察者，与 React 并发写无关。修复后 rebuild 65→1、切回 3865→678ms（基线 622ms）。
- **诊断切页耗时别在行数一稳就 break**：第一次测切回只测到 1s（脚本 `chatRows>0 && i>6` 就 `break`，采样窗口远小于真实 4s 切换），据此误判「时间戳只占 1.2%、与插件无关」。真实对照是**同一手势只切插件开关**：dispose 后 622ms vs 启用 3865ms，才坐实是插件。计时要等 `totalMs` 到稳定态（连续多次行数不变）再收。
- **归因布局成本用 CDP `Performance.getMetrics` 的 `LayoutCount` / `RecalcStyleCount`，别只看墙钟**：`conn.send('Performance.getMetrics')` 返回整条消息，读数在 `res.result.metrics`（按名字取 `LayoutCount` 等）。墙钟会被机器负载与 React 自身渲染量干扰，同一份代码在折叠会话上量出来就偏小；`LayoutCount` 增量能直接指到「每行一次重排」这种结构性问题。分段实验（只读矩形 / 只读 offsetWidth / 交替读写 / 纯写 style，各测一次 layout 增量）是排除猜测的最快路径——本轮据此否掉了自己「读写交替导致 O(N²) 回流」的错误假设。
- **性能探针必须自带「插件真的干活了」的断言，否则量到的是空转**：本轮两次踩——① 轮询里 `sleep(40)` 且要「连续 5 次行数相同」才收，光轮询垫进 ~200ms，绝对值全虚高（只有同法 on/off 相减才有意义）；② 探针挑会话时没断言标签数 > 0，跑出 `labelsOn: 0` 却照报了 stable 数字。正解：每次「开」的测量结束时断言 `endLabels > 0`，无效就退出非零；计时用纯 `requestAnimationFrame`（不 sleep），阻塞量用 `PerformanceObserver({entryTypes:['longtask']})` 的 `Σmax(0, dur-50)`，与轮询节奏无关。
- **包 `api.refresh` 数不到观察者触发的重建**：观察者走内部 `rebuild()`，不经过 `refresh`，所以那样测出的 `rebuildCalls: 0` 是假的。要数重建得数标签写入，或直接看 longtask / CPU profile。
- **修掉一个根因不等于修完**：观察者自激修好后 117 行会话已追平基线，但 473 行仍差 291ms——第二个根因（逐行写内联 style）只在更长的会话上才显形。**性能类改动必须在「用户描述的那个规模」上量**，短会话的绿灯不算数。
- **CSS 模板字符串块内注释别用反引号**：CSS 里写 `` `decorate()` `` 这类反引号会截断模板串，esbuild 报 `Expected ";" but found "decorate"`（`src/timestamps/index.js:428`）。两次踩同一坑，注释里改用中文引号或不加引号。
- **verify 的重叠断言别用元素矩形**：nowrap 的 think-summary（`lcKema_summaryText`，父 `overflow:hidden`）文字溢出自己的矩形，元素 rect 判交叠必假阳性。改判「标签待在留白带里」（`paddingRight` 反算 `contentRight`）才干净。
- **`menu metrics match the primitives default tier` 那条 FAIL 是 0.2.0-rc.2 的主题漂移，与 timestamps 无关，已在 018 之后按用户指示在本条里修掉**（见下节「主题漂移：菜单浮层描边分档」）。当时判成「全套套件里的跨测试干扰/主题 token 时序」是错的：`verify:settings` 单跑 26/26 不是干扰，是那条断言操作的是**会话行**菜单（`sessionPair`），而 017 的时间戳在会话正文侧，两者本来不相干。**判据先落回机制再落回归属**——先查那条断言读的是哪个元素的哪个属性，stash 基线只证明「不是本轮引入」，不证明「原因是什么」。
- **诊断/验证脚本必须与 `test-stack.mjs up` 在同一 bash 调用里跑**：跨调用后台栈被回收 → `ECONNREFUSED 127.0.0.1:9334`。诊断前须 `reloadAndWait` + 展开工作区 + 点开 ≥20 行会话，否则 `[data-chat-node-key]` 为空。`evaluate()` 只接受字符串表达式；`createEvaluator({port,prefix})` 返回 `{connect,evaluate,conn}`，`reloadAndWait(conn)` 传 conn。
