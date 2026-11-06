import { syncOnce } from '../jobs/poller.js'
import { reprocessUnknownEvents } from '../services/biometric_attendance.js'

export async function syncNow(_req, res) {
  const t0 = Date.now()
  try {
    const result = await syncOnce('api_sync_now')
    // Apply any staff mappings that failed earlier due to deviceId mismatch
    const reprocessed = await reprocessUnknownEvents({ days: 30, limit: 500 }).catch((e) => {
      console.warn('[biometric] reprocessUnknownEvents error:', e?.message || e)
      return null
    })
    const ms = Date.now() - t0
    if (result?.skipped) {
      return res.json({ ok: true, skipped: true, reason: result.reason, tookMs: ms, reprocessed })
    }
    res.json({ ok: true, tookMs: ms, reprocessed })
  } catch (e) {
    const ms = Date.now() - t0
    res.status(500).json({ ok: false, tookMs: ms, error: String(e?.message || e || 'error') })
  }
}
