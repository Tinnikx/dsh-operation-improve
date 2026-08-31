// src/harness-config/catalog-limits.js
var PRUNE_MARKER_CHARS = 39;
var MAX_TIMER_DELAY_MS = 2147483647;
var IMAGE_OFFLOAD_BYTE_QUANTUM = 67108864;
var INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM = 10485760;
var FILE_REFRESH_MARGIN_SECONDS = 3600;
var SQLITE_MAX_PAGE_LIMIT = Number.MAX_SAFE_INTEGER - 1;

// src/harness-config/catalog-model.js
var MODEL_ENTRIES = [
  {
    id: "llm-deepseek",
    title: "DeepSeek \u6A21\u578B\u63A5\u5165",
    plugin: "@deepseek-ai/dsh-llm-deepseek",
    description: "\u8BF7\u6C42\u4FA7\u7684 token\u3001\u8D85\u65F6\u4E0E\u6587\u4EF6\u914D\u989D\u3002\u6A21\u578B\u5217\u8868\u4E0E API key \u4E0D\u8D70\u8FD9\u91CC\u3002",
    fields: [
      {
        key: "maxTokens",
        type: "integer",
        default: 256e3,
        min: 1,
        label: "\u5355\u6B21\u8F93\u51FA token \u4E0A\u9650",
        help: "\u6A21\u578B\u76EE\u5F55\u6CA1\u4E3A\u67D0\u4E2A\u6A21\u578B\u5355\u72EC\u58F0\u660E\u65F6\u7528\u5B83\u3002"
      },
      {
        key: "defaultContextWindow",
        type: "integer",
        default: 1e6,
        min: 1,
        label: "\u9ED8\u8BA4\u4E0A\u4E0B\u6587\u7A97\u53E3\uFF08token\uFF09",
        help: "\u6A21\u578B\u76EE\u5F55\u6CA1\u58F0\u660E\u7A97\u53E3\u65F6\u7528\u5B83\uFF0C\u4E0A\u4E0B\u6587\u5360\u7528\u7EDF\u8BA1\u4E5F\u6309\u5B83\u7B97\u3002"
      },
      {
        key: "streamIdleTimeoutMs",
        type: "integer",
        default: 3e5,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "\u6D41\u7A7A\u95F2\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u4E24\u4E2A\u6570\u636E\u5757\u4E4B\u95F4\u8D85\u8FC7\u8FD9\u4E48\u4E45\u5C31\u5224\u5B9A\u65AD\u6D41\u3002"
      },
      {
        key: "maxImagesPerRequest",
        type: "integer",
        default: 600,
        min: 1,
        label: "\u5355\u6B21\u8BF7\u6C42\u56FE\u7247\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxRequestFilesBytes",
        type: "integer",
        default: 134217728,
        min: IMAGE_OFFLOAD_BYTE_QUANTUM,
        label: "\u5355\u6B21\u8BF7\u6C42\u6587\u4EF6\u603B\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: `\u4E0D\u80FD\u5C0F\u4E8E\u56FE\u7247\u8F6C\u5B58\u914D\u989D ${IMAGE_OFFLOAD_BYTE_QUANTUM}\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002`
      },
      {
        key: "maxInlineRequestImageBytes",
        type: "integer",
        default: 20971520,
        min: INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM,
        label: "\u5185\u8054\u56FE\u7247\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: `\u4E0D\u80FD\u5C0F\u4E8E\u5185\u8054\u8F6C\u5B58\u914D\u989D ${INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM}\uFF0C\u5426\u5219 llm-deepseek \u52A0\u8F7D\u5931\u8D25\u3002`
      },
      {
        key: "filesApiTimeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "\u6587\u4EF6\u63A5\u53E3\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      },
      {
        key: "fileExpiresAfterSeconds",
        type: "integer",
        default: 604800,
        min: FILE_REFRESH_MARGIN_SECONDS + 1,
        max: 2592e3,
        label: "\u4E0A\u4F20\u6587\u4EF6\u4FDD\u7559\u65F6\u957F\uFF08\u79D2\uFF09",
        help: `\u4E0A\u6E38\u8303\u56F4 3600\u20132592000\uFF0C\u4E14\u5FC5\u987B\u5927\u4E8E\u5237\u65B0\u4F59\u91CF ${FILE_REFRESH_MARGIN_SECONDS}\u3002`
      }
    ],
    crossRules: []
  },
  {
    id: "web-search-deepseek",
    title: "\u8054\u7F51\u641C\u7D22\uFF08DeepSeek\uFF09",
    plugin: "@deepseek-ai/dsh-web-search-deepseek",
    description: "\u641C\u7D22\u5DE5\u5177\u80CC\u540E\u90A3\u6B21\u8C03\u7528\u7684\u9884\u7B97\u3002API key \u8D70\u73AF\u5883\u53D8\u91CF\uFF0C\u4E0D\u5728\u8FD9\u91CC\u6539\u3002",
    fields: [
      {
        key: "maxUses",
        type: "integer",
        default: 5,
        min: 1,
        label: "\u5355\u6B21\u641C\u7D22\u6700\u591A\u8C03\u7528\u6B21\u6570",
        help: ""
      },
      {
        key: "maxTokens",
        type: "integer",
        default: 4096,
        min: 1,
        label: "\u641C\u7D22\u7ED3\u679C token \u4E0A\u9650",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "session-query-sqlite",
    title: "\u4F1A\u8BDD\u68C0\u7D22",
    plugin: "@deepseek-ai/dsh-session-query-sqlite",
    description: "\u5386\u53F2\u4F1A\u8BDD\u641C\u7D22\u7684\u5206\u9875\u4E0E\u6458\u8981\u9884\u7B97\u3002",
    fields: [
      {
        key: "defaultLimit",
        type: "integer",
        default: 20,
        min: 1,
        max: SQLITE_MAX_PAGE_LIMIT,
        label: "\u9ED8\u8BA4\u6BCF\u9875\u6761\u6570",
        help: "\u8C03\u7528\u65B9\u6CA1\u6307\u5B9A\u6761\u6570\u65F6\u7528\u5B83\uFF0C\u5FC5\u987B\u4E0D\u5927\u4E8E\u6BCF\u9875\u6761\u6570\u4E0A\u9650\u3002"
      },
      {
        key: "maxLimit",
        type: "integer",
        default: 100,
        min: 1,
        max: SQLITE_MAX_PAGE_LIMIT,
        label: "\u6BCF\u9875\u6761\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "snippetChars",
        type: "integer",
        default: 240,
        min: 1,
        label: "\u6458\u8981\u957F\u5EA6\uFF08\u5B57\u7B26\uFF09",
        help: ""
      },
      {
        key: "readWindowMax",
        type: "integer",
        default: 50,
        min: 0,
        label: "\u5355\u6B21\u8BFB\u53D6\u7A97\u53E3\u4E0A\u9650",
        help: ""
      },
      {
        key: "persistedInspectConcurrency",
        type: "integer",
        default: 4,
        min: 1,
        label: "\u843D\u76D8\u4F1A\u8BDD\u68C0\u67E5\u5E76\u53D1",
        help: ""
      }
    ],
    crossRules: [
      {
        kind: "sumAtMost",
        fields: ["defaultLimit"],
        plus: 0,
        atMost: "maxLimit",
        message: "\u9ED8\u8BA4\u6BCF\u9875\u6761\u6570\u4E0D\u80FD\u8D85\u8FC7\u6BCF\u9875\u6761\u6570\u4E0A\u9650\uFF0C\u5426\u5219 session-query-sqlite \u52A0\u8F7D\u5931\u8D25\u3002"
      }
    ]
  },
  {
    id: "session-title",
    title: "\u4F1A\u8BDD\u6807\u9898",
    plugin: "@deepseek-ai/dsh-session-title",
    description: "\u4FA7\u8FB9\u680F\u90A3\u4E2A\u6807\u9898\u7684\u957F\u5EA6\u9884\u7B97\u3002\u56DE\u9000\u6807\u9898\u662F\u6A21\u578B\u8D77\u540D\u5931\u8D25\u65F6\u6309\u9996\u6761\u6D88\u606F\u622A\u51FA\u6765\u7684\u3002",
    fields: [
      {
        key: "fallbackMaxWords",
        type: "integer",
        default: 5,
        min: 1,
        label: "\u56DE\u9000\u6807\u9898\u6700\u591A\u8BCD\u6570",
        help: ""
      },
      {
        key: "fallbackMaxBytes",
        type: "integer",
        default: 40,
        min: 1,
        label: "\u56DE\u9000\u6807\u9898\u6700\u5927\u5B57\u8282",
        help: "\u4E0D\u80FD\u8D85\u8FC7\u6807\u9898\u6700\u5927\u5B57\u8282\u3002"
      },
      {
        key: "maxTitleBytes",
        type: "integer",
        default: 80,
        min: 1,
        label: "\u6807\u9898\u6700\u5927\u5B57\u8282",
        help: ""
      }
    ],
    crossRules: [
      {
        kind: "sumAtMost",
        fields: ["fallbackMaxBytes"],
        plus: 0,
        atMost: "maxTitleBytes",
        message: "\u56DE\u9000\u6807\u9898\u6700\u5927\u5B57\u8282\u4E0D\u80FD\u8D85\u8FC7\u6807\u9898\u6700\u5927\u5B57\u8282\uFF0C\u5426\u5219 session-title \u52A0\u8F7D\u5931\u8D25\u3002"
      }
    ]
  },
  {
    id: "session-title-llm",
    title: "\u4F1A\u8BDD\u6807\u9898\uFF08\u6A21\u578B\u751F\u6210\uFF09",
    plugin: "@deepseek-ai/dsh-session-title-first-prompt-llm",
    description: "\u62FF\u9996\u6761\u6D88\u606F\u8BA9\u6A21\u578B\u8D77\u6807\u9898\u7684\u9884\u7B97\uFF1B\u8D85\u65F6\u6216\u5931\u8D25\u5C31\u9000\u56DE\u4E0A\u9762\u90A3\u4E2A\u56DE\u9000\u6807\u9898\u3002",
    fields: [
      {
        key: "targetWords",
        type: "integer",
        default: 5,
        min: 1,
        label: "\u76EE\u6807\u8BCD\u6570",
        help: ""
      },
      {
        key: "targetCjkCharacters",
        type: "integer",
        default: 10,
        min: 1,
        label: "\u76EE\u6807\u4E2D\u65E5\u97E9\u5B57\u6570",
        help: ""
      },
      {
        key: "maxInputBytes",
        type: "integer",
        default: 4096,
        min: 1,
        label: "\u8F93\u5165\u622A\u65AD\uFF08\u5B57\u8282\uFF09",
        help: "\u9996\u6761\u6D88\u606F\u53EA\u53D6\u8FD9\u4E48\u591A\u5582\u7ED9\u6A21\u578B\u3002"
      },
      {
        key: "maxOutputTokens",
        type: "integer",
        default: 64,
        min: 1,
        label: "\u8F93\u51FA token \u4E0A\u9650",
        help: ""
      },
      {
        key: "timeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "attachment-local",
    title: "\u56FE\u7247\u9644\u4EF6",
    plugin: "@deepseek-ai/dsh-attachment-local",
    description: "\u62D6\u8FDB\u5BF9\u8BDD\u6846\u7684\u56FE\u7247\u5728\u5165\u5E93\u524D\u7684\u5C3A\u5BF8\u3001\u4F53\u79EF\u4E0E\u5E76\u53D1\u9884\u7B97\u3002",
    fields: [
      {
        key: "maxImageBytes",
        type: "integer",
        default: 20971520,
        min: 1,
        label: "\u5355\u5F20\u539F\u56FE\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "maxImagesPerMessage",
        type: "integer",
        default: 20,
        min: 1,
        label: "\u5355\u6761\u6D88\u606F\u56FE\u7247\u6570\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxMessageImageBytes",
        type: "integer",
        default: 209715200,
        min: 1,
        label: "\u5355\u6761\u6D88\u606F\u56FE\u7247\u603B\u5B57\u8282\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxImagePixels",
        type: "integer",
        default: 64e6,
        min: 1,
        label: "\u5355\u5F20\u539F\u56FE\u50CF\u7D20\u4E0A\u9650",
        help: ""
      },
      {
        key: "maxImageDimension",
        type: "integer",
        default: 8192,
        min: 1,
        label: "\u5355\u5F20\u539F\u56FE\u8FB9\u957F\u4E0A\u9650\uFF08\u50CF\u7D20\uFF09",
        help: ""
      },
      {
        key: "normalizedImageMaxDimension",
        type: "integer",
        default: 2048,
        min: 1,
        label: "\u5F52\u4E00\u5316\u540E\u8FB9\u957F\u4E0A\u9650\uFF08\u50CF\u7D20\uFF09",
        help: "\u5165\u5E93\u524D\u4F1A\u5148\u7F29\u5230\u8FD9\u4E2A\u8FB9\u957F\u4EE5\u5185\u3002"
      },
      {
        key: "normalizedImageMaxBytes",
        type: "integer",
        default: 4194304,
        min: 1,
        label: "\u5F52\u4E00\u5316\u540E\u5B57\u8282\u4E0A\u9650",
        help: ""
      },
      {
        key: "imageCompressionConcurrency",
        type: "integer",
        default: 2,
        min: 1,
        max: 8,
        label: "\u538B\u7F29\u5E76\u53D1\u6570",
        help: "\u4E0A\u6E38\u786C\u9650 1\u20138\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "system-prompt",
    title: "\u7CFB\u7EDF\u63D0\u793A",
    plugin: "@deepseek-ai/dsh-system-prompt",
    description: "\u7CFB\u7EDF\u63D0\u793A\u91CC\u4E24\u4E2A\u53EF\u5F00\u5173\u7684\u56FA\u5B9A\u6BB5\u843D\u3002\u4EBA\u8BBE\uFF08persona\uFF09\u662F\u957F\u6587\u672C\uFF0C\u9762\u677F\u4E0D\u6539\u3002",
    fields: [
      {
        key: "includeHarnessIdentity",
        type: "boolean",
        default: true,
        label: "\u5305\u542B harness \u8EAB\u4EFD\u6BB5",
        help: ""
      },
      {
        key: "includeRuntimeContext",
        type: "boolean",
        default: true,
        label: "\u5305\u542B\u8FD0\u884C\u65F6\u4E0A\u4E0B\u6587\u6BB5",
        help: "\u5DE5\u4F5C\u76EE\u5F55\u3001\u5E73\u53F0\u3001\u65E5\u671F\u8FD9\u4E9B\u3002"
      }
    ],
    crossRules: []
  }
];

// src/harness-config/catalog-tools.js
var TOOL_ENTRIES = [
  {
    id: "compaction-basic",
    title: "\u4E0A\u4E0B\u6587\u538B\u7F29",
    plugin: "@deepseek-ai/dsh-compaction-basic",
    description: "\u4F1A\u8BDD\u903C\u8FD1\u4E0A\u4E0B\u6587\u4E0A\u9650\u65F6\u81EA\u52A8\u538B\u7F29\u5386\u53F2\u3002\u9608\u503C\u4E0E\u4FDD\u7559\u6BD4\u4F8B\u51B3\u5B9A\u538B\u5F97\u591A\u65E9\u3001\u7559\u5F97\u591A\u5C11\u3002",
    fields: [
      {
        key: "auto",
        type: "boolean",
        default: true,
        label: "\u81EA\u52A8\u538B\u7F29",
        help: "\u5173\u6389\u540E\u53EA\u80FD\u624B\u52A8\u89E6\u53D1\u538B\u7F29\u3002"
      },
      {
        key: "thresholdRatio",
        type: "number",
        default: 0.8,
        min: 0,
        max: 1,
        exclusive: true,
        label: "\u89E6\u53D1\u9608\u503C\u6BD4\u4F8B",
        help: "\u5360\u6A21\u578B\u4E0A\u4E0B\u6587\u7A97\u53E3\u7684\u6BD4\u4F8B\uFF0C\u8D85\u8FC7\u5C31\u5F00\u59CB\u538B\u7F29\u3002"
      },
      {
        key: "retainRatio",
        type: "number",
        default: 0.16,
        min: 0,
        max: 1,
        exclusive: true,
        label: "\u4FDD\u7559\u6BD4\u4F8B",
        help: "\u538B\u7F29\u540E\u4FDD\u7559\u7684\u8FD1\u671F\u5185\u5BB9\u6BD4\u4F8B\uFF0C\u5FC5\u987B\u5C0F\u4E8E\u89E6\u53D1\u9608\u503C\u6BD4\u4F8B\u3002"
      },
      {
        key: "maxTokens",
        type: "integer",
        default: 8192,
        min: 1,
        label: "\u6458\u8981 token \u4E0A\u9650",
        help: "\u751F\u6210\u6458\u8981\u65F6\u7ED9\u6A21\u578B\u7684\u8F93\u51FA\u4E0A\u9650\uFF0C\u4E0D\u80FD\u8D85\u8FC7\u6240\u9009\u6A21\u578B\u7684\u8F93\u51FA\u4E0A\u9650\u3002"
      },
      {
        key: "compactionRetries",
        type: "integer",
        default: 1,
        min: 0,
        label: "\u538B\u7F29\u91CD\u8BD5\u6B21\u6570",
        help: "\u4E00\u6B21\u538B\u7F29\u540E\u4ECD\u8D85\u9608\u503C\u65F6\u7684\u989D\u5916\u5C1D\u8BD5\u6B21\u6570\u3002"
      },
      {
        key: "maxOverflowRetries",
        type: "integer",
        default: 1,
        min: 0,
        label: "\u6EA2\u51FA\u91CD\u8BD5\u6B21\u6570",
        help: "\u8BF7\u6C42\u56E0\u8D85\u957F\u88AB\u62D2\u65F6\u7684\u989D\u5916\u5C1D\u8BD5\u6B21\u6570\u3002"
      }
    ],
    crossRules: [
      {
        kind: "lessThan",
        field: "retainRatio",
        than: "thresholdRatio",
        message: "\u4FDD\u7559\u6BD4\u4F8B\u5FC5\u987B\u5C0F\u4E8E\u89E6\u53D1\u9608\u503C\u6BD4\u4F8B\uFF0C\u5426\u5219 compaction-basic \u52A0\u8F7D\u5931\u8D25\u3002"
      }
    ]
  },
  {
    id: "tool-result-pruner",
    title: "\u5DE5\u5177\u7ED3\u679C\u88C1\u526A",
    plugin: "@deepseek-ai/dsh-compaction-tool-result-pruner",
    description: "\u8D85\u957F\u5DE5\u5177\u8F93\u51FA\u53EA\u4FDD\u7559\u5934\u5C3E\uFF0C\u4E2D\u95F4\u66FF\u6362\u6210\u4E00\u884C\u7701\u7565\u6807\u8BB0\u3002",
    fields: [
      {
        key: "thresholdChars",
        type: "integer",
        default: 8192,
        min: 1,
        label: "\u88C1\u526A\u9608\u503C\uFF08\u5B57\u7B26\uFF09",
        help: "\u5DE5\u5177\u8F93\u51FA\u8D85\u8FC7\u8FD9\u4E48\u591A\u7801\u70B9\u624D\u88C1\u526A\u3002"
      },
      {
        key: "headChars",
        type: "integer",
        default: 4096,
        min: 0,
        label: "\u4FDD\u7559\u5F00\u5934\uFF08\u5B57\u7B26\uFF09",
        help: ""
      },
      {
        key: "tailChars",
        type: "integer",
        default: 1024,
        min: 0,
        label: "\u4FDD\u7559\u7ED3\u5C3E\uFF08\u5B57\u7B26\uFF09",
        help: ""
      }
    ],
    crossRules: [
      {
        kind: "sumAtMost",
        fields: ["headChars", "tailChars"],
        plus: PRUNE_MARKER_CHARS,
        atMost: "thresholdChars",
        message: `\u4FDD\u7559\u5F00\u5934 + \u4FDD\u7559\u7ED3\u5C3E + \u7701\u7565\u6807\u8BB0\uFF08${PRUNE_MARKER_CHARS} \u5B57\u7B26\uFF09\u4E0D\u80FD\u8D85\u8FC7\u88C1\u526A\u9608\u503C\uFF0C\u5426\u5219 tool-result-pruner \u52A0\u8F7D\u5931\u8D25\u3002`
      }
    ]
  },
  {
    id: "spill-policy",
    title: "\u5927\u5757\u5185\u5BB9\u5916\u6EA2",
    plugin: "@deepseek-ai/dsh-spill-policy",
    description: "\u8D85\u8FC7\u9608\u503C\u7684\u5185\u5BB9\u4E0D\u518D\u5185\u8054\u8FDB\u4F1A\u8BDD\uFF0C\u6539\u4E3A\u843D\u76D8\u5F15\u7528\u3002",
    fields: [
      {
        key: "maxInlineBytes",
        type: "integer",
        default: 5e4,
        min: 1,
        label: "\u5185\u8054\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u8FC7\u5C31\u5916\u6EA2\u5230\u5B58\u50A8\uFF0C\u4F1A\u8BDD\u91CC\u53EA\u7559\u5F15\u7528\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "tool-str-replace-editor",
    title: "\u6587\u4EF6\u7F16\u8F91\u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-tool-str-replace-editor",
    description: "\u8BFB\u6587\u4EF6 / \u6539\u6587\u4EF6\u5DE5\u5177\u5355\u6B21\u8FD4\u56DE\u7684\u4F53\u91CF\u4E0A\u9650\u3002",
    fields: [
      {
        key: "maxOutputChars",
        type: "integer",
        default: 16e3,
        min: 1,
        label: "\u5355\u6B21\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u7B26\uFF09",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "tool-ralph",
    title: "\u5B50\u4EE3\u7406\u5FAA\u73AF\uFF08ralph\uFF09",
    plugin: "@deepseek-ai/dsh-tool-ralph",
    description: "\u8BA9\u6A21\u578B\u628A\u4E00\u4EF6\u4E8B\u62C6\u6210\u591A\u8F6E\u4EA4\u7ED9\u5B50\u4EE3\u7406\u8DD1\u3002",
    fields: [
      {
        key: "maxRounds",
        type: "integer",
        default: 64,
        min: 1,
        label: "\u6700\u5927\u8F6E\u6570",
        help: "\u4E00\u6B21 ralph \u8C03\u7528\u5141\u8BB8\u7684\u5FAA\u73AF\u8F6E\u6570\u4E0A\u9650\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "tool-todo",
    title: "\u5F85\u529E\u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-tool-todo",
    description: "\u6A21\u578B\u81EA\u5DF1\u7EF4\u62A4\u7684\u4EFB\u52A1\u6E05\u5355\u3002",
    fields: [
      {
        key: "allowParallelInProgress",
        type: "boolean",
        default: true,
        label: "\u5141\u8BB8\u591A\u4E2A\u8FDB\u884C\u4E2D",
        help: "\u5173\u6389\u540E\u540C\u4E00\u65F6\u523B\u53EA\u5141\u8BB8\u4E00\u6761\u5F85\u529E\u5904\u4E8E\u8FDB\u884C\u4E2D\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "repeat-tool-reminder",
    title: "\u91CD\u590D\u8C03\u7528\u63D0\u9192",
    plugin: "@deepseek-ai/dsh-repeat-tool-reminder",
    description: "\u540C\u4E00\u4E2A\u5DE5\u5177\u8FDE\u7EED\u7528\u540C\u6837\u53C2\u6570\u8C03\u7528\u65F6\u63D2\u5165\u63D0\u9192\u3002",
    fields: [
      {
        key: "thresholds",
        type: "integer-list",
        default: [3, 5, 8],
        min: 1,
        label: "\u63D0\u9192\u6B21\u6570\u70B9",
        help: "\u9012\u589E\u7684\u6B63\u6574\u6570\uFF0C\u9017\u53F7\u5206\u9694\uFF1B\u5728\u7B2C\u51E0\u6B21\u91CD\u590D\u65F6\u63D0\u9192\u3002"
      },
      {
        key: "argumentsPreviewChars",
        type: "integer",
        default: 500,
        min: 1,
        label: "\u53C2\u6570\u9884\u89C8\u957F\u5EA6\uFF08\u5B57\u7B26\uFF09",
        help: ""
      }
    ],
    crossRules: [
      { kind: "increasing", field: "thresholds", message: "\u63D0\u9192\u6B21\u6570\u70B9\u5FC5\u987B\u4E25\u683C\u9012\u589E\u3002" }
    ]
  },
  {
    id: "tool-web",
    title: "\u8054\u7F51\u641C\u7D22\u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-tool-web",
    description: "\u53EA\u66B4\u9732\u641C\u7D22\u8D85\u65F6\u3002\u6293\u53D6\uFF08fetch\uFF09\u88AB\u4E0A\u6E38\u523B\u610F\u5173\u6389\uFF0C\u9762\u677F\u4E0D\u63D0\u4F9B\u5F00\u5173\u3002",
    fields: [
      {
        key: "searchTimeoutMs",
        type: "integer",
        default: 6e4,
        min: 1,
        label: "\u641C\u7D22\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: ""
      }
    ],
    crossRules: []
  },
  {
    id: "agent-loop",
    title: "\u4EE3\u7406\u4E3B\u5FAA\u73AF",
    plugin: "@deepseek-ai/dsh-agent-loop",
    description: "\u6A21\u578B\u4E00\u8F6E\u91CC\u80FD\u540C\u65F6\u53D1\u51FA\u51E0\u4E2A\u5DE5\u5177\u8C03\u7528\u3002",
    fields: [
      {
        key: "maxParallelToolCalls",
        type: "integer",
        default: 10,
        min: 1,
        label: "\u5E76\u884C\u5DE5\u5177\u8C03\u7528\u4E0A\u9650",
        help: "\u540C\u4E00\u8F6E\u91CC\u6700\u591A\u540C\u65F6\u5728\u8DD1\u7684\u5DE5\u5177\u6570\uFF0C\u8D85\u51FA\u7684\u6392\u961F\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "goal",
    title: "\u76EE\u6807\uFF08goal\uFF09",
    plugin: "@deepseek-ai/dsh-goal",
    description: "\u6A21\u578B\u628A\u4E00\u4EF6\u4E8B\u767B\u8BB0\u6210 goal \u4E4B\u540E\u81EA\u52A8\u63A8\u8FDB\u7684\u8F6E\u6570\u4E0A\u9650\u3002",
    fields: [
      {
        key: "defaultMaxGoalRounds",
        type: "integer",
        default: 256,
        min: 1,
        label: "\u9ED8\u8BA4\u6700\u5927\u8F6E\u6570",
        help: "\u521B\u5EFA goal \u65F6\u6CA1\u5355\u72EC\u6307\u5B9A\u8F6E\u6570\u5C31\u7528\u5B83\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "jobs",
    title: "\u540E\u53F0\u4EFB\u52A1",
    plugin: "@deepseek-ai/dsh-jobs-local",
    description: "\u540E\u53F0\u8DD1\u7684\u547D\u4EE4\u4E0E\u5B50\u4EE3\u7406\u5171\u7528\u540C\u4E00\u4EFD\u5E76\u53D1\u989D\u5EA6\u3002",
    fields: [
      {
        key: "maxConcurrentJobsPerOwner",
        type: "integer",
        default: 10,
        min: 1,
        label: "\u6BCF\u4E2A\u6240\u6709\u8005\u5E76\u53D1\u4E0A\u9650",
        help: "\u8D85\u8FC7\u540E\u65B0\u4EFB\u52A1\u76F4\u63A5\u88AB\u62D2\uFF0C\u4E0D\u6392\u961F\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "bash-sandbox",
    title: "Bash \u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-bash-sandbox",
    description: "\u6A21\u578B\u8DD1 shell \u547D\u4EE4\u65F6\u7684\u8D85\u65F6\u3001\u8F93\u51FA\u4E0E\u5916\u6EA2\u9884\u7B97\u3002",
    fields: [
      {
        key: "timeoutMs",
        type: "integer",
        default: 12e4,
        min: 1,
        label: "\u9ED8\u8BA4\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u6CA1\u6307\u5B9A\u8D85\u65F6\u65F6\u7528\u5B83\uFF0C\u4E14\u4F1A\u88AB\u6700\u5927\u8D85\u65F6\u622A\u65AD\u3002"
      },
      {
        key: "maxTimeoutMs",
        type: "integer",
        default: 6e5,
        min: 1,
        label: "\u6700\u5927\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u81EA\u5DF1\u6307\u5B9A\u7684\u8D85\u65F6\u4E5F\u4E0D\u4F1A\u8D85\u8FC7\u8FD9\u4E2A\u503C\u3002"
      },
      {
        key: "maxOutputBytes",
        type: "integer",
        default: 64e3,
        min: 1,
        label: "\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u51FA\u7684\u90E8\u5206\u843D\u5230\u5916\u6EA2\u6587\u4EF6\u91CC\u3002"
      },
      {
        key: "maxSpillBytes",
        type: "integer",
        default: 67108864,
        min: 1,
        label: "\u5916\u6EA2\u6587\u4EF6\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "graceMs",
        type: "integer",
        default: 3e3,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "SIGTERM \u5BBD\u9650\uFF08\u6BEB\u79D2\uFF09",
        help: "\u8D85\u65F6\u540E\u5148\u53D1 SIGTERM\uFF0C\u7B49\u8FD9\u4E48\u4E45\u518D SIGKILL\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "pwsh-sandbox",
    title: "PowerShell \u5DE5\u5177",
    plugin: "@deepseek-ai/dsh-pwsh-sandbox",
    description: "\u4E0E Bash \u5DE5\u5177\u540C\u6784\u7684\u4E00\u5957\u9884\u7B97\uFF0C\u53EA\u5728\u88C5\u4E86 PowerShell \u7684\u673A\u5668\u4E0A\u7528\u5F97\u4E0A\u3002",
    fields: [
      {
        key: "timeoutMs",
        type: "integer",
        default: 12e4,
        min: 1,
        label: "\u9ED8\u8BA4\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u6CA1\u6307\u5B9A\u8D85\u65F6\u65F6\u7528\u5B83\uFF0C\u4E14\u4F1A\u88AB\u6700\u5927\u8D85\u65F6\u622A\u65AD\u3002"
      },
      {
        key: "maxTimeoutMs",
        type: "integer",
        default: 6e5,
        min: 1,
        label: "\u6700\u5927\u8D85\u65F6\uFF08\u6BEB\u79D2\uFF09",
        help: "\u6A21\u578B\u81EA\u5DF1\u6307\u5B9A\u7684\u8D85\u65F6\u4E5F\u4E0D\u4F1A\u8D85\u8FC7\u8FD9\u4E2A\u503C\u3002"
      },
      {
        key: "maxOutputBytes",
        type: "integer",
        default: 64e3,
        min: 1,
        label: "\u8F93\u51FA\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: "\u8D85\u51FA\u7684\u90E8\u5206\u843D\u5230\u5916\u6EA2\u6587\u4EF6\u91CC\u3002"
      },
      {
        key: "maxSpillBytes",
        type: "integer",
        default: 67108864,
        min: 1,
        label: "\u5916\u6EA2\u6587\u4EF6\u4E0A\u9650\uFF08\u5B57\u8282\uFF09",
        help: ""
      },
      {
        key: "graceMs",
        type: "integer",
        default: 3e3,
        min: 1,
        max: MAX_TIMER_DELAY_MS,
        label: "SIGTERM \u5BBD\u9650\uFF08\u6BEB\u79D2\uFF09",
        help: "\u8D85\u65F6\u540E\u5148\u53D1 SIGTERM\uFF0C\u7B49\u8FD9\u4E48\u4E45\u518D SIGKILL\u3002"
      }
    ],
    crossRules: []
  },
  {
    id: "skill",
    title: "\u6280\u80FD\uFF08skill\uFF09",
    plugin: "@deepseek-ai/dsh-skill",
    description: "\u6280\u80FD\u76EE\u5F55\u626B\u63CF\u7ED3\u679C\u7684\u7F13\u5B58\u6761\u6570\u3002",
    fields: [
      {
        key: "collectCacheMaxEntries",
        type: "integer",
        default: 128,
        min: 1,
        label: "\u626B\u63CF\u7F13\u5B58\u6761\u6570\u4E0A\u9650",
        help: ""
      }
    ],
    crossRules: []
  }
];

// src/harness-config/catalog-entries.js
var CATALOG = [...TOOL_ENTRIES, ...MODEL_ENTRIES];

// src/harness-config/catalog.js
var BY_ID = new Map(CATALOG.map((entry) => [entry.id, entry]));
function catalogEntry(id) {
  return BY_ID.get(id);
}
function catalogField(id, key) {
  return BY_ID.get(id)?.fields.find((field) => field.key === key);
}
function coerceField(field, raw) {
  if (field.type === "boolean") {
    if (typeof raw !== "boolean") return { error: `${field.label} \u5FC5\u987B\u662F\u5E03\u5C14\u503C` };
    return { value: raw };
  }
  if (field.type === "integer-list") {
    if (!Array.isArray(raw)) return { error: `${field.label} \u5FC5\u987B\u662F\u6570\u7EC4` };
    const out = [];
    for (const item of raw) {
      if (!Number.isInteger(item)) return { error: `${field.label} \u7684\u6BCF\u4E00\u9879\u5FC5\u987B\u662F\u6574\u6570` };
      if (field.min !== void 0 && item < field.min) return { error: `${field.label} \u7684\u6BCF\u4E00\u9879\u4E0D\u80FD\u5C0F\u4E8E ${field.min}` };
      out.push(item);
    }
    if (out.length === 0) return { error: `${field.label} \u4E0D\u80FD\u4E3A\u7A7A` };
    return { value: out };
  }
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { error: `${field.label} \u5FC5\u987B\u662F\u6570\u5B57` };
  if (field.type === "integer" && !Number.isInteger(raw)) return { error: `${field.label} \u5FC5\u987B\u662F\u6574\u6570` };
  if (field.min !== void 0) {
    if (field.exclusive ? raw <= field.min : raw < field.min) {
      return { error: `${field.label} \u5FC5\u987B${field.exclusive ? "\u5927\u4E8E" : "\u4E0D\u5C0F\u4E8E"} ${field.min}` };
    }
  }
  if (field.max !== void 0) {
    if (field.exclusive ? raw >= field.max : raw > field.max) {
      return { error: `${field.label} \u5FC5\u987B${field.exclusive ? "\u5C0F\u4E8E" : "\u4E0D\u5927\u4E8E"} ${field.max}` };
    }
  }
  return { value: raw };
}
function checkCrossRules(entry, values) {
  const problems = [];
  for (const rule of entry.crossRules) {
    if (rule.kind === "lessThan") {
      const a = pick(values, rule.field, entry);
      const b = pick(values, rule.than, entry);
      if (typeof a === "number" && typeof b === "number" && !(a < b)) problems.push(rule.message);
    } else if (rule.kind === "sumAtMost") {
      const sum = rule.fields.reduce((acc, key) => acc + toNumber(pick(values, key, entry)), rule.plus);
      const cap = pick(values, rule.atMost, entry);
      if (typeof cap === "number" && sum > cap) problems.push(rule.message);
    } else if (rule.kind === "increasing") {
      const list = pick(values, rule.field, entry);
      if (Array.isArray(list)) {
        for (let i = 1; i < list.length; i += 1) {
          if (!(list[i - 1] < list[i])) {
            problems.push(rule.message);
            break;
          }
        }
      }
    }
  }
  return problems;
}
function pick(values, key, entry) {
  if (values[key] !== void 0) return values[key];
  return entry.fields.find((field) => field.key === key)?.default;
}
function toNumber(value) {
  return typeof value === "number" ? value : 0;
}

// src/harness-config/profile.js
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

// src/harness-config/patch-file.js
import { renameSync, writeFileSync } from "node:fs";
var MANAGED_BEGIN_PREFIX = "# >>> dsh-operation-improve";
var MANAGED_END = "# <<< dsh-operation-improve";
var BEGIN_LINE = `${MANAGED_BEGIN_PREFIX}: \u300CHarness \u9AD8\u7EA7\u914D\u7F6E\u300D\u9762\u677F\u6258\u7BA1\u533A\u6BB5`;
var NOTE_LINES = [
  "# \u8FD9\u4E00\u6BB5\u7531\u8BBE\u7F6E\u9762\u677F\u6574\u4F53\u91CD\u5199\uFF0C\u624B\u6539\u4F1A\u5728\u4E0B\u6B21\u4FDD\u5B58\u65F6\u4E22\u5931\uFF1B\u8981\u624B\u5199\u8BF7\u653E\u5230\u6807\u8BB0\u4E4B\u5916\u3002",
  "# \u79FB\u9664\u672C\u63D2\u4EF6\u4E0D\u4F1A\u6E05\u7A7A\u8FD9\u4E00\u6BB5\uFF0C\u5199\u4E0B\u7684\u914D\u7F6E\u7167\u6837\u751F\u6548\u3002"
];
var MANAGED_NOTE = "    # \u2193 \u7531\u300CHarness \u9AD8\u7EA7\u914D\u7F6E\u300D\u9762\u677F\u8BBE\u7F6E";
var RESTATE_NOTE = "    # \u2193 \u9762\u677F\u4E4B\u5916\u5DF2\u6709\u7684\u503C\uFF0C\u539F\u6837\u91CD\u8FF0\uFF1Apatch \u6309 id \u547D\u4E2D\u4F1A\u6574\u4F53\u66FF\u6362 config\uFF0C\u4E0D\u91CD\u8FF0\u5C31\u88AB\u62B9\u6389\u4E86";
var MANAGED_HEADER_PREFIX = "# managed: ";
function splitManaged(text) {
  const lines = text.split("\n");
  let begin = -1;
  let end = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (begin === -1) {
      if (lines[i].startsWith(MANAGED_BEGIN_PREFIX)) begin = i;
      continue;
    }
    if (lines[i].startsWith(MANAGED_END)) {
      end = i;
      break;
    }
  }
  if (begin === -1) return { before: text, section: "", after: "", found: false };
  if (end === -1) {
    throw new Error(`${MANAGED_BEGIN_PREFIX} \u6709\u5F00\u6807\u8BB0\u4F46\u627E\u4E0D\u5230\u95ED\u6807\u8BB0 ${MANAGED_END}\uFF0C\u62D2\u7EDD\u6539\u5199`);
  }
  let start = begin;
  if (start > 0 && lines[start - 1] === "") start -= 1;
  const before = start > 0 ? `${lines.slice(0, start).join("\n")}
` : "";
  const section = `${lines.slice(start, end + 1).join("\n")}
`;
  const after = lines.slice(end + 1).join("\n");
  return { before, section, after, found: true };
}
function readManagedHeader(section) {
  for (const line of section.split("\n")) {
    if (!line.startsWith(MANAGED_HEADER_PREFIX)) continue;
    try {
      const parsed = JSON.parse(line.slice(MANAGED_HEADER_PREFIX.length));
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return null;
}
function countSectionItems(section) {
  let count = 0;
  for (const line of section.split("\n")) if (line.startsWith("- ")) count += 1;
  return count;
}
function renderSection(plans, separator) {
  if (plans.length === 0) return "";
  const header = {};
  for (const plan of plans) header[plan.id] = plan.managed.map(([key]) => key);
  const out = [];
  if (separator) out.push("");
  out.push(BEGIN_LINE, ...NOTE_LINES, MANAGED_HEADER_PREFIX + JSON.stringify(header));
  for (const plan of plans) {
    out.push(`- id: ${plan.id}`);
    out.push("  config:");
    if (plan.managed.length > 0) {
      out.push(MANAGED_NOTE);
      for (const [key, value] of plan.managed) out.push(...serializeLines(key, value, 4));
    }
    if (plan.restated.length > 0) {
      out.push(RESTATE_NOTE);
      for (const [key, value] of plan.restated) out.push(...serializeLines(key, value, 4));
    }
  }
  out.push(MANAGED_END);
  return `${out.join("\n")}
`;
}
function composeFile(before, section, after) {
  let head = before;
  if (head.length > 0 && !head.endsWith("\n")) head += "\n";
  const text = head + section + after;
  return hasTopLevelItem(text) ? text : `${text}${text.endsWith("\n") || text.length === 0 ? "" : "\n"}[]
`;
}
function hasTopLevelItem(text) {
  for (const line of text.split("\n")) {
    if (line.startsWith("- ") || line === "-") return true;
    const trimmed = line.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("!!")) return true;
  }
  return false;
}
function writeAtomic(path, text) {
  const tmp = `${path}.dsh-oi.tmp`;
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}
function serializeLines(key, value, indent) {
  const pad = " ".repeat(indent);
  if (isScalar(value)) return [`${pad}${key}: ${scalar(value)}`];
  if (Array.isArray(value)) {
    if (value.length === 0) return [`${pad}${key}: []`];
    if (value.every(isScalar)) return [`${pad}${key}: [${value.map(scalar).join(", ")}]`];
    const lines = [`${pad}${key}:`];
    for (const item of value) {
      if (isScalar(item)) {
        lines.push(`${pad}  - ${scalar(item)}`);
        continue;
      }
      throw new Error(`\u65E0\u6CD5\u5E8F\u5217\u5316 ${key}\uFF1A\u6570\u7EC4\u91CC\u51FA\u73B0\u4E86\u5D4C\u5957\u7ED3\u6784`);
    }
    return lines;
  }
  if (typeof value === "object" && value !== null) {
    const lines = [`${pad}${key}:`];
    for (const [childKey, childValue] of Object.entries(value)) {
      if (childValue === void 0) continue;
      lines.push(...serializeLines(childKey, childValue, indent + 2));
    }
    return lines;
  }
  throw new Error(`\u65E0\u6CD5\u5E8F\u5217\u5316 ${key}\uFF1A${typeof value} \u4E0D\u662F JSON \u53EF\u8868\u8FBE\u7684\u503C`);
}
function isScalar(value) {
  if (value === null) return true;
  if (typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string";
}
function scalar(value) {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  return JSON.stringify(value);
}

// src/harness-config/profile.js
var BIN_NAME = "@Tinnikx/dsh-operation-improve";
var bootPromise;
function loadBoot() {
  bootPromise ??= (async () => {
    const bin = process.argv[1];
    if (bin === void 0) throw new Error("\u62FF\u4E0D\u5230 dsh \u5165\u53E3\u8DEF\u5F84\uFF08process.argv[1] \u4E3A\u7A7A\uFF09");
    const resolved = createRequire(bin).resolve("@deepseek-ai/dsh-app-boot");
    return {
      boot: await import(pathToFileURL(resolved).href),
      installAnchor: join(dirname(bin), "..", "package.json")
    };
  })();
  return bootPromise;
}
function currentProfileName() {
  const argv = process.argv;
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--profile") return argv[i + 1] ?? null;
    if (argv[i].startsWith("--profile=")) return argv[i].slice("--profile=".length);
  }
  return null;
}
function findConfig(entries, id) {
  for (const entry of entries) {
    if (entry.id === id) return { present: true, config: entry.config };
    if (Array.isArray(entry.config)) {
      const hit = findConfig(entry.config, id);
      if (hit.present) return hit;
    }
  }
  return { present: false, config: void 0 };
}
function liveConfig(ctx, id) {
  if (ctx?.loader === void 0) return void 0;
  for (const entry of ctx.loader.entries()) {
    if (entry.options?.id === id) return entry.options.config;
  }
  return void 0;
}
async function readState(ctx) {
  const { boot, installAnchor } = await loadBoot();
  const name2 = currentProfileName();
  if (name2 === null) throw new Error("\u5F53\u524D harness \u4E0D\u662F\u7528 --profile \u542F\u52A8\u7684\uFF0C\u6CA1\u6709\u7528\u6237 patch \u5C42\u53EF\u5199");
  const dir = boot.resolveProfileDir(name2);
  const patchPath = join(dir, boot.PROFILE_PATCH_FILENAME);
  const text = existsSync(patchPath) ? readFileSync(patchPath, "utf8") : "";
  const parts = splitManaged(text);
  const sectionItems = countSectionItems(parts.section);
  const warnings = [];
  let profile;
  try {
    profile = boot.loadProfile(BIN_NAME, name2, installAnchor, void 0, { userLayer: true });
  } catch (error) {
    warnings.push(`\u7528\u6237 patch \u5C42\u8BFB\u4E0D\u4E86\uFF0C\u9762\u677F\u53EA\u663E\u793A bundle \u9ED8\u8BA4\u503C\uFF1A${error.message}`);
    profile = boot.loadProfile(BIN_NAME, name2, installAnchor, void 0, { userLayer: false });
  }
  const layers = profile.layers.map((layer) => layer.patches);
  const bundleEntries = boot.composeEntries(layers);
  const owners = attributeLayers(boot, profile.layers);
  const effectiveEntries = boot.composeEntries([...layers, profile.patches]);
  const tailOk = !/^-[ \t]/m.test(parts.after);
  let outsideEntries = null;
  let sectionPatches = [];
  if (tailOk && profile.patches.length >= sectionItems) {
    sectionPatches = profile.patches.slice(profile.patches.length - sectionItems);
    outsideEntries = boot.composeEntries([...layers, profile.patches.slice(0, profile.patches.length - sectionItems)]);
  } else {
    warnings.push("\u6258\u7BA1\u533A\u6BB5\u4E0D\u5728\u6587\u4EF6\u672B\u5C3E\uFF08\u95ED\u6807\u8BB0\u4E4B\u540E\u8FD8\u6709\u9876\u5C42\u6761\u76EE\uFF09\uFF0C\u9762\u677F\u62D2\u7EDD\u5199\u5165\u3002\u628A\u624B\u5199\u6761\u76EE\u632A\u5230\u5F00\u6807\u8BB0\u4E4B\u524D\u5373\u53EF\u6062\u590D\u3002");
  }
  const header = readManagedHeader(parts.section);
  const state = {};
  for (const entry of CATALOG) {
    const bundle = findConfig(bundleEntries, entry.id);
    const effective = findConfig(effectiveEntries, entry.id);
    const outside = outsideEntries === null ? null : findConfig(outsideEntries, entry.id);
    const sectionConfig = sectionPatches.find((patch) => patch.id === entry.id)?.config;
    const managed = header?.[entry.id] ?? (sectionConfig === void 0 ? [] : Object.keys(sectionConfig));
    state[entry.id] = {
      present: effective.present,
      bundle: bundle.present ? bundle.config ?? {} : null,
      outside: outside === null ? null : outside.present ? outside.config ?? {} : null,
      effective: effective.present ? effective.config ?? {} : null,
      managed: managed.filter((key) => catalogField(entry.id, key) !== void 0),
      managedValues: pickManaged(sectionConfig, managed),
      bundleOwners: owners[entry.id] ?? {},
      live: liveConfig(ctx, entry.id) ?? null
    };
  }
  return {
    profile: { name: name2, dir, patchPath, hasSection: parts.found, writable: outsideEntries !== null },
    warnings,
    state
  };
}
function attributeLayers(boot, layers) {
  const owners = {};
  const previous = {};
  for (const [index, layer] of layers.entries()) {
    const snapshot = boot.composeEntries(layers.slice(0, index + 1).map((one) => one.patches));
    for (const entry of CATALOG) {
      const config = findConfig(snapshot, entry.id).config ?? {};
      const before = previous[entry.id] ?? {};
      owners[entry.id] ??= {};
      const own = owners[entry.id];
      for (const key of Object.keys(own)) if (config[key] === void 0) delete own[key];
      for (const field of entry.fields) {
        const value = config[field.key];
        if (value === void 0) continue;
        if (JSON.stringify(before[field.key]) !== JSON.stringify(value)) own[field.key] = layer.packageName;
      }
      previous[entry.id] = config;
    }
  }
  return owners;
}
function pickManaged(sectionConfig, managed) {
  const out = {};
  if (sectionConfig === void 0) return out;
  for (const key of managed) if (sectionConfig[key] !== void 0) out[key] = sectionConfig[key];
  return out;
}
async function applyOps(ctx, ops) {
  const current = await readState(ctx);
  if (!current.profile.writable) {
    return { ok: false, status: 409, errors: current.warnings };
  }
  const errors = [];
  const managed = /* @__PURE__ */ new Map();
  for (const entry of CATALOG) {
    managed.set(entry.id, { ...current.state[entry.id].managedValues });
  }
  const touched = /* @__PURE__ */ new Set();
  for (const op of ops) {
    const entry = catalogEntry(op.id);
    const field = catalogField(op.id, op.field);
    if (entry === void 0 || field === void 0) {
      errors.push(`\u4E0D\u5728\u6E05\u5355\u91CC\u7684\u914D\u7F6E\u9879\uFF1A${op.id}.${op.field}`);
      continue;
    }
    if (!current.state[op.id].present) {
      errors.push(`${entry.title}\uFF08${op.id}\uFF09\u4E0D\u5728\u5F53\u524D profile \u91CC\uFF0C\u65E0\u6CD5\u914D\u7F6E`);
      continue;
    }
    touched.add(op.id);
    if (op.op === "unset") {
      delete managed.get(op.id)[op.field];
      continue;
    }
    if (op.op !== "set") {
      errors.push(`\u672A\u77E5\u64CD\u4F5C ${op.op}`);
      continue;
    }
    const coerced = coerceField(field, op.value);
    if ("error" in coerced) {
      errors.push(`${entry.title}\uFF1A${coerced.error}`);
      continue;
    }
    managed.get(op.id)[op.field] = coerced.value;
  }
  if (errors.length > 0) return { ok: false, status: 400, errors };
  for (const id of touched) {
    const entry = catalogEntry(id);
    const merged = { ...current.state[id].outside ?? {}, ...managed.get(id) };
    for (const problem of checkCrossRules(entry, merged)) errors.push(`${entry.title}\uFF1A${problem}`);
  }
  if (errors.length > 0) return { ok: false, status: 400, errors };
  const plans = [];
  for (const entry of CATALOG) {
    const values = managed.get(entry.id);
    const keys = Object.keys(values);
    if (keys.length === 0) continue;
    const outside = current.state[entry.id].outside ?? {};
    plans.push({
      id: entry.id,
      managed: entry.fields.filter((f) => keys.includes(f.key)).map((f) => [f.key, values[f.key]]),
      restated: Object.entries(outside).filter(([key]) => !keys.includes(key))
    });
  }
  const text = existsSync(current.profile.patchPath) ? readFileSync(current.profile.patchPath, "utf8") : "";
  const parts = splitManaged(text);
  const section = renderSection(plans, parts.before.length > 0);
  writeAtomic(current.profile.patchPath, composeFile(parts.before, section, parts.after));
  return { ok: true, state: await readState(ctx) };
}

// src/harness-config/route-path.js
var HARNESS_CONFIG_ROUTE = "/operation-improve/harness-config";

// src/harness-config/route.js
var MAX_BODY_BYTES = 1 << 20;
function mountHarnessConfigRoute(ctx) {
  const handler = (req, res) => {
    void serve(ctx, req, res).catch((error) => {
      send(res, 500, { ok: false, errors: [String(error?.message ?? error)] });
    });
  };
  ctx.effect(
    () => ctx.webServer.register({ kind: "exact", path: HARNESS_CONFIG_ROUTE, handler }),
    "@Tinnikx/dsh-operation-improve: harness config route"
  );
}
async function serve(ctx, req, res) {
  if (req.method === "GET") {
    send(res, 200, { ok: true, catalog: CATALOG, ...await readState(ctx) });
    return;
  }
  if (req.method !== "POST") {
    send(res, 405, { ok: false, errors: [`\u4E0D\u652F\u6301\u7684\u65B9\u6CD5 ${req.method}`] });
    return;
  }
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (error) {
    send(res, 400, { ok: false, errors: [`\u8BF7\u6C42\u4F53\u4E0D\u662F\u5408\u6CD5 JSON\uFF1A${error.message}`] });
    return;
  }
  if (!Array.isArray(body?.ops)) {
    send(res, 400, { ok: false, errors: ["\u8BF7\u6C42\u4F53\u9700\u8981 { ops: [...] }"] });
    return;
  }
  const result = await applyOps(ctx, body.ops);
  if (!result.ok) {
    send(res, result.status, { ok: false, errors: result.errors });
    return;
  }
  send(res, 200, { ok: true, catalog: CATALOG, ...result.state });
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("\u8BF7\u6C42\u4F53\u8FC7\u5927"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}
function send(res, status, payload) {
  if (res.writableEnded) return;
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(text);
}

// src/index.js
var name = "@Tinnikx/dsh-operation-improve";
var inject = ["webServer", "loader"];
function apply(ctx) {
  mountHarnessConfigRoute(ctx);
}
export {
  apply,
  inject,
  name
};
