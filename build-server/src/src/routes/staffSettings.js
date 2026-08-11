import { Router } from 'express'
import StaffSettings from '../models/StaffSettings.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'

const router = Router()

async function getSingleton() {
  let s = await StaffSettings.findOne()
  if (!s) s = await StaffSettings.create({})
  return s
}

// GET current staff settings
router.get('/', async (_req, res, next) => {
  try {
    const s = await getSingleton()
    res.json(s)
  } catch (e) { next(e) }
})

// PATCH update staff settings
router.patch('/', authRequired, requireRole('Admin','Manager'), async (req, res, next) => {
  try {
    const s = await getSingleton()
    Object.assign(s, req.body)
    await s.save()
    try { await Audit.create({ type: 'settings', userId: req.user?.id||'', userName: req.user?.username || 'system', action: 'Updated staff settings', meta: { keys: Object.keys(req.body||{}) } }) } catch {}
    res.json(s)
  } catch (e) { next(e) }
})

export default router
