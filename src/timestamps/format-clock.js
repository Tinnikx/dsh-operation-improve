/**
 * 功能 4 的时钟格式化：纯函数，不碰 DOM。
 *
 * 分支规则逐条对齐上游 `ui-conversation` 的 `formatMessageClock`
 * （`src/client/chat/message-chrome.ts`）：同一自然日只给时钟，同年的更早日期前置
 * 月日，跨年前置年月日；判据是**本地日历字段**而不是毫秒差，所以「23:59 的消息在
 * 次日 00:01 看」会正确地前置日期。区别只有两处，都是有意的：
 *
 *   1. 多一个秒。上游的 `HH:mm` 分不出同一分钟内的多次工具调用，而这正是逐行时间
 *      戳要回答的问题。
 *   2. 日期部分固定成数字形式。上游从 locale 取 `clock.md` / `clock.ymd` 模板
 *      （中文是 `{m}月{d}日`，英文是 `{m}/{d}`），插件够不着那个 translate seat，
 *      硬编哪一种都是在替用户选语言，索性用两种语言都读得懂的数字形式。
 *
 * 拆成单独文件是为了能脱离浏览器做单元测试——跨天与跨年这两条分支在真实会话页上
 * 遇不到（消息都是今天的），CDP 验证覆盖不了，只有单测能覆盖。
 */

/** @param {number} value @returns {string} 补足两位的十进制串 */
function pad2(value) {
  return String(value).padStart(2, '0')
}

/**
 * 把 epoch 毫秒格式化成日期感知的 24 小时制时钟串。
 *
 * @param {number} time epoch 毫秒，来自节点所属 session event 的 `time`
 * @param {number} [now] 判定「今天 / 今年」的参照时刻，默认取墙上时钟；注入它是为了
 *   让跨天分支可测
 * @returns {string|null} 同日 `HH:mm:ss`，同年的更早日期 `M/D HH:mm:ss`，跨年
 *   `Y/M/D HH:mm:ss`。**`time` 不是有限数值时返回 `null`**——调用方必须把它当作
 *   「这一行没有时间可显示」跳过，而不是渲染一个 `NaN:NaN:NaN`。
 */
export function formatClockSeconds(time, now = Date.now()) {
  if (typeof time !== 'number' || !Number.isFinite(time)) return null
  const d = new Date(time)
  if (Number.isNaN(d.getTime())) return null
  const n = new Date(typeof now === 'number' && Number.isFinite(now) ? now : Date.now())

  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  if (
    d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate()
  ) {
    return clock
  }

  const md = `${d.getMonth() + 1}/${d.getDate()}`
  const date = d.getFullYear() === n.getFullYear() ? md : `${d.getFullYear()}/${md}`
  return `${date} ${clock}`
}
