# 026 harness 0.2.1-rc.3 适配

- 目标：在 0.2.1-rc.3 上重跑单测、catalog 门禁与九套 live 验证；全绿后把 README 与知识库的「锚定 harness」改成 0.2.1-rc.3。验收方式是命令退出码与末行 summary，不是「能跑起来」。
- 范围：只做版本适配与验证。不改功能行为、不重构；验证暴露漂移时才动代码。

## 进展

- 已验证：安装的 harness 是 0.2.1-rc.3（`dsh-desktop/dist/desktop/dsh-linux-x64/resources/app/node_modules/@deepseek-ai/dsh/package.json`，构建于 10-25）；插件装在同一 profile。
- 已验证：`node --test tests/*.test.mjs` → 46 pass / 0 fail。
- 已验证：`node scripts/check-catalog-schema.mjs` → PASS，19 卡 / 83 字段（bin 取自 `resolveHarnessBin()`，不是 dev 工作区的旧构建）。
- 已验证：测试栈 `stack:up` 就绪（harness 3181、CDP 9334、home `tmp/dsh-oi-test-home`，副本名册剥掉 13 个第三方 bundle）。
- 已验证：九套 live 全绿，末行 summary 均为 `failed=0 skipped=0`——verify 29/29、timestamps 10/10、dot 21/21、selection 20/20、chat-history 16/16、find 19/19、row-states 35/35、provider-band 29/29、settings 32/32，合计 211。
- 已验证：关键读数与文档一致：dot 浅色底环 `rgb(115,158,172)` / 2.91、亮环 `rgb(21,94,117)` / 7.27；provider-band 深色横线 5.37 / 浅 4.15、底带 1.22 / 1.06；row-states 多选填充 24%、彗尾 2.4s、错峰 `0/-0.8s/-1.6s`、reduced-motion `display:none`。
- 已验证：功能 8「会话检索」写入未复现 0.1.6-alpha.2 的热重挂缺陷——`1b` 读到 loader 配置当场更新（2050ms），`13c` 读到侧栏仍有 51 行会话。
- 已验证：`README.md:22` 锚点改成 0.2.1-rc.3；知识库 `README.md` 的「锚定 harness」行与功能 8、验证两篇的热重挂口径按 rc.3 复测更新。
- 未做：`verify` 的间歇性红本次没有出现（29 条一次跑过），未做定向复现；rc.3 是否已在上游修复热重挂缺陷没有上游声明可查。

## 决策与理由

- 锚点从 rc.1 改到 rc.3：九套 live 与单测在 rc.3 上全绿、catalog 19/83 通过，说明 DOM 结构、slot 条目与样式哈希都没有漂移。
- 面板的 `session-query-sqlite` 仍标 `'restart'`：复测只覆盖了面板路由，手改 patch 文件走的是同一个 watcher 但没有单独测；拿到上游修复证据前保持止损口径。

## 测试cases

全部实跑，读数见「进展」：

- `npm test` → 46 pass
- `npm run verify` → 29/29
- `npm run verify:dot` → 21/21
- `npm run verify:selection` → 20/20
- `npm run verify:chat-history` → 16/16
- `npm run verify:timestamps` → 10/10
- `npm run verify:row-states` → 35/35
- `npm run verify:find` → 19/19
- `npm run verify:provider-band` → 29/29
- `npm run verify:settings` → 32/32（真写测试栈副本的 patch 字节并自动 restart）
- `npm run check:catalog` → 19 卡 / 83 字段

## 未完成项与下一步

1. 等用户确认后把索引行状态改成「完成」（仓库约定：完成需用户确认）。
2. 两批次提交：批次 1 是文档事实订正 `ef0c87b`；批次 2 提交本记录、rc.3 锚点与热重挂口径。

## 坑

- `check:catalog` 比的是 `resolveHarnessBin()` 解析到的发行包；设了 `DSH_TEST_BIN` 会指到别处，改锚点前先确认没被环境变量带偏。
- 每条 bash 调用是独立命名空间，后台进程用 `node scripts/test-stack.mjs status` 判断，不要用 `ps` 看。
- 测试栈 home 是 `tmp/dsh-oi-test-home` 副本；真 home 的第三方 bundle 会占侧栏单槽、改主题、弹引导框，复现它们要用 `DSH_OI_KEEP_EXTRA_PLUGINS=1` / `DSH_OI_KEEP_THEME_PLUGIN=1`。
- `verify:settings` 跑完会自动 restart 测试栈；接着跑其他套前先 `npm run stack:status`。
