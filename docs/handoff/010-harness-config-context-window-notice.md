# 010 · 「Harness 高级配置」上下文窗口口径说明

状态：完成（用户已确认）。

## 背景与查证结论

用户质疑面板「默认上下文窗口（token）」（默认 1,000,000）与实际行为不符：pi-ai 链路上未声明窗口的模型实际落 262,144。查证源码（deepseek-harness checkout，均相对 `packages/llm/`）确认两套默认互不相通：

- `llm-deepseek/src/common/defaults.ts:6` 定义 1M；消费点 `llm-deepseek/src/common/model-info.ts:67`，只兜该连接 `models` 列表里的模型（`config.ts:87`），官方两模型在 `common/models.ts` 里显式声明 1M。
- `llm-pi-ai/src/config.ts:64` 定义 262,144；取值链 `catalog.ts:901`：模型条目 → pi-ai 已安装目录 → 路由 `defaultContextWindow`。路由 schema 按 `providers.<route>` 逐条定义（`config.ts:322-330, 348-349`），不存在全局键。
- pi-ai 已安装目录数据在 `@earendil-works/pi-ai` 包 `dist/providers/data/*.json`：xiaomi 全系目录里 mimo-v2.5 / v2.5-pro 显式 1,048,576；mimo-v2.6 不在目录（pi-ai 0.84.2），故用户自配 `xiaomi-token-plan/mimo-v2.6-*` 落 256K。
- 「获取可用模型」（`llm-pi-ai/src/discovery.ts`）读 `GET /models` 时接受网关扩展字段里的 contextWindow，但仅作候选元数据、不落盘；运行时取值链没有 /models 这一级，只有设置页点「采纳」写入模型条目后才生效。

## 本次改动

- `src/harness-config/catalog-model.js`：「DeepSeek 模型接入」条目新增 `notice` 字段（作用域警告）；`defaultContextWindow` 的 help 补「只兜 DeepSeek 官方接入里的模型；pi-ai 路由上手配的模型不读本卡（见顶部黄条）」。
- `src/client/settings/panel.jsx`：面板顶部新增黄条（`settings.piNotice`，复用 `__warn` 色对）；`EntryCard` 渲染可选 `entry.notice` 为卡内黄条。
- `src/shared/locale.js`：新增 `settings.piNotice` 中英词典键。
- `lib/index.js`、`lib/client.js` 经 `DSH_ESBUILD_ROOT=<harness checkout> npm run build` 重建。

## 验证

- `npm test` 4/4 过。
- 测试栈（stack:up，独立 DSH_HOME + 3181 端口）上一次性 CDP 探针实测：notice 以 `__warn` 黄条渲染在 cardDesc 之后独立成行，渲染色 `rgb(221,134,41)`、背景 `rgb(39,36,31)`；顶部黄条存在；description 不含旧长句。探针脚本已删除。
- `npm run verify:settings` 17/17 全绿（改后复跑）。
- 未做：「不做全局 defaultContextWindow 扇出功能」为用户明确决策，未实现。视觉效果经用户确认无误。
