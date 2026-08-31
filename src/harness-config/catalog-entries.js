/**
 * 精选清单的拼装点与收录口径，校验与查询在 [catalog.js](catalog.js)，
 * 条目本体分两组：[catalog-tools.js](catalog-tools.js) 与 [catalog-model.js](catalog-model.js)，
 * 两组共用的数值边界在 [catalog-limits.js](catalog-limits.js)。
 *
 * 收录口径三条，缺一条就不收：
 *
 * - **只能手改 `cordis.patch.yml`**。`ctx.settings` 那条路（模型页、外观页）够得到的
 *   不收，收了就是两个入口写同一个值。
 * - **值是数字或布尔**。字符串、枚举、对象、数组结构面板表达不了；写进托管区段还要
 *   原样重述，猜出来的 YAML 比不写更糟。
 * - **entry 现在的 config 里没有 `__jsExpr`**。那是加载时求值的表达式，重述时会被序列化
 *   成普通映射，静默改掉行为。`tools`、`sandbox-policy`、`approval`、`webserver` 等因此
 *   不在清单里。
 *
 * `default` 只用于界面提示，**从不写进文件**：未设置就是键不存在，走 harness 自己的默认。
 * 上游改了默认，最坏是提示过时，行为不受影响。少数键（`session-title` 那几个）上游 schema
 * 本来就没有默认值，此处填的是 bundle 层给的值。
 *
 * `min` / `max` / `crossRules` 镜像上游会**硬抛**的边界。镜像不是装饰——patch 是热的，
 * 写下去那一刻整棵树就起不来了。
 *
 * 数组顺序就是面板里卡片的顺序。
 */

import { MODEL_ENTRIES } from './catalog-model.js'
import { TOOL_ENTRIES } from './catalog-tools.js'

/** @type {readonly object[]} */
export const CATALOG = [...TOOL_ENTRIES, ...MODEL_ENTRIES]
