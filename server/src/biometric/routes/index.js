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

r.post('/test-connection', authRequired, async (req, res) => {
  try {
    let branchId = ''
    try {
      const { resolveBranchId } = await import('../../utils/branchScope.js')
      branchId = resolveBranchId(req) || ''
    } catch { branchId = '' }
    await reloadBiometricConfig(branchId)
    if (!env.BIOMETRIC_ENABLED) return res.json({ ok: false, message: 'Biometric is disabled in settings' })
    if (!env.BIOMETRIC_IP) return res.json({ ok: false, message: 'Device IP is not configured' })

    const { connectZk, disconnectZk, formatZkErr } = await import('../zkConnect.js')
    const ip = String(env.BIOMETRIC_IP)
    const port = Number(env.BIOMETRIC_PORT || 4370)
    const password = Number(env.BIOMETRIC_COMM_PASSWORD || 0)

    // Strict: only the COMM Key saved in settings — no silent fallback to 0.
    try {
      const { zk } = await connectZk({ ip, port, password })
      try {
        const info = await zk.getInfo()
        if (!info || (typeof info === 'object' && !Object.keys(info).length)) {
          // Empty info often means auth failed on password-protected devices
          if (password) {
            return res.json({
              ok: false,
              message: `Connected to TCP but device did not accept COMM Key ${password}. Set the same Comm Key as on the machine.`,
              ip,
              port,
            })
          }
        }
        return res.json({
          ok: true,
          message: 'Connected successfully',
          deviceInfo: info,
          usedPassword: password,
          ip,
          port,
        })
      } finally {
        await disconnectZk(zk)
      }
    } catch (e) {
      return res.json({
        ok: false,
        message: formatZkErr(e) || 'Connection failed',
        tip: 'COMM Key in settings must match the machine Comm Key exactly (no fallback).',
        ip,
        port,
      })
    }
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e) })
  }
})

export default r
