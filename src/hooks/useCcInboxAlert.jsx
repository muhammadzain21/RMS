import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/state/AuthContext.jsx'

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function orderId(o) {
  return String(o?._id || o?.id || '')
}

/** Soft beep when a new CC order arrives (no asset file required). */
function playAlertTone() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.value = 0.08
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.stop(ctx.currentTime + 0.4)
    setTimeout(() => { try { ctx.close() } catch {} }, 500)
  } catch {}
}

/**
 * Polls CC Inbox remaining orders for branch alerts.
 * Returns pending/remaining count for header / sidebar badges.
 */
export function useCcInboxAlert({ intervalMs = 12000, enabled = true } = {}) {
  const { token } = useAuth()
  const [pendingCount, setPendingCount] = useState(0)
  const knownIds = useRef(new Set())
  const primed = useRef(false)

  const refresh = useCallback(async () => {
    if (!token || !enabled) return
    try {
      const res = await fetch(`${api()}/api/call-center-orders/inbox?tab=remaining`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      if (!res.ok) return
      const rows = await res.json()
      const list = Array.isArray(rows) ? rows : []
      // Remaining = pending + accepted (still needs cashier attention)
      const ids = list.map(orderId).filter(Boolean)
      setPendingCount(ids.length)

      if (!primed.current) {
        knownIds.current = new Set(ids)
        primed.current = true
        return
      }

      const fresh = ids.filter(id => !knownIds.current.has(id))
      if (fresh.length) {
        const first = list.find(o => orderId(o) === fresh[0])
        const branch = first?.branchName || 'branch'
        const phone = first?.customer?.phone || first?.customer?.name || ''
        toast(
          (t) => (
            <button
              type="button"
              className="text-left"
              onClick={() => {
                toast.dismiss(t.id)
                try { window.dispatchEvent(new CustomEvent('navigate_cc_inbox')) } catch {}
              }}
            >
              <div className="font-bold text-sm">New call-center order</div>
              <div className="text-xs opacity-90 mt-0.5">
                {fresh.length > 1 ? `${fresh.length} new orders` : `${branch}${phone ? ` · ${phone}` : ''}`}
              </div>
              <div className="text-[11px] mt-1 underline">Open CC Inbox</div>
            </button>
          ),
          { duration: 8000, icon: '📞' },
        )
        playAlertTone()
      }
      knownIds.current = new Set(ids)
    } catch {}
  }, [token, enabled])

  useEffect(() => {
    if (!enabled || !token) {
      setPendingCount(0)
      primed.current = false
      knownIds.current = new Set()
      return undefined
    }
    refresh()
    const t = setInterval(refresh, intervalMs)
    const onLive = () => refresh()
    window.addEventListener('live_refresh', onLive)
    window.addEventListener('epicspire:sync', onLive)
    window.addEventListener('data_rehydrated', onLive)
    return () => {
      clearInterval(t)
      window.removeEventListener('live_refresh', onLive)
      window.removeEventListener('epicspire:sync', onLive)
      window.removeEventListener('data_rehydrated', onLive)
    }
  }, [refresh, intervalMs, enabled, token])

  return { pendingCount, refresh }
}
