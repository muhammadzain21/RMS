import { Router } from 'express'
import { authRequired } from '../../middleware/auth.js'
import { BiometricSyncState } from '../models/BiometricSyncState.js'
import { env, reloadBiometricConfig } from '../../config/env.js'
import * as Mappings from '../controllers/mappings.controller.js'
import * as Events from '../controllers/events.controller.js'
import * as Sync from '../controllers/sync.controller.js'
import * as Device from '../controllers/device.controller.js'

const r = Router()

// Reset sync state - allows re-fetching all records from device
r.post('/sync/reset', authRequired, async (_req, res) => {
  try {
    await BiometricSyncState.deleteMany({})
    res.json({ ok: true, message: 'Sync state reset. Next sync will fetch all records from device.' })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

// All biometric routes require authentication
r.get('/mappings', authRequired, Mappings.list)
r.post('/mappings', authRequired, Mappings.upsert)
r.delete('/mappings/:id', authRequired, Mappings.remove)

r.get('/events', authRequired, Events.list)
r.get('/events/unknown', authRequired, Events.listUnknown)

r.post('/sync/once', authRequired, Sync.syncNow)

r.get('/device/users', authRequired, Device.listDeviceUsers)

r.post('/test-connection', authRequired, async (_req, res) => {
  try {
    await reloadBiometricConfig()
    if (!env.BIOMETRIC_ENABLED) return res.json({ ok: false, message: 'Biometric is disabled in settings' })
    if (!env.BIOMETRIC_IP) return res.json({ ok: false, message: 'Device IP is not configured' })

    const { default: ZKLib } = await import('node-zklib')
    const ip = String(env.BIOMETRIC_IP)
    const port = Number(env.BIOMETRIC_PORT || 4370)
    const password = Number(env.BIOMETRIC_COMM_PASSWORD || 0)
    const zk = new ZKLib(ip, port, 10000, 5200, password)

    try {
      await zk.createSocket()
      const info = await zk.getInfo().catch(() => ({}))
      await zk.disconnect()
      return res.json({ ok: true, message: 'Connected successfully', deviceInfo: info })
    } catch (e) {
      const msg = e?.message || String(e) || 'Unknown error'
      // Retry once with password 0
      if (password && password !== 0) {
        const zk2 = new ZKLib(ip, port, 10000, 5200, 0)
        try {
          await zk2.createSocket()
          const info = await zk2.getInfo().catch(() => ({}))
          await zk2.disconnect()
          return res.json({ ok: true, message: 'Connected with default password (0). Please set COMM password to 0 on device or update password in settings.', deviceInfo: info })
        } catch (e2) {
          return res.json({ ok: false, message: msg, ip, port })
        }
      }
      return res.json({ ok: false, message: msg, ip, port })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

export default r
