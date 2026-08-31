/**
 * formatClockSeconds 的单元测试：三条日期分支与非法输入。
 *
 * 跨天与跨年在真实会话页上遇不到（消息都是今天的），CDP 端到端覆盖不了这两条，
 * 只有这里能覆盖——所以参照时刻 `now` 是注入的，不能省。
 *
 * 跑：node --test tests/format-clock.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatClockSeconds } from '../src/timestamps/format-clock.js'

/** 本地时区的构造，与被测函数读的本地日历字段是同一套参照系。 */
const at = (y, m, d, hh, mm, ss) => new Date(y, m - 1, d, hh, mm, ss).getTime()

test('同一自然日只给时钟，且带秒', () => {
  const now = at(2026, 8, 26, 20, 0, 0)
  assert.equal(formatClockSeconds(at(2026, 8, 26, 15, 16, 7), now), '15:16:07')
  assert.equal(formatClockSeconds(at(2026, 8, 26, 0, 0, 0), now), '00:00:00')
  assert.equal(formatClockSeconds(at(2026, 8, 26, 23, 59, 59), now), '23:59:59')
})

test('同年的更早日期前置 M/D，月日不补零', () => {
  const now = at(2026, 8, 26, 10, 0, 0)
  assert.equal(formatClockSeconds(at(2026, 8, 25, 23, 59, 59), now), '8/25 23:59:59')
  assert.equal(formatClockSeconds(at(2026, 1, 3, 9, 5, 0), now), '1/3 09:05:00')
})

test('跨年前置 Y/M/D', () => {
  const now = at(2026, 8, 26, 10, 0, 0)
  assert.equal(formatClockSeconds(at(2025, 12, 31, 23, 0, 0), now), '2025/12/31 23:00:00')
  assert.equal(formatClockSeconds(at(2027, 1, 1, 1, 2, 3), now), '2027/1/1 01:02:03')
})

test('判据是本地日历字段而不是毫秒差', () => {
  // 相隔 2 分钟但跨了午夜：必须前置日期，不能因为「不到一天」当成今天。
  const now = at(2026, 8, 26, 0, 1, 0)
  assert.equal(formatClockSeconds(at(2026, 8, 25, 23, 59, 0), now), '8/25 23:59:00')
  // 相隔 23 小时但同一天：不能前置日期。
  const sameDay = at(2026, 8, 26, 23, 30, 0)
  assert.equal(formatClockSeconds(at(2026, 8, 26, 0, 30, 0), sameDay), '00:30:00')
})

test('非法输入返回 null 而不是 NaN 串', () => {
  const now = at(2026, 8, 26, 10, 0, 0)
  for (const bad of [undefined, null, NaN, Infinity, -Infinity, '1787727499001', {}, []]) {
    assert.equal(formatClockSeconds(bad, now), null, `${String(bad)} 应当返回 null`)
  }
})

test('省略 now 时用墙上时钟，当下的时间戳按同日渲染', () => {
  const out = formatClockSeconds(Date.now())
  assert.match(out, /^\d{2}:\d{2}:\d{2}$/)
})
