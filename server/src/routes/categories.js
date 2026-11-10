import { Router } from 'express'
import Category from '../models/Category.js'
import BranchCategoryOverride from '../models/BranchCategoryOverride.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { isHqUser, resolveBranchId } from '../utils/branchScope.js'

const router = Router()

router.use(authRequired)

function isAdminActor(user) {
  return user?.role === 'Admin' || user?.role === 'SuperAdmin' || isHqUser(user)
}

function isSharedCat(c) {
  return !String(c?.branchId || '').trim()
}

function toPublic(c, override = null, branchId = '') {
  const base = c.toObject ? c.toObject() : { ...c }
  const id = String(base._id || base.id)
  const shared = isSharedCat(base)
  const o = override || null
  return {
    ...base,
    id,
    _id: base._id || id,
    name: (o?.name !== undefined && o?.name !== null && String(o.name).trim()) ? String(o.name) : base.name,
    showOnPos: o?.showOnPos !== undefined && o?.showOnPos !== null ? !!o.showOnPos : (base.showOnPos !== false),
    active: o?.active !== undefined && o?.active !== null ? !!o.active : (base.active !== false),
    imageUrl: (o?.imageUrl !== undefined && o?.imageUrl !== null) ? String(o.imageUrl) : (base.imageUrl || ''),
    sortOrder: o?.sortOrder !== undefined && o?.sortOrder !== null ? Number(o.sortOrder) : Number(base.sortOrder || 0),
    discount: o?.discount !== undefined && o?.discount !== null ? Number(o.discount) : Number(base.discount || 0),
    branchId: base.branchId || '',
    isShared: shared,
    isBranchOnly: !shared,
    hasOverride: !!o,
    baseName: base.name || '',
    baseDiscount: Number(base.discount || 0),
    baseActive: base.active !== false,
    viewBranchId: branchId || '',
  }
}

function parseBool(v, defaultTrue = true) {
  if (v === undefined || v === null || v === '') return defaultTrue
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  const s = String(v).trim().toLowerCase()
  if (['no', 'n', 'false', '0', 'inactive', 'off'].includes(s)) return false
  if (['yes', 'y', 'true', '1', 'active', 'on'].includes(s)) return true
  return defaultTrue
}

async function listForBranch(branchId) {
  const sharedQ = { $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }] }
  const q = branchId ? { $or: [sharedQ, { branchId: String(branchId) }] } : sharedQ
  const items = await Category.find(q).sort({ sortOrder: 1, name: 1 }).lean()

  let overrideMap = new Map()
  if (branchId) {
    const overrides = await BranchCategoryOverride.find({ branchId: String(branchId) }).lean()
    overrideMap = new Map(overrides.map(o => [String(o.categoryId), o]))
  }

  return items.map(it => {
    const o = isSharedCat(it) ? (overrideMap.get(String(it._id)) || null) : null
    return toPublic(it, o, branchId)
  })
}

// List categories (shared + current branch-only, with overrides)
router.get('/', async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch {
      branchId = String(req.headers['x-branch-id'] || '').trim()
    }
    if (String(req.query.scope || '').toLowerCase() === 'shared') {
      const items = await Category.find({
        $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }],
        ...(req.query.active ? { active: req.query.active === 'true' } : {}),
      }).sort({ sortOrder: 1, name: 1 }).lean()
      return res.json(items.map(it => toPublic(it, null, '')))
    }
    let list = await listForBranch(branchId)
    if (req.query.active === 'true') list = list.filter(c => c.active !== false)
    res.json(list)
  } catch (e) { next(e) }
})

/** Bulk upsert categories from CSV/Excel-parsed rows */
router.post('/import', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const rows = Array.isArray(body) ? body : (Array.isArray(body.categories) ? body.categories : (Array.isArray(body.rows) ? body.rows : []))
    if (!rows.length) return res.status(400).json({ error: 'Provide categories to import' })
    let upserted = 0
    for (const raw of rows) {
      const name = String(raw?.name || '').trim()
      if (!name) continue
      const patch = {
        name,
        showOnPos: parseBool(raw.showOnPos, true),
        active: parseBool(raw.active, true),
        imageUrl: String(raw.imageUrl || ''),
        sortOrder: Number(raw.sortOrder ?? 0) || 0,
        discount: Number(raw.discount ?? 0) || 0,
        branchId: '',
      }
      await Category.findOneAndUpdate(
        { name, $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }] },
        patch,
        { upsert: true, new: true },
      )
      upserted += 1
    }
    await logAudit(req, 'category', `Imported categories (${upserted})`, { count: upserted })
    res.json({ ok: true, categories: upserted })
  } catch (e) { next(e) }
})

// Create category
router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    if (!body.name) return res.status(400).json({ error: 'name is required' })

    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch {
      branchId = String(req.headers['x-branch-id'] || body.branchId || '').trim()
    }

    const branchOnly = !!body.branchOnly
    if (branchOnly && !branchId) {
      return res.status(400).json({ error: 'branchId required for branch-only categories' })
    }
    const item = await Category.create({
      name: String(body.name).trim(),
      showOnPos: !!body.showOnPos,
      active: body.active !== false,
      imageUrl: String(body.imageUrl || ''),
      sortOrder: Number(body.sortOrder ?? 0),
      discount: Number(body.discount ?? 0),
      branchId: branchOnly ? String(branchId || '') : '',
    })
    await logAudit(req, 'category', `Added category ${item.name}`, { id: item._id, branchId: item.branchId || '' })
    res.status(201).json(toPublic(item, null, branchId))
  } catch (e) { next(e) }
})

/** Clear branch override for a shared category */
router.delete('/:id/override', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req, { required: true }) } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'branchId required' })
    }
    await BranchCategoryOverride.deleteOne({ branchId: String(branchId), categoryId: req.params.id })
    const item = await Category.findById(req.params.id).lean()
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(toPublic(item, null, branchId))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Update category
router.patch('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const editShared = !!body.editShared || String(body.scope || '').toLowerCase() === 'shared'
    const update = { ...body }
    delete update.editShared
    delete update.scope
    delete update.branchOnly
    delete update.isShared
    delete update.isBranchOnly
    delete update.hasOverride
    delete update.baseName
    delete update.baseDiscount
    delete update.baseActive
    delete update.viewBranchId
    delete update.id
    delete update._id

    if (update.name !== undefined) update.name = String(update.name).trim()
    if (update.imageUrl !== undefined) update.imageUrl = String(update.imageUrl || '')
    if (update.sortOrder !== undefined) update.sortOrder = Number(update.sortOrder ?? 0)
    if (update.discount !== undefined) update.discount = Number(update.discount ?? 0)

    const existing = await Category.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch {
      branchId = String(req.headers['x-branch-id'] || '').trim()
    }

    // Branch-only item: update the document directly
    if (!isSharedCat(existing)) {
      if (branchId && String(existing.branchId) !== String(branchId) && !isAdminActor(req.user)) {
        return res.status(403).json({ error: 'Cannot edit another branch category' })
      }
      Object.assign(existing, update)
      await existing.save()
      await logAudit(req, 'category', `Updated branch category ${req.params.id}`, { id: req.params.id })
      return res.json(toPublic(existing, null, branchId || existing.branchId))
    }

    // Shared catalog edit only when explicitly requested
    if (editShared) {
      if (!isAdminActor(req.user)) {
        return res.status(403).json({ error: 'Only admin can edit the shared category catalog' })
      }
      Object.assign(existing, update)
      existing.branchId = ''
      await existing.save()
      await logAudit(req, 'category', `Updated shared category ${req.params.id}`, { id: req.params.id })
      return res.json(toPublic(existing, null, ''))
    }

    // Shared category viewed in a branch → upsert override
    if (!branchId) {
      return res.status(400).json({ error: 'branchId required for branch override — select a branch in the header' })
    }

    const overrideFields = {}
    for (const key of ['name', 'showOnPos', 'active', 'imageUrl', 'sortOrder', 'discount']) {
      if (update[key] !== undefined) overrideFields[key] = update[key]
    }

    let override = await BranchCategoryOverride.findOne({ branchId: String(branchId), categoryId: existing._id })
    if (Object.keys(overrideFields).length) {
      override = await BranchCategoryOverride.findOneAndUpdate(
        { branchId: String(branchId), categoryId: existing._id },
        { $set: { ...overrideFields, branchId: String(branchId), categoryId: existing._id } },
        { upsert: true, new: true },
      )
      await logAudit(req, 'category', `Branch override category ${req.params.id}`, { id: req.params.id, branchId, patch: overrideFields })
    }
    res.json(toPublic(existing, override, branchId))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Delete category
router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Category.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })

    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch {
      branchId = String(req.headers['x-branch-id'] || '').trim()
    }

    if (!isSharedCat(existing)) {
      if (branchId && String(existing.branchId) !== String(branchId) && !isAdminActor(req.user)) {
        return res.status(403).json({ error: 'Cannot delete another branch category' })
      }
      await existing.deleteOne()
      await logAudit(req, 'category', `Deleted branch category ${req.params.id}`, { id: req.params.id })
      return res.json({ ok: true })
    }

    const hard = String(req.query.scope || '').toLowerCase() === 'shared' || req.query.hard === '1'
    if (hard) {
      if (!isAdminActor(req.user)) {
        return res.status(403).json({ error: 'Only admin can hard-delete shared categories' })
      }
      await BranchCategoryOverride.deleteMany({ categoryId: existing._id })
      await existing.deleteOne()
      await logAudit(req, 'category', `Hard-deleted shared category ${req.params.id}`, { id: req.params.id })
      return res.json({ ok: true })
    }

    // Soft-hide for this branch via override
    if (!branchId) {
      return res.status(400).json({ error: 'Select a branch to hide this shared category, or hard-delete as admin' })
    }
    await BranchCategoryOverride.findOneAndUpdate(
      { branchId: String(branchId), categoryId: existing._id },
      { $set: { branchId: String(branchId), categoryId: existing._id, active: false } },
      { upsert: true, new: true },
    )
    await logAudit(req, 'category', `Hidden shared category ${req.params.id} for branch`, { id: req.params.id, branchId })
    res.json({ ok: true, hidden: true })
  } catch (e) { next(e) }
})

export default router
