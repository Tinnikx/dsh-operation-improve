/**
 * 精选清单的拼装点与收录口径，校验与查询在 [catalog.js](catalog.js)，
 * 条目本体分两组：[catalog-tools.js](catalog-tools.js) 与 [catalog-model.js](catalog-model.js)，
 * 两组共用的数值边界在 [catalog-limits.js](catalog-limits.js)。
 *
 * 收录口径四条，缺一条就不收：
 *
 * - **只能手改 `cordis.patch.yml`**。`ctx.settings` 那条路（模型页、外观页）够得到的
 *   不收，收了就是两个入口写同一个值。
 * - **这条 entry 的 config 有活的消费者**。web 产品里 `dsh-web-app` 把 host 平面的
 *   `compaction-basic`、`tool-result-pruner`、`tool-ralph`、`tool-todo`、`tool-web`
 *   全部 `disabled: true`，改由 agent preset（`agent.cordis.yml`）按会话另挂一棵独立
 *   Include 树，**用户 patch 层不流进 preset 树**——这五行的 config 写了也到不了任何
 *   会话。注意归属按**包**判断，不按 id：preset 挂的 `dsh-tool-bash`/`dsh-tool-pwsh`
 *   与 host 的 `dsh-bash-sandbox`/`dsh-pwsh-sandbox` 是两回事，后两张卡照收。
 * - **值是数字或布尔**。字符串、枚举、对象、数组结构面板表达不了；写进托管区段还要
 *   原样重述，猜出来的 YAML 比不写更糟。
 * - **entry 现在的 config 里没有 `__jsExpr`**。那是加载时求值的表达式，重述时会被序列化
 *   成普通映射，静默改掉行为。`tools`、`sandbox-policy`、`approval`、`webserver` 等因此
 *   不在清单里。
 *
 * **`effect` 标记**：改完之后这个值什么时候被用上。挂 entry 上的是该卡片的整体口径，
 * 个别字段行为不同时才在字段上再挂一个盖掉它：
 *
 * - `'immediate'`——保存即用上：下一次执行到这条路径的代码就读新值（如 Bash 工具的
 *   下一条命令）。
 * - `'session'`——保存即生效，但已开的会话沿用打开时的快照：对之后开的会话生效。
 * - `'nextRequest'` / `'nextQuery'` / `'nextAttachment'` / `'nextSession'`——保存即
 *   生效，按动作取名：该插件的下一轮请求 / 查询 / 入库 / 新会话就按新值执行。
 * - `'restart'`——保存了也用不上，要重启 harness：只有 start 时读一次的键才配得上它。
 *   机制上（`Fiber.update` 对 config 变化做 dispose + 重新 apply）不存在「保存了但跑着
 *   的进程读不到」的键，所以 `'restart'` 之外一律不需要任何操作。例外是
 *   `session-query-sqlite`：harness 0.1.6-alpha.2 的热重挂对它有缺陷（重挂摘除
 *   `sessionController` 且静默挂起，会话列表全空直到重启），整张卡因此按 `'restart'`
 *   口径标注，复现与取证见 [docs/harness-hmr-session-defect.md](../../docs/harness-hmr-session-defect.md)。
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
