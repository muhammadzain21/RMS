/**
 * Safety net: soft live refresh skips while the user is mid-edit.
 * Primary architecture is event-driven hydrate (no global poll) + draft-isolated editors.
 * Modals should call useUserBusy(open) or set data-user-busy="1" on overlays.
 */

let depth = 0

export function beginUserBusy() {
  depth += 1
}

export function endUserBusy() {
  depth = Math.max(0, depth - 1)
}

export function isUserBusy() {
  try {
    if (depth > 0) return true
    if (typeof document === 'undefined') return false
    if (document.querySelector('[data-user-busy="1"]')) return true
    const el = document.activeElement
    if (!el || el === document.body) return false
    const tag = String(el.tagName || '').toUpperCase()
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (el.isContentEditable) return true
    return false
  } catch {
    return false
  }
}
