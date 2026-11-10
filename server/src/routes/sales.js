import express from 'express'
import Sale from '../models/Sale.js'
import DeletedSale from '../models/DeletedSale.js'
import Ingredient from '../models/Ingredient.js'
import MenuItem from '../models/MenuItem.js'
import Counter from '../models/Counter.js'
import Recall from '../models/Recall.js'
import Kot from '../models/Kot.js'
import Void from '../models/Void.js'
import Audit from '../models/Audit.js'
import Staff from '../models/Staff.js'
import StaffAdvance from '../models/StaffAdvance.js'
import StaffPurchase from '../models/StaffPurchase.js'
import PayInOut from '../models/PayInOut.js'
import { authRequired } from '../middleware/auth.js'
import { logAudit } from '../middleware/auditLog.js'
import { mergeBranchFilter, resolveBranchId } from '../utils/branchScope.js'
import { getSettingsLean } from '../utils/settingsScope.js'
import { takeSnapshot } from './inventorySnapshots.js'
import CallCenterOrder from '../models/CallCenterOrder.js'

// Sales routes backed by MongoDB via Mongoose
const router = express.Router()

// All routes require authentication
router.use(authRequired)

// Helper: normalize a JS Date or timestamp to 'yyyy-MM-dd' in LOCAL timezone
// This ensures Pakistan time is used regardless of server location
const toYyyyMmDd = (dLike) => {
  try {
    const d = dLike ? new Date(dLike) : new Date()
    if (isNaN(d.getTime())) {
      const now = new Date()
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    }
    // Use local date getters instead of toISOString() (which returns UTC)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  } catch {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  }
}

// GET /api/sales
// Supports: ?date=YYYY-MM-DD OR ?from=YYYY-MM-DD&to=YYYY-MM-DD (inclusive)
router.get('/', async (req, res) => {
  try {
    const { date, from, to } = req.query
    let filter = {}
    if (date) {
      filter.date = String(date)
    } else {
      const fromStr = from ? String(from) : '0000-00-00'
      const toStr = to ? String(to) : '9999-12-31'
      filter.date = { $gte: fromStr, $lte: toStr }
    }
    filter = mergeBranchFilter(req, filter)
    const rows = await Sale.find(filter).sort({ createdAt: -1 }).lean()
    res.json(rows || [])
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    res.status(500).json({ error: 'Failed to load sales' })
  }
})

// POST /api/sales
// Creates a sale document. If no date provided, derive from createdAt or now.
router.post('/', async (req, res) => {
  try {
    const payload = req.body || {}
    const key = req.headers['x-idempotency-key']
    if (key) {
      try {
        const existing = await Sale.findOne({ idempotencyKey: key }).lean()
        if (existing) {
          // Even on idempotency hit, attempt to delete matching recall (idempotent operation)
          try {
            const rid = payload.recallId || payload.recall_id || null
            if (rid) {
              await Recall.findByIdAndDelete(rid).catch(()=>{})
            } else {
              const or = []
              if (payload.orderNo) or.push({ orderNo: String(payload.orderNo) })
              if (payload.tokenNo) or.push({ tokenNo: String(payload.tokenNo) })
              if (or.length) await Recall.deleteMany({ $and: [ { date: (payload.date || toYyyyMmDd(payload.createdAt) || toYyyyMmDd()) }, { $or: or } ] }).catch(()=>{})
            }
          } catch {}
          return res.status(200).json(existing)
        }
      } catch {}
    }

    const dateStr = payload.date || toYyyyMmDd(payload.createdAt) || toYyyyMmDd()
    let tokenNo = (payload.tokenNo || '').toString().trim()
    if (!tokenNo) {
      const key = `token-${dateStr}`
      const counter = await Counter.findOneAndUpdate(
        { name: key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      )
      tokenNo = String(counter?.seq || '1')
    }
    const totalComputed = (payload.total != null)
      ? Number(payload.total)
      : Number(
          (payload.totalAmount != null)
            ? payload.totalAmount
            : Math.max(0,
                Number(payload.subtotal || 0)
                - Number(payload.itemsDiscount || 0)
                - Number(payload.billDiscount || 0)
                + Number(payload.taxAmt || 0)
                + Number(payload.serviceAmt || 0)
              )
        )
    const billNo = payload.billNo || `${dateStr}_${tokenNo}`
    const paymentMethod = String(payload.paymentMethod || 'cash').toLowerCase()

    // Staff purchase: validate the staff member BEFORE saving so a blocked
    // purchase never leaves a half-recorded sale. The amount is always
    // tracked as a pending StaffPurchase — deducted by payroll unless the
    // staff pays it off first via /api/staff-purchases/:id/settle.
    let staffDoc = null
    if (paymentMethod === 'staff') {
      if (!payload.staffId) return res.status(400).json({ error: 'Select the staff member' })
      staffDoc = await Staff.findById(payload.staffId).lean()
      if (!staffDoc) return res.status(404).json({ error: 'Staff not found' })
    }

    const tipAmount = paymentMethod === 'cash'
      ? Math.max(0, Number(payload.tipAmount || 0) || Math.max(0, Number(payload.cashReceived || 0) - Number(totalComputed || 0)))
      : 0
    const { stampBranchId } = await import('../utils/branchScope.js')
    const doc = stampBranchId(req, {
      ...payload,
      date: dateStr,
      tokenNo,
      billNo,
      total: totalComputed,
      paymentMethod,
      tipAmount,
      bankRef: paymentMethod === 'bank' ? '' : (payload.bankRef || ''),
      idempotencyKey: key || null,
      // Stamp cashier for My Shift activity
      userId: payload.userId || req.user?.id || '',
      userName: payload.userName || req.user?.username || req.user?.name || '',
    })
    const saved = await Sale.create(doc)

    // Linked call-center order → mark Completed when bill is paid
    try {
      const ccId = String(payload.callCenterOrderId || '').trim()
      if (ccId) {
        await CallCenterOrder.findByIdAndUpdate(ccId, { $set: { status: 'completed' } })
      }
    } catch (ccErr) {
      console.error('[sales] call-center complete failed for sale', String(saved._id), ccErr?.message)
    }

    // Cash overpayment = waiter tip → Pay Out so drawer expected cash stays balanced
    let tipPayOut = null
    if (tipAmount > 0) {
      try {
        tipPayOut = await PayInOut.create({
          date: dateStr,
          type: 'OUT',
          amount: tipAmount,
          category: 'Waiter Tip',
          note: `Auto tip from bill ${billNo}${payload.tokenNo ? ` / token ${payload.tokenNo}` : ''}`,
          userId: req.user?.id || '',
          userName: req.user?.username || 'system',
        })
        await logAudit(req, 'cash', `Waiter tip Pay Out ${tipAmount} for ${billNo}`, { id: tipPayOut._id, saleId: saved._id })
      } catch (tipErr) {
        console.error('[sales] tip pay-out failed for sale', String(saved._id), tipErr?.message)
      }
    }

    // Record the staff purchase as pending — payroll deducts it unless the
    // staff settles it in cash first (or it's converted early via /deduct).
    if (paymentMethod === 'staff' && staffDoc) {
      try {
        await StaffPurchase.create({
          staffId: staffDoc._id,
          staffName: staffDoc.name || payload.staffName || '',
          saleId: String(saved._id),
          billNo,
          date: dateStr,
          month: dateStr.slice(0, 7),
          amount: Number(totalComputed || 0),
          status: 'pending',
          userId: req.user?.id || '',
          userName: req.user?.username || 'system',
        })
      } catch (spErr) {
        // Sale already saved — log loudly so reconciliation is possible
        console.error('[sales] staff purchase record failed for sale', String(saved._id), spErr?.message)
      }
    }

    // After saving the sale, decrement inventory based on recipes
    try {
      const items = Array.isArray(payload.items) ? payload.items : []
      const baseItemIds = [...new Set(items.map(it => it.itemId).filter(Boolean))]
      const flavourIdsFromMods = []
      const flavourNamesFromMods = []
      for (const it of items) {
        try {
          const arr = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
          for (const fid of arr) if (fid) flavourIdsFromMods.push(String(fid))
        } catch {}
        try {
          const arrN = Array.isArray(it?.mods?.flavourNames) ? it.mods.flavourNames : []
          for (const nm of arrN) if (nm) flavourNamesFromMods.push(String(nm))
        } catch {}
      }
      const itemIds = [...new Set([...baseItemIds, ...flavourIdsFromMods])]
      const isValidObjectId = (s) => /^(?:[a-fA-F0-9]{24})$/.test(String(s||''))
      const validIds = itemIds.filter(isValidObjectId)
      const menuMap = new Map()
      const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
      const menuByNormName = new Map()
      if (validIds.length) {
        const menuRows = await MenuItem.find({ _id: { $in: validIds } }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (menuRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }
      // Also pre-load by flavour names if provided
      const uniqueNames = [...new Set(flavourNamesFromMods.map(norm).filter(Boolean))]
      if (uniqueNames.length) {
        const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const ors = uniqueNames.map(n => ({ name: new RegExp(`^\\s*${escapeRegExp(n)}\\s*$`, 'i') }))
        const nameRows = await MenuItem.find({ $or: ors }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (nameRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }

      // Aggregate consumption: ingredient name -> total qty to deduct
      const cons = new Map()
      for (const line of items) {
        const qty = Number(line?.qty || 0)
        if (!qty) continue
        const sizeRaw = (line?.mods?.size || line?.size || '').toString().trim().toUpperCase()
        const mapSize = (s) => {
          if (!s) return ''
          if (s==='S' || s.includes('SMALL')) return 'S'
          if (s==='R' || s.includes('REGULAR') || s.includes('MEDIUM')) return 'R'
          if (s==='XL' || s.includes('X-LARGE') || (s.includes('EXTRA') && s.includes('LARGE'))) return 'XL'
          if (s==='L' || s.includes('LARGE')) return 'L'
          return ''
        }
        const key = mapSize(sizeRaw)

        // 1) Apply base item's recipe
        {
          const m = menuMap.get(String(line.itemId))
          const chosen = m?.recipe && typeof m.recipe === 'object' ? m.recipe : null
          for (const [ingName, perUnit] of Object.entries(chosen || {})) {
            const useAmt = Number(perUnit || 0) * qty
            if (!useAmt) continue
            cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
          }
        }

        // 2) If flavours are selected, also apply each flavour's recipe
        {
          const flavours = Array.isArray(line?.mods?.flavours) ? line.mods.flavours : []
          const flavourNames = Array.isArray(line?.mods?.flavourNames) ? line.mods.flavourNames : []
          if (flavours.length) {
            for (const fid of flavours) {
              let fm = menuMap.get(String(fid))
              if (!fm && flavourNames.length) {
                // try to find by name fallback
                for (const nm of flavourNames) {
                  const cand = menuByNormName.get(norm(nm))
                  if (cand) { fm = cand; break }
                }
              }
              if (!fm) continue
              const chosen = fm?.recipe && typeof fm.recipe === 'object' ? fm.recipe : null
              for (const [ingName, perUnit] of Object.entries(chosen || {})) {
                const useAmt = Number(perUnit || 0) * qty
                if (!useAmt) continue
                cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
              }
            }
          }
        }
        // Optional modifier impacts: no-op for now
      }

      if (cons.size) {
        // Build canonical name maps from existing Ingredients
        const ings = await Ingredient.find({}, { name: 1 }).lean()
        const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
        const noSpace = (s) => norm(s).replace(/\s+/g, '')
        const canonByNorm = new Map((ings||[]).map(i => [norm(i.name), i.name]))
        const canonByNoSpace = new Map((ings||[]).map(i => [noSpace(i.name), i.name]))

        // Merge consumption by canonical ingredient name
        const canonCons = new Map()
        for (const [rawName, amt] of cons.entries()) {
          const a = Number(amt || 0)
          if (!(a > 0)) continue
          const n1 = norm(rawName)
          const n2 = noSpace(rawName)
          let key = canonByNorm.get(n1) || canonByNoSpace.get(n2)
          if (!key) {
            // Last resort: find an exact, case-insensitive match using regex when writing
            // Keep the raw normalized name so we can use anchored regex in the write filter
            key = { raw: rawName }
          }
          const mapKey = typeof key === 'string' ? key : JSON.stringify(key)
          canonCons.set(mapKey, Number((canonCons.get(mapKey) || 0) + a))
        }

        // Prepare bulk ops, supporting both direct canonical names and regex fallback
        const ops = []
        for (const [k, amt] of canonCons.entries()) {
          const parsed = (() => { try { return JSON.parse(k) } catch { return null } })()
          if (parsed && parsed.raw) {
            // Use case-insensitive exact match with trimmed spaces
            const escaped = String(parsed.raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const rx = new RegExp(`^\\s*${escaped}\\s*$`, 'i')
            ops.push({ updateOne: { filter: { name: rx }, update: [{ $set: { qty: { $max: [{ $add: ['$qty', -Number(amt)] }, 0] } } }] } })
          } else {
            ops.push({ updateOne: { filter: { name: String(k) }, update: [{ $set: { qty: { $max: [{ $add: ['$qty', -Number(amt)] }, 0] } } }] } })
          }
        }
        if (ops.length) {
          await Ingredient.bulkWrite(ops, { ordered: false })
        }
      }
    } catch (invErr) {
      // Log and continue; do not fail the sale creation if inventory update fails
      console.warn('[sales] inventory deduction failed:', invErr && invErr.message, invErr?.result)
    }

    // Take inventory snapshot after sale (post-deduction stock state)
    takeSnapshot(dateStr, 'sale').catch(()=>{})

    try {
      const rid = payload.recallId || payload.recall_id || null
      if (rid) {
        await Recall.findByIdAndDelete(rid).catch(()=>{})
      } else {
        const or = []
        if (payload.orderNo) or.push({ orderNo: String(payload.orderNo) })
        if (doc.tokenNo) or.push({ tokenNo: String(doc.tokenNo) })
        if (or.length) await Recall.deleteMany({ $and: [ { date: dateStr }, { $or: or } ] }).catch(()=>{})
      }
    } catch {}

    // Log audit for sale creation
    try {
      const itemCount = Array.isArray(payload.items) ? payload.items.length : 0
      const totalDisplay = Number(saved.total || 0).toFixed(2)
      await logAudit(req, 'sale', `Sale created - Bill #${saved.billNo}, Token #${saved.tokenNo}, Items: ${itemCount}, Total: ${totalDisplay}`, { billNo: saved.billNo, tokenNo: saved.tokenNo, total: saved.total, itemCount })
    } catch {}

    const out = typeof saved.toObject === 'function' ? saved.toObject() : { ...saved }
    if (tipPayOut) {
      out.tipPayOut = {
        ...(typeof tipPayOut.toObject === 'function' ? tipPayOut.toObject() : tipPayOut),
        id: tipPayOut._id || tipPayOut.id,
      }
    }
    res.status(201).json(out)
  } catch (e) {
    res.status(400).json({ error: 'Failed to create sale' })
  }
})

// GET /api/sales/:id/timeline
// Rebuilds the full lifecycle of an order: order placed -> KOT(s) sent ->
// kitchen status changes -> voids -> recall updates -> bill saved.
// Everything is matched on (date, tokenNo) which links Recall/Kot/Void/Sale docs.
router.get('/:id/timeline', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).lean()
    if (!sale) return res.status(404).json({ error: 'Sale not found' })

    const date = sale.date || toYyyyMmDd(sale.createdAt)
    const tokenNo = String(sale.tokenNo || '').trim()

    if (!tokenNo) {
      return res.json({
        sale: { ...sale, id: sale._id },
        kots: [], voids: [], recalls: [],
        events: [{ at: sale.createdAt, kind: 'sale', title: 'Bill saved / payment received', detail: {} }],
      })
    }

    // Token numbers reset daily -> audit lookups must be scoped to this
    // business day, otherwise same-token events from other days leak in.
    const dayStart = new Date(`${date}T00:00:00`)
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
    const inDay = (a) => {
      const t = new Date(a?.at || 0)
      return t >= dayStart && t < dayEnd
    }
    const billNo = String(sale.billNo || `${date}_${tokenNo}`)

    const [kots, voids, recalls, tokenAuditsRaw, deletedAudits] = await Promise.all([
      Kot.find({ tokenNo, date }).sort({ createdAt: 1 }).lean(),
      Void.find({ tokenNo, date }).sort({ createdAt: 1 }).lean(),
      Recall.find({ tokenNo, date }).lean(),
      Audit.find({
        type: { $in: ['recall', 'kot', 'void', 'sale'] },
        $or: [{ 'meta.tokenNo': tokenNo }, { 'meta.patch.tokenNo': tokenNo }],
      }).sort({ at: 1 }).lean(),
      Audit.find({ type: 'deleted_sale', $or: [{ 'meta.billNo': billNo }, { 'meta.tokenNo': tokenNo }] }).sort({ at: 1 }).lean(),
    ])
    const tokenAudits = tokenAuditsRaw.filter(inDay)

    // KOT status transitions are logged with meta.id (the kot id), not tokenNo
    const kotIds = kots.map(k => String(k._id))
    const kotAudits = kotIds.length
      ? await Audit.find({ type: 'kot', 'meta.id': { $in: kotIds } }).sort({ at: 1 }).lean()
      : []

    const events = []
    const STATUS_LABEL = { new: 'KOT sent to kitchen', preparing: 'Kitchen started preparing', ready: 'Order ready', completed: 'Order completed / served' }

    // Order placed (earliest recall create or first KOT time as fallback)
    const orderAt = (recalls[0] && recalls[0].createdAt)
      || (kots[0] && kots[0].createdAt)
      || sale.createdAt
    const recallCreateAudit = tokenAudits.find(a => a.type === 'recall' && /created/i.test(a.action || ''))
    events.push({
      at: recallCreateAudit?.at || orderAt,
      kind: 'order',
      title: 'Order placed',
      detail: { userName: recallCreateAudit?.userName || '' },
    })

    // Each KOT send (one per KOT doc — recalls/add-ons create additional KOTs)
    for (const k of kots) {
      events.push({
        at: k.createdAt,
        kind: 'kot',
        title: 'KOT sent to kitchen',
        detail: { items: k.items || [], remarks: k.remarks || '' },
      })
    }

    // Kitchen status transitions from audit log
    const auditedStatuses = new Set()
    for (const a of kotAudits) {
      const st = a?.meta?.status
      if (!st) continue
      auditedStatuses.add(`${a.meta.id}:${st}`)
      events.push({
        at: a.at,
        kind: 'status',
        status: st,
        title: STATUS_LABEL[st] || `Kitchen status: ${st}`,
        detail: { userName: a.userName || '' },
      })
    }
    // Fallback for KOTs whose current status has no audit row (pre-audit data)
    for (const k of kots) {
      const st = String(k.status || 'new')
      if (st !== 'new' && k.statusUpdatedAt && !auditedStatuses.has(`${k._id}:${st}`)) {
        events.push({
          at: k.statusUpdatedAt,
          kind: 'status',
          status: st,
          title: STATUS_LABEL[st] || `Kitchen status: ${st}`,
          detail: {},
        })
      }
    }

    // Voids (each doc holds the voided items + reason)
    for (const v of voids) {
      events.push({
        at: v.createdAt,
        kind: 'void',
        title: 'Item(s) voided',
        detail: { items: v.items || [], reason: v.reason || '', remarks: v.remarks || '' },
      })
    }

    // Recall add/update activity (item additions/changes before billing)
    for (const a of tokenAudits) {
      if (a.type !== 'recall' || /created/i.test(a.action || '')) continue
      const patch = a?.meta?.patch || {}
      events.push({
        at: a.at,
        kind: 'update',
        title: /deleted/i.test(a.action || '') ? 'Recall removed' : 'Order updated (items changed)',
        detail: { items: Array.isArray(patch.items) ? patch.items : undefined, userName: a.userName || '' },
      })
    }

    // Bill saved
    events.push({
      at: sale.createdAt,
      kind: 'sale',
      title: 'Bill saved / payment received',
      detail: { paymentMethod: sale.paymentMethod || '', total: sale.total },
    })

    // Sale deletion events (if any)
    for (const a of deletedAudits) {
      events.push({ at: a.at, kind: 'deleted', title: a.action || 'Sale deleted', detail: { userName: a.userName || '' } })
    }

    // Deterministic order: chronological, with a fixed kind priority for
    // same-timestamp events so the sequence always reads logically.
    const KIND_ORDER = { order: 0, kot: 1, update: 2, void: 3, status: 4, sale: 5, deleted: 6 }
    events.sort((a, b) => {
      const dt = new Date(a.at) - new Date(b.at)
      if (dt) return dt
      return (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9)
    })

    res.json({
      sale: { ...sale, id: sale._id },
      kots,
      voids,
      recalls,
      events,
    })
  } catch (e) {
    res.status(500).json({ error: 'Failed to load order timeline' })
  }
})

// GET /api/sales/deleted - List all deleted sales
router.get('/deleted', async (req, res) => {
  try {
    const { date, from, to } = req.query
    let filter = {}
    if (date) {
      filter.date = String(date)
    } else if (from || to) {
      const fromStr = from ? String(from) : '0000-00-00'
      const toStr = to ? String(to) : '9999-12-31'
      filter.date = { $gte: fromStr, $lte: toStr }
    }
    filter = mergeBranchFilter(req, filter)
    const rows = await DeletedSale.find(filter).sort({ deletedAt: -1 }).lean()
    res.json(rows || [])
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message })
    res.status(500).json({ error: 'Failed to load deleted sales' })
  }
})

// DELETE /api/sales/:id
router.delete('/:id', async (req, res) => {
  try {
    const provided = req.headers['x-delete-key'] || req.query.key || (req.body && req.body.key) || ''
    let branchId = ''
    try { branchId = resolveBranchId(req) || '' } catch { branchId = '' }
    const s = await getSettingsLean(branchId)
    const expected = String(s?.salesDeleteKey || '')
    if (!expected) return res.status(403).json({ error: 'Delete key not set. Set it in Settings.' })
    if (String(provided || '') !== expected) return res.status(403).json({ error: 'Invalid delete key' })
    const { id } = req.params
    
    // Find the sale first
    const sale = await Sale.findById(id).lean()
    if (!sale) return res.status(404).json({ error: 'Sale not found' })
    
    // Copy to DeletedSale collection
    const deletedSaleDoc = {
      ...sale,
      originalSaleId: sale._id,
      deletedAt: new Date(),
      deletedDate: toYyyyMmDd(new Date()),
      deletedBy: req.user?.username || 'system',
      userName: req.user?.username || ''
    }
    delete deletedSaleDoc._id
    delete deletedSaleDoc.__v
    await DeletedSale.create(deletedSaleDoc)
    
    // Delete from Sale collection
    await Sale.findByIdAndDelete(id)

    // Reverse any staff liability recorded for this sale
    try {
      if (sale.paymentMethod === 'staff') {
        await StaffAdvance.deleteMany({ saleId: String(id), type: 'issue' }).catch(()=>{})
        await StaffPurchase.deleteMany({ saleId: String(id), status: 'pending' }).catch(()=>{})
      }
    } catch {}
    
    // Restore inventory: reverse the recipe consumption that was deducted when the sale was created
    try {
      const items = Array.isArray(sale.items) ? sale.items : []
      const baseItemIds = [...new Set(items.map(it => it.itemId).filter(Boolean))]
      const flavourIdsFromMods = []
      const flavourNamesFromMods = []
      for (const it of items) {
        try {
          const arr = Array.isArray(it?.mods?.flavours) ? it.mods.flavours : []
          for (const fid of arr) if (fid) flavourIdsFromMods.push(String(fid))
        } catch {}
        try {
          const arrN = Array.isArray(it?.mods?.flavourNames) ? it.mods.flavourNames : []
          for (const nm of arrN) if (nm) flavourNamesFromMods.push(String(nm))
        } catch {}
      }
      const itemIds = [...new Set([...baseItemIds, ...flavourIdsFromMods])]
      const isValidObjectId = (s) => /^(?:[a-fA-F0-9]{24})$/.test(String(s||''))
      const validIds = itemIds.filter(isValidObjectId)
      const menuMap = new Map()
      const norm = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
      const menuByNormName = new Map()
      if (validIds.length) {
        const menuRows = await MenuItem.find({ _id: { $in: validIds } }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (menuRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }
      const uniqueNames = [...new Set(flavourNamesFromMods.map(norm).filter(Boolean))]
      if (uniqueNames.length) {
        const escapeRegExp = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const ors = uniqueNames.map(n => ({ name: new RegExp(`^\\s*${escapeRegExp(n)}\\s*$`, 'i') }))
        const nameRows = await MenuItem.find({ $or: ors }, { _id: 1, recipe: 1, name: 1 }).lean()
        for (const m of (nameRows||[])) { menuMap.set(String(m._id), m); menuByNormName.set(norm(m.name), m) }
      }

      // Aggregate consumption to restore (same logic as sale creation, but we'll ADD back)
      const cons = new Map()
      for (const line of items) {
        const qty = Number(line?.qty || 0)
        if (!qty) continue
        // 1) Base item's recipe
        {
          const m = menuMap.get(String(line.itemId))
          const chosen = m?.recipe && typeof m.recipe === 'object' ? m.recipe : null
          for (const [ingName, perUnit] of Object.entries(chosen || {})) {
            const useAmt = Number(perUnit || 0) * qty
            if (!useAmt) continue
            cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
          }
        }
        // 2) Flavour recipes
        {
          const flavours = Array.isArray(line?.mods?.flavours) ? line.mods.flavours : []
          const flavourNames = Array.isArray(line?.mods?.flavourNames) ? line.mods.flavourNames : []
          if (flavours.length) {
            for (const fid of flavours) {
              let fm = menuMap.get(String(fid))
              if (!fm && flavourNames.length) {
                for (const nm of flavourNames) {
                  const cand = menuByNormName.get(norm(nm))
                  if (cand) { fm = cand; break }
                }
              }
              if (!fm) continue
              const chosen = fm?.recipe && typeof fm.recipe === 'object' ? fm.recipe : null
              for (const [ingName, perUnit] of Object.entries(chosen || {})) {
                const useAmt = Number(perUnit || 0) * qty
                if (!useAmt) continue
                cons.set(ingName, Number((cons.get(ingName) || 0) + useAmt))
              }
            }
          }
        }
      }

      if (cons.size) {
        const ings = await Ingredient.find({}, { name: 1 }).lean()
        const norm2 = (s) => String(s||'').trim().toLowerCase().replace(/\s+/g, ' ')
        const noSpace = (s) => norm2(s).replace(/\s+/g, '')
        const canonByNorm = new Map((ings||[]).map(i => [norm2(i.name), i.name]))
        const canonByNoSpace = new Map((ings||[]).map(i => [noSpace(i.name), i.name]))

        const canonCons = new Map()
        for (const [rawName, amt] of cons.entries()) {
          const a = Number(amt || 0)
          if (!(a > 0)) continue
          const n1 = norm2(rawName)
          const n2 = noSpace(rawName)
          let key = canonByNorm.get(n1) || canonByNoSpace.get(n2)
          if (!key) {
            key = { raw: rawName }
          }
          const mapKey = typeof key === 'string' ? key : JSON.stringify(key)
          canonCons.set(mapKey, Number((canonCons.get(mapKey) || 0) + a))
        }

        // Build bulk ops to ADD back the consumed quantities (reverse of sale creation)
        const ops = []
        for (const [k, amt] of canonCons.entries()) {
          const parsed = (() => { try { return JSON.parse(k) } catch { return null } })()
          if (parsed && parsed.raw) {
            const escaped = String(parsed.raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const rx = new RegExp(`^\\s*${escaped}\\s*$`, 'i')
            ops.push({ updateOne: { filter: { name: rx }, update: { $inc: { qty: Number(amt) } } } })
          } else {
            ops.push({ updateOne: { filter: { name: String(k) }, update: { $inc: { qty: Number(amt) } } } })
          }
        }
        if (ops.length) {
          await Ingredient.bulkWrite(ops, { ordered: false })
        }
      }

      // Take a fresh snapshot after restoring inventory
      takeSnapshot(sale.date || toYyyyMmDd(new Date()), 'sale-delete').catch(()=>{})
    } catch (invErr) {
      console.warn('[sales] inventory restore on delete failed:', invErr && invErr.message)
    }
    
    // Log audit for sale deletion
    try {
      await logAudit(req, 'deleted_sale', `Sale deleted - Bill #${sale.billNo}, Token #${sale.tokenNo}`, { billNo: sale.billNo, tokenNo: sale.tokenNo, total: sale.total })
    } catch {}
    
    res.json({ ok: true })
  } catch (e) {
    res.status(400).json({ error: 'Failed to delete sale' })
  }
})

export default router
