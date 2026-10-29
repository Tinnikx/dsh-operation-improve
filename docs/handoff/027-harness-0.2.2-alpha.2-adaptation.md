# 027 harness 0.2.2-alpha.2 适配

- 目标：把插件锚定从 0.2.1-rc.3 换到 0.2.2-alpha.2，并在该版本上重跑单测、catalog 门禁与九套 live 验证；验收是命令退出码与末行 summary，不是「能跑起来」。发现漂移就改到与上游一致。
- 范围：只做版本适配与验证。不改功能行为、不重构；验证暴露漂移时才动代码、判据与对应文档。

## 进展

- 已验证：产品打包树的 harness 是 0.2.2-alpha.2（`dsh-desktop/dist/desktop/dsh-linux-x64/resources/app/node_modules/@deepseek-ai/dsh/package.json`），`check:catalog` 打印的 `dsh=0.2.2-alpha.2` 取自同一份。
- 已验证：测试栈 `stack:up` 就绪（harness 3181、CDP 9334、home `tmp/dsh-oi-test-home`），启动日志 `本插件在名册里=true`；副本剥掉 13 个第三方 bundle。
- 已验证：`node --test tests/*.test.mjs` → 46 pass / 0 fail。
- 已验证：`check:catalog` PASS，19 卡 / 83 字段。适配前它报 2 处漂移——`attachment-local.maxImageBytes` 上游默认 52428800、`attachment-local.maxImageDimension` 上游默认 65535；清单两处已跟随上游。
- 已验证：九套 live 串行全绿，逐套末行 summary 与退出码（日志在 `tmp/adapt-0222/`）：`verify:timestamps` 10/0/0、`verify:dot` 21/0/0、`verify:selection` 20/0/0、`verify:chat-history` 16/0/0、`verify:find` 19/0/0、`verify:row-states` 35/0/0、`verify:provider-band` 29/0/0、`verify` 29/0/0、`verify:settings` 32/0/0，合计 211 条，退出码全 0。
- 已验证：九套暴露并修掉的 0.2.2 漂移——① 上游图标改成 sprite 引用（`data-icon` + `<use href>`，`viewBox=null`、无 `path[d]`），复制图标判据改成比完整签名并要求非空；② 侧栏行移到 x=8，功能 10 的截图 `clip.x = multi.x - 12` 变负，Chrome 静默改从页面原点截图，读数全落在侧栏外底色，`clip.x` 夹到 0；③ 功能 11 命中文本的父元素可能是整块正文容器（实测最近可滚动祖先 4742px），居中父元素后命中仍在视口外（实测 `top=1217`、视口 857），改为按命中矩形滚动可滚动祖先。
- 已验证：`verify:settings` 真写测试栈副本 patch 后自动 `restart` 成功；九套同一调用内串行时后面的套件照常连上。
- 已验证：README「当前兼容版本」锚点改 0.2.2-alpha.2，历史记录补 0.2.1-rc.3 / 0.2.1-rc.1；[docs/feature-11-find.md](../feature-11-find.md) 与 [docs/verify.md](../verify.md) 同步到 0.2.2 的实测口径；本轮报告写在 [harness-v0.2.2-alpha.2-adaptation-report.md](../../harness-v0.2.2-alpha.2-adaptation-report.md)。

## 决策与理由

- catalog 两处默认值跟随上游，不按「保留防呆」收紧：面板的默认值是给用户看「系统现在是什么值」的，写小会显示一个上游并不使用的默认值；这两项也没有安全含义，收紧只会让界面说谎。
- 复制图标判据比完整签名（`data-icon`、`<use href>`、`viewBox`、尺寸、全部 `path[d]`）而不是只比 sprite id：换实现（精灵/内联/外部 symbol）都落进同一个签名，同时 `empty === false` 拦住「两边都空也算相等」的假通过。
- 功能 11 跳转不用「找最近的块级祖先再 `scrollIntoView`」：命中所在的父元素高度取决于上游模板与内容长度，找不到稳定阈值；按命中自己的矩形量位移、把所有能纵向滚动的祖先都调到居中，才不依赖上游的 DOM 层级。
- `verify:find` 的 `inViewport` 改量命中文本自己的 `Range` 矩形：用户看见的是那条高亮，父元素整块装不装得进视口与跳转是否成功无关。

## 测试cases

- `$HOME/.dsh/desktop-bin/node-shim/node --test tests/*.test.mjs` → 46 pass / 0 fail
- `node scripts/check-catalog-schema.mjs` → PASS（19 卡 / 83 字段）
- 九套 live（同一 bash 调用内 `stack up` + 串行）：`verify`、`verify:timestamps`、`verify:dot`、`verify:selection`、`verify:chat-history`、`verify:find`、`verify:row-states`、`verify:provider-band`、`verify:settings` → 211 条全绿
- 定向压测：查找条连跳 24 次、会话含 4742px 高的可滚动正文容器 → 命中越界 0 次

## 未完成项与下一步

1. 由用户确认本轮适配完成，再把索引行状态改「完成」。
2. 上游发行包做过 12 个关键包的逐文件 diff（`PROFILE_TEMPLATES` 迁移、主题 token、`data-conversation-scroll`、`aria-selected` 均确认无碍），260 个包中其余部分没有逐文件对读；未被 live 覆盖的上游变化不能断言不存在。
3. `verify:row-states` 的第三方主题现场（`DSH_OI_KEEP_THEME_PLUGIN=1`）本轮未跑。

## 坑

- **测试栈必须与九套 live 在同一条 bash 调用里**。沙箱每条调用是独立的 PID 与 `/tmp` 命名空间：把栈放进常驻后台 job 后，TCP 仍通、单文件 verify 也能过，但 `verify` 的 `workspaces.create` 会因靶子目录对 harness 不可见而报 `ENOENT realpath`，`verify:settings` 的 restart 也杀不掉旧进程、报 `3181 已被占用`。
- 本机默认 PATH 上没有 `node` 也没有 `npm`；用 `$HOME/.dsh/desktop-bin/node-shim/node` 直接调脚本，不要照抄文档里的 `npm run`（那条要额外把 nvm 的 bin 放进 PATH）。
- `stack:up` 的 rsync 会对 `sessions/` 下测试栈残留的靶子会话报 `cannot delete non-empty directory`，这是增量同步噪声，不影响副本就绪。
