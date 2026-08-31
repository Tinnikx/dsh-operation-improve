/**
 * 精选清单里那些**上游会硬抛的数值边界**，被两组条目共用。
 *
 * 单独成模，是因为它们不是「合理取值」而是加载器的判据：低于 / 高于它上游直接拒绝
 * 加载对应 entry，而 patch 是热的，写下去那一刻那棵子树就起不来了。有几个数字看起来
 * 没来由——它们是清单**不暴露**的相邻键的默认值，改动上游那个默认，这里的镜像连方向
 * 都不对了，只能靠重读上游 schema 跟上。
 */

/** `dsh-compaction-tool-result-pruner` 的省略标记长度（码点），计入 emitted 预算。 */
export const PRUNE_MARKER_CHARS = 39

/** `setTimeout` 的延迟上限；上游按它拒绝过大的超时配置。 */
export const MAX_TIMER_DELAY_MS = 2147483647

/** `llm-deepseek` 不暴露的 `imageOffloadByteQuantum` 默认值，它不能超过请求文件总上限。 */
export const IMAGE_OFFLOAD_BYTE_QUANTUM = 67108864

/** 同上，`inlineImageOffloadByteQuantum` 的默认值，它不能超过内联图片上限。 */
export const INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM = 10485760

/** `llm-deepseek` 不暴露的 `fileRefreshMarginSeconds` 默认值，保留时长必须**严格大于**它。 */
export const FILE_REFRESH_MARGIN_SECONDS = 3600

/** `session-query-sqlite` 的分页硬上限。 */
export const SQLITE_MAX_PAGE_LIMIT = Number.MAX_SAFE_INTEGER - 1
