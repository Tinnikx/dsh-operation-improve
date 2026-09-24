/**
 * 功能 11 纯函数层的单元测试：命中偏移、命中列表、跳转游标、重算后的重锚。
 *
 * DOM 那半边（`Range`、`CSS.highlights`、滚动）不在这里测——本仓库没有 jsdom，也不打算
 * 引一个依赖来测它，端到端断言在 `scripts/verify-find-live.mjs`。这里只测四件事：偏移
 * 是不是原文下标、`ordinal` 按 key 归组对不对、游标环不环绕、重算后锚在哪一条。
 *
 * 跑：node --test tests/find-matches.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildMatchList, findOffsets, nextIndex, reanchor } from '../src/find/matches.js'

test('偏移大小写不敏感，且不重叠', () => {
  assert.deepEqual(findOffsets('abcABCabc', 'abc'), [0, 3, 6])
  assert.deepEqual(findOffsets('aaa', 'aa'), [0])
  assert.deepEqual(findOffsets('中文中文', '中文'), [0, 2])
})

test('空查询与空文本都不产生命中', () => {
  assert.deepEqual(findOffsets('anything', ''), [])
  assert.deepEqual(findOffsets('', 'a'), [])
})

/**
 * U+0130「İ」的小写形式是两个 code unit（`i` + combining dot above），lowercase 串上的
 * 下标不再等于原文下标。这条走逐位比较那条路；快路径在这里会给出越界或错位的下标，
 * 拿去 `Range.setStart` 就是 `IndexSizeError`。
 */
test('小写会改变长度的字符，偏移仍是原文下标', () => {
  const text = 'aİbİ'
  assert.equal(text.toLowerCase().length, 6)
  assert.deepEqual(findOffsets(text, 'İ'), [1, 3])
})

test('ordinal 按 key 归组，跨节点累加', () => {
  const nodes = [
    { key: 'row1', text: 'xx axx', ref: 'n1' },
    { key: 'row1', text: 'a', ref: 'n2' },
    { key: 'row2', text: 'a a', ref: 'n3' },
  ]
  const { matches, truncated } = buildMatchList(nodes, 'a', 100)
  assert.equal(truncated, false)
  assert.deepEqual(
    matches.map((m) => [m.key, m.ordinal, m.start, m.end, m.ref]),
    [
      ['row1', 0, 3, 4, 'n1'],
      ['row1', 1, 0, 1, 'n2'],
      ['row2', 0, 0, 1, 'n3'],
      ['row2', 1, 2, 3, 'n3'],
    ],
  )
})

test('命中到上限即截断，并如实报 truncated', () => {
  const nodes = [{ key: 'k', text: 'a a a a', ref: 'n' }]
  assert.deepEqual(buildMatchList(nodes, 'a', 3), {
    matches: [
      { key: 'k', ordinal: 0, start: 0, end: 1, ref: 'n' },
      { key: 'k', ordinal: 1, start: 2, end: 3, ref: 'n' },
      { key: 'k', ordinal: 2, start: 4, end: 5, ref: 'n' },
    ],
    truncated: true,
  })
})

test('游标到端点环绕；没有命中时是 -1', () => {
  assert.equal(nextIndex(-1, 3, 'next'), 0)
  assert.equal(nextIndex(-1, 3, 'prev'), 2)
  assert.equal(nextIndex(2, 3, 'next'), 0)
  assert.equal(nextIndex(0, 3, 'prev'), 2)
  assert.equal(nextIndex(1, 0, 'next'), -1)
})

test('重锚优先落在同一条命中上', () => {
  const list = [{ key: 'a', ordinal: 0 }, { key: 'a', ordinal: 1 }, { key: 'b', ordinal: 0 }]
  assert.equal(reanchor(list, list, 1), 1)
})

test('该条命中消失时，取文档序里紧随其后的第一条', () => {
  const prev = [{ key: 'a', ordinal: 0 }, { key: 'a', ordinal: 1 }, { key: 'b', ordinal: 0 }]
  const next = [{ key: 'a', ordinal: 0 }, { key: 'b', ordinal: 0 }]
  assert.equal(reanchor(prev, next, 1), 1)
})

test('后面全没有了再往前找', () => {
  const prev = [{ key: 'a', ordinal: 0 }, { key: 'b', ordinal: 0 }]
  assert.equal(reanchor(prev, [{ key: 'a', ordinal: 0 }], 1), 0)
})

test('重算后没有命中，或游标本就没有当前项', () => {
  assert.equal(reanchor([{ key: 'a', ordinal: 0 }], [], 0), -1)
  assert.equal(reanchor([{ key: 'a', ordinal: 0 }], [{ key: 'z', ordinal: 0 }], -1), 0)
})
