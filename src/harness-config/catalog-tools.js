/**
 * 清单的第一组：**工具与执行预算**——模型跑起来时那些约束它一轮能做多少事的键。
 * 收录口径与拼装顺序在 [catalog-entries.js](catalog-entries.js)。
 */

import { MAX_TIMER_DELAY_MS } from './catalog-limits.js'

/** @type {readonly object[]} */
export const TOOL_ENTRIES = [
  {
    id: 'spill-policy',
    title: '大块内容外溢',
    plugin: '@deepseek-ai/dsh-spill-policy',
    effect: 'immediate',
    description: '工具结果按估算 token 给保留预算，超出的部分外溢为可恢复引用。',
    fields: [
      {
        // 上游 schema 这一枚是 `z.number()`，无 `minimum`——连负数与小数都不拒（`npm run
        // check:catalog` 对得上 dump）。这里的 `type: 'number'` 就是上游的类型；`min: 1`
        // 是**面板防呆**而非上游硬抛：预算 0 意味着整条结果都外溢，而外溢提示本身放不下
        // 时上游在该工具结果落地那一刻抛错（不是加载时），故面板把非正数挡在写盘之前。
        key: 'maxInlineTokens', type: 'number', default: 12500, min: 1, effect: 'immediate',
        label: '内联上限（估算 token）', help: '超过就把超出部分外溢到存储，会话里留提示与可恢复引用；预算太小连那条提示都放不下，会在结果超预算时抛错。不写这个键＝不启用外溢。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'repeat-tool-reminder',
    title: '重复调用提醒',
    plugin: '@deepseek-ai/dsh-repeat-tool-reminder',
    effect: 'session',
    description: '同一个工具连续用同样参数调用时插入提醒。',
    fields: [
      {
        key: 'thresholds', type: 'integer-list', default: [3, 5, 8], min: 1, effect: 'session',
        label: '提醒次数点', help: '递增的正整数，逗号分隔；在第几次重复时提醒。',
      },
      {
        key: 'argumentsPreviewChars', type: 'number', default: 500, min: 1, effect: 'session',
        label: '参数预览长度（字符）', help: '',
      },
    ],
    crossRules: [
      { kind: 'increasing', field: 'thresholds', message: '提醒次数点必须严格递增。' },
    ],
  },
  {
    id: 'bash-sandbox',
    title: 'Bash 工具',
    plugin: '@deepseek-ai/dsh-bash-sandbox',
    effect: 'immediate',
    description: '模型跑 shell 命令时的超时、输出与外溢预算。',
    fields: [
      {
        key: 'timeoutMs', type: 'number', default: 120000, min: 1, effect: 'immediate',
        label: '默认超时（毫秒）', help: '模型没指定超时时用它，且会被最大超时截断。',
      },
      {
        key: 'maxTimeoutMs', type: 'number', default: 600000, min: 1, effect: 'immediate',
        label: '最大超时（毫秒）', help: '模型自己指定的超时也不会超过这个值。',
      },
      {
        key: 'maxOutputBytes', type: 'number', default: 64000, min: 1, effect: 'immediate',
        label: '输出上限（字节）', help: '超出的部分落到外溢文件里。',
      },
      {
        key: 'maxSpillBytes', type: 'number', default: 67108864, min: 1, effect: 'immediate',
        label: '外溢文件上限（字节）', help: '',
      },
      {
        key: 'graceMs', type: 'number', default: 3000, min: 1, max: MAX_TIMER_DELAY_MS, effect: 'immediate',
        label: 'SIGTERM 宽限（毫秒）', help: '超时后先发 SIGTERM，等这么久再 SIGKILL。已在跑的命令仍按旧值计时。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'pwsh-sandbox',
    title: 'PowerShell 工具',
    plugin: '@deepseek-ai/dsh-pwsh-sandbox',
    effect: 'immediate',
    description: '与 Bash 工具同构的一套预算，只在装了 PowerShell 的机器上用得上。',
    fields: [
      {
        key: 'timeoutMs', type: 'number', default: 120000, min: 1, effect: 'immediate',
        label: '默认超时（毫秒）', help: '模型没指定超时时用它，且会被最大超时截断。',
      },
      {
        key: 'maxTimeoutMs', type: 'number', default: 600000, min: 1, effect: 'immediate',
        label: '最大超时（毫秒）', help: '模型自己指定的超时也不会超过这个值。',
      },
      {
        key: 'maxOutputBytes', type: 'number', default: 64000, min: 1, effect: 'immediate',
        label: '输出上限（字节）', help: '超出的部分落到外溢文件里。',
      },
      {
        key: 'maxSpillBytes', type: 'number', default: 67108864, min: 1, effect: 'immediate',
        label: '外溢文件上限（字节）', help: '',
      },
      {
        key: 'graceMs', type: 'number', default: 3000, min: 1, max: MAX_TIMER_DELAY_MS, effect: 'immediate',
        label: 'SIGTERM 宽限（毫秒）', help: '超时后先发 SIGTERM，等这么久再 SIGKILL。已在跑的命令仍按旧值计时。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'skill',
    title: '技能（skill）',
    plugin: '@deepseek-ai/dsh-skill',
    effect: 'immediate',
    description: '技能目录扫描结果的缓存条数。',
    fields: [
      {
        key: 'collectCacheMaxEntries', type: 'number', default: 128, min: 1, effect: 'immediate',
        label: '扫描缓存条数上限', help: '',
      },
    ],
    crossRules: [],
  },
]
