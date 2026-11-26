import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { useAuth } from '@/state/AuthContext.jsx'
import { useBranch } from '@/state/BranchContext.jsx'

const MUTE_KEY = 'cc_inbox_sound_muted'
const READ_KEY = 'cc_inbox_read_ids'
const REPEAT_MS = 4000
const MAX_READ_IDS = 400

function api() {
  return (typeof window !== 'undefined' && window.API_BASE) || import.meta.env.VITE_API_BASE || 'http://localhost:5000'
}

function orderId(o) {
  return String(o?._id || o?.id || '')
}

export function getCcInboxMuted() {
  try { return localStorage.getItem(MUTE_KEY) === '1' } catch { return false }
}

export function setCcInboxMuted(on) {
  const next = Boolean(on)
  try { localStorage.setItem(MUTE_KEY, next ? '1' : '0') } catch {}
  try { window.dispatchEvent(new CustomEvent('cc_inbox_mute', { detail: { muted: next } })) } catch {}
  return next
}

export function loadCcInboxReadIds() {
  try {
    const raw = JSON.parse(localStorage.getItem(READ_KEY) || '[]')
    return new Set(Array.isArray(raw) ? raw.map(String) : [])
  } catch {
    return new Set()
  }
}

function saveReadIds(set) {
  try {
    const arr = [...set]
    localStorage.setItem(READ_KEY, JSON.stringify(arr.slice(-MAX_READ_IDS)))
  } catch {}
}

/** Mark order ids as read — stops repeating alert for them. */
export function markCcInboxRead(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean)
  if (!list.length) return
  const read = loadCcInboxReadIds()
  for (const id of list) read.add(id)
  saveReadIds(read)
  try { window.dispatchEvent(new CustomEvent('cc_inbox_read', { detail: { ids: list } })) } catch {}
}

/** Soft beep when a new CC order arrives (no asset file required). */
export function playCcAlertTone() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    if (!playCcAlertTone._ctx) playCcAlertTone._ctx = new Ctx()
    const ctx = playCcAlertTone._ctx
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
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
  } catch {}
}

/**
 * Polls CC Inbox remaining orders for branch alerts.
 * Loops sound for unread remaining orders until mark-as-read or mute.
 */
export function useCcInboxAlert({ intervalMs = 12000, enabled = true } = {}) {
  const { token } = useAuth()
  const { activeBranchId } = useBranch()
  const [pendingCount, setPendingCount] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [muted, setMutedState] = useState(() => getCcInboxMuted())
  const knownIds = useRef(new Set())
  const primed = useRef(false)
  const unreadRef = useRef(new Set())
  const mutedRef = useRef(muted)
  const remainingIdsRef = useRef([])
  const branchRef = useRef(String(activeBranchId || ''))

  useEffect(() => { mutedRef.current = muted }, [muted])

  // Reset alert priming when branch switches so counts match the new branch
  useEffect(() => {
    const next = String(activeBranchId || '')
    if (branchRef.current === next) return
    branchRef.current = next
    primed.current = false
    knownIds.current = new Set()
    unreadRef.current = new Set()
    remainingIdsRef.current = []
    setPendingCount(0)
    setUnreadCount(0)
  }, [activeBranchId])

  const setMuted = useCallback((on) => {
    const next = setCcInboxMuted(on)
    setMutedState(next)
    mutedRef.current = next
  }, [])

  const markRead = useCallback((ids) => {
    markCcInboxRead(ids)
    const list = (Array.isArray(ids) ? ids : [ids]).map(String).filter(Boolean)
    for (const id of list) unreadRef.current.delete(id)
    setUnreadCount(unreadRef.current.size)
  }, [])

  const markAllRead = useCallback(() => {
    markRead(remainingIdsRef.current)
  }, [markRead])

  const refresh = useCallback(async () => {
    if (!token || !enabled) return
    try {
      const headers = {
        Authorization: `Bearer ${token}`,
        ...(activeBranchId ? { 'X-Branch-Id': String(activeBranchId) } : {}),
      }
      const res = await fetch(`${api()}/api/call-center-orders/inbox?tab=remaining`, {
        headers,
        cache: 'no-store',
      })
      if (!res.ok) return
      const rows = await res.json()
      let list = Array.isArray(rows) ? rows : []
      if (activeBranchId) {
        list = list.filter((o) => String(o?.branchId || '') === String(activeBranchId))
      }
      const ids = list.map(orderId).filter(Boolean)
      remainingIdsRef.current = ids
      setPendingCount(ids.length)

      const read = loadCcInboxReadIds()
      const unread = new Set(ids.filter((id) => !read.has(id)))
      unreadRef.current = unread
      setUnreadCount(unread.size)

      if (!primed.current) {
        knownIds.current = new Set(ids)
        primed.current = true
        return
      }

      const fresh = ids.filter((id) => !knownIds.current.has(id))
      if (fresh.length) {
        const first = list.find((o) => orderId(o) === fresh[0])
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
        if (!mutedRef.current) playCcAlertTone()
      }
      knownIds.current = new Set(ids)
    } catch {}
  }, [token, enabled, activeBranchId])

  // Repeat alert while unread remain and not muted
  useEffect(() => {
    if (!enabled || !token) return undefined
    const tick = () => {
      if (mutedRef.current) return
      if (unreadRef.current.size > 0) playCcAlertTone()
    }
    const t = setInterval(tick, REPEAT_MS)
    return () => clearInterval(t)
  }, [enabled, token])

  useEffect(() => {
    if (!enabled || !token) {
      setPendingCount(0)
      setUnreadCount(0)
      primed.current = false
      knownIds.current = new Set()
      unreadRef.current = new Set()
      remainingIdsRef.current = []
      return undefined
    }
    refresh()
    const t = setInterval(refresh, intervalMs)
    const onLive = () => refresh()
    const onMute = (e) => {
      const next = Boolean(e?.detail?.muted)
      setMutedState(next)
      mutedRef.current = next
    }
    const onRead = () => {
      const read = loadCcInboxReadIds()
      const unread = new Set(remainingIdsRef.current.filter((id) => !read.has(id)))
      unreadRef.current = unread
      setUnreadCount(unread.size)
    }
    window.addEventListener('live_refresh', onLive)
    window.addEventListener('epicspire:sync', onLive)
    window.addEventListener('data_rehydrated', onLive)
    window.addEventListener('cc_inbox_mute', onMute)
    window.addEventListener('cc_inbox_read', onRead)
    return () => {
      clearInterval(t)
      window.removeEventListener('live_refresh', onLive)
      window.removeEventListener('epicspire:sync', onLive)
      window.removeEventListener('data_rehydrated', onLive)
      window.removeEventListener('cc_inbox_mute', onMute)
      window.removeEventListener('cc_inbox_read', onRead)
    }
  }, [refresh, intervalMs, enabled, token])

  return {
    pendingCount,
    unreadCount,
    muted,
    setMuted,
    markRead,
    markAllRead,
    refresh,
  }
}
