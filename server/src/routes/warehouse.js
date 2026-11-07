import { Router } from 'express'
import WarehouseItem from '../models/WarehouseItem.js'
import WarehousePurchase from '../models/WarehousePurchase.js'
import WarehouseTransfer from '../models/WarehouseTransfer.js'
import WarehousePayment from '../models/WarehousePayment.js'
import Ingredient from '../models/Ingredient.js'
import Branch from '../models/Branch.js'
import Supplier from '../models/Supplier.js'
import { authRequired, requireRole } from '../middleware/auth.js'
import { assertBranchAccess, resolveBranchId } from '../utils/branchScope.js'
import { logAudit } from '../middleware/auditLog.js'

const router = Router()

function today() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

// ── Warehouse catalog / stock ───────────────────────────────
router.get('/items', authRequired, async (_req, res, next) => {
  try {
    const list = await WarehouseItem.find({ active: { $ne: false } }).sort({ name: 1 }).lean()
    res.json(list)
  } catch (e) { next(e) }
})

router.post('/items', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const b = req.body || {}
    if (!b.name) return res.status(400).json({ error: 'name is required' })
    const created = await WarehouseItem.create({
      name: String(b.name).trim(),
      sku: b.sku || '',
      category: b.category || '',
      qty: Number(b.qty) || 0,
      unit: b.unit || '',
      lowStock: Number(b.lowStock) || 0,
      costPrice: Number(b.costPrice) || 0,
      transferPrice: Number(b.transferPrice) || Number(b.costPrice) || 0,
      supplierId: b.supplierId || '',
      notes: b.notes || '',
    })
    res.status(201).json(created)
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Item name already exists in warehouse' })
    next(e)
  }
})

router.patch('/items/:id', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const allowed = ['name', 'sku', 'category', 'unit', 'lowStock', 'costPrice', 'transferPrice', 'supplierId', 'notes', 'active', 'qty']
    const patch = {}
    for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k]
    const updated = await WarehouseItem.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated)
  } catch (e) { next(e) }
})

// ── Purchases (increase warehouse stock) ────────────────────
router.get('/purchases', authRequired, async (req, res, next) => {
  try {
    const q = {}
    if (req.query.supplierId) q.supplierId = String(req.query.supplierId)
    if (req.query.from || req.query.to) {
      q.date = {}
      if (req.query.from) q.date.$gte = String(req.query.from)
      if (req.query.to) q.date.$lte = String(req.query.to)
    }
    const list = await WarehousePurchase.find(q).sort({ createdAt: -1 }).limit(500).lean()
    res.json(list)
  } catch (e) { next(e) }
})

router.post('/purchases', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const b = req.body || {}
    const lines = Array.isArray(b.items) ? b.items : []
    if (!lines.length) return res.status(400).json({ error: 'items required' })

    const normalized = []
    for (const line of lines) {
      const name = String(line.name || '').trim()
      const qty = Number(line.qty) || 0
      if (!name || qty <= 0) continue
      const unitCost = Number(line.unitCost) || 0
      let item = null
      if (line.warehouseItemId) item = await WarehouseItem.findById(line.warehouseItemId)
      if (!item) item = await WarehouseItem.findOne({ name })
      if (!item) {
        item = await WarehouseItem.create({
          name,
          unit: line.unit || '',
          qty: 0,
          costPrice: unitCost,
          transferPrice: unitCost,
        })
      }
      item.qty = (Number(item.qty) || 0) + qty
      if (unitCost > 0) item.costPrice = unitCost
      await item.save()
      normalized.push({
        warehouseItemId: item._id.toString(),
        name: item.name,
        qty,
        unit: line.unit || item.unit || '',
        unitCost,
        lineTotal: qty * unitCost,
      })
    }

    const total = normalized.reduce((s, l) => s + (l.lineTotal || 0), 0)
    let supplierName = b.supplierName || ''
    if (b.supplierId && !supplierName) {
      try {
        const s = await Supplier.findById(b.supplierId).lean()
        if (s) supplierName = s.name || ''
      } catch {}
    }
    const purchase = await WarehousePurchase.create({
      date: b.date || today(),
      supplierId: b.supplierId || '',
      supplierName,
      invoiceNo: b.invoiceNo || '',
      items: normalized,
      total,
      notes: b.notes || '',
      createdBy: req.user?.id || '',
      paidAmount: Number(b.paidAmount) || 0,
      paymentMethod: b.paymentMethod || '',
    })
    if ((Number(b.paidAmount) || 0) > 0 && b.supplierId) {
      await WarehousePayment.create({
        supplierId: String(b.supplierId),
        supplierName,
        date: purchase.date,
        amount: Number(b.paidAmount) || 0,
        method: b.paymentMethod || 'cash',
        purchaseId: String(purchase._id),
        notes: `Payment with purchase ${purchase.invoiceNo || purchase._id}`,
        createdBy: req.user?.id || '',
      })
    }
    await logAudit(req, 'warehouse', 'Purchase recorded', { purchaseId: purchase._id?.toString?.(), total })
    res.status(201).json(purchase)
  } catch (e) { next(e) }
})

// ── Transfers HQ → branch ───────────────────────────────────
router.get('/transfers', authRequired, async (req, res, next) => {
  try {
    const q = {}
    if (req.query.toBranchId) q.toBranchId = String(req.query.toBranchId)
    else if (req.query.inbox === '1') {
      const branchId = resolveBranchId(req, { required: true })
      assertBranchAccess(req, branchId)
      q.toBranchId = String(branchId)
      q.status = 'sent'
    }
    if (req.query.status) q.status = String(req.query.status)
    const list = await WarehouseTransfer.find(q).sort({ createdAt: -1 }).limit(200).lean()
    res.json(list)
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

router.post('/transfers', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const b = req.body || {}
    const toBranchId = String(b.toBranchId || '').trim()
    if (!toBranchId) return res.status(400).json({ error: 'toBranchId required' })
    const branch = await Branch.findById(toBranchId).lean()
    if (!branch) return res.status(400).json({ error: 'Branch not found' })

    const lines = Array.isArray(b.items) ? b.items : []
    if (!lines.length) return res.status(400).json({ error: 'items required' })

    const out = []
    for (const line of lines) {
      const qty = Number(line.qty) || 0
      if (qty <= 0) continue
      const item = line.warehouseItemId
        ? await WarehouseItem.findById(line.warehouseItemId)
        : await WarehouseItem.findOne({ name: line.name })
      if (!item) return res.status(400).json({ error: `Warehouse item not found: ${line.name || line.warehouseItemId}` })
      if ((Number(item.qty) || 0) < qty) {
        return res.status(400).json({ error: `Insufficient warehouse stock for ${item.name}` })
      }
      item.qty = (Number(item.qty) || 0) - qty
      await item.save()
      out.push({
        warehouseItemId: item._id.toString(),
        name: item.name,
        qty,
        unit: line.unit || item.unit || '',
        unitCost: Number(item.costPrice) || 0,
        transferPrice: Number(line.transferPrice) || Number(item.transferPrice) || Number(item.costPrice) || 0,
      })
    }

    const transfer = await WarehouseTransfer.create({
      toBranchId,
      toBranchName: branch.name,
      status: 'sent',
      date: b.date || today(),
      items: out,
      notes: b.notes || '',
      createdBy: req.user?.id || '',
      sentAt: new Date(),
    })
    await logAudit(req, 'warehouse', 'Transfer sent to branch', {
      transferId: transfer._id?.toString?.(),
      toBranchId,
    })
    res.status(201).json(transfer)
  } catch (e) { next(e) }
})

/**
 * One-click receive at branch: add lines into branch Ingredient inventory.
 */
router.post('/transfers/:id/receive', authRequired, async (req, res, next) => {
  try {
    const transfer = await WarehouseTransfer.findById(req.params.id)
    if (!transfer) return res.status(404).json({ error: 'Transfer not found' })
    assertBranchAccess(req, transfer.toBranchId)

    if (transfer.status === 'received' && transfer.appliedToInventory) {
      return res.json({ transfer, already: true })
    }
    if (transfer.status === 'cancelled') return res.status(400).json({ error: 'Transfer cancelled' })

    for (const line of transfer.items || []) {
      const name = String(line.name || '').trim()
      if (!name) continue
      const qty = Number(line.qty) || 0
      let ing = await Ingredient.findOne({ name, branchId: String(transfer.toBranchId) })
      if (!ing) {
        // Legacy unscoped ingredient with same name — prefer branch-scoped copy
        ing = await Ingredient.create({
          name,
          qty: 0,
          unit: line.unit || '',
          price: Number(line.transferPrice) || Number(line.unitCost) || 0,
          branchId: String(transfer.toBranchId),
        })
      }
      ing.qty = (Number(ing.qty) || 0) + qty
      if (line.transferPrice || line.unitCost) {
        ing.price = Number(line.transferPrice) || Number(line.unitCost) || ing.price
      }
      await ing.save()
    }

    transfer.status = 'received'
    transfer.receivedAt = new Date()
    transfer.receivedBy = req.user?.id || ''
    transfer.appliedToInventory = true
    await transfer.save()

    await logAudit(req, 'warehouse', 'Transfer received into branch inventory', {
      transferId: transfer._id?.toString?.(),
      branchId: transfer.toBranchId,
    })

    res.json({ transfer, already: false })
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    next(e)
  }
})

// ── Warehouse suppliers (reuse Supplier model with scope tag) ─
router.get('/suppliers', authRequired, async (_req, res, next) => {
  try {
    // Strict: only warehouse-scoped suppliers
    const list = await Supplier.find({ scope: 'warehouse' }).sort({ name: 1 }).lean()
    res.json(list)
  } catch (e) { next(e) }
})

router.post('/suppliers', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const b = req.body || {}
    if (!b.name) return res.status(400).json({ error: 'name required' })
    const created = await Supplier.create({
      name: String(b.name).trim(),
      company: b.company || '',
      phone: b.phone || '',
      address: b.address || '',
      taxId: b.taxId || '',
      status: b.status || 'Active',
      scope: 'warehouse',
    })
    res.status(201).json(created)
  } catch (e) { next(e) }
})

router.patch('/suppliers/:id', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Supplier.findById(req.params.id)
    if (!existing || existing.scope !== 'warehouse') return res.status(404).json({ error: 'Warehouse supplier not found' })
    const allowed = ['name', 'company', 'phone', 'address', 'taxId', 'status']
    for (const k of allowed) {
      if (req.body?.[k] !== undefined) existing[k] = req.body[k]
    }
    existing.scope = 'warehouse'
    await existing.save()
    res.json(existing)
  } catch (e) { next(e) }
})

router.delete('/suppliers/:id', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await Supplier.findById(req.params.id)
    if (!existing || existing.scope !== 'warehouse') return res.status(404).json({ error: 'Warehouse supplier not found' })
    await Supplier.findByIdAndDelete(req.params.id)
    res.json({ ok: true })
  } catch (e) { next(e) }
})

// ── Payment ledger ──────────────────────────────────────────
router.get('/payments', authRequired, async (req, res, next) => {
  try {
    const q = {}
    if (req.query.supplierId) q.supplierId = String(req.query.supplierId)
    if (req.query.from || req.query.to) {
      q.date = {}
      if (req.query.from) q.date.$gte = String(req.query.from)
      if (req.query.to) q.date.$lte = String(req.query.to)
    }
    const list = await WarehousePayment.find(q).sort({ createdAt: -1 }).limit(500).lean()
    res.json(list)
  } catch (e) { next(e) }
})

router.post('/payments', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const b = req.body || {}
    if (!b.supplierId) return res.status(400).json({ error: 'supplierId required' })
    const amount = Number(b.amount) || 0
    if (amount <= 0) return res.status(400).json({ error: 'amount must be > 0' })
    const supplier = await Supplier.findById(b.supplierId).lean()
    const payment = await WarehousePayment.create({
      supplierId: String(b.supplierId),
      supplierName: supplier?.name || b.supplierName || '',
      date: b.date || today(),
      amount,
      method: b.method || 'cash',
      reference: b.reference || '',
      purchaseId: b.purchaseId || '',
      notes: b.notes || '',
      createdBy: req.user?.id || '',
    })
    await logAudit(req, 'warehouse', `Supplier payment ${amount}`, { paymentId: payment._id?.toString?.() })
    res.status(201).json(payment)
  } catch (e) { next(e) }
})

/** Supplier ledger: purchases vs payments balance */
router.get('/suppliers/:id/ledger', authRequired, async (req, res, next) => {
  try {
    const supplierId = String(req.params.id)
    const purchases = await WarehousePurchase.find({ supplierId }).sort({ date: 1 }).lean()
    const payments = await WarehousePayment.find({ supplierId }).sort({ date: 1 }).lean()
    const purchaseTotal = purchases.reduce((s, p) => s + (Number(p.total) || 0), 0)
    const paidTotal = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const entries = [
      ...purchases.map(p => ({
        type: 'purchase',
        date: p.date,
        ref: p.invoiceNo || p._id,
        debit: Number(p.total) || 0,
        credit: 0,
        notes: p.notes || '',
        id: p._id,
      })),
      ...payments.map(p => ({
        type: 'payment',
        date: p.date,
        ref: p.reference || p._id,
        debit: 0,
        credit: Number(p.amount) || 0,
        notes: p.notes || '',
        id: p._id,
      })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)))

    let bal = 0
    const withBal = entries.map(e => {
      bal += (e.debit || 0) - (e.credit || 0)
      return { ...e, balance: bal }
    })

    res.json({
      supplierId,
      purchaseTotal,
      paidTotal,
      balance: purchaseTotal - paidTotal,
      entries: withBal,
    })
  } catch (e) { next(e) }
})

export default router
