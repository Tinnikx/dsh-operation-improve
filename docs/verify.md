# 验证

八项功能的验证方式。六个 `npm run verify:*` 脚本连的都是同一套[测试栈](#测试栈)，判据与退出码共用 [scripts/lib/cdp.mjs](../scripts/lib/cdp.mjs)。

## node 在哪

本仓库环境的默认 PATH 上没有 `node`。两条都可用，任选其一（下文命令统一写第一条）：

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH        # 产品自带，v24.19.0
PATH=$HOME/.nvm/versions/node/v24.14.0/bin:$PATH   # nvm，v24.14.0
```

## 测试栈

**验证脚本一律打测试栈，不打日常在用的那个 harness。** 端到端断言里有「批量归档」「批量删除」，它们会真的发出 click；服务是 spy、闸也有三道，但闸是兜底不是许可证，真数据不该出现在被点击的那一侧。

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:up      # 起
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:status  # 看
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:down    # 停
```

`PATH` 前缀在走 `npm run` 时同样不能省：这台机器上的 `npm` 是 nvm v16 那份，它 spawn 的 `node` 直接取自 PATH。

`up` 做三件事：`rsync -a --delete` 把 `~/.dsh` 同步成 `/tmp/dsh-oi-test-home`（排除 `.credentials.yaml`，首次全量、之后增量）；用产品自带的 node 起一个 `DSH_HOME` 指向副本的 harness，端口 3181；起一个独占 `--user-data-dir` 的 headless Chrome，CDP 9334，带上窗口宽度与 hover 那两个 `--blink-settings`。三个脚本不带参数就打这套地址（默认值在 [scripts/lib/cdp.mjs](../scripts/lib/cdp.mjs) 的 `resolveTarget`）。

harness 带 token 认证：`up` 从 harness 日志提取 `?token=`，先给就绪探针换 cookie，再把 token 拼进 Chrome 的启动 URL（303 落 cookie，之后页面照常跑在 `/` 上）。不带 token 打开的首页是 401 认证屏——就绪探针能过（它带 token），但页面上没有侧边栏也没有输入框，所有 verify 脚本都会在错误页面上空跑。

**副本不能省，也不能让两个 harness 共用一个 `DSH_HOME`**：同一个 home 上的两个 harness 各持一份启动时读进内存的 workspace 状态，谁都不看对方的写入——一边归档掉的会话在另一边照样列着，且后写的静默盖掉前一个。拿真 home 起第二个 harness，等于用测试去改用户正在看的那份列表。

**副本里那条插件软链必须重新指过**。`pnpm add link:` 在 profile 的 `node_modules` 里留的是相对软链，起点是 home 自己；`rsync` 原样搬运目标字符串，副本里那条就从 `/tmp/` 往上数四层指到不存在的 `/tmp/dev/...`——**插件静默消失**，页面照样 200、照样出界面，只是七项功能一个都没有。`syncHome()` 因此在 rsync 之后把它改写成指向本仓库的绝对软链（scoped 包名要先 `mkdir` 出 `node_modules/@Tinnikx/`，并清掉可能残留的旧的无 scope 软链），同时把副本 profile 的 `package.json` 里 `dependencies` 与 `dsh.profile.bundles` 两处改写成 `@Tinnikx/dsh-operation-improve`——**只改副本，真 `~/.dsh` 一个字节不动**。`startHarness()` 再断言首页名册里有 `@Tinnikx/dsh-operation-improve`。

`resolveTarget` 见到 `:3080` 直接 `abort` 并打出起测试栈的办法。确实要对着 3080 调试只读断言：`DSH_OI_ALLOW_3080=1`。

本脚本用 `fetch` 与顶层 `await`，而这台机器默认 PATH 上的 `node` 是 nvm 的 v16；版本不够时它在第一行就 `die`。**这不是洁癖**：v16 上 `fetch` 是 `undefined`，探测端口的那次调用抛 ReferenceError 被吞成「端口被占」，脚本于是报一句和事实相反的话就退出。

`rsync` 会把真 home 里已有的[托管区段](./feature-8-harness-config.md#托管区段)一起搬进副本，而 `verify:settings` 要求基线干净——用过设置面板保存过配置的话，每次 `stack:up` 之后都得先把副本那份 `profiles/web/cordis.patch.yml` 里两行标记之间的内容删掉，否则那个脚本开头就 `abort`。

## 单元测试

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm test
```

**参数必须写成 glob，不能给目录**：`npm test` 里那条命令是 `node --test tests/*.test.mjs`，写成 `node --test tests/` 在这个版本上报 `pass 0 / fail 1`，那是参数处理，不是测试失败。

其中 [patch-file.test.mjs](../tests/patch-file.test.mjs) 的六条断言全部对**字节**，输入是 [fixtures/web-cordis.patch.yml](../tests/fixtures/web-cordis.patch.yml)——真实 web profile 用户 patch 层的逐字副本（含中文行内注释、`file-reference-local`、`agent-teams`、手写的 `compaction-basic`）。覆盖：加区段后区段外逐字节不变、改一个字段只有区段内那一个数变、清掉最后一个字段后文件逐字节回到原文、区段清空后补裸 `[]`、落盘换掉整个 inode、有开标记没闭标记时拒绝改写。**判据不能是「解析出来一样」**：那样写的话，把别人行尾的注释吞掉的实现也照样通过。

## 端到端

端到端验证走 CDP 注入——对着**运行中的真实页面**，把构建出的 `lib/client.js` 注入进去、用假 `__ModuleLoader__` 截下 registration 拿到 exports，再 apply 一个最小 ctx（`effect` 收集 disposer，`workspaces` / `sessions` 换成 spy）。走注入而不是直接点页面自带的那份，是因为断言里包含批量归档与批量删除：只有服务是 spy，断言才既打在真实 DOM 上、又不会真的动用户的会话与工作区。

**注入之前必须先停掉页面自带的那份实例**。插件装在 profile 里（见[加载方式](../README.md#加载方式)），不停掉就是两份互不知情的实例抢同一批 DOM：右键弹**两个**菜单，而捕获阶段的监听器按注册顺序触发，native 那份先 append，于是 `document.querySelector('.dsh-oi-menu')` 拿到的是 native 的菜单——脚本以为点的是自己的 spy，**实际点在真服务上**，「批量归档」那条断言会真的归档掉用户的会话（已经发生过一次，8 个真实会话）。

所以点击破坏性菜单项之前有三道闸，任何一道不满足都原路返回、**一个 click 都不发**：

1. **清场**：调 `window.__dshOperationImprove__.dispose()` 停掉 native。句柄上没有 `dispose()`（profile 里是旧产物）或清场后仍有残留，直接 `abort`。
2. **数量**：点击前数 `.dsh-oi-menu` 的个数，不等于 1 就记 FAIL。页面上残留 N 份实例时右键会开出 N+1 个菜单，这道闸兜住清场没停干净的情况。
3. **归属**：读菜单元素上的 `data-dsh-oi-owner`，要求逐字等于本次注入实例的 `instanceId`。前两道都靠推理（「停掉了所以只剩我」「只有一个所以是我的」），这道直接问菜单是谁开的。属性由 `openContextMenu` 写，值来自 `apply()` 里生成的 `instanceId`。

真正的隔离在这三道闸之外：被点击的那一侧根本不该是真数据，见[测试栈](#测试栈)。

**「对齐上游」那几条断言要点开的是页面自己的菜单，而它挂在真服务上。**「...」是行右侧操作区里的第一个按钮，工作区行的第二个是「新建会话」——闭着眼点操作区就会真的开一个会话。所以打开的动作只认 `button[0]`，并要求它恰好多弹出一个 portal 菜单，不满足就当没测到；对着它只读 `viewBox` / `path[d]` / `getComputedStyle`，一个菜单项都不点，关闭走 `Escape`。

这也是为什么 `apply()` 挂出去的 [`window.__dshOperationImprove__`](./shared-api.md#调试句柄) 必须列全每一项带监听或带注册的功能并带一条整体 `dispose()`：只暴露一部分，脚本就停不干净 native，那正是把真会话归档掉的路径。

`scripts/verify-live.mjs` **自己不起浏览器**，只连一个已经加载了 DSH 页面的 CDP 实例。不带参数时打的是测试栈：

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run stack:up
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify
```

要打别的目标就绕开 npm script 直接给参数：`node scripts/verify-live.mjs [port] [urlPrefix]`（`npm run verify -- 9334 …` 也行，但 `--` 容易漏）。

脚本每次先 `Page.reload` 回到一份干净页面，再展开所有折叠的工作区好让会话行够 2 条，然后才清场、注入。`DSH_OI_NO_RELOAD=1` 可跳过刷新——上一轮注入的实例由清场那一步一并停掉（它同时摘 `__dshOiTest__` 里收集的 disposer），但页面状态是上一轮留下的，结果不如刷新过的可信。

## 怎么看出「测了」而不是「跳过了」

**判据是退出码，不是屏幕上有没有红字。** 脚本把「没测到」与「测failed」同等对待：

- 开头必打印一行 `[preflight] {"width":…,"total":…,"sessions":…,"workspaces":…}`。`total` 为 0 说明侧边栏折叠、实测未发生，脚本立即以退出码 1 中止并点名窗口宽度；会话行或工作区行不足 2 条（跑不满批量分支）同样中止。
- 紧接着打印一行 `[clean] {"how":…,"handle":…,"styles":…,"menus":…,"highlights":…}`。`how` 是 `disposed` 说明页面自带的实例确实在、且被停掉了；`absent` 说明这一轮页面上本来就没有 native（插件没装或产物没加载）；`no-dispose` 与「清场后仍有残留」都直接中止。后四个计数必须全是 0 或 `undefined`。
- 每条断言前缀是 `[PASS]` / `[FAIL]` / `[SKIP]`，结尾固定打印 `passed=N failed=N skipped=N total=N`。
- **`failed + skipped > 0` 一律非零退出**，全绿时最后一行是 `[OK] 全部断言实际执行且通过。`

所以确认「真的测了」只需两步：`echo $?` 为 0，且 summary 是 `passed=25 failed=0 skipped=0 total=25`。只看见一堆 `[PASS]` 而没核对计数与退出码是不够的——早先的版本没有断言、只打印观测值，前置条件不满足时会把每条记成 skip 然后以退出码 0 收场，看起来通过、实际什么都没验证。

判据与退出码由 [scripts/lib/cdp.mjs](../scripts/lib/cdp.mjs) 提供，五个验证脚本共用：`check(label, value, expect)` 的 `expect` 返回 `true` 记 PASS、返回字符串记 FAIL 并把它当失败原因；观测值带 `skipped` 字段记 SKIP。**SKIP 与 FAIL 一样导致非零退出**——一个全是 skip 却退 0 的脚本比没有脚本更糟。环境不满足（窗口过窄、会话页没打开、起点不足）时直接 `abort()` 并点名「实测未发生」，同样非零退出。

`evaluate()` 每次求值新开一条临时 CDP 连接、用完即关，长驻连接只留给要收事件的 `Page.reload`。**不能全程共用一条**：断言里会点击会话行，切会话销毁执行上下文后，那条连接上的每次 `Runtime.evaluate` 都被协议层永久拒为 `-32000 Inspected target navigated or closed`，整轮验证崩在半路，证据链就此断掉。

**多人共用一个常驻 Chrome 时，`Page.reload` 会互相踩**：别人的脚本重载页面，这边正在跑的 `Runtime.evaluate` 就收到协议层的 `Inspected target navigated or closed`，与被测代码无关。脚本把协议层 `res.error` 和页面异常分开报出来，撞上就重跑；另一侧的表现是自己 apply 的实例被重载冲掉，`dispose` 那条断言会拿到别人残留的 DOM。串行跑，或用 `DSH_OI_NO_RELOAD=1` 跳过自己的重载。

## 文案跟不跟语言切换，只能换一种语言再跑一遍

菜单文案的断言比对的是**上游词典当场给出的那串文本**，不是写死的「分叉会话」——所以它在任何语言下都成立，但也因此单跑一次证明不了「切了语言文案会跟着变」。换语言的办法是改测试栈那份 home 的 `locale.preference`（`zh` / `en`），**harness 不用重启，刷新页面即生效**（`verify` 自己会 `Page.reload`）：

```
sed -i 's/^  preference: zh$/  preference: en/' /tmp/dsh-oi-test-home/settings.yaml
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify     # 改回 zh 再跑一遍
```

判据是每条断言观测值里的 `lang` 字段（`zh-CN` / `en`）与 `items`。**改的必须是副本那份**：真 home 那份是用户自己的界面语言。而 `npm run stack:up` 会 `rsync --delete` 把副本盖回真 home 的内容，改完不要再 `up`。

## 功能 4 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:timestamps
```

`verify-timestamps-live.mjs` 同样先点开一个够长的会话（要求 ≥20 条节点行、≥1 个 Think 行、≥1 枚上游时间标签，不满足一律 `abort`）。十条断言：装饰完整性、文本格式、**标签等于上游 Started**、跨 step 时间单调不减、每枚标签落在本行第一行上、不压正文、Think 行水平带上有本 step 的时间、上游三类改常驻、空闲无自激重建、dispose 复原。四处只有这个脚本才守得住的坑：

- **Chrome 必须带 hover 那两个 `--blink-settings`**（[测试栈](#测试栈)起的那个自带）。headless 默认 `(hover: none)`，上游那条藏时间的规则整条不生效，装载前量到的恒是 `opacity: 1`，「改成常驻」的断言会在功能完全没生效的情况下报绿。`Emulation.setEmulatedMedia({features:[{name:'hover'}]})` **办不到**——实测下发返回 `{}` 无错，而 `matchMedia('(hover: hover)').matches` 纹丝不动地保持 `false`；Chrome 只认它支持的那几个 `prefers-*` / `color-*` 特性，多余的静默忽略。脚本因此改成读 `matchMedia` 的前置检查，不满足就 abort 并让人重起测试栈。
- **插件若已装进 profile，页面自带一份实例**，不先停掉就注入会得到两份互不知情的实例、每行两枚标签（实测 160 = 2×80）。清场因此调 `window.__dshOperationImprove__.timestamps.dispose()` 而不只是删 DOM：光删 DOM，原生那份的 `MutationObserver` 下一帧就把标签贴回来。
- **dispose 之后要等一拍再量 `opacity`**。上游那枚时间标签带 opacity 过渡，摘掉样式表后同步读回来的恒是过渡前的 `1`。
- **单调性只能跨 step 判定，不能整列判**。同一个 step 内部本来就可以逆序：`model-retry` 携带的是重试事件时刻，而它后面那条 `assistant-step` 显示的是**该 step 的起点**，起点必然更早。实测 step 138 起于 11:42:39、重试发生在 11:42:57，两行各自都对。同 step 的逆序被显式计数报出来（`sameStepCount`），免得这条放宽把真正的反查串行一起放过去。

**装载前后的几何本来就不同**（右侧留白），所以这个脚本没有「零布局位移」这条断言；几何基线只用于 dispose 之后的复原比对，同时守着「留白被收回」。基线用「相对滚动内容」的坐标而不是视口坐标——视口坐标随 `scrollTop` 整体平移，页面自己滚一下就会把全部行报成位移。

脚本结尾打一行 `[coverage]` 列出本轮实际见到与未见到的 kind。未见到的**不记成 skip**（它们不在本轮的断言计划里，记 skip 会让脚本永远非零退出），而是记在[功能 4 的已知限制](./feature-4-timestamps.md#已知限制)里。

脚本给本次注入的实例打一个 `nonce`，并在关键断言前校验它还在。页面被别人中途重载时**中止而不是记为 FAIL**：把环境问题写成功能缺陷比不测更糟。

## 功能 5 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:dot
```

`verify-active-dot-live.mjs` 和 `verify:selection`、`verify:settings` 一样**不注入 bundle、也不 apply 自造的 ctx**（五个脚本里只有这三个），验的是页面自带那份实例的实际效果。这一条被验的是一张纯样式表，而页面自带的那份实例已经把它插进 `<head>` 了。断言读的就是那张表的效果，走的是「`npm run build` 的产物 → profile 装载 → 页面自己的实例插入」这条真实路径。基线靠**摘掉那张表**取得（`disabled = true`，测完还原），同一个 DOM 上一摘一装，前后两组读数才可比。探针是脚本现搭的一个 `StateDot`，class 从页面真实样式表里反查，所以它与上游那条规则形成的是真实的特异性竞争。不去等一个真的活跃会话：那要在测试栈里真跑一轮模型调用，代价与风险都远大于它能多验到的东西（同一个组件、同一条 CSS 规则）。

**对比度读的是截图像素，但底色是脚本垫出来的名义值。** 前景那半必须由浏览器渲染——`fill × opacity` 的合成交给它，脚本自己算一遍就等于验证脚本重写了一次被测逻辑。底色那半则不能取自页面：装了壁纸主题的页面整个 UI 是半透明的，标记压着的是一张逐像素变化的照片（实测同一列上下极差 187），`--dsw-alias-bg-base` 本身就解析成 `rgba(108, 96, 97, .28)` 且不随主题变，从格子到 `html` 一层不透明背景都没有。那种页面上不存在「一个底色」，任何单点采样都是偶然值。所以探针自带一块名义底色（深色取页面的 `--dsw-static-neutral-bluish-950` = `rgb(21, 21, 23)`，浅色取白——`--dsw-static-white` 在壁纸主题下被改成了透明，不能用），`Page.captureScreenshot` 把格子连同这块底色一起截下来，两个颜色取自同一张图。量的是「这个配色在标准主题底色上有多少对比度」，与用户装了什么主题无关。

`conn.send()` 回的是整条 CDP 消息，截图数据在 `res.result.data` 上；读成 `res.data` 得到 `undefined`，表现是页面侧 `img.decode()` 抛 `EncodingError`，看不出是取错了字段。

20 条断言全过时的读数见[功能 5 · 实测读数](./feature-5-active-dot.md#实测读数)。

## 功能 6 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:selection
```

同样**不注入 bundle、不 apply 自造 ctx**，验的是页面自带的那份实例：功能 6 一个 harness 服务都不调，没有需要打桩的破坏性动作，走页面自己的实例反而把「构建产物 → profile 装载 → 真实词典」整条路径一起验了。16 条断言覆盖三条命中路径（会话正文的选区、输入框里的选区、空输入框）、两项动作的实际效果、不该命中的两种情形（非可输入且无选区、侧边栏行）、样式一致、图标一致、以及 `dispose` 之后不再接管。

- **手势必须走 CDP 的 `Input.dispatchMouseEvent`，不能用合成事件**。合成的 `.click()` 不带 user activation，而 `navigator.clipboard.readText()` 要的正是它——用合成事件时粘贴那条断言会在功能完好的情况下报失败。
- **`Browser.grantPermissions` 只在 browser 级别那条连接上存在**，页面连接答 `'Browser.grantPermissions' wasn't found`。更要紧的是**那条连接必须一直开着**：授权跟着授权的那个 CDP client 走，ws 一关 Chrome 就把覆盖撤回，之后 `readText()` 报 `NotAllowedError: Read permission denied`——症状看着像没授权成功，其实是授过又收回了（`grantPermissions` 本身答的是 `{}`）。
- **粘贴的哨兵由脚本自己写进剪贴板**，所以「粘完应该是什么」是算得出来的常量，而不是拿页面上另一处读数去对页面上这一处。
- **contextmenu 探针挂在插件之后**（同为捕获阶段，后注册后触发），才读得到插件处理完之后的 `defaultPrevented`；探针自己随后也 `preventDefault()`，免得 headed Chrome 弹出原生菜单挡住后面的手势。
- **图标断言按 `aria-label` 找页面上那枚真实的复制按钮**，不按 `d` 反查——按 `d` 找就成了拿常量去证明常量。`aria-label` 取自同一份 common 词典，所以它在两种语言下都定位得到。
- **输入框里的选区要自己算右键的 x**：Chrome 在 `<textarea>` 上右键会先折叠选区，落点不在选区内就等于没选。脚本用该 textarea 自己的计算字体在 canvas 上 `measureText(value.slice(0, mid))` 求出中点的横坐标，保证这一下点在选区里。draft 的写入也走真实手势（`Delete` 键 + `Input.insertText`）而不是直接写 `value`——那是个受控 `<textarea>`。
- **样式一致比的是 `getComputedStyle` 的完整枚举**（root 与 item 各 862 键），排除的是一张显式的几何键名单而不是正则：`font-size` 里也有 `size`，按模式排除会把字号一起放过。
- 脚本最后一步 `Page.reload`：第 11 条断言把页面自带的实例 `dispose()` 掉了，不重载就等于给下一个人留一个功能缺失的页面。重载后再断言新实例确实回来了。

**语言跟随只能换一种语言再跑一遍**，办法与[上面那条](#文案跟不跟语言切换只能换一种语言再跑一遍)一样。判据是观测值里的 `lang` 与 `items`：zh 下是 `["复制","粘贴"]`、空输入框 `["粘贴"]`，en 下是 `["Copy","Paste"]`、`["Paste"]`。

## 功能 7 的验证

没有 `npm run verify:*` 脚本，判据在 `.scratch/think-scroll-check.mjs`（七条断言，同样连测试栈的 CDP；`.scratch/` 在 `.gitignore` 里，这个文件不在版本库，新克隆的仓库跑不了，得照判据重写一份）：

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node .scratch/think-scroll-check.mjs
```

它也不注入 bundle，验的是页面自带那份实例插进去的样式表。判据全部取自真实页面上上游自己渲染的 think 块——不造 fixture、不注入文本，因为测试栈那个会话里正好既有超过 60vh 的思考、也有远不到的，两类同页；缺任一类就 `abort`（「限高分支实测未发生」）。

**对照组只中和本规则那两条声明，不能整张样式表 `disabled`**。同一张表里还有功能 4 那条 `[data-chat-flow-key]` 的 56px 右侧留白，摘掉它正文列宽 748→804、文字重排少一行，于是放得下的思考也「长高」24px——那正好是一个 `line-height`，看着像本规则的副作用，实际是留白的账。

## 功能 8 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:settings
```

十六条断言，全部打[测试栈](#测试栈)（`DSH_HOME=/tmp/dsh-oi-test-home`、harness 3181、CDP 9334）。它**不注入 bundle**，驱动的是页面自带那份实例渲染出来的真面板：打开设置 → 展开这一行 → 用真实输入事件改值 → 让输入框失焦，然后同时读三处——patch 文件的字节、host 路由回的 `live`、面板自己的 DOM。覆盖：手写值即当前值且标 `manual`、DOM 里根本没有保存按钮、只失焦就写出区段且区段外逐字节不变、不重启 harness 就热重载生效、写 `tool-ralph` 时 restate 住 `subagentProvider`、手写行连行尾注释原样保留、跨字段规则被前端拦下且文件一个字节没动、点「清除」撤掉被拒的草稿、卸载本插件后区段与效力都还在、点「清除」不做别的操作就把键摘回 harness 默认、托管键清空后区段整体消失且文件逐字节回到基线、没人设过的字段只淡化控件且默认值只在 `placeholder` 里（设过之后恢复、清空之后重新淡化）、bundle 字段的徽标显示来源包名而手写与系统默认的文案不变。

- **本脚本会真的往 patch 文件里写字节**，所以它比别的 verify 脚本更依赖测试栈那道隔离。开头先做两道前置检查：基线里已经有托管区段就 `abort`（上一轮中途失败留下的脏基线，或[从真 home 同步进来的那一段](#测试栈)），基线里没有手写的 `compaction-basic` 行也 `abort`（「手写行共存」那条断言要靠它，副本里被删掉时应该说出来而不是静默少测一项）。
- **测试值从基线算出来，一个都不写死**。副本来自真 `~/.dsh`，那边的手写值随时会被改，写死就是让脚本慢慢烂掉——而且烂法是「面板明明对着、断言却报红」。手写块的值由 host 路由自己的 `outside` 给出，要写进去的新阈值取 `(retainRatio + 1) / 2`（必大于手写的保留比例，且与手写阈值不相等），越界值取它 `+0.1`；「原样保留」比的是从基线里抓出来的那两行原文，不是抄一遍注释。
- **输入必须走 focus + native setter + `input` 事件**。React 的受控 input 认的是 value tracker，直接 `el.value = x` 不触发 `onChange`——状态没变而画面变了，断言会对着一个不存在的草稿报绿；focus 也不能省，面板的写入点在 `onBlur` 上，没聚焦过的元素调 `blur()` 不派发事件，整批断言会一起卡在等一次永远不会发生的写入上。
- **「生效了」的判据是 host 路由回的 `live`，不是界面上的数**。`live` 来自 `ctx.loader.entries()`，即 loader 真正跑着的那份 config；界面上的值是本次 `GET` 的快照，写完立刻回显不能证明热重载成功。`watchUserPatches` 有防抖，所以是轮询而不是睡一个定长。
- **「这一次自动保存落定」的判据是待提交计数归零或报错，不是 `data-state`**。后者在 payload 一到手就是 `ready`，写请求还在飞的时候读字段会读到旧快照。
- **淡化读的是控件的 `opacity`，不是 `color`，且要连整行与标签一起读**。灰显是一条 CSS 规则的效果，断言 `data-default` 挂上了只能证明标记在；按颜色比会在把标签色压成同一个值的主题下永远相等——测试栈里那份主题正是如此，实测两行的标签色同为 `rgb(255, 255, 255)`。同时断言行与标签的 `opacity` 是 `1`：只淡控件是要求的一部分，规则写宽一格（挂到行上）不会有别的断言报错。
- **「卸载不清空」在一份副本上真卸载**：`rsync` 出 `/tmp/dsh-oi-uninstall-home`，从 profile manifest 的 `bundles` 与 `dependencies` 里摘掉本插件，用 harness 自己那套 `loadProfile` + `composeEntries` 算该 home 的生效配置，再起一个真 harness（3182）确认它照样起得来。**不能在测试栈本身上卸载**——那会把 CDP 那一侧的页面一起掀掉，后面的断言就没得跑了。
- **「插件确实没了」要按 entry 的 `name`（包名）判，不是 `id`**。entry 的 id 由 bundle 自己定，按包名找 id 永远找不到，那条断言就会在插件明明还在的时候报绿。

一轮完整跑的读数见[功能 8 · 实测读数](./feature-8-harness-config.md#实测读数)。

## 功能 9 的验证

```
PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH npm run verify:chat-history
```

十四条断言，全部打[测试栈](#测试栈)（`DSH_HOME=/tmp/dsh-oi-test-home`、harness 3181、CDP 9334）。它**不注入 bundle**，验的是页面自带实例：功能 9 不调用任何 harness 服务，没有需要打桩的破坏性动作。

历史断言的 oracle 是脚本自己对导航列与消息流的独立读取（fiber 里的轮次条目 + loaded 锚点行的气泡全文）——被测会话的提问全部先于插件存在，不从插件侧取任何期望值。导航的期望值取自被测会话的真实提问，不写死。

覆盖：句柄与 snapshot、历史条数与导航列条目一致、历史文本与独立读取一致、↑ 从最新回翻、连续 ↑、按满停在最早一条、↓ 返程、↓ 越界清空并退出、有未提交内容且光标在文中不接管、多行且光标在非文档开头不接管、切会话后历史换成那个会话的、不写 localStorage、dispose 后不再接管、刷新后长出新实例。

- **选会话不能按名字**：测试栈副本随真实 home 漂移，且部分会话的视图没有输入框（只读/归档）或挂载很慢。脚本逐行点开侧边栏会话，等「历史 ≥2 且 composer 在、且两次读数一致（视图落定）」；**运行中的会话直接跳过**（node 的 `running` 字段，行 fiber 反查）——运行中的会话页输入框不可用。
- **导航列 tick 数不作数**：轮次多时 tick 会被压缩采样，条数比对一律走 fiber 里的 `items`。
- **设值断言读 `innerText`**；脚本侧清空用 `selectAll` + 真实 Delete 键（`execCommand('delete')` 在 Lexical 上不生效），`selectAll` 与 Delete 之间要让一拍——选区同步进 Lexical 是异步的。插件侧的写入坑更多，见[功能 9 文档](./feature-9-chat-history.md)。
- **多行内容用 CDP `Input.insertText` 一次插入 `'line1\nline2'`**（真实输入管线保留换行；`execCommand('insertText')` 会抹平）。
- **会话切换靠点侧边栏行**：应用没有 URL 路由，URL 恒为 `/`。
- 不覆盖：多设备/多浏览器——历史只读当前页面状态，没有可跨的东西。

