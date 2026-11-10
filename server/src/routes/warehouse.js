import { Router } from 'express'
import WarehouseItem from '../models/WarehouseItem.js'
import WarehousePurchase from '../models/WarehousePurchase.js'
import WarehouseTransfer from '../models/WarehouseTransfer.js'
import WarehousePayment from '../models/WarehousePayment.js'
import WarehouseAccountHead from '../models/WarehouseAccountHead.js'
import WarehouseLedger from '../models/WarehouseLedger.js'
import Demand from '../models/Demand.js'
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
      expiry: b.expiry ? String(b.expiry).slice(0, 10) : '',
      supplierId: b.supplierId || '',
      notes: b.notes || '',
    })
    res.status(201).json(created)
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Item name already exists in warehouse' })
    next(e)
  }
})

/** Bulk upsert warehouse inventory from CSV/Excel (same columns as warehouse stock export). */
router.post('/items/import', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const body = req.body || {}
    const items = Array.isArray(body) ? body : (Array.isArray(body.items) ? body.items : [])
    if (!items.length) return res.status(400).json({ error: 'Provide items to import' })

    const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const supplierCache = new Map()
    const resolveSupplierId = async (rawName) => {
      const name = String(rawName || '').trim()
      if (!name) return ''
      const key = name.toLowerCase()
      if (supplierCache.has(key)) return supplierCache.get(key)
      const hit = await Supplier.findOne({
        scope: 'warehouse',
        $or: [
          { name: new RegExp(`^${escapeRegex(name)}$`, 'i') },
          { company: new RegExp(`^${escapeRegex(name)}$`, 'i') },
        ],
      }).lean()
      const id = hit ? String(hit._id || hit.id || '') : ''
      supplierCache.set(key, id)
      return id
    }

    let created = 0
    let updated = 0
    for (const raw of items) {
      const name = String(raw?.name || '').trim()
      if (!name) continue
      const supplierId = raw.supplierId
        ? String(raw.supplierId)
        : await resolveSupplierId(raw.supplierName || raw.supplier || '')
      const costPrice = Number(raw.costPrice ?? raw.cost ?? 0) || 0
      const transferPrice = Number(raw.transferPrice ?? raw.transfer ?? 0) || costPrice
      const doc = {
        name,
        sku: String(raw.sku || '').trim(),
        category: String(raw.category || '').trim(),
        qty: Number(raw.qty || 0) || 0,
        unit: String(raw.unit || '').trim(),
        lowStock: Number(raw.lowStock ?? raw.threshold ?? 0) || 0,
        costPrice,
        transferPrice,
        notes: String(raw.notes || '').trim(),
        active: true,
      }
      if (supplierId) doc.supplierId = supplierId

      const existing = await WarehouseItem.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') })
      if (existing) {
        Object.assign(existing, doc)
        await existing.save()
        updated += 1
      } else {
        await WarehouseItem.create(doc)
        created += 1
      }
    }

    try {
      await logAudit(req, 'warehouse', `Imported warehouse items (+${created} / ~${updated})`, { created, updated })
    } catch {}
    res.json({ ok: true, items: created + updated, created, updated })
  } catch (e) {
    if (e?.code === 11000) return res.status(409).json({ error: 'Duplicate warehouse item name' })
    next(e)
  }
})

router.patch('/items/:id', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const allowed = ['name', 'sku', 'category', 'unit', 'lowStock', 'costPrice', 'transferPrice', 'supplierId', 'notes', 'active', 'qty', 'expiry']
    const patch = {}
    for (const k of allowed) if (req.body?.[k] !== undefined) patch[k] = req.body[k]
    if (patch.expiry != null) patch.expiry = String(patch.expiry).slice(0, 10)
    // Optional: addQty increases stock instead of replacing qty
    if (req.body?.addQty != null) {
      const add = Number(req.body.addQty) || 0
      if (add !== 0) {
        const cur = await WarehouseItem.findById(req.params.id)
        if (!cur) return res.status(404).json({ error: 'Not found' })
        patch.qty = (Number(cur.qty) || 0) + add
      }
    }
    const updated = await WarehouseItem.findByIdAndUpdate(req.params.id, { $set: patch }, { new: true })
    if (!updated) return res.status(404).json({ error: 'Not found' })
    res.json(updated)
  } catch (e) { next(e) }
})

/** Autofill hint: current item + last purchase line for that item */
router.get('/items/:id/details', authRequired, async (req, res, next) => {
  try {
    const item = await WarehouseItem.findById(req.params.id).lean()
    if (!item) return res.status(404).json({ error: 'Not found' })
    const recent = await WarehousePurchase.find({
      'items.warehouseItemId': String(item._id),
    }).sort({ date: -1, createdAt: -1 }).limit(5).lean()

    let lastPurchase = null
    for (const p of recent) {
      const line = (p.items || []).find(l => String(l.warehouseItemId) === String(item._id)
        || String(l.name || '').toLowerCase() === String(item.name || '').toLowerCase())
      if (line) {
        lastPurchase = {
          date: p.date,
          invoiceNo: p.invoiceNo || '',
          supplierName: p.supplierName || '',
          supplierId: p.supplierId || '',
          qty: Number(line.qty) || 0,
          unitCost: Number(line.unitCost) || 0,
          unit: line.unit || item.unit || '',
        }
        break
      }
    }
    // Fallback: match by name only
    if (!lastPurchase) {
      const byName = await WarehousePurchase.find({
        'items.name': new RegExp(`^${String(item.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
      }).sort({ date: -1, createdAt: -1 }).limit(1).lean()
      const p = byName[0]
      if (p) {
        const line = (p.items || []).find(l => String(l.name || '').toLowerCase() === String(item.name || '').toLowerCase())
        if (line) {
          lastPurchase = {
            date: p.date,
            invoiceNo: p.invoiceNo || '',
            supplierName: p.supplierName || '',
            supplierId: p.supplierId || '',
            qty: Number(line.qty) || 0,
            unitCost: Number(line.unitCost) || 0,
            unit: line.unit || item.unit || '',
          }
        }
      }
    }
    res.json({ item, lastPurchase })
  } catch (e) { next(e) }
})

async function paidSumForPurchase(purchaseId) {
  const rows = await WarehousePayment.aggregate([
    { $match: { purchaseId: String(purchaseId) } },
    { $group: { _id: null, sum: { $sum: '$amount' } } },
  ])
  return Number(rows[0]?.sum) || 0
}

async function syncPurchasePaid(purchaseId) {
  const purchase = await WarehousePurchase.findById(purchaseId)
  if (!purchase) return null
  const paid = await paidSumForPurchase(purchaseId)
  purchase.paidAmount = paid
  await purchase.save()
  return purchase
}

function withInvoiceBalance(p) {
  const total = Number(p.total) || 0
  const paidAmount = Number(p.paidAmount) || 0
  const balanceDue = Math.max(0, total - paidAmount)
  return {
    ...p,
    total,
    paidAmount,
    balanceDue,
    status: balanceDue <= 0.0001 ? 'paid' : (paidAmount > 0 ? 'partial' : 'unpaid'),
  }
}

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
    let list = await WarehousePurchase.find(q).sort({ createdAt: -1 }).limit(500).lean()
    // Optionally only invoices with remaining balance
    if (String(req.query.open) === '1') {
      list = list.filter(p => (Number(p.total) || 0) - (Number(p.paidAmount) || 0) > 0.0001)
    }
    res.json(list.map(withInvoiceBalance))
  } catch (e) { next(e) }
})

async function applyWarehousePurchaseLines(lines, { supplierId = '' } = {}) {
  const normalized = []
  for (const line of lines || []) {
    const name = String(line.name || '').trim()
    const qty = Number(line.qty) || 0
    if (!name || qty <= 0) continue
    const unitCost = Number(line.unitCost) || 0
    let item = null
    if (line.warehouseItemId) item = await WarehouseItem.findById(line.warehouseItemId)
    if (!item) item = await WarehouseItem.findOne({ name: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    if (!item) {
      item = await WarehouseItem.create({
        name,
        category: line.category || '',
        unit: line.unit || '',
        qty: 0,
        costPrice: unitCost,
        transferPrice: Number(line.transferPrice) || unitCost,
        lowStock: Number(line.lowStock) || 0,
        supplierId: supplierId || line.supplierId || '',
        expiry: line.expiry ? String(line.expiry).slice(0, 10) : '',
        notes: line.notes || '',
      })
    } else {
      if (line.category) item.category = line.category
      if (line.unit) item.unit = line.unit
      if (line.lowStock != null && line.lowStock !== '') item.lowStock = Number(line.lowStock) || 0
      if (line.expiry) item.expiry = String(line.expiry).slice(0, 10)
      if (supplierId || line.supplierId) item.supplierId = supplierId || line.supplierId
      if (line.transferPrice != null && line.transferPrice !== '') {
        item.transferPrice = Number(line.transferPrice) || item.transferPrice
      }
    }
    item.qty = (Number(item.qty) || 0) + qty
    if (unitCost > 0) {
      item.costPrice = unitCost
      if (!item.transferPrice) item.transferPrice = unitCost
    }
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
  return normalized
}

async function reverseWarehousePurchaseLines(lines) {
  for (const line of lines || []) {
    const qty = Number(line.qty) || 0
    if (qty <= 0) continue
    let item = null
    if (line.warehouseItemId) item = await WarehouseItem.findById(line.warehouseItemId)
    if (!item && line.name) {
      item = await WarehouseItem.findOne({ name: new RegExp(`^${String(line.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    }
    if (!item) continue
    item.qty = Math.max(0, (Number(item.qty) || 0) - qty)
    await item.save()
  }
}

async function resolveSupplierName(b) {
  let supplierName = b.supplierName || ''
  if (b.supplierId && !supplierName) {
    try {
      const s = await Supplier.findById(b.supplierId).lean()
      if (s) supplierName = s.name || ''
    } catch {}
  }
  return supplierName
}

router.post('/purchases', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const b = req.body || {}
    const lines = Array.isArray(b.items) ? b.items : []
    if (!lines.length) return res.status(400).json({ error: 'items required' })

    const normalized = await applyWarehousePurchaseLines(lines, { supplierId: b.supplierId || '' })
    if (!normalized.length) return res.status(400).json({ error: 'items required' })

    const total = normalized.reduce((s, l) => s + (l.lineTotal || 0), 0)
    const supplierName = await resolveSupplierName(b)
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

router.get('/purchases/:id', authRequired, async (req, res, next) => {
  try {
    const purchase = await WarehousePurchase.findById(req.params.id).lean()
    if (!purchase) return res.status(404).json({ error: 'Not found' })
    res.json(withInvoiceBalance(purchase))
  } catch (e) { next(e) }
})

router.patch('/purchases/:id', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await WarehousePurchase.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    const b = req.body || {}
    await reverseWarehousePurchaseLines(existing.items || [])
    const normalized = await applyWarehousePurchaseLines(b.items || existing.items || [], {
      supplierId: b.supplierId ?? existing.supplierId,
    })
    if (!normalized.length) {
      await applyWarehousePurchaseLines(existing.items || [], { supplierId: existing.supplierId })
      return res.status(400).json({ error: 'items required' })
    }
    const supplierName = await resolveSupplierName({
      supplierId: b.supplierId !== undefined ? b.supplierId : existing.supplierId,
      supplierName: b.supplierName,
    })
    existing.date = b.date || existing.date
    if (b.supplierId !== undefined) existing.supplierId = String(b.supplierId || '')
    existing.supplierName = supplierName || existing.supplierName
    if (b.invoiceNo !== undefined) existing.invoiceNo = String(b.invoiceNo || '')
    if (b.notes !== undefined) existing.notes = String(b.notes || '')
    if (b.paymentMethod !== undefined) existing.paymentMethod = String(b.paymentMethod || '')
    existing.items = normalized
    existing.total = normalized.reduce((s, l) => s + (l.lineTotal || 0), 0)
    if (b.paidAmount != null) {
      const newPaid = Number(b.paidAmount) || 0
      const oldPaid = Number(existing.paidAmount) || 0
      existing.paidAmount = newPaid
      if (newPaid > oldPaid && existing.supplierId) {
        await WarehousePayment.create({
          supplierId: String(existing.supplierId),
          supplierName: existing.supplierName || '',
          date: existing.date || today(),
          amount: newPaid - oldPaid,
          method: existing.paymentMethod || 'cash',
          purchaseId: String(existing._id),
          notes: `Payment adjusted with purchase edit ${existing.invoiceNo || existing._id}`,
          createdBy: req.user?.id || '',
        })
      }
    }
    await existing.save()
    await logAudit(req, 'warehouse', 'Purchase edited', { purchaseId: existing._id?.toString?.(), total: existing.total })
    res.json(withInvoiceBalance(existing.toObject()))
  } catch (e) { next(e) }
})

router.delete('/purchases/:id', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const existing = await WarehousePurchase.findById(req.params.id)
    if (!existing) return res.status(404).json({ error: 'Not found' })
    await reverseWarehousePurchaseLines(existing.items || [])
    await WarehousePayment.deleteMany({ purchaseId: String(existing._id) })
    await existing.deleteOne()
    await logAudit(req, 'warehouse', 'Purchase deleted', { purchaseId: req.params.id })
    res.json({ ok: true })
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

    const demandId = String(b.demandId || '').trim()
    const transfer = await WarehouseTransfer.create({
      toBranchId,
      toBranchName: branch.name,
      status: 'sent',
      date: b.date || today(),
      items: out,
      notes: b.notes || (demandId ? `From demand ${demandId.slice(-6)}` : ''),
      createdBy: req.user?.id || '',
      sentAt: new Date(),
      demandId: demandId || '',
    })

    if (demandId) {
      try {
        const demand = await Demand.findById(demandId)
        if (demand) {
          const byWh = new Map(out.map(l => [String(l.warehouseItemId || l.name), l.qty]))
          demand.items = (demand.items || []).map(it => {
            const key = String(it.warehouseItemId || it.name)
            const issued = byWh.has(String(it.warehouseItemId))
              ? byWh.get(String(it.warehouseItemId))
              : (byWh.get(String(it.name)) || Number(it.issuedQty) || 0)
            return { ...it.toObject?.() || it, issuedQty: issued }
          })
          demand.status = 'issued'
          demand.transferId = String(transfer._id)
          await demand.save()
        }
      } catch (linkErr) {
        console.warn('[warehouse] link demand failed', linkErr?.message)
      }
    }

    await logAudit(req, 'warehouse', 'Transfer sent to branch', {
      transferId: transfer._id?.toString?.(),
      toBranchId,
      demandId: demandId || undefined,
    })
    res.status(201).json(transfer)
  } catch (e) { next(e) }
})

/** HQ: all warehouse-targeted demands from branches */
router.get('/demands', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const status = String(req.query.status || '').trim()
    const q = { target: 'warehouse' }
    if (status && status !== 'all' && status !== 'open') q.status = status
    else if (status === 'open' || !status) {
      q.status = { $in: ['pending', 'sent', 'accepted'] }
    }
    // status=all → no status filter
    if (req.query.branchId) q.branchId = String(req.query.branchId)
    if (req.query.from && req.query.to) {
      q.date = { $gte: String(req.query.from), $lte: String(req.query.to) }
    }
    const list = await Demand.find(q).sort({ createdAt: -1 }).limit(300).lean()
    res.json(list)
  } catch (e) { next(e) }
})

/** Prefill transfer lines from a demand + live warehouse stock */
router.get('/demands/:id/transfer-preview', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const demand = await Demand.findById(req.params.id).lean()
    if (!demand) return res.status(404).json({ error: 'Demand not found' })
    const lines = []
    for (const it of demand.items || []) {
      let wh = null
      if (it.warehouseItemId) wh = await WarehouseItem.findById(it.warehouseItemId).lean()
      if (!wh) {
        wh = await WarehouseItem.findOne({
          name: new RegExp(`^${String(it.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
          active: { $ne: false },
        }).lean()
      }
      const stock = Number(wh?.qty) || 0
      const requested = Number(it.quantity) || 0
      lines.push({
        name: it.name,
        unit: it.unit || wh?.unit || '',
        requestedQty: requested,
        warehouseItemId: wh?._id ? String(wh._id) : '',
        warehouseStock: stock,
        // Default transfer qty = min(requested, stock) so HQ can still edit down/up (up capped by stock on send)
        qty: Math.min(requested, stock > 0 ? stock : requested),
        transferPrice: Number(wh?.transferPrice) || Number(wh?.costPrice) || 0,
        unitCost: Number(wh?.costPrice) || 0,
        matched: !!wh,
      })
    }
    res.json({
      demand,
      toBranchId: demand.branchId,
      toBranchName: demand.branchName || '',
      items: lines,
    })
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

// ── Payment ledger (invoice-wise) ───────────────────────────
router.get('/payments', authRequired, async (req, res, next) => {
  try {
    const q = {}
    if (req.query.supplierId) q.supplierId = String(req.query.supplierId)
    if (req.query.purchaseId) q.purchaseId = String(req.query.purchaseId)
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
    const purchaseId = String(b.purchaseId || '').trim()
    if (!purchaseId) return res.status(400).json({ error: 'Select a purchase invoice to pay against' })

    const amount = Number(b.amount) || 0
    if (amount <= 0) return res.status(400).json({ error: 'amount must be > 0' })

    const purchase = await WarehousePurchase.findById(purchaseId)
    if (!purchase) return res.status(404).json({ error: 'Purchase invoice not found' })
    if (String(purchase.supplierId) !== String(b.supplierId)) {
      return res.status(400).json({ error: 'Invoice does not belong to this supplier' })
    }

    const alreadyPaid = await paidSumForPurchase(purchaseId)
    const invoiceTotal = Number(purchase.total) || 0
    const remaining = Math.max(0, invoiceTotal - alreadyPaid)
    if (amount > remaining + 0.0001) {
      return res.status(400).json({
        error: `Amount exceeds invoice balance. Remaining: ${remaining.toFixed(2)}`,
        remaining,
        invoiceTotal,
        paidAmount: alreadyPaid,
      })
    }

    const supplier = await Supplier.findById(b.supplierId).lean()
    const payment = await WarehousePayment.create({
      supplierId: String(b.supplierId),
      supplierName: supplier?.name || purchase.supplierName || b.supplierName || '',
      date: b.date || today(),
      amount,
      method: b.method || 'cash',
      reference: b.reference || '',
      purchaseId,
      invoiceNo: purchase.invoiceNo || '',
      notes: b.notes || '',
      createdBy: req.user?.id || '',
    })

    const synced = await syncPurchasePaid(purchaseId)
    await logAudit(req, 'warehouse', `Supplier payment ${amount} on invoice ${purchase.invoiceNo || purchaseId}`, {
      paymentId: payment._id?.toString?.(),
      purchaseId,
    })
    res.status(201).json({
      payment,
      purchase: synced ? withInvoiceBalance(synced.toObject()) : null,
    })
  } catch (e) { next(e) }
})

/** Supplier ledger: invoice-wise purchases + payments against each invoice */
router.get('/suppliers/:id/ledger', authRequired, async (req, res, next) => {
  try {
    const supplierId = String(req.params.id)
    const purchases = await WarehousePurchase.find({ supplierId }).sort({ date: 1, createdAt: 1 }).lean()
    const payments = await WarehousePayment.find({ supplierId }).sort({ date: 1, createdAt: 1 }).lean()

    // Keep paidAmount accurate from payment rows
    const invoices = []
    for (const p of purchases) {
      const paidAmount = await paidSumForPurchase(p._id)
      if (Number(p.paidAmount) !== paidAmount) {
        try {
          await WarehousePurchase.findByIdAndUpdate(p._id, { $set: { paidAmount } })
        } catch {}
      }
      invoices.push(withInvoiceBalance({ ...p, paidAmount }))
    }

    const purchaseTotal = invoices.reduce((s, p) => s + (Number(p.total) || 0), 0)
    const paidTotal = invoices.reduce((s, p) => s + (Number(p.paidAmount) || 0), 0)

    const entries = [
      ...invoices.map(p => ({
        type: 'purchase',
        date: p.date,
        ref: p.invoiceNo || String(p._id).slice(-6),
        purchaseId: String(p._id),
        invoiceNo: p.invoiceNo || '',
        debit: Number(p.total) || 0,
        credit: 0,
        paidAmount: Number(p.paidAmount) || 0,
        balanceDue: Number(p.balanceDue) || 0,
        status: p.status,
        notes: p.notes || '',
        id: p._id,
      })),
      ...payments.map(p => ({
        type: 'payment',
        date: p.date,
        ref: p.invoiceNo || p.reference || String(p.purchaseId || '').slice(-6) || p._id,
        purchaseId: p.purchaseId || '',
        invoiceNo: p.invoiceNo || '',
        debit: 0,
        credit: Number(p.amount) || 0,
        method: p.method || '',
        notes: p.notes || '',
        id: p._id,
      })),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.type).localeCompare(String(b.type)))

    let bal = 0
    const withBal = entries.map(e => {
      bal += (e.debit || 0) - (e.credit || 0)
      return { ...e, runningBalance: bal }
    })

    res.json({
      supplierId,
      purchaseTotal,
      paidTotal,
      balance: purchaseTotal - paidTotal,
      invoices,
      entries: withBal,
    })
  } catch (e) { next(e) }
})

// ── HQ Finance (cash / bank book) ───────────────────────────
const DEFAULT_HEADS = [
  { name: 'Branch Remittance', type: 'income' },
  { name: 'Supplier Payment', type: 'expense' },
  { name: 'Utilities', type: 'expense' },
  { name: 'Wages', type: 'expense' },
  { name: 'Transport', type: 'expense' },
  { name: 'Misc Expense', type: 'expense' },
  { name: 'Cash to Bank', type: 'transfer' },
  { name: 'Bank to Cash', type: 'transfer' },
]

async function ensureDefaultHeads() {
  for (const h of DEFAULT_HEADS) {
    const exists = await WarehouseAccountHead.findOne({ name: h.name }).lean()
    if (!exists) await WarehouseAccountHead.create(h)
  }
}

router.get('/finance/summary', authRequired, requireRole('Admin', 'Manager'), async (_req, res, next) => {
  try {
    const rows = await WarehouseLedger.find({}).select('account direction amount').lean()
    let cash = 0
    let bank = 0
    for (const r of rows) {
      const n = Number(r.amount) || 0
      const delta = r.direction === 'in' ? n : -n
      if (r.account === 'cash') cash += delta
      else if (r.account === 'bank') bank += delta
    }
    res.json({ cash, bank, total: cash + bank })
  } catch (e) { next(e) }
})

router.get('/finance/heads', authRequired, async (_req, res, next) => {
  try {
    await ensureDefaultHeads()
    const list = await WarehouseAccountHead.find({ active: { $ne: false } }).sort({ type: 1, name: 1 }).lean()
    res.json(list)
  } catch (e) { next(e) }
})

router.post('/finance/heads', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ error: 'name required' })
    const type = ['income', 'expense', 'transfer', 'asset'].includes(req.body?.type) ? req.body.type : 'expense'
    const doc = await WarehouseAccountHead.create({ name, type, notes: req.body?.notes || '' })
    res.status(201).json(doc)
  } catch (e) {
    if (e?.code === 11000) return res.status(400).json({ error: 'Account head already exists' })
    next(e)
  }
})

router.get('/finance/ledger', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const q = {}
    if (req.query.from || req.query.to) {
      q.date = {}
      if (req.query.from) q.date.$gte = String(req.query.from)
      if (req.query.to) q.date.$lte = String(req.query.to)
    }
    if (req.query.account && ['cash', 'bank'].includes(String(req.query.account))) {
      q.account = String(req.query.account)
    }
    if (req.query.branchId) q.fromBranchId = String(req.query.branchId)
    const list = await WarehouseLedger.find(q).sort({ date: -1, createdAt: -1 }).limit(500).lean()
    res.json(list)
  } catch (e) { next(e) }
})

/** Record cash/bank movement (receive from branch, spend, or cash↔bank) */
router.post('/finance/entries', authRequired, requireRole('Admin', 'Manager'), async (req, res, next) => {
  try {
    const b = req.body || {}
    const amount = Number(b.amount) || 0
    if (amount <= 0) return res.status(400).json({ error: 'amount required' })
    const account = b.account === 'bank' ? 'bank' : 'cash'
    const direction = b.direction === 'out' ? 'out' : 'in'
    const date = b.date || today()

    // Internal cash ↔ bank: create two linked lines
    if (b.kind === 'transfer') {
      const from = b.fromAccount === 'bank' ? 'bank' : 'cash'
      const to = from === 'cash' ? 'bank' : 'cash'
      const pairId = `xfer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const outDoc = await WarehouseLedger.create({
        date,
        account: from,
        direction: 'out',
        amount,
        accountHeadName: from === 'cash' ? 'Cash to Bank' : 'Bank to Cash',
        transferPairId: pairId,
        notes: b.notes || '',
        reference: b.reference || '',
        createdBy: req.user?.id || '',
        createdByName: req.user?.username || '',
        idempotencyKey: b.idempotencyKey ? `${b.idempotencyKey}-out` : null,
      })
      const inDoc = await WarehouseLedger.create({
        date,
        account: to,
        direction: 'in',
        amount,
        accountHeadName: from === 'cash' ? 'Cash to Bank' : 'Bank to Cash',
        transferPairId: pairId,
        notes: b.notes || '',
        reference: b.reference || '',
        createdBy: req.user?.id || '',
        createdByName: req.user?.username || '',
        idempotencyKey: b.idempotencyKey ? `${b.idempotencyKey}-in` : null,
      })
      return res.status(201).json({ ok: true, out: outDoc, in: inDoc })
    }

    if (b.idempotencyKey) {
      const existing = await WarehouseLedger.findOne({ idempotencyKey: String(b.idempotencyKey) }).lean()
      if (existing) return res.json(existing)
    }

    let fromBranchName = b.fromBranchName || ''
    const fromBranchId = String(b.fromBranchId || '').trim()
    if (fromBranchId && !fromBranchName) {
      const br = await Branch.findById(fromBranchId).lean()
      fromBranchName = br?.name || br?.code || ''
    }

    let accountHeadName = b.accountHeadName || ''
    const accountHeadId = String(b.accountHeadId || '').trim()
    if (accountHeadId && !accountHeadName) {
      const head = await WarehouseAccountHead.findById(accountHeadId).lean()
      accountHeadName = head?.name || ''
    }

    const doc = await WarehouseLedger.create({
      date,
      account,
      direction,
      amount,
      accountHeadId,
      accountHeadName,
      fromBranchId,
      fromBranchName,
      reference: b.reference || '',
      notes: b.notes || '',
      createdBy: req.user?.id || '',
      createdByName: req.user?.username || '',
      idempotencyKey: b.idempotencyKey ? String(b.idempotencyKey) : null,
    })
    await logAudit(req, 'warehouse_finance', `${direction} ${amount} ${account}`, {
      id: doc._id,
      fromBranchId,
      accountHeadName,
    })
    res.status(201).json(doc)
  } catch (e) {
    if (e?.code === 11000) {
      const existing = await WarehouseLedger.findOne({ idempotencyKey: String(req.body?.idempotencyKey) })
      if (existing) return res.json(existing)
    }
    next(e)
  }
})

export default router
