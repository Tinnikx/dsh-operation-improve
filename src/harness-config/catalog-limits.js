/**
 * 精选清单里那些**上游会硬抛的数值边界**，被两组条目共用。
 *
 * 单独成模，是因为它们不是「合理取值」而是加载器的判据：低于 / 高于它上游直接拒绝
 * 加载对应 entry，而 patch 是热的，写下去那一刻那棵子树就起不来了。
 *
 * 下面三个字节 / 秒数不是边界而是**上游某键的默认值**——那几个键 0.1.7 起收进了清单，
 * 与相邻键的约束改由 `crossRules` 跑在合成值上（[catalog-model.js](catalog-model.js) 的
 * llm-deepseek 那四条）。留在这里是因为面板的 `default` 提示与 `crossRules` 的回落值
 * 都要用同一个数；上游改了它，这两边一起过时。
 */

/** `setTimeout` 的延迟上限；上游按它拒绝过大的超时配置。 */
export const MAX_TIMER_DELAY_MS = 2147483647

/** `llm-deepseek` 的 `imageOffloadByteQuantum` 默认值（Files 引用那一路的转存步长）。 */
export const IMAGE_OFFLOAD_BYTE_QUANTUM = 67108864

/** 同上，`inlineImageOffloadByteQuantum` 的默认值（内联那一路）。 */
export const INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM = 10485760

/** 同上，`fileRefreshMarginSeconds` 的默认值（续期余量）。 */
export const FILE_REFRESH_MARGIN_SECONDS = 3600

/** `session-query-sqlite` 的分页硬上限。 */
export const SQLITE_MAX_PAGE_LIMIT = Number.MAX_SAFE_INTEGER - 1
