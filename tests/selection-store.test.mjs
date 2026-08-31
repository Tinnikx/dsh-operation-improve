/**
 * selection-store 的单元测试：同级约束与订阅语义。
 * 跑：node --test tests/*.test.mjs
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSelectionStore } from '../src/shared/selection-store.js'

test('空 store 的 kind 是 null', () => {
  const s = createSelectionStore()
  assert.equal(s.getKind(), null)
  assert.equal(s.size(), 0)
})

test('同 kind 的 toggle 累加与摘除', () => {
  const s = createSelectionStore()
  s.toggle('session', 'a')
  s.toggle('session', 'b')
  assert.equal(s.size(), 2)
  s.toggle('session', 'b')
  assert.deepEqual(s.getIds(), ['a'])
  s.toggle('session', 'a')
  assert.equal(s.size(), 0)
  assert.equal(s.getKind(), null, '集合空了 kind 必须回到 null')
})

test('切换 kind 清空重来', () => {
  const s = createSelectionStore()
  s.toggle('session', 'a')
  s.toggle('session', 'b')
  s.toggle('workspace', 'w1')
  assert.equal(s.getKind(), 'workspace')
  assert.deepEqual(s.getIds(), ['w1'], '旧 kind 的 id 必须全被丢掉')
  assert.equal(s.has('session', 'a'), false)
})

test('has 受 kind 约束', () => {
  const s = createSelectionStore()
  s.toggle('session', 'x')
  assert.equal(s.has('session', 'x'), true)
  assert.equal(s.has('workspace', 'x'), false)
})

test('set 覆盖整个集合，空数组等于清空', () => {
  const s = createSelectionStore()
  s.set('workspace', ['w1', 'w2'])
  assert.equal(s.getKind(), 'workspace')
  assert.equal(s.size(), 2)
  s.set('workspace', [])
  assert.equal(s.getKind(), null)
})

test('订阅在每次变化后触发，取消订阅幂等', () => {
  const s = createSelectionStore()
  let hits = 0
  const off = s.subscribe(() => { hits += 1 })
  s.toggle('session', 'a')
  s.toggle('session', 'b')
  assert.equal(hits, 2)
  off()
  off()
  s.toggle('session', 'c')
  assert.equal(hits, 2, '取消订阅后不应再收到通知')
})

test('clear 在空集合上不触发通知', () => {
  const s = createSelectionStore()
  let hits = 0
  s.subscribe(() => { hits += 1 })
  s.clear()
  assert.equal(hits, 0)
  s.toggle('session', 'a')
  s.clear()
  assert.equal(hits, 2)
})
