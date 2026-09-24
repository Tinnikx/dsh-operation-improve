/**
 * 清单的第二组：**模型请求与会话产物**——一次请求带多少东西上去、会话侧留下什么。
 * 收录口径与拼装顺序在 [catalog-entries.js](catalog-entries.js)。
 */

import {
  FILE_REFRESH_MARGIN_SECONDS,
  IMAGE_OFFLOAD_BYTE_QUANTUM,
  INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM,
  MAX_TIMER_DELAY_MS,
  SQLITE_MAX_PAGE_LIMIT,
} from './catalog-limits.js'

/** @type {readonly object[]} */
export const MODEL_ENTRIES = [
  {
    id: 'llm-deepseek',
    title: 'DeepSeek 模型接入',
    plugin: '@deepseek-ai/dsh-llm-deepseek',
    effect: 'nextRequest',
    description: '请求侧的 token、超时与文件配额。模型列表与 API key 不走这里。',
    notice: '本卡只作用于 DeepSeek 官方接入（deepseek-official）里的模型——手动加的模型若挂在这条连接的 models 列表里也归本卡兜底；但若是按 pi-ai 路由手配的 DeepSeek 兼容端点，本卡管不到，未声明窗口时走 pi-ai 自己的 256K 兜底（见顶部黄条）。',
    fields: [
      {
        key: 'maxTokens', type: 'integer', default: 256000, min: 1, effect: 'nextRequest',
        label: '单次输出 token 上限', help: '模型目录没为某个模型单独声明时用它。',
      },
      {
        key: 'defaultContextWindow', type: 'integer', default: 1000000, min: 1, effect: 'session',
        label: '默认上下文窗口（token）', help: '模型目录没声明窗口时用它，上下文占用统计也按它算。已开的会话沿用打开时的窗口。只兜 DeepSeek 官方接入里的模型；pi-ai 路由上手配的模型不读本卡（见顶部黄条）。',
      },
      {
        key: 'streamIdleTimeoutMs', type: 'integer', default: 300000, min: 1, max: MAX_TIMER_DELAY_MS, effect: 'nextRequest',
        label: '流空闲超时（毫秒）', help: '两个数据块之间超过这么久就判定断流。',
      },
      {
        key: 'maxImagesPerRequest', type: 'integer', default: 600, min: 1, effect: 'nextRequest',
        label: '单次请求图片数上限', help: '',
      },
      {
        key: 'imageOffloadCountQuantum', type: 'integer', default: 20, min: 1, effect: 'nextRequest',
        label: '图片转存张数步长', help: '图片张数超过上限时，要转存的量按这个步长向上取整（从最旧的几张起）。不能超过单次请求图片数上限。',
      },
      {
        key: 'maxRequestFilesBytes', type: 'integer', default: 134217728, min: 1, effect: 'nextRequest',
        label: '单次请求文件总上限（字节）',
        help: '以 Files 引用形式带上去的图片总量。与下面的转存步长之间的约束由上游硬抛，面板按合成值拦。',
      },
      {
        key: 'imageOffloadByteQuantum', type: 'integer', default: IMAGE_OFFLOAD_BYTE_QUANTUM, min: 1, effect: 'nextRequest',
        label: '图片转存字节步长（Files 引用）', help: '请求图片总字节超过文件总上限时，要腾出的量按这个步长向上取整。不能超过单次请求文件总上限。',
      },
      {
        key: 'maxInlineRequestImageBytes', type: 'integer', default: 20971520, min: 1, effect: 'nextRequest',
        label: '内联图片上限（字节）', help: '直接内联（base64）带上去的图片总量。',
      },
      {
        key: 'inlineImageOffloadByteQuantum', type: 'integer', default: INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM, min: 1, effect: 'nextRequest',
        label: '图片转存字节步长（内联）', help: '内联那一路的同类步长。不能超过内联图片上限。',
      },
      {
        key: 'filesApiTimeoutMs', type: 'integer', default: 60000, min: 1, max: MAX_TIMER_DELAY_MS, effect: 'nextRequest',
        label: '文件接口超时（毫秒）', help: '',
      },
      {
        key: 'fileExpiresAfterSeconds', type: 'integer', default: 604800,
        min: 3600, max: 2592000, effect: 'session',
        label: '上传文件保留时长（秒）',
        help: '已上传的文件按各自上传时点套旧有效期；要全部用新时长，得重新上传。',
      },
      {
        key: 'fileRefreshMarginSeconds', type: 'integer', default: FILE_REFRESH_MARGIN_SECONDS, min: 0, effect: 'nextRequest',
        label: '文件续期余量（秒）', help: '距过期不足这么久就算快到期，用图片时会先重新上传。必须严格小于保留时长。',
      },
      {
        key: 'fileQuotaCleanupBatch', type: 'integer', default: 100, min: 1, max: 1000, effect: 'nextRequest',
        label: '配额清理批量（个）', help: '上传撞上 Files 配额时，一次删掉最旧的多少个本 harness 的文件再重试。',
      },
    ],
    crossRules: [
      {
        kind: 'atMost', field: 'imageOffloadByteQuantum', than: 'maxRequestFilesBytes',
        message: '图片转存字节步长（Files 引用）不能超过单次请求文件总上限，否则 llm-deepseek 加载失败。',
      },
      {
        kind: 'atMost', field: 'inlineImageOffloadByteQuantum', than: 'maxInlineRequestImageBytes',
        message: '图片转存字节步长（内联）不能超过内联图片上限，否则 llm-deepseek 加载失败。',
      },
      {
        kind: 'atMost', field: 'imageOffloadCountQuantum', than: 'maxImagesPerRequest',
        message: '图片转存张数步长不能超过单次请求图片数上限，否则 llm-deepseek 加载失败。',
      },
      {
        kind: 'lessThan', field: 'fileRefreshMarginSeconds', than: 'fileExpiresAfterSeconds',
        message: '文件续期余量必须严格小于上传文件保留时长，否则 llm-deepseek 加载失败。',
      },
    ],
  },
  {
    id: 'session-query-sqlite',
    title: '会话检索',
    plugin: '@deepseek-ai/dsh-session-query-sqlite',
    // 'restart' 不只是「新值要重启才用上」：harness 0.1.6-alpha.2 上改这个条目会触发
    // host-HMR 热重挂缺陷，连带摘除 sessionController 且可能静默挂起——侧栏会话列表
    // 全空、撤销写入也不稳定恢复，只有重启 harness 进程可靠。热重载有时确实能把新值
    // 送进 loader（verify:settings 的 1b 实测约 2s），但代价是赌上会话服务，操作口径
    // 一律按重启。见 docs/harness-hmr-session-defect.md。
    effect: 'restart',
    description: '历史会话搜索的分页与摘要预算。注意：harness 0.1.6 改这个条目有已知缺陷——热重载可能连带杀死会话服务（侧栏列表清空）且撤销不恢复，保存后请立刻重启 harness；按「重启后生效」操作。',
    fields: [
      {
        key: 'defaultLimit', type: 'integer', default: 20, min: 1, max: SQLITE_MAX_PAGE_LIMIT, effect: 'restart',
        label: '默认每页条数', help: '调用方没指定条数时用它，必须不大于每页条数上限。',
      },
      {
        key: 'maxLimit', type: 'integer', default: 100, min: 1, max: SQLITE_MAX_PAGE_LIMIT, effect: 'restart',
        label: '每页条数上限', help: '',
      },
      {
        key: 'snippetChars', type: 'integer', default: 240, min: 1, effect: 'restart',
        label: '摘要长度（字符）', help: '',
      },
      {
        key: 'readWindowMax', type: 'integer', default: 50, min: 0, effect: 'restart',
        label: '单次读取窗口上限', help: '',
      },
      {
        key: 'persistedReadConcurrency', type: 'integer', default: 4, min: 1, effect: 'restart',
        label: '落盘会话读取并发', help: '并行读历史会话的并发数；重启 harness 后按新值执行。',
      },
      {
        key: 'preparedSessionCacheSize', type: 'integer', default: 5, min: 1, effect: 'restart',
        label: '预编译会话缓存条数', help: '重启 harness 后生效。',
      },
    ],
    crossRules: [
      {
        kind: 'sumAtMost', fields: ['defaultLimit'], plus: 0, atMost: 'maxLimit',
        message: '默认每页条数不能超过每页条数上限，否则 session-query-sqlite 加载失败。',
      },
    ],
  },
  {
    id: 'session-reference',
    title: '会话引用',
    plugin: '@deepseek-ai/dsh-session-reference',
    effect: 'nextRequest',
    description: '往会话里引用另一场会话时的条数与体量预算。',
    fields: [
      {
        key: 'maxReferences', type: 'integer', default: 3, min: 1, max: 3, effect: 'nextRequest',
        label: '引用条数上限', help: '上游硬上限 3。',
      },
      {
        key: 'candidateLimit', type: 'integer', default: 50, min: 1, effect: 'nextRequest',
        label: '候选池上限', help: '',
      },
      {
        key: 'maxReferenceBytes', type: 'integer', default: 65536, min: 1, effect: 'nextRequest',
        label: '单条引用内容上限（字节）',
        help: '设了就固定按这个字节数裁切被引用的会话内容。不设则按上下文窗口 × 4 × 引用占比推导，提示里的 65536 是那条推导式的下限，不是推导结果。',
      },
      {
        key: 'referenceContextFraction', type: 'number', default: 0.2, min: 0, max: 1, effect: 'nextRequest',
        label: '引用内容占比', help: '被引用内容最多占上下文窗口的比例，取值 0–1（上游按这个区间硬抛）。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'session-title',
    title: '会话标题',
    plugin: '@deepseek-ai/dsh-session-title',
    effect: 'nextSession',
    description: '侧边栏那个标题的长度预算。回退标题是模型起名失败时按首条消息截出来的。',
    fields: [
      {
        key: 'fallbackMaxWords', type: 'integer', default: 5, min: 1, effect: 'nextSession',
        label: '回退标题最多词数', help: '只影响之后新起的会话。',
      },
      {
        key: 'fallbackMaxBytes', type: 'integer', default: 40, min: 1, effect: 'nextSession',
        label: '回退标题最大字节', help: '不能超过标题最大字节。只影响之后新起的会话。',
      },
      {
        key: 'maxTitleBytes', type: 'integer', default: 80, min: 1, effect: 'nextSession',
        label: '标题最大字节', help: '只影响之后新起的会话。',
      },
    ],
    crossRules: [
      {
        kind: 'sumAtMost', fields: ['fallbackMaxBytes'], plus: 0, atMost: 'maxTitleBytes',
        message: '回退标题最大字节不能超过标题最大字节，否则 session-title 加载失败。',
      },
    ],
  },
  {
    id: 'session-title-llm',
    title: '会话标题（模型生成）',
    plugin: '@deepseek-ai/dsh-session-title-first-prompt-llm',
    effect: 'nextSession',
    description: '拿首条消息让模型起标题的预算；超时或失败就退回上面那个回退标题。',
    fields: [
      {
        key: 'targetWords', type: 'integer', default: 5, min: 1, effect: 'nextSession',
        label: '目标词数', help: '只影响之后新起的会话。',
      },
      {
        key: 'targetCjkCharacters', type: 'integer', default: 10, min: 1, effect: 'nextSession',
        label: '目标中日韩字数', help: '只影响之后新起的会话。',
      },
      {
        key: 'maxInputBytes', type: 'integer', default: 4096, min: 1, effect: 'nextSession',
        label: '输入截断（字节）', help: '首条消息只取这么多喂给模型。只影响之后新起的会话。',
      },
      {
        key: 'maxOutputTokens', type: 'integer', default: 64, min: 1, effect: 'nextSession',
        label: '输出 token 上限', help: '只影响之后新起的会话。',
      },
      {
        key: 'timeoutMs', type: 'integer', default: 60000, min: 1, max: MAX_TIMER_DELAY_MS, effect: 'nextSession',
        label: '超时（毫秒）', help: '只影响之后新起的会话。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'session-projection-cache',
    title: '会话投影缓存',
    plugin: '@deepseek-ai/dsh-session-projection-cache',
    effect: 'nextQuery',
    description: '侧边栏与检索读的会话投影写盘节奏。下一轮查询按新值执行。',
    fields: [
      {
        key: 'writeEveryEvents', type: 'integer', default: 200, min: 1, effect: 'nextQuery',
        label: '每多少条事件写一次', help: '',
      },
      {
        key: 'writeIntervalMs', type: 'integer', default: 5000, min: 1, effect: 'nextQuery',
        label: '写盘间隔（毫秒）', help: '',
      },
    ],
    crossRules: [],
  },
  {
    id: 'attachment-local',
    title: '图片附件',
    plugin: '@deepseek-ai/dsh-attachment-local',
    effect: 'nextAttachment',
    description: '拖进对话框的图片在入库前的尺寸、体积与并发预算。改完对下一次入库生效。',
    fields: [
      {
        key: 'maxImageBytes', type: 'integer', default: 20971520, min: 1, effect: 'nextAttachment',
        label: '单张原图上限（字节）', help: '',
      },
      {
        key: 'maxImagesPerMessage', type: 'integer', default: 20, min: 1, effect: 'nextAttachment',
        label: '单条消息图片数上限', help: '',
      },
      {
        key: 'maxMessageImageBytes', type: 'integer', default: 209715200, min: 1, effect: 'nextAttachment',
        label: '单条消息图片总字节上限', help: '',
      },
      {
        key: 'maxImagePixels', type: 'integer', default: 64000000, min: 1, effect: 'nextAttachment',
        label: '单张原图像素上限', help: '',
      },
      {
        key: 'maxImageDimension', type: 'integer', default: 8192, min: 1, effect: 'nextAttachment',
        label: '单张原图边长上限（像素）', help: '',
      },
      {
        key: 'normalizedImageMaxDimension', type: 'integer', default: 8192, min: 1, effect: 'nextAttachment',
        label: '归一化后边长上限（像素）', help: '入库前会先缩到这个边长以内。',
      },
      {
        key: 'normalizedImageMaxPixels', type: 'integer', default: 4194304, min: 1, effect: 'nextAttachment',
        label: '归一化后像素上限', help: '',
      },
      {
        key: 'normalizedImageMaxBytes', type: 'integer', default: 4194304, min: 1, effect: 'nextAttachment',
        label: '归一化后字节上限', help: '',
      },
      {
        key: 'imageCompressionConcurrency', type: 'integer', default: 2, min: 1, max: 8, effect: 'nextAttachment',
        label: '压缩并发数', help: '上游硬限 1–8。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'system-prompt',
    title: '系统提示',
    plugin: '@deepseek-ai/dsh-system-prompt',
    effect: 'session',
    description: '系统提示里两个可开关的固定段落。人设（persona）是长文本，面板不改。',
    fields: [
      {
        key: 'includeHarnessIdentity', type: 'boolean', default: true, effect: 'session',
        label: '包含 harness 身份段', help: '',
      },
      {
        key: 'includeRuntimeContext', type: 'boolean', default: true, effect: 'session',
        label: '包含运行时上下文段', help: '工作目录、平台、日期这些。',
      },
    ],
    crossRules: [],
  },
]
