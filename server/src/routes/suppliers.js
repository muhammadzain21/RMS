import { Router } from 'express'
import Supplier from '../models/Supplier.js'
import Audit from '../models/Audit.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import {
  assertDocumentBranch,
  mergeBranchFilter,
  resolveBranchId,
  stampBranchId,
} from '../utils/branchScope.js'
import { getOrCreateSettings } from '../utils/settingsScope.js'

const router = Router()

router.use(authRequired)

const legacyUnscopedBranch = {
  scope: { $ne: 'warehouse' },
  $or: [
    { branchId: '' },
    { branchId: null },
    { branchId: { $exists: false } },
  ],
}

/** First visit: copy unscoped branch suppliers into this branch (once). */
async function ensureBranchSuppliers(req) {
  const branchId = resolveBranchId(req)
  if (!branchId) return
  const settings = await getOrCreateSettings(branchId)
  if (settings.suppliersCatalogSeeded) return
  const owned = await Supplier.countDocuments({
    branchId: String(branchId),
    scope: { $ne: 'warehouse' },
  })
  if (owned === 0) {
    const legacy = await Supplier.find(legacyUnscopedBranch).lean()
    for (const s of legacy) {
      const exists = await Supplier.findOne({
        branchId: String(branchId),
        scope: { $ne: 'warehouse' },
        name: s.name || '',
        company: s.company || '',
        phone: s.phone || '',
      })
      if (exists) continue
      await Supplier.create({
        name: s.name || '',
        company: s.company || '',
        phone: s.phone || '',
        address: s.address || '',
        taxId: s.taxId || '',
        status: s.status === 'Inactive' ? 'Inactive' : 'Active',
        scope: 'branch',
        branchId: String(branchId),
      })
    }
  }
  settings.suppliersCatalogSeeded = true
  await settings.save()
}

// List (basic search by q on name/company/phone with pagination)
router.get('/', async (req, res, next) => {
  try {
    await ensureBranchSuppliers(req)
    const { q = '', page = 1, limit = 10 } = req.query
    const pageNum = Math.max(1, parseInt(page, 10) || 1)
    const limitNum = Math.max(1, Math.min(1000, parseInt(limit, 10) || 10))
    // Branch suppliers only — never include warehouse (HQ) suppliers
    let filter = { scope: { $ne: 'warehouse' } }
    if (q) {
      const regex = { $regex: String(q), $options: 'i' }
      filter = {
        $and: [
          { scope: { $ne: 'warehouse' } },
          { $or: [{ name: regex }, { company: regex }, { phone: regex }] },
        ],
      }
    }
    filter = mergeBranchFilter(req, filter)
    const total = await Supplier.countDocuments(filter)
    const rows = await Supplier.find(filter)
      .sort({ name: 1, company: 1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
    res.json({ rows, total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Create
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = { ...(req.body || {}) }
    delete body.branchId
    delete body.scope
    const s = await Supplier.create(stampBranchId(req, { ...body, scope: 'branch' }))
    try { await Audit.create({ type: 'supplier', userId: req.user?.id || '', userName: req.user?.username || 'system', action: `Added supplier ${s?.name || s?.company || s?._id}`, meta: { id: s._id, branchId: s.branchId } }) } catch {}
    res.status(201).json(s)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Get single supplier by ID
router.get('/:id', async (req, res, next) => {
  try {
    const s = await Supplier.findById(req.params.id)
    if (!s) return res.status(404).json({ error: 'Supplier not found' })
    if (String(s.scope || '') === 'warehouse') {
      return res.status(404).json({ error: 'Supplier not found' })
    }
    assertDocumentBranch(req, s)
    res.json(s)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Update
router.patch('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Supplier.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Supplier not found' })
    if (String(existing.scope || '') === 'warehouse') {
      return res.status(404).json({ error: 'Supplier not found' })
    }
    assertDocumentBranch(req, existing)
    const body = { ...(req.body || {}) }
    delete body.branchId
    delete body.scope
    const s = await Supplier.findByIdAndUpdate(req.params.id, body, { new: true })
    try { await Audit.create({ type: 'supplier', userId: req.user?.id || '', userName: req.user?.username || 'system', action: `Updated supplier ${req.params.id}`, meta: { id: req.params.id, patch: body } }) } catch {}
    res.json(s)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Delete
router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Supplier.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    if (String(existing.scope || '') === 'warehouse') {
      return res.status(404).json({ error: 'Not found' })
    }
    assertDocumentBranch(req, existing)
    await Supplier.findByIdAndDelete(req.params.id)
    try { await Audit.create({ type: 'supplier', userId: req.user?.id || '', userName: req.user?.username || 'system', action: `Deleted supplier ${req.params.id}`, meta: { id: req.params.id } }) } catch {}
    res.json({ ok: true })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router
