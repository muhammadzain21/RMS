import { syncOnce } from '../jobs/poller.js'

export async function syncNow(_req, res) {
  const t0 = Date.now()
  try {
    const result = await syncOnce('api_sync_now')
    const ms = Date.now() - t0
    if (result?.skipped) {
      return res.json({ ok: true, skipped: true, reason: result.reason, tookMs: ms })
    }
    res.json({ ok: true, tookMs: ms })
  } catch (e) {
    const ms = Date.now() - t0
    res.status(500).json({ ok: false, tookMs: ms, error: String(e?.message || e || 'error') })
  }
}
