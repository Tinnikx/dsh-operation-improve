/**
 * 清单的后半：**模型请求与会话产物**——一次请求带多少东西上去、会话侧留下什么。
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
    description: '请求侧的 token、超时与文件配额。模型列表与 API key 不走这里。',
    fields: [
      {
        key: 'maxTokens', type: 'integer', default: 256000, min: 1,
        label: '单次输出 token 上限', help: '模型目录没为某个模型单独声明时用它。',
      },
      {
        key: 'defaultContextWindow', type: 'integer', default: 1000000, min: 1,
        label: '默认上下文窗口（token）', help: '模型目录没声明窗口时用它，上下文占用统计也按它算。',
      },
      {
        key: 'streamIdleTimeoutMs', type: 'integer', default: 300000, min: 1, max: MAX_TIMER_DELAY_MS,
        label: '流空闲超时（毫秒）', help: '两个数据块之间超过这么久就判定断流。',
      },
      {
        key: 'maxImagesPerRequest', type: 'integer', default: 600, min: 1,
        label: '单次请求图片数上限', help: '',
      },
      {
        key: 'maxRequestFilesBytes', type: 'integer', default: 134217728, min: IMAGE_OFFLOAD_BYTE_QUANTUM,
        label: '单次请求文件总上限（字节）',
        help: `不能小于图片转存配额 ${IMAGE_OFFLOAD_BYTE_QUANTUM}，否则 llm-deepseek 加载失败。`,
      },
      {
        key: 'maxInlineRequestImageBytes', type: 'integer', default: 20971520,
        min: INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM,
        label: '内联图片上限（字节）',
        help: `不能小于内联转存配额 ${INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM}，否则 llm-deepseek 加载失败。`,
      },
      {
        key: 'filesApiTimeoutMs', type: 'integer', default: 60000, min: 1, max: MAX_TIMER_DELAY_MS,
        label: '文件接口超时（毫秒）', help: '',
      },
      {
        key: 'fileExpiresAfterSeconds', type: 'integer', default: 604800,
        min: FILE_REFRESH_MARGIN_SECONDS + 1, max: 2592000,
        label: '上传文件保留时长（秒）',
        help: `上游范围 3600–2592000，且必须大于刷新余量 ${FILE_REFRESH_MARGIN_SECONDS}。`,
      },
    ],
    crossRules: [],
  },
  {
    id: 'web-search-deepseek',
    title: '联网搜索（DeepSeek）',
    plugin: '@deepseek-ai/dsh-web-search-deepseek',
    description: '搜索工具背后那次调用的预算。API key 走环境变量，不在这里改。',
    fields: [
      {
        key: 'maxUses', type: 'integer', default: 5, min: 1,
        label: '单次搜索最多调用次数', help: '',
      },
      {
        key: 'maxTokens', type: 'integer', default: 4096, min: 1,
        label: '搜索结果 token 上限', help: '',
      },
    ],
    crossRules: [],
  },
  {
    id: 'session-query-sqlite',
    title: '会话检索',
    plugin: '@deepseek-ai/dsh-session-query-sqlite',
    description: '历史会话搜索的分页与摘要预算。',
    fields: [
      {
        key: 'defaultLimit', type: 'integer', default: 20, min: 1, max: SQLITE_MAX_PAGE_LIMIT,
        label: '默认每页条数', help: '调用方没指定条数时用它，必须不大于每页条数上限。',
      },
      {
        key: 'maxLimit', type: 'integer', default: 100, min: 1, max: SQLITE_MAX_PAGE_LIMIT,
        label: '每页条数上限', help: '',
      },
      {
        key: 'snippetChars', type: 'integer', default: 240, min: 1,
        label: '摘要长度（字符）', help: '',
      },
      {
        key: 'readWindowMax', type: 'integer', default: 50, min: 0,
        label: '单次读取窗口上限', help: '',
      },
      {
        key: 'persistedInspectConcurrency', type: 'integer', default: 4, min: 1,
        label: '落盘会话检查并发', help: '',
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
    id: 'session-title',
    title: '会话标题',
    plugin: '@deepseek-ai/dsh-session-title',
    description: '侧边栏那个标题的长度预算。回退标题是模型起名失败时按首条消息截出来的。',
    fields: [
      {
        key: 'fallbackMaxWords', type: 'integer', default: 5, min: 1,
        label: '回退标题最多词数', help: '',
      },
      {
        key: 'fallbackMaxBytes', type: 'integer', default: 40, min: 1,
        label: '回退标题最大字节', help: '不能超过标题最大字节。',
      },
      {
        key: 'maxTitleBytes', type: 'integer', default: 80, min: 1,
        label: '标题最大字节', help: '',
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
    description: '拿首条消息让模型起标题的预算；超时或失败就退回上面那个回退标题。',
    fields: [
      {
        key: 'targetWords', type: 'integer', default: 5, min: 1,
        label: '目标词数', help: '',
      },
      {
        key: 'targetCjkCharacters', type: 'integer', default: 10, min: 1,
        label: '目标中日韩字数', help: '',
      },
      {
        key: 'maxInputBytes', type: 'integer', default: 4096, min: 1,
        label: '输入截断（字节）', help: '首条消息只取这么多喂给模型。',
      },
      {
        key: 'maxOutputTokens', type: 'integer', default: 64, min: 1,
        label: '输出 token 上限', help: '',
      },
      {
        key: 'timeoutMs', type: 'integer', default: 60000, min: 1, max: MAX_TIMER_DELAY_MS,
        label: '超时（毫秒）', help: '',
      },
    ],
    crossRules: [],
  },
  {
    id: 'attachment-local',
    title: '图片附件',
    plugin: '@deepseek-ai/dsh-attachment-local',
    description: '拖进对话框的图片在入库前的尺寸、体积与并发预算。',
    fields: [
      {
        key: 'maxImageBytes', type: 'integer', default: 20971520, min: 1,
        label: '单张原图上限（字节）', help: '',
      },
      {
        key: 'maxImagesPerMessage', type: 'integer', default: 20, min: 1,
        label: '单条消息图片数上限', help: '',
      },
      {
        key: 'maxMessageImageBytes', type: 'integer', default: 209715200, min: 1,
        label: '单条消息图片总字节上限', help: '',
      },
      {
        key: 'maxImagePixels', type: 'integer', default: 64000000, min: 1,
        label: '单张原图像素上限', help: '',
      },
      {
        key: 'maxImageDimension', type: 'integer', default: 8192, min: 1,
        label: '单张原图边长上限（像素）', help: '',
      },
      {
        key: 'normalizedImageMaxDimension', type: 'integer', default: 2048, min: 1,
        label: '归一化后边长上限（像素）', help: '入库前会先缩到这个边长以内。',
      },
      {
        key: 'normalizedImageMaxBytes', type: 'integer', default: 4194304, min: 1,
        label: '归一化后字节上限', help: '',
      },
      {
        key: 'imageCompressionConcurrency', type: 'integer', default: 2, min: 1, max: 8,
        label: '压缩并发数', help: '上游硬限 1–8。',
      },
    ],
    crossRules: [],
  },
  {
    id: 'system-prompt',
    title: '系统提示',
    plugin: '@deepseek-ai/dsh-system-prompt',
    description: '系统提示里两个可开关的固定段落。人设（persona）是长文本，面板不改。',
    fields: [
      {
        key: 'includeHarnessIdentity', type: 'boolean', default: true,
        label: '包含 harness 身份段', help: '',
      },
      {
        key: 'includeRuntimeContext', type: 'boolean', default: true,
        label: '包含运行时上下文段', help: '工作目录、平台、日期这些。',
      },
    ],
    crossRules: [],
  },
]
