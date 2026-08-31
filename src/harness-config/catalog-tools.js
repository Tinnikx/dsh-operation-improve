/**
 * 清单的前半：**工具与执行预算**——模型跑起来时那些约束它一轮能做多少事的键。
 * 收录口径与拼装顺序在 [catalog-entries.js](catalog-entries.js)。
 */

import { MAX_TIMER_DELAY_MS, PRUNE_MARKER_CHARS } from './catalog-limits.js'

/** @type {readonly object[]} */
export const TOOL_ENTRIES = [
  {
    id: 'compaction-basic',
    title: '上下文压缩',
    plugin: '@deepseek-ai/dsh-compaction-basic',
    description: '会话逼近上下文上限时自动压缩历史。阈值与保留比例决定压得多早、留得多少。',
    fields: [
      {
        key: 'auto', type: 'boolean', default: true,
        label: '自动压缩', help: '关掉后只能手动触发压缩。',
      },
      {
        key: 'thresholdRatio', type: 'number', default: 0.8, min: 0, max: 1, exclusive: true,
        label: '触发阈值比例', help: '占模型上下文窗口的比例，超过就开始压缩。',
      },
      {
        key: 'retainRatio', type: 'number', default: 0.16, min: 0, max: 1, exclusive: true,
        label: '保留比例', help: '压缩后保留的近期内容比例，必须小于触发阈值比例。',
      },
      {
        key: 'maxTokens', type: 'integer', default: 8192, min: 1,
        label: '摘要 token 上限', help: '生成摘要时给模型的输出上限，不能超过所选模型的输出上限。',
      },
      {
        key: 'compactionRetries', type: 'integer', default: 1, min: 0,
        label: '压缩重试次数', help: '一次压缩后仍超阈值时的额外尝试次数。',
      },
      {
        key: 'maxOverflowRetries', type: 'integer', default: 1, min: 0,
        label: '溢出重试次数', help: '请求因超长被拒时的额外尝试次数。',
      },
    ],
    crossRules: [
      {
        kind: 'lessThan', field: 'retainRatio', than: 'thresholdRatio',
        message: '保留比例必须小于触发阈值比例，否则 compaction-basic 加载失败。',
      },
    ],
  },
  {
    id: 'tool-result-pruner',
    title: '工具结果裁剪',
    plugin: '@deepseek-ai/dsh-compaction-tool-result-pruner',
    description: '超长工具输出只保留头尾，中间替换成一行省略标记。',
    fields: [
      {
        key: 'thresholdChars', type: 'integer', default: 8192, min: 1,
        label: '裁剪阈值（字符）', help: '工具输出超过这么多码点才裁剪。',
      },
      {
        key: 'headChars', type: 'integer', default: 4096, min: 0,
        label: '保留开头（字符）', help: '',
      },
      {
        key: 'tailChars', type: 'integer', default: 1024, min: 0,
        label: '保留结尾（字符）', help: '',
      },
    ],
    crossRules: [
      {
        kind: 'sumAtMost', fields: ['headChars', 'tailChars'], plus: PRUNE_MARKER_CHARS,
        atMost: 'thresholdChars',
        message: `保留开头 + 保留结尾 + 省略标记（${PRUNE_MARKER_CHARS} 字符）不能超过裁剪阈值，否则 tool-result-pruner 加载失败。`,
      },
    ],
  },
  {
    id: 'spill-policy',
    title: '大块内容外溢',
    plugin: '@deepseek-ai/dsh-spill-policy',
    description: '超过阈值的内容不再内联进会话，改为落盘引用。',
    fields: [
      {
        key: 'maxInlineBytes', type: 'integer', default: 50000, min: 1,
        label: '内联上限（字节）', help: '超过就外溢到存储，会话里只留引用。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'tool-str-replace-editor',
    title: '文件编辑工具',
    plugin: '@deepseek-ai/dsh-tool-str-replace-editor',
    description: '读文件 / 改文件工具单次返回的体量上限。',
    fields: [
      {
        key: 'maxOutputChars', type: 'integer', default: 16000, min: 1,
        label: '单次输出上限（字符）', help: '',
      },
    ],
    crossRules: [],
  },
  {
    id: 'tool-ralph',
    title: '子代理循环（ralph）',
    plugin: '@deepseek-ai/dsh-tool-ralph',
    description: '让模型把一件事拆成多轮交给子代理跑。',
    fields: [
      {
        key: 'maxRounds', type: 'integer', default: 64, min: 1,
        label: '最大轮数', help: '一次 ralph 调用允许的循环轮数上限。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'tool-todo',
    title: '待办工具',
    plugin: '@deepseek-ai/dsh-tool-todo',
    description: '模型自己维护的任务清单。',
    fields: [
      {
        key: 'allowParallelInProgress', type: 'boolean', default: true,
        label: '允许多个进行中', help: '关掉后同一时刻只允许一条待办处于进行中。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'repeat-tool-reminder',
    title: '重复调用提醒',
    plugin: '@deepseek-ai/dsh-repeat-tool-reminder',
    description: '同一个工具连续用同样参数调用时插入提醒。',
    fields: [
      {
        key: 'thresholds', type: 'integer-list', default: [3, 5, 8], min: 1,
        label: '提醒次数点', help: '递增的正整数，逗号分隔；在第几次重复时提醒。',
      },
      {
        key: 'argumentsPreviewChars', type: 'integer', default: 500, min: 1,
        label: '参数预览长度（字符）', help: '',
      },
    ],
    crossRules: [
      { kind: 'increasing', field: 'thresholds', message: '提醒次数点必须严格递增。' },
    ],
  },
  {
    id: 'tool-web',
    title: '联网搜索工具',
    plugin: '@deepseek-ai/dsh-tool-web',
    description: '只暴露搜索超时。抓取（fetch）被上游刻意关掉，面板不提供开关。',
    fields: [
      {
        key: 'searchTimeoutMs', type: 'integer', default: 60000, min: 1,
        label: '搜索超时（毫秒）', help: '',
      },
    ],
    crossRules: [],
  },
  {
    id: 'agent-loop',
    title: '代理主循环',
    plugin: '@deepseek-ai/dsh-agent-loop',
    description: '模型一轮里能同时发出几个工具调用。',
    fields: [
      {
        key: 'maxParallelToolCalls', type: 'integer', default: 10, min: 1,
        label: '并行工具调用上限', help: '同一轮里最多同时在跑的工具数，超出的排队。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'goal',
    title: '目标（goal）',
    plugin: '@deepseek-ai/dsh-goal',
    description: '模型把一件事登记成 goal 之后自动推进的轮数上限。',
    fields: [
      {
        key: 'defaultMaxGoalRounds', type: 'integer', default: 256, min: 1,
        label: '默认最大轮数', help: '创建 goal 时没单独指定轮数就用它。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'jobs',
    title: '后台任务',
    plugin: '@deepseek-ai/dsh-jobs-local',
    description: '后台跑的命令与子代理共用同一份并发额度。',
    fields: [
      {
        key: 'maxConcurrentJobsPerOwner', type: 'integer', default: 10, min: 1,
        label: '每个所有者并发上限', help: '超过后新任务直接被拒，不排队。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'bash-sandbox',
    title: 'Bash 工具',
    plugin: '@deepseek-ai/dsh-bash-sandbox',
    description: '模型跑 shell 命令时的超时、输出与外溢预算。',
    fields: [
      {
        key: 'timeoutMs', type: 'integer', default: 120000, min: 1,
        label: '默认超时（毫秒）', help: '模型没指定超时时用它，且会被最大超时截断。',
      },
      {
        key: 'maxTimeoutMs', type: 'integer', default: 600000, min: 1,
        label: '最大超时（毫秒）', help: '模型自己指定的超时也不会超过这个值。',
      },
      {
        key: 'maxOutputBytes', type: 'integer', default: 64000, min: 1,
        label: '输出上限（字节）', help: '超出的部分落到外溢文件里。',
      },
      {
        key: 'maxSpillBytes', type: 'integer', default: 67108864, min: 1,
        label: '外溢文件上限（字节）', help: '',
      },
      {
        key: 'graceMs', type: 'integer', default: 3000, min: 1, max: MAX_TIMER_DELAY_MS,
        label: 'SIGTERM 宽限（毫秒）', help: '超时后先发 SIGTERM，等这么久再 SIGKILL。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'pwsh-sandbox',
    title: 'PowerShell 工具',
    plugin: '@deepseek-ai/dsh-pwsh-sandbox',
    description: '与 Bash 工具同构的一套预算，只在装了 PowerShell 的机器上用得上。',
    fields: [
      {
        key: 'timeoutMs', type: 'integer', default: 120000, min: 1,
        label: '默认超时（毫秒）', help: '模型没指定超时时用它，且会被最大超时截断。',
      },
      {
        key: 'maxTimeoutMs', type: 'integer', default: 600000, min: 1,
        label: '最大超时（毫秒）', help: '模型自己指定的超时也不会超过这个值。',
      },
      {
        key: 'maxOutputBytes', type: 'integer', default: 64000, min: 1,
        label: '输出上限（字节）', help: '超出的部分落到外溢文件里。',
      },
      {
        key: 'maxSpillBytes', type: 'integer', default: 67108864, min: 1,
        label: '外溢文件上限（字节）', help: '',
      },
      {
        key: 'graceMs', type: 'integer', default: 3000, min: 1, max: MAX_TIMER_DELAY_MS,
        label: 'SIGTERM 宽限（毫秒）', help: '超时后先发 SIGTERM，等这么久再 SIGKILL。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'skill',
    title: '技能（skill）',
    plugin: '@deepseek-ai/dsh-skill',
    description: '技能目录扫描结果的缓存条数。',
    fields: [
      {
        key: 'collectCacheMaxEntries', type: 'integer', default: 128, min: 1,
        label: '扫描缓存条数上限', help: '',
      },
    ],
    crossRules: [],
  },
]
