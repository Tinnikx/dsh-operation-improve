/**
 * 功能 4 验证脚本的断言集：十条 `check` 的本体，由
 * [../verify-timestamps-live.mjs](../verify-timestamps-live.mjs) 编排调用。
 *
 * 拆出来只为让编排那一侧读得完（前置检查、选会话、清场、基线、注入、收尾），
 * 断言顺序仍然重要：`runChecks` 里第九条要页面静置 3 秒才判自激环，
 * `checkDispose` 必须最后跑——它会把注入的实例卸掉，之后任何断言都测不到东西。
 *
 * 两个导出都不自己 `report()`：判据计数与退出码归编排方，`report()` 必须是整个
 * 脚本的最后一句。
 */
import { HELPERS } from './ts-page.mjs'

/**
 * 前九条断言：装饰完整性、文本格式、标签等于上游 Started、跨 step 单调不减、
 * 落在本行第一行、不压正文、Think 行、上游三类改常驻、空闲无自激重建。
 *
 * @param {{ evaluate: (expr: string) => Promise<any>, check: (label: string, value: any, expect?: (v: any) => true|string) => void,
 *   baseline: { geo: any, upstream: any }, needRows: number }} deps
 *   `baseline` 必须是**注入之前**采的，`upstream` 用于「装载前是 0、装载后是 1」的对照
 */
export async function runChecks({ evaluate, check, baseline, needRows }) {
  const NEED_ROWS = needRows
  check('decorates every eligible row exactly once', await evaluate(`(async () => {
    ${HELPERS}
    await new Promise((r) => setTimeout(r, 600));
    const missing = [], duplicated = [], onUpstream = [], onEmpty = [];
    let eligible = 0;
    for (const row of rowsOf()) {
      const kind = row.getAttribute('data-chat-flow-kind');
      const labels = labelsOf(row);
      if (UPSTREAM.has(kind)) { if (labels.length > 0) onUpstream.push(kind); continue }
      if (!hasForeign(row)) { if (labels.length > 0) onEmpty.push(kind); continue }
      eligible += 1;
      if (labels.length === 0) missing.push({ kind, key: row.getAttribute('data-chat-flow-key') });
      else if (labels.length > 1) duplicated.push({ kind, n: labels.length });
    }
    const snap = window.__dshOperationImprove__.timestamps.snapshot();
    return { rows: rowsOf().length, eligible,
      missing: missing.slice(0, 5), missingCount: missing.length,
      duplicated: duplicated.slice(0, 5), duplicatedCount: duplicated.length,
      onUpstream: onUpstream.slice(0, 5), onUpstreamCount: onUpstream.length,
      onEmpty: onEmpty.slice(0, 5), onEmptyCount: onEmpty.length,
      snapshotRows: snap.rows, snapshotThinks: snap.thinks,
      domRowLabels: document.querySelectorAll('.dsh-oi-ts[data-anchor="row"]').length };
  })()`), (v) => {
    if (v.rows < NEED_ROWS) return `只有 ${v.rows} 条节点行`
    if (v.eligible === 0) return '没有一条可装饰的行——实测未发生'
    if (v.missingCount !== 0) return `${v.missingCount} 条可装饰的行没有标签：${JSON.stringify(v.missing)}`
    if (v.duplicatedCount !== 0) return `${v.duplicatedCount} 条行挂了多枚标签：${JSON.stringify(v.duplicated)}`
    if (v.onUpstreamCount !== 0) return `上游自带时间的 ${v.onUpstreamCount} 条行被插件重复贴了标签：${JSON.stringify(v.onUpstream)}`
    if (v.onEmptyCount !== 0) return `${v.onEmptyCount} 条本该为空的行被贴了标签（:empty 会失效）：${JSON.stringify(v.onEmpty)}`
    if (v.snapshotRows !== v.eligible) return `snapshot 报 ${v.snapshotRows} 行，DOM 里可装饰的是 ${v.eligible} 行`
    if (v.domRowLabels !== v.eligible) return `DOM 里 ${v.domRowLabels} 枚行标签 != ${v.eligible} 条可装饰行`
    return true
  })

  check('label text is a well-formed clock', await evaluate(`(() => {
    ${HELPERS}
    const re = /^(?:(?:\\d{4}\\/)?\\d{1,2}\\/\\d{1,2} )?\\d{2}:\\d{2}:\\d{2}$/;
    const texts = [...document.querySelectorAll('.' + LABEL)].map((el) => el.textContent ?? '');
    const bad = texts.filter((t) => !re.test(t));
    return { total: texts.length, bad: bad.slice(0, 5), badCount: bad.length,
      sample: texts.slice(0, 3), distinct: new Set(texts).size };
  })()`), (v) => {
    if (v.total === 0) return '一枚标签都没有'
    if (v.badCount !== 0) return `${v.badCount} 枚标签文本不合格式：${JSON.stringify(v.bad)}`
    if (v.distinct < 2) return `全部 ${v.total} 枚标签只有 ${v.distinct} 种文本，像是把同一个时间贴满了整页`
    return true
  })

  // 这条守的是「取的是开始时刻」。它按上游 ui-trajectory/src/client/layout.ts 的
  // startedAt 规则独立重算一遍：工具调用取 `callTime`（结果落地用的是 `time`，实测
  // 两者可以差 82 秒），回复步骤取 `finalNode.timing.stepStartTime`（这一类的
  // `data.time` 等于 completedTime，实测差 41 秒）。`differing` 是这条断言的牙齿——
  // 它为 0 就说明这个会话里两种时刻恰好都相等，什么都没测出来。
  check("labels match upstream's Started derivation", await evaluate(`(() => {
    ${HELPERS}
    const pad = (n) => String(n).padStart(2, '0');
    const clock = (t) => {
      if (typeof t !== 'number' || !Number.isFinite(t)) return null;
      const d = new Date(t);
      return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    };
    const mismatched = [], unresolved = [], differing = [];
    let checked = 0;
    for (const row of rowsOf()) {
      const label = labelsOf(row)[0];
      if (label === undefined) continue;
      const node = nodeOf(row);
      if (node === null) { unresolved.push(row.getAttribute('data-chat-flow-kind')); continue }
      const kind = row.getAttribute('data-chat-flow-kind');
      const d = node.data ?? {};
      let started, settled;
      if (kind === 'tool-call') {
        started = d.root?.callTime ?? d.root?.time;
        settled = d.root?.time;
      } else if (kind === 'assistant-step') {
        started = d.finalNode?.timing?.stepStartTime
          ?? node.location?.step?.start?.time
          ?? d.finalNode?.timing?.firstTokenTime;
        settled = d.time;
      } else {
        started = d.time ?? d.command?.time ?? d.current?.time
          ?? node.location?.step?.start?.time ?? node.location?.turn?.start?.time;
        settled = started;
      }
      checked += 1;
      const want = clock(started);
      if (want !== (label.textContent ?? '')) {
        mismatched.push({ kind, want, got: label.textContent, settled: clock(settled) });
      }
      if (started !== settled && clock(started) !== clock(settled)) {
        differing.push({ kind, started: clock(started), settled: clock(settled), label: label.textContent });
      }
    }
    return { checked, mismatched: mismatched.slice(0, 5), mismatchedCount: mismatched.length,
      unresolved: unresolved.slice(0, 5), unresolvedCount: unresolved.length,
      differingCount: differing.length, differing: differing.slice(0, 3) };
  })()`), (v) => {
    if (v.checked < NEED_ROWS) return `只重算了 ${v.checked} 行`
    if (v.unresolvedCount !== 0) return `${v.unresolvedCount} 行贴了标签却反查不到节点：${JSON.stringify(v.unresolved)}`
    if (v.mismatchedCount !== 0) {
      return `${v.mismatchedCount} 行的标签不等于上游 Started：${JSON.stringify(v.mismatched)}`
    }
    if (v.differingCount === 0) {
      return '这个会话里开始时刻与落地时刻处处相等，这条断言实测未发生——换一个含长工具调用的会话'
    }
    return true
  })

  // fiber 反查串行（把邻行的时间安到本行上）的判据。**只在跨 step 的相邻行之间要求
  // 不减**：同一个 step 内部本来就可以逆序——`model-retry` 携带的是重试事件时刻，而
  // 它后面那条 `assistant-step` 显示的是**该 step 的起点**，起点必然更早。实测 step 138
  // 起于 11:42:39、重试发生在 11:42:57，两行各自都对。同 step 逆序显式计数报出来，
  // 免得这条放宽把真正的串行一起放过去。
  check('times are non-decreasing across steps', await evaluate(`(() => {
    ${HELPERS}
    const now = new Date();
    const keyOf = (t) => {
      const m = t.match(/^(?:(?:(\\d{4})\\/)?(\\d{1,2})\\/(\\d{1,2}) )?(\\d{2}):(\\d{2}):(\\d{2})$/);
      if (m === null) return null;
      const year = m[1] !== undefined ? Number(m[1]) : now.getFullYear();
      const month = m[2] !== undefined ? Number(m[2]) : now.getMonth() + 1;
      const day = m[3] !== undefined ? Number(m[3]) : now.getDate();
      return new Date(year, month - 1, day, Number(m[4]), Number(m[5]), Number(m[6])).getTime();
    };
    const stepOf = (row) => {
      const loc = nodeOf(row)?.location;
      if (loc === undefined || loc === null) return null;
      if (loc.step !== undefined && loc.step !== null) return loc.step.turn + ':' + loc.step.step;
      if (loc.turn !== undefined && loc.turn !== null) return 'turn:' + loc.turn.turn;
      return null;
    };
    const seq = [];
    for (const row of rowsOf()) {
      const label = labelsOf(row)[0];
      if (label === undefined) continue;
      const text = label.textContent ?? '';
      seq.push({ kind: row.getAttribute('data-chat-flow-kind'), text, t: keyOf(text), step: stepOf(row) });
    }
    const violations = [], sameStep = [];
    for (let i = 1; i < seq.length; i += 1) {
      if (seq[i].t === null || seq[i - 1].t === null) continue;
      if (seq[i].t >= seq[i - 1].t) continue;
      if (seq[i].step !== null && seq[i].step === seq[i - 1].step) {
        sameStep.push({ i, step: seq[i].step, prev: seq[i - 1].kind + '@' + seq[i - 1].text, cur: seq[i].kind + '@' + seq[i].text });
        continue;
      }
      violations.push({ i, prev: seq[i - 1], cur: seq[i] });
    }
    const steps = new Set(seq.map((s) => s.step).filter((s) => s !== null));
    return { labelled: seq.length, steps: steps.size,
      unlocated: seq.filter((s) => s.step === null).length,
      violations: violations.slice(0, 5), violationCount: violations.length,
      sameStepInversions: sameStep.slice(0, 5), sameStepCount: sameStep.length,
      first: seq[0]?.text ?? null, last: seq[seq.length - 1]?.text ?? null,
      spanMs: seq.length > 1 && seq[0].t !== null && seq[seq.length - 1].t !== null
        ? seq[seq.length - 1].t - seq[0].t : null };
  })()`), (v) => {
    if (v.labelled < NEED_ROWS) return `只有 ${v.labelled} 行带标签`
    if (v.steps < 2) return `只落在 ${v.steps} 个 step 上，跨 step 的判定退化成没测`
    if (v.unlocated !== 0) return `${v.unlocated} 行反查不到 location，无法判定它属于哪个 step`
    if (v.violationCount !== 0) {
      return `${v.violationCount} 处跨 step 的时间倒退（fiber 反查取到了邻行的节点）：${JSON.stringify(v.violations)}`
    }
    if (v.spanMs === null || v.spanMs <= 0) return `首尾时间跨度为 ${v.spanMs}，整页时间没有推进`
    return true
  })

  // 「错位」那个毛病的判据。标签放在行间距里时它在本行盒子之外，离上下两行各 1px，
  // 每一条几何都合法、看着也正常，只是读起来归属下一行。所以断言两件事：标签在本行
  // 自己的盒子里，且垂直中心与**本行第一行文字**的中心对齐。
  check('each label sits on its own row first line', await evaluate(`(() => {
    ${HELPERS}
    const TOL = 12;
    const outside = [], offLine = [], noBand = [];
    let checked = 0;
    for (const label of document.querySelectorAll(".dsh-oi-ts[data-anchor='row']")) {
      const row = label.parentElement;
      const lr = label.getBoundingClientRect(), rr = row.getBoundingClientRect();
      if (lr.height === 0 || rr.height === 0) continue;
      checked += 1;
      const kind = row.getAttribute('data-chat-flow-kind');
      if (lr.top < rr.top - 0.5 || lr.bottom > rr.bottom + 0.5) {
        outside.push({ kind, label: [Math.round(lr.top), Math.round(lr.bottom)], row: [Math.round(rr.top), Math.round(rr.bottom)] });
        continue;
      }
      const band = firstLineBand(row);
      if (band === null) { noBand.push(kind); continue }
      const delta = ((lr.top + lr.bottom) / 2) - ((band.top + band.bottom) / 2);
      if (Math.abs(delta) > TOL) offLine.push({ kind, delta: Math.round(delta * 10) / 10 });
    }
    return { checked, outside: outside.slice(0, 5), outsideCount: outside.length,
      offLine: offLine.slice(0, 5), offLineCount: offLine.length,
      noBandCount: noBand.length, tolerance: TOL };
  })()`), (v) => {
    if (v.checked === 0) return '没有可测的行标签'
    if (v.outsideCount !== 0) {
      return `${v.outsideCount} 枚标签落在本行盒子之外（读起来会归属邻行）：${JSON.stringify(v.outside)}`
    }
    if (v.offLineCount !== 0) {
      return `${v.offLineCount} 枚标签没和本行第一行对齐（容差 ${v.tolerance}px）：${JSON.stringify(v.offLine)}`
    }
    return true
  })

  check('labels never overlap body text', await evaluate(`(() => {
    ${HELPERS}
    const EPS = 0.5;
    const textRects = (el, label) => {
      const out = [];
      if (el === null || el === undefined) return out;
      for (const node of el.querySelectorAll('*')) {
        if (node.classList.contains(LABEL) || node.contains(label)) continue;
        let hasText = false;
        for (const c of node.childNodes) {
          if (c.nodeType === 3 && (c.nodeValue ?? '').trim() !== '') { hasText = true; break }
        }
        if (!hasText) continue;
        const r = node.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push(r);
      }
      return out;
    };
    const hits = [];
    let checked = 0;
    for (const label of document.querySelectorAll('.' + LABEL)) {
      const row = label.closest('[data-chat-flow-key]');
      if (row === null) continue;
      const a = label.getBoundingClientRect();
      if (a.width === 0 || a.height === 0) continue;
      checked += 1;
      for (const b of [...textRects(row, label), ...textRects(row.nextElementSibling, label)]) {
        if (a.left + EPS < b.right && a.right - EPS > b.left && a.top + EPS < b.bottom && a.bottom - EPS > b.top) {
          hits.push({ anchor: label.dataset.anchor, kind: row.getAttribute('data-chat-flow-kind'),
            label: [Math.round(a.left), Math.round(a.top), Math.round(a.right), Math.round(a.bottom)],
            text: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)] });
          break;
        }
      }
    }
    return { checked, hits: hits.slice(0, 5), hitCount: hits.length };
  })()`), (v) => {
    if (v.checked === 0) return '没有可测的标签矩形'
    if (v.hitCount !== 0) return `${v.hitCount} 枚标签压在正文上：${JSON.stringify(v.hits)}`
    return true
  })

  // Think 行要的是「这一行上看得到时间」，而不是「这一行上挂着一枚 think 标签」。
  // 落在所属 step 第一行上的 Think 由行标签在同一条水平带上给出时间，插件不再另贴
  // 一枚一字不差的（见 src/timestamps/index.js 的 thinkAnchors）。所以判据是：每个
  // Think 折叠头那条行的水平带上，存在一枚文本等于所属 step 时间的标签。
  check('every think row shows its step time on its own line', await evaluate(`(() => {
    ${HELPERS}
    const covered = [], uncovered = [];
    let total = 0;
    for (const row of rowsOf()) {
      const rowLabel = labelsOf(row)[0];
      if (rowLabel === undefined) continue;
      const expected = rowLabel.textContent ?? '';
      for (const think of row.querySelectorAll('[data-variant="think"]')) {
        const host = think.querySelector('[class*="_row"]');
        if (host === null) continue;
        total += 1;
        const hr = host.getBoundingClientRect();
        const mid = (hr.top + hr.bottom) / 2;
        let hit = null;
        for (const label of row.querySelectorAll('.' + LABEL)) {
          const lr = label.getBoundingClientRect();
          if (lr.height === 0) continue;
          if (lr.top - 2 > mid || lr.bottom + 2 < mid) continue;
          if ((label.textContent ?? '') !== expected) continue;
          hit = label.dataset.anchor; break;
        }
        if (hit === null) uncovered.push({ expected, hostTop: Math.round(hr.top) });
        else covered.push(hit);
      }
    }
    const byAnchor = covered.reduce((acc, a) => { acc[a] = (acc[a] ?? 0) + 1; return acc }, {});
    return { total, coveredCount: covered.length, byAnchor,
      uncovered: uncovered.slice(0, 5), uncoveredCount: uncovered.length,
      domThinkLabels: document.querySelectorAll('.' + LABEL + '[data-anchor="think"]').length,
      snapshotThinks: window.__dshOperationImprove__.timestamps.snapshot().thinks };
  })()`), (v) => {
    if (v.total === 0) return '已装饰的行里一个 Think 行都没有——实测未发生'
    if (v.uncoveredCount !== 0) {
      return `${v.uncoveredCount} 个 Think 行所在的水平带上没有本 step 的时间：${JSON.stringify(v.uncovered)}`
    }
    if (v.domThinkLabels !== v.snapshotThinks) {
      return `DOM 里 ${v.domThinkLabels} 枚 think 标签 != snapshot 报的 ${v.snapshotThinks}`
    }
    return true
  })

  check('upstream clocks become always-on', await evaluate(`(() => {
    ${HELPERS}
    return { before: ${JSON.stringify(baseline.upstream)}, after: upstreamOpacity(),
      sample: upstreamTimeEls().slice(0, 2).map((el) => ({
        cls: String(el.className), text: (el.textContent ?? '').trim().slice(0, 32),
        kind: el.closest('[data-chat-flow-kind]')?.getAttribute('data-chat-flow-kind') ?? null })) };
  })()`), (v) => {
    if (v.before.count === 0) return '基线里没有上游时间标签'
    if ((v.before.opacity['0'] ?? 0) !== v.before.count) {
      return `装载前不是全部 opacity=0：${JSON.stringify(v.before)}`
    }
    if (v.after.count !== v.before.count) return `标签数 ${v.before.count}→${v.after.count}，页面变了`
    if ((v.after.opacity['1'] ?? 0) !== v.after.count) {
      return `装载后不是全部 opacity=1：${JSON.stringify(v.after)}`
    }
    return true
  })

  // 自激环的表现极隐蔽：标签看着完全正常，但每帧被重写，hover / 文本选中与
  // transition 全程被打断。判据是空闲 3 秒内不新增标签节点、标签仍是同一批对象。
  check('idle: no self-triggered rebuild', await evaluate(`(async () => {
    ${HELPERS}
    const first = document.querySelector('.' + LABEL);
    let added = 0, mutations = 0;
    const obs = new MutationObserver((records) => {
      for (const r of records) {
        if (r.type !== 'childList') continue;
        for (const n of r.addedNodes) {
          if (n.classList !== undefined && n.classList.contains(LABEL)) added += 1;
        }
        mutations += 1;
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    await new Promise((r) => setTimeout(r, 3000));
    obs.disconnect();
    const later = document.querySelector('.' + LABEL);
    return { idleMs: 3000, labelNodesAdded: added, bodyChildListMutations: mutations,
      sameIdentity: first === later, stillConnected: first !== null && first.isConnected,
      labels: document.querySelectorAll('.' + LABEL).length };
  })()`), (v) => {
    if (v.labels === 0) return '标签消失了'
    if (v.labelNodesAdded !== 0) return `空闲 3s 内新增了 ${v.labelNodesAdded} 个标签节点，应为 0——标签在自己重建`
    if (v.sameIdentity !== true) return '3s 前后第一枚标签不是同一个对象，标签身份被替换'
    if (v.stillConnected !== true) return '首枚标签已脱离文档'
    return true
  })
}

/**
 * 第十条断言：卸载复原。**必须最后跑**，它把注入的实例连同标签一起摘掉。
 *
 * @param {{ evaluate: (expr: string) => Promise<any>, check: Function,
 *   baseline: { geo: any }, assertSameContext: (stage: string) => Promise<void> }} deps
 */
export async function checkDispose({ evaluate, check, baseline, assertSameContext }) {
  await assertSameContext('dispose 之前')

  // dispose 之后几何必须回到基线。这条同时守着右侧留白：留白由本插件的样式表给出，
  // 卸载没收回来的话，正文列就永远窄着一截。
  //
  // 摘掉样式表之后要等一拍再量 opacity：上游那枚时间标签带 opacity 过渡，
  // `getComputedStyle` 读的是过渡中的当前值，同步读回来的恒是过渡前的 `1`。
  await assertSameContext('dispose 之前')
  check('dispose restores the page', await evaluate(`(async () => {
    ${HELPERS}
    window.__dshOiTsTest__.disposers.forEach((d) => d());
    await new Promise((r) => setTimeout(r, 800));
    const after = geometry();
    const before = ${JSON.stringify(baseline.geo)};
    return { labels: document.querySelectorAll('.' + LABEL).length,
      marked: document.querySelectorAll('[data-dsh-oi-ts]').length,
      styles: document.querySelectorAll('style[data-plugin="@Tinnikx/dsh-operation-improve"]').length,
      handle: typeof window.__dshOperationImprove__,
      upstream: upstreamOpacity(),
      shiftedCount: diffGeometry(before, after).length,
      shifted: diffGeometry(before, after).slice(0, 3),
      scrollHeight: after.scrollHeight, baseScrollHeight: before.scrollHeight };
  })()`), (v) => {
    if (v.labels !== 0) return `dispose 后仍有 ${v.labels} 枚标签`
    if (v.marked !== 0) return `dispose 后仍有 ${v.marked} 条行带 [data-dsh-oi-ts] 标记`
    if (v.styles !== 0) return `dispose 后仍有 ${v.styles} 张本插件样式表`
    if (v.handle !== 'undefined') return '调试句柄没摘掉'
    if ((v.upstream.opacity['0'] ?? 0) !== v.upstream.count) {
      return `dispose 后上游标签没回到 opacity=0：${JSON.stringify(v.upstream)}`
    }
    if (v.shiftedCount !== 0) return `dispose 后几何没回到基线：${JSON.stringify(v.shifted)}`
    if (v.scrollHeight !== v.baseScrollHeight) return `dispose 后滚动高度 ${v.scrollHeight} != 基线 ${v.baseScrollHeight}`
    return true
  })
}
