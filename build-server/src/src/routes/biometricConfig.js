import { Router } from 'express'
import BiometricConfig from '../models/BiometricConfig.js'
import { authRequired, requireRole } from '../middleware/auth.js'

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
    Object.assign(cfg, req.body)
    await cfg.save()
    try { await BiometricConfig.deleteMany({ _id: { $ne: cfg._id } }) } catch {}
    res.json(cfg)
  } catch (e) { next(e) }
})

export default router
