import { Router } from 'express'
import Settings from '../models/Settings.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

// Ensure there is effectively one settings doc
async function getSingleton() {
  // Prefer the most recently updated document if duplicates exist
  let s = await Settings.findOne({}, {}, { sort: { updatedAt: -1, createdAt: -1 } })
  if (!s) {
    s = await Settings.create({ companyName: 'Restaurant POS' })
  }
  return s
}

// GET current settings
router.get('/', async (_req, res, next) => {
  try {
    const s = await getSingleton()
    res.json(s)
  } catch (e) { next(e) }
})

// PATCH update settings
router.patch('/', authRequired, requireRole('admin','manager','Admin','Manager'), async (req, res, next) => {
  try {
    // Feature access (enabledPaths) is managed exclusively by the SuperAdmin portal
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'enabledPaths') && req.user?.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Only superadmin can change feature access' })
    }
    const s = await getSingleton()
    Object.assign(s, req.body)
    await s.save()
    // Best-effort cleanup of accidental duplicates
    try { await Settings.deleteMany({ _id: { $ne: s._id } }) } catch {}
    try { await Audit.create({ type: 'settings', userId: req.user?.id||'', userName: req.user?.username || 'system', action: 'Updated settings', meta: { keys: Object.keys(req.body||{}) } }) } catch {}
    res.json(s)
  } catch (e) { next(e) }
})

export default router
