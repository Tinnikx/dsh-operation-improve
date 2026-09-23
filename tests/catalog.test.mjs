/**
 * 精选清单的自洽性测试：跨字段规则的语义，与清单自己不能把自己拦死。
 *
 * 跑：node --test tests/*.test.mjs
 *
 * 键名对不对得上上游 schema，这里测不了（上游不在这台机器的依赖里，见
 * docs/feature-8-harness-config.md 已知限制），测的是**抄下来之后的自洽**：
 * 四条规则的实现语义、`field`/`than` 拼错、默认值之间互相冲突——最后这类一旦漂移，
 * 面板会在用户什么都没改的情况下报出一行错，或者更糟：放行一个让上游加载失败的值。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { CATALOG } from '../src/harness-config/catalog-entries.js'
import { checkCrossRules, coerceField } from '../src/harness-config/catalog.js'

test('每张卡的规则里引用的键都在这张卡里', () => {
  for (const entry of CATALOG) {
    const keys = new Set(entry.fields.map((f) => f.key))
    for (const rule of entry.crossRules) {
      const cited = [rule.field, rule.than, rule.atMost, ...(rule.fields ?? [])].filter((k) => k !== undefined)
      for (const key of cited) {
        assert.ok(keys.has(key), `${entry.id}：规则引用了本卡没有的键 ${key}`)
      }
    }
  }
})

test('全默认值不触发任何一张卡的跨字段规则', () => {
  for (const entry of CATALOG) {
    // 上游校验看到的是合成后的 config，`pick()` 对缺席键回落到清单默认值——所以
    // 「什么都不改」这一份必须干净，否则面板一打开就带着一条错误。
    const values = Object.fromEntries(entry.fields.map((f) => [f.key, f.default]))
    assert.deepEqual(checkCrossRules(entry, values), [], `${entry.id}：默认值之间自相冲突`)
  }
})

test('每个数值字段的默认值都落在自己声明的区间里，min 不大于 max', () => {
  for (const entry of CATALOG) {
    for (const field of entry.fields) {
      if (field.min !== undefined && field.max !== undefined) {
        assert.ok(field.min <= field.max, `${entry.id}.${field.key}：min 大于 max`)
      }
      if (field.type === 'boolean' || field.default === undefined) continue
      const result = coerceField(field, field.default)
      assert.ok(!('error' in result),
        `${entry.id}.${field.key}：默认值 ${JSON.stringify(field.default)} 被自己的边界拒了（${'error' in result ? result.error : ''}）`)
    }
  }
})

test('atMost 与 lessThan 的等号语义不互换', () => {
  const entry = {
    id: 'x',
    fields: [
      { key: 'a', type: 'integer' },
      { key: 'b', type: 'integer' },
    ],
    crossRules: [
      { kind: 'atMost', field: 'a', than: 'b', message: 'atMost 命中' },
    ],
  }
  assert.deepEqual(checkCrossRules(entry, { a: 5, b: 5 }), [], '上游写法是 `if (a > b) throw`，相等必须放行')
  assert.deepEqual(checkCrossRules(entry, { a: 6, b: 5 }), ['atMost 命中'])
  assert.deepEqual(checkCrossRules(entry, { a: 4, b: 5 }), [])

  const strict = { ...entry, crossRules: [{ kind: 'lessThan', field: 'a', than: 'b', message: 'lessThan 命中' }] }
  assert.deepEqual(checkCrossRules(strict, { a: 5, b: 5 }), ['lessThan 命中'], '严格小于的相等必须拒')
})

test('跨字段规则跑的是合成值，缺席的键按清单默认值参与', () => {
  const entry = CATALOG.find((e) => e.id === 'llm-deepseek')
  // 只把上限压低、不动步长：步长取默认值参与，规则照样命中。
  const problems = checkCrossRules(entry, { maxRequestFilesBytes: 1024 })
  assert.ok(problems.some((p) => p.includes('图片转存字节步长')), `没拦住：${JSON.stringify(problems)}`)
})

test('integer-list 的每一项都过 min，空数组与带零都被拒', () => {
  const field = CATALOG.find((e) => e.id === 'repeat-tool-reminder').fields.find((f) => f.key === 'thresholds')
  assert.deepEqual(coerceField(field, [3, 5, 8]), { value: [3, 5, 8] })
  assert.ok('error' in coerceField(field, []))
  assert.ok('error' in coerceField(field, [0, 3]))
  assert.ok('error' in coerceField(field, [1.5]))
})
