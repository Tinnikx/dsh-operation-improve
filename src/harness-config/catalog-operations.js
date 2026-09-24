/**
 * 清单的第三组：**插件安装与 profile 运维**——插件管理页背后那台执行器的预算。
 * 收录口径与拼装顺序在 [catalog-entries.js](catalog-entries.js)。
 *
 * 口径 #1 在这一组上是查实的：这些键只被 host 侧读，插件管理页自己一个都没渲染
 * （`plugins.bundle.config` 那个槽要条目自己注册表单，`dsh-plugin-manager` 与它的
 * client 半边都没注册），所以面板是唯一入口。
 *
 * 反例是 `ui-plugin-manager` 的 registryProbe 三枚：那是 client 侧条目的 config，
 * 而 window.__DSH_BOOT__ 的条目只带 id / url / rev / inject，profile 用户 patch 层的
 * config 会不会流进 client 树没有查实——口径 #2 要「真有活消费者」，证据不足就不收。
 */

/** @type {readonly object[]} */
export const OPERATION_ENTRIES = [
  {
    id: 'plugin-manager',
    title: '插件安装与 pnpm 预算',
    plugin: '@deepseek-ai/dsh-plugin-manager',
    effect: 'immediate',
    description: '装插件背后那台 pnpm 执行器的超时、锁等待与日志预算。装不动、卡住、失败日志被截，都在这一卡调。',
    fields: [
      {
        key: 'outputBytes', type: 'integer', default: 16384, min: 1, effect: 'immediate',
        label: 'pnpm 输出保留（字节）', help: '只保留日志的最后这么多字节，超出丢旧留新。调太小会在安装失败时看不到足够上下文。',
      },
      {
        key: 'lockWaitMs', type: 'integer', default: 120000, min: 0, effect: 'immediate',
        label: 'profile 写锁等待（毫秒）', help: '改 package.json、cordis.patch.yml 这些 profile 文件时等锁的上限；0 表示抢不到锁立刻失败。',
      },
      {
        key: 'inspectTimeoutMs', type: 'integer', default: 20000, min: 1000, effect: 'immediate',
        label: '读包元数据超时（毫秒）', help: '安装前读一个包的信息（pnpm view 与读 registry）按它判超时。上游拒绝小于 1000 的值。',
      },
      {
        key: 'githubConnectionTimeoutMs', type: 'integer', default: 5000, min: 1000, effect: 'immediate',
        label: 'GitHub 连通探测超时（毫秒）', help: '装 GitHub 来源的包之前先探一次连通性，超过这个时间算探测失败。',
      },
      {
        key: 'idleTimeoutMs', type: 'integer', default: 600000, min: 1000, effect: 'immediate',
        label: 'pnpm 静默判卡超时（毫秒）', help: '子进程连续这么久没有任何输出就判定卡死并终止，日志里留一行 printed nothing。网络慢时调太小会误杀正在跑的安装。',
      },
    ],
    crossRules: [],
  },
]
