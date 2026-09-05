/**
 * chat-history 纯函数层的单元测试。
 * 跑：node --test tests/chat-history-store.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPristine,
  resolveTurnTexts,
} from '../src/chat-history/history-store.js'

// ── isPristine ──

test('isPristine: 空值是干净的', () => {
  assert.equal(isPristine('', null), true)
  assert.equal(isPristine('', 'prev'), true)
})

test('isPristine: 与上次导航值相同是干净的', () => {
  assert.equal(isPristine('hello', 'hello'), true)
})

test('isPristine: 有值但与导航值不同不是干净的', () => {
  assert.equal(isPristine('user typed', 'hello'), false)
})

test('isPristine: 有值且无导航历史不是干净的', () => {
  assert.equal(isPristine('user typed', null), false)
})

// ── resolveTurnTexts ──

test('resolveTurnTexts: loaded 锚点查到气泡时用全文', () => {
  const items = [
    { turn: 1, prompt: '预览…', anchor: { kind: 'loaded', key: 'k1' } },
  ]
  const out = resolveTurnTexts(items, (key) => (key === 'k1' ? '完整全文' : null))
  assert.deepEqual(out, ['完整全文'])
})

test('resolveTurnTexts: loaded 锚点查不到行时退化为预览', () => {
  const items = [
    { turn: 1, prompt: '预览文本', anchor: { kind: 'loaded', key: 'missing' } },
  ]
  const out = resolveTurnTexts(items, () => null)
  assert.deepEqual(out, ['预览文本'])
})

test('resolveTurnTexts: unloaded 锚点直接用预览', () => {
  const items = [
    { turn: 2, prompt: '未加载轮次的预览', anchor: { kind: 'unloaded', seq: 42 } },
  ]
  const called = []
  const out = resolveTurnTexts(items, (key) => { called.push(key); return 'x' })
  assert.deepEqual(out, ['未加载轮次的预览'])
  assert.deepEqual(called, [], 'unloaded 不该触发全文查找')
})

test('resolveTurnTexts: 两端都没文本的条目被丢弃', () => {
  const items = [
    { turn: 1, prompt: '', anchor: { kind: 'loaded', key: 'none' } },
    { turn: 2, prompt: '  ', anchor: null },
    { turn: 3, prompt: '有效', anchor: null },
    { turn: 4, anchor: { kind: 'unloaded', seq: 1 } }, // 无 prompt 字段
  ]
  const out = resolveTurnTexts(items, () => null)
  assert.deepEqual(out, ['有效'])
})

test('resolveTurnTexts: 保序、去首尾空白', () => {
  const items = [
    { turn: 1, prompt: '  第一问  ', anchor: null },
    { turn: 2, prompt: '第二问', anchor: { kind: 'loaded', key: 'k2' } },
  ]
  const out = resolveTurnTexts(items, () => '  全文二  ')
  assert.deepEqual(out, ['第一问', '全文二'])
})
