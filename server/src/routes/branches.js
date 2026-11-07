import { Router } from 'express'
import Branch from '../models/Branch.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { isHqUser } from '../utils/branchScope.js'

const router = Router()

router.get('/', authRequired, async (req, res, next) => {
  try {
    let q = { active: { $ne: false } }
    if (!isHqUser(req.user)) {
      const ids = [
        ...(Array.isArray(req.user.branchIds) ? req.user.branchIds : []),
        req.user.homeBranchId,
      ].filter(Boolean).map(String)
      q = { ...q, _id: { $in: ids } }
    }
    const list = await Branch.find(q).sort({ name: 1 }).lean()
    res.json(list)
  } catch (e) { next(e) }
})

router.get('/:id', authRequired, async (req, res, next) => {
  try {
    const doc = await Branch.findById(req.params.id).lean()
    if (!doc) return res.status(404).json({ error: 'Branch not found' })
    res.json(doc)
  } catch (e) { next(e) }
})

router.post('/', authRequired, requireRole('Admin', 'SuperAdmin'), async (req, res, next) => {
  try {
    const { code, name, address, phone, mode, isWarehouse, notes, active } = req.body || {}
    if (!code || !name) return res.status(400).json({ error: 'code and name are required' })
    const created = await Branch.create({
      code: String(code).trim().toUpperCase(),
      name: String(name).trim(),
      address: address || '',
      phone: phone || '',
      mode: mode || 'hybrid',
      isWarehouse: !!isWarehouse,
      notes: notes || '',
      active: active !== false,
    })
    res.status(201).json(created)
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Branch code already exists' })
    next(e)
  }
})

router.patch('/:id', authRequired, requireRole('Admin', 'SuperAdmin'), async (req, res, next) => {
  try {
    const allowed = ['name', 'address', 'phone', 'mode', 'isWarehouse', 'notes', 'active']
    const patch = {}
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) patch[k] = req.body[k]
    }
    if (req.body?.code) patch.code = String(req.body.code).trim().toUpperCase()
    const updated = await Branch.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
    if (!updated) return res.status(404).json({ error: 'Branch not found' })
    res.json(updated)
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Branch code already exists' })
    next(e)
  }
})

export default router
