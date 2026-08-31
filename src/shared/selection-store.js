/**
 * 选择状态 store —— 共享基础层。
 *
 * 契约：
 * - 选择集是同级别的：`{ kind, ids }`，`kind` 为 `'session' | 'workspace'`。
 *   写入一个不同 kind 的元素会先清空旧集合（切换 kind 即重来）。
 * - 空集合时 `kind` 回到 `null`。
 * - 订阅者在每次集合变化后被同步调用；`subscribe` 返回幂等的取消订阅函数。
 * - store 不碰 DOM，也不知道高亮怎么画——视觉由订阅者负责。
 */

/**
 * 创建一个选择状态 store。
 *
 * @returns {{
 *   getKind: () => (string|null),
 *   getIds: () => string[],
 *   has: (kind: string, id: string) => boolean,
 *   size: () => number,
 *   toggle: (kind: string, id: string) => void,
 *   set: (kind: string, ids: string[]) => void,
 *   clear: () => void,
 *   subscribe: (listener: () => void) => (() => void),
 * }}
 */
export function createSelectionStore() {
  /** @type {string|null} */
  let kind = null
  /** @type {Set<string>} */
  let ids = new Set()
  /** @type {Set<() => void>} */
  const listeners = new Set()

  const emit = () => {
    for (const listener of [...listeners]) listener()
  }

  const normalize = () => {
    if (ids.size === 0) kind = null
  }

  return {
    getKind: () => kind,
    getIds: () => [...ids],
    has: (k, id) => kind === k && ids.has(id),
    size: () => ids.size,

    toggle(k, id) {
      if (kind !== k) {
        kind = k
        ids = new Set([id])
        emit()
        return
      }
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      normalize()
      emit()
    },

    set(k, nextIds) {
      kind = nextIds.length > 0 ? k : null
      ids = new Set(nextIds)
      emit()
    },

    clear() {
      if (ids.size === 0 && kind === null) return
      kind = null
      ids = new Set()
      emit()
    },

    subscribe(listener) {
      listeners.add(listener)
      let done = false
      return () => {
        if (done) return
        done = true
        listeners.delete(listener)
      }
    },
  }
}
