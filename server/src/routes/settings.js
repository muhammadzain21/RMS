import { Router } from 'express'
import Audit from '../models/Audit.js'
import Settings from '../models/Settings.js'
import { authRequired, authOptional, requireRole } from '../middleware/auth.js'
import { assertBranchAccess, resolveBranchId } from '../utils/branchScope.js'
import { getOrCreateSettings } from '../utils/settingsScope.js'

const router = Router()

// GET current settings for active branch (X-Branch-Id / homeBranch / query)
// authOptional: global fetch attaches X-Branch-Id; branch checks need req.user
router.get('/', authOptional, async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch { branchId = '' }
    if (branchId) {
      try { assertBranchAccess(req, branchId) } catch (e) {
        return res.status(e.status || 403).json({ error: e.message })
      }
    }
    const s = await getOrCreateSettings(branchId)
    res.json(s)
  } catch (e) { next(e) }
})

// PATCH update settings for active branch
router.patch('/', authRequired, requireRole('admin', 'manager', 'Admin', 'Manager'), async (req, res, next) => {
  try {
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'enabledPaths') && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Only superadmin can change feature access' })
    }

    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch { branchId = '' }
    if (branchId) assertBranchAccess(req, branchId)

    // HQ with "All branches" must pick a branch before editing branch settings
    if (!branchId && (req.user?.role === 'Admin' || req.user?.role === 'SuperAdmin' || req.user?.isHq)) {
      // Allow SuperAdmin enabledPaths-only updates on the legacy/global doc
      const keys = Object.keys(req.body || {})
      const onlyPaths = keys.length === 1 && keys[0] === 'enabledPaths'
      if (!onlyPaths) {
        return res.status(400).json({ error: 'Select a branch in the header to edit that branch’s settings' })
      }
    }

    const s = await getOrCreateSettings(branchId)
    const body = { ...(req.body || {}) }
    delete body.branchId
    Object.assign(s, body)
    if (branchId) s.branchId = String(branchId)
    await s.save()

    // Feature access is global — mirror onto all settings docs
    if (Object.prototype.hasOwnProperty.call(body, 'enabledPaths')) {
      try {
        await Settings.updateMany({}, { $set: { enabledPaths: body.enabledPaths } })
      } catch {}
    }

    try {
      await Audit.create({
        type: 'settings',
        userId: req.user?.id || '',
        userName: req.user?.username || 'system',
        action: 'Updated settings',
        meta: { keys: Object.keys(body), branchId: branchId || '' },
      })
    } catch {}
    res.json(s)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
