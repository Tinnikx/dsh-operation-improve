/**
 * 托管区段写入器的字节级测试。
 * 跑：node --test tests/*.test.mjs
 *
 * fixture 是 [web-cordis.patch.yml](fixtures/web-cordis.patch.yml)——真实 web profile
 * 用户 patch 层的逐字副本（含中文行内注释、`file-reference-local`、`agent-teams`、
 * 手写的 `compaction-basic`）。断言全部对**字节**，不是对「解析出来一样」：区段外任何
 * 一个字节的改动都会丢掉别人写在行尾的注释，而 YAML 解析器看不出这个区别。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

import {
  MANAGED_BEGIN_PREFIX, MANAGED_END,
  composeFile, countSectionItems, readManagedHeader, renderSection, splitManaged, writeAtomic,
} from '../src/harness-config/patch-file.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURE = readFileSync(join(HERE, 'fixtures/web-cordis.patch.yml'), 'utf8')

/** 面板写一批托管值的完整往返：读全文 → 切三段 → 只重写中段 → 拼回。 */
function applyToText(text, plans) {
  const parts = splitManaged(text)
  return composeFile(parts.before, renderSection(plans, parts.before.length > 0), parts.after)
}

const RALPH = { id: 'tool-ralph', managed: [['maxRounds', 32]], restated: [['subagentProvider', 'spawn']] }
const COMPACT = { id: 'compaction-basic', managed: [['thresholdRatio', 0.55]], restated: [['maxTokens', 64000], ['retainRatio', 0.15]] }

test('加托管区段：区段外逐字节不变', () => {
  const after = applyToText(FIXTURE, [COMPACT, RALPH])
  const parts = splitManaged(after)
  assert.equal(parts.found, true)
  assert.equal(parts.before + parts.after, FIXTURE, '区段外必须与原文件逐字节相同')
  assert.equal(parts.after, '', '区段写在文件末尾')
  // 手写那三行连同行尾中文注释原样还在。
  assert.ok(after.includes('    maxTokens: 64000      # 必须 ≤ 模型输出上限(sonnet-5 为 64000)'))
  assert.ok(after.includes('    thresholdRatio: 0.6   # 264k*0.6≈158k 就开始压,待压区间更小'))
  // 重述的键必须在区段里出现，否则 whole-config 替换会把它们抹掉。
  assert.ok(parts.section.includes('subagentProvider: "spawn"'), '重述键要带进区段')
  assert.equal(countSectionItems(parts.section), 2)
  assert.deepEqual(readManagedHeader(parts.section), {
    'compaction-basic': ['thresholdRatio'],
    'tool-ralph': ['maxRounds'],
  })
})

test('改一个字段：只有区段内变化', () => {
  const first = applyToText(FIXTURE, [COMPACT, RALPH])
  const second = applyToText(first, [
    COMPACT,
    { ...RALPH, managed: [['maxRounds', 48]] },
  ])
  const a = splitManaged(first)
  const b = splitManaged(second)
  assert.equal(a.before + a.after, b.before + b.after, '区段外不许动')
  assert.notEqual(a.section, b.section)
  assert.equal(
    a.section.replace('maxRounds: 32', 'maxRounds: 48'),
    b.section,
    '区段内也只有那一个数变了',
  )
})

test('清掉最后一个字段：区段整体消失，文件回到原始字节', () => {
  const withSection = applyToText(FIXTURE, [COMPACT, RALPH])
  const onlyRalph = applyToText(withSection, [RALPH])
  assert.equal(countSectionItems(splitManaged(onlyRalph).section), 1)
  const cleared = applyToText(onlyRalph, [])
  assert.equal(cleared, FIXTURE, '区段清空后必须逐字节回到原文件')
  assert.equal(splitManaged(cleared).found, false)
  assert.ok(!cleared.includes(MANAGED_BEGIN_PREFIX) && !cleared.includes(MANAGED_END))
})

test('区段清空后若文档再没有顶层条目，补一行裸 []', () => {
  // harness 自带的模板就是这个形状：两行注释 + 一行 `[]`。把 `[]` 也算成顶层条目，
  // 否则纯注释文档会让整个 profile 加载失败（step 0 实测的报错）。
  const template = '# Your patch layer for this dsh profile.\n'
  const withSection = applyToText(template, [RALPH])
  assert.equal(splitManaged(withSection).found, true)
  const cleared = applyToText(withSection, [])
  assert.equal(cleared, `${template}[]\n`)
})

test('落盘是同目录 rename：目标 inode 换新，不存在半份内容', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-oi-patch-'))
  const path = join(dir, 'cordis.patch.yml')
  writeFileSync(path, FIXTURE, 'utf8')
  const before = statSync(path).ino
  const next = applyToText(FIXTURE, [COMPACT, RALPH])
  writeAtomic(path, next)
  const stat = statSync(path)
  assert.notEqual(stat.ino, before, 'rename 换掉的是整个 inode，watcher 看不到中间态')
  assert.equal(readFileSync(path, 'utf8'), next)
  assert.equal(stat.size, Buffer.byteLength(next), '落地的就是完整的那一份')
})

test('有开标记没闭标记时拒绝改写', () => {
  assert.throws(
    () => splitManaged(`${FIXTURE}\n${MANAGED_BEGIN_PREFIX}: x\n- id: tool-ralph\n`),
    /找不到闭标记/,
  )
})
