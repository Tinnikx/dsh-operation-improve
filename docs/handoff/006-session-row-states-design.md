# 006 sessionRow 选中态强化 + 运行中光线边框设计稿

- 目标：出两方面的设计图——(1) 当前打开会话的选中行表现太弱（harness 原生约 12% 灰底，和 hover 8% 灰分不开）；(2) 有任务运行中的 sessionRow 整体加科技感、光线律动的边框。交付物是可直接在浏览器打开的状态样机 [docs/design/session-row-states.html](../design/session-row-states.html)，含现状对比、状态矩阵、叠加规则和交接 token 表。验收方式：浏览器打开该文件，选中态前后对比可辨、彗尾沿行轮廓扫动、多行错峰、glow 随动。
- 范围：仅新增设计样机文件，不改插件源码、不动 harness。实现（若批准）另起交接。

## 设计要点

- 信号色单一族：青 `rgb(34,211,238)`（深色）/ `rgb(21,94,117)`（浅色），与功能 5 的 `--dsh-state-ongoing` 同值；选中与运行中共用色相、靠形态区分。
- 选中态：左侧 3px 青竖条（top/bottom 内缩 20%）+ 10% 青填充 + 标题 600 字重 + 时间提亮；hover 保持 8% 灰、弱于选中。
- 运行中边框三层：1px 常亮静默底边（rgba .15，静态可识别）→ conic-gradient 彗尾沿轮廓扫 2.4s linear（`@property --sweep` + `mask-composite: exclude` 只描边）→ blur(6px) 辉光子元素随动（伪元素位留给竖条与边框）。
- 错峰：多行运行时按序取 -1/3、-2/3 周期负延迟，整列不同步。
- 降级：`prefers-reduced-motion` 下彗尾/辉光/追逐点全停，静默底边常亮即完成识别。
- 叠加规则：多选蓝（rgba(77,107,254,.22)，插件既有）不动，可与选中青条同现；选中+运行时填充提到 .14，竖条 z 序在边框之上。
- 性能口径：conic-gradient 扫描是重绘非合成层，仅运行中行参与动画；实测掉帧则降级为底边 opacity 呼吸。

## 验证

- 无头 Chrome 截图核对渲染：选中态对比、彗尾、辉光、叠加矩阵均按设计呈现。
- 动画推进无法跨进程截图对比（每次启动从 0° 开始），改用延迟偏移法：对无错峰行强加 `-1.2s`（半周期）后彗尾从顶边移到底边，证明角度变量驱动视觉位置、扫动路径有效。keyframes 本身是标准 `@property` 注册动画，静态推理成立。
- 未在真实 harness 上验证（设计稿阶段，产品侧 DOM 信号以 [src/shared/row-probe.js](../../src/shared/row-probe.js) 记录的 `[class*="_sessionRow"]` 与 [src/active-dot/index.js](../../src/active-dot/index.js) 的 `svg[data-state='ongoing']` 为准）。

## 假设与遗留

- 假设：「被选中的 sessionRow」指当前打开的会话行（harness 原生态），不是插件的多选态——多选蓝在样机里单独保留并演示了叠加。用户已确认按此理解实现。
- 遗留：实现交接由 007 承接；浅色主题只给了信号色值，填充/底边透明度需在真实浅色主题上复核。

## 完成

用户确认「按这个设计图实现」（设计样机验收方式：浏览器打开可辨选中对比、彗尾扫动、错峰与叠加矩阵）。实现与 live 验证见 [007-row-states-implementation.md](007-row-states-implementation.md)。
