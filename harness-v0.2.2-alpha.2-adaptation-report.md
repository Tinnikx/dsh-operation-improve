# harness v0.2.2-alpha.2 适配报告

锚定版本从 0.2.1-rc.3 → **0.2.2-alpha.2**（desktop dist `@deepseek-ai/dsh` 的 `package.json` version 为 `0.2.2-alpha.2`，`check-catalog-schema.mjs` 打印的 `dsh=0.2.2-alpha.2` 与 `scripts/lib/harness-bin.mjs` 的 `resolveHarnessBin()` 取的是同一份）。沿用单版本锚定口径，不保留旧版本兼容路径。

## 上游变化（落在本插件上的部分）

- **图标改成 sprite 引用**。上游图标不再是内联 `<svg viewBox><path d>`，而是 `<svg data-icon="dsw-icon-copy-outline-regular" width="16" height="16"><use href="#dsw-icon-copy-outline-regular"></use></svg>`。实测 `viewBox=null`、`pathCount=0`；只比 `viewBox` 与 `path[d]` 会得到两边都为空的假通过。
- **侧栏行左移到 x=8**。功能 10 的像素判据原先按 `multi.x - 12` 算截图左边界，此时是 `-4`；`Page.captureScreenshot` 收到负坐标不报错，而是从页面原点 `(0,0)` 截同样大小的一块（实测截出页头），取样点全落在侧栏外的底色上，量出「描边=背景、填充=背景」的一组假读数。
- **消息正文的包裹层数变了**。功能 11 跳转命中时，命中文本的父元素可能是整块正文容器（实测最近的可滚动祖先高 4742px），对它 `scrollIntoView({ block: 'center' })` 只把容器居中，命中本身停在视口外（实测命中 `top=1217`，视口高 857）。
- **附件默认值变大**。`attachment-local.maxImageBytes` 上游默认 20971520 → 52428800，`attachment-local.maxImageDimension` 8192 → 65535，功能 8 清单两处跟着改。
- desktop 侧升级记录（`dsh-desktop` 提交 87d1d4b，`docs/handoff/107-upgrade-0.2.2-alpha.2.md`）：`PROFILE_TEMPLATES` 从 `dsh-app-boot` 迁到 `@deepseek-ai/dsh-official-bundles`，cordis 家族收敛到 `4.0.6-alpha.1` 线；secret-guard 的 `ctx.tools.guard` / `guardBash` 挂点与源码未变，本插件没有相应改动。

## 本轮改动

### 代码

- [src/find/index.js](src/find/index.js)：新增 `revealMatch(range, parent)`，跳转时按命中自己的 `getBoundingClientRect()` 量位移，由内向外滚动每个 `overflow-y` 为 `auto`/`scroll` 且 `scrollHeight > clientHeight + 1` 的祖先；一个可滚动祖先都没有才退回父元素的 `scrollIntoView({ block: 'center' })`。
- [src/harness-config/catalog-model.js](src/harness-config/catalog-model.js)：`attachment-local` 两处默认值跟随上游（52428800、65535）。

### 验证脚本

- [scripts/verify-selection-menu-live.mjs](scripts/verify-selection-menu-live.mjs)：复制图标判据改为比完整图标签名——`data-icon`、`<use href>`、`viewBox`、`width`/`height`、全部 `path[d]`，并要求签名非空（`empty === false`）；断言名改为「图标标识 + 尺寸 + 矢量」。
- [scripts/verify-find-live.mjs](scripts/verify-find-live.mjs)：`ACTIVE_RECT` 改量 `range.getBoundingClientRect()`（命中文本自己的矩形），判 `top >= 0 && bottom <= innerHeight && width > 0`，并输出 `top`/`bottom` 便于定位。
- [scripts/verify-row-states-live.mjs](scripts/verify-row-states-live.mjs)：截图 `clip.x` 夹到 `Math.max(0, multi.x - 12)`，取样坐标仍按真实几何映射。

### 文档

- [README.md](README.md)：「当前兼容版本」锚点改 0.2.2-alpha.2，历史验证记录补 0.2.1-rc.3 与 0.2.1-rc.1。
- [docs/feature-11-find.md](docs/feature-11-find.md)：跳转机制改成按命中矩形滚动可滚动祖先的现状描述。
- [docs/verify.md](docs/verify.md)：菜单与复制图标的判据补上 sprite 标识（`data-icon` 与 `<use href>`），并写明只比 `viewBox`/`path[d]` 会在 0.2.2 上假通过。

## 验证结果（真实运行输出）

- `node scripts/check-catalog-schema.mjs`：**PASS 全部字段与上游 schema 一致**（`dsh=0.2.2-alpha.2`、`profile=web`，19 卡 / 83 字段）。
- `node --test tests/*.test.mjs`：**tests 46 / pass 46 / fail 0**。
- 构建：`DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop node scripts/build.mjs` → `lib/client.js + lib/index.js built`。
- **九套 live 串行，合计 211 条，全部 `failed=0 skipped=0`、退出码 0**（日志在 `tmp/adapt-0222/`）：

| 套件 | 末行 summary |
| --- | --- |
| `verify:timestamps` | `passed=10 failed=0 skipped=0 total=10` |
| `verify:dot` | `passed=21 failed=0 skipped=0 total=21` |
| `verify:selection` | `passed=20 failed=0 skipped=0 total=20` |
| `verify:chat-history` | `passed=16 failed=0 skipped=0 total=16` |
| `verify:find` | `passed=19 failed=0 skipped=0 total=19` |
| `verify:row-states` | `passed=35 failed=0 skipped=0 total=35` |
| `verify:provider-band` | `passed=29 failed=0 skipped=0 total=29` |
| `verify` | `passed=29 failed=0 skipped=0 total=29` |
| `verify:settings` | `passed=32 failed=0 skipped=0 total=32` |

关键读数：

- 复制图标：`{"page":{"icon":"dsw-icon-copy-outline-regular","href":"#dsw-icon-copy-outline-regular","viewBox":null,"width":"16","height":"16","paths":[]},"menu":{同左},"same":true,"empty":false}`。
- 查找跳转：`{"inViewport":true,"height":16,"top":458,"bottom":474}`；独立压测连跳 24 次（会话含 4742px 高的可滚动正文容器），命中越界 0 次。
- 多选描边像素与解析色同源：`pixel=[135,169,253]`、`spread=0`；内侧填充 `pixel=[41,52,82]` vs 合成值 `[41,53,82]`、`coverage=158/170`；多选描边 vs 侧边栏底色 7.48:1、vs 内侧填充 5.34:1。
- `verify:settings` 真写副本 patch 后自动 `restart` 成功，后续套件照常连上。

## 未做

- **上游发行包只做到定向对读，不是全量逐字节**：0.2.1-rc.3 → 0.2.2-alpha.2 共 260 个包有变化，本轮对 12 个关键包（`dsh-app-boot`、`dsh-web-app` 的 patch、`webserver`、`client-modules`、`chat-client`、`theme-client`、`ws-client`、`settings-general`、`model-selection`、`remote-access`、`profile-boot`）生成了逐文件 diff（`tmp/adapt-0222/upstream-diff/logs/`）。据此确认：`PROFILE_TEMPLATES` 确实迁到 `@deepseek-ai/dsh-official-bundles`；本插件依赖的主题 token 原样保留（含 `--dsw-alias-menu-group-header-fill`、`--dsw-alias-bg-multi-select`、`--dsw-alias-brand-primary-new-colorprimary-new-color`）；`data-conversation-scroll` 仍在使用；会话行的 `aria-selected` 语义未变（新增了 `tabIndex`/`onKeyDown`）。sprite 图标的渲染变化不在这 12 份 diff 的改动行里，只在运行页面观察到。其余 248 个包没有逐文件对读，未被 live 覆盖的上游变化不能断言不存在。
- `verify:row-states` 的第三方主题现场（`DSH_OI_KEEP_THEME_PLUGIN=1`）本轮未跑：它验的是平色守卫的 SKIP 分支，与锚定切换正交。
- 真 Electron 客户端的手势与 accelerator 层（shell 抢键、观感）没有重复验证，沿用 `docs/verify.md` 已记录的覆盖边界。

## 坑

- **测试栈必须与九套 live 在同一条 bash 调用里**。沙箱每条调用是独立的 PID 与 `/tmp` 命名空间：把栈放进常驻后台 job 后，TCP 仍通，单文件 verify 也能过，但 `verify` 的 `workspaces.create` 会因 `/tmp` 里的靶子目录对 harness 不可见而报 `ENOENT realpath`，`verify:settings` 的 restart 也杀不掉旧进程、报 `3181 已被占用`。正确做法是 runner 在同一个调用里先 `stack up` 再串行跑九套；常驻栈只适合跑单个脚本的调试。
- `stack:up` 的 rsync 会对测试栈 home 里残留的靶子会话报 `cannot delete non-empty directory`，是增量同步噪声，副本仍就绪。
- 判断真实 harness 版本看 desktop 打包树的 `@deepseek-ai/dsh/package.json`；`DSH_TEST_BIN` 会带偏 `check:catalog`，跑之前先确认没被环境变量指到别处。
