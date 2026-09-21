# 008 harness 0.1.6-alpha.2 全功能兼容性检测

- 目标：逐项检测九项功能在 0.1.6-alpha.2 上的兼容性——npm test、构建、七个 verify 脚本全量实跑；每条失败分诊为「插件不兼容 / 验证脚本漂移 / 环境问题」，属于测试基础设施漂移的修复到能跑。验收方式：全量套件实跑读数记入 [harness-v0.1.6-alpha.2-adaptation-report.md](../../harness-v0.1.6-alpha.2-adaptation-report.md)，`echo $?` 与 summary 计数为准。
- 背景：007 期间经用户授权重建了 deepseek-harness dev 仓（tsc --force + build:lib + build:web），测试栈 harness 自此运行 0.1.6-alpha.2；挪出的孤儿构建残留在 `/tmp/deepseek-harness-stale-pkgs-20260920`。

## 进展

- 版本事实：两路 CLI `--version` 均 0.1.6-alpha.2（dev 仓 apps/cli 与 desktop dist）。
- 全量套件实跑（tmp/compat-suite.log、tmp/bisect*.log、tmp/healthy-run.log 一轮 + 逐脚本健康探针）；分诊结论全部落报告。
- 判定：**功能 2（fork 的 `sessions.open` 已从 ISessions 契约消失）与功能 9（`SessionListState.current` 被移除，选择搬进 ui-workspace 内部 navigation store）不兼容**；1/4/5/6/7/8/10 兼容（4 有一处死锚点、6 待脚本适配后复证）。
- 已修的验证脚本漂移：`verify-live.mjs` 与 `verify-timestamps-live.mjs` 的注入桩补平台模块表（react/jsx-runtime/primitives，「被调到即抛」设计）。未修：dot C 组翻主题、selection 找 textarea、timestamps 的 upstreamTimes 锚点——随功能修复一起动。
- 排查中排除的假设：宿主空闲卸载（静置 5 分钟 28 行不减）、「连点会话杀列表」（点完 28 行后探针 flow 20 正常）；「侧栏清空」现象只出现过一次、重启 harness 恢复，记为观察项。

## 决策与理由

- README「当前已兼容版本」不加 0.1.6-alpha.2——功能 2/9 未修复前加了就是假声明。
- 功能 9 修复方向选 DOM 派生（aria-selected + rowId + MutationObserver）而不是逆向内部 store：navigation store 无服务令牌、persist 键同页无事件，DOM 路径与插件既有架构同构且功能 10 已验证该属性跨版本稳定。

## 未完成项 / 遗留

- 功能 2/9 的适配实现（修复方向已写入报告，等用户批准后另开交接）。
- 验证脚本剩余三处漂移（dot C 组 / selection composer / timestamps 锚点谓词）。
- 观察项：侧栏列表清空现象未复现第二次，未定位。
