# 028 功能 13：滚到顶部时自动加载更早消息

- 目标：会话页滚到顶部、「加载更早」进入视口时，插件替用户点一次；上游补一页并保持原先可见的那一行不动。验收是 `verify:auto-load-older` 的 8 条断言全绿（退出码 0 + 末行 summary），以及长会话上实测行数/高度增长、按钮点击计数增加、加载落地后不再连点。
- 范围：新增 [src/auto-load-older/index.js](../../src/auto-load-older/index.js)，接入 [src/client/index.js](../../src/client/index.js)；新增验证脚本、npm script 与功能文档。不改上游、不加依赖、不占 slot、不带样式。
- 状态：完成。

## 进展

- 已验证：上游控件结构。`ChatView.tsx` 在 `hasMore` 时渲染 `<div className={css.older}><button…`，`.older` 是 `div[data-chat-flow]` 的第一个子元素；点击走 `useChatNavigation.loadEarlier` → `session.loadOlder()`，提交后 `viewport.preserve()` 把原先可见的行钉住，按钮因此被顶出视口（实测一次加载后 `button.top = -23270`）。
- 已验证：测试栈上打开 756 行的长会话（`session-ef1aea2d-…`），底部静置 1.5s 行数不变；真实滚轮到顶后 756 → 1490 行（+734）、高度 24984 → 48346、`scrollTop` 0 → 23362；再滚一页 1490 → 1846 后按钮随 `hasMore` 卸载。
- 已验证：`node scripts/build.mjs` 通过，`lib/client.js` 159403 字节；页面句柄上出现 `autoLoadOlder`，`snapshot()` 返回 `{attached, visible, disabled, loading, stalled}`。
- 已验证：`node scripts/verify-auto-load-older-live.mjs` → 8 PASS / 0 FAIL / 0 SKIP，退出码 0。靶子会话 104 → 193 → 283 行，点击计数 0 → 1 → 2，落地 1s 内行数不变、按钮 `top = -6742`。
- 已验证：全量十套 live 串行（同一 bash 调用内先 `stack:up`，末尾 `stack:down`）全绿，合计 219 条：verify 29、timestamps 10、dot 21、selection 20、chat-history 16、find 19、row-states 35、provider-band 29、settings 32、auto-load-older 8，十套退出码均为 0。

## 决策与理由

- **触发条件是「按钮可见」而不是「会话页存在」**（用户选定）。`IntersectionObserver` 的根用视口（`root: null`, `threshold: 0`），祖先滚动容器的裁剪自动计入交叉矩形；停在底部时按钮被裁掉，打开会话不会主动翻历史。
- **按结构找按钮，不按文案**。统计页 `StatsView` 也有一枚「加载更早」；会话页的按钮独占「`[data-chat-flow]` 的第一子元素的第一子元素」这个位置，统计页没有。也不按 CSS Module 类名找——编译后的前缀随构建变，实测类名是 `EvIC1a_older` / `wSkVaW_scrollBody`，下划线片段选择器不可靠。
- **失败不重试，直到按钮离开视口再回来**。上游 `loadOlder()` 把异常吞进 `console.error`，失败时按钮恢复可点；只按「可见就点」会变成死循环。判失败的信号是「按钮已恢复可用 + 内容没变」，用 400ms 兜底；按钮仍 `disabled` 时视为加载还在飞，不判失败。
- **成功判定看两个独立量**：第一行 `[data-chat-node-key]` 变了，或 `scrollHeight` 变大。只比行数会漏掉「一页替换同数量节点」的实现变化；只比高度会漏掉「高度不变但内容换了」。
- **按钮还可见就继续**。一页装不满视口时（短会话），停在原地会一直看见按钮；继续点直到历史到头或视口被填满，符合「可见即加载」。
- **验证脚本给按钮 `click` 挂计数器**。行数增长只证明「有东西加载了」，计数从 0 → 1 → 2 才证明是本功能点的；加载本身不被替换，仍走上游 handler。
- **验证脚本用真实滚轮**（CDP `Input.dispatchMouseEvent`）。直接赋 `scrollTop = 0` 会被上游滚动补偿在 150ms 内改回去，`IntersectionObserver` 不触发。

## 测试cases

- `DSH_ESBUILD_ROOT=/home/kaixiang/dev/co-creation-project/dsh-desktop PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/build.mjs` → 通过（`lib/client.js` 159403 字节）。
- `PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node scripts/verify-auto-load-older-live.mjs` → `passed=8 failed=0 skipped=0 total=8`，退出码 0；靶子 `session-6e1ef8bc-…` 104 → 193 → 283 行。
- `PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH node --test tests/*.test.mjs` → `tests=46 pass=46 fail=0`（纯函数层不受本功能影响）。
- 全量十套（同一 bash 调用内 `node scripts/test-stack.mjs up`，再串行跑 `verify`、`verify-timestamps`、`verify-active-dot`、`verify-selection-menu`、`verify-chat-history`、`verify-find`、`verify-row-states`、`verify-provider-band`、`verify-settings`、`verify-auto-load-older`，末尾 `down`）→ 十套退出码全 0，`passed=29/10/21/20/16/19/35/29/32/8`，`failed=0 skipped=0`，合计 219 条；`verify-settings` 的重启在同一个 bash 调用里成功，`[test-stack] chrome: 已停 / harness: 已停` 收尾。

## 遗留问题与下一步

1. **失败分支没有自动化覆盖**：要造一次 `loadOlder()` 抛错，上游没有可控注入点；当前只做了代码层推演。
2. **`MutationObserver` 的常驻开销没有单独量**：流式输出时每帧扫一次滚动容器，与功能 4 的时间戳重建同源，没有在超长会话上做基准。
3. **真桌面客户端未覆盖**：验证跑在 headless Chrome（测试栈）上，滚动手感与合成层差异未看。
4. **`verify`（功能 1、2）的既有间歇性红**与本功能无关，但会出现在全量套件里，读数时按 README 的既有说明判断。

## 坑

- **`scrollTop` 赋值不能用来模拟滚动**：赋 0 后约 150ms 被上游改回原偏移，`IntersectionObserver` 根本不触发。必须用 CDP 真滚轮（`Input.dispatchMouseEvent`, `mouseWheel`, `deltaY: -3000`）。
- **滚轮循环不能只等 `scrollTop === 0`**：按钮一可见，本功能就点，上游把锚点顶回新内容上方；250ms 采样可能已经看不到 0。停止条件要同时包含「行数/高度变了」。
- **按钮类名不带尾部下划线**：实际是 `EvIC1a_older`，`[class*="_older_"]` 匹配不到；本功能最终不使用类名。
- **产品 node shim 里没有 `npm`**：`PATH=$HOME/.dsh/desktop-bin/node-shim:$PATH` 之后 `npm run …` 报 `exit 127`，全量套件要用 `node scripts/verify-*-live.mjs` 直接跑。
- **测试栈和全套 verify 必须在同一次 bash 调用里**：沙箱每条调用是一张独立 PID 命名空间，上一次调用留下的 harness 在这一次里既看不到 pid、也没法 `stack:down`；`verify-settings` 内部要重启栈，会直接报「3181 已被占用」。同理 `TMPDIR` 不能设在 `stack:up` 之前——Chrome 把进程单例 socket 放进 `TMPDIR`，仓库内路径会让它 `FATAL: Socket path too long` 起不来；真要绕 `/tmp` 隔离，只给需要建靶子的那条 verify 命令加前缀。
