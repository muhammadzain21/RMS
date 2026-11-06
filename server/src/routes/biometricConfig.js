import { Router } from 'express'
import BiometricConfig from '../models/BiometricConfig.js'
import { BiometricMapping } from '../biometric/models/BiometricMapping.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { reloadBiometricConfig } from '../config/env.js'

const router = Router()

async function getSingleton() {
  let cfg = await BiometricConfig.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } })
  if (!cfg) {
    cfg = await BiometricConfig.create({})
  }
  return cfg
}

// GET /api/biometric-config
router.get('/', async (_req, res, next) => {
  try {
    const cfg = await getSingleton()
    res.json(cfg)
  } catch (e) { next(e) }
})

// PATCH /api/biometric-config
router.patch('/', authRequired, requireRole('admin','manager','Admin','Manager'), async (req, res, next) => {
  try {
    const cfg = await getSingleton()
    const prevDeviceId = String(cfg.deviceId || 'ZK-01')
    Object.assign(cfg, req.body)
    await cfg.save()
    try { await BiometricConfig.deleteMany({ _id: { $ne: cfg._id } }) } catch {}

    const nextDeviceId = String(cfg.deviceId || 'ZK-01')
    // Keep staff↔enroll mappings on the current Device ID when it changes in settings
    if (nextDeviceId && nextDeviceId !== prevDeviceId) {
      try {
        const updated = await BiometricMapping.updateMany(
          { deviceId: prevDeviceId },
          { $set: { deviceId: nextDeviceId } }
        )
        console.log(`[biometric-config] Migrated mappings deviceId ${prevDeviceId} → ${nextDeviceId}:`, updated?.modifiedCount ?? updated)
      } catch (e) {
        console.warn('[biometric-config] Mapping deviceId migrate failed:', e?.message || e)
      }
    }

    try { await reloadBiometricConfig() } catch {}
    res.json(cfg)
  } catch (e) { next(e) }
})

export default router
