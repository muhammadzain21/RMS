import { Router } from 'express'
import BiometricConfig from '../models/BiometricConfig.js'
import { BiometricMapping } from '../biometric/models/BiometricMapping.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { reloadBiometricConfig } from '../config/env.js'
import { assertBranchAccess, resolveBranchId } from '../utils/branchScope.js'
import { getOrCreateBiometricConfig } from '../utils/settingsScope.js'

const router = Router()

// GET /api/biometric-config — per active branch
router.get('/', authRequired, async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch { branchId = '' }
    if (branchId) assertBranchAccess(req, branchId)
    const cfg = await getOrCreateBiometricConfig(branchId)
    res.json(cfg)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// PATCH /api/biometric-config
router.patch('/', authRequired, requireRole('admin', 'manager', 'Admin', 'Manager'), async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch { branchId = '' }
    if (!branchId && (req.user?.role === 'Admin' || req.user?.role === 'SuperAdmin' || req.user?.isHq)) {
      return res.status(400).json({ error: 'Select a branch in the header to edit that branch’s biometric settings' })
    }
    if (branchId) assertBranchAccess(req, branchId)

    const cfg = await getOrCreateBiometricConfig(branchId)
    const prevDeviceId = String(cfg.deviceId || 'ZK-01')
    const body = { ...(req.body || {}) }
    delete body.branchId
    Object.assign(cfg, body)
    if (branchId) cfg.branchId = String(branchId)
    await cfg.save()

    const nextDeviceId = String(cfg.deviceId || 'ZK-01')
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

    try { await reloadBiometricConfig(branchId) } catch {}
    res.json(cfg)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
