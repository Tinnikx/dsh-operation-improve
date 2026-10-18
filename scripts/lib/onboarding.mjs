/**
 * 收掉应用加载时弹的产品引导框。
 *
 * 测试栈副本没有凭据，应用启动会依次弹「预览版说明」与「配置 API 密钥」两步引导框。
 * 两者都是 `OnboardingModal`，会注册成一枚 modal layer——而 modal layer 按设计独占
 * `Escape`（`ui-primitives/src/Menu.tsx:334` 的 `isBehindModal` 让菜单在模态之上时
 * 不处理 Esc）。只要有一步没关掉，菜单的 Esc、键盘焦点这些断言就全都测不到真东西，
 * 且弹框会把焦点钉在自己的输入框上。
 *
 * 该点击的是各自那枚「稍后 / 继续」按钮，文案两档都认。已经关掉（无匹配弹框）时
 * 是空操作，因此在每个 reload 之后无条件调用即可。
 *
 * 注意：点「继续」会把已读标记写回 host 配置——对字节级比对配置文件的用例
 * （[verify-settings-live.mjs](../../scripts/verify-settings-live.mjs)）不要在这里调用。
 */

/** 引导框上「收掉它」的按钮文案：预览版说明的继续、凭据步的稍后配置。两档语言。 */
const DISMISS_LABELS = ['继续', 'Continue', '稍后配置', 'Configure later']

/**
 * 依次点掉当前弹着的引导框，直到没有可点的那一步。
 *
 * @param {(expression: string) => Promise<unknown>} evaluate 页面求值函数
 * @returns {Promise<void>}
 */
export async function dismissOnboarding(evaluate) {
  await evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const labels = ${JSON.stringify(DISMISS_LABELS)}
    for (let i = 0; i < 12; i += 1) {
      const dialog = document.querySelector('[role="dialog"]')
      if (dialog === null) return
      const button = [...dialog.querySelectorAll('button')]
        .find((b) => labels.includes((b.textContent ?? '').trim()))
      if (button === undefined) return
      button.click()
      await sleep(600)
    }
  })()`)
}
