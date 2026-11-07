import { Router } from 'express'
import MenuItem from '../models/MenuItem.js'
import Category from '../models/Category.js'
import BranchMenuOverride from '../models/BranchMenuOverride.js'
import Ingredient from '../models/Ingredient.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { isHqUser, resolveBranchId } from '../utils/branchScope.js'

const router = Router()

router.use(authRequired)

function isAdminActor(user) {
  return user?.role === 'Admin' || user?.role === 'SuperAdmin' || isHqUser(user)
}

function isSharedItem(item) {
  return !String(item?.branchId || '').trim()
}

function toPublic(item, override = null, branchId = '') {
  const base = item.toObject ? item.toObject() : { ...item }
  const id = String(base._id || base.id)
  const shared = isSharedItem(base)
  const o = override || null
  const merged = {
    ...base,
    id,
    _id: base._id || id,
    price: o?.price !== undefined && o?.price !== null ? Number(o.price) : Number(base.price || 0),
    discount: o?.discount !== undefined && o?.discount !== null ? Number(o.discount) : Number(base.discount || 0),
    active: o?.active !== undefined && o?.active !== null ? !!o.active : (base.active !== false),
    name: (o?.name !== undefined && o?.name !== null && String(o.name).trim()) ? String(o.name) : base.name,
    category: (o?.category !== undefined && o?.category !== null && String(o.category).trim()) ? String(o.category) : (base.category || ''),
    sortOrder: o?.sortOrder !== undefined && o?.sortOrder !== null ? Number(o.sortOrder) : Number(base.sortOrder || 0),
    imageUrl: (o?.imageUrl !== undefined && o?.imageUrl !== null) ? String(o.imageUrl) : (base.imageUrl || ''),
    branchId: base.branchId || '',
    isShared: shared,
    isBranchOnly: !shared,
    hasOverride: !!o,
    basePrice: Number(base.price || 0),
    baseActive: base.active !== false,
    viewBranchId: branchId || '',
  }
  return merged
}

async function normalizeRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') return recipe
  const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ')
  const ings = await Ingredient.find({}, { name: 1 }).lean()
  const byNorm = new Map(ings.map(i => [norm(i.name), i.name]))
  const merged = {}
  for (const [k, v] of Object.entries(recipe || {})) {
    const amt = Number(v || 0)
    if (!(amt > 0)) continue
    const canon = byNorm.get(norm(k)) || String(k).trim()
    merged[canon] = Number((merged[canon] || 0) + amt)
  }
  return merged
}

/** Effective menu for a branch: shared + branch-only, with overrides applied */
async function listForBranch(branchId, { activeOnly = false } = {}) {
  const sharedQ = { $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }] }
  const branchQ = branchId ? { branchId: String(branchId) } : null
  const items = await MenuItem.find(branchQ ? { $or: [sharedQ, branchQ] } : sharedQ)
    .sort({ sortOrder: 1, name: 1 })
    .lean()

  let overrideMap = new Map()
  if (branchId) {
    const overrides = await BranchMenuOverride.find({ branchId: String(branchId) }).lean()
    overrideMap = new Map(overrides.map(o => [String(o.menuItemId), o]))
  }

  let merged = items.map(it => {
    const o = isSharedItem(it) ? (overrideMap.get(String(it._id)) || null) : null
    return toPublic(it, o, branchId)
  })

  if (activeOnly) merged = merged.filter(i => i.active !== false)
  return merged
}

// GET /api/menu — ?branchId= or X-Branch-Id; ?scope=shared for HQ shared-only edit
router.get('/', async (req, res, next) => {
  try {
    const scope = String(req.query.scope || '').toLowerCase()
    const activeOnly = req.query.active === 'true'
    if (scope === 'shared') {
      if (!isAdminActor(req.user)) return res.status(403).json({ error: 'Only admin can list shared catalog alone' })
      const q = { $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }] }
      if (activeOnly) q.active = true
      const items = await MenuItem.find(q).sort({ sortOrder: 1, name: 1 }).lean()
      return res.json(items.map(it => toPublic(it, null, '')))
    }

    let branchId = ''
    try {
      branchId = resolveBranchId(req) || ''
    } catch {
      branchId = String(req.query.branchId || req.headers['x-branch-id'] || '').trim()
    }
    const list = await listForBranch(branchId, { activeOnly })
    res.json(list)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// Export shared menu catalog (items + categories)
router.get('/export', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const items = await MenuItem.find({
      $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }],
    }).sort({ category: 1, name: 1 }).lean()
    const categories = await Category.find({}).sort({ sortOrder: 1, name: 1 }).lean()
    const fmt = (req.query.format || 'json').toLowerCase()
    if (fmt === 'csv') {
      const headers = ['Name', 'Category', 'SKU', 'Price', 'Discount %', 'Sort Order', 'Active', 'Description']
      const rows = items.map(i => ([
        i.name || '',
        i.category || '',
        i.sku || '',
        i.price ?? 0,
        i.discount ?? 0,
        i.sortOrder ?? 0,
        i.active === false ? 'No' : 'Yes',
        i.description || '',
      ]))
      const esc = (v) => {
        const s = String(v ?? '')
        return /[,\n\r"]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
      }
      const csv = [headers.join(','), ...rows.map(r => r.map(esc).join(','))].join('\n')
      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', 'attachment; filename="menu_export.csv"')
      return res.send(csv)
    }
    const payload = {
      categories: categories.map(({ name, showOnPos, active, imageUrl, sortOrder, discount }) => ({
        name, showOnPos, active, imageUrl, sortOrder, discount,
      })),
      items: items.map(({ name, category, price, sku, description, sortOrder, active, imageUrl, discount, recipe }) => ({
        name, category, price, sku, description, sortOrder, active, imageUrl, discount, recipe,
      })),
    }
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="menu_export.json"')
    res.send(JSON.stringify(payload, null, 2))
  } catch (e) { next(e) }
})

router.post('/', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const payload = { ...(req.body || {}) }
    if (payload.recipe && typeof payload.recipe === 'object') {
      payload.recipe = await normalizeRecipe(payload.recipe)
    }

    const editShared = !!payload.editShared || String(payload.scope || '').toLowerCase() === 'shared'
    delete payload.editShared
    delete payload.scope
    delete payload.hasOverride
    delete payload.isShared
    delete payload.isBranchOnly
    delete payload.basePrice
    delete payload.baseActive
    delete payload.viewBranchId

    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch { branchId = String(req.headers['x-branch-id'] || payload.branchId || '').trim() }

    // Managers always create branch-only items. Admin can create shared (default) or branch-only.
    const branchOnly = !!payload.branchOnly || (!isAdminActor(req.user) && !editShared) || (isAdminActor(req.user) && !!payload.branchOnly)
    delete payload.branchOnly

    if (branchOnly) {
      if (!branchId) return res.status(400).json({ error: 'branchId required for branch-only menu items' })
      payload.branchId = String(branchId)
    } else {
      if (!isAdminActor(req.user) && !editShared) {
        // non-admin without explicit shared → branch-only
        if (!branchId) return res.status(400).json({ error: 'branchId required' })
        payload.branchId = String(branchId)
      } else {
        payload.branchId = ''
      }
    }

    const item = await MenuItem.create(payload)
    await logAudit(req, 'menu', `Added menu ${item?.name || item?._id}`, { id: item._id, branchId: item.branchId || '' })
    res.status(201).json(toPublic(item, null, branchId))
  } catch (e) { next(e) }
})

router.post('/seed', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const presets = req.body?.items || getDefaultSeed()
    const results = []
    const catNames = new Set()
    for (const p of presets) {
      const filter = {
        name: p.name,
        category: p.category,
        $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }],
      }
      const update = { ...p, active: p.active ?? true, branchId: '' }
      delete update._id
      delete update.id
      const item = await MenuItem.findOneAndUpdate(filter, update, { new: true, upsert: true })
      results.push(item)
      if (p.category) catNames.add(String(p.category).trim())
    }
    for (const name of catNames) {
      if (!name) continue
      await Category.findOneAndUpdate(
        { name },
        { $setOnInsert: { name, showOnPos: true, active: true, sortOrder: 0, discount: 0 } },
        { upsert: true, new: true }
      )
    }
    res.json({ ok: true, count: results.length, items: results })
  } catch (e) { next(e) }
})

router.post('/import', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const items = Array.isArray(body) ? body : (Array.isArray(body.items) ? body.items : [])
    const categories = Array.isArray(body.categories) ? body.categories : []
    if (!items.length && !categories.length) {
      return res.status(400).json({ error: 'Provide items and/or categories to import' })
    }

    let catsUpserted = 0
    const ensureCat = async (raw) => {
      const name = String(typeof raw === 'string' ? raw : (raw?.name || '')).trim()
      if (!name) return
      const patch = {
        name,
        showOnPos: raw?.showOnPos !== false,
        active: raw?.active !== false,
        imageUrl: String(raw?.imageUrl || ''),
        sortOrder: Number(raw?.sortOrder ?? 0),
        discount: Number(raw?.discount ?? 0),
      }
      await Category.findOneAndUpdate({ name }, patch, { upsert: true, new: true })
      catsUpserted += 1
    }

    for (const c of categories) await ensureCat(c)

    let itemsUpserted = 0
    for (const raw of items) {
      const name = String(raw?.name || '').trim()
      const category = String(raw?.category || '').trim()
      if (!name) continue
      if (category) await ensureCat(category)
      const activeRaw = raw.active
      const active = !(
        activeRaw === false
        || activeRaw === 0
        || ['no', 'n', 'false', '0', 'inactive', 'off'].includes(String(activeRaw ?? '').trim().toLowerCase())
      )
      const update = {
        name,
        category,
        price: Number(raw.price ?? 0),
        sku: raw.sku || '',
        description: raw.description || '',
        sortOrder: Number(raw.sortOrder ?? 0),
        active,
        imageUrl: raw.imageUrl || '',
        discount: Number(raw.discount ?? 0),
        branchId: '',
      }
      if (raw.recipe && typeof raw.recipe === 'object') update.recipe = raw.recipe
      await MenuItem.findOneAndUpdate(
        { name, category, $or: [{ branchId: '' }, { branchId: null }, { branchId: { $exists: false } }] },
        update,
        { upsert: true, new: true }
      )
      itemsUpserted += 1
    }

    await logAudit(req, 'menu', `Imported shared menu (${itemsUpserted} items, ${catsUpserted} categories)`, {
      items: itemsUpserted,
      categories: catsUpserted,
    })
    res.json({ ok: true, items: itemsUpserted, categories: catsUpserted })
  } catch (e) { next(e) }
})

/** Clear branch override for a shared item */
router.delete('/:id/override', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    let branchId = ''
    try { branchId = resolveBranchId(req, { required: true }) } catch (e) {
      return res.status(e.status || 400).json({ error: e.message || 'branchId required' })
    }
    await BranchMenuOverride.deleteOne({ branchId: String(branchId), menuItemId: req.params.id })
    const item = await MenuItem.findById(req.params.id).lean()
    if (!item) return res.status(404).json({ error: 'Not found' })
    res.json(toPublic(item, null, branchId))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.patch('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const payload = { ...(req.body || {}) }
    const editShared = !!payload.editShared || String(payload.scope || '').toLowerCase() === 'shared'
    delete payload.editShared
    delete payload.scope
    delete payload.hasOverride
    delete payload.isShared
    delete payload.isBranchOnly
    delete payload.basePrice
    delete payload.baseActive
    delete payload.viewBranchId
    delete payload.branchOnly
    delete payload.id
    delete payload._id

    if (payload.recipe && typeof payload.recipe === 'object') {
      payload.recipe = await normalizeRecipe(payload.recipe)
    }

    const item = await MenuItem.findById(req.params.id)
    if (!item) return res.status(404).json({ error: 'Not found' })

    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch {
      branchId = String(req.headers['x-branch-id'] || '').trim()
    }

    // Branch-only item: update the document directly
    if (!isSharedItem(item)) {
      if (branchId && String(item.branchId) !== String(branchId) && !isAdminActor(req.user)) {
        return res.status(403).json({ error: 'Cannot edit another branch menu item' })
      }
      Object.assign(item, payload)
      await item.save()
      await logAudit(req, 'menu', `Updated branch menu ${req.params.id}`, { id: req.params.id, branchId: item.branchId })
      return res.json(toPublic(item, null, branchId || item.branchId))
    }

    // Shared item + Admin editing shared catalog
    if (editShared || !branchId) {
      if (!isAdminActor(req.user) && editShared) {
        return res.status(403).json({ error: 'Only admin can edit the shared catalog' })
      }
      if (!branchId || editShared) {
        if (!isAdminActor(req.user) && !branchId) {
          return res.status(400).json({ error: 'branchId required to set a branch override' })
        }
        if (editShared || (isAdminActor(req.user) && !branchId)) {
          Object.assign(item, payload)
          // never accidentally assign branchId onto shared
          item.branchId = ''
          await item.save()
          await logAudit(req, 'menu', `Updated shared menu ${req.params.id}`, { id: req.params.id, patch: req.body })
          return res.json(toPublic(item, null, ''))
        }
      }
    }

    // Shared item viewed in a branch → upsert override (does not change shared defaults)
    if (!branchId) return res.status(400).json({ error: 'branchId required for branch override' })

    const overrideFields = {}
    for (const key of ['price', 'discount', 'active', 'name', 'category', 'sortOrder', 'imageUrl']) {
      if (payload[key] !== undefined) overrideFields[key] = payload[key]
    }
    // Recipe always updates shared item (recipes are shared across branches)
    if (payload.recipe !== undefined) {
      item.recipe = payload.recipe
      await item.save()
    }

    let override = await BranchMenuOverride.findOne({ branchId: String(branchId), menuItemId: item._id })
    if (Object.keys(overrideFields).length) {
      override = await BranchMenuOverride.findOneAndUpdate(
        { branchId: String(branchId), menuItemId: item._id },
        { $set: { ...overrideFields, branchId: String(branchId), menuItemId: item._id } },
        { upsert: true, new: true }
      )
      await logAudit(req, 'menu', `Branch override menu ${req.params.id}`, { id: req.params.id, branchId, patch: overrideFields })
    } else if (payload.recipe !== undefined) {
      await logAudit(req, 'menu', `Updated shared recipe ${req.params.id}`, { id: req.params.id })
    }
    res.json(toPublic(item, override, branchId))
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.delete('/:id', requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const item = await MenuItem.findById(req.params.id)
    if (!item) return res.status(404).json({ error: 'Not found' })

    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch {
      branchId = String(req.headers['x-branch-id'] || '').trim()
    }

    const hardDeleteShared = String(req.query.scope || '').toLowerCase() === 'shared' || req.query.hard === '1'

    if (!isSharedItem(item)) {
      if (branchId && String(item.branchId) !== String(branchId) && !isAdminActor(req.user)) {
        return res.status(403).json({ error: 'Cannot delete another branch menu item' })
      }
      await MenuItem.findByIdAndDelete(req.params.id)
      await BranchMenuOverride.deleteMany({ menuItemId: req.params.id })
      await logAudit(req, 'menu', `Deleted branch menu ${req.params.id}`, { id: req.params.id })
      return res.json({ ok: true })
    }

    // Shared item: hide on this branch via override, unless Admin hard-deletes shared
    if (hardDeleteShared && isAdminActor(req.user)) {
      await MenuItem.findByIdAndDelete(req.params.id)
      await BranchMenuOverride.deleteMany({ menuItemId: req.params.id })
      await logAudit(req, 'menu', `Deleted shared menu ${req.params.id}`, { id: req.params.id })
      return res.json({ ok: true })
    }

    if (!branchId) {
      if (!isAdminActor(req.user)) return res.status(400).json({ error: 'branchId required' })
      await MenuItem.findByIdAndDelete(req.params.id)
      await BranchMenuOverride.deleteMany({ menuItemId: req.params.id })
      await logAudit(req, 'menu', `Deleted shared menu ${req.params.id}`, { id: req.params.id })
      return res.json({ ok: true })
    }

    await BranchMenuOverride.findOneAndUpdate(
      { branchId: String(branchId), menuItemId: item._id },
      { $set: { branchId: String(branchId), menuItemId: item._id, active: false } },
      { upsert: true, new: true }
    )
    await logAudit(req, 'menu', `Hid shared menu on branch ${req.params.id}`, { id: req.params.id, branchId })
    res.json({ ok: true, hiddenOnBranch: true })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

export default router

function getDefaultSeed() {
  const starters = [
    { name: 'Chicken Strips (5 Pcs)', category: 'Starters', price: 520 },
    { name: 'Chicken Strips (10 Pcs)', category: 'Starters', price: 950 },
    { name: 'Cheese Sticks (Small)', category: 'Starters', price: 499 },
    { name: 'Cheese Sticks (Medium)', category: 'Starters', price: 1090 },
    { name: 'Cheese Sticks (Large)', category: 'Starters', price: 1549 },
    { name: 'Chicken Spin Roll (3 Pcs)', category: 'Starters', price: 249 },
    { name: 'Chicken Spin Roll (6 Pcs)', category: 'Starters', price: 449 },
    { name: 'Oven Baked Wings (6 Pcs)', category: 'Starters', price: 299 },
    { name: 'Oven Baked Wings (12 Pcs)', category: 'Starters', price: 549 },
    { name: 'Loaded Fries (Medium)', category: 'Starters', price: 549 },
    { name: 'Loaded Fries (Large)', category: 'Starters', price: 749 },
    { name: 'Trio Platter', category: 'Starters', price: 620 },
    { name: 'Pasta', category: 'Starters', price: 599 },
  ]

  const sideOrders = [
    { name: 'French Fries (Regular)', category: 'Side Orders', price: 239 },
    { name: 'French Fries (Large)', category: 'Side Orders', price: 399 },
    { name: 'Nuggets (5 Pcs)', category: 'Side Orders', price: 250 },
    { name: 'Nuggets (10 Pcs)', category: 'Side Orders', price: 450 },
    { name: 'Curly Fries with Dip', category: 'Side Orders', price: 400 },
  ]

  const burgers = [
    { name: 'Patty Burger', category: 'Burger', price: 240 },
    { name: 'Zinger Burger', category: 'Burger', price: 380 },
    { name: 'Mighty Thunder Burger', category: 'Burger', price: 580 },
    { name: "O'resto Special Wrap", category: 'Burger', price: 580 },
    { name: "O'resto Grill Wrap", category: 'Burger', price: 580 },
    { name: 'Grill Burger, Single fillet', category: 'Grill Burger', price: 580 },
    { name: 'Grill Burger, Double fillet', category: 'Grill Burger', price: 690 },
    { name: 'Grill Burger, Triple fillet', category: 'Grill Burger', price: 750 },
  ]

  const deals = [
    { name: 'Regular Deal', category: 'Value Deals', price: 630, description: '1 Zinger Burger + Regular Fries + Regular Drink' },
    { name: 'Double Deal', category: 'Value Deals', price: 750, description: '2 Zinger Burger + 1 Regular Drink' },
    { name: 'Hunger Deal', category: 'Value Deals', price: 780, description: '1 Mighty Thunder Burger + Regular Fries + Regular Drink' },
  ]

  return [...starters, ...sideOrders, ...burgers, ...deals]
}
