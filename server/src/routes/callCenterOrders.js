import { Router } from 'express'
import CallCenterOrder from '../models/CallCenterOrder.js'
import Branch from '../models/Branch.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { assertBranchAccess, branchFilter, isHqUser } from '../utils/branchScope.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

function calcTotals(items = [], discount = 0) {
  const subtotal = items.reduce((s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0), 0)
  const disc = Math.max(0, Number(discount) || 0)
  return { subtotal, discount: disc, total: Math.max(0, subtotal - disc) }
}

/** Call Center is cross-branch: ignore header X-Branch-Id; show every branch by default. */
function callCenterListScope(req) {
  const specific = String(req.query.branchId || '').trim()
  if (specific && specific.toLowerCase() !== 'all') {
    assertBranchAccess(req, specific)
    return { branchId: String(specific) }
  }
  // Default: both / all branches (not limited to the header branch)
  if (isHqUser(req.user) || ['Admin', 'SuperAdmin', 'Manager', 'Staff', 'CallCenter'].includes(String(req.user?.role || ''))) {
    return {}
  }
  return branchFilter(req, { allAccessible: true })
}

/** List — all branches by default; optional ?branchId= to narrow */
router.get('/', authRequired, async (req, res, next) => {
  try {
    const filter = callCenterListScope(req)
    if (req.query.status) filter.status = String(req.query.status)
    // Open / active queue: keep tracking through kitchen until completed
    else if (req.query.pendingOnly === '1') {
      filter.status = { $in: ['pending', 'accepted', 'kot_created', 'preparing', 'ready'] }
    }
    const list = await CallCenterOrder.find(filter).sort({ createdAt: -1 }).limit(500).lean()
    res.json(list)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/**
 * Inbox — all branches by default (not tied to header branch).
 * ?tab=remaining (default) → pending / accepted
 * ?tab=complete → kot_created and beyond (incl. cancelled)
 * optional ?branchId= to narrow
 */
router.get('/inbox', authRequired, async (req, res, next) => {
  try {
    const scope = callCenterListScope(req)
    const tab = String(req.query.tab || 'remaining').toLowerCase()
    // Remaining = waiting for cashier / still open at branch
    // Complete = kitchen progress + finished / cancelled
    const statusFilter = tab === 'complete'
      ? { status: { $in: ['kot_created', 'preparing', 'ready', 'completed', 'cancelled', 'expired'] } }
      : { status: { $in: ['pending', 'accepted'] } }
    const list = await CallCenterOrder.find({
      ...scope,
      ...statusFilter,
    }).sort({ createdAt: tab === 'complete' ? -1 : 1 }).limit(500).lean()
    res.json(list)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** Call center creates order for any branch (including the one in the header) — does NOT create KOT */
router.post('/', authRequired, requireRole('Admin', 'Manager', 'Staff', 'CallCenter'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const branchId = String(body.branchId || '').trim()
    if (!branchId) return res.status(400).json({ error: 'branchId is required' })
    // Allow ordering for current header branch and other branches alike
    try {
      assertBranchAccess(req, branchId)
    } catch (e) {
      // Call-center operators may target any active branch even if header is another one
      if (!(isHqUser(req.user) || ['Manager', 'Staff', 'CallCenter'].includes(String(req.user?.role || '')))) throw e
    }

    const branch = await Branch.findById(branchId).lean()
    if (!branch || branch.active === false) return res.status(400).json({ error: 'Invalid branch' })

    const items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return res.status(400).json({ error: 'Add at least one item' })

    const customer = body.customer || {}
    if (!customer.name && !customer.phone) {
      return res.status(400).json({ error: 'Customer name or phone is required' })
    }

    const totals = calcTotals(items, body.discount)
    const idem = body.idempotencyKey ? String(body.idempotencyKey) : null
    if (idem) {
      const existing = await CallCenterOrder.findOne({ idempotencyKey: idem }).lean()
      if (existing) return res.json(existing)
    }

    const parentOrderId = String(body.parentOrderId || '').trim()
    let isAddOn = Boolean(body.isAddOn) || Boolean(parentOrderId)
    let parent = null
    if (parentOrderId) {
      parent = await CallCenterOrder.findById(parentOrderId).lean()
      if (!parent) return res.status(400).json({ error: 'Parent order not found' })
      assertBranchAccess(req, parent.branchId)
      isAddOn = true
    }

    let remarks = String(body.remarks || '').trim()
    if (isAddOn) {
      const tag = parent
        ? `[ADD-ON · same customer · linked to ${String(parent._id).slice(-6).toUpperCase()}]`
        : '[ADD-ON · same customer]'
      remarks = remarks ? `${tag} ${remarks}` : tag
    }

    const doc = await CallCenterOrder.create({
      branchId,
      branchName: String(branch.name || branch.code || '').trim(),
      status: 'pending',
      orderType: body.orderType || 'Delivery',
      customer: {
        id: customer.id || '',
        name: customer.name || '',
        phone: customer.phone || '',
        address: customer.address || '',
      },
      items: items.map(it => ({
        itemId: it.itemId || '',
        name: it.name || it.custom?.name || 'Item',
        qty: Number(it.qty) || 1,
        price: Number(it.price) || Number(it.custom?.price) || 0,
        category: it.category || it.custom?.category || '',
        notes: it.notes || '',
        mods: it.mods || {},
      })),
      remarks,
      isAddOn,
      parentOrderId: parentOrderId || '',
      ...totals,
      createdBy: req.user?.id || '',
      createdByName: req.user?.username || '',
      idempotencyKey: idem,
    })

    await logAudit(req, 'call_center', isAddOn ? 'Add-on order submitted (same customer)' : 'Order submitted (pending KOT)', {
      orderId: doc._id?.toString?.(),
      branchId,
      total: doc.total,
      parentOrderId: parentOrderId || undefined,
    })

    res.status(201).json(doc)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/**
 * Cashier one-click accept at branch.
 * Marks order accepted and returns a cart payload for Sell screen / KOT.
 * Does not create KOT itself — frontend posts KOT after loading cart.
 */
router.post('/:id/accept', authRequired, async (req, res, next) => {
  try {
    const doc = await CallCenterOrder.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Order not found' })
    // Allow accept for the order's branch (including when it matches the header branch)
    try {
      assertBranchAccess(req, doc.branchId)
    } catch (e) {
      if (!(isHqUser(req.user) || ['Manager', 'Staff', 'CallCenter'].includes(String(req.user?.role || '')))) throw e
    }

    if (doc.status === 'cancelled') return res.status(400).json({ error: 'Order cancelled' })
    if (doc.status === 'kot_created') {
      return res.json({ order: doc, cart: buildCart(doc), already: true })
    }

    doc.status = 'accepted'
    doc.acceptedAt = new Date()
    doc.acceptedBy = req.user?.id || ''
    await doc.save()

    res.json({ order: doc, cart: buildCart(doc), already: false })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

/** After Sell screen successfully creates recall/KOT */
router.post('/:id/mark-kot', authRequired, async (req, res, next) => {
  try {
    const doc = await CallCenterOrder.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Order not found' })
    assertBranchAccess(req, doc.branchId)
    doc.status = 'kot_created'
    doc.recallId = String(req.body?.recallId || doc.recallId || '')
    doc.kotId = String(req.body?.kotId || doc.kotId || '')
    await doc.save()
    res.json(doc)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/:id/cancel', authRequired, async (req, res, next) => {
  try {
    const doc = await CallCenterOrder.findById(req.params.id)
    if (!doc) return res.status(404).json({ error: 'Order not found' })
    if (!isHqUser(req.user)) assertBranchAccess(req, doc.branchId)
    if (doc.status === 'kot_created') return res.status(400).json({ error: 'Already sent to kitchen' })
    doc.status = 'cancelled'
    await doc.save()
    res.json(doc)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

function buildCart(doc) {
  return {
    callCenterOrderId: doc._id?.toString?.(),
    orderType: doc.orderType || 'Delivery',
    customer: doc.customer || {},
    remarks: doc.remarks || '',
    isAddOn: Boolean(doc.isAddOn),
    parentOrderId: doc.parentOrderId || '',
    items: (doc.items || []).map(it => ({
      itemId: it.itemId,
      name: it.name,
      qty: it.qty,
      price: it.price,
      category: it.category,
      notes: it.notes,
      mods: it.mods,
    })),
  }
}

export default router
